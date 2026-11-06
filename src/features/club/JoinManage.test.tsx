import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
import { JOIN_MANAGE_COPY as T } from './joinManageCopy'

setupDom()

const LIST = '/api/v1/clubs/10/memberships'
const user = {
  id: '1',
  name: '임원',
  handle: 'officer',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const adminOf = (clubType: string) => ({
  id: '99',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType,
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'CLUB_ADMIN',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
})
const DAY = 86_400_000
const person = (id: string, name: string, status: string, extra = {}) => ({
  id,
  userName: name,
  handle: `${id}_handle`,
  profileImageUrl: null,
  displayName: null,
  memberType: 'REGULAR',
  status,
  joinSource: 'JOIN_CODE',
  requestedAt: '2026-10-01T12:00:00+09:00',
  invitationExpiresAt: null as string | null,
  ...extra,
})
const page = (items: unknown[]) => ({
  items,
  page: 0,
  size: 100,
  totalElements: items.length,
  totalPages: 1,
})

type Rows = Record<string, ReturnType<typeof person>[]>
let rows: Rows
beforeEach(() => {
  // The global error toast animates; jsdom has no Web Animations API.
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  rows = {
    PENDING: [
      person('p1', '김민수', 'PENDING'),
      person('p2', '이서연', 'PENDING', { joinSource: 'SEARCH' }),
    ],
    INVITED: [],
    DECLINED: [],
  }
})

function open(
  path = '/clubs/10/join-requests',
  extra: Record<string, Route> = {},
  clubType = 'BAND',
) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () =>
      json({ items: [adminOf(clubType)] }),
    [`GET ${LIST}`]: (url) => {
      const status = new URL(url, 'http://x').searchParams.get('status') ?? ''
      return json(page(rows[status] ?? []))
    },
    ...extra,
  })
  return { fetchMock, router: renderApp(path) }
}

/** Montage buttons name themselves by their text, so actions are found inside their row. */
const rowOf = (name: string) =>
  screen.getByText(name).closest('article') as HTMLElement
const inRow = (name: string, action: string) =>
  within(rowOf(name)).getByRole('button', { name: action })
const bulkBar = () => document.querySelector('.member-bulk') as HTMLElement
/** Buttons of the dialog live outside the screen (portal). */
const dialogButton = (name: string) =>
  screen.getAllByRole('button', { name }).find((b) => !b.closest('.start'))!

const body = (fetchMock: ReturnType<typeof stubApi>, path: string) =>
  JSON.parse(String(callsTo(fetchMock, path)[0]![1]?.body))

/** An action handler that also moves the row, so the refetch shows the new state. */
const moveTo =
  (id: string, status: string): Route =>
  () => {
    const row = rows.PENDING!.find((r) => r.id === id)!
    rows.PENDING = rows.PENDING!.filter((r) => r !== row)
    rows[status] = [...(rows[status] ?? []), { ...row, status }]
    return json({})
  }

