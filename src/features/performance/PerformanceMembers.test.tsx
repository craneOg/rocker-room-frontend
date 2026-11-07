import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
  BASE,
  body,
  detail,
  lastQuery,
  memberPage,
  memberRow,
  open,
  page,
  PERF,
} from './viewTestKit'
import { VIEW_COPY as T } from './viewCopy'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const MEMBERS = `${PERF}/members`
const applied = (id: string, membershipId: string, name: string, extra = {}) =>
  memberRow(id, membershipId, name, { status: 'APPLIED', ...extra })
const COUNTS = { APPLIED: 2, APPROVED: 1, REJECTED: 1, WITHDRAWN: 1 }

/** Serves rows by the requested status; `all` maps a status to its rows. */
const byStatus =
  (
    all: Record<string, unknown[]>,
    counts: Record<string, number> = COUNTS,
  ): Route =>
  (url) => {
    const wanted = (
      new URL(url, 'http://x').searchParams.get('status') ?? 'APPROVED'
    ).split(',')
    return memberPage(
      wanted.flatMap((s) => all[s] ?? []),
      counts,
    )
  }
const ROWS = {
  APPROVED: [
    memberRow('1', '21', '정규채', { teamNames: ['1팀'], playedSongCount: 2 }),
  ],
  APPLIED: [
    applied('2', '22', '김도윤'),
    applied('3', '23', '이서연', { source: 'TEAM_SUBMISSION' }),
  ],
  REJECTED: [applied('4', '24', '박지호', { status: 'REJECTED' })],
  WITHDRAWN: [applied('5', '25', '최유나', { status: 'WITHDRAWN' })],
}
const openAdmin = (extra: Record<string, Route> = {}, p = {}) =>
  open('/clubs/10/performances/31/members', 'CLUB_ADMIN', {
    [`GET ${MEMBERS}`]: byStatus(ROWS),
    [`GET ${PERF}`]: () => json(detail(p)),
    ...extra,
  })
/** The performance is read: what hangs on its status is decided (a negative check may follow). */
const detailLoaded = (router: ReturnType<typeof openAdmin>['router']) =>
  waitFor(() =>
    expect(
      router.queryClient.getQueryData([
        'club',
        '10',
        'performance',
        '31',
        'detail',
      ]),
    ).toBeDefined(),
  )
/** The button of one person's row (a row's buttons share their names). */
const rowButton = async (person: string, name: string) => {
  const row = (await screen.findByText(person)).closest('li') as HTMLElement
  fireEvent.click(await within(row).findByRole('button', { name }))
}
const click = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole('button', { name }))
const tab = (name: string) => screen.findByRole('tab', { name })

describe('PMEM-001 for regular members', () => {
  it('lists confirmed participants only, without management controls', async () => {
    const { fetchMock } = open('/clubs/10/performances/31/members', 'MEMBER', {
      [`GET ${MEMBERS}`]: () => memberPage(ROWS.APPROVED, { APPROVED: 1 }),
    })
    await findScreen('PMEM-001')
    await screen.findByText('정규채')
    expect(screen.getByText('1팀')).toBeTruthy()
    expect(screen.getByText(T.playedSongs(2))).toBeTruthy()
    expect(screen.getByRole('tab', { name: T.tabApproved(1) })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: T.tabApplied(0) })).toBeNull()
    expect(screen.queryByText(T.release)).toBeNull()
    expect(
      screen.queryByRole('button', { name: `+ ${T.assignButton}` }),
    ).toBeNull()
    // A regular member must not send `status` (the server would refuse it).
    expect(lastQuery(fetchMock, MEMBERS).get('status')).toBeNull()
  })

  it('shows the empty state', async () => {
    open('/clubs/10/performances/31/members', 'MEMBER', {
      [`GET ${MEMBERS}`]: () => memberPage([], { APPROVED: 0 }),
    })
    await screen.findByText(T.emptyMembers)
  })

  it('searches by name and filters by active part', async () => {
    const { fetchMock } = open('/clubs/10/performances/31/members', 'MEMBER', {
      [`GET ${MEMBERS}`]: () => memberPage(ROWS.APPROVED, { APPROVED: 1 }),
    })
    await screen.findByText('정규채')
    fireEvent.change(
      screen.getByRole('textbox', { name: T.searchPlaceholder }),
      {
        target: { value: '정' },
      },
    )
    fireEvent.click(await screen.findByRole('button', { name: '드럼' }))
    await waitFor(() => {
      const q = lastQuery(fetchMock, MEMBERS)
      expect(q.get('q')).toBe('정')
      expect(q.get('partId')).toBe('4')
    })
    // The inactive part is not offered.
    expect(screen.queryByRole('button', { name: '건반' })).toBeNull()
  })
})

