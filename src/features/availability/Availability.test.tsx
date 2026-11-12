import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import {
  body,
  detail,
  mine,
  open as openKit,
  PERF,
} from '../performance/viewTestKit'
import { AVAIL_COPY as T } from './availabilityCopy'

setupDom()

// Today is Tue 2026-10-13 noon KST: the screen opens on the week 10.12 ~ 10.18.
beforeEach(() => {
  Element.prototype.getAnimations = () => []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T12:00:00+09:00'))
})
afterEach(() => vi.useRealTimers())

const ME = `${PERF}/availability/me`
const PATH = '/clubs/10/performances/31/availability'
const POLICY = {
  availabilityState: 'OPEN',
  availabilityDeadline: '2026-10-14T23:59:00+09:00',
  practiceSeasonStart: '2026-10-06',
  practiceSeasonEnd: '2026-10-25',
}
const SEASON_FROM = '2026-10-06T00:00:00+09:00'
const SEASON_TO = '2026-10-26T00:00:00+09:00'

const slot = (day: string, from: string, to: string) => ({
  startAt: `${day}T${from}:00+09:00`,
  endAt: `${day}T${to}:00+09:00`,
})
// Thu 10.15 18:00-19:00 as two cells.
const SAVED = [
  slot('2026-10-15', '18:00', '18:30'),
  slot('2026-10-15', '18:30', '19:00'),
]

const open = (
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: Record<string, Route> = {},
  p: { perf?: Record<string, unknown>; policy?: Record<string, unknown> } = {},
) =>
  openKit(PATH, role, {
    [`GET ${PERF}`]: () => json(detail(p.perf, { ...POLICY, ...p.policy })),
    [`GET ${PERF}/members/me`]: () => json(mine({ status: 'APPROVED' })),
    [`GET ${ME}`]: () => json({ items: SAVED }),
    ...extra,
  })

const cell = (label: string) =>
  screen.getByLabelText(label) as HTMLButtonElement
const on = (label: string) =>
  cell(label).getAttribute('aria-pressed') === 'true'
const text = (t: string) => fireEvent.click(screen.getByText(t))
const writes = (fetchMock: Parameters<typeof callsTo>[0], path: string) =>
  callsTo(fetchMock, path).filter(([, i]) => i?.method === 'PUT')
const loaded = async () => {
  await findScreen('AVAIL-001')
  await screen.findByText(T.total(2))
}
const dialogButton = (name: string) =>
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) as HTMLElement)

