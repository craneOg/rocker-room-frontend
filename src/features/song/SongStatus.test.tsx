import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import { SONG_COPY as T } from './songCopy'
import {
  body,
  callsTo,
  EVALS,
  lastQuery,
  openSong,
  SONGS,
  team,
  TEAMS,
} from './songTestKit'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const PATH = '/clubs/10/performances/31/songs/status'
const row = (pm: string, extra = {}) => ({
  performanceMemberId: pm,
  partId: '4',
  answer: 'POSSIBLE',
  reason: null,
  enteredByAdmin: false,
  ...extra,
})
const MEMBERS = [
  { performanceMemberId: '31', displayName: '정규채' },
  { performanceMemberId: '32', displayName: '김도윤' },
  { performanceMemberId: '33', displayName: '이서연' },
]
const board = (extra: Record<string, unknown> = {}) =>
  json({
    voteMethod: 'APPROVAL',
    songs: [
      {
        songId: '41',
        title: '곡A',
        playability: [
          row('31'),
          row('32', {
            answer: 'IMPOSSIBLE',
            reason: '시험',
            enteredByAdmin: true,
          }),
        ],
        votes: [{ performanceMemberId: '31', score: 1, enteredByAdmin: false }],
      },
      { songId: '42', title: '곡B', playability: [row('33')], votes: [] },
    ],
    members: MEMBERS,
    responseRate: { answered: 12, total: 19 },
    nonResponders: [
      {
        performanceMemberId: '33',
        displayName: '이서연',
        unrespondedSongCount: 3,
      },
    ],
    ...extra,
  })
const open = (routes: Record<string, Route> = {}, o = {}) =>
  openSong(PATH, 'CLUB_ADMIN', {
    routes: {
      [`GET ${EVALS}`]: () => board(),
      [`GET ${TEAMS}`]: () => json({ items: [team('7', 'Crane Team')] }),
      ...routes,
    },
    ...o,
  })
const cell = (song: string, person: string) =>
  screen.findByRole('button', { name: T.boardCell(song, person) })
const proxy = async () => within(await screen.findByRole('dialog'))
const saveProxy = async () => {
  const d = await proxy()
  const b = d.getByRole('button', { name: T.save })
  await waitFor(() => expect(b.hasAttribute('disabled')).toBe(false))
  fireEvent.click(b)
}

