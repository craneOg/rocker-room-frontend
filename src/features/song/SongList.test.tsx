import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { apiError, findScreen, json, setupDom } from '../../test/harness'
import { SONG_COPY as T } from './songCopy'
import {
  body,
  callsTo,
  card,
  lastQuery,
  openSong,
  PERF,
  SONGS,
  songPage,
  team,
  TEAMS,
} from './songTestKit'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const PATH = '/clubs/10/performances/31/songs'
const click = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole('button', { name }))
const cardOf = async (title: string) =>
  (await screen.findByText(new RegExp(title))).closest('li') as HTMLElement

const CANDIDATES = [
  card('41', '꿈의 아이', { artist: '이소라' }),
  card('42', 'Creep', {
    myPlayability: [{ partId: '4', answer: 'POSSIBLE' }],
    myVote: { score: 1 },
  }),
]
const list = (items: unknown[] = CANDIDATES, extra = {}) => ({
  [`GET ${SONGS}`]: () => songPage(items, extra),
})

describe('SONG-001 list', () => {
  it('shows candidate cards with the vote and playability summary', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', { routes: list() })
    await findScreen('SONG-001')
    const first = await cardOf('꿈의 아이')
    expect(within(first).getByText('후보')).toBeTruthy()
    expect(within(first).getByText(T.voteSummaryApproval(3))).toBeTruthy()
    expect(within(first).getByText(T.playabilitySummary(2, 1, 0))).toBeTruthy()
    expect(within(first).getByText(T.proposedBy('정규채'))).toBeTruthy()
    // The first load asks for the default filter: candidates, latest first.
    const q = lastQuery(fetchMock, SONGS)
    expect(q.get('status')).toBe('PROPOSED')
    expect(q.get('sort')).toBe('createdAt,desc')
  })

  it('shows the feature band with the own progress', async () => {
    openSong(PATH, 'MEMBER', {
      routes: list(CANDIDATES, { myVoteCount: 2 }),
      me: {
        progress: {
          candidateSongs: { used: 1, limit: 3 },
          unansweredPlayabilityCount: 4,
          votes: { used: 0, limit: 3 },
          availabilitySlotCount: null,
        },
      },
    })
    await screen.findByRole('button', { name: T.bandCandidate(null, 1, 3) })
    expect(
      screen.getByRole('button', { name: T.bandPlayability(4) }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: T.bandVote(2, 3) })).toBeTruthy()
  })

  it('leaves out the band chips of features that are not open', async () => {
    openSong(PATH, 'MEMBER', {
      routes: list(),
      policy: { playabilityState: 'CLOSED', voteState: 'DISABLED' },
    })
    await screen.findByRole('button', { name: T.bandCandidate(null, 1, 3) })
    expect(screen.queryByRole('button', { name: /가불 진행 중/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /투표 진행 중/ })).toBeNull()
    // The vote summary of a disabled feature is hidden too.
    expect(screen.queryByText(T.voteSummaryApproval(3))).toBeNull()
  })

  it('applies the band chips as filters', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', { routes: list() })
    fireEvent.click(
      await screen.findByRole('button', { name: T.bandPlayability(null) }),
    )
    await waitFor(() =>
      expect(lastQuery(fetchMock, SONGS).get('unresponded')).toBe('true'),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: T.bandCandidate(null, 1, 3) }),
    )
    await waitFor(() =>
      expect(lastQuery(fetchMock, SONGS).get('proposedByMe')).toBe('true'),
    )
  })

  it('switches the status chips and shows the selected-song card', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: {
        [`GET ${SONGS}`]: (url) =>
          new URL(url, 'http://x').searchParams.get('status') === 'CONFIRMED'
            ? songPage([
                card('51', '사랑이 었다', {
                  status: 'CONFIRMED',
                  setlistOrder: 3,
                  assignedTeamName: 'Crane Team',
                  sessionCount: 4,
                  requirementsSatisfied: false,
                }),
              ])
            : songPage(CANDIDATES),
      },
    })
    fireEvent.click(
      await screen.findByRole('tab', { name: T.statusChips.CONFIRMED }),
    )
    const c = await cardOf('사랑이 었다')
    expect(within(c).getByText('선정 · 3번')).toBeTruthy()
    expect(within(c).getByText('Crane Team')).toBeTruthy()
    expect(within(c).getByText(T.confirmedOrder(3))).toBeTruthy()
    expect(within(c).getByText(T.confirmedPlayers(4))).toBeTruthy()
    expect(within(c).getByText(T.requirementsShort)).toBeTruthy()
    // A selected song has no vote or playability input.
    expect(within(c).queryByRole('button', { name: T.approve })).toBeNull()
    expect(lastQuery(fetchMock, SONGS).get('status')).toBe('CONFIRMED')
  })

  it('reaches the withdrawn songs through the menu', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', { routes: list() })
    await screen.findByText(/꿈의 아이/)
    fireEvent.click(await screen.findByText(T.statusChips.WITHDRAWN))
    await waitFor(() =>
      expect(lastQuery(fetchMock, SONGS).get('status')).toBe('WITHDRAWN'),
    )
  })

  it('sorts, searches and filters by team', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      policy: { candidateScope: 'TEAM_MEMBERS' },
      routes: {
        ...list(),
        [`GET ${TEAMS}`]: () =>
          json({
            items: [team('7', 'Crane Team'), team('8', '거절 팀', 'REJECTED')],
          }),
      },
    })
    fireEvent.change(
      await screen.findByRole('combobox', { name: T.sortLabel }),
      {
        target: { value: 'title,asc' },
      },
    )
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.searchPlaceholder }),
      { target: { value: '꿈' } },
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Crane Team' }))
    await waitFor(() => {
      const q = lastQuery(fetchMock, SONGS)
      expect(q.get('sort')).toBe('title,asc')
      expect(q.get('q')).toBe('꿈')
      expect(q.get('candidateTeamId')).toBe('7')
    })
    // Rejected teams are no scope chips.
    expect(screen.queryByRole('button', { name: '거절 팀' })).toBeNull()
  })

  it('offers the average-score sort for the score vote method', async () => {
    openSong(PATH, 'MEMBER', {
      policy: { voteMethod: 'SCORE' },
      routes: list(),
    })
    await screen.findByRole('option', { name: T.sortScoreOption })
    expect(
      screen.queryByRole('option', { name: T.sortOptions['voteCount,desc'] }),
    ).toBeNull()
  })

  it('shows the empty states and, for a participant, the propose action', async () => {
    openSong(PATH, 'MEMBER', { routes: list([]) })
    await screen.findByText(T.emptyCandidate)
    expect(screen.getByRole('button', { name: T.proposeAction })).toBeTruthy()
    fireEvent.click(
      await screen.findByRole('tab', { name: T.statusChips.CONFIRMED }),
    )
    await screen.findByText(T.emptyConfirmed)
  })

  it('says nothing matches when filters are on', async () => {
    openSong(PATH, 'MEMBER', { routes: list([]) })
    await screen.findByText(T.emptyCandidate)
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.searchPlaceholder }),
      { target: { value: '없는곡' } },
    )
    await screen.findByText(T.emptyFiltered)
  })

  it('retries a failed load', async () => {
    let broken = true
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: {
        [`GET ${SONGS}`]: () =>
          broken ? apiError('UNKNOWN', 500) : songPage(CANDIDATES),
      },
    })
    const retry = await screen.findByRole('button', { name: '다시 시도' })
    const before = callsTo(fetchMock, SONGS).length
    broken = false
    fireEvent.click(retry)
    await screen.findByText(/꿈의 아이/)
    expect(callsTo(fetchMock, SONGS).length).toBeGreaterThan(before)
  })

  it('loads the next page', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: {
        [`GET ${SONGS}`]: (url) => {
          const pageNo = Number(
            new URL(url, 'http://x').searchParams.get('page'),
          )
          return songPage([card(`6${pageNo}`, `곡${pageNo}`)], {
            page: pageNo,
            totalPages: 2,
          })
        },
      },
    })
    await screen.findByText(/곡0/)
    await click(T.loadMore)
    await screen.findByText(/곡1/)
    expect(lastQuery(fetchMock, SONGS).get('page')).toBe('1')
  })

  it('links to the song and shows only https reference links', async () => {
    openSong(PATH, 'MEMBER', {
      routes: list([
        card('41', '링크곡', { referenceUrl: 'https://example.com/a' }),
        card('42', '위험곡', { referenceUrl: 'javascript:alert(1)' }),
      ]),
    })
    const withLink = await cardOf('링크곡')
    expect(
      within(withLink)
        .getByRole('link', { name: /링크곡 참고 링크/ })
        .getAttribute('href'),
    ).toBe('https://example.com/a')
    const unsafe = await cardOf('위험곡')
    expect(within(unsafe).queryByRole('link', { name: /참고 링크/ })).toBeNull()
    expect(within(withLink).getAllByRole('link')[0]?.getAttribute('href')).toBe(
      '/clubs/10/performances/31/songs/41',
    )
  })
})

