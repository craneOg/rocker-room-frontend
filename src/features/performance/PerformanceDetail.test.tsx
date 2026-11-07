import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import { BASE, body, detail, mine, open, PERF } from './viewTestKit'
import { VIEW_COPY as T } from './viewCopy'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const ME = `${PERF}/members/me`
const NOT_PARTICIPANT: Record<string, Route> = {
  [`GET ${ME}`]: () => apiError('NOT_FOUND', 404),
}
const click = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole('button', { name }))

describe('PERF-003 header, banner and summary', () => {
  it('shows the header, tabs, feature rows (used ones only) and the summary', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${ME}`]: () => json(mine()),
    })
    await findScreen('PERF-003')
    await screen.findByText('가을 정기공연')
    expect(screen.getByText('팀 먼저')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: T.tabs.members }).getAttribute('href'),
    ).toBe('/clubs/10/performances/31/members')
    // 오디션 tab is for officers only.
    expect(screen.queryByRole('link', { name: T.tabs.auditions })).toBeNull()
    // Candidate is used (with my progress), playability and vote are DISABLED.
    const row = screen.getByText(T.featureName.candidate).closest('a')
    expect(row?.textContent).toContain(T.progressCandidate(1, 3))
    expect(screen.queryByText(T.featureName.playability)).toBeNull()
    expect(screen.queryByText(T.featureName.vote)).toBeNull()
    expect(screen.getByText(T.tileParticipants(7))).toBeTruthy()
    expect(screen.queryByText(T.menuEdit)).toBeNull()
  })

  it('gives officers the menu and the audition tab', async () => {
    open('/clubs/10/performances/31', 'CLUB_ADMIN', NOT_PARTICIPANT)
    await screen.findByText('가을 정기공연')
    expect(screen.getByText(T.menuPolicy).getAttribute('href')).toBe(
      '/clubs/10/performances/31/policy',
    )
    expect(screen.getByRole('link', { name: T.tabs.auditions })).toBeTruthy()
  })

  it('explains a locked performance and hides apply / withdraw', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${PERF}`]: () => json(detail({ status: 'LOCKED' })),
      [`GET ${ME}`]: () => json(mine()),
    })
    await screen.findByText(T.banner.LOCKED?.(false) ?? '')
    expect(screen.queryByRole('button', { name: T.withdraw })).toBeNull()
  })

  it('tells officers the draft is hidden from members', async () => {
    open('/clubs/10/performances/31', 'CLUB_ADMIN', {
      [`GET ${PERF}`]: () => json(detail({ status: 'DRAFT' })),
      ...NOT_PARTICIPANT,
    })
    await screen.findByText(T.banner.DRAFT?.(true) ?? '')
  })
})

