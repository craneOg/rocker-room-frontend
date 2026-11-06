import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
} from '../../test/harness'
import { MY_COPY as T } from './copy'

setupDom()

const me = (over = {}) => ({
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
  ...over,
})
const membership = (
  id: string,
  name: string,
  status = 'ACTIVE',
  role = 'MEMBER',
) => ({
  id: `m${id}`,
  clubId: id,
  club: {
    id,
    name,
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role,
  status,
  invitationExpiresAt: null,
  requestedAt: null,
})
const clubs = [
  membership('1', '한빛 밴드', 'ACTIVE', 'CLUB_ADMIN'),
  membership('2', '서울 인디', 'GRADUATED'),
  membership('3', '대기 중 동아리', 'PENDING'),
]

function openMy(user = me()) {
  let loggedOut = false
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () =>
      loggedOut ? apiError('UNAUTHENTICATED', 401) : json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: clubs }),
    [`POST ${API_PATHS.logout}`]: () => {
      loggedOut = true
      return new Response(null, { status: 204 })
    },
  })
  return { fetchMock, router: renderApp('/me') }
}

describe('MY-001 MyInfo', () => {
  it('shows the profile, the current club and only the clubs the user can use', async () => {
    localStorage.setItem('lastClubId', '2')
    openMy()
    await findScreen('MY-001')

    expect(screen.getByText('송예림')).toBeTruthy()
    expect(screen.getByText('@yerim')).toBeTruthy()
    // Current club = the last one opened (club 2), shown with its menu.
    expect(screen.getAllByText('서울 인디').length).toBe(2)
    expect(
      screen.getByRole('link', { name: T.clubInfo }).getAttribute('href'),
    ).toBe('/clubs/2/info')
    // Pending memberships are not "my clubs".
    expect(screen.queryByText('대기 중 동아리')).toBeNull()
    expect(screen.getByText('임원')).toBeTruthy()
  })

  it('copies the ID', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    openMy()
    await findScreen('MY-001')
    fireEvent.click(screen.getByRole('button', { name: T.copyId }))

    await screen.findByText(T.idCopied)
    expect(writeText).toHaveBeenCalledWith('yerim')
  })

  it('switches club: remembers it and opens its home', async () => {
    const { router } = openMy()
    await findScreen('MY-001')
    fireEvent.click(screen.getByRole('button', { name: /서울 인디/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clubs/2'))
    expect(localStorage.getItem('lastClubId')).toBe('2')
  })

  it('goes to the profile edit and withdrawal screens', async () => {
    const { router } = openMy()
    await findScreen('MY-001')
    fireEvent.click(screen.getByRole('button', { name: T.editProfile }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/me/profile'),
    )

    await router.navigate('/me')
    await findScreen('MY-001')
    fireEvent.click(screen.getByRole('link', { name: T.withdraw }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/me/withdrawal'),
    )
  })

  it('hides the service admin row from a regular user', async () => {
    openMy()
    await findScreen('MY-001')
    expect(screen.queryByText(T.admin)).toBeNull()
  })

  it('shows the service admin row to a super admin', async () => {
    openMy(me({ isSuperAdmin: true }))
    await findScreen('MY-001')
    expect(
      screen.getByRole('link', { name: T.admin }).getAttribute('href'),
    ).toBe('/admin')
  })

  it('logs out only after the confirm modal, then shows the login screen', async () => {
    const { fetchMock } = openMy()
    await findScreen('MY-001')
    const open = () =>
      fireEvent.click(screen.getByRole('button', { name: T.logout }))

    open()
    await screen.findByText(T.logoutTitle)
    fireEvent.click(screen.getByRole('button', { name: COPY.cancel }))
    await waitFor(() => expect(screen.queryByText(T.logoutTitle)).toBeNull())
    expect(callsTo(fetchMock, API_PATHS.logout)).toHaveLength(0)

    open()
    await screen.findByText(T.logoutTitle)
    fireEvent.click(screen.getAllByRole('button', { name: T.logout }).at(-1)!)
    await findScreen('AUTH-001')
    expect(callsTo(fetchMock, API_PATHS.logout)).toHaveLength(1)
  })
})