describe('PMEM-001 officer review', () => {
  it('shows the tab counts and the application route of each request', async () => {
    const { fetchMock } = openAdmin()
    await findScreen('PMEM-001')
    await screen.findByText('정규채')
    await tab(T.tabRejected(2))
    fireEvent.click(await tab(T.tabApplied(2)))

    await screen.findByText('김도윤')
    expect(screen.getByText(T.viaApplication)).toBeTruthy()
    expect(screen.getByText(T.viaTeam)).toBeTruthy()
    expect(screen.getByText(T.withTeamHint)).toBeTruthy()
    expect(lastQuery(fetchMock, MEMBERS).get('status')).toBe('APPLIED')

    fireEvent.click(await tab(T.tabRejected(2)))
    await screen.findByText('박지호')
    expect(lastQuery(fetchMock, MEMBERS).get('status')).toBe(
      'REJECTED,WITHDRAWN',
    )
    expect(screen.getByText('최유나')).toBeTruthy()
  })

  it('approves with the performance version', async () => {
    const { fetchMock } = openAdmin({
      [`POST ${MEMBERS}/2/approve`]: () => json({ resource: {} }),
    })
    fireEvent.click(await tab(T.tabApplied(2)))
    await screen.findByText('김도윤')
    await rowButton('김도윤', T.approve)

    await screen.findByText(T.approved)
    expect(body(fetchMock, `${MEMBERS}/2/approve`)).toEqual({
      performanceVersion: '8',
    })
  })

  it('rejects without asking for confirmation (P-03)', async () => {
    const { fetchMock } = openAdmin({
      [`POST ${MEMBERS}/2/reject`]: () => json({ resource: {} }),
    })
    fireEvent.click(await tab(T.tabApplied(2)))
    await rowButton('김도윤', T.reject)

    await screen.findByText(T.rejected)
    expect(body(fetchMock, `${MEMBERS}/2/reject`)).toEqual({
      performanceVersion: '8',
    })
  })

  it('asks for a reason first on a locked performance', async () => {
    const { fetchMock } = openAdmin(
      { [`POST ${MEMBERS}/2/approve`]: () => json({ resource: {} }) },
      { status: 'LOCKED' },
    )
    fireEvent.click(await tab(T.tabApplied(2)))
    await rowButton('김도윤', T.approve)
    const reason = await screen.findByRole('textbox', {
      name: T.lockedReasonTitle,
    })
    expect(callsTo(fetchMock, `${MEMBERS}/2/approve`)).toHaveLength(0)
    fireEvent.change(reason, { target: { value: '긴급 변경' } })
    await click(T.approve)

    await screen.findByText(T.approved)
    expect(body(fetchMock, `${MEMBERS}/2/approve`)).toEqual({
      performanceVersion: '8',
      reason: '긴급 변경',
    })
    // Bulk decisions do not exist for a locked performance.
    expect(screen.queryByText(T.selectAll)).toBeNull()
  })

  it('shows the version conflict dialog and reloads', async () => {
    const { fetchMock } = openAdmin({
      [`POST ${MEMBERS}/2/approve`]: () => apiError('VERSION_CONFLICT', 409),
    })
    fireEvent.click(await tab(T.tabApplied(2)))
    await rowButton('김도윤', T.approve)
    await screen.findByText(COPY.versionConflictTitle)
    expect(screen.queryByText(T.approved)).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: COPY.confirm }))
    await waitFor(() =>
      expect(callsTo(fetchMock, PERF).length).toBeGreaterThan(1),
    )
  })

  it('decides everything selected at once and reports partial failures', async () => {
    const { fetchMock } = openAdmin({
      [`POST ${MEMBERS}/bulk-decisions`]: () =>
        json({
          succeeded: [{ performanceMemberId: '2' }],
          failed: [{ performanceMemberId: '3', reason: 'NOT_APPLIED' }],
          summary: { requested: 2, succeeded: 1, failed: 1 },
        }),
    })
    fireEvent.click(await tab(T.tabApplied(2)))
    await screen.findByText('김도윤')
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(await screen.findByRole('checkbox', { name: T.selectAll }))
    await screen.findByText(T.selectedCount(2))
    await click(T.bulkApprove)

    await screen.findByText(T.bulkResult(1, 1))
    expect(screen.getByText(/이서연: /)).toBeTruthy()
    expect(body(fetchMock, `${MEMBERS}/bulk-decisions`)).toEqual({
      performanceMemberIds: ['2', '3'],
      decision: 'APPROVE',
    })
  })
})

