import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
  type Route,
} from '../../test/harness'
import type { AdminHomeData, HomeData, SuccessionNotice } from './api'
import { HOME_COPY as T } from './copy'

setupDom()

const HOME = '/api/v1/clubs/10/home'
const ADMIN = '/api/v1/clubs/10/home/admin'
const BADGE = '/api/v1/clubs/10/home/badge'
const NOTICES = '/api/v1/me/succession-notices'
const iso = (hours: number) =>
  new Date(Date.now() + hours * 3_600_000).toISOString()

const me = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = {
  id: 'm1',
  clubId: '10',
  club: {
    id: '10',
    name: '크레인',
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'MEMBER',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
}
const empty: HomeData = {
  banners: [],
  todos: [],
  upcomingSchedules: [],
  myPerformances: [],
}
const full: HomeData = {
  banners: [],
  todos: [
    {
      type: 'VOTE',
      performanceId: '31',
      performanceName: '2026 가을 공연',
      label: '투표 (선택 0/3곡)',
      teamId: null,
      deadline: iso(48),
    },
    {
      type: 'TEAM_SUBMIT',
      performanceId: '31',
      performanceName: '2026 가을 공연',
      label: '작성 중인 팀 신청서',
      teamId: '61',
      deadline: null,
    },
  ],
  upcomingSchedules: [
    {
      scheduleId: '71',
      performanceId: '31',
      startAt: '2026-11-08T10:00:00Z',
      endAt: '2026-11-08T12:00:00Z',
      type: 'REHEARSAL',
      title: '1팀 합주',
      performanceName: '2026 가을 공연',
      location: '합주실 A',
    },
  ],
  myPerformances: [
    {
      performanceId: '31',
      name: '2026 가을 공연',
      status: 'ACTIVE',
      performanceDate: '2099-12-20',
      myStatus: 'APPROVED',
      teamNames: ['1팀', '2팀'],
      songCount: 2,
    },
  ],
}

function openHome(
  home: HomeData = empty,
  notices: SuccessionNotice[] = [],
  extra: Record<string, Route> = {},
) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(me),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [membership] }),
    [`GET ${HOME}`]: () => json(home),
    [`GET ${NOTICES}`]: () => json({ items: notices }),
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/10') }
}

const notice = (over: Partial<SuccessionNotice>): SuccessionNotice => ({
  id: 'n1',
  type: 'ADMIN',
  clubId: '10',
  clubName: '크레인',
  teamName: null,
  performanceName: null,
  ...over,
})

