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
import { SETTINGS_COPY as T } from './settingsCopy'

setupDom()

const PREVIEW = '/api/v1/clubs/10/memberships/me/leave-preview'
const WITHDRAW = '/api/v1/clubs/10/memberships/21/withdraw'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = (id: string, clubId: string, name: string) => ({
  id,
  clubId,
  club: {
    id: clubId,
    name,
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'MEMBER',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
})
const crane = membership('21', '10', 'Crane Band')
const other = membership('31', '11', 'Other Club')

const preview = (over: Record<string, unknown> = {}) => ({
  role: 'CLUB_ADMIN',
  succession: {
    type: 'DESIGNATED_OR_EARLIEST',
    candidateMembershipId: '23',
    candidateName: '김하늘',
  },
  performanceImpacts: [
    {
      performanceId: '31',
      performanceName: '2026 가을 공연',
      participationStatus: 'APPROVED',
      isTeamLeader: true,
      teamName: '1팀',
    },
  ],
  teamLeaderCandidates: [
    {
      performanceId: '31',
      performanceName: '2026 가을 공연',
      teamId: '41',
      teamName: '1팀',
      candidates: [
        { membershipId: '23', displayName: '김하늘' },
        { membershipId: '24', displayName: '박서연' },
      ],
    },
  ],
  warnings: [],
  ...over,
})
const plain = preview({
  role: 'MEMBER',
  succession: null,
  performanceImpacts: [],
  teamLeaderCandidates: [],
})

function openScreen(
  extra: Record<string, Route> = {},
  memberships: unknown[] = [crane, other],
) {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  let left = false
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () =>
      json({
        items: left ? memberships.filter((m) => m !== crane) : memberships,
      }),
    [`GET ${PREVIEW}`]: () => json(preview()),
    [`POST ${WITHDRAW}`]: () => {
      left = true
      return json({ resource: {}, warnings: [], effects: {} })
    },
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/10/leave') }
}

const leaveButton = () => screen.getByRole('button', { name: T.leave })
const confirmInDialog = () =>
  fireEvent.click(
    screen.getAllByRole('button', { name: T.leaveConfirm }).at(-1)!,
  )
const sentBody = (fetchMock: ReturnType<typeof stubApi>) =>
  JSON.parse(String(callsTo(fetchMock, WITHDRAW)[0]![1]?.body))

describe('CLUB-108 ClubLeave', () => {
  it('shows the notice, the impacted performances, the successor and the team picks', async () => {
    openScreen()
    await findScreen('CLUB-108')
    await screen.findByText(T.leaveNotice('Crane Band'))
    expect(screen.getByText(T.leaveImpacts)).toBeTruthy()
    expect(screen.getByText('2026 가을 공연 · 1팀')).toBeTruthy()
    expect(screen.getByText(T.leaveSuccession)).toBeTruthy()
    expect(screen.getByText('김하늘', { selector: 'p, span' })).toBeTruthy()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('23') // the earliest member is the default
  })

  it('hides the succession area when nothing applies', async () => {
    openScreen({ [`GET ${PREVIEW}`]: () => json(plain) })
    await screen.findByText(T.leaveNotice('Crane Band'))
    expect(screen.queryByText(T.leaveSuccession)).toBeNull()
    expect(screen.queryByText(T.leaveImpacts)).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('warns when nobody can take over the officer role', async () => {
    openScreen({
      [`GET ${PREVIEW}`]: () =>
        json(
          preview({
            succession: {
              type: 'NONE',
              candidateMembershipId: null,
              candidateName: null,
            },
            teamLeaderCandidates: [],
          }),
        ),
    })
    await screen.findByText(T.leaveNoSuccessor)
  })

  it('leaves only after the final confirm, sends the picked team leader, and goes to another club', async () => {
    const { fetchMock, router } = openScreen()
    await screen.findByRole('combobox')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '24' } })

    // Cancel: nothing is sent.
    fireEvent.click(leaveButton())
    await screen.findByText(T.leaveConfirmTitle('Crane Band'))
    fireEvent.click(screen.getByRole('button', { name: T.cancel }))
    await waitFor(() =>
      expect(screen.queryByText(T.leaveConfirmTitle('Crane Band'))).toBeNull(),
    )
    expect(callsTo(fetchMock, WITHDRAW)).toHaveLength(0)

    fireEvent.click(leaveButton())
    await screen.findByText(T.leaveConfirmTitle('Crane Band'))
    confirmInDialog()

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/11'),
    )
    expect(callsTo(fetchMock, WITHDRAW)).toHaveLength(1)
    expect(sentBody(fetchMock)).toEqual({
      teamLeaderSuccessors: [{ teamId: '41', membershipId: '24' }],
    })
    await screen.findByText(T.left)
    // The left club is no longer one of the user's: its pages are a 404 now.
    await router.navigate('/clubs/10')
    await screen.findByText(COPY.notFoundTitle)
  })

  it('goes to the start screen when no other club is left', async () => {
    const { router } = openScreen({ [`GET ${PREVIEW}`]: () => json(plain) }, [
      crane,
    ])
    await screen.findByText(T.leaveNotice('Crane Band'))
    fireEvent.click(leaveButton())
    await screen.findByText(T.leaveConfirmTitle('Crane Band'))
    // Dropping the membership before the navigation ends would flash the 404 view.
    let flashed = false
    const watch = new MutationObserver(() => {
      if (document.body.textContent?.includes(COPY.notFoundTitle))
        flashed = true
    })
    watch.observe(document.body, { childList: true, subtree: true })
    confirmInDialog()

    await waitFor(() => expect(router.state.location.pathname).toBe('/start'))
    await screen.findByText(T.left)
    watch.disconnect()
    expect(flashed).toBe(false)
  })

  it('shows changed content and asks again when the preview differs at the last moment', async () => {
    let reads = 0
    const { fetchMock } = openScreen({
      [`GET ${PREVIEW}`]: () => {
        reads += 1
        // From the second read on, the team has a different set of candidates.
        return json(
          reads === 1
            ? preview()
            : preview({
                teamLeaderCandidates: [
                  {
                    performanceId: '31',
                    performanceName: '2026 가을 공연',
                    teamId: '41',
                    teamName: '1팀',
                    candidates: [{ membershipId: '25', displayName: '이도윤' }],
                  },
                ],
              }),
        )
      },
    })
    await screen.findByRole('combobox')
    fireEvent.click(leaveButton())
    await screen.findByText(T.leaveConfirmTitle('Crane Band'))
    confirmInDialog()

    await screen.findByText(T.leaveChangedTitle)
    expect(callsTo(fetchMock, WITHDRAW)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: COPY.confirm }))
    await screen.findByText('이도윤', { selector: 'option' })

    // The second try sees what the user saw, so it goes through.
    fireEvent.click(leaveButton())
    await screen.findByText(T.leaveConfirmTitle('Crane Band'))
    confirmInDialog()
    await waitFor(() => expect(callsTo(fetchMock, WITHDRAW)).toHaveLength(1))
    expect(sentBody(fetchMock)).toEqual({
      teamLeaderSuccessors: [{ teamId: '41', membershipId: '25' }],
    })
  })

  it('shows the rule-violation dialog and reloads the preview when the successor is refused', async () => {
    const { fetchMock } = openScreen({
      [`POST ${WITHDRAW}`]: () => apiError('RULE_VIOLATION', 422),
    })
    await screen.findByRole('combobox')
    fireEvent.click(leaveButton())
    await screen.findByText(T.leaveConfirmTitle('Crane Band'))
    confirmInDialog()

    await screen.findByText(COPY.ruleViolationTitle)
    await waitFor(() =>
      expect(callsTo(fetchMock, PREVIEW).length).toBeGreaterThanOrEqual(3),
    )
    expect(document.querySelector('[data-screen-id="CLUB-108"]')).toBeTruthy()
  })

  it('offers a retry when loading fails', async () => {
    let failing = true
    openScreen({
      [`GET ${PREVIEW}`]: () =>
        failing ? apiError('UNKNOWN', 500) : json(plain),
    })
    await screen.findByRole('button', { name: T.retry })
    failing = false
    fireEvent.click(screen.getByRole('button', { name: T.retry }))
    await screen.findByText(T.leaveNotice('Crane Band'))
  })
})
