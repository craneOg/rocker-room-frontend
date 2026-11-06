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
import { AUTH_COPY as A } from '../auth/copy'
import { MY_COPY as T } from './copy'

setupDom()

// The success toast and the dialogs animate; jsdom has no Web Animations API.
Object.defineProperty(Element.prototype, 'getAnimations', {
  value: () => [],
  configurable: true,
})

const user = (over = {}) => ({
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  profileImagePublic: true,
  onboardingRequired: false,
  isSuperAdmin: false,
  ...over,
})

const validation = (field: string, message: string) =>
  new Response(
    JSON.stringify({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'x',
        details: [{ field, message }],
      },
    }),
    { status: 400 },
  )
const reasonError = (code: string, status: number, reason: string) =>
  new Response(
    JSON.stringify({
      error: { code, message: code, details: [{ reason }] },
    }),
    { status },
  )

const handleInput = () => screen.getByPlaceholderText(A.handlePlaceholder)
const nameInput = () => screen.getByPlaceholderText(A.namePlaceholder)
const submit = () => screen.getByRole('button', { name: T.save })
const saveDisabled = () => submit().hasAttribute('disabled')
const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } })
const photoInput = () => screen.getByTestId('photo-input')
const pickFile = (file: File) =>
  fireEvent.change(photoInput(), { target: { files: [file] } })
const png = (name = 'a.png', size = 10) => {
  const file = new File(['x'], name, { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

const body = (fetchMock: ReturnType<typeof stubApi>) =>
  JSON.parse(
    String(
      callsTo(fetchMock, API_PATHS.me).find(
        ([, i]) => i?.method === 'PATCH',
      )![1]!.body,
    ),
  ) as Record<string, unknown>

function openProfile(me = user(), extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(me),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [] }),
    [`GET ${API_PATHS.handleAvailability}`]: () => json({ available: true }),
    [`PATCH ${API_PATHS.me}`]: (_, init) => {
      me = { ...me, ...(JSON.parse(String(init?.body)) as object) }
      return json(me)
    },
    [`POST ${API_PATHS.profileImage}`]: () =>
      json(
        {
          imageKey: 'tmp/users/1/k.png',
          previewUrl: 'https://cdn.test/k.png',
          purpose: 'USER_PROFILE',
        },
        201,
      ),
    ...extra,
  })
  return { fetchMock, router: renderApp('/me/profile') }
}

