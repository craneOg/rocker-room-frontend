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
import { CLUB_COPY as T } from './copy'

setupDom()

const RESOLVE = '/api/v1/clubs/join-code/resolve'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const preview = (status: string | null = null) => ({
  club: {
    id: '10',
    name: 'Crane Band',
    description: '밴드 동아리',
    clubType: 'CLUB',
    profileImageUrl: null,
    themeColor: null,
  },
  existingMembershipStatus: status,
  canApply: status === null,
})

function openJoin(extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [] }),
    [`POST ${RESOLVE}`]: () => json(preview()),
    ['POST /api/v1/clubs/10/join-requests']: () => json({}, 201),
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/join') }
}

const codeInput = () => screen.getByPlaceholderText(T.codePlaceholder)
const typeCode = (value: string) =>
  fireEvent.change(codeInput(), { target: { value } })
const confirmButton = () =>
  screen.getByRole('button', { name: T.codeConfirm }) as HTMLButtonElement

describe('CLUB-002 JoinCode', () => {
  it('strips spaces, upper-cases, and enables confirm only for 10 valid characters', async () => {
    openJoin()
    await findScreen('CLUB-002')

    typeCode(' abcd 234xy ')
    expect((codeInput() as HTMLInputElement).value).toBe('ABCD234XY')
    expect(confirmButton().disabled).toBe(true)

    typeCode('abcd234xyz')
    expect((codeInput() as HTMLInputElement).value).toBe('ABCD234XYZ')
    expect(confirmButton().disabled).toBe(false)

    typeCode('ABCD234XY1') // 0, 1, O, I are not in the code alphabet
    expect(confirmButton().disabled).toBe(true)
  })

  it('sends the code in the body and previews the club', async () => {
    const { fetchMock } = openJoin()
    await findScreen('CLUB-002')
    typeCode('abcd234xyz')
    fireEvent.click(confirmButton())

    await screen.findByText('Crane Band')
    const [url, init] = callsTo(fetchMock, RESOLVE)[0]!
    expect(url).not.toContain('ABCD234XYZ')
    expect(JSON.parse(String(init?.body))).toEqual({ joinCode: 'ABCD234XYZ' })
    expect(screen.getByRole('button', { name: T.apply })).toBeTruthy()
  })

  it('shows one helper text for an invalid code, not the 404 page', async () => {
    openJoin({ [`POST ${RESOLVE}`]: () => apiError('NOT_FOUND', 404) })
    await findScreen('CLUB-002')
    typeCode('ABCD234XYZ')
    fireEvent.click(confirmButton())

    await screen.findByText(`* ${T.codeInvalid}`)
    expect(screen.queryByText(COPY.notFoundTitle)).toBeNull()
    expect(document.querySelector('[data-screen-id="CLUB-002"]')).toBeTruthy()
  })

  it('applies with JOIN_CODE, confirms in a modal, then goes to AUTH-003', async () => {
    const { fetchMock, router } = openJoin()
    await findScreen('CLUB-002')
    typeCode('ABCD234XYZ')
    fireEvent.click(confirmButton())
    fireEvent.click(await screen.findByRole('button', { name: T.apply }))

    await screen.findByText(T.applyDoneTitle)
    const [, init] = callsTo(fetchMock, '/api/v1/clubs/10/join-requests')[0]!
    expect(JSON.parse(String(init?.body))).toEqual({
      source: 'JOIN_CODE',
      joinCode: 'ABCD234XYZ',
    })
    fireEvent.click(screen.getByRole('button', { name: T.confirm }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/start'))
  })

  it.each([
    ['ACTIVE', T.alreadyMember],
    ['PENDING', T.alreadyPending],
    ['INVITED', T.hasInvite],
  ])(
    'shows a notice instead of the apply button for %s (C-06)',
    async (status, text) => {
      openJoin({ [`POST ${RESOLVE}`]: () => json(preview(status)) })
      await findScreen('CLUB-002')
      typeCode('ABCD234XYZ')
      fireEvent.click(confirmButton())

      await screen.findByText(text)
      expect(screen.queryByRole('button', { name: T.apply })).toBeNull()
    },
  )
})
