import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS, membershipActionPath } from '../../shared/api/assumptions'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
} from '../../test/harness'
import { AUTH_COPY as T } from './copy'

setupDom()

const DAY = 86_400_000
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString()

const base = { role: 'MEMBER', invitationExpiresAt: null, requestedAt: null }
const clubOf = (id: string, name: string) => ({
  id,
  name,
  clubType: 'BAND',
  status: 'ACTIVE',
  profileImageUrl: null,
  themeColor: null,
})
const invite = {
  ...base,
  id: 'm1',
  clubId: 'c1',
  club: clubOf('c1', '한빛 밴드 동아리'),
  status: 'INVITED',
  invitationExpiresAt: iso(5),
}
const expired = {
  ...invite,
  id: 'm2',
  clubId: 'c2',
  club: clubOf('c2', '지난 학기 합주단'),
  invitationExpiresAt: iso(-2),
}
const pending = {
  ...base,
  id: 'm3',
  clubId: 'c3',
  club: clubOf('c3', '서울 인디 밴드'),
  status: 'PENDING',
  requestedAt: iso(-3),
}
const rejected = {
  ...pending,
  id: 'm4',
  clubId: 'c4',
  club: clubOf('c4', '홍대 합주단'),
  status: 'REJECTED',
}

const me = {
  id: '1',
  name: '명혜성',
  handle: 'hyeseong',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}

function openStart(
  initial = [invite, expired, pending, rejected],
  failRefetchAfterAction = false,
) {
  let memberships: object[] = initial
  let acted = false
  const act = (
    m: { clubId: string; id: string },
    action: 'accept' | 'decline' | 'cancel',
  ) => membershipActionPath(m.clubId, m.id, action)
  const apply = (id: string, change: (m: object) => object | null) => () => {
    memberships = memberships.flatMap((m) =>
      (m as { id: string }).id === id
        ? [change(m)].filter((x) => x !== null)
        : [m],
    )
    return new Response(null, { status: 204 })
  }
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(me),
    [`GET ${API_PATHS.memberships}`]: () =>
      failRefetchAfterAction && acted
        ? apiError('UNKNOWN', 500)
        : json({ items: memberships }),
    [`POST ${act(invite, 'accept')}`]: () => {
      acted = true
      return apply('m1', (m) => ({ ...m, status: 'ACTIVE' }))()
    },
    [`POST ${act(invite, 'decline')}`]: () => {
      acted = true
      return apply('m1', () => null)()
    },
    [`POST ${act(pending, 'cancel')}`]: () => {
      acted = true
      return apply('m3', () => null)()
    },
  })
  return { fetchMock, router: renderApp('/start') }
}

const card = (club: string) =>
  screen.getByText(club).closest('article') as HTMLElement

describe('AUTH-003 paths (API-026/027/028)', () => {
  it('uses the spec paths', () => {
    expect(membershipActionPath('10', '21', 'accept')).toBe(
      '/api/v1/clubs/10/memberships/21/accept',
    )
    expect(membershipActionPath('10', '21', 'decline')).toBe(
      '/api/v1/clubs/10/memberships/21/decline',
    )
    expect(membershipActionPath('10', '21', 'cancel')).toBe(
      '/api/v1/clubs/10/join-requests/21/cancel',
    )
  })
})

