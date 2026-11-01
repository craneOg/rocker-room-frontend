import { ThemeProvider } from '@montage-ui/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { routes } from '../app/routes'
import { SessionProvider } from '../shared/auth/session'
import { createCaches } from '../shared/api/handlers'
import { FeedbackHost } from '../shared/ui/FeedbackHost'

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status })
export const apiError = (code: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message: code } }), { status })

export type Route = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>

/** Stubs fetch with a table of "METHOD path" (query string ignored) -> response. */
export function stubApi(table: Record<string, Route>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = url.split('?')[0] ?? ''
    const route = table[`${init?.method ?? 'GET'} ${path}`]
    return Promise.resolve(
      route ? route(url, init) : apiError('NOT_FOUND', 404),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const callsTo = (fetchMock: ReturnType<typeof stubApi>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => url.split('?')[0] === path)

/** Renders the real routes with the session, dialogs and toasts, under StrictMode. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient: QueryClient = new QueryClient({
    ...createCaches(() => queryClient),
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <FeedbackHost />
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  )
  return router
}

export const findScreen = (id: string) =>
  waitFor(() => {
    if (!document.querySelector(`[data-screen-id="${id}"]`))
      throw new Error(`no screen ${id}`)
  })

export function setupDom() {
  // The first Montage render is slow on a busy machine.
  configure({ asyncUtilTimeout: 4000 })
  beforeEach(() => {
    localStorage.clear()
    // Montage modals need ResizeObserver, which jsdom lacks.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
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
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })
}