describe('PERF-003 4 my participation card', () => {
  it('applies through the confirmation sheet (4-1)', async () => {
    const { fetchMock } = open('/clubs/10/performances/31', 'MEMBER', {
      ...NOT_PARTICIPANT,
      [`POST ${PERF}/applications`]: () =>
        json(mine({ status: 'APPLIED' }), 201),
    })
    await screen.findByText(T.canApplyHint)
    await click(T.apply)
    await screen.findByText(T.applyTitle('가을 정기공연'))
    expect(callsTo(fetchMock, `${PERF}/applications`)).toHaveLength(0)
    // The sheet's button, not the card's.
    const buttons = await screen.findAllByRole('button', { name: T.apply })
    fireEvent.click(buttons[buttons.length - 1]!)

    await screen.findByText(T.applied)
    expect(body(fetchMock, `${PERF}/applications`)).toEqual({})
    // The performance is read again.
    await waitFor(() =>
      expect(callsTo(fetchMock, ME).length).toBeGreaterThan(1),
    )
  })

  it('shows the server conflict as a dialog, without a success toast', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      ...NOT_PARTICIPANT,
      [`POST ${PERF}/applications`]: () => apiError('STATE_CONFLICT', 409),
    })
    await click(T.apply)
    const buttons = await screen.findAllByRole('button', { name: T.apply })
    fireEvent.click(buttons[buttons.length - 1]!)

    await screen.findByText(COPY.stateConflictTitle)
    expect(screen.queryByText(T.applied)).toBeNull()
  })

  it.each([
    ['a guest', { status: 'ACTIVE' }, 'GUEST', T.guestHint],
    ['a graduated member', { status: 'GRADUATED' }, 'REGULAR', T.guestHint],
  ])('does not offer applying to %s', async (_label, m, memberType, hint) => {
    open(
      '/clubs/10/performances/31',
      'MEMBER',
      {
        ...NOT_PARTICIPANT,
        [`GET ${BASE}/memberships/m9`]: () =>
          json({
            id: 'm9',
            displayName: null,
            userName: '송예림',
            memberType,
            role: 'MEMBER',
            status: m.status,
            profileImageUrl: null,
            parts: [],
            performances: [],
          }),
      },
      m,
    )
    await screen.findByText(hint)
    expect(screen.queryByRole('button', { name: T.apply })).toBeNull()
  })

  it('says officers pick participants while applications are closed', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${PERF}`]: () => json(detail({}, { applicationState: 'CLOSED' })),
      ...NOT_PARTICIPANT,
    })
    await screen.findByText(T.officerPicks)
    expect(screen.queryByRole('button', { name: T.apply })).toBeNull()
  })

  it('does not offer applying after the deadline', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${PERF}`]: () =>
        json(detail({}, { applicationDeadline: '2020-01-01T00:00:00+09:00' })),
      ...NOT_PARTICIPANT,
    })
    await screen.findByText(T.officerPicks)
    expect(screen.queryByRole('button', { name: T.apply })).toBeNull()
  })

  it('offers 다시 신청 after a rejection', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${ME}`]: () => json(mine({ status: 'REJECTED' })),
    })
    await click(T.reapply)
  })

  it('withdraws an application (4-2) without successors', async () => {
    const { fetchMock } = open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${ME}`]: () => json(mine({ status: 'APPLIED' })),
      [`GET ${PERF}/members/55/impact`]: () =>
        json({
          teamIds: [],
          songIds: [],
          scheduleIds: [],
          affectedUserIds: [],
          warnings: [],
        }),
      [`POST ${PERF}/members/55/withdraw`]: () => json({ resource: mine() }),
    })
    await screen.findByText(T.appliedHint)
    await click(T.cancelApply)
    await screen.findByText(T.withdrawTitle)
    expect(screen.getByText(T.withdrawImpact)).toBeTruthy()
    // Wait for the impact: the action stays disabled until then.
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: T.withdrawAction,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: T.withdrawAction }))

    await screen.findByText(T.withdrawn)
    expect(body(fetchMock, `${PERF}/members/55/withdraw`)).toEqual({
      teamLeaderSuccessors: [],
    })
  })

  it('makes a team leader choose a successor before withdrawing', async () => {
    const { fetchMock } = open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${ME}`]: () =>
        json(
          mine({
            myTeams: [{ teamId: '12', name: '1팀', isLeader: true }],
            myPlayingSongs: [
              {
                songId: '3',
                title: '곡B',
                partId: '4',
                partName: '드럼',
                setlistOrder: 2,
              },
              {
                songId: '1',
                title: '곡A',
                partId: '4',
                partName: '드럼',
                setlistOrder: 1,
              },
            ],
          }),
        ),
      [`GET ${PERF}/members/55/impact`]: () =>
        json({
          teamIds: ['12'],
          songIds: [],
          scheduleIds: [],
          affectedUserIds: [],
          warnings: [],
        }),
      [`GET ${PERF}/teams/12`]: () =>
        json({
          team: { id: '12', name: '1팀', leaderMembershipId: 'm9' },
          members: [
            { membershipId: 'm9', displayName: '송예림', isLeader: true },
            { membershipId: '22', displayName: '김도윤', isLeader: false },
          ],
        }),
      [`POST ${PERF}/members/55/withdraw`]: () => json({ resource: mine() }),
    })
    await screen.findByText(T.leader)
    // Songs are listed in setlist order.
    const songs = screen.getAllByText(/^\d · 곡/).map((e) => e.textContent)
    expect(songs).toEqual(['1 · 곡A (드럼)', '2 · 곡B (드럼)'])

    await click(T.withdraw)
    const select = await screen.findByRole('combobox')
    await screen.findByText(T.successorRequired)
    const action = screen.getByRole('button', { name: T.withdrawAction })
    expect((action as HTMLButtonElement).disabled).toBe(true)
    // Only the other member can succeed.
    expect(screen.queryByRole('option', { name: '송예림' })).toBeNull()

    fireEvent.change(select, { target: { value: '22' } })
    await waitFor(() =>
      expect((action as HTMLButtonElement).disabled).toBe(false),
    )
    expect(screen.queryByText(T.successorRequired)).toBeNull()
    fireEvent.click(action)

    await screen.findByText(T.withdrawn)
    expect(body(fetchMock, `${PERF}/members/55/withdraw`)).toEqual({
      teamLeaderSuccessors: [{ teamId: '12', membershipId: '22' }],
    })
  })

  it('does not ask a sole team leader for a successor', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${ME}`]: () => json(mine()),
      [`GET ${PERF}/members/55/impact`]: () =>
        json({
          teamIds: ['12'],
          songIds: [],
          scheduleIds: [],
          affectedUserIds: [],
          warnings: [],
        }),
      [`GET ${PERF}/teams/12`]: () =>
        json({
          team: { id: '12', name: '1팀', leaderMembershipId: 'm9' },
          members: [
            { membershipId: 'm9', displayName: '송예림', isLeader: true },
          ],
        }),
    })
    await click(T.withdraw)
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: T.withdrawAction,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    )
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows a failed impact read with a retry and keeps the action off', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${ME}`]: () => json(mine()),
      [`GET ${PERF}/members/55/impact`]: () => apiError('UNKNOWN', 500),
    })
    await click(T.withdraw)
    await screen.findByRole('button', { name: COPY.retry })
    expect(
      (
        screen.getByRole('button', {
          name: T.withdrawAction,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('shows the full-page 404 for for a missing performance', async () => {
    open('/clubs/10/performances/31', 'MEMBER', {
      [`GET ${PERF}`]: () => apiError('NOT_FOUND', 404),
      ...NOT_PARTICIPANT,
    })
    await screen.findByText(COPY.notFoundTitle)
  })
})
