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
import { AUTH_COPY as T } from './copy'

setupDom()

const defaultInfo = {
  withdrawnAt: '2026-09-01T12:00:00+09:00',
  expiresAt: '2026-11-30T12:00:00+09:00',
  name: '송예림',
  profileImageUrl: null,
}

const user = {
  id: '1',
  name: '송예림',
  handle: null,
  profileImageUrl: null,
  onboardingRequired: true,
  isSuperAdmin: false,
}

function openRestore(extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json([]),
    [`GET ${API_PATHS.recoveryInfo}`]: () => json(defaultInfo),
    [`POST ${API_PATHS.restore}`]: () => json({ success: true }),
    [`POST ${API_PATHS.startNew}`]: () => json({ success: true }),
    [`POST ${API_PATHS.logout}`]: () => new Response(null, { status: 204 }),
    ...extra,
  })
  return { fetchMock, router: renderApp('/restore') }
}

describe('AUTH-004 RestoreScreen', () => {
  it('renders recovery info with dates, name, and notes', async () => {
    openRestore()
    await findScreen('AUTH-004')
    await screen.findByText(T.restoreTitle)

    expect(screen.getByText(T.restoreTitle)).toBeTruthy()
    expect(
      screen.getByText(
        '2026.09.01에 탈퇴한 계정이에요. 2026.11.30까지는 이전 프로필로 돌아갈 수 있어요.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('송예림')).toBeTruthy()
    expect(screen.getByText(T.restoreInfoTitle)).toBeTruthy()

    for (const note of T.restoreNotes) {
      expect(screen.getByText(note)).toBeTruthy()
    }

    expect(screen.getByRole('button', { name: T.restoreAction })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.startNewAction })).toBeTruthy()
  })

  it('restores previous profile and navigates to /onboarding', async () => {
    const { fetchMock, router } = openRestore()
    await findScreen('AUTH-004')
    await screen.findByText(T.restoreTitle)

    fireEvent.click(screen.getByRole('button', { name: T.restoreAction }))

    await waitFor(() => {
      expect(callsTo(fetchMock, API_PATHS.restore)).toHaveLength(1)
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/onboarding')
    })
    expect(screen.getByText(T.restoreWelcome)).toBeTruthy()
  })

  it('starts new account after confirmation and navigates to /onboarding', async () => {
    const { fetchMock, router } = openRestore()
    await findScreen('AUTH-004')
    await screen.findByText(T.restoreTitle)

    fireEvent.click(screen.getByRole('button', { name: T.startNewAction }))

    // Dialog appears
    expect(await screen.findByText(T.startNewConfirmTitle)).toBeTruthy()
    expect(screen.getByText(T.startNewConfirmDescription)).toBeTruthy()

    // Confirm action
    fireEvent.click(screen.getByRole('button', { name: T.startNewConfirm }))

    await waitFor(() => {
      expect(callsTo(fetchMock, API_PATHS.startNew)).toHaveLength(1)
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/onboarding')
    })
  })

  it('cancels start new account and stays on the screen', async () => {
    const { fetchMock } = openRestore()
    await findScreen('AUTH-004')
    await screen.findByText(T.restoreTitle)

    fireEvent.click(screen.getByRole('button', { name: T.startNewAction }))

    expect(await screen.findByText(T.startNewConfirmTitle)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    await waitFor(() => {
      expect(screen.queryByText(T.startNewConfirmTitle)).toBeNull()
    })
    expect(callsTo(fetchMock, API_PATHS.startNew)).toHaveLength(0)
  })

  it('logs out and navigates to / on close', async () => {
    let loggedOut = false
    const { fetchMock, router } = openRestore({
      [`GET ${API_PATHS.me}`]: () =>
        loggedOut ? apiError('UNAUTHENTICATED', 401) : json(user),
      [`POST ${API_PATHS.logout}`]: () => {
        loggedOut = true
        return new Response(null, { status: 204 })
      },
    })
    await findScreen('AUTH-004')
    await screen.findByText(T.restoreTitle)

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))

    await waitFor(() => {
      expect(callsTo(fetchMock, API_PATHS.logout)).toHaveLength(1)
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('renders error state and retries recovery info fetch', async () => {
    let failed = true
    openRestore({
      [`GET ${API_PATHS.recoveryInfo}`]: () =>
        failed ? apiError('UNKNOWN', 500) : json(defaultInfo),
    })
    expect(await screen.findByText('다시 시도')).toBeTruthy()

    failed = false
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText(T.restoreTitle)).toBeTruthy()
    expect(screen.getByText('송예림')).toBeTruthy()
  })

  it('logs out from error screen and navigates to / on 나가기', async () => {
    let loggedOut = false
    const { fetchMock, router } = openRestore({
      [`GET ${API_PATHS.me}`]: () =>
        loggedOut ? apiError('UNAUTHENTICATED', 401) : json(user),
      [`GET ${API_PATHS.recoveryInfo}`]: () => apiError('UNKNOWN', 500),
      [`POST ${API_PATHS.logout}`]: () => {
        loggedOut = true
        return new Response(null, { status: 204 })
      },
    })
    expect(await screen.findByText('다시 시도')).toBeTruthy()
    expect(screen.getByRole('button', { name: T.leave })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: T.leave }))

    await waitFor(() => {
      expect(callsTo(fetchMock, API_PATHS.logout)).toHaveLength(1)
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('does not navigate or show welcome toast when restore returns success: false', async () => {
    const { fetchMock, router } = openRestore({
      [`POST ${API_PATHS.restore}`]: () => json({ success: false }),
    })
    await findScreen('AUTH-004')
    await screen.findByText(T.restoreTitle)

    fireEvent.click(screen.getByRole('button', { name: T.restoreAction }))

    await waitFor(() => {
      expect(callsTo(fetchMock, API_PATHS.restore)).toHaveLength(1)
    })
    // Wait for the failure toast so the mutation has settled before asserting
    expect(await screen.findByText(COPY.unknownError)).toBeTruthy()
    expect(router.state.location.pathname).toBe('/restore')
    expect(screen.queryByText(T.restoreWelcome)).toBeNull()
  })

  it('does not navigate when start-new returns success: false', async () => {
    const { fetchMock, router } = openRestore({
      [`POST ${API_PATHS.startNew}`]: () => json({ success: false }),
    })
    await findScreen('AUTH-004')
    await screen.findByText(T.restoreTitle)

    fireEvent.click(screen.getByRole('button', { name: T.startNewAction }))
    expect(await screen.findByText(T.startNewConfirmTitle)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: T.startNewConfirm }))

    await waitFor(() => {
      expect(callsTo(fetchMock, API_PATHS.startNew)).toHaveLength(1)
    })
    expect(await screen.findByText(COPY.unknownError)).toBeTruthy()
    expect(router.state.location.pathname).toBe('/restore')
  })
})
