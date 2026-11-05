import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
} from '../../test/harness'
import { COPY } from '../../shared/ui/copy'
import { startKakaoLogin } from './api'
import { AUTH_COPY as T } from './copy'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  startKakaoLogin: vi.fn(),
}))

const me = (over = {}) => ({
  id: '1',
  name: '명혜성',
  handle: 'hyeseong',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
  ...over,
})

/** Anonymous until the exchange succeeds, like the real cookie flow. */
function loginApi(
  opts: { restore?: boolean; me?: object; memberships?: () => Response } = {},
) {
  let signedIn = false
  return stubApi({
    [`GET ${API_PATHS.me}`]: () =>
      signedIn ? json(opts.me ?? me()) : apiError('UNAUTHENTICATED', 401),
    [`GET ${API_PATHS.memberships}`]: opts.memberships ?? (() => json([])),
    [`GET ${API_PATHS.recoveryInfo}`]: () =>
      json({
        withdrawnAt: '2026-09-01T12:00:00+09:00',
        expiresAt: '2026-11-30T12:00:00+09:00',
        name: '송예림',
        profileImageUrl: null,
      }),
    [`POST ${API_PATHS.exchange}`]: () => {
      signedIn = true
      return json({ restoreRequired: opts.restore ?? false })
    },
  })
}

setupDom()
beforeEach(() => vi.mocked(startKakaoLogin).mockClear())

describe('/auth/complete', () => {
  it('waits for the page-load session check before exchanging', async () => {
    let signedIn = false
    let settleFirstCheck: (() => void) | undefined
    const fetchMock = stubApi({
      [`GET ${API_PATHS.me}`]: () => {
        if (signedIn) return json(me())
        if (settleFirstCheck) return apiError('UNAUTHENTICATED', 401)
        return new Promise((resolve) => {
          settleFirstCheck = () => resolve(apiError('UNAUTHENTICATED', 401))
        })
      },
      [`POST ${API_PATHS.tokenRenewal}`]: () =>
        apiError('UNAUTHENTICATED', 401),
      [`GET ${API_PATHS.memberships}`]: () => json([]),
      [`POST ${API_PATHS.exchange}`]: () => {
        signedIn = true
        return json({ restoreRequired: false })
      },
    })
    renderApp('/auth/complete')
    await waitFor(() =>
      expect(callsTo(fetchMock, API_PATHS.me)).toHaveLength(1),
    )
    // The check's renewal could fail after the exchange and fail a good login.
    expect(callsTo(fetchMock, API_PATHS.exchange)).toHaveLength(0)
    settleFirstCheck?.()
    await findScreen('AUTH-003')
    expect(callsTo(fetchMock, API_PATHS.exchange)).toHaveLength(1)
  })

  it('exchanges exactly once under StrictMode and lands on /start', async () => {
    const fetchMock = loginApi()
    const router = renderApp('/auth/complete')
    expect(await screen.findByText(T.loggingIn)).toBeTruthy()
    await findScreen('AUTH-003')
    expect(router.state.location.pathname).toBe('/start')
    expect(callsTo(fetchMock, API_PATHS.exchange)).toHaveLength(1)
  })

  it('sends a pending restore to /restore', async () => {
    loginApi({ restore: true })
    const router = renderApp('/auth/complete')
    await findScreen('AUTH-004')
    expect(router.state.location.pathname).toBe('/restore')
  })

  it('shows the restore choice without the main menu, even if memberships fail', async () => {
    // The global error toast animates; jsdom has no Web Animations API.
    Object.defineProperty(Element.prototype, 'getAnimations', {
      value: () => [],
      configurable: true,
    })
    loginApi({ restore: true, memberships: () => apiError('UNKNOWN', 500) })
    renderApp('/auth/complete')
    expect(await screen.findByText(T.restoreTitle)).toBeTruthy()
    // Let the failed memberships query settle: it must not swap the screen for the error view.
    await waitFor(() =>
      expect(screen.queryByText(COPY.unknownError)).toBeNull(),
    )
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.getByText(T.restoreTitle)).toBeTruthy()
    expect(screen.queryByLabelText('주 메뉴')).toBeNull()
  })

  it('hides the main menu on /restore for a signed-in account', async () => {
    loginApi({ restore: true })
    renderApp('/auth/complete')
    expect(await screen.findByText(T.restoreTitle)).toBeTruthy()
    expect(screen.queryByLabelText('주 메뉴')).toBeNull()
  })

  it('refreshes the session after the exchange before opening /restore', async () => {
    const fetchMock = loginApi({ restore: true })
    renderApp('/auth/complete')
    await findScreen('AUTH-004')
    const urls = fetchMock.mock.calls.map(([url]) => url.split('?')[0])
    const exchanged = urls.indexOf(API_PATHS.exchange)
    expect(urls.slice(exchanged + 1)).toContain(API_PATHS.me)
  })

  it('sends a first login to /onboarding', async () => {
    loginApi({ me: me({ onboardingRequired: true, handle: null }) })
    const router = renderApp('/auth/complete')
    await findScreen('AUTH-002')
    expect(router.state.location.pathname).toBe('/onboarding')
  })

  it('does not renew the token when the exchange is rejected, and shows 2-2', async () => {
    const fetchMock = stubApi({
      // /me answers 500 so only the exchange could trigger a renewal.
      [`GET ${API_PATHS.me}`]: () => apiError('UNKNOWN', 500),
      [`POST ${API_PATHS.exchange}`]: () =>
        apiError('LOGIN_EXCHANGE_INVALID', 401),
    })
    const router = renderApp('/auth/complete')
    expect(await screen.findByText(T.loginFailedTitle)).toBeTruthy()
    expect(callsTo(fetchMock, API_PATHS.tokenRenewal)).toHaveLength(0)
    expect(callsTo(fetchMock, API_PATHS.exchange)).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows the cancelled message for the error query param, without exchanging', async () => {
    const fetchMock = loginApi()
    renderApp('/auth/complete?error=access_denied')
    expect(await screen.findByText(T.loginCancelled)).toBeTruthy()
    expect(callsTo(fetchMock, API_PATHS.exchange)).toHaveLength(0)
  })

  it('shows the network message when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.endsWith(API_PATHS.exchange)
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve(apiError('UNAUTHENTICATED', 401)),
      ),
    )
    renderApp('/auth/complete')
    expect(await screen.findByText(T.loginNetwork)).toBeTruthy()
  })

  it('shows the account message for 403 and restarts Kakao login on 다시 시도', async () => {
    stubApi({
      [`GET ${API_PATHS.me}`]: () => apiError('UNAUTHENTICATED', 401),
      [`POST ${API_PATHS.exchange}`]: () => apiError('FORBIDDEN', 403),
    })
    renderApp('/auth/complete')
    expect(await screen.findByText(T.loginAccount)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: T.retry }))
    await waitFor(() => expect(startKakaoLogin).toHaveBeenCalledTimes(1))
  })
})