describe('PMEM-001 3-1 release', () => {
  const IMPACT = `${MEMBERS}/1/impact`
  const noImpact = () =>
    json({
      teamIds: [],
      songIds: [],
      scheduleIds: [],
      affectedUserIds: [],
      warnings: [],
    })
  const openRelease = async () => {
    await screen.findByText('정규채')
    fireEvent.click(await screen.findByText(T.rowMenu))
    fireEvent.click(await screen.findByRole('button', { name: T.release }))
    await screen.findByText(T.releaseTitle('정규채'))
  }
  const confirmRelease = async () => {
    const dialogButtons = await screen.findAllByRole('button', {
      name: T.release,
    })
    const action = dialogButtons[dialogButtons.length - 1] as HTMLButtonElement
    await waitFor(() => expect(action.disabled).toBe(false))
    fireEvent.click(action)
  }

  it('withdraws the participant (reason is optional outside a locked performance)', async () => {
    const { fetchMock } = openAdmin({
      [`GET ${IMPACT}`]: noImpact,
      [`POST ${MEMBERS}/1/withdraw`]: () => json({ resource: {} }),
    })
    await openRelease()
    expect(screen.getByText(T.releaseBody)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: T.reasonLabel })).toBeNull()
    await confirmRelease()

    await screen.findByText(T.released)
    expect(body(fetchMock, `${MEMBERS}/1/withdraw`)).toEqual({
      teamLeaderSuccessors: [],
    })
  })

  it('requires a reason on a locked performance', async () => {
    const { fetchMock } = openAdmin(
      {
        [`GET ${IMPACT}`]: noImpact,
        [`POST ${MEMBERS}/1/withdraw`]: () => json({ resource: {} }),
      },
      { status: 'LOCKED' },
    )
    await openRelease()
    const dialogButtons = await screen.findAllByRole('button', {
      name: T.release,
    })
    const action = dialogButtons[dialogButtons.length - 1] as HTMLButtonElement
    expect(action.disabled).toBe(true)
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.reasonLabel }),
      {
        target: { value: '사정이 생겼어요' },
      },
    )
    await waitFor(() => expect(action.disabled).toBe(false))
    fireEvent.click(action)

    await screen.findByText(T.released)
    expect(body(fetchMock, `${MEMBERS}/1/withdraw`)).toEqual({
      reason: '사정이 생겼어요',
      teamLeaderSuccessors: [],
    })
  })

  it('explains a song that would lose its last player (X-04)', async () => {
    openAdmin(
      {
        [`GET ${IMPACT}`]: noImpact,
        [`POST ${MEMBERS}/1/withdraw`]: () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'RULE_VIOLATION',
                message: 'x',
                details: [
                  { field: 'songId:301', reason: 'SONG_WITHOUT_PLAYER' },
                ],
              },
            }),
            { status: 422 },
          ),
      },
      { status: 'LOCKED' },
    )
    await openRelease()
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.reasonLabel }),
      {
        target: { value: '사유' },
      },
    )
    await confirmRelease()

    await screen.findByText(T.songWithoutPlayer(1))
    expect(screen.queryByText(T.released)).toBeNull()
  })

  it('is not offered once the performance is finished', async () => {
    const { router } = openAdmin({}, { status: 'FINISHED' })
    await screen.findByText('정규채')
    await detailLoaded(router)
    expect(screen.queryByText(T.rowMenu)).toBeNull()
  })
})

describe('PMEM-001 4-1 assign', () => {
  const CLUB_MEMBERS = `${BASE}/memberships`
  const clubMember = (id: string, name: string) => ({
    id,
    displayName: name,
    userName: `${name}-서비스`,
    memberType: 'REGULAR',
    role: 'MEMBER',
    status: 'ACTIVE',
    profileImageUrl: null,
    parts: [],
  })
  const extra = (): Record<string, Route> => ({
    [`GET ${CLUB_MEMBERS}`]: () =>
      page([clubMember('21', '정규채'), clubMember('30', '한소희')]),
  })

  it('assigns the checked members and disables those already participating', async () => {
    const { fetchMock } = openAdmin({
      ...extra(),
      [`POST ${MEMBERS}`]: () => json({ items: [{ id: '9' }] }, 201),
    })
    await screen.findByText('정규채')
    await click(`+ ${T.assignButton}`)
    const already = await screen.findByRole('checkbox', { name: /정규채/ })
    const other = await screen.findByRole('checkbox', { name: /한소희/ })
    await waitFor(() =>
      expect((already as HTMLInputElement).disabled).toBe(true),
    )
    expect(screen.getByText(T.assignAlready)).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: T.assignSubmit,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.click(other)
    await screen.findByText(T.assignCount(1))
    await click(T.assignSubmit)

    await screen.findByText(T.assigned(1))
    expect(body(fetchMock, MEMBERS)).toEqual({ membershipIds: ['30'] })
    // Graduated and guest members are listed too: no status or type filter beyond the three states.
    expect(lastQuery(fetchMock, CLUB_MEMBERS).get('status')).toBe(
      'ACTIVE,ON_LEAVE,GRADUATED',
    )
  })

  it.each(['LOCKED', 'FINISHED', 'CANCELED'])(
    'is hidden when the performance is %s',
    async (status) => {
      const { router } = openAdmin(extra(), { status })
      await screen.findByText('정규채')
      await detailLoaded(router)
      expect(
        screen.queryByRole('button', { name: `+ ${T.assignButton}` }),
      ).toBeNull()
    },
  )

  it('is visible on a draft', async () => {
    openAdmin(extra(), { status: 'DRAFT' })
    await click(`+ ${T.assignButton}`)
  })
})