describe('HOME-001 Home', () => {
  it('shows the empty states', async () => {
    openHome()
    await findScreen('HOME-001')

    await screen.findByText(T.todosEmpty)
    expect(screen.getByText(T.upcomingEmpty)).toBeTruthy()
    expect(screen.getByText(T.myPerformancesEmpty)).toBeTruthy()
  })

  it('lists todos, the next schedule and my performances', async () => {
    openHome(full)
    await findScreen('HOME-001')

    await screen.findByText('투표 (선택 0/3곡)')
    expect(screen.getByText('작성 중인 팀 신청서')).toBeTruthy()
    // Only the todo with a deadline gets the chip.
    expect(screen.getAllByText(/^마감 /)).toHaveLength(1)
    // 2026-11-08 19:00~21:00 KST (a Sunday).
    expect(screen.getByText('11.08(일) 19:00~21:00')).toBeTruthy()
    expect(screen.getByText('합주실 A', { exact: false })).toBeTruthy()
    expect(screen.getByText('1팀 외 1 · 연주 2곡')).toBeTruthy()
    expect(screen.getByText(/2099\.12\.20 D-/)).toBeTruthy()
  })

  it.each([
    ['투표 (선택 0/3곡)', '/clubs/10/performances/31/songs'],
    ['작성 중인 팀 신청서', '/clubs/10/performances/31/teams/apply'],
  ])('opens %s at %s', async (label, path) => {
    const { router } = openHome(full)
    await findScreen('HOME-001')
    fireEvent.click(await screen.findByText(label))

    await waitFor(() => expect(router.state.location.pathname).toBe(path))
  })

  it('shows 3 banners and folds the rest into "외 n건"', async () => {
    openHome({
      ...empty,
      banners: [
        { type: 'CLUB_INACTIVE' },
        { type: 'MEMBER_GRADUATED' },
        {
          type: 'PERFORMANCE_FINISH_DUE',
          performanceId: '31',
          performanceName: '가을 공연',
          performanceDate: '2026-10-30',
        },
        {
          type: 'PERFORMANCE_FINISH_DUE',
          performanceId: '32',
          performanceName: '봄 공연',
          performanceDate: '2026-04-30',
        },
      ],
    })
    await findScreen('HOME-001')

    await screen.findByText(T.clubInactive)
    expect(screen.queryByText(T.finishDue('봄 공연'))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: T.moreBanners(1) }))
    expect(screen.getByText(T.finishDue('봄 공연'))).toBeTruthy()
  })

  it('"종료하기" goes to the performance status screen (PERF-005)', async () => {
    // The banner is for admins, and PERF-005 is an admin-only route.
    const { router } = openHome(
      {
        ...empty,
        banners: [
          {
            type: 'PERFORMANCE_FINISH_DUE',
            performanceId: '31',
            performanceName: '가을 공연',
            performanceDate: '2026-10-30',
          },
        ],
      },
      [],
      {
        [`GET ${API_PATHS.memberships}`]: () =>
          json({ items: [{ ...membership, role: 'CLUB_ADMIN' }] }),
        // The admin area loads too; an unstubbed 404 would swap the page for "not found".
        [`GET ${ADMIN}`]: () => apiError('UNKNOWN', 500),
      },
    )
    await findScreen('HOME-001')
    fireEvent.click(await screen.findByRole('button', { name: T.finish }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/clubs/10/performances/31/status',
      ),
    )
  })

  it('offers a retry when the home data fails to load', async () => {
    Object.defineProperty(Element.prototype, 'getAnimations', {
      value: () => [],
      configurable: true,
    })
    let healthy = false
    openHome(empty, [], {
      [`GET ${HOME}`]: () => (healthy ? json(empty) : apiError('UNKNOWN', 500)),
    })
    const retry = await screen.findByRole('button', { name: COPY.retry })
    healthy = true
    fireEvent.click(retry)
    await screen.findByText(T.todosEmpty)
  })
})

