import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import {
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
  type Route,
} from '../../test/harness'
import { CREATE_COPY as T } from './createCopy'

setupDom()

const CLUBS = '/api/v1/clubs'
const NAME_CHECK = '/api/v1/clubs/name-availability'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const created = (joinCode: string | null = 'ABCD234XYZ') => ({
  id: '77',
  name: '크레인',
  description: null,
  clubType: 'CLUB',
  profileImageUrl: null,
  themeColor: null,
  status: 'ACTIVE',
  isSearchable: false,
  createdAt: '',
  updatedAt: '',
  joinCode,
})

function openCreate(extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [] }),
    [`GET ${NAME_CHECK}`]: () => json({ available: true }),
    [`POST ${CLUBS}`]: () => json(created(), 201),
    [`POST ${API_PATHS.profileImage}`]: () =>
      json(
        { imageKey: 'tmp/clubs/k.png', previewUrl: 'https://cdn.test/k.png' },
        201,
      ),
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/new') }
}

const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } })
const nameInput = () => screen.getByPlaceholderText(T.namePlaceholder)
const submit = () =>
  screen.getByRole('button', { name: T.submit }) as HTMLButtonElement
const body = (fetchMock: ReturnType<typeof stubApi>) =>
  JSON.parse(
    String(
      callsTo(fetchMock, CLUBS).find(([, i]) => i?.method === 'POST')![1]!.body,
    ),
  ) as Record<string, unknown>
const png = (name = 'a.png', size = 10) => {
  const file = new File(['x'], name, { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('CLUB-001 ClubCreate', () => {
  it('enables the button only for a name, and confirms availability after the pause', async () => {
    openCreate()
    await findScreen('CLUB-001')
    expect(submit().disabled).toBe(true)

    type(nameInput(), '  크레인  ')
    await screen.findByText(T.nameAvailable)
    expect(submit().disabled).toBe(false)

    type(nameInput(), '   ')
    await screen.findByText(`* ${T.nameEmpty}`)
    expect(submit().disabled).toBe(true)
  })

  it('shows a taken name and keeps the button off', async () => {
    openCreate({ [`GET ${NAME_CHECK}`]: () => json({ available: false }) })
    await findScreen('CLUB-001')
    type(nameInput(), '크레인')
    await screen.findByText(`* ${T.nameTaken}`)
    expect(submit().disabled).toBe(true)
  })

  it('sends the defaults, then shows the invite tools of 6-1', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    const { fetchMock, router } = openCreate()
    await findScreen('CLUB-001')
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    type(nameInput(), ' 크레인 ')
    await screen.findByText(T.nameAvailable)
    fireEvent.click(submit())

    await screen.findByText(T.doneTitle('크레인'))
    expect(body(fetchMock)).toEqual({
      name: '크레인',
      clubType: 'CLUB',
      isSearchable: false,
      issueJoinCode: true,
    })
    expect(screen.getByText('ABCD234XYZ')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: T.copyInvite }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(
      T.inviteText(
        '크레인',
        'ABCD234XYZ',
        `${location.origin}/join/ABCD234XYZ`,
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: T.goClub }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/77'),
    )
  })

  it('sends band type, color upper-cased, photo key and toggles; hides the code without it', async () => {
    const { fetchMock } = openCreate({
      [`POST ${CLUBS}`]: () => json(created(null), 201),
    })
    await findScreen('CLUB-001')
    type(nameInput(), '크레인')
    type(screen.getByPlaceholderText(T.descriptionPlaceholder), '소개')
    type(screen.getByPlaceholderText(T.themeColorPlaceholder), '#1a2b3c')
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(T.typeBand) }))
    fireEvent.click(screen.getByRole('switch', { name: T.useJoinCode }))
    expect(screen.getByText(T.directOnly)).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: T.searchable }))
    expect(screen.queryByText(T.directOnly)).toBeNull()
    fireEvent.change(screen.getByTestId('photo-input'), {
      target: { files: [png()] },
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: T.defaultPhoto })).toBeTruthy(),
    )
    await screen.findByText(T.nameAvailable)
    fireEvent.click(submit())

    await screen.findByText(T.doneTitle('크레인'))
    expect(body(fetchMock)).toEqual({
      name: '크레인',
      description: '소개',
      clubType: 'BAND',
      isSearchable: true,
      issueJoinCode: false,
      profileImageKey: 'tmp/clubs/k.png',
      themeColor: '#1A2B3C',
    })
    expect(screen.queryByRole('button', { name: T.copyLink })).toBeNull()
  })

  it('rejects a bad color and oversized or unsupported photos without calling the server', async () => {
    const { fetchMock } = openCreate()
    await findScreen('CLUB-001')
    type(nameInput(), '크레인')
    type(screen.getByPlaceholderText(T.themeColorPlaceholder), '#12')
    await screen.findByText(`* ${T.themeColorInvalid}`)
    expect(submit().disabled).toBe(true)

    const input = screen.getByTestId('photo-input')
    fireEvent.change(input, {
      target: { files: [png('a.png', 3 * 1024 * 1024)] },
    })
    await screen.findByText(`* ${T.fileTooLarge}`)
    fireEvent.change(input, { target: { files: [png('a.gif')] } })
    await screen.findByText(`* ${T.fileUnsupported}`)
    expect(callsTo(fetchMock, API_PATHS.profileImage)).toHaveLength(0)
  })

  it('shows a name taken at creation time next to the input', async () => {
    openCreate({
      [`POST ${CLUBS}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'DUPLICATE',
              message: 'dup',
              details: [{ field: 'name', reason: 'CLUB_NAME_TAKEN' }],
            },
          }),
          { status: 409 },
        ),
    })
    await findScreen('CLUB-001')
    type(nameInput(), '크레인')
    await screen.findByText(T.nameAvailable)
    fireEvent.click(submit())
    await screen.findByText(`* ${T.nameTaken}`)
    expect(submit().disabled).toBe(true)
  })

  it('drops the photo when its key is gone', async () => {
    openCreate({
      [`POST ${CLUBS}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'NOT_FOUND',
              message: 'x',
              details: [{ reason: 'IMAGE_KEY_NOT_FOUND' }],
            },
          }),
          { status: 404 },
        ),
    })
    await findScreen('CLUB-001')
    type(nameInput(), '크레인')
    fireEvent.change(screen.getByTestId('photo-input'), {
      target: { files: [png()] },
    })
    await screen.findByRole('button', { name: T.defaultPhoto })
    await screen.findByText(T.nameAvailable)
    fireEvent.click(submit())
    await screen.findByText(T.imageExpired)
    expect(screen.queryByRole('button', { name: T.defaultPhoto })).toBeNull()
  })
})