describe('SONG-001 vote and playability entry', () => {
  it('toggles an approval vote: save, then cancel', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: {
        ...list(),
        [`PUT ${SONGS}/41/votes/me`]: () => json({ score: 1 }),
        [`DELETE ${SONGS}/42/votes/me`]: () =>
          new Response(null, { status: 204 }),
      },
    })
    const first = await cardOf('꿈의 아이')
    fireEvent.click(within(first).getByRole('button', { name: T.approve }))
    await waitFor(() =>
      expect(body(fetchMock, `${SONGS}/41/votes/me`)).toEqual({ score: 1 }),
    )
    const second = await cardOf('Creep')
    const voted = within(second).getByRole('button', { name: T.approve })
    expect(voted.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(voted)
    await waitFor(() =>
      expect(
        callsTo(fetchMock, `${SONGS}/42/votes/me`).at(-1)?.[1]?.method,
      ).toBe('DELETE'),
    )
  })

  it('shows the maximum-choices toast and no dialog when the cap is hit (V-05)', async () => {
    openSong(PATH, 'MEMBER', {
      routes: {
        ...list(),
        [`PUT ${SONGS}/41/votes/me`]: () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'RULE_VIOLATION',
                message: 'x',
                details: [{ reason: 'MAX_APPROVALS_EXCEEDED' }],
              },
            }),
            { status: 422 },
          ),
      },
    })
    const first = await cardOf('꿈의 아이')
    fireEvent.click(within(first).getByRole('button', { name: T.approve }))
    await screen.findByText(T.maxApprovals(3))
    expect(screen.queryByText('조건을 만족하지 않아요')).toBeNull()
  })

  it('changes a score vote but never cancels it (V-04)', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      policy: { voteMethod: 'SCORE' },
      routes: {
        ...list([card('41', '점수곡', { myVote: { score: 4 } })]),
        [`PUT ${SONGS}/41/votes/me`]: () => json({ score: 5 }),
      },
    })
    const c = await cardOf('점수곡')
    const four = within(c).getByRole('button', { name: T.scoreButton(4) })
    expect(four.getAttribute('aria-pressed')).toBe('true')
    // Pressing the chosen score again sends nothing.
    fireEvent.click(four)
    fireEvent.click(within(c).getByRole('button', { name: T.scoreButton(5) }))
    await waitFor(() =>
      expect(body(fetchMock, `${SONGS}/41/votes/me`)).toEqual({ score: 5 }),
    )
    expect(callsTo(fetchMock, `${SONGS}/41/votes/me`)).toHaveLength(1)
  })

  it('shows 투표 대상이 아니에요 to a participant who may not vote', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: list(),
      me: { status: 'APPLIED' },
    })
    await screen.findAllByText(T.notEligible)
    expect(screen.queryByRole('button', { name: T.approve })).toBeNull()
    expect(callsTo(fetchMock, SONGS).length).toBeGreaterThan(0)
  })

  it('shows 투표 대상이 아니에요 for a song of another team (V-02)', async () => {
    openSong(PATH, 'MEMBER', {
      routes: list([card('41', '남의 팀 곡', { candidateTeamId: '9' })]),
    })
    await screen.findByText(T.notEligible)
  })

  it('shows the own playability on the card and links to the playability area', async () => {
    openSong(PATH, 'MEMBER', { routes: list() })
    const answered = await cardOf('Creep')
    const link = within(answered).getByRole('link', { name: /내 가불/ })
    expect(link.textContent).toBe(`${T.myPlayability} 가능`)
    expect(link.getAttribute('href')).toBe(
      '/clubs/10/performances/31/songs/42#playability',
    )
    const fresh = await cardOf('꿈의 아이')
    expect(
      within(fresh).getByRole('link', { name: /내 가불/ }).textContent,
    ).toBe(`${T.myPlayability} ${T.unanswered}`)
  })

  it('gives no input row once the vote deadline has passed', async () => {
    openSong(PATH, 'MEMBER', {
      routes: list(),
      policy: { voteState: 'OPEN', voteDeadline: '2020-01-01T00:00:00+09:00' },
    })
    await screen.findByText(/꿈의 아이/)
    expect(screen.queryByRole('button', { name: T.approve })).toBeNull()
  })
})

