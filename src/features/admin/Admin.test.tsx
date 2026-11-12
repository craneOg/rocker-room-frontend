import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import {
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
  type Route,
} from '../../test/harness'
import { ADMIN_COPY as T } from './adminCopy'

setupDom()
Object.defineProperty(Element.prototype, 'getAnimations', {
  value: () => [],
  configurable: true,
})

const ME = {
  id: '1',
  name: '명혜성',
  handle: 'hyeseong',
  profileImageUrl: null,
  profileImagePublic: true,
  onboardingRequired: false,
  isSuperAdmin: true,
}
const A = '/api/v1/admin'
const page = <X,>(items: X[], over = {}) =>
  json({
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: 1,
    ...over,
  })

const overview = (days = 30) => ({
  periodDays: days,
  metrics: {
    activeClubs: 38,
    totalUsers: 1412,
    activeUsers30d: 190,
    ongoingPerformances: 12,
  },
  trend: [
    {
      date: '2026-11-10',
      newUsers: 1,
      newClubs: 0,
      newPerformances: 2,
      newSchedules: 3,
    },
    {
      date: '2026-11-11',
      newUsers: 4,
      newClubs: 1,
      newPerformances: 0,
      newSchedules: 1,
    },
  ],
  joinStatus: {
    requested: 40,
    approved: 31,
    rejected: 4,
    invited: 12,
    invitationAccepted: 9,
    invitationExpired: 2,
  },
  attention: [
    {
      clubId: '9',
      clubName: '노을밴드',
      reason: 'NO_ADMIN',
      lastAdminActiveAt: null,
    },
  ],
})

const club = (id: string, over = {}) => ({
  id,
  name: `동아리${id}`,
  clubType: 'BAND',
  status: 'ACTIVE',
  activeMemberCount: 7,
  adminCount: 2,
  lastActiveAt: '2026-11-10T03:00:00+09:00',
  ongoingPerformanceCount: 1,
  createdAt: '2026-01-02T03:00:00+09:00',
  ...over,
})

const user = {
  id: '5',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  status: 'ACTIVE',
  isSuperAdmin: false,
  lastActiveAt: null,
  kakaoLinked: true,
  createdAt: '2026-03-01T00:00:00+09:00',
  clubs: [
    {
      clubId: '10',
      name: 'Crane Band',
      role: 'CLUB_ADMIN',
      membershipStatus: 'ACTIVE',
      joinSource: 'CODE',
    },
  ],
}

const log = (id: string, over = {}) => ({
  id,
  action: 'CLUB_DEACTIVATED',
  targetType: 'CLUB',
  targetId: '10',
  actorUserId: '1',
  clubId: '10',
  reason: '운영 정책 위반으로 비활성',
  detail: { before: 'ACTIVE', after: 'INACTIVE' },
  createdAt: '2026-11-10T03:00:00+09:00',
  ...over,
})

function open(path: string, routes: Record<string, Route>) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(ME),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [] }),
    ...routes,
  })
  renderApp(path)
  return fetchMock
}
const lastQuery = (fetchMock: ReturnType<typeof stubApi>, path: string) => {
  const calls = callsTo(fetchMock, path)
  return new URL(calls[calls.length - 1]![0], 'http://x').searchParams
}

describe('SADM-001 AdminOverview', () => {
  it('shows the tiles, the join numbers and the attention list, and reloads for another period', async () => {
    const fetchMock = open('/admin', {
      [`GET ${A}/overview`]: (url) =>
        json(
          overview(
            Number(new URL(url, 'http://x').searchParams.get('periodDays')),
          ),
        ),
    })
    await findScreen('SADM-001')
    await screen.findByText('1,412')
    expect(screen.getByText(T.metrics.activeClubs)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '노을밴드' }).getAttribute('href'),
    ).toBe('/admin/clubs/9')
    expect(lastQuery(fetchMock, `${A}/overview`).get('periodDays')).toBe('30')

    fireEvent.click(screen.getByRole('button', { name: T.period(90) }))
    await waitFor(() =>
      expect(lastQuery(fetchMock, `${A}/overview`).get('periodDays')).toBe(
        '90',
      ),
    )
  })
})

