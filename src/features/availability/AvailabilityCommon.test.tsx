import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  callsTo,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import { detail, open as openKit, PERF } from '../performance/viewTestKit'
import { AVAIL_COPY as T } from './availabilityCopy'

setupDom()

// Today is Tue 2026-10-13 noon KST: the screen opens on the week 10.12 ~ 10.18.
beforeEach(() => {
  Element.prototype.getAnimations = () => []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T12:00:00+09:00'))
})
afterEach(() => vi.useRealTimers())

const COMMON = `${PERF}/availability/common`
const TEAMS = `${PERF}/teams`
const PATH = '/clubs/10/performances/31/availability/common'
const POLICY = {
  availabilityState: 'OPEN',
  practiceSeasonStart: '2026-10-06',
  practiceSeasonEnd: '2026-10-25',
}

const who = (id: string, name: string) => ({
  performanceMemberId: id,
  displayName: name,
})
const A = who('88', '박서연')
const B = who('89', '이도윤')
const C = who('90', '김하준')
const D = who('91', '최유나')

const slotOf = (from: string, to: string, members: unknown[]) => ({
  startAt: `2026-10-15T${from}:00+09:00`,
  endAt: `2026-10-15T${to}:00+09:00`,
  availableCount: members.length,
  availableMembers: members,
})
// 18:00 -> A, B, D can (3 of 4; C never answered); 18:30 -> all four.
const FULL = {
  participantCount: 4,
  respondedCount: 3,
  participants: [A, B, C, D],
  missingAvailabilityMemberIds: ['90'],
  slots: [
    slotOf('18:00', '18:30', [A, B, D]),
    slotOf('18:30', '19:00', [A, B, C, D]),
  ],
  warnings: [],
}
// A member gets only the counts (AV-04).
const COUNTS_ONLY = {
  participantCount: 4,
  respondedCount: 3,
  slots: FULL.slots.map((s) => ({
    startAt: s.startAt,
    endAt: s.endAt,
    availableCount: s.availableCount,
  })),
  warnings: [],
}

const TEAM_LIST = {
  items: [
    { id: 't1', name: 'Crane Team' },
    { id: 't2', name: '두번째 팀' },
  ],
}

const open = (
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: Record<string, Route> = {},
  path = PATH,
  policy: Record<string, unknown> = {},
) => {
  const kit = openKit(path, role, {
    [`GET ${PERF}`]: () => json(detail({}, { ...POLICY, ...policy })),
    [`GET ${TEAMS}`]: () => json(TEAM_LIST),
    [`GET ${COMMON}`]: () => json(role === 'MEMBER' ? COUNTS_ONLY : FULL),
    [`GET ${PERF}/setlist`]: () =>
      json({
        items: [
          {
            song: {
              id: '301',
              performanceId: '31',
              title: '곡 제목',
              artist: 'a',
              status: 'CONFIRMED',
              assignedTeamId: 't1',
              assignedTeamName: 'Crane Team',
              setlistOrder: 1,
              version: '2',
            },
            sessions: [],
          },
        ],
        performanceVersion: '8',
      }),
    ...extra,
  })
  return kit
}

const query = (fetchMock: Parameters<typeof callsTo>[0], path: string) =>
  new URL(String(callsTo(fetchMock, path).at(-1)?.[0]), 'http://x').searchParams
const cell = (label: string) =>
  screen.getByLabelText(label) as HTMLButtonElement
const L18 = '10.15(목) 18:00 3/4'
const L1830 = '10.15(목) 18:30 4/4'
const loaded = async () => {
  await findScreen('AVAIL-002')
  await screen.findByText(T.responded(4, 3))
}