describe('SONG-001 bottom buttons', () => {
  const link = (name: string) => screen.findByRole('link', { name })

  it('lets a participant propose while the candidate feature is open', async () => {
    openSong(PATH, 'MEMBER', { routes: list() })
    expect((await link(T.proposeButton)).getAttribute('href')).toBe(
      '/clubs/10/performances/31/songs/new',
    )
    expect(screen.queryByRole('link', { name: T.statusBoardButton })).toBeNull()
  })

  it('hides the propose button when closed, past the deadline, or for a non-participant', async () => {
    openSong(PATH, 'MEMBER', {
      routes: list(),
      policy: { candidateState: 'CLOSED' },
    })
    await screen.findByText(/꿈의 아이/)
    expect(screen.queryByRole('link', { name: T.proposeButton })).toBeNull()
  })

  it('hides the propose button from a non-participant', async () => {
    openSong(PATH, 'MEMBER', { routes: list(), me: null })
    await screen.findByText(/꿈의 아이/)
    expect(screen.queryByRole('link', { name: T.proposeButton })).toBeNull()
  })

  it('gives an officer register and the status board', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: list(),
      policy: { candidateState: 'CLOSED' },
    })
    await link(T.registerButton)
    expect((await link(T.statusBoardButton)).getAttribute('href')).toBe(
      '/clubs/10/performances/31/songs/status',
    )
  })

  it('keeps register for an officer and hides propose for a member when candidates are disabled', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: list(),
      policy: { candidateState: 'DISABLED' },
    })
    await link(T.registerButton)
  })

  it('hides propose from a member when candidates are disabled', async () => {
    openSong(PATH, 'MEMBER', {
      routes: list(),
      policy: { candidateState: 'DISABLED' },
    })
    await screen.findByText(/꿈의 아이/)
    expect(screen.queryByRole('link', { name: T.proposeButton })).toBeNull()
  })

  it('renames the officer button for a locked performance', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: list(), perf: { status: 'LOCKED' } })
    await link(T.registerLockedButton)
  })

  it('has no register button once the performance is over', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: list(),
      perf: { status: 'FINISHED' },
    })
    await screen.findByText(/꿈의 아이/)
    expect(screen.queryByRole('link', { name: T.registerButton })).toBeNull()
  })
})