describe('AVAIL-001 for a confirmed participant', () => {
  it('shows the season, the deadline and the saved cells of the week', async () => {
    const { fetchMock } = open('MEMBER')
    await loaded()
    expect(
      screen.getByText(
        `${T.season('2026-10-06', '2026-10-25')} · ${T.deadline('10.14(수) 23:59')}`,
      ),
    ).toBeTruthy()
    expect(screen.getByText(T.guide)).toBeTruthy()
    expect(
      screen.getByText(T.weekLabel('2026-10-12', '2026-10-18')),
    ).toBeTruthy()
    expect(on('10.15(목) 18:00')).toBe(true)
    expect(on('10.15(목) 18:30')).toBe(true)
    expect(on('10.15(목) 19:00')).toBe(false)
    // The whole season is read in one request.
    const url = new URL(String(callsTo(fetchMock, ME)[0]?.[0]), 'http://x')
      .searchParams
    expect(url.get('from')).toBe(SEASON_FROM)
    expect(url.get('to')).toBe(SEASON_TO)
    // No officer picker for a member.
    expect(screen.queryByLabelText(T.viewTarget)).toBeNull()
  })

  it('paints and erases by dragging; the first cell decides which', async () => {
    open('MEMBER')
    await loaded()
    fireEvent.pointerDown(cell('10.14(수) 20:00'))
    fireEvent.pointerEnter(cell('10.14(수) 20:30'))
    fireEvent.pointerEnter(cell('10.14(수) 21:00'))
    fireEvent.pointerUp(document.body)
    expect(on('10.14(수) 20:00')).toBe(true)
    expect(on('10.14(수) 21:00')).toBe(true)
    // After the drag has ended, entering a cell paints nothing.
    fireEvent.pointerEnter(cell('10.14(수) 21:30'))
    expect(on('10.14(수) 21:30')).toBe(false)

    // Starting on a painted cell erases while dragging.
    fireEvent.pointerDown(cell('10.14(수) 20:00'))
    fireEvent.pointerEnter(cell('10.14(수) 20:30'))
    fireEvent.pointerUp(document.body)
    expect(on('10.14(수) 20:00')).toBe(false)
    expect(on('10.14(수) 20:30')).toBe(false)
    expect(on('10.14(수) 21:00')).toBe(true)
  })

  it('toggles a cell from the keyboard and saves only the changed week', async () => {
    const { fetchMock } = open('MEMBER', {
      [`PUT ${ME}`]: () => json({ items: [] }),
    })
    await loaded()
    expect(screen.queryByText(T.dirtyBar)).toBeNull()
    fireEvent.click(cell('10.14(수) 20:00'))
    await screen.findByText(T.dirtyBar)
    expect(screen.getByText(T.total(3))).toBeTruthy()
    text(T.save)

    await screen.findByText(T.saved)
    // The week 10.12 ~ 10.18 only: the server replaces [from, to) and takes up to 31 days.
    expect(body(fetchMock, ME)).toEqual({
      from: '2026-10-12T00:00:00+09:00',
      to: '2026-10-19T00:00:00+09:00',
      slots: [slot('2026-10-14', '20:00', '20:30'), ...SAVED],
    })
    expect(writes(fetchMock, ME)).toHaveLength(1)
    await waitFor(() => expect(screen.queryByText(T.dirtyBar)).toBeNull())
  })

  it('sends one request per changed week and leaves the other weeks alone', async () => {
    const { fetchMock } = open('MEMBER', {
      [`PUT ${ME}`]: () => json({ items: [] }),
    })
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(T.nextWeek) }),
    )
    fireEvent.click(await screen.findByLabelText('10.20(화) 19:00'))
    text(T.save)
    await screen.findByText(T.saved)
    const sent = writes(fetchMock, ME).map(([, i]) =>
      JSON.parse(String(i?.body)),
    )
    expect(
      sent.map((b: { from: string; to: string }) => [b.from, b.to]),
    ).toEqual([
      ['2026-10-12T00:00:00+09:00', '2026-10-19T00:00:00+09:00'],
      ['2026-10-19T00:00:00+09:00', '2026-10-26T00:00:00+09:00'],
    ])
  })

  it('keeps comparing with what the server really has after a week failed half way', async () => {
    // The server's slots follow the PUTs: week 10.12 goes through, week 10.19 fails once.
    let stored = [...SAVED]
    let puts = 0
    let gets = 0
    const { fetchMock } = open('MEMBER', {
      // Refetches after the first read never finish: the cache update alone must keep the
      // comparison true to the server.
      [`GET ${ME}`]: () =>
        ++gets === 1 ? json({ items: stored }) : new Promise(() => {}),
      [`PUT ${ME}`]: (_, init) => {
        const sent = JSON.parse(String(init?.body)) as {
          from: string
          to: string
          slots: (typeof SAVED)[number][]
        }
        if (++puts === 2) return apiError('INTERNAL_SERVER_ERROR', 500)
        stored = [
          ...stored.filter(
            (s) =>
              Date.parse(s.startAt) < Date.parse(sent.from) ||
              Date.parse(s.startAt) >= Date.parse(sent.to),
          ),
          ...sent.slots,
        ]
        return json({ items: sent.slots })
      },
    })
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(T.nextWeek) }),
    )
    fireEvent.click(await screen.findByLabelText('10.20(화) 19:00'))
    text(T.save)
    await waitFor(() => expect(puts).toBe(2))
    // Back to the first week and undo the cell that the server already has.
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(T.prevWeek) }),
    )
    fireEvent.click(await screen.findByLabelText('10.14(수) 20:00'))
    text(T.save)
    await waitFor(() => expect(puts).toBeGreaterThanOrEqual(3))
    const resent = writes(fetchMock, ME).map(([, i]) =>
      JSON.parse(String(i?.body)),
    )
    // The undo of the already saved week is sent again, not dropped as "unchanged".
    expect(
      resent.some(
        (b: { from: string; slots: unknown[] }) =>
          b.from === '2026-10-12T00:00:00+09:00' && b.slots.length === 2,
      ),
    ).toBe(true)
  })

  it('does not let the member paint before the saved slots have arrived', async () => {
    let release = null as (() => void) | null
    open('MEMBER', {
      [`GET ${ME}`]: () =>
        new Promise((resolve) => {
          release = () => resolve(json({ items: SAVED }))
        }),
    })
    await findScreen('AVAIL-001')
    await waitFor(() => expect(release).not.toBeNull())
    expect(cell('10.14(수) 20:00').disabled).toBe(true)
    release!()
    await loaded()
    expect(cell('10.14(수) 20:00').disabled).toBe(false)
  })

  it('sends an empty list when everything is erased', async () => {
    const { fetchMock } = open('MEMBER', {
      [`PUT ${ME}`]: () => json({ items: [] }),
    })
    await loaded()
    text(T.clearWeek)
    expect(await screen.findByText(T.total(0))).toBeTruthy()
    text(T.save)
    await screen.findByText(T.saved)
    expect(body(fetchMock, ME)).toMatchObject({ slots: [] })
  })

  it('drops the changes with 되돌리기', async () => {
    const { fetchMock } = open('MEMBER')
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    await screen.findByText(T.dirtyBar)
    text(T.revert)
    await waitFor(() => expect(screen.queryByText(T.dirtyBar)).toBeNull())
    expect(on('10.14(수) 20:00')).toBe(false)
    expect(writes(fetchMock, ME)).toHaveLength(0)
  })

  it('copies last week onto this week', async () => {
    open('MEMBER', {
      [`GET ${ME}`]: () =>
        json({ items: [slot('2026-10-07', '18:00', '18:30')] }),
    })
    await findScreen('AVAIL-001')
    await screen.findByText(T.total(1))
    text(T.copyPrevious)
    expect(await screen.findByText(T.dirtyBar)).toBeTruthy()
    // Wed 10.07 -> Wed 10.14; the old week keeps its own cell.
    expect(on('10.14(수) 18:00')).toBe(true)
    text(T.prevWeek)
    await screen.findByText(T.weekLabel('2026-10-05', '2026-10-11'))
    expect(on('10.07(수) 18:00')).toBe(true)
  })

  it('applies a weekday repeat to this week only, or to the whole season', async () => {
    open('MEMBER')
    await loaded()
    text(T.repeat)
    await screen.findByText(T.repeatTitle)
    // 적용 stays off until a weekday is chosen.
    expect(
      (
        screen
          .getAllByRole('button', { name: T.apply })
          .at(-1) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: '월' }))
    fireEvent.change(screen.getByLabelText(T.repeatStart), {
      target: { value: String(18 * 60) },
    })
    fireEvent.change(screen.getByLabelText(T.repeatEnd), {
      target: { value: String(19 * 60) },
    })
    dialogButton(T.apply)

    await waitFor(() => expect(on('10.12(월) 18:00')).toBe(true))
    expect(on('10.12(월) 18:30')).toBe(true)
    expect(on('10.12(월) 19:00')).toBe(false)
    // Next week's Monday is untouched by "이번 주만".
    text(T.nextWeek)
    await screen.findByText(T.weekLabel('2026-10-19', '2026-10-25'))
    expect(on('10.19(월) 18:00')).toBe(false)

    // Back on the first week, repeat over the whole season.
    text(T.prevWeek)
    await screen.findByText(T.weekLabel('2026-10-12', '2026-10-18'))
    text(T.repeat)
    await screen.findByText(T.repeatTitle)
    fireEvent.click(screen.getByRole('checkbox', { name: '월' }))
    fireEvent.click(screen.getByRole('radio', { name: T.scopeSeason }))
    dialogButton(T.apply)
    text(T.nextWeek)
    await screen.findByText(T.weekLabel('2026-10-19', '2026-10-25'))
    expect(on('10.19(월) 18:00')).toBe(true)
  })

  it('does not leave the season and greys out the days outside it', async () => {
    open('MEMBER')
    await loaded()
    text(T.prevWeek)
    await screen.findByText(T.weekLabel('2026-10-05', '2026-10-11'))
    expect(cell('10.05(월) 18:00').disabled).toBe(true)
    expect(cell('10.06(화) 18:00').disabled).toBe(false)
    expect(
      screen
        .getByText(T.prevWeek)
        .closest('button')
        ?.getAttribute('aria-disabled'),
    ).toBe('true')
    // Painting a cell outside the season does nothing.
    fireEvent.click(cell('10.05(월) 18:00'))
    expect(screen.queryByText(T.dirtyBar)).toBeNull()
  })

  it('shows the early-morning rows only with 시간 범위', async () => {
    open('MEMBER')
    await loaded()
    expect(screen.queryByLabelText('10.12(월) 00:00')).toBeNull()
    expect(screen.getByLabelText('10.12(월) 08:00')).toBeTruthy()
    fireEvent.click(screen.getByText(new RegExp(T.fullRange)))
    await waitFor(() =>
      expect(screen.getByLabelText('10.12(월) 00:00')).toBeTruthy(),
    )
  })
})

