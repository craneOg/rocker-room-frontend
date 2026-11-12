import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
import { membership } from '../performance/viewTestKit'
import { MY_COPY as T } from './copy'

setupDom()
Object.defineProperty(Element.prototype, 'getAnimations', {
  value: () => [],
  configurable: true,
})

const ME = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  profileImagePublic: true,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const PREVIEW = '/api/v1/me/withdrawal-preview'
const WITHDRAW = '/api/v1/me/withdrawal'

const team = (over = {}) => ({
  performanceId: 'p1',
  performanceName: '가을 정기공연',
  teamId: 't1',
  teamName: 'Crane Team',
  teamStatus: 'APPROVED',
  defaultMembershipId: 'm2',
  candidates: [
    { membershipId: 'm2', displayName: '송예림' },
    { membershipId: 'm5', displayName: '이서연' },
  ],
  ...over,
})
const club = (over = {}) => ({
  clubId: '10',
  clubName: 'Crane Band',
  role: 'CLUB_ADMIN',
  succession: {
    type: 'DESIGNATED_OR_EARLIEST',
    candidateUserId: 'u3',
    candidates: [
      { membershipId: 'm3', userId: 'u3', displayName: '정규채' },
      { membershipId: 'm4', userId: 'u4', displayName: '김도윤' },
    ],
  },
  teamLeaderTransfers: [
    team(),
    team({
      teamId: 't2',
      teamName: '2팀',
      teamStatus: 'SUBMITTED',
      defaultMembershipId: 'm5',
      candidates: [{ membershipId: 'm5', displayName: '이서연' }],
    }),
    team({
      teamId: 't3',
      teamName: '3팀',
      teamStatus: 'DRAFT',
      defaultMembershipId: null,
      candidates: [],
    }),
  ],
  ...over,
})
const deactivated = club({
  clubId: '20',
  clubName: '노을밴드',
  succession: { type: 'NONE', candidateUserId: null, candidates: [] },
  teamLeaderTransfers: [],
})

function open(
  clubs: unknown[] = [club(), deactivated],
  extra: Record<string, Route> = {},
) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(ME),
    [`GET ${API_PATHS.memberships}`]: () =>
      json({ items: [membership('MEMBER')] }),
    [`GET ${PREVIEW}`]: () => json({ clubs, warnings: [] }),
    [`POST ${WITHDRAW}`]: () => json({ successions: { clubs: [], teams: [] } }),
    ...extra,
  })
  renderApp('/me/withdrawal')
  return fetchMock
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))
const toStep2 = async () => {
  await findScreen('MY-004')
  fireEvent.click(await screen.findByLabelText(T.noticeCheck))
  click(T.next)
}
const toStep3 = async () => {
  await toStep2()
  await screen.findByText('노을밴드')
  click(T.next)
}
const phraseBox = () => screen.getByLabelText(T.typePrompt)
const submitBody = (fetchMock: ReturnType<typeof stubApi>) =>
  JSON.parse(
    String(
      callsTo(fetchMock, WITHDRAW).find(([, i]) => i?.method === 'POST')![1]!
        .body,
    ),
  ) as Record<string, unknown>