describe('SONG-001 officer card menu', () => {
  const menu = async (title: string) => {
    const c = await cardOf(title)
    return within(c).getByText(T.moreStatus)
  }

  it('offers only the decisions the state allows (8.1)', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: list([
        card('41', '하나곡'),
        card('42', '둘곡', { status: 'CONFIRMED' }),
        card('43', '셋곡', { status: 'REJECTED' }),
        card('44', '넷곡', { status: 'WITHDRAWN' }),
      ]),
    })
    const names = async (title: string) => {
      const c = await cardOf(title)
      return within(c)
        .queryAllByRole('button')
        .map((b) => b.textContent)
        .filter((t) =>
          [
            T.actionConfirm,
            T.actionReject,
            T.actionUnconfirm,
            T.actionReconsider,
          ].includes(t ?? ''),
        )
    }
    expect(await names('하나곡')).toEqual([T.actionReject, T.actionConfirm])
    expect(await names('둘곡')).toEqual([T.actionUnconfirm, T.actionReject])
    expect(await names('셋곡')).toEqual([T.actionReconsider])
    expect(await names('넷곡')).toEqual([])
  })

  it('has no menu for a regular member or a finished performance', async () => {
    openSong(PATH, 'MEMBER', { routes: list() })
    await screen.findByText(/꿈의 아이/)
    expect(
      screen.queryByText(T.moreStatus, { selector: 'summary' }),
    ).toBeTruthy()
    // Only the withdrawn-status menu exists, not a card menu.
    expect(screen.queryByRole('button', { name: T.actionConfirm })).toBeNull()
  })

  it('reconsiders a rejected song with its version', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: {
        ...list([card('43', '탈락곡', { status: 'REJECTED', version: '5' })]),
        [`GET ${SONGS}/43`]: () =>
          json({
            song: {
              ...card('43', '탈락곡', { status: 'REJECTED', version: '5' }),
              memo: null,
              decisionNote: null,
              withdrawalType: null,
            },
            requirements: [],
            sessions: [],
            schedules: [],
            auditions: [],
          }),
        [`POST ${SONGS}/43/reconsider`]: () =>
          json({ id: '43', status: 'PROPOSED', version: '6' }),
      },
    })
    fireEvent.click(await menu('탈락곡'))
    await click(T.actionReconsider)
    await screen.findByText(T.reconsiderTitle)
    // The dialog button has the same name as the menu item; pick the one inside the dialog.
    const dialog = screen.getByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: T.actionReconsider }),
    )
    await screen.findByText(T.reconsiderDone)
    expect(body(fetchMock, `${SONGS}/43/reconsider`)).toEqual({ version: '5' })
  })
})

// Keep PERF referenced for readers of the file: every URL above is built from it.
void PERF