describe('MY-002 MyProfile', () => {
  it('starts filled in with save disabled until something changes', async () => {
    openProfile()
    await findScreen('MY-002')
    expect((nameInput() as HTMLInputElement).value).toBe('송예림')
    expect((handleInput() as HTMLInputElement).value).toBe('yerim')
    expect(saveDisabled()).toBe(true)
    expect(screen.queryByText(T.handleChangeNotice)).toBeNull()
  })

  it('saves only the changed name, toasts and returns to MY-001', async () => {
    const { fetchMock, router } = openProfile()
    await findScreen('MY-002')
    type(nameInput(), '  새 이름  ')
    await waitFor(() => expect(saveDisabled()).toBe(false))
    fireEvent.click(submit())

    await screen.findByText(COPY.saved)
    await waitFor(() => expect(router.state.location.pathname).toBe('/me'))
    expect(body(fetchMock)).toEqual({ name: '새 이름' })
    // The unchanged handle is never checked against API-128.
    expect(callsTo(fetchMock, API_PATHS.handleAvailability)).toHaveLength(0)
  })

  it('rejects an invalid name and keeps save disabled', async () => {
    openProfile()
    await findScreen('MY-002')
    type(nameInput(), '   ')
    await screen.findByText(`* ${A.nameError}`)
    expect(saveDisabled()).toBe(true)
    type(nameInput(), 'a'.repeat(51))
    await waitFor(() => expect(saveDisabled()).toBe(true))
  })

  it('checks a changed handle, shows the notice, and sends it after the check', async () => {
    const { fetchMock } = openProfile()
    await findScreen('MY-002')
    type(handleInput(), 'bad')
    await screen.findByText(`* ${A.handleError}`)
    expect(saveDisabled()).toBe(true)

    type(handleInput(), 'yerim_2')
    expect(await screen.findByText(A.handleAvailable)).toBeTruthy()
    expect(screen.getByText(T.handleChangeNotice)).toBeTruthy()
    fireEvent.click(submit())

    await waitFor(() => expect(body(fetchMock)).toEqual({ handle: 'yerim_2' }))
  })

  it('keeps save disabled for a taken handle', async () => {
    openProfile(user(), {
      [`GET ${API_PATHS.handleAvailability}`]: () => json({ available: false }),
    })
    await findScreen('MY-002')
    type(handleInput(), 'taken_id')
    await screen.findByText(`* ${A.handleTaken}`)
    expect(saveDisabled()).toBe(true)
  })

  it('shows the duplicate text and stays when the server answers 409 HANDLE_TAKEN', async () => {
    const { router } = openProfile(user(), {
      [`PATCH ${API_PATHS.me}`]: () =>
        reasonError('DUPLICATE', 409, 'HANDLE_TAKEN'),
    })
    await findScreen('MY-002')
    type(handleInput(), 'yerim_2')
    await screen.findByText(A.handleAvailable)
    fireEvent.click(submit())

    await screen.findByText(`* ${A.handleTaken}`)
    expect(router.state.location.pathname).toBe('/me/profile')
    // Editing the field clears the server answer.
    type(handleInput(), 'yerim_3')
    await waitFor(() =>
      expect(screen.queryByText(`* ${A.handleTaken}`)).toBeNull(),
    )
  })

  it('shows a server field error next to the field only for the submitted value', async () => {
    openProfile(user(), {
      [`PATCH ${API_PATHS.me}`]: () => validation('name', 'server says no'),
    })
    await findScreen('MY-002')
    type(nameInput(), '새 이름')
    await waitFor(() => expect(saveDisabled()).toBe(false))
    fireEvent.click(submit())
    expect(await screen.findByText('* server says no')).toBeTruthy()
    type(nameInput(), '다른 이름')
    await waitFor(() =>
      expect(screen.queryByText('* server says no')).toBeNull(),
    )
  })

  it('uploads a picked photo as multipart and sends its key on save', async () => {
    const { fetchMock } = openProfile()
    await findScreen('MY-002')
    pickFile(png())

    await waitFor(() =>
      expect(
        document.querySelector('.profile-photo img')?.getAttribute('src'),
      ).toBe('https://cdn.test/k.png'),
    )
    const [, init] = callsTo(fetchMock, API_PATHS.profileImage)[0]!
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init!.body as FormData).get('file')).toBeInstanceOf(File)
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)

    await waitFor(() => expect(saveDisabled()).toBe(false))
    fireEvent.click(submit())
    await waitFor(() =>
      expect(body(fetchMock)).toEqual({ profileImageUrl: 'tmp/users/1/k.png' }),
    )
  })

  it('refuses an oversized file with the modal and uploads nothing', async () => {
    const { fetchMock } = openProfile()
    await findScreen('MY-002')
    pickFile(png('big.png', 2 * 1024 * 1024 + 1))
    await screen.findByText(T.fileTooLarge)
    fireEvent.click(screen.getByRole('button', { name: COPY.close }))
    await waitFor(() => expect(screen.queryByText(T.fileTooLarge)).toBeNull())
    expect(callsTo(fetchMock, API_PATHS.profileImage)).toHaveLength(0)
    expect(saveDisabled()).toBe(true)
  })

  it('refuses an unsupported extension with the modal and uploads nothing', async () => {
    const { fetchMock } = openProfile()
    await findScreen('MY-002')
    pickFile(png('anim.gif'))
    await screen.findByText(T.unsupported)
    expect(callsTo(fetchMock, API_PATHS.profileImage)).toHaveLength(0)
  })

  it('maps a server file rejection to the matching modal and keeps the old photo', async () => {
    openProfile(user({ profileImageUrl: 'https://cdn.test/old.png' }), {
      [`POST ${API_PATHS.profileImage}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'x',
              details: [{ field: 'file', reason: 'INVALID_IMAGE' }],
            },
          }),
          { status: 400 },
        ),
    })
    await findScreen('MY-002')
    pickFile(png())
    await screen.findByText(T.unsupported)
    fireEvent.click(screen.getByRole('button', { name: COPY.close }))
    await waitFor(() => expect(screen.queryByText(T.unsupported)).toBeNull())
    expect(
      document.querySelector('.profile-photo img')?.getAttribute('src'),
    ).toBe('https://cdn.test/old.png')
    expect(saveDisabled()).toBe(true)
  })

  it('keeps the old photo and toasts when the upload itself fails', async () => {
    openProfile(user(), {
      [`POST ${API_PATHS.profileImage}`]: () => apiError('UNKNOWN', 500),
    })
    await findScreen('MY-002')
    pickFile(png())
    await screen.findByText(COPY.unknownError)
    expect(saveDisabled()).toBe(true)
  })

  it('switches back to the default image and sends profileImageUrl: null', async () => {
    const { fetchMock } = openProfile(
      user({ profileImageUrl: 'https://cdn.test/old.png' }),
    )
    await findScreen('MY-002')
    fireEvent.click(screen.getByRole('button', { name: T.defaultPhoto }))
    expect(document.querySelector('.profile-photo img')).toBeNull()
    expect(screen.queryByRole('button', { name: T.defaultPhoto })).toBeNull()
    fireEvent.click(submit())
    await waitFor(() =>
      expect(body(fetchMock)).toEqual({ profileImageUrl: null }),
    )
  })

  it('sends profileImagePublic when the switch is turned off', async () => {
    const { fetchMock } = openProfile()
    await findScreen('MY-002')
    const toggle = screen.getByRole('switch', { name: T.showPhoto })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    await waitFor(() => expect(saveDisabled()).toBe(false))
    fireEvent.click(submit())
    await waitFor(() =>
      expect(body(fetchMock)).toEqual({ profileImagePublic: false }),
    )
  })

  it('starts the switch off when the profile is private', async () => {
    openProfile(user({ profileImagePublic: false }))
    await findScreen('MY-002')
    expect(
      screen
        .getByRole('switch', { name: T.showPhoto })
        .getAttribute('aria-checked'),
    ).toBe('false')
  })

  it('drops an expired photo key and asks for a new upload (no not-found page)', async () => {
    openProfile(user(), {
      [`PATCH ${API_PATHS.me}`]: () =>
        reasonError('NOT_FOUND', 404, 'IMAGE_KEY_NOT_FOUND'),
    })
    await findScreen('MY-002')
    pickFile(png())
    await waitFor(() => expect(saveDisabled()).toBe(false))
    fireEvent.click(submit())

    await screen.findByText(T.imageExpired)
    expect(screen.queryByText(COPY.notFoundTitle)).toBeNull()
    await waitFor(() => expect(saveDisabled()).toBe(true))
  })

  it('is reached from MY-001 via 프로필 수정', async () => {
    const { router } = openProfile()
    await router.navigate('/me')
    await findScreen('MY-001')
    fireEvent.click(screen.getByRole('button', { name: T.editProfile }))
    await findScreen('MY-002')
    expect(router.state.location.pathname).toBe('/me/profile')
  })
})
