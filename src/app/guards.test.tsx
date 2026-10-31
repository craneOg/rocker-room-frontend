import { ThemeProvider } from '@montage-ui/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PATHS } from '../shared/api/assumptions'
import { SessionProvider } from '../shared/auth/session'
import { routes } from './routes'

type Me = { id: string; onboardingRequired: boolean; isSuperAdmin: boolean }
type Scenario = {
  me?: Me
  memberships?: {
    clubId: string
    role: 'CLUB_ADMIN' | 'MEMBER'
    status: string
  }[]
}

function mockApi({ me, memberships = [] }: Scenario) {
  const ok = (data: unknown) =>
    new Response(JSON.stringify({ data }), { status: 200 })
  const unauthenticated = () =>
    new Response(
      JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'x' } }),
      {
        status: 401,
      },
    )
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith(API_PATHS.me))
        return Promise.resolve(me ? ok(me) : unauthenticated())
      if (url.endsWith(API_PATHS.memberships))
        return Promise.resolve(ok(memberships))
      return Promise.resolve(unauthenticated())
    }),
  )
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return router
}

async function findScreen(id: string) {
  await waitFor(() => {
    if (!document.querySelector(`[data-screen-id="${id}"]`))
      throw new Error(`no screen ${id}`)
  })
  return true
}

const user: Me = { id: '1', onboardingRequired: false, isSuperAdmin: false }
const active = (
  clubId: string,
  role: 'CLUB_ADMIN' | 'MEMBER' = 'MEMBER',
  status = 'ACTIVE',
) => ({
  clubId,
  role,
  status,
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
})
beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('route guards', () => {
  it('shows the login placeholder to anonymous users at /', async () => {
    mockApi({})
    renderAt('/')
    expect(await findScreen('AUTH-001')).toBeTruthy()
  })

  it('sends anonymous users away from protected routes', async () => {
    mockApi({})
    const router = renderAt('/calendar')
    await findScreen('AUTH-001')
    expect(router.state.location.pathname).toBe('/')
  })

  it('sends users who have not finished onboarding to /onboarding', async () => {
    mockApi({ me: { ...user, onboardingRequired: true } })
    const router = renderAt('/calendar')
    expect(await findScreen('AUTH-002')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/onboarding')
  })

  it('sends a signed-in user without a club to /start', async () => {
    mockApi({ me: user })
    const router = renderAt('/')
    expect(await findScreen('AUTH-003')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/start')
  })

  it('opens the last club home from /', async () => {
    mockApi({ me: user, memberships: [active('5')] })
    localStorage.setItem('lastClubId', '5')
    const router = renderAt('/')
    expect(await findScreen('HOME-001')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/clubs/5')
  })

  it('stores the last club ID when a club screen opens', async () => {
    mockApi({ me: user, memberships: [active('9')] })
    renderAt('/clubs/9')
    await findScreen('HOME-001')
    expect(localStorage.getItem('lastClubId')).toBe('9')
  })

  it('blocks clubs the user does not belong to', async () => {
    mockApi({ me: user, memberships: [active('1')] })
    const router = renderAt('/clubs/2/performances')
    await findScreen('AUTH-003')
    expect(router.state.location.pathname).toBe('/start')
  })

  it('keeps pending applicants out of the club', async () => {
    mockApi({ me: user, memberships: [active('1', 'MEMBER', 'PENDING')] })
    const router = renderAt('/clubs/1')
    await findScreen('AUTH-003')
    expect(router.state.location.pathname).toBe('/start')
  })

  it('redirects non-officers from officer screens to the club home', async () => {
    mockApi({ me: user, memberships: [active('1')] })
    const router = renderAt('/clubs/1/join-requests')
    await findScreen('HOME-001')
    expect(router.state.location.pathname).toBe('/clubs/1')
  })

  it('lets officers into officer screens', async () => {
    mockApi({ me: user, memberships: [active('1', 'CLUB_ADMIN')] })
    renderAt('/clubs/1/join-requests')
    expect(await findScreen('CLUB-103')).toBeTruthy()
  })

  it('keeps /admin for Super Admin only', async () => {
    mockApi({ me: user })
    const router = renderAt('/admin/users')
    await findScreen('AUTH-003')
    expect(router.state.location.pathname).toBe('/start')
    cleanup()

    mockApi({ me: { ...user, isSuperAdmin: true } })
    renderAt('/admin/users')
    expect(await findScreen('/admin/...')).toBeTruthy()
  })
})
