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
import { COPY } from '../../shared/ui/copy'
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

describe('SADM-001 trend table', () => {
  it('gives the trend as a table of the same numbers', async () => {
    open('/admin', { [`GET ${A}/overview`]: () => json(overview()) })
    await findScreen('SADM-001')
    await screen.findByText('1,412')
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(3)
    expect(within(table).getByText('4')).toBeTruthy()
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

  it('does not close the reason box of another user when an earlier request finishes', async () => {
    let finish: (r: Response) => void = () => {}
    open('/admin/users', {
      [`GET ${A}/users`]: (url) =>
        page([
          new URL(url, 'http://x').searchParams.get('handle') === 'yerim'
            ? user
            : { ...user, id: '6', name: '정규채', handle: 'gyuchae' },
        ]),
      [`POST ${A}/users/5/force-logout`]: () =>
        new Promise<Response>((resolve) => (finish = resolve)),
    })
    await findScreen('SADM-004')
    const search = (text: string) => {
      fireEvent.change(screen.getByLabelText(T.userSearchPlaceholder), {
        target: { value: text },
      })
      fireEvent.click(screen.getByRole('button', { name: T.userSearch }))
    }
    search('@yerim')
    await screen.findByText('@yerim')
    fireEvent.click(screen.getByRole('button', { name: T.forceLogout }))
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: '의심' },
    })
    fireEvent.click(screen.getByRole('button', { name: T.forceLogout }))
    fireEvent.click(screen.getByRole('button', { name: COPY.cancel }))

    search('@gyuchae')
    await screen.findByText('@gyuchae')
    fireEvent.click(screen.getByRole('button', { name: T.forceLogout }))
    const box = await screen.findByRole('textbox')
    finish(json({ userId: '5', revoked: true }))
    await screen.findByText(T.forceLoggedOut)
    expect(screen.getByRole('textbox')).toBe(box)
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

  it('moves focus into the detail sheet and back to the record on close', async () => {
    open('/admin/audit-logs', {
      [`GET ${A}/audit-logs`]: () => page([log('1')]),
    })
    await findScreen('SADM-005')
    const record = await screen.findByRole('button', { name: /동아리 비활성/ })
    fireEvent.click(record)
    const sheet = await screen.findByRole('dialog')
    await waitFor(() => expect(document.activeElement).toBe(sheet))
    fireEvent.click(within(sheet).getByRole('button', { name: T.close }))
    expect(document.activeElement).toBe(record)
  })
})

const adminRow = (id: string, over = {}) => ({
  membershipId: `m${id}`,
  userId: id,
  displayName: `임원${id}`,
  handle: `adm${id}`,
  status: 'ACTIVE',
  lastActiveAt: '2026-11-10T03:00:00+09:00',
  ...over,
})
const detail = (over: Record<string, unknown> = {}) => ({
  club: {
    id: '10',
    name: 'Crane Band',
    description: null,
    clubType: 'BAND',
    status: 'ACTIVE',
    isSearchable: true,
    createdByUserId: '1',
    createdAt: '2026-01-02T03:00:00+09:00',
    updatedAt: '2026-01-02T03:00:00+09:00',
  },
  creator: { userId: '1', name: '명혜성' },
  joinCodeEnabled: true,
  admins: [adminRow('21'), adminRow('22')],
  counts: {
    members: 9,
    performances: 5,
    memberStatus: { active: 6, onLeave: 2, graduated: 1, guests: 0 },
    performanceStatus: {
      draft: 1,
      active: 2,
      locked: 0,
      finished: 2,
      canceled: 0,
    },
  },
  lastActiveAt: '2026-11-10T03:00:00+09:00',
  ...over,
})
const member = (id: string, over = {}) => ({
  id,
  displayName: `후보${id}`,
  userName: `후보${id}`,
  memberType: 'REGULAR',
  role: 'MEMBER',
  profileImageUrl: null,
  parts: [],
  handle: `cand${id}`,
  status: 'ACTIVE',
  ...over,
})
const bodyOf = (fetchMock: ReturnType<typeof stubApi>, path: string, n = 0) =>
  JSON.parse(String(callsTo(fetchMock, path)[n]![1]!.body))
const typeReason = async (text: string) =>
  fireEvent.change(await screen.findByRole('textbox'), {
    target: { value: text },
  })
const D = `${A}/clubs/10`

describe('SADM-003 AdminClubDetail', () => {
  it('shows the facts without the join code, and force-logs-out an officer from the row menu', async () => {
    const fetchMock = open('/admin/clubs/10', {
      [`GET ${D}`]: () => json(detail()),
      [`POST ${A}/users/21/force-logout`]: () =>
        json({ userId: '21', revoked: true }),
    })
    await findScreen('SADM-003')
    expect(await screen.findByText('Crane Band')).toBeTruthy()
    expect(screen.getByText('명혜성')).toBeTruthy()
    expect(screen.getByText(T.detail.joinCodeOn)).toBeTruthy()
    expect(screen.getByText('@adm21')).toBeTruthy()
    expect(screen.getByText(T.inactiveNotice)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(T.detail.rowMenu('임원21')))
    fireEvent.click(screen.getAllByRole('button', { name: T.forceLogout })[0]!)
    await typeReason('계정 탈취 의심')
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: T.forceLogout }))
    await screen.findByText(T.forceLoggedOut)
    expect(bodyOf(fetchMock, `${A}/users/21/force-logout`)).toEqual({
      reason: '계정 탈취 의심',
    })
  })

  it('keeps a later force-logout box open when an earlier state change finishes', async () => {
    let finish: (r: Response) => void = () => {}
    open('/admin/clubs/10', {
      [`GET ${D}`]: () => json(detail()),
      [`POST ${D}/deactivate`]: () =>
        new Promise<Response>((resolve) => (finish = resolve)),
    })
    fireEvent.click(await screen.findByRole('button', { name: T.deactivate }))
    await typeReason('운영 정책 위반')
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: T.deactivate,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: COPY.cancel }))

    fireEvent.click(screen.getByLabelText(T.detail.rowMenu('임원21')))
    fireEvent.click(screen.getAllByRole('button', { name: T.forceLogout })[0]!)
    await typeReason('계정 탈취 의심')
    finish(json({}))
    await screen.findByText(T.deactivated)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '계정 탈취 의심',
    )
  })

  it('deactivates with a required reason', async () => {
    const fetchMock = open('/admin/clubs/10', {
      [`GET ${D}`]: () => json(detail()),
      [`POST ${D}/deactivate`]: () => json({}),
    })
    fireEvent.click(await screen.findByRole('button', { name: T.deactivate }))
    const dialog = await screen.findByRole('dialog')
    const action = within(dialog).getByRole('button', { name: T.deactivate })
    expect(action.hasAttribute('disabled')).toBe(true)
    await typeReason('운영 정책 위반')
    fireEvent.click(action)
    await screen.findByText(T.deactivated)
    expect(bodyOf(fetchMock, `${D}/deactivate`)).toEqual({
      reason: '운영 정책 위반',
    })
  })

  it('reactivates an inactive club without officers after the server warning is confirmed', async () => {
    const fetchMock = open('/admin/clubs/10', {
      [`GET ${D}`]: () =>
        json(
          detail({
            club: { ...detail().club, status: 'INACTIVE' },
            admins: [],
          }),
        ),
      [`POST ${D}/reactivate`]: (_, init) =>
        JSON.parse(String(init?.body)).confirmed
          ? json({})
          : new Response(
              JSON.stringify({
                error: {
                  code: 'CONFIRMATION_REQUIRED',
                  message: 'x',
                  warnings: [
                    {
                      type: 'NO_CLUB_ADMIN',
                      message: '임원이 없는 동아리예요',
                    },
                  ],
                },
              }),
              { status: 409 },
            ),
    })
    fireEvent.click(await screen.findByRole('button', { name: T.reactivate }))
    await typeReason('복구 요청 승인')
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: T.reactivate }))
    await screen.findByText('임원이 없는 동아리예요')
    fireEvent.click(await screen.findByRole('button', { name: '계속 진행' }))
    await screen.findByText(T.reactivated)
    expect(callsTo(fetchMock, `${D}/reactivate`)).toHaveLength(2)
    expect(bodyOf(fetchMock, `${D}/reactivate`, 0).confirmed).toBeUndefined()
    expect(bodyOf(fetchMock, `${D}/reactivate`, 1)).toEqual({
      reason: '복구 요청 승인',
      confirmed: true,
    })
  })

  it('blocks the emergency replacement while any officer is active', async () => {
    open('/admin/clubs/10', {
      [`GET ${D}`]: () => json(detail({ admins: [adminRow('21')] })),
    })
    const button = await screen.findByRole('button', { name: T.replace })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(T.replaceBlocked)).toBeTruthy()
  })

  it('shows the member and performance totals besides the per-status numbers', async () => {
    open('/admin/clubs/10', { [`GET ${D}`]: () => json(detail()) })
    const metrics = await screen.findByRole('region', {
      name: T.detail.metrics,
    })
    expect(
      within(metrics).getByText(T.detail.memberTotal).nextElementSibling
        ?.textContent,
    ).toBe('9')
    expect(
      within(metrics).getByText(T.detail.performanceTotal).nextElementSibling
        ?.textContent,
    ).toBe('5')
  })

  it('finds a successor on a later page before saying there is nobody', async () => {
    open('/admin/clubs/10', {
      [`GET ${D}`]: () => json(detail({ admins: [] })),
      [`GET /api/v1/clubs/10/memberships`]: (url) =>
        new URL(url, 'http://x').searchParams.get('page') === '1'
          ? page([member('41')], { page: 1, totalPages: 2 })
          : page([member('40', { role: 'CLUB_ADMIN' })], { totalPages: 2 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: T.replace }))
    await typeReason('사유')
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: T.replaceNext,
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: T.replaceMore }))
    expect(await screen.findByText('후보41')).toBeTruthy()
    expect(screen.queryByText(T.replaceNoCandidate)).toBeNull()
  })

  it('replaces the officer in four steps with an eligible member', async () => {
    const fetchMock = open('/admin/clubs/10', {
      [`GET ${D}`]: () =>
        json(detail({ admins: [adminRow('21', { status: 'ON_LEAVE' })] })),
      [`GET /api/v1/clubs/10/memberships`]: () =>
        page([
          member('31'),
          member('32', { role: 'CLUB_ADMIN' }),
          member('33', { memberType: 'GUEST' }),
        ]),
      [`POST ${D}/replace-admin`]: () => json({ admins: [] }),
    })
    fireEvent.click(await screen.findByRole('button', { name: T.replace }))
    await typeReason('임원 연락 두절')
    const next = () =>
      within(screen.getByRole('dialog')).getByRole('button', {
        name: T.replaceNext,
      })
    fireEvent.click(next())
    await screen.findByText('후보31')
    expect(screen.queryByText('후보32')).toBeNull()
    expect(screen.queryByText('후보33')).toBeNull()
    expect(next().hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByLabelText(/후보31/))
    fireEvent.click(next())
    await screen.findByText(T.replaceRelease)
    fireEvent.click(next())
    const run = await screen.findByRole('button', { name: T.replaceRun })
    expect(within(screen.getByRole('dialog')).getByText('임원21')).toBeTruthy()
    fireEvent.click(run)
    await screen.findByText(T.replaced)
    expect(bodyOf(fetchMock, `${D}/replace-admin`)).toEqual({
      reason: '임원 연락 두절',
      newAdminMembershipId: '31',
    })
  })

  it('says so when there is nobody to appoint', async () => {
    open('/admin/clubs/10', {
      [`GET ${D}`]: () => json(detail({ admins: [] })),
      [`GET /api/v1/clubs/10/memberships`]: () => page([]),
    })
    fireEvent.click(await screen.findByRole('button', { name: T.replace }))
    await typeReason('사유')
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: T.replaceNext,
      }),
    )
    expect(await screen.findByText(T.replaceNoCandidate)).toBeTruthy()
  })
})