describe('SADM-002 AdminClubs', () => {
  it('lists clubs and sends the search and the filters', async () => {
    const fetchMock = open('/admin/clubs', {
      [`GET ${A}/clubs`]: () =>
        page([club('1'), club('2', { status: 'INACTIVE' })]),
    })
    await findScreen('SADM-002')
    expect(await screen.findByRole('link', { name: '동아리1' })).toBeTruthy()
    const row = screen.getByRole('link', { name: '동아리2' }).closest('li')!
    expect(within(row).getByText(T.statusInactive)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(T.filterNoAdmin))
    await waitFor(() =>
      expect(lastQuery(fetchMock, `${A}/clubs`).get('noAdmin')).toBe('true'),
    )
    fireEvent.change(screen.getByLabelText(T.col.status), {
      target: { value: 'INACTIVE' },
    })
    await waitFor(() =>
      expect(lastQuery(fetchMock, `${A}/clubs`).get('status')).toBe('INACTIVE'),
    )
    fireEvent.change(screen.getByLabelText(T.clubSearchPlaceholder), {
      target: { value: '노을' },
    })
    fireEvent.submit(screen.getByRole('search'))
    await waitFor(() =>
      expect(lastQuery(fetchMock, `${A}/clubs`).get('q')).toBe('노을'),
    )
  })

  it('loads the next page and shows the empty state', async () => {
    const fetchMock = open('/admin/clubs', {
      [`GET ${A}/clubs`]: (url) =>
        new URL(url, 'http://x').searchParams.get('page') === '1'
          ? page([club('21')], { page: 1, totalPages: 2 })
          : page([club('1')], { totalPages: 2 }),
    })
    await findScreen('SADM-002')
    await screen.findByRole('link', { name: '동아리1' })
    fireEvent.click(screen.getByRole('button', { name: T.moreClubs }))
    expect(await screen.findByRole('link', { name: '동아리21' })).toBeTruthy()
    expect(lastQuery(fetchMock, `${A}/clubs`).get('page')).toBe('1')
  })

  it('says so when nothing matches', async () => {
    open('/admin/clubs', { [`GET ${A}/clubs`]: () => page([]) })
    await findScreen('SADM-002')
    expect(await screen.findByText(T.clubEmpty)).toBeTruthy()
  })
})

describe('SADM-004 AdminUsers', () => {
  it('searches by @handle, shows the user, and force-logs-out with a reason', async () => {
    const fetchMock = open('/admin/users', {
      [`GET ${A}/users`]: () => page([user]),
      [`POST ${A}/users/5/force-logout`]: () =>
        json({ userId: '5', revoked: true }),
    })
    await findScreen('SADM-004')
    fireEvent.change(screen.getByLabelText(T.userSearchPlaceholder), {
      target: { value: '@yerim' },
    })
    fireEvent.click(screen.getByRole('button', { name: T.userSearch }))
    await screen.findByText('@yerim')
    const q = lastQuery(fetchMock, `${A}/users`)
    expect(q.get('handle')).toBe('yerim')
    expect(q.get('userId')).toBeNull()
    expect(screen.getByRole('link', { name: 'Crane Band' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: T.forceLogout }))
    const box = await screen.findByRole('textbox')
    const action = screen.getByRole('button', { name: T.forceLogout })
    expect(action.hasAttribute('disabled')).toBe(true)
    fireEvent.change(box, { target: { value: '계정 탈취 의심' } })
    fireEvent.click(action)
    await screen.findByText(T.forceLoggedOut)
    const post = callsTo(fetchMock, `${A}/users/5/force-logout`)[0]![1]!
    expect(JSON.parse(String(post.body))).toEqual({ reason: '계정 탈취 의심' })
  })

  it('treats digits as a user ID and says when nobody is found', async () => {
    const fetchMock = open('/admin/users', {
      [`GET ${A}/users`]: () => page([]),
    })
    await findScreen('SADM-004')
    fireEvent.change(screen.getByLabelText(T.userSearchPlaceholder), {
      target: { value: '77' },
    })
    fireEvent.click(screen.getByRole('button', { name: T.userSearch }))
    expect(await screen.findByText(T.userNotFound)).toBeTruthy()
    expect(lastQuery(fetchMock, `${A}/users`).get('userId')).toBe('77')
  })
})

describe('SADM-005 AuditLogs', () => {
  it('lists records with Korean names, filters, and opens the detail', async () => {
    const fetchMock = open('/admin/audit-logs', {
      [`GET ${A}/audit-logs`]: () =>
        page([
          log('1'),
          log('2', { action: 'FORCE_LOGOUT', actorUserId: null }),
        ]),
    })
    await findScreen('SADM-005')
    expect(
      await screen.findByText('동아리 비활성 (CLUB_DEACTIVATED)'),
    ).toBeTruthy()
    expect(screen.getByText(T.system)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(T.auditFilterAction), {
      target: { value: 'FORCE_LOGOUT' },
    })
    fireEvent.change(screen.getByLabelText(T.auditFrom), {
      target: { value: '2026-11-01' },
    })
    await waitFor(() => {
      const q = lastQuery(fetchMock, `${A}/audit-logs`)
      expect(q.get('action')).toBe('FORCE_LOGOUT')
      expect(q.get('from')).toBe('2026-11-01T00:00:00+09:00')
    })

    fireEvent.click(
      await screen.findByRole('button', { name: /강제 로그아웃/ }),
    )
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('before')).toBeTruthy()
    expect(within(sheet).getByText('INACTIVE')).toBeTruthy()
  })
})