describe('HOME-001 0-1 succession notices', () => {
  const confirmPath = (id: string) => `${NOTICES}/${id}/confirm`

  it('admin notice: confirms on "확인" and stays on the home', async () => {
    const { fetchMock, router } = openHome(empty, [notice({})], {
      [`POST ${confirmPath('n1')}`]: () => json({ id: 'n1' }),
    })
    await screen.findByText(T.adminNoticeTitle)
    expect(screen.getByText(T.adminNoticeBody('크레인', '송예림'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: T.noticeConfirm }))

    await waitFor(() =>
      expect(callsTo(fetchMock, confirmPath('n1'))).toHaveLength(1),
    )
    expect(router.state.location.pathname).toBe('/clubs/10')
  })

  it('admin notice: "멤버 관리로 이동" confirms and opens the member list', async () => {
    const { fetchMock, router } = openHome(empty, [notice({})], {
      [`POST ${confirmPath('n1')}`]: () => json({ id: 'n1' }),
    })
    fireEvent.click(
      await screen.findByRole('button', { name: T.noticeGoMembers }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/members'),
    )
    expect(callsTo(fetchMock, confirmPath('n1'))).toHaveLength(1)
  })

  it('team leader notice: one button, then the next notice', async () => {
    const { fetchMock } = openHome(
      empty,
      [
        notice({
          id: 'n2',
          type: 'TEAM_LEADER',
          teamName: '1팀',
          performanceName: '가을 공연',
        }),
        notice({ id: 'n3', clubId: '99' }),
        notice({ id: 'n4' }),
      ],
      {
        [`POST ${confirmPath('n2')}`]: () => json({ id: 'n2' }),
        [`POST ${confirmPath('n4')}`]: () => json({ id: 'n4' }),
      },
    )
    await screen.findByText(T.leaderNoticeTitle)
    expect(
      screen.getByText(T.leaderNoticeBody('가을 공연', '1팀', '송예림')),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: T.noticeConfirm }))

    // The next one of this club follows; the other club's notice never shows.
    await screen.findByText(T.adminNoticeTitle)
    fireEvent.click(screen.getByRole('button', { name: T.noticeConfirm }))
    await waitFor(() =>
      expect(callsTo(fetchMock, confirmPath('n4'))).toHaveLength(1),
    )
    expect(callsTo(fetchMock, confirmPath('n3'))).toHaveLength(0)
  })

  it('does not show a notice again when the list changes after a failed confirm', async () => {
    // The failed confirm toast animates; jsdom has no Web Animations API.
    Object.defineProperty(Element.prototype, 'getAnimations', {
      value: () => [],
      configurable: true,
    })
    const first = notice({ id: 'n1' })
    const second = notice({
      id: 'n5',
      type: 'TEAM_LEADER',
      teamName: '1팀',
      performanceName: '가을 공연',
    })
    let list = [first]
    const { fetchMock } = openHome(empty, [], {
      [`GET ${NOTICES}`]: () => json({ items: list }),
      [`POST ${confirmPath('n1')}`]: () => apiError('UNKNOWN', 500),
      [`POST ${confirmPath('n5')}`]: () => json({ id: 'n5' }),
    })
    await screen.findByText(T.adminNoticeTitle)
    // The server still has n1 (the confirm failed) and now also has n5.
    list = [first, second]
    fireEvent.click(screen.getByRole('button', { name: T.noticeConfirm }))

    // Only the new notice follows; n1 does not come back in this visit.
    await screen.findByText(T.leaderNoticeTitle)
    expect(screen.queryByText(T.adminNoticeTitle)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: T.noticeConfirm }))
    await waitFor(() =>
      expect(callsTo(fetchMock, confirmPath('n5'))).toHaveLength(1),
    )
    expect(callsTo(fetchMock, confirmPath('n1'))).toHaveLength(1)
  })
})