describe('AVAIL-001 when input is not possible', () => {
  it.each([
    [
      'the policy is closed',
      { policy: { availabilityState: 'CLOSED' } },
      T.readOnlyClosed,
    ],
    [
      'the deadline has passed',
      { policy: { availabilityDeadline: '2026-10-13T09:00:00+09:00' } },
      T.readOnlyClosed,
    ],
    [
      'the performance is a draft',
      { perf: { status: 'DRAFT' } },
      T.readOnlyState,
    ],
    [
      'the performance is finished',
      { perf: { status: 'FINISHED' } },
      T.readOnlyState,
    ],
  ])(
    'is read-only when %s, still showing what was saved',
    async (_, p, note) => {
      open('MEMBER', {}, p)
      await loaded()
      expect(screen.getByText(note)).toBeTruthy()
      expect(on('10.15(목) 18:00')).toBe(true)
      expect(cell('10.14(수) 20:00').disabled).toBe(true)
      fireEvent.click(cell('10.14(수) 20:00'))
      expect(screen.queryByText(T.dirtyBar)).toBeNull()
    },
  )

  it('only lets a confirmed participant paint', async () => {
    const { fetchMock } = open('MEMBER', {
      [`GET ${PERF}/members/me`]: () => apiError('NOT_FOUND', 404),
    })
    await findScreen('AVAIL-001')
    await screen.findByText(T.notParticipant)
    expect(callsTo(fetchMock, ME)).toHaveLength(0)
    expect(cell('10.14(수) 20:00').disabled).toBe(true)
  })

  it('treats an applicant like a non-participant', async () => {
    open('MEMBER', {
      [`GET ${PERF}/members/me`]: () => json(mine({ status: 'APPLIED' })),
    })
    await screen.findByText(T.notParticipant)
  })

  it('says so when no practice season is set', async () => {
    const { fetchMock } = open(
      'MEMBER',
      {},
      { policy: { practiceSeasonStart: null, practiceSeasonEnd: null } },
    )
    await screen.findByText(T.noSeason)
    expect(callsTo(fetchMock, ME)).toHaveLength(0)
  })
})

