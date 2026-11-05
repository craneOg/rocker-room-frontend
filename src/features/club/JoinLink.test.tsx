import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import { readPendingInvite } from '../../shared/lib/pendingInvite'
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
import { AUTH_COPY as AUTH } from '../auth/copy'
import { CLUB_COPY as T } from './copy'

setupDom()

const RESOLVE = '/api/v1/clubs/join-code/resolve'
const user = (onboardingRequired = false) => ({
  id: '1',
  name: '송예림',
  handle: onboardingRequired ? null : 'yerim',
  profileImageUrl: null,
  onboardingRequired,
  isSuperAdmin: false,
})
const preview = {
  club: {
    id: '10',
    name: 'Crane Band',
    description: '밴드 동아리',
    clubType: 'CLUB',
    profileImageUrl: null,
    themeColor: null,
  },
  existingMembershipStatus: null,
  canApply: true,
}

const loggedIn = (extra: Record<string, Route> = {}, onboarding = false) =>
  stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user(onboarding)),
    [`GET ${API_PATHS.memberships}`]: () => json([]),
    [`POST ${RESOLVE}`]: () => json(preview),
    ...extra,
  })

describe('/join/{code} invite link', () => {
  it('logged in: opens CLUB-002 with the code filled and the club previewed', async () => {
    const fetchMock = loggedIn()
    renderApp('/join/abcd234xyz')

    await findScreen('CLUB-002')
    await screen.findByText('Crane Band')
    expect(
      (screen.getByPlaceholderText(T.codePlaceholder) as HTMLInputElement)
        .value,
    ).toBe('ABCD234XYZ')
    expect(
      JSON.parse(String(callsTo(fetchMock, RESOLVE)[0]![1]?.body)),
    ).toEqual({ joinCode: 'ABCD234XYZ' })
    expect(readPendingInvite()).toBeNull()
  })

  it('logged in with a code that can never match: shows the invalid helper without a request', async () => {
    const fetchMock = loggedIn()
    renderApp('/join/short')

    await screen.findByText(`* ${T.codeInvalid}`)
    expect(callsTo(fetchMock, RESOLVE)).toHaveLength(0)
  })

  it('logged in but the code is unknown: shows the invalid helper', async () => {
    loggedIn({ [`POST ${RESOLVE}`]: () => apiError('NOT_FOUND', 404) })
    renderApp('/join/ABCD234XYZ')

    await screen.findByText(`* ${T.codeInvalid}`)
  })

  it('anonymous: shows the login screen and keeps the code', async () => {
    stubApi({ [`GET ${API_PATHS.me}`]: () => apiError('UNAUTHENTICATED', 401) })
    renderApp('/join/ABCD234XYZ')

    await findScreen('AUTH-001')
    await waitFor(() => expect(readPendingInvite()).toBe('ABCD234XYZ'))
  })

  it('after login the landing page returns to the saved invite', async () => {
    sessionStorage.setItem('pendingInviteCode', 'ABCD234XYZ')
    loggedIn()
    const router = renderApp('/')

    await findScreen('CLUB-002')
    expect(router.state.location.pathname).toBe('/join/ABCD234XYZ')
    await screen.findByText('Crane Band')
  })

  it('a new user onboards first, then returns to the invite', async () => {
    let onboarded = false
    sessionStorage.setItem('pendingInviteCode', 'ABCD234XYZ')
    loggedIn({
      [`GET ${API_PATHS.me}`]: () => json(user(!onboarded)),
      [`PATCH ${API_PATHS.me}`]: () => {
        onboarded = true
        return json(user(false))
      },
      [`GET ${API_PATHS.handleAvailability}`]: () => json({ available: true }),
    })
    const router = renderApp('/join/ABCD234XYZ')

    await findScreen('AUTH-002')
    expect(readPendingInvite()).toBe('ABCD234XYZ')
    fireEvent.change(screen.getByPlaceholderText(AUTH.handlePlaceholder), {
      target: { value: 'yerim' },
    })
    const submit = screen.getByRole('button', { name: AUTH.submit })
    await waitFor(() =>
      expect((submit as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.submit(document.querySelector('form') as HTMLFormElement)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/join/ABCD234XYZ'),
    )
    await findScreen('CLUB-002')
  })
})
