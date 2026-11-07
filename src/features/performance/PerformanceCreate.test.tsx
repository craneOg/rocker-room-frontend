import { act, fireEvent, screen, waitFor } from '@testing-library/react'
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
import { FORM_COPY as T } from './formCopy'

setupDom()

// Toasts and dialogs animate; jsdom has no Web Animations API.
Object.defineProperty(Element.prototype, 'getAnimations', {
  value: () => [],
  configurable: true,
})

const BASE = '/api/v1/clubs/10/performances'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = (clubType: string) => ({
  id: 'm9',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType,
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'CLUB_ADMIN',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
})
const created = { id: '101', clubId: '10', status: 'DRAFT', version: '1' }

function open(clubType = 'BAND', extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () =>
      json({ items: [membership(clubType)] }),
    [`POST ${BASE}`]: () => json(created, 201),
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/10/performances/new') }
}

const titleInput = () => screen.getByPlaceholderText(T.titlePlaceholder)
const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } })
const button = (name: string) => screen.getByRole('button', { name })
const nextButton = () => button(T.next)
const posted = (fetchMock: ReturnType<typeof stubApi>) =>
  JSON.parse(
    String(
      callsTo(fetchMock, BASE).find(([, i]) => i?.method === 'POST')![1]!.body,
    ),
  ) as Record<string, unknown>

async function fillBasic() {
  await findScreen('PERF-002')
  type(titleInput(), '  가을 정기공연  ')
  type(screen.getByPlaceholderText(T.locationPlaceholder), '소극장')
  // A date typed first is dropped once the date is marked undecided.
  type(screen.getByLabelText(T.labelDate), '2026-11-15')
  fireEvent.click(screen.getByLabelText(T.dateUndecided))
  await waitFor(() => expect(nextButton().hasAttribute('disabled')).toBe(false))
  fireEvent.click(nextButton())
}

