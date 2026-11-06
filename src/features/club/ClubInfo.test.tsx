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
import { MEMBER_COPY as T } from './copy'

setupDom()

// Failed reads raise a toast, and Montage's toast animation needs this (missing in jsdom).
beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = (role: 'CLUB_ADMIN' | 'MEMBER') => ({
  id: 'm9',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role,
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
})
const club = (extra: Record<string, unknown> = {}) => ({
  id: '10',
  name: 'Crane Band',
  description: '신촌 기반 밴드',
  clubType: 'BAND',
  status: 'ACTIVE',
  isSearchable: true,
  profileImageUrl: null,
  themeColor: '#1A2B3C',
  createdAt: '2026-10-01T12:00:00+09:00',
  updatedAt: '2026-10-08T21:10:00+09:00',
  ...extra,
})
const part = (id: string, name: string, isActive = true) => ({
  id,
  name,
  displayOrder: Number(id),
  isActive,
})
const member = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  displayName: name,
  userName: `${name}-서비스`,
  memberType: 'REGULAR',
  role: 'MEMBER',
  profileImageUrl: null,
  parts: [part('1', '보컬')],
  ...extra,
})
const page = (items: unknown[], pageNo = 0, totalPages = 1) =>
  json({
    items,
    page: pageNo,
    size: 20,
    totalElements: items.length,
    totalPages,
  })

const BASE = '/api/v1/clubs/10'

function open(
  path: string,
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: Record<string, Route> = {},
) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [membership(role)] }),
    [`GET ${BASE}`]: () => json(club()),
    [`GET ${BASE}/memberships`]: () =>
      page([member('21', '정규채'), member('22', '김도윤')]),
    [`GET ${BASE}/memberships/m9`]: () =>
      json({ ...member('m9', '송예림'), performances: [] }),
    [`GET ${BASE}/parts`]: () =>
      json({
        items: [
          { ...part('1', '보컬'), memberCount: 2 },
          { ...part('2', '기타'), memberCount: 1 },
          { ...part('9', '건반', false), memberCount: 0 },
        ],
      }),
    ...extra,
  })
  return { fetchMock, router: renderApp(path) }
}

const lastParams = (fetchMock: ReturnType<typeof stubApi>, path: string) =>
  Object.fromEntries(
    new URL(callsTo(fetchMock, path).at(-1)![0], 'http://x').searchParams,
  )

describe('CLUB-101 ClubOverview', () => {
  it('shows the club and member menu, without officer entries', async () => {
    open('/clubs/10/info', 'MEMBER')
    await findScreen('CLUB-101')

    await screen.findByText('Crane Band')
    expect(screen.getByText('신촌 기반 밴드')).toBeTruthy()
    expect(screen.getByText('밴드')).toBeTruthy()
    // The member count is the list's totalElements.
    await waitFor(() =>
      expect(
        screen.getByText(T.menuMembers).closest('a')?.textContent,
      ).toContain('2'),
    )
    // "내 소속 정보" shows the own display name and parts.
    await screen.findByText('송예림 · 보컬')
    expect(screen.queryByText(T.menuJoinRequests)).toBeNull()
    expect(screen.queryByText(T.menuParts)).toBeNull()
    expect(screen.getByText(T.menuLeave)).toBeTruthy()
  })

  it('adds the officer menu and counts three statuses for officers', async () => {
    const { fetchMock } = open('/clubs/10/info', 'CLUB_ADMIN')
    await findScreen('CLUB-101')

    await screen.findByText(T.menuJoinRequests)
    for (const label of [T.menuAddMember, T.menuJoinCode, T.menuParts])
      expect(screen.getByText(label)).toBeTruthy()
    expect(
      screen.getByText(T.menuJoinRequests).closest('a')?.getAttribute('href'),
    ).toBe('/clubs/10/join-requests')
    await waitFor(() =>
      expect(callsTo(fetchMock, `${BASE}/memberships`)).toHaveLength(1),
    )
    expect(lastParams(fetchMock, `${BASE}/memberships`)).toMatchObject({
      status: 'ACTIVE,ON_LEAVE,GRADUATED',
      size: '1',
    })
  })

  it('notes an inactive club', async () => {
    open('/clubs/10/info', 'MEMBER', {
      [`GET ${BASE}`]: () => json(club({ status: 'INACTIVE' })),
    })
    await screen.findByText(T.inactive)
  })

  it('offers a retry when the club fails to load', async () => {
    let fail = true
    const { fetchMock } = open('/clubs/10/info', 'MEMBER', {
      [`GET ${BASE}`]: () => (fail ? apiError('INTERNAL', 500) : json(club())),
    })
    await findScreen('CLUB-101').catch(() => undefined)
    const retry = await screen.findByRole('button', { name: COPY.retry })
    fail = false
    fireEvent.click(retry)
    await screen.findByText('Crane Band')
    expect(callsTo(fetchMock, BASE)).toHaveLength(2)
  })
})