describe('CLUB-104 JoinManage: requests', () => {
  it('lists pending requests with source badge and tab counts', async () => {
    open()
    await findScreen('CLUB-104')
    await screen.findByText('김민수')
    expect(screen.getByText('이서연')).toBeTruthy()
    expect(screen.getByText(T.sourceCode)).toBeTruthy()
    expect(screen.getByText(T.sourceSearch)).toBeTruthy()
    expect(screen.getByRole('tab', { name: `${T.tabRequests} 2` })).toBeTruthy()
    // C-14 notice is for band clubs
    expect(screen.getByText(T.bandNotice)).toBeTruthy()
  })

  it('hides the band notice for other club types', async () => {
    open('/clubs/10/join-requests', {}, 'CLUB')
    await screen.findByText('김민수')
    expect(screen.queryByText(T.bandNotice)).toBeNull()
  })

  it('approves at once, toasts, and reloads the list', async () => {
    const { fetchMock } = open('/clubs/10/join-requests', {
      'POST /api/v1/clubs/10/memberships/p1/approve': moveTo('p1', 'ACTIVE'),
    })
    fireEvent.click(await waitFor(() => inRow('김민수', '승인')))

    await screen.findByText(T.approved)
    await waitFor(() => expect(screen.queryByText('김민수')).toBeNull())
    expect(screen.getByText('이서연')).toBeTruthy()
    expect(body(fetchMock, '/api/v1/clubs/10/memberships/p1/approve')).toEqual(
      {},
    )
  })

  it('asks before rejecting, and does nothing on cancel', async () => {
    const { fetchMock } = open('/clubs/10/join-requests', {
      'POST /api/v1/clubs/10/memberships/p1/reject': moveTo('p1', 'REJECTED'),
    })
    fireEvent.click(await waitFor(() => inRow('김민수', '거절')))
    await screen.findByText(T.rejectTitle('김민수'))
    fireEvent.click(screen.getByRole('button', { name: COPY.cancel }))
    await waitFor(() =>
      expect(screen.queryByText(T.rejectTitle('김민수'))).toBeNull(),
    )
    expect(
      callsTo(fetchMock, '/api/v1/clubs/10/memberships/p1/reject'),
    ).toHaveLength(0)

    fireEvent.click(inRow('김민수', '거절'))
    await screen.findByText(T.rejectTitle('김민수'))
    fireEvent.click(dialogButton(T.reject))
    await screen.findByText(T.rejected)
    await waitFor(() => expect(screen.queryByText('김민수')).toBeNull())
    expect(
      callsTo(fetchMock, '/api/v1/clubs/10/memberships/p1/reject'),
    ).toHaveLength(1)
  })

  it('tells the user, not the 404 page, when the request is already gone', async () => {
    open('/clubs/10/join-requests', {
      'POST /api/v1/clubs/10/memberships/p1/approve': () => {
        rows.PENDING = rows.PENDING!.filter((r) => r.id !== 'p1')
        return apiError('NOT_FOUND', 404)
      },
    })
    fireEvent.click(await waitFor(() => inRow('김민수', '승인')))

    await screen.findByText(T.gone)
    await waitFor(() => expect(screen.queryByText('김민수')).toBeNull())
    expect(screen.queryByText(COPY.notFoundTitle)).toBeNull()
    expect(document.querySelector('[data-screen-id="CLUB-104"]')).toBeTruthy()
  })

  it('selects all and approves in bulk, reporting partial failure', async () => {
    const { fetchMock } = open('/clubs/10/join-requests', {
      'POST /api/v1/clubs/10/join-requests/bulk-decisions': () => {
        rows.PENDING = []
        return json({
          succeeded: [{ membershipId: 'p1' }],
          failed: [{ membershipId: 'p2', reason: 'NOT_PENDING' }],
          summary: { requested: 2, succeeded: 1, failed: 1 },
        })
      },
    })
    await screen.findByText('김민수')
    fireEvent.click(screen.getByRole('checkbox', { name: T.selectAll }))
    fireEvent.click(
      await waitFor(() =>
        within(bulkBar()).getByRole('button', { name: T.approve }),
      ),
    )

    await screen.findByText(T.bulkDone(1, 1))
    expect(
      body(fetchMock, '/api/v1/clubs/10/join-requests/bulk-decisions'),
    ).toEqual({ membershipIds: ['p1', 'p2'], decision: 'APPROVE' })
    await screen.findByText(T.emptyRequests)
  })

  it('confirms a bulk rejection of the selected rows only', async () => {
    const { fetchMock } = open('/clubs/10/join-requests', {
      'POST /api/v1/clubs/10/join-requests/bulk-decisions': () => {
        rows.PENDING = rows.PENDING!.filter((r) => r.id !== 'p2')
        return json({
          succeeded: [{ membershipId: 'p2' }],
          failed: [],
          summary: { requested: 1, succeeded: 1, failed: 0 },
        })
      },
    })
    await screen.findByText('이서연')
    fireEvent.click(
      screen.getByRole('checkbox', { name: T.selectOne('이서연') }),
    )
    fireEvent.click(
      await waitFor(() =>
        within(bulkBar()).getByRole('button', { name: T.reject }),
      ),
    )
    await screen.findByText(T.rejectBulkTitle(1))
    fireEvent.click(dialogButton(T.reject))

    await screen.findByText(T.bulkDone(1, 0))
    expect(
      body(fetchMock, '/api/v1/clubs/10/join-requests/bulk-decisions'),
    ).toEqual({ membershipIds: ['p2'], decision: 'REJECT' })
  })

  it('shows the empty state', async () => {
    rows.PENDING = []
    open()
    await screen.findByText(T.emptyRequests)
  })

  it('offers a retry when the list fails to load', async () => {
    let fail = true
    open('/clubs/10/join-requests', {
      [`GET ${LIST}`]: (url) => {
        if (fail) return apiError('INTERNAL', 500)
        const status = new URL(url, 'http://x').searchParams.get('status') ?? ''
        return json(page(rows[status] ?? []))
      },
    })
    const retry = await screen.findByRole('button', { name: COPY.retry })
    fail = false
    fireEvent.click(retry)
    await screen.findByText('김민수')
  })

  it('opens CLUB-105 from the add button', async () => {
    const { router } = open()
    fireEvent.click(await screen.findByRole('button', { name: T.addMember }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/members/new'),
    )
  })
})

describe('CLUB-104 JoinManage: invites', () => {
  beforeEach(() => {
    rows.INVITED = [
      person('i1', '박지훈', 'INVITED', {
        joinSource: 'ADMIN_ADDED',
        invitationExpiresAt: new Date(Date.now() + 10 * DAY).toISOString(),
      }),
      person('i2', '최유나', 'INVITED', {
        joinSource: 'ADMIN_ADDED',
        memberType: 'GUEST',
        invitationExpiresAt: new Date(Date.now() - DAY).toISOString(),
      }),
    ]
    rows.DECLINED = [person('d1', '정하늘', 'DECLINED')]
  })

  it('shows the deadline or an expired badge, and re-invite only after expiry', async () => {
    open('/clubs/10/join-requests?tab=invites')
    await screen.findByText('박지훈')
    expect(screen.getByText(/까지$/)).toBeTruthy()
    expect(screen.getByText(T.expired)).toBeTruthy()
    expect(
      within(rowOf('박지훈')).queryByRole('button', { name: T.reinvite }),
    ).toBeNull()
    expect(
      within(rowOf('최유나')).getByRole('button', { name: T.reinvite }),
    ).toBeTruthy()
  })

  it('re-invites an expired invite with the same handle and type', async () => {
    const { fetchMock } = open('/clubs/10/join-requests?tab=invites', {
      'POST /api/v1/clubs/10/memberships/invite': () => {
        rows.INVITED![1]!.invitationExpiresAt = new Date(
          Date.now() + 30 * DAY,
        ).toISOString()
        return json({}, 200)
      },
    })
    fireEvent.click(
      await waitFor(() =>
        within(rowOf('최유나')).getByRole('button', { name: T.reinvite }),
      ),
    )

    await screen.findByText(T.reinvited)
    expect(body(fetchMock, '/api/v1/clubs/10/memberships/invite')).toEqual({
      handle: 'i2_handle',
      memberType: 'GUEST',
    })
    await waitFor(() =>
      expect(
        within(rowOf('최유나')).queryByRole('button', { name: T.reinvite }),
      ).toBeNull(),
    )
  })

  it.each([
    ['NOT_FOUND', 404, T.inviteGone],
    ['DUPLICATE', 409, T.inviteDuplicate],
  ])('says why a re-invite failed (%s)', async (code, status, message) => {
    open('/clubs/10/join-requests?tab=invites', {
      'POST /api/v1/clubs/10/memberships/invite': () => apiError(code, status),
    })
    fireEvent.click(
      await waitFor(() =>
        within(rowOf('최유나')).getByRole('button', { name: T.reinvite }),
      ),
    )
    expect(await screen.findByText(message)).toBeTruthy()
  })

  it('lists declined invites in a collapsed section with re-invite', async () => {
    open('/clubs/10/join-requests?tab=invites')
    const summary = await screen.findByText(T.declinedInvites(1))
    expect(summary.closest('details')?.open).toBe(false)
    expect(
      within(rowOf('정하늘')).getByRole('button', {
        name: T.reinvite,
        hidden: true,
      }),
    ).toBeTruthy()
  })

  it('switches tabs and keeps the choice in the URL', async () => {
    const { router } = open()
    fireEvent.click(
      await screen.findByRole('tab', { name: `${T.tabInvites} 2` }),
    )
    await screen.findByText('박지훈')
    expect(router.state.location.search).toBe('?tab=invites')
  })
})