describe('PERF-002 PerformanceCreate', () => {
  it('keeps next disabled until the name is valid', async () => {
    open()
    await findScreen('PERF-002')
    expect(nextButton().hasAttribute('disabled')).toBe(true)
    type(titleInput(), '   ')
    await screen.findByText(`* ${T.titleError}`)
    expect(nextButton().hasAttribute('disabled')).toBe(true)
    type(titleInput(), '가을')
    await waitFor(() =>
      expect(nextButton().hasAttribute('disabled')).toBe(false),
    )
  })

  it('offers the single-band card first and selected for a band club only', async () => {
    open('BAND')
    await fillBasic()
    const radios = await screen.findAllByRole('radio')
    expect(radios).toHaveLength(6)
    expect((radios[0] as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(T.presetNames.BAND)).toBeTruthy()
  })

  it('hides the single-band card for a club-type club', async () => {
    open('CLUB')
    await fillBasic()
    await screen.findByText(T.presetNames.TEAM_FIRST)
    expect(screen.queryByText(T.presetNames.BAND)).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })

  it('creates with a fixed preset (no policy), toasts and opens the detail', async () => {
    const { fetchMock, router } = open('BAND')
    await fillBasic()
    fireEvent.click(await screen.findByText(T.presetNames.SONG_FIRST))
    fireEvent.click(nextButton())
    await screen.findByText(T.draftNotice)
    fireEvent.click(button(T.create))

    await screen.findByText(T.created)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/performances/101'),
    )
    expect(posted(fetchMock)).toEqual({
      title: '가을 정기공연',
      performDate: null,
      location: '소극장',
      preset: 'SONG_FIRST',
    })
  })

  it('shows the band notice with the club name on the confirm step', async () => {
    open('BAND')
    await fillBasic()
    fireEvent.click(nextButton())
    await screen.findByText(T.bandNotice('Crane Band'))
  })

  it('sends one request while a save is pending', async () => {
    let release: () => void = () => {}
    const { fetchMock } = open('BAND', {
      [`POST ${BASE}`]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(created, 201))
        }) as unknown as Response,
    })
    await fillBasic()
    fireEvent.click(nextButton())
    const create = await screen.findByRole('button', { name: T.create })
    fireEvent.click(create)
    fireEvent.click(create)
    fireEvent.submit(create.closest('form')!)
    await waitFor(() => expect(callsTo(fetchMock, BASE)).toHaveLength(1))
    release()
    await screen.findByText(T.created)
    expect(callsTo(fetchMock, BASE)).toHaveLength(1)
  })

  it('shows a server field error by the input on step 1', async () => {
    open('BAND', {
      [`POST ${BASE}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'x',
              details: [{ field: 'title', message: '이미 있는 이름이에요' }],
            },
          }),
          { status: 400 },
        ),
    })
    await fillBasic()
    fireEvent.click(nextButton())
    fireEvent.click(await screen.findByRole('button', { name: T.create }))
    await screen.findByText('* 이미 있는 이름이에요')
    expect(screen.getByPlaceholderText(T.titlePlaceholder)).toBeTruthy()
  })

  it('lets the global handler show other errors without leaving the confirm step', async () => {
    open('BAND', { [`POST ${BASE}`]: () => apiError('RULE_VIOLATION', 422) })
    await fillBasic()
    fireEvent.click(nextButton())
    fireEvent.click(await screen.findByRole('button', { name: T.create }))
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))
    expect(screen.getByRole('button', { name: T.create })).toBeTruthy()
  })

  it('builds the full policy from the custom questions', async () => {
    const { fetchMock } = open('CLUB')
    await fillBasic()
    fireEvent.click(await screen.findByText(T.presetNames.CUSTOM))
    fireEvent.click(nextButton())

    const pick = async (label: string) =>
      fireEvent.click(await screen.findByRole('button', { name: label }))
    await screen.findByText(T.questionCount(1, 8))
    await pick('부원이 신청하고 임원이 승인해요')
    await pick('임원이 만들어요')
    await pick('임원이 직접 정해요') // candidates: none -> limit question skipped
    await pick('물어봐요')
    await pick('안 해요') // vote: none -> max question skipped
    await pick('안 받아요')
    await pick('없어요')
    await pick(T.proceed)
    fireEvent.click(await screen.findByRole('button', { name: T.create }))

    await screen.findByText(T.created)
    expect(posted(fetchMock)).toMatchObject({
      preset: 'CUSTOM',
      policy: {
        applicationState: 'OPEN',
        teamApplicationState: 'DISABLED',
        candidateState: 'DISABLED',
        playabilityState: 'OPEN',
        voteState: 'DISABLED',
        availabilityState: 'DISABLED',
        maxSongsPerMember: null,
      },
    })
  })

  it('goes back to a custom answer when its bubble is tapped', async () => {
    open('CLUB')
    await fillBasic()
    fireEvent.click(await screen.findByText(T.presetNames.CUSTOM))
    fireEvent.click(nextButton())
    fireEvent.click(
      await screen.findByRole('button', { name: '임원이 직접 정해요' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: '임원이 만들어요' }),
    )
    // The answered bubble is a button; tapping it reopens the choices.
    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: '임원이 직접 정해요' })
      )[0]!,
    )
    await screen.findByRole('button', {
      name: '부원이 신청하고 임원이 승인해요',
    })
  })

  describe('0-1 leave confirmation', () => {
    it('does not ask while nothing is typed', async () => {
      const { router } = open()
      await findScreen('PERF-002')
      // Let the blocker register (passive effects) before leaving.
      await act(async () => {})
      await router.navigate('/clubs/10')
      // No waiting: a blocked navigation would still be on the form right after it.
      expect(router.state.location.pathname).toBe('/clubs/10')
      expect(screen.queryByText(T.leaveTitle)).toBeNull()
    })

    it('asks once something is typed; keep writing stays, leave goes', async () => {
      const { router } = open()
      await findScreen('PERF-002')
      type(titleInput(), '가을')
      void router.navigate('/clubs/10')
      await screen.findByText(T.leaveTitle)
      expect(screen.getByText(T.leaveDescription)).toBeTruthy()
      fireEvent.click(button(T.keepWriting))
      await waitFor(() => expect(screen.queryByText(T.leaveTitle)).toBeNull())
      expect(router.state.location.pathname).toBe('/clubs/10/performances/new')

      void router.navigate('/clubs/10')
      fireEvent.click(await screen.findByRole('button', { name: T.leave }))
      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/clubs/10'),
      )
    })
  })
})
