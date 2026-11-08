import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { apiError, findScreen, setupDom } from '../../test/harness'
import { TEAM_COPY as T } from './teamCopy'
import {
  card,
  click,
  COUNTS,
  lastQuery,
  open,
  stubAnimations,
  teamPage,
  TEAMS,
  withTeamPolicy,
} from './teamTestKit'
import { PERF } from '../performance/viewTestKit'

setupDom()
beforeEach(stubAnimations)

const URL = '/clubs/10/performances/31/teams'
const ITEMS = [
  card('201', 'Crane Team', { isDefault: true }),
  card('202', '2팀', { memberCount: 3 }),
]

describe('TEAM-001 for officers', () => {
  it('lists the cards with badges, leader, counts and the part summary', async () => {
    open(URL, 'CLUB_ADMIN', {
      [`GET ${TEAMS}`]: () => teamPage(ITEMS, COUNTS),
    })
    await findScreen('TEAM-001')
    await screen.findByText('Crane Team')
    expect(screen.getByText('기본 팀')).toBeTruthy()
    expect(screen.getAllByText(/팀장 정규채 · 팀원 2명/).length).toBe(1)
    expect(screen.getAllByText('드럼 1 · 파트 미지정 1').length).toBe(2)
    expect(screen.getAllByText('담당 곡 1곡 · 후보곡 0곡').length).toBe(2)
    expect(
      screen.getByRole('button', { name: T.filterSubmitted(2) }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: `+ ${T.createTeam}` }),
    ).toBeTruthy()
  })

  it('sends the status filter of each chip', async () => {
    const { fetchMock } = open(URL, 'CLUB_ADMIN', {
      [`GET ${TEAMS}`]: () => teamPage(ITEMS, COUNTS),
    })
    await screen.findByText('Crane Team')
    expect(lastQuery(fetchMock, TEAMS).get('status')).toBeNull()

    await click(T.filterApproved)
    await waitFor(() =>
      expect(lastQuery(fetchMock, TEAMS).get('status')).toBe('APPROVED'),
    )
    await click(T.filterDraft)
    await waitFor(() =>
      expect(lastQuery(fetchMock, TEAMS).get('status')).toBe('DRAFT'),
    )
    await click(T.filterClosed)
    await waitFor(() =>
      expect(lastQuery(fetchMock, TEAMS).get('status')).toBe(
        'REJECTED,WITHDRAWN',
      ),
    )
  })

  it('opens the review screen from the pending chip', async () => {
    const { router } = open(URL, 'CLUB_ADMIN', {
      [`GET ${TEAMS}`]: () => teamPage(ITEMS, COUNTS),
    })
    await click(T.filterSubmitted(2))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${URL}/review`),
    )
  })

  it('hides 팀 만들기 on a LOCKED performance', async () => {
    open(URL, 'CLUB_ADMIN', {
      [`GET ${TEAMS}`]: () => teamPage(ITEMS, COUNTS),
      [`GET ${PERF}`]: () => withTeamPolicy('CLOSED', { status: 'LOCKED' }),
    })
    await screen.findByText('Crane Team')
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: `+ ${T.createTeam}` }),
      ).toBeNull(),
    )
  })
})

describe('TEAM-001 for members', () => {
  const mine = [
    card('301', '내 초안', {
      status: 'DRAFT',
      isMine: true,
      source: 'SELF',
      candidateSongCount: 2,
    }),
    card('302', '거절된 팀', {
      status: 'REJECTED',
      isMine: true,
      rejectReason: '편성이 맞지 않아요.',
    }),
  ]

  it('shows my teams on top, a draft continues the application, a rejection shows its reason', async () => {
    const { router } = open(URL, 'MEMBER', {
      [`GET ${TEAMS}`]: () => teamPage([...ITEMS, ...mine]),
      [`GET ${PERF}`]: () => withTeamPolicy('OPEN'),
    })
    await screen.findByText('내 초안')
    expect(screen.getByText(T.myTeams)).toBeTruthy()
    expect(screen.getByText(T.allTeams)).toBeTruthy()
    expect(screen.getByText(T.continueEdit)).toBeTruthy()
    expect(screen.getByText(T.rejectReason('편성이 맞지 않아요.'))).toBeTruthy()
    // No officer filter chips.
    expect(screen.queryByRole('button', { name: T.filterAll })).toBeNull()

    fireEvent.click(screen.getByText('내 초안'))
    await waitFor(() =>
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe(`${URL}/apply?teamId=301`),
    )
  })

  it('shows 팀 신청 only while the application window is open', async () => {
    open(URL, 'MEMBER', {
      [`GET ${TEAMS}`]: () => teamPage(ITEMS),
      [`GET ${PERF}`]: () => withTeamPolicy('OPEN'),
    })
    await screen.findByRole('button', { name: `+ ${T.applyTeam}` })
    expect(
      screen.queryByRole('button', { name: `+ ${T.createTeam}` }),
    ).toBeNull()
  })

  it('hides 팀 신청 when the window is closed', async () => {
    open(URL, 'MEMBER', {
      [`GET ${TEAMS}`]: () => teamPage(ITEMS),
      [`GET ${PERF}`]: () => withTeamPolicy('CLOSED'),
    })
    await screen.findByText('Crane Team')
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: `+ ${T.applyTeam}` }),
      ).toBeNull(),
    )
  })

  it('shows the empty state', async () => {
    open(URL, 'MEMBER', { [`GET ${TEAMS}`]: () => teamPage([]) })
    await screen.findByText(T.emptyTeams)
  })

  it('retries after a failed read', async () => {
    let healthy = false
    open(URL, 'MEMBER', {
      [`GET ${TEAMS}`]: () =>
        healthy ? teamPage(ITEMS) : apiError('UNKNOWN', 500),
    })
    await screen.findByRole('button', { name: T.loadFailedRetry })
    healthy = true
    await click(T.loadFailedRetry)
    await screen.findByText('Crane Team')
  })

  it('hides the candidate count when the server sends null', async () => {
    open(URL, 'MEMBER', {
      [`GET ${TEAMS}`]: () =>
        teamPage([card('201', 'Crane Team', { candidateSongCount: null })]),
    })
    await screen.findByText('담당 곡 1곡')
    expect(screen.queryByText(/후보곡/)).toBeNull()
  })
})