describe('HOME-001 5~7 admin area', () => {
  const adminData: AdminHomeData = {
    pending: {
      joinRequests: 2,
      invitesWaiting: 0,
      participationRequests: 3,
      teamReviews: 1,
      auditionReviews: 0,
    },
    performanceChecks: [
      {
        performanceId: '31',
        performanceName: '2026 가을 공연',
        satisfied: 4,
        total: 6,
        items: [
          { checkId: 'L-01', kind: 'BLOCKER', satisfied: false, count: 2 },
          { checkId: 'L-06', kind: 'BLOCKER', satisfied: true, count: 0 },
          { checkId: 'L-07', kind: 'WARNING', satisfied: false, count: 1 },
        ],
        responseRates: {
          playability: { answered: 12, total: 19 },
          vote: null,
          availability: { answered: 15, total: 19 },
        },
      },
    ],
    clubStats: {
      activeMembers: 19,
      admins: 3,
      graduated: 4,
      guests: 1,
      performances: { draft: 0, active: 1, locked: 0, finished: 2 },
    },
  }
  const noPerformances: AdminHomeData = { ...adminData, performanceChecks: [] }

  function openAdmin(
    admin: AdminHomeData | Route = adminData,
    extra: Record<string, Route> = {},
  ) {
    return openHome(empty, [], {
      [`GET ${API_PATHS.memberships}`]: () =>
        json({ items: [{ ...membership, role: 'CLUB_ADMIN' }] }),
      [`GET ${ADMIN}`]: typeof admin === 'function' ? admin : () => json(admin),
      ...extra,
    })
  }

  it('does not show or fetch the admin area for a member', async () => {
    const { fetchMock } = openHome(empty, [], {
      [`GET ${ADMIN}`]: () => json(adminData),
    })
    await screen.findByText(T.todosEmpty)

    expect(screen.queryByText(T.pending)).toBeNull()
    expect(callsTo(fetchMock, ADMIN)).toHaveLength(0)
  })

  it('shows pending counts, the readiness checklist and the club stats', async () => {
    openAdmin()
    await screen.findByText(T.pending)

    expect(screen.getByText(T.pendingJoin).nextSibling?.textContent).toBe('2건')
    expect(screen.getByText(T.pendingInvite).nextSibling?.textContent).toBe(
      '0건',
    )
    // 0건 tiles are dimmed.
    expect(screen.getByText(T.pendingInvite).closest('.is-zero')).not.toBeNull()
    expect(screen.getByText(T.pendingJoin).closest('.is-zero')).toBeNull()
    expect(
      screen.getByText(T.checksSummary('2026 가을 공연', 4, 6)),
    ).toBeTruthy()
    // Only open features show a response rate (vote is null).
    expect(
      screen.getByText(T.rate(T.ratePlayability, 12, 19)).textContent,
    ).toContain('63%')
    expect(screen.queryByText(new RegExp(T.rateVote))).toBeNull()
    expect(screen.getByText(T.check['L-01']!(2))).toBeTruthy()
    expect(screen.getByLabelText(T.checkMark.ok)).toBeTruthy()
    expect(screen.getByLabelText(T.checkMark.warning)).toBeTruthy()
    expect(screen.getByText(T.statsMembers).nextSibling?.textContent).toBe('19')
  })

  it('shows the empty checklist state', async () => {
    openAdmin(noPerformances)
    await screen.findByText(T.checksEmpty)
  })

  it.each([
    [T.pendingJoin, '/clubs/10/join-requests'],
    [T.pendingTeam, '/clubs/10/performances/31/teams/review'],
    [T.check['L-01']!(2), '/clubs/10/performances/31/setlist'],
    [
      T.rate(T.ratePlayability, 12, 19),
      '/clubs/10/performances/31/songs/status',
    ],
    [T.statsMembers, '/clubs/10/members'],
    [T.statsActive, '/clubs/10/performances'],
  ])('opens %s at %s', async (label, path) => {
    const { router } = openAdmin()
    fireEvent.click(await screen.findByText(label))

    await waitFor(() => expect(router.state.location.pathname).toBe(path))
  })

  it('does not link performance tiles when no performance is running', async () => {
    openAdmin(noPerformances)
    await screen.findByText(T.pending)

    expect(screen.getByText(T.pendingTeam).closest('a')).toBeNull()
    expect(screen.getByText(T.pendingJoin).closest('a')).not.toBeNull()
  })

  it('shows a skeleton while loading, then the area', async () => {
    let release: (r: Response) => void = () => {}
    const pending = new Promise<Response>((r) => (release = r))
    openAdmin(() => pending)
    await screen.findByText(T.todosEmpty)

    expect(screen.getAllByRole('status', { name: COPY.loading })).toHaveLength(
      1,
    )
    release(json(adminData))
    await screen.findByText(T.pending)
    expect(screen.queryByRole('status', { name: COPY.loading })).toBeNull()
  })

  it('offers a retry when the admin data fails to load', async () => {
    Object.defineProperty(Element.prototype, 'getAnimations', {
      value: () => [],
      configurable: true,
    })
    let healthy = false
    openAdmin(() => (healthy ? json(adminData) : apiError('UNKNOWN', 500)))
    const retry = await screen.findByRole('button', { name: COPY.retry })
    healthy = true
    fireEvent.click(retry)
    await screen.findByText(T.pending)
  })

  it('shows the home tab badge from API-139, and hides it at 0', async () => {
    const { fetchMock } = openHome(empty, [], {
      [`GET ${BADGE}`]: () => json({ count: 9 }),
    })
    await screen.findByLabelText(T.tabBadge(9))
    expect(callsTo(fetchMock, BADGE).length).toBeGreaterThan(0)
  })

  it('hides the badge at 0', async () => {
    openHome(empty, [], { [`GET ${BADGE}`]: () => json({ count: 0 }) })
    await screen.findByText(T.todosEmpty)
    await waitFor(() =>
      expect(document.querySelector('nav.tabbar')).toBeTruthy(),
    )
    expect(screen.queryByLabelText(/건 대기/)).toBeNull()
  })
})