describe('AUTH-003', () => {
  it('shows the greeting, invites, applications and the three ways to join', async () => {
    openStart()
    await findScreen('AUTH-003')
    expect(screen.getByText(T.greeting('명혜성'))).toBeTruthy()
    expect(
      within(card('한빛 밴드 동아리')).getByText(/까지 수락 가능/),
    ).toBeTruthy()
    expect(
      within(card('서울 인디 밴드')).getByText('가입 승인 대기'),
    ).toBeTruthy()
    expect(within(card('홍대 합주단')).getByText(T.rejected)).toBeTruthy()
    const links = within(
      document.querySelector<HTMLElement>('[data-screen-id="AUTH-003"]')!,
    )
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h) => h?.startsWith('/clubs/'))
    expect(links).toEqual(['/clubs/new', '/clubs/join', '/clubs/search'])
    expect(screen.getByText(T.myId('hyeseong'))).toBeTruthy()
  })

  it('disables an expired invite and shows its state', async () => {
    openStart()
    await findScreen('AUTH-003')
    const c = within(card('지난 학기 합주단'))
    expect(c.getByText(T.inviteExpired)).toBeTruthy()
    expect(
      c.getByRole('button', { name: T.accept }).hasAttribute('disabled'),
    ).toBe(true)
    expect(
      c.getByRole('button', { name: T.decline }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('opens the club home even if the refetch after accepting fails', async () => {
    const { router } = openStart([invite], true)
    await findScreen('AUTH-003')
    fireEvent.click(
      within(card('한빛 밴드 동아리')).getByRole('button', { name: T.accept }),
    )
    await findScreen('HOME-001')
    expect(router.state.location.pathname).toBe('/clubs/c1')
  })

  it('accepts an invite, toasts, and opens the club home', async () => {
    const { fetchMock, router } = openStart()
    await findScreen('AUTH-003')
    fireEvent.click(
      within(card('한빛 밴드 동아리')).getByRole('button', { name: T.accept }),
    )
    await findScreen('HOME-001')
    expect(router.state.location.pathname).toBe('/clubs/c1')
    expect(
      callsTo(fetchMock, membershipActionPath('c1', 'm1', 'accept')),
    ).toHaveLength(1)
    expect(await screen.findByText(T.accepted)).toBeTruthy()
  })

  it('declines only after the 2-1 confirmation and stays on /start', async () => {
    const { fetchMock, router } = openStart()
    await findScreen('AUTH-003')
    const declinePath = membershipActionPath('c1', 'm1', 'decline')
    fireEvent.click(
      within(card('한빛 밴드 동아리')).getByRole('button', { name: T.decline }),
    )
    expect(
      await screen.findByText(T.declineTitle('한빛 밴드 동아리')),
    ).toBeTruthy()
    expect(screen.getByText(T.declineDescription)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() =>
      expect(screen.queryByText(T.declineDescription)).toBeNull(),
    )
    expect(callsTo(fetchMock, declinePath)).toHaveLength(0)

    fireEvent.click(
      within(card('한빛 밴드 동아리')).getByRole('button', { name: T.decline }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: T.decline }))
    expect(await screen.findByText(T.declined)).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByText('한빛 밴드 동아리')).toBeNull(),
    )
    expect(callsTo(fetchMock, declinePath)).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/start')
  })

  it.each([
    ['한빛 밴드 동아리', T.decline, T.decline, T.declined],
    ['서울 인디 밴드', T.cancelRequest, T.cancelRequest, T.requestCancelled],
  ])(
    'drops the %s card even if the refetch after the action fails',
    async (club, open, confirm, toast) => {
      openStart([invite, pending], true)
      await findScreen('AUTH-003')
      fireEvent.click(within(card(club)).getByRole('button', { name: open }))
      const dialog = await screen.findByRole('alertdialog')
      fireEvent.click(within(dialog).getByRole('button', { name: confirm }))
      // The toast follows the (failed) refetch, so the card check below runs after it settled.
      expect(await screen.findByText(toast)).toBeTruthy()
      expect(screen.queryByText(club)).toBeNull()
    },
  )

  it('cancels a pending application after the 3-1 confirmation', async () => {
    const { fetchMock, router } = openStart()
    await findScreen('AUTH-003')
    fireEvent.click(
      within(card('서울 인디 밴드')).getByRole('button', {
        name: T.cancelRequest,
      }),
    )
    expect(
      await screen.findByText(T.cancelTitle('서울 인디 밴드')),
    ).toBeTruthy()
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: T.cancelRequest }),
    )
    expect(await screen.findByText(T.requestCancelled)).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('서울 인디 밴드')).toBeNull())
    expect(
      callsTo(fetchMock, membershipActionPath('c3', 'm3', 'cancel')),
    ).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/start')
  })
})
