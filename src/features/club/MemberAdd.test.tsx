import { fireEvent, screen, waitFor } from '@testing-library/react'
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

const LOOKUP = '/api/v1/clubs/10/users/lookup'
const INVITE = '/api/v1/clubs/10/memberships/invite'
const user = {
  id: '1',
  name: '임원',
  handle: 'officer',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const admin = {
  id: '99',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'CLUB_ADMIN',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
}
const found = (membership: unknown = null) => ({
  userId: '7',
  handle: 'gyuchae',
  name: '정규채',
  profileImageUrl: null,
  membership,
})

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
})

function open(extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [admin] }),
    [`GET ${LOOKUP}`]: () => json(found()),
    [`POST ${INVITE}`]: () => json({}, 201),
    'GET /api/v1/clubs/10/memberships': () =>
      json({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }),
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/10/members/new') }
}

const input = () => screen.getByPlaceholderText(T.handlePlaceholder)
async function search(value = 'GyuChae') {
  await findScreen('CLUB-105')
  fireEvent.change(input(), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: T.find }))
}

describe('CLUB-105 MemberAdd', () => {
  it('lower-cases the handle, looks it up exactly, and shows the card', async () => {
    const { fetchMock } = open()
    await search()

    await screen.findByText('정규채')
    expect((input() as HTMLInputElement).value).toBe('gyuchae')
    expect(callsTo(fetchMock, LOOKUP)[0]![0]).toContain('handle=gyuchae')
    expect(screen.getByText('@gyuchae')).toBeTruthy()
    expect(screen.getByText(T.handleHint, { exact: false })).toBeTruthy()
  })

  it('says so when the handle matches nobody, not the 404 page', async () => {
    open({ [`GET ${LOOKUP}`]: () => apiError('NOT_FOUND', 404) })
    await search('nobody')

    await screen.findByText(`* ${T.handleNotFound}`)
    expect(screen.queryByText(COPY.notFoundTitle)).toBeNull()
    expect(document.querySelector('[data-screen-id="CLUB-105"]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.invite })).toBeNull()
  })

  it('invites as a regular member by default, then goes to the invite tab', async () => {
    const { fetchMock, router } = open()
    await search()
    fireEvent.click(await screen.findByRole('button', { name: T.invite }))

    await screen.findByText(T.invited)
    expect(JSON.parse(String(callsTo(fetchMock, INVITE)[0]![1]?.body))).toEqual(
      {
        handle: 'gyuchae',
        memberType: 'REGULAR',
      },
    )
    await waitFor(() =>
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe('/clubs/10/join-requests?tab=invites'),
    )
  })

  it('invites a guest when 객원 is chosen', async () => {
    const { fetchMock } = open()
    await search()
    fireEvent.click(await screen.findByRole('radio', { name: T.guest }))
    expect(screen.getByText(T.guestDescription)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: T.invite }))

    await screen.findByText(T.invited)
    expect(
      JSON.parse(String(callsTo(fetchMock, INVITE)[0]![1]?.body)).memberType,
    ).toBe('GUEST')
  })

  it.each([
    ['ACTIVE', T.alreadyMember],
    ['GRADUATED', T.alreadyMember],
    ['PENDING', T.alreadyPending],
  ])(
    'shows a notice instead of the invite form for %s (C-06)',
    async (status, text) => {
      open({
        [`GET ${LOOKUP}`]: () =>
          json(found({ id: '21', status, invitationExpiresAt: null })),
      })
      await search()

      await screen.findByText(text)
      expect(screen.queryByRole('button', { name: T.invite })).toBeNull()
      expect(screen.queryByRole('radio')).toBeNull()
    },
  )

  it('links a pending applicant to join management', async () => {
    const { router } = open({
      [`GET ${LOOKUP}`]: () =>
        json(found({ id: '21', status: 'PENDING', invitationExpiresAt: null })),
    })
    await search()
    fireEvent.click(await screen.findByRole('button', { name: T.goJoinManage }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/join-requests'),
    )
  })

  it('blocks a live invite but allows an expired one', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString()
    const past = new Date(Date.now() - 86_400_000).toISOString()
    let expiry = future
    open({
      [`GET ${LOOKUP}`]: () =>
        json(
          found({ id: '21', status: 'INVITED', invitationExpiresAt: expiry }),
        ),
    })
    await search()
    await screen.findByText(/이미 초대했어요\(/)
    expect(screen.queryByRole('button', { name: T.invite })).toBeNull()

    expiry = past
    fireEvent.change(input(), { target: { value: 'gyuchae2' } })
    fireEvent.change(input(), { target: { value: 'gyuchae' } })
    fireEvent.click(screen.getByRole('button', { name: T.find }))
    await screen.findByRole('button', { name: T.invite })
  })

  it('explains a 409 on invite and shows the current state again', async () => {
    let membership: unknown = null
    const { fetchMock } = open({
      [`GET ${LOOKUP}`]: () => json(found(membership)),
      [`POST ${INVITE}`]: () => {
        membership = { id: '21', status: 'ACTIVE', invitationExpiresAt: null }
        return apiError('DUPLICATE', 409)
      },
    })
    await search()
    fireEvent.click(await screen.findByRole('button', { name: T.invite }))

    await screen.findByText(T.inviteDuplicate)
    await screen.findByText(T.alreadyMember)
    expect(callsTo(fetchMock, LOOKUP).length).toBeGreaterThan(1)
    expect(screen.queryByText(COPY.notFoundTitle)).toBeNull()
  })
})
