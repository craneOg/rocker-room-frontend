import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
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

const user = (over = {}) => ({
  id: '1',
  name: '명혜성',
  handle: null,
  profileImageUrl: null,
  onboardingRequired: true,
  isSuperAdmin: false,
  ...over,
})

setupDom()

const handleInput = () => screen.getByPlaceholderText(T.handlePlaceholder)
const submit = () => screen.getByRole('button', { name: T.submit })
const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } })

function openOnboarding(extra: Record<string, Route> = {}) {
  let me = user()
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(me),
    [`GET ${API_PATHS.memberships}`]: () => json([]),
    [`PATCH ${API_PATHS.me}`]: (_, init) => {
      const body = JSON.parse(String(init?.body)) as object
      me = user({ ...body, onboardingRequired: false })
      return json(me)
    },
    ...extra,
  })
  return { fetchMock, router: renderApp('/onboarding') }
}

describe('AUTH-002', () => {
  it('saves once when submitted again while saving', async () => {
    let finish = (_: Response) => {}
    const { fetchMock } = openOnboarding({
      [`GET ${API_PATHS.handleAvailability}`]: () => json({ available: true }),
      [`PATCH ${API_PATHS.me}`]: () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    })
    await findScreen('AUTH-002')
    type(handleInput(), 'rocker_01')
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(false),
    )
    const form = document.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    await waitFor(() =>
      expect(callsTo(fetchMock, API_PATHS.me).length).toBeGreaterThan(1),
    )
    fireEvent.submit(form)
    await new Promise((r) => setTimeout(r))
    const patches = callsTo(fetchMock, API_PATHS.me).filter(
      ([, init]) => init?.method === 'PATCH',
    )
    expect(patches).toHaveLength(1)
    finish(json(user({ handle: 'rocker_01', onboardingRequired: false })))
  })

  it('clears a server field error once the input changes', async () => {
    openOnboarding({
      [`GET ${API_PATHS.handleAvailability}`]: () => json({ available: true }),
      [`PATCH ${API_PATHS.me}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'x',
              details: [{ field: 'handle', message: 'server says no' }],
            },
          }),
          { status: 400 },
        ),
    })
    await findScreen('AUTH-002')
    type(handleInput(), 'rocker_01')
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(submit())
    expect(await screen.findByText('* server says no')).toBeTruthy()
    type(handleInput(), 'rocker_02')
    await waitFor(() =>
      expect(screen.queryByText('* server says no')).toBeNull(),
    )
  })

  it('prefills the name and shows the first letter in the photo placeholder', async () => {
    openOnboarding()
    await findScreen('AUTH-002')
    expect(screen.getByDisplayValue('명혜성')).toBeTruthy()
    expect(screen.getByRole('img', { name: T.profilePhoto }).textContent).toBe(
      '명',
    )
  })

  it('validates the name (1-50) and the handle format', async () => {
    const { fetchMock } = openOnboarding()
    await findScreen('AUTH-002')

    const name = screen.getByDisplayValue('명혜성')
    type(name, '')
    expect(await screen.findByText(`* ${T.nameError}`)).toBeTruthy()
    type(name, 'a'.repeat(51))
    expect(screen.getByText(`* ${T.nameError}`)).toBeTruthy()
    type(name, '명혜성')
    expect(screen.queryByText(`* ${T.nameError}`)).toBeNull()

    for (const bad of [
      'abcd',
      'Abcde',
      'ab cde',
      'a'.repeat(31),
      '한글입니다다',
    ]) {
      type(handleInput(), bad)
      expect(screen.getByText(`* ${T.handleError}`)).toBeTruthy()
      expect(submit().hasAttribute('disabled')).toBe(true)
    }
    // Invalid formats never reach the availability API.
    expect(callsTo(fetchMock, API_PATHS.handleAvailability)).toHaveLength(0)
  })

  it('checks availability, then enables 시작하기 and submits {name, handle}', async () => {
    const { fetchMock, router } = openOnboarding({
      [`GET ${API_PATHS.handleAvailability}`]: () => json({ available: true }),
    })
    await findScreen('AUTH-002')
    type(handleInput(), 'rocker_01')
    expect(screen.getByText(T.handleChecking)).toBeTruthy()
    expect(submit().hasAttribute('disabled')).toBe(true)
    expect(await screen.findByText(T.handleAvailable)).toBeTruthy()
    expect(submit().hasAttribute('disabled')).toBe(false)

    fireEvent.click(submit())
    await findScreen('AUTH-003')
    expect(router.state.location.pathname).toBe('/start')
    const [, init] = callsTo(fetchMock, API_PATHS.me).find(
      ([, i]) => i?.method === 'PATCH',
    )!
    expect(JSON.parse(String(init?.body))).toEqual({
      name: '명혜성',
      handle: 'rocker_01',
    })
  })

  it('keeps 시작하기 disabled for a taken handle', async () => {
    openOnboarding({
      [`GET ${API_PATHS.handleAvailability}`]: () => json({ available: false }),
    })
    await findScreen('AUTH-002')
    type(handleInput(), 'admin')
    expect(await screen.findByText(`* ${T.handleTaken}`)).toBeTruthy()
    expect(submit().hasAttribute('disabled')).toBe(true)
  })

  it('ignores a stale availability response for an older input', async () => {
    const pending: Record<string, (r: Response) => void> = {}
    openOnboarding({
      [`GET ${API_PATHS.handleAvailability}`]: (url) =>
        new Promise<Response>((resolve) => {
          const handle = new URL(url, 'http://x').searchParams.get('handle')!
          pending[handle] = resolve
        }) as unknown as Response,
    })
    await findScreen('AUTH-002')

    type(handleInput(), 'abcde')
    await waitFor(() => expect(pending.abcde).toBeTruthy())
    type(handleInput(), 'abcdef')
    await waitFor(() => expect(pending.abcdef).toBeTruthy())

    pending.abcdef!(json({ available: true }))
    expect(await screen.findByText(T.handleAvailable)).toBeTruthy()
    // The older request now answers "taken": it must not replace the current result.
    pending.abcde!(json({ available: false }))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText(T.handleAvailable)).toBeTruthy()
    expect(screen.queryByText(`* ${T.handleTaken}`)).toBeNull()
    expect(submit().hasAttribute('disabled')).toBe(false)
  })

  it('asks before leaving, then logs out and returns to /', async () => {
    let loggedOut = false
    const { fetchMock, router } = openOnboarding({
      [`GET ${API_PATHS.me}`]: () =>
        loggedOut ? apiError('UNAUTHENTICATED', 401) : json(user()),
      [`POST ${API_PATHS.logout}`]: () => {
        loggedOut = true
        return new Response(null, { status: 204 })
      },
    })
    await findScreen('AUTH-002')

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(await screen.findByText(T.leaveTitle)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: T.keepWriting }))
    await waitFor(() => expect(screen.queryByText(T.leaveTitle)).toBeNull())
    expect(callsTo(fetchMock, API_PATHS.logout)).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    fireEvent.click(await screen.findByRole('button', { name: T.leave }))
    await findScreen('AUTH-001')
    expect(router.state.location.pathname).toBe('/')
    expect(callsTo(fetchMock, API_PATHS.logout)).toHaveLength(1)
  })
})