describe('SONG-005 board', () => {
  it('shows the response rate, the table, the totals and the non-responders', async () => {
    const { fetchMock } = open()
    await findScreen('SONG-005')
    await screen.findByText(T.boardRate(12, 19))
    expect(screen.getByText('정규채')).toBeTruthy()
    expect(screen.getByText('곡A')).toBeTruthy()
    expect(screen.getByText(T.playabilitySummary(1, 1, 0))).toBeTruthy()
    expect((await cell('곡A', '김도윤')).textContent).toBe('불가※')
    expect((await cell('곡A', '정규채')).textContent).toBe('가능')
    expect((await cell('곡A', '이서연')).textContent).toBe('·')
    expect(screen.getByText(`이서연 · ${T.boardUnresponded(3)}`)).toBeTruthy()
    expect(lastQuery(fetchMock, EVALS).get('type')).toBe('PLAYABILITY')
  })

  it('shows several parts of one cell with their part names', async () => {
    open({
      [`GET ${EVALS}`]: () =>
        board({
          songs: [
            {
              songId: '41',
              title: '곡A',
              playability: [
                row('31'),
                row('31', { partId: '5', answer: 'IMPOSSIBLE' }),
              ],
              votes: [],
            },
          ],
        }),
    })
    expect((await cell('곡A', '정규채')).textContent).toBe(
      '드럼:가능 / 보컬:불가',
    )
  })

  it('switches to the vote tab with check marks and counts', async () => {
    const { fetchMock } = open()
    fireEvent.click(await screen.findByRole('tab', { name: T.boardTabVote }))
    await waitFor(() =>
      expect(lastQuery(fetchMock, EVALS).get('type')).toBe('VOTE'),
    )
    await waitFor(async () =>
      expect((await cell('곡A', '정규채')).textContent).toBe(
        T.boardApproveMark,
      ),
    )
    expect(screen.getByText(T.voteSummaryApproval(1))).toBeTruthy()
  })

  it('shows scores and the average for the score method', async () => {
    open({
      [`GET ${EVALS}`]: () =>
        board({
          voteMethod: 'SCORE',
          songs: [
            {
              songId: '41',
              title: '곡A',
              playability: [],
              votes: [
                { performanceMemberId: '31', score: 4, enteredByAdmin: false },
                { performanceMemberId: '32', score: 3, enteredByAdmin: false },
              ],
            },
          ],
        }),
    })
    fireEvent.click(await screen.findByRole('tab', { name: T.boardTabVote }))
    await waitFor(async () =>
      expect((await cell('곡A', '정규채')).textContent).toBe('4'),
    )
    expect(screen.getByText(T.voteSummaryScore(3.5, 2))).toBeTruthy()
  })

  it('narrows to a team', async () => {
    const { fetchMock } = open()
    const select = await screen.findByRole('combobox', { name: T.scopeChips })
    await within(select).findByRole('option', { name: 'Crane Team' })
    fireEvent.change(select, { target: { value: '7' } })
    await waitFor(() =>
      expect(lastQuery(fetchMock, EVALS).get('teamId')).toBe('7'),
    )
  })

  it('sorts the songs by the total column', async () => {
    open({
      [`GET ${EVALS}`]: () =>
        board({
          songs: [
            { songId: '42', title: '곡B', playability: [row('33')], votes: [] },
            {
              songId: '41',
              title: '곡A',
              playability: [row('31'), row('32')],
              votes: [],
            },
          ],
        }),
    })
    await screen.findByText('곡A')
    const titles = () =>
      screen.getAllByRole('rowheader').map((h) => h.textContent)
    expect(titles()).toEqual(['곡B', '곡A'])
    fireEvent.click(screen.getByRole('button', { name: T.boardTotal }))
    await waitFor(() => expect(titles()).toEqual(['곡A', '곡B']))
  })

  it('says there is nothing to answer when there are no candidate songs', async () => {
    open({ [`GET ${EVALS}`]: () => board({ songs: [] }) })
    await screen.findByText(T.boardEmpty)
  })

  it('shows no names when the server hides them', async () => {
    open({
      [`GET ${EVALS}`]: () => board({ members: null, nonResponders: null }),
    })
    await screen.findByText(T.boardNamesHidden)
  })

  it('shows the all-answered message', async () => {
    open({ [`GET ${EVALS}`]: () => board({ nonResponders: [] }) })
    await screen.findByText(T.boardNonRespondersEmpty)
  })

  it('retries a failed load', async () => {
    let broken = true
    const { fetchMock } = open({
      [`GET ${EVALS}`]: () => (broken ? apiError('UNKNOWN', 500) : board()),
    })
    const retry = await screen.findByRole('button', { name: '다시 시도' })
    const before = callsTo(fetchMock, EVALS).length
    broken = false
    fireEvent.click(retry)
    await screen.findByText(T.boardRate(12, 19))
    expect(callsTo(fetchMock, EVALS).length).toBeGreaterThan(before)
  })
})