describe('AVAIL-002 for a team member', () => {
  it("asks for the member's own team only, over the shown week, and shows the response count", async () => {
    const { fetchMock } = open('MEMBER')
    await loaded()
    const teams = query(fetchMock, TEAMS)
    expect(teams.get('mine')).toBe('true')
    expect(teams.get('status')).toBe('APPROVED')
    const q = query(fetchMock, COMMON)
    expect(q.get('teamIds')).toBe('t1')
    expect(q.get('songIds')).toBeNull()
    expect(q.get('forAllParticipants')).toBeNull()
    expect(q.get('from')).toBe('2026-10-12T00:00:00+09:00')
    expect(q.get('to')).toBe('2026-10-19T00:00:00+09:00')
    expect(
      screen.getByText(T.weekLabel('2026-10-12', '2026-10-18')),
    ).toBeTruthy()
    // Only the teams: no song or everyone entries, no names anywhere.
    const picker = screen.getByLabelText(T.target)
    expect(within(picker).queryByText(T.allOption)).toBeNull()
    expect(within(picker).getByText('두번째 팀')).toBeTruthy()
    expect(screen.queryByText(T.missingNames)).toBeNull()
    expect(screen.queryByText('김하준')).toBeNull()
  })

  it('shows the counts per cell and only a tooltip on press', async () => {
    open('MEMBER')
    await loaded()
    expect(cell(L18).textContent).toBe('3/4')
    expect(cell(L18).getAttribute('data-level')).toBe('3')
    expect(cell(L1830).getAttribute('data-level')).toBe('4')
    expect(cell(L1830).hasAttribute('data-strong')).toBe(true)
    expect(cell(L18).hasAttribute('data-strong')).toBe(false)
    expect(cell('10.15(목) 19:00 0/4').getAttribute('data-level')).toBe('0')

    fireEvent.click(cell(L18))
    await screen.findByText(T.tooltip(3))
    // No detail sheet and no scheduling for a member.
    expect(screen.queryByText(T.makeSchedule)).toBeNull()
    // A drag does not pick a range for a member: it counts as a press on the first cell.
    fireEvent.pointerDown(cell(L1830))
    fireEvent.pointerEnter(cell(L18))
    fireEvent.pointerUp(document.body)
    await screen.findByText(T.tooltip(4))
    expect(screen.queryByText(T.makeSchedule)).toBeNull()
  })

  it('moves by week and asks for that week', async () => {
    const { fetchMock } = open('MEMBER')
    await loaded()
    fireEvent.click(screen.getByText(T.nextWeek))
    await screen.findByText(T.weekLabel('2026-10-19', '2026-10-25'))
    await waitFor(() =>
      expect(query(fetchMock, COMMON).get('from')).toBe(
        '2026-10-19T00:00:00+09:00',
      ),
    )
  })

  it('says so when the member is in no team', async () => {
    const { fetchMock } = open('MEMBER', {
      [`GET ${TEAMS}`]: () => json({ items: [] }),
    })
    await screen.findByText(T.noTarget)
    expect(callsTo(fetchMock, COMMON)).toHaveLength(0)
  })

  it('shows the refusal for a target that is not theirs', async () => {
    open('MEMBER', {
      [`GET ${COMMON}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'FORBIDDEN',
              message: 'f',
              details: [{ reason: 'TARGET_NOT_ALLOWED' }],
            },
          }),
          { status: 403 },
        ),
    })
    await screen.findByText(T.targetNotAllowed)
  })

  it('offers a retry when the result cannot be read', async () => {
    open('MEMBER', {
      [`GET ${COMMON}`]: () => new Response('{}', { status: 500 }),
    })
    await screen.findByRole('button', { name: COPY.retry })
  })

  it('says so when no practice season is set', async () => {
    const { fetchMock } = open('MEMBER', {}, PATH, {
      practiceSeasonStart: null,
      practiceSeasonEnd: null,
    })
    await screen.findByText(T.noSeason)
    expect(callsTo(fetchMock, COMMON)).toHaveLength(0)
  })

  it('greys out the days outside the season', async () => {
    open('MEMBER')
    await loaded()
    fireEvent.click(screen.getByText(T.prevWeek))
    await screen.findByText(T.weekLabel('2026-10-05', '2026-10-11'))
    expect(
      (
        (await screen.findByLabelText(
          '10.05(월) 18:00 0/4',
        )) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(cell('10.06(화) 18:00 0/4').disabled).toBe(false)
  })
})

describe('AVAIL-002 for an officer', () => {
  it('asks for every team, a song or everyone', async () => {
    const { fetchMock } = open('CLUB_ADMIN')
    await loaded()
    expect(query(fetchMock, TEAMS).get('mine')).toBe('false')
    const picker = screen.getByLabelText(T.target)
    await screen.findByRole('option', { name: '곡 제목' })

    fireEvent.change(picker, { target: { value: 'song:301' } })
    await waitFor(() =>
      expect(query(fetchMock, COMMON).get('songIds')).toBe('301'),
    )
    expect(query(fetchMock, COMMON).get('teamIds')).toBeNull()

    fireEvent.change(picker, { target: { value: 'all' } })
    await waitFor(() =>
      expect(query(fetchMock, COMMON).get('forAllParticipants')).toBe('true'),
    )
    expect(query(fetchMock, COMMON).get('songIds')).toBeNull()
  })

  it('opens on the team named in the link', async () => {
    const { fetchMock } = open('CLUB_ADMIN', {}, `${PATH}?teamId=t2`)
    await loaded()
    expect(query(fetchMock, COMMON).get('teamIds')).toBe('t2')
    expect((screen.getByLabelText(T.target) as HTMLSelectElement).value).toBe(
      'team:t2',
    )
  })

  it('lists who has not answered', async () => {
    open('CLUB_ADMIN')
    await loaded()
    const summary = screen.getByText(T.missingNames)
    const list = summary.closest('details') as HTMLElement
    expect(within(list).getByText('김하준')).toBeTruthy()
    expect(within(list).queryByText('박서연')).toBeNull()
  })

  it('opens the cell detail with who can and who cannot, and goes on to scheduling', async () => {
    const { router } = open('CLUB_ADMIN')
    await loaded()
    fireEvent.click(cell(L18))
    await screen.findByText(T.detailTitle('2026-10-15', '18:00', '18:30'))
    const dialog = screen.getByRole('dialog')
    const lists = within(dialog).getAllByRole('list')
    expect(
      within(lists[0]!)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['박서연', '이도윤', '최유나'])
    // 불가·미입력 = participants minus those who can.
    expect(
      within(lists[1]!)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['김하준'])

    fireEvent.click(
      within(dialog).getByRole('button', { name: T.makeSchedule }),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/clubs/10/performances/31/schedules/new',
      ),
    )
    const q = new URLSearchParams(router.state.location.search)
    expect(q.get('startAt')).toBe('2026-10-15T18:00:00+09:00')
    expect(q.get('endAt')).toBe('2026-10-15T18:30:00+09:00')
    expect(q.get('teamIds')).toBe('t1')
  })

  it('carries the song or everyone into the schedule link', async () => {
    const { router } = open('CLUB_ADMIN')
    await loaded()
    await screen.findByRole('option', { name: '곡 제목' })
    for (const [value, name, expected] of [
      ['song:301', 'songIds', '301'],
      ['all', 'forAllParticipants', 'true'],
    ] as const) {
      await screen.findByRole('option', { name: '곡 제목' })
      fireEvent.change(screen.getByLabelText(T.target), { target: { value } })
      await waitFor(() => expect(cell(L18)).toBeTruthy())
      fireEvent.click(cell(L18))
      fireEvent.click(
        await within(await screen.findByRole('dialog')).findByRole('button', {
          name: T.makeSchedule,
        }),
      )
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(
          '/clubs/10/performances/31/schedules/new',
        ),
      )
      const q = new URLSearchParams(router.state.location.search)
      expect(q.get(name)).toBe(expected)
      expect(q.get('teamIds')).toBeNull()
      await router.navigate(-1)
      await loaded()
    }
  })

  it('picks a range by dragging and schedules exactly that range', async () => {
    const { router } = open('CLUB_ADMIN')
    await loaded()
    expect(screen.queryByText(T.makeSchedule)).toBeNull()
    fireEvent.pointerDown(cell(L18))
    fireEvent.pointerEnter(cell(L1830))
    fireEvent.pointerUp(document.body)

    const make = await screen.findByText(T.makeSchedule)
    // A range does not open the one-cell sheet.
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(make)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/clubs/10/performances/31/schedules/new',
      ),
    )
    const q = new URLSearchParams(router.state.location.search)
    expect(q.get('startAt')).toBe('2026-10-15T18:00:00+09:00')
    expect(q.get('endAt')).toBe('2026-10-15T19:00:00+09:00')
  })

  it('ignores a drag that leaves the day', async () => {
    open('CLUB_ADMIN')
    await loaded()
    fireEvent.pointerDown(cell(L18))
    fireEvent.pointerEnter(cell('10.16(금) 18:00 0/4'))
    fireEvent.pointerUp(document.body)
    // Still one cell: the detail sheet opens instead of a range bar.
    await screen.findByText(T.detailTitle('2026-10-15', '18:00', '18:30'))
    expect(
      screen.queryByText(T.makeSchedule, { selector: '.avail-bar *' }),
    ).toBeNull()
  })

  it('dims cells below the minimum or not everyone, keeping the full ones', async () => {
    open('CLUB_ADMIN')
    await loaded()
    expect(cell(L18).hasAttribute('data-dim')).toBe(false)

    fireEvent.change(screen.getByLabelText(T.minCount), {
      target: { value: '4' },
    })
    await waitFor(() => expect(cell(L18).hasAttribute('data-dim')).toBe(true))
    expect(cell(L1830).hasAttribute('data-dim')).toBe(false)

    fireEvent.change(screen.getByLabelText(T.minCount), {
      target: { value: '0' },
    })
    await waitFor(() => expect(cell(L18).hasAttribute('data-dim')).toBe(false))
    fireEvent.click(screen.getByRole('checkbox', { name: T.allOnly }))
    await waitFor(() => expect(cell(L18).hasAttribute('data-dim')).toBe(true))
    expect(cell(L1830).hasAttribute('data-dim')).toBe(false)
  })
})
