import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
import { SETTINGS_COPY as T } from './settingsCopy'

setupDom()

const CODE = '/api/v1/clubs/10/join-code'
const REGENERATE = `${CODE}/regenerate`
const CLUB = '/api/v1/clubs/10'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = {
  id: '21',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'CLUB_ADMIN',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
}

function openScreen(extra: Record<string, Route> = {}) {
  // The global toast animates; jsdom has no Web Animations API.
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  const writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [membership] }),
    [`GET ${CODE}`]: () => json({ joinCode: 'ABCD234XYZ' }),
    [`GET ${CLUB}`]: () => json({ id: '10', isSearchable: true }),
    ...extra,
  })
  return { fetchMock, writeText, router: renderApp('/clubs/10/join-code') }
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))
const confirmInDialog = (name: string) =>
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) as HTMLElement)

describe('CLUB-106 JoinCodeSettings', () => {
  it('shows the code and copies the link, the code and the invite text', async () => {
    const { writeText } = openScreen()
    await findScreen('CLUB-106')
    await screen.findByText('ABCD234XYZ')
    const link = `${location.origin}/join/ABCD234XYZ`

    click(T.copyLink)
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(link))
    click(T.copyCode)
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith('ABCD234XYZ'),
    )
    click(T.copyInvite)
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        T.inviteText('Crane Band', 'ABCD234XYZ', link),
      ),
    )
    await screen.findByText(T.copied)
  })

  it('re-issues the code only after the confirm modal', async () => {
    const { fetchMock } = openScreen({
      [`POST ${REGENERATE}`]: () => json({ joinCode: 'NEWCODE234' }),
    })
    await screen.findByText('ABCD234XYZ')

    // Cancel: nothing is sent.
    click(T.regenerate)
    await screen.findByText(T.regenerateTitle)
    fireEvent.click(screen.getByRole('button', { name: T.cancel }))
    await waitFor(() =>
      expect(screen.queryByText(T.regenerateTitle)).toBeNull(),
    )
    expect(callsTo(fetchMock, REGENERATE)).toHaveLength(0)

    click(T.regenerate)
    await screen.findByText(T.regenerateTitle)
    confirmInDialog(T.regenerate)
    await screen.findByText('NEWCODE234')
    expect(screen.queryByText('ABCD234XYZ')).toBeNull()
    expect(callsTo(fetchMock, REGENERATE)).toHaveLength(1)
    await screen.findByText(T.regenerated)
  })

  it('turns the code off after confirming, and on again with a new code', async () => {
    const { fetchMock } = openScreen({
      [`DELETE ${CODE}`]: () => new Response(null, { status: 204 }),
      [`POST ${REGENERATE}`]: () => json({ joinCode: 'NEWCODE234' }),
    })
    await screen.findByText('ABCD234XYZ')
    const codeSwitch = () => screen.getByRole('switch', { name: T.codeToggle })

    fireEvent.click(codeSwitch())
    await screen.findByText(T.disableTitle)
    fireEvent.click(screen.getByRole('button', { name: T.cancel }))
    await waitFor(() => expect(screen.queryByText(T.disableTitle)).toBeNull())
    expect(
      callsTo(fetchMock, CODE).filter(([, i]) => i?.method === 'DELETE'),
    ).toHaveLength(0)

    fireEvent.click(codeSwitch())
    await screen.findByText(T.disableTitle)
    confirmInDialog(T.disable)
    await screen.findByText(T.codeOff)
    expect(screen.queryByText('ABCD234XYZ')).toBeNull()

    fireEvent.click(codeSwitch()) // no confirmation: it only issues a fresh code
    await screen.findByText('NEWCODE234')
    expect(callsTo(fetchMock, REGENERATE)).toHaveLength(1)
  })

  it('saves the search visibility at once and toasts', async () => {
    const { fetchMock } = openScreen({
      [`PATCH ${CLUB}`]: () => json({ id: '10', isSearchable: false }),
    })
    await screen.findByText(T.searchableOn)

    fireEvent.click(screen.getByRole('switch', { name: T.searchableToggle }))
    await screen.findByText(T.searchableOff)
    const [, init] = callsTo(fetchMock, CLUB).find(
      ([, i]) => i?.method === 'PATCH',
    )!
    expect(JSON.parse(String(init?.body))).toEqual({ isSearchable: false })
    await screen.findByText(COPY.saved)
  })

  it('offers a retry when loading fails', async () => {
    let failing = true
    openScreen({
      [`GET ${CODE}`]: () =>
        failing ? apiError('UNKNOWN', 500) : json({ joinCode: 'ABCD234XYZ' }),
    })
    await screen.findByRole('button', { name: T.retry })

    failing = false
    click(T.retry)
    await screen.findByText('ABCD234XYZ')
  })

  it('shows the state-conflict dialog when re-issuing is refused', async () => {
    openScreen({
      [`POST ${REGENERATE}`]: () => apiError('STATE_CONFLICT', 409),
    })
    await screen.findByText('ABCD234XYZ')

    click(T.regenerate)
    await screen.findByText(T.regenerateTitle)
    confirmInDialog(T.regenerate)
    await screen.findByText(COPY.stateConflictTitle)
    expect(screen.getByText('ABCD234XYZ')).toBeTruthy()
  })
})