describe('AVAIL-001 save errors', () => {
  const failing =
    (status: number, code: string, reason: string): Route =>
    () =>
      new Response(
        JSON.stringify({
          error: { code, message: reason, details: [{ reason }] },
        }),
        { status },
      )

  it('leaves a passed deadline to the global dialog (409)', async () => {
    open('MEMBER', {
      [`PUT ${ME}`]: failing(409, 'STATE_CONFLICT', 'DEADLINE_PASSED'),
    })
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    text(T.save)
    await screen.findByText(COPY.stateConflictTitle)
  })

  it('names a cell outside the practice season (400)', async () => {
    open('MEMBER', {
      [`PUT ${ME}`]: failing(
        400,
        'VALIDATION_ERROR',
        'OUTSIDE_PRACTICE_SEASON',
      ),
    })
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    text(T.save)
    await screen.findByText(T.outsideSeason)
    // The edits stay for another try.
    expect(on('10.14(수) 20:00')).toBe(true)
  })

  it('asks to check the input on any other 400', async () => {
    open('MEMBER', {
      [`PUT ${ME}`]: failing(400, 'VALIDATION_ERROR', 'INVALID_VALUE'),
    })
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    text(T.save)
    await screen.findByText(COPY.checkInput)
  })
})

describe('AVAIL-001 leaving with unsaved cells (5-1)', () => {
  const tryLeave = async (router: ReturnType<typeof open>['router']) => {
    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await screen.findByText(T.leaveTitle)
  }

  it('계속 편집 stays and keeps the painted cells; asking again works', async () => {
    const { router, fetchMock } = open('MEMBER')
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    await tryLeave(router)
    dialogButton(T.keepEditing)
    await waitFor(() => expect(screen.queryByText(T.leaveTitle)).toBeNull())
    expect(router.state.location.pathname).toBe(PATH)
    expect(on('10.14(수) 20:00')).toBe(true)
    expect(writes(fetchMock, ME)).toHaveLength(0)
    await tryLeave(router)
  })

  it('Esc closes the dialog like 계속 편집: no move, changes kept', async () => {
    const { router } = open('MEMBER')
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    await tryLeave(router)
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    })
    await waitFor(() => expect(screen.queryByText(T.leaveTitle)).toBeNull())
    expect(router.state.location.pathname).toBe(PATH)
    expect(on('10.14(수) 20:00')).toBe(true)
  })

  it('only 버리고 나가기 leaves and drops the changes, without saving', async () => {
    const { router, fetchMock } = open('MEMBER')
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    await tryLeave(router)
    dialogButton(T.leaveDiscard)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10'),
    )
    expect(writes(fetchMock, ME)).toHaveLength(0)
  })

  it('does not ask when nothing changed', async () => {
    const { router } = open('MEMBER')
    await loaded()
    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10'),
    )
    expect(screen.queryByText(T.leaveTitle)).toBeNull()
  })
})