describe('CLUB-102 MemberList', () => {
  const chip = (name: string) => screen.getByRole('button', { name })

  it('lists members for a regular member without a status filter', async () => {
    const { fetchMock } = open('/clubs/10/members', 'MEMBER')
    await findScreen('CLUB-102')

    await screen.findByText('정규채')
    expect(screen.getByText('김도윤')).toBeTruthy()
    // Regular members have no status chips, and never send `status` (it would be 403).
    expect(screen.queryByRole('button', { name: T.chipOnLeave })).toBeNull()
    expect(lastParams(fetchMock, `${BASE}/memberships`).status).toBeUndefined()
    expect(screen.getByText('정규채').closest('a')?.getAttribute('href')).toBe(
      '/clubs/10/members/21',
    )
  })

  it('offers a retry for the part filters when they fail to load', async () => {
    let healthy = false
    open('/clubs/10/members', 'MEMBER', {
      [`GET ${BASE}/parts`]: () =>
        healthy
          ? json({ items: [{ ...part('1', '보컬'), memberCount: 1 }] })
          : apiError('INTERNAL', 500),
    })
    await screen.findByText('정규채')
    const retry = await screen.findByRole('button', { name: COPY.retry })
    healthy = true
    fireEvent.click(retry)
    expect(await screen.findByRole('button', { name: '보컬' })).toBeTruthy()
  })

  it('shows badges and at most 3 part names with a +n for the rest', async () => {
    open('/clubs/10/members', 'MEMBER', {
      [`GET ${BASE}/memberships`]: () =>
        page([
          member('21', '정규채', {
            role: 'CLUB_ADMIN',
            memberType: 'GUEST',
            parts: ['1', '2', '3', '4', '5'].map((id) => part(id, `파트${id}`)),
          }),
        ]),
    })
    await screen.findByText('정규채')

    const row = screen.getByText('정규채').closest('a') as HTMLElement
    expect(within(row).getByText(T.chipAdmin)).toBeTruthy()
    expect(within(row).getByText(T.chipGuest)).toBeTruthy()
    expect(screen.getByText('파트3')).toBeTruthy()
    expect(screen.queryByText('파트4')).toBeNull()
    expect(screen.getByText(T.moreParts(2))).toBeTruthy()
  })

  it('lets an officer filter by status, role, type, part and name', async () => {
    const { fetchMock } = open('/clubs/10/members', 'CLUB_ADMIN')
    await findScreen('CLUB-102')
    await screen.findByText('정규채')
    const params = () => lastParams(fetchMock, `${BASE}/memberships`)

    expect(params()).toMatchObject({ status: 'ACTIVE', page: '0', size: '20' })
    expect(chip(T.chipActive).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(chip(T.chipOnLeave))
    await waitFor(() => expect(params().status).toBe('ACTIVE,ON_LEAVE'))

    // The last selected status cannot be cleared.
    fireEvent.click(chip(T.chipOnLeave))
    await waitFor(() => expect(params().status).toBe('ACTIVE'))
    fireEvent.click(chip(T.chipActive))
    expect(chip(T.chipActive).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(chip(T.chipAdmin))
    await waitFor(() => expect(params().role).toBe('CLUB_ADMIN'))
    fireEvent.click(chip(T.chipGuest))
    await waitFor(() => expect(params().memberType).toBe('GUEST'))
    fireEvent.click(await screen.findByRole('button', { name: '기타' }))
    await waitFor(() => expect(params().partId).toBe('2'))
    // Inactive parts are not offered as filters (C-12).
    expect(screen.queryByRole('button', { name: '건반' })).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(T.searchPlaceholder), {
      target: { value: '규채' },
    })
    await waitFor(() => expect(params().q).toBe('규채'))
  })

  it('shows officer-only status badges from the server data', async () => {
    open('/clubs/10/members', 'CLUB_ADMIN', {
      [`GET ${BASE}/memberships`]: () =>
        page([member('21', '정규채', { status: 'GRADUATED' })]),
    })
    const row = (await screen.findByText('정규채')).closest('a') as HTMLElement
    expect(within(row).getByText(T.chipGraduated)).toBeTruthy()
  })

  it('shows the empty state', async () => {
    open('/clubs/10/members', 'MEMBER', {
      [`GET ${BASE}/memberships`]: () => page([], 0, 0),
    })
    await screen.findByText(T.empty)
  })

  it('loads the next page and appends it', async () => {
    const { fetchMock } = open('/clubs/10/members', 'MEMBER', {
      [`GET ${BASE}/memberships`]: (url) =>
        url.includes('page=1')
          ? page([member('23', '이서연')], 1, 2)
          : page([member('21', '정규채')], 0, 2),
    })
    await screen.findByText('정규채')
    fireEvent.click(screen.getByRole('button', { name: T.loadMore }))
    await screen.findByText('이서연')
    expect(screen.getByText('정규채')).toBeTruthy()
    expect(
      callsTo(fetchMock, `${BASE}/memberships`).filter(([url]) =>
        url.includes('page=1'),
      ),
    ).toHaveLength(1)
    expect(screen.queryByRole('button', { name: T.loadMore })).toBeNull()
  })

  it('offers a retry when the list fails', async () => {
    let fail = true
    open('/clubs/10/members', 'MEMBER', {
      [`GET ${BASE}/memberships`]: () =>
        fail ? apiError('INTERNAL', 500) : page([member('21', '정규채')]),
    })
    const retry = await screen.findByRole('button', { name: COPY.retry })
    fail = false
    fireEvent.click(retry)
    await screen.findByText('정규채')
  })
})

describe('CLUB-103 MemberDetail', () => {
  const detail = (extra: Record<string, unknown> = {}) => ({
    ...member('21', '정규채', {
      parts: [part('1', '보컬'), part('9', '건반', false)],
    }),
    performances: [
      {
        id: '51',
        title: '정기 공연',
        status: 'ACTIVE',
        participationStatus: 'APPROVED',
      },
    ],
    ...extra,
  })

  it('shows the public view to a regular member', async () => {
    // Even if a handle slipped into the response, a regular member must not see it.
    open('/clubs/10/members/21', 'MEMBER', {
      [`GET ${BASE}/memberships/21`]: () => json(detail({ handle: 'gyuchae' })),
    })
    await findScreen('CLUB-103')

    await screen.findByText('정규채-서비스')
    expect(screen.getByText(`건반 ${T.inactivePart}`)).toBeTruthy()
    expect(screen.getByText('정기 공연')).toBeTruthy()
    expect(screen.getByText('진행 중')).toBeTruthy()
    expect(screen.getByText('참여 확정')).toBeTruthy()
    expect(screen.queryByText('@gyuchae')).toBeNull()
    expect(screen.queryByText(T.labelStatus)).toBeNull()
    expect(screen.queryByText(T.labelJoinSource)).toBeNull()
  })

  it('shows handle, status, join source and date to an officer', async () => {
    open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`GET ${BASE}/memberships/21`]: () =>
        json(
          detail({
            handle: 'gyuchae',
            status: 'ON_LEAVE',
            joinSource: 'JOIN_CODE',
            approvedAt: '2026-10-02T12:00:00+09:00',
          }),
        ),
    })
    await screen.findByText('@gyuchae')
    expect(screen.getByText(T.labelStatus)).toBeTruthy()
    expect(screen.getByText('가입 코드')).toBeTruthy()
    expect(screen.getByText('2026.10.02')).toBeTruthy()
  })

  it('shows the empty performance list', async () => {
    open('/clubs/10/members/21', 'MEMBER', {
      [`GET ${BASE}/memberships/21`]: () => json(detail({ performances: [] })),
    })
    await screen.findByText(T.noPerformances)
  })

  it('shows the not-found view for a 404', async () => {
    open('/clubs/10/members/99', 'MEMBER')
    await screen.findByText(COPY.notFoundTitle)
  })

  it('offers a retry when loading fails', async () => {
    let fail = true
    open('/clubs/10/members/21', 'MEMBER', {
      [`GET ${BASE}/memberships/21`]: () =>
        fail ? apiError('INTERNAL', 500) : json(detail()),
    })
    const retry = await screen.findByRole('button', { name: COPY.retry })
    fail = false
    fireEvent.click(retry)
    await screen.findByText('정규채-서비스')
  })
})