describe('SONG-005 proxy input', () => {
  it('answers for somebody and records the part, answer and reason', async () => {
    const { fetchMock } = open({
      [`PUT ${SONGS}/41/playability/members/33/4`]: () => json({}),
    })
    fireEvent.click(await cell('곡A', '이서연'))
    const d = await proxy()
    expect(d.getByText(T.proxyTitle('이서연'))).toBeTruthy()
    expect(d.getByText(T.proxyNote)).toBeTruthy()
    expect(
      d.getByRole('button', { name: T.save }).hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.click(d.getByRole('radio', { name: '불가' }))
    fireEvent.change(d.getByRole('textbox', { name: T.reasonLabel }), {
      target: { value: '출장' },
    })
    await saveProxy()
    await screen.findByText(T.proxyDone)
    expect(body(fetchMock, `${SONGS}/41/playability/members/33/4`)).toEqual({
      answer: 'IMPOSSIBLE',
      reason: '출장',
    })
  })

  it('prefills an existing answer and cancels it', async () => {
    const { fetchMock } = open({
      [`DELETE ${SONGS}/41/playability/members/32/4`]: () =>
        new Response(null, { status: 204 }),
    })
    fireEvent.click(await cell('곡A', '김도윤'))
    const d = await proxy()
    expect(
      (d.getByRole('radio', { name: '불가' }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (d.getByRole('textbox', { name: T.reasonLabel }) as HTMLTextAreaElement)
        .value,
    ).toBe('시험')
    fireEvent.click(d.getByRole('button', { name: T.proxyCancel }))
    await screen.findByText(T.proxyCanceled)
    expect(
      callsTo(fetchMock, `${SONGS}/41/playability/members/32/4`).at(-1)?.[1]
        ?.method,
    ).toBe('DELETE')
  })

  it('does not send a reason with 가능', async () => {
    const { fetchMock } = open({
      [`PUT ${SONGS}/41/playability/members/33/4`]: () => json({}),
    })
    fireEvent.click(await cell('곡A', '이서연'))
    fireEvent.click((await proxy()).getByRole('radio', { name: '가능' }))
    await saveProxy()
    await screen.findByText(T.proxyDone)
    expect(body(fetchMock, `${SONGS}/41/playability/members/33/4`)).toEqual({
      answer: 'POSSIBLE',
      reason: null,
    })
  })

  it('votes for somebody (approval) and cancels a vote', async () => {
    const { fetchMock } = open({
      [`PUT ${SONGS}/41/votes/members/33`]: () => json({}),
      [`DELETE ${SONGS}/41/votes/members/31`]: () =>
        new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('tab', { name: T.boardTabVote }))
    fireEvent.click(await cell('곡A', '이서연'))
    fireEvent.click(
      (await proxy()).getByRole('button', { name: T.proxyApprove }),
    )
    await saveProxy()
    await screen.findByText(T.proxyDone)
    expect(body(fetchMock, `${SONGS}/41/votes/members/33`)).toEqual({
      score: 1,
    })

    fireEvent.click(await cell('곡A', '정규채'))
    fireEvent.click(
      (await proxy()).getByRole('button', { name: T.proxyCancel }),
    )
    await screen.findByText(T.proxyCanceled)
    expect(
      callsTo(fetchMock, `${SONGS}/41/votes/members/31`).at(-1)?.[1]?.method,
    ).toBe('DELETE')
  })

  it('gives scores 1~5 for the score method', async () => {
    const { fetchMock } = open({
      [`GET ${EVALS}`]: () => board({ voteMethod: 'SCORE' }),
      [`PUT ${SONGS}/41/votes/members/33`]: () => json({}),
    })
    fireEvent.click(await screen.findByRole('tab', { name: T.boardTabVote }))
    fireEvent.click(await cell('곡A', '이서연'))
    fireEvent.click(
      (await proxy()).getByRole('button', { name: T.scoreButton(5) }),
    )
    await saveProxy()
    await screen.findByText(T.proxyDone)
    expect(body(fetchMock, `${SONGS}/41/votes/members/33`)).toEqual({
      score: 5,
    })
  })

  it('shows the cap as a rule dialog', async () => {
    open({
      [`PUT ${SONGS}/41/votes/members/33`]: () =>
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
    })
    fireEvent.click(await screen.findByRole('tab', { name: T.boardTabVote }))
    fireEvent.click(await cell('곡A', '이서연'))
    fireEvent.click(
      (await proxy()).getByRole('button', { name: T.proxyApprove }),
    )
    await saveProxy()
    await screen.findByText(COPY.ruleViolationTitle)
    expect(screen.getByText(T.maxApprovals(3))).toBeTruthy()
  })

  it('has no input cells when the feature is closed (G-10)', async () => {
    open({}, { policy: { playabilityState: 'CLOSED' } })
    await screen.findByText(T.boardRate(12, 19))
    expect(
      screen.queryByRole('button', { name: T.boardCell('곡A', '이서연') }),
    ).toBeNull()
  })

  it('has no input cells in a locked performance', async () => {
    open({}, { perf: { status: 'LOCKED' } })
    await screen.findByText(T.boardRate(12, 19))
    expect(
      screen.queryByRole('button', { name: T.boardCell('곡A', '이서연') }),
    ).toBeNull()
  })
})