describe('AVAIL-001 for an officer', () => {
  const MEMBERS = `${PERF}/members`
  const OTHER = `${PERF}/availability/members/77`
  const openAdmin = (extra: Record<string, Route> = {}) =>
    open('CLUB_ADMIN', {
      [`GET ${MEMBERS}`]: () =>
        json({
          items: [
            { id: '77', displayName: '정규채', membershipId: '21' },
            { id: '78', displayName: '김도윤', membershipId: '22' },
          ],
          statusCounts: {},
          page: 0,
          size: 100,
          totalElements: 2,
          totalPages: 1,
        }),
      [`GET ${OTHER}`]: () =>
        json({ items: [slot('2026-10-13', '19:00', '19:30')] }),
      ...extra,
    })

  it("reads another participant's original slots, read-only", async () => {
    const { fetchMock } = openAdmin()
    await loaded()
    const picker = await screen.findByLabelText(T.viewTarget)
    await screen.findByRole('option', { name: '정규채' })
    fireEvent.change(picker, { target: { value: '77' } })

    await screen.findByText(T.memberReadOnly('정규채'))
    await waitFor(() => expect(on('10.13(화) 19:00')).toBe(true))
    expect(on('10.15(목) 18:00')).toBe(false)
    const url = new URL(String(callsTo(fetchMock, OTHER)[0]?.[0]), 'http://x')
    expect(url.searchParams.get('from')).toBe(SEASON_FROM)
    expect(url.searchParams.get('to')).toBe(SEASON_TO)
    // No write counterpart exists: the cells are locked and nothing becomes dirty.
    expect(cell('10.14(수) 20:00').disabled).toBe(true)
    fireEvent.click(cell('10.14(수) 20:00'))
    expect(screen.queryByText(T.dirtyBar)).toBeNull()

    // Back to my own times.
    fireEvent.change(picker, { target: { value: 'me' } })
    await waitFor(() => expect(on('10.15(목) 18:00')).toBe(true))
  })

  it("does not offer to save my edit over another member's slots", async () => {
    openAdmin()
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    await screen.findByText(T.dirtyBar)
    const picker = await screen.findByLabelText(T.viewTarget)
    await screen.findByRole('option', { name: '정규채' })
    fireEvent.change(picker, { target: { value: '77' } })
    await screen.findByText(T.memberReadOnly('정규채'))
    expect(screen.queryByText(T.dirtyBar)).toBeNull()
    // The edit is still mine when I come back.
    fireEvent.change(picker, { target: { value: 'me' } })
    await screen.findByText(T.dirtyBar)
  })

  it("still asks before leaving while another member's slots are shown", async () => {
    const { router } = openAdmin()
    await loaded()
    fireEvent.click(cell('10.14(수) 20:00'))
    const picker = await screen.findByLabelText(T.viewTarget)
    await screen.findByRole('option', { name: '정규채' })
    fireEvent.change(picker, { target: { value: '77' } })
    await screen.findByText(T.memberReadOnly('정규채'))
    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await screen.findByText(T.leaveTitle)
  })
})