describe('MY-004 MyWithdrawal', () => {
  it('shows the top bar back button', async () => {
    open()
    await findScreen('MY-004')
    expect(screen.getByRole('button', { name: '뒤로' })).toBeTruthy()
  })

  it('needs the checkbox before 다음', async () => {
    open()
    await findScreen('MY-004')
    const next = await screen.findByRole('button', { name: T.next })
    expect(next.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByLabelText(T.noticeCheck))
    expect(next.hasAttribute('disabled')).toBe(false)
  })

  it('shows who takes over: officer pick, team pick, automatic, deleted, deactivated', async () => {
    open()
    await toStep2()
    const admin = await screen.findByLabelText('Crane Band ' + T.adminPick)
    expect((admin as HTMLSelectElement).value).toBe('u3')
    const leader = screen.getByLabelText(T.teamLeaderPick('Crane Team'))
    expect((leader as HTMLSelectElement).value).toBe('m2')
    expect(screen.getByText(T.teamAuto('2팀', '이서연'))).toBeTruthy()
    expect(screen.getByText(T.teamDeleted('3팀'))).toBeTruthy()
    expect(screen.getByText(T.clubDeactivated)).toBeTruthy()
  })

  it('says there is nothing to hand over for a member without roles', async () => {
    open([club({ role: 'MEMBER', teamLeaderTransfers: [] })])
    await toStep2()
    await screen.findByText(T.nothingToHand)
  })

  it('keeps 탈퇴하기 off until the exact phrase is typed', async () => {
    open()
    await toStep3()
    expect(
      screen
        .getByRole('button', { name: T.doWithdraw })
        .hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.change(phraseBox(), { target: { value: '탈퇴합니다 ' } })
    expect(
      screen
        .getByRole('button', { name: T.doWithdraw })
        .hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.change(phraseBox(), { target: { value: T.typePhrase } })
    expect(
      screen
        .getByRole('button', { name: T.doWithdraw })
        .hasAttribute('disabled'),
    ).toBe(false)
  })

  it('sends the picked successors with confirmed, then shows the completion', async () => {
    const fetchMock = open()
    await toStep2()
    fireEvent.change(
      await screen.findByLabelText('Crane Band ' + T.adminPick),
      {
        target: { value: 'u4' },
      },
    )
    fireEvent.change(screen.getByLabelText(T.teamLeaderPick('Crane Team')), {
      target: { value: 'm5' },
    })
    click(T.next)
    fireEvent.change(phraseBox(), { target: { value: T.typePhrase } })
    click(T.doWithdraw)
    await screen.findByText(T.doneTitle)
    expect(submitBody(fetchMock)).toEqual({
      successors: [{ clubId: '10', userId: 'u4' }],
      teamLeaderSuccessors: [{ teamId: 't1', membershipId: 'm5' }],
      confirmed: true,
    })
    // Today + 90 days, as a date.
    expect(screen.getByText(/\d{4}\.\d{2}\.\d{2}까지/)).toBeTruthy()
  })

  it('sends the defaults when nothing was changed', async () => {
    const fetchMock = open()
    await toStep3()
    fireEvent.change(phraseBox(), { target: { value: T.typePhrase } })
    click(T.doWithdraw)
    await screen.findByText(T.doneTitle)
    expect(submitBody(fetchMock)).toEqual({
      successors: [{ clubId: '10', userId: 'u3' }],
      teamLeaderSuccessors: [{ teamId: 't1', membershipId: 'm2' }],
      confirmed: true,
    })
  })

  it('goes back to the successors when one is no longer eligible (422)', async () => {
    open(undefined, {
      [`POST ${WITHDRAW}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'RULE_VIOLATION',
              message: 'x',
              details: [{ reason: 'SUCCESSOR_NOT_ELIGIBLE' }],
            },
          }),
          { status: 422 },
        ),
    })
    await toStep3()
    fireEvent.change(phraseBox(), { target: { value: T.typePhrase } })
    click(T.doWithdraw)
    await screen.findByText(T.successorGone)
    await waitFor(() =>
      expect(screen.getByLabelText('Crane Band ' + T.adminPick)).toBeTruthy(),
    )
    expect(screen.queryByText(T.doneTitle)).toBeNull()
  })

  const eligibilityError = () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'RULE_VIOLATION',
          message: 'x',
          details: [{ reason: 'SUCCESSOR_NOT_ELIGIBLE' }],
        },
      }),
      { status: 422 },
    )

  it('does not resend a pick that the fresh preview no longer offers', async () => {
    let previews = 0
    let posts = 0
    const fetchMock = open(undefined, {
      [`GET ${PREVIEW}`]: () => {
        previews += 1
        const c = club()
        if (previews > 1)
          c.succession.candidates = c.succession.candidates.filter(
            (m) => m.userId !== 'u4',
          )
        return json({ clubs: [c, deactivated], warnings: [] })
      },
      [`POST ${WITHDRAW}`]: () => {
        posts += 1
        return posts === 1
          ? eligibilityError()
          : json({ successions: { clubs: [], teams: [] } })
      },
    })
    await toStep2()
    fireEvent.change(
      await screen.findByLabelText('Crane Band ' + T.adminPick),
      {
        target: { value: 'u4' },
      },
    )
    click(T.next)
    fireEvent.change(phraseBox(), { target: { value: T.typePhrase } })
    click(T.doWithdraw)
    await screen.findByText(T.successorGone)
    // The error toast makes the page aria-hidden, so the buttons are found by text.
    fireEvent.click(await screen.findByText(T.next))
    fireEvent.change(phraseBox(), { target: { value: T.typePhrase } })
    fireEvent.click(screen.getByText(T.doWithdraw))
    await screen.findByText(T.doneTitle)
    const sent = callsTo(fetchMock, WITHDRAW).filter(
      ([, i]) => i?.method === 'POST',
    )
    expect(sent).toHaveLength(2)
    expect(JSON.parse(String(sent[1]![1]!.body))).toMatchObject({
      successors: [{ clubId: '10', userId: 'u3' }],
    })
  })

  it('blocks going on when the refreshed preview fails to load', async () => {
    let previews = 0
    open(undefined, {
      [`GET ${PREVIEW}`]: () => {
        previews += 1
        return previews > 1
          ? new Response('{}', { status: 500 })
          : json({ clubs: [club(), deactivated], warnings: [] })
      },
      [`POST ${WITHDRAW}`]: eligibilityError,
    })
    await toStep3()
    fireEvent.change(phraseBox(), { target: { value: T.typePhrase } })
    click(T.doWithdraw)
    await screen.findByText(T.successorGone)
    await waitFor(() => expect(previews).toBe(2))
    await waitFor(() => expect(screen.queryByText('노을밴드')).toBeNull())
    expect(screen.queryByRole('button', { name: T.next })).toBeNull()
  })
})
