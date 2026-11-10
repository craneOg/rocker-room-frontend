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
  evaluation,
  openSong,
  participants,
  PERF,
  SONGS,
  songDetail,
  team,
  TEAMS,
} from './songTestKit'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const PATH = '/clubs/10/performances/31/songs/41'
const S = `${SONGS}/41`
const click = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole('button', { name }))
/** The button of the open dialog (its name is often shared with a menu item behind it). */
const inDialog = async (name: string) => {
  const button = within(await screen.findByRole('dialog')).getByRole('button', {
    name,
  })
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  fireEvent.click(button)
}
const ok = () => json({ resource: { id: '41' }, warnings: [] })

const MINE_PLAYABILITY: Route = () =>
  json({
    items: [
      {
        performanceMemberId: '55',
        partId: '4',
        answer: 'POSSIBLE',
        reason: null,
      },
      {
        performanceMemberId: '99',
        partId: '4',
        answer: 'IMPOSSIBLE',
        reason: null,
      },
    ],
  })

const base = (
  song: Record<string, unknown> = {},
  rest: Record<string, unknown> = {},
  routes: Record<string, Route> = {},
) => ({
  [`GET ${S}`]: () => songDetail(song, rest),
  [`GET ${S}/evaluations`]: () => evaluation(),
  [`GET ${S}/playability`]: () => json({ items: [] }),
  [`GET ${S}/votes`]: () => json({ items: [] }),
  ...routes,
})

describe('SONG-003 header', () => {
  it('shows the song facts, the decision note and https links only', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base({
        title: '곡 제목',
        artist: '아티스트',
        memo: '원곡 키로 해요.',
        referenceUrl: 'https://example.com/song',
        decisionNote: '편성 때문에',
        candidateTeamName: 'Crane Team',
      }),
    })
    await findScreen('SONG-003')
    await screen.findByText('곡 제목 – 아티스트')
    expect(screen.getByText('후보')).toBeTruthy()
    expect(screen.getByText('Crane Team')).toBeTruthy()
    expect(screen.getByText('원곡 키로 해요.')).toBeTruthy()
    expect(screen.getByText(T.decisionNote('편성 때문에'))).toBeTruthy()
    expect(screen.getByText('정규채 · 2026.10.05')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'https://example.com/song' })
        .getAttribute('rel'),
    ).toContain('noopener')
  })

  it('shows the whole-performance scope when there is no team', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    await screen.findByText(T.scopeAll)
  })

  it('hides every input of a song the proposer withdrew', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base({ status: 'WITHDRAWN', withdrawalType: 'PROPOSER' }),
    })
    await screen.findByText(T.withdrawnProposer)
    expect(screen.queryByText(T.playabilityTitle)).toBeNull()
    expect(screen.queryByText(T.voteTitle)).toBeNull()
  })

  it('tells that an officer deleted the song', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base({ status: 'WITHDRAWN', withdrawalType: 'ADMIN' }),
    })
    await screen.findByText(T.withdrawnAdmin)
  })

  it('shows the 404 view through the global handler', async () => {
    openSong(PATH, 'MEMBER', {
      routes: { [`GET ${S}`]: () => apiError('NOT_FOUND', 404) },
    })
    await screen.findByText(COPY.notFoundTitle)
  })
})

describe('SONG-003 my playability', () => {
  it('shows the own parts and saves an answer at once', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: base(
        {},
        {},
        {
          [`PUT ${S}/playability/me/4`]: () => json({}),
        },
      ),
    })
    const group = await screen.findByRole('group', {
      name: T.answerGroup('드럼'),
    })
    fireEvent.click(within(group).getByRole('button', { name: '가능' }))
    await waitFor(() =>
      expect(body(fetchMock, `${S}/playability/me/4`)).toEqual({
        answer: 'POSSIBLE',
        reason: null,
      }),
    )
    // The inactive part is never offered.
    expect(screen.queryByRole('option', { name: '건반' })).toBeNull()
  })

  it('asks for an optional reason on 불가 and sends it with 저장', async () => {
    let saved = false
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: base(
        {},
        {},
        {
          [`GET ${S}/playability`]: () =>
            json({
              items: saved
                ? [
                    {
                      performanceMemberId: '55',
                      partId: '4',
                      answer: 'IMPOSSIBLE',
                      reason: null,
                    },
                  ]
                : [],
            }),
          [`PUT ${S}/playability/me/4`]: () => {
            saved = true
            return json({})
          },
        },
      ),
    })
    const group = await screen.findByRole('group', {
      name: T.answerGroup('드럼'),
    })
    fireEvent.click(within(group).getByRole('button', { name: '불가' }))
    const reason = await screen.findByRole('textbox', {
      name: `드럼 ${T.reasonLabel}`,
    })
    expect(screen.getByText(T.reasonNote)).toBeTruthy()
    fireEvent.change(reason, { target: { value: '시험 기간' } })
    fireEvent.click(within(group).getByRole('button', { name: T.save }))
    await waitFor(() =>
      expect(body(fetchMock, `${S}/playability/me/4`)).toEqual({
        answer: 'IMPOSSIBLE',
        reason: '시험 기간',
      }),
    )
    await screen.findByText(T.savedMark)
  })

  it('answers for another part only after the confirmation', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: base({}, {}, { [`PUT ${S}/playability/me/5`]: () => json({}) }),
    })
    fireEvent.change(
      await screen.findByRole('combobox', { name: T.otherPart }),
      {
        target: { value: '5' },
      },
    )
    await screen.findByText(T.otherPartConfirm('보컬'))
    expect(
      screen.queryByRole('group', { name: T.answerGroup('보컬') }),
    ).toBeNull()
    await click(T.otherPartAction)
    const group = await screen.findByRole('group', {
      name: T.answerGroup('보컬'),
    })
    fireEvent.click(within(group).getByRole('button', { name: '보류' }))
    await waitFor(() =>
      expect(body(fetchMock, `${S}/playability/me/5`)).toEqual({
        answer: 'UNDECIDED',
        reason: null,
      }),
    )
  })

  it('cancels the answer of a part', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: base(
        {},
        {},
        {
          [`GET ${S}/playability`]: MINE_PLAYABILITY,
          [`DELETE ${S}/playability/me/4`]: () =>
            new Response(null, { status: 204 }),
        },
      ),
    })
    const group = await screen.findByRole('group', {
      name: T.answerGroup('드럼'),
    })
    fireEvent.click(
      await within(group).findByRole('button', { name: T.proxyCancel }),
    )
    await waitFor(() =>
      expect(
        callsTo(fetchMock, `${S}/playability/me/4`).at(-1)?.[1]?.method,
      ).toBe('DELETE'),
    )
  })

  it('shows only the own row of a shared answer list', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base({}, {}, { [`GET ${S}/playability`]: MINE_PLAYABILITY }),
    })
    const group = await screen.findByRole('group', {
      name: T.answerGroup('드럼'),
    })
    await waitFor(() =>
      expect(
        within(group)
          .getByRole('button', { name: '가능' })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    )
    expect(
      within(group)
        .getByRole('button', { name: '불가' })
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('is read only with a notice after the deadline', async () => {
    openSong(PATH, 'MEMBER', {
      policy: { playabilityDeadline: '2020-01-01T00:00:00+09:00' },
      routes: base(),
    })
    const group = await screen.findByRole('group', {
      name: T.answerGroup('드럼'),
    })
    expect(screen.getAllByText(T.playabilityClosed).length).toBeGreaterThan(0)
    expect(
      within(group)
        .getByRole('button', { name: '가능' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('is hidden from an outside member and from a song that is not a candidate', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base({ candidateTeamId: '9', candidateTeamName: '다른 팀' }),
    })
    await screen.findByText('다른 팀')
    expect(screen.queryByText(T.playabilityTitle)).toBeNull()
    expect(screen.queryByText(T.voteTitle)).toBeNull()
  })

  it('is hidden when the feature is disabled', async () => {
    openSong(PATH, 'MEMBER', {
      policy: { playabilityState: 'DISABLED', voteState: 'DISABLED' },
      routes: base(),
    })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByText(T.playabilityTitle)).toBeNull()
    expect(screen.queryByText(T.voteTitle)).toBeNull()
  })

  it('reads the officer own row through the performance member filter', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', { routes: base() })
    await screen.findByRole('group', { name: T.answerGroup('드럼') })
    expect(
      new URL(
        String(callsTo(fetchMock, `${S}/playability`)[0]?.[0]),
        'http://x',
      ).searchParams.get('performanceMemberId'),
    ).toBe('55')
  })
})

describe('SONG-003 my vote', () => {
  it('votes and cancels an approval and shows the selection count', async () => {
    let voted = false
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      me: {
        progress: {
          candidateSongs: null,
          unansweredPlayabilityCount: null,
          votes: { used: 2, limit: 3 },
          availabilitySlotCount: null,
        },
      },
      routes: base(
        {},
        {},
        {
          [`GET ${S}/votes`]: () =>
            json({
              items: voted ? [{ performanceMemberId: '55', score: 1 }] : [],
            }),
          [`PUT ${S}/votes/me`]: () => {
            voted = true
            return json({})
          },
          [`DELETE ${S}/votes/me`]: () => new Response(null, { status: 204 }),
        },
      ),
    })
    await screen.findByText(T.voteSelected(2, 3))
    const section = (await screen.findByText(T.voteTitle)).closest(
      'section',
    ) as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: T.approve }))
    await waitFor(() =>
      expect(body(fetchMock, `${S}/votes/me`)).toEqual({ score: 1 }),
    )
    await waitFor(() =>
      expect(
        within(section)
          .getByRole('button', { name: T.approve })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    )
    fireEvent.click(within(section).getByRole('button', { name: T.approve }))
    await waitFor(() =>
      expect(callsTo(fetchMock, `${S}/votes/me`).at(-1)?.[1]?.method).toBe(
        'DELETE',
      ),
    )
  })

  it('offers 1~5 for the score method', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      policy: { voteMethod: 'SCORE' },
      routes: base({}, {}, { [`PUT ${S}/votes/me`]: () => json({}) }),
    })
    const section = (await screen.findByText(T.voteTitle)).closest(
      'section',
    ) as HTMLElement
    fireEvent.click(
      within(section).getByRole('button', { name: T.scoreButton(4) }),
    )
    await waitFor(() =>
      expect(body(fetchMock, `${S}/votes/me`)).toEqual({ score: 4 }),
    )
    expect(within(section).getAllByRole('button')).toHaveLength(5)
  })

  it('does not vote for an applicant who is not approved yet', async () => {
    openSong(PATH, 'MEMBER', { me: { status: 'APPLIED' }, routes: base() })
    await screen.findByText(T.playabilityTitle)
    expect(screen.queryByText(T.voteTitle)).toBeNull()
  })
})

describe('SONG-003 results (UI-8, V-09)', () => {
  it('lists who answered what per part, with the officer-input mark', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    await screen.findByText(T.resultsTitle)
    await screen.findByText(T.partLine('드럼', 2, 1, 0))
    expect(screen.getByText('정규채 가능')).toBeTruthy()
    expect(screen.getByText(`김도윤 불가 (${T.byAdmin})`)).toBeTruthy()
    // A member never sees the reason of an answer.
    expect(screen.queryByText('시험 기간')).toBeNull()
    expect(screen.getByText(T.nonResponders(1))).toBeTruthy()
  })

  it('shows the reasons to an officer', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: base() })
    await screen.findByText(T.partLine('드럼', 2, 1, 0))
    expect(await screen.findByText('시험 기간')).toBeTruthy()
  })

  it('shows the vote tab with the approvers', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    fireEvent.click(await screen.findByRole('tab', { name: T.tabVote }))
    await screen.findByText(T.approvalCount(3))
    expect(screen.getByText('정규채')).toBeTruthy()
  })

  it('shows the score average and the distribution for the score method', async () => {
    openSong(PATH, 'MEMBER', {
      policy: { voteMethod: 'SCORE', playabilityState: 'DISABLED' },
      routes: base(
        {},
        {},
        {
          [`GET ${S}/evaluations`]: () =>
            evaluation({
              scoreAverage: 3.8,
              scoreDistribution: { '1': 0, '2': 0, '3': 1, '4': 2, '5': 0 },
              voteResponses: [
                {
                  performanceMemberId: '31',
                  displayName: '정규채',
                  score: 4,
                  enteredByAdmin: false,
                },
              ],
            }),
        },
      ),
    })
    await screen.findByText(T.scoreAverage(3.8))
    expect(screen.getByText(T.scoreBar(4, 2))).toBeTruthy()
    expect(screen.getByText(`정규채 ${T.scoreButton(4)}`)).toBeTruthy()
    // Playability is disabled: no tab for it.
    expect(screen.queryByRole('tab', { name: T.tabPlayability })).toBeNull()
  })

  it('shows numbers only, with the notice, when names are private', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base(
        {},
        {},
        {
          [`GET ${S}/evaluations`]: () =>
            evaluation({
              namesVisible: { playability: false, vote: false },
              playabilityResponses: null,
              voteResponses: null,
              nonResponders: null,
            }),
        },
      ),
    })
    await screen.findByText(T.partLine('드럼', 2, 1, 0))
    expect(screen.getByText(T.numbersOnly)).toBeTruthy()
    expect(screen.queryByText('정규채 가능')).toBeNull()
    expect(screen.queryByText(T.nonResponders(0))).toBeNull()
  })
})

describe('SONG-003 requirements, players, auditions and schedules', () => {
  const confirmed = {
    status: 'CONFIRMED',
    setlistOrder: 2,
    assignedTeamId: '7',
    assignedTeamName: 'Crane Team',
  }

  it('shows the requirement chips with fill state and shortage / excess labels', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base(confirmed, {
        requirements: [
          { partId: '4', requiredCount: 2 },
          { partId: '5', requiredCount: 1 },
        ],
        sessions: [
          {
            performanceMemberId: '31',
            partId: '4',
            displayName: '정규채',
            isSupport: false,
            isGuest: false,
          },
          {
            performanceMemberId: '32',
            partId: '5',
            displayName: '김도윤',
            isSupport: false,
            isGuest: false,
          },
          {
            performanceMemberId: '33',
            partId: '5',
            displayName: '이서연',
            isSupport: false,
            isGuest: false,
          },
        ],
      }),
    })
    await screen.findByText(
      `${T.partProgress('드럼', 1, 2)} ${T.requirementShort}`,
    )
    expect(
      screen.getByText(
        `${T.partProgress('보컬', 2, 1)} ${T.requirementExcess}`,
      ),
    ).toBeTruthy()
  })

  it('says 편성 미지정 and gives members no edit button', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    await screen.findByText(T.requirementsNone)
    expect(
      screen.queryByRole('button', { name: T.requirementsEdit }),
    ).toBeNull()
  })

  it('lists players with the 지원 and 객원 badges only for a song with a team (UI-26)', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base(confirmed, {
        sessions: [
          {
            performanceMemberId: '31',
            partId: '4',
            displayName: '정규채',
            isSupport: true,
            isGuest: false,
          },
          {
            performanceMemberId: '32',
            partId: '5',
            displayName: '김도윤',
            isSupport: false,
            isGuest: true,
          },
        ],
      }),
    })
    const rows = await screen.findAllByText(/^(드럼|보컬) · /)
    expect(rows).toHaveLength(2)
    expect(screen.getAllByText(T.supportBadge)).toHaveLength(1)
    expect(screen.getAllByText(T.guestBadge)).toHaveLength(1)
  })

  it('shows no 지원 badge when the song has no team', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base(
        { status: 'CONFIRMED' },
        {
          sessions: [
            {
              performanceMemberId: '31',
              partId: '4',
              displayName: '정규채',
              isSupport: true,
              isGuest: false,
            },
          ],
        },
      ),
    })
    await screen.findByText('드럼 · 정규채')
    expect(screen.queryByText(T.supportBadge)).toBeNull()
  })

  it('shows the empty player message and, for an officer, the staffing link', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: base(confirmed) })
    await screen.findByText(T.playersEmpty)
    expect(
      screen.getByRole('link', { name: T.assignPlayers }).getAttribute('href'),
    ).toBe('/clubs/10/performances/31/songs/41/players')
  })

  it('hides the player area of a candidate song', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByText(T.playersTitle)).toBeNull()
  })

  it('shows audition results, and the register link only to an officer', async () => {
    const auditions = [
      {
        id: '12',
        type: 'SESSION',
        applicantName: '박서연',
        result: 'PASSED',
        judgedAt: '2026-10-10T20:00:00+09:00',
      },
      { id: '13', type: 'SONG', result: null, judgedAt: null },
    ]
    openSong(PATH, 'CLUB_ADMIN', { routes: base({}, { auditions }) })
    await screen.findByText('박서연 · 2026.10.10')
    expect(screen.getByText('합격')).toBeTruthy()
    expect(screen.getByText('심사 대기')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: T.auditionRegister })
        .getAttribute('href'),
    ).toBe('/clubs/10/performances/31/auditions/new?songId=41')
  })

  it('offers the audition register link to an officer even without records', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: base() })
    expect(
      (
        await screen.findByRole('link', { name: T.auditionRegister })
      ).getAttribute('href'),
    ).toBe('/clubs/10/performances/31/auditions/new?songId=41')
  })

  it('hides the audition register link once the performance is over', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'FINISHED' },
      routes: base(),
    })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByRole('link', { name: T.auditionRegister })).toBeNull()
  })

  it('keeps the records but hides the register link of a finished performance', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'FINISHED' },
      routes: base(
        {},
        {
          auditions: [{ id: '13', type: 'SONG', result: null, judgedAt: null }],
        },
      ),
    })
    await screen.findByText(T.auditionsTitle)
    expect(screen.queryByRole('link', { name: T.auditionRegister })).toBeNull()
  })

  it('hides the audition area without records', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByText(T.auditionsTitle)).toBeNull()
  })

  it('shows upcoming schedules first, folds past ones and strikes canceled ones', async () => {
    const day = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString().replace('Z', '+09:00')
    openSong(PATH, 'MEMBER', {
      routes: base(
        {},
        {
          schedules: [
            {
              id: '2',
              eventType: 'PRACTICE',
              title: '나중 합주',
              status: 'CONFIRMED',
              startAt: day(5),
              endAt: day(5.1),
            },
            {
              id: '1',
              eventType: 'PRACTICE',
              title: '먼저 합주',
              status: 'CANCELED',
              startAt: day(2),
              endAt: day(2.1),
            },
            {
              id: '3',
              eventType: 'PRACTICE',
              title: '지난 합주',
              status: 'CONFIRMED',
              startAt: day(-4),
              endAt: day(-3.9),
            },
          ],
        },
      ),
    })
    await screen.findByText(T.pastSchedules(1))
    const upcoming = screen
      .getAllByRole('link', { name: /합주/ })
      .map((a) => a.textContent ?? '')
    expect(upcoming[0]).toContain('먼저 합주')
    expect(upcoming[1]).toContain('나중 합주')
    expect(
      (screen.getByText(/먼저 합주/).closest('li') as HTMLElement).className,
    ).toContain('badge-strike')
    const folded = screen
      .getByText(T.pastSchedules(1))
      .closest('details') as HTMLElement
    expect(within(folded).getByText(/지난 합주/)).toBeTruthy()
  })
})

describe('SONG-003 proposer and officer menu', () => {
  it('lets the proposer withdraw the proposal and tells that changes need an officer', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      routes: base(
        {
          proposedBy: { membershipId: 'm9', displayName: '송예림' },
          version: '6',
        },
        {},
        {
          [`POST ${S}/withdraw`]: () => json({}),
        },
      ),
    })
    await screen.findByText(T.changeAfterProposal)
    fireEvent.click(await screen.findByText(T.menuWithdraw))
    await screen.findByText(T.withdrawBody)
    await inDialog(T.withdrawAction)
    await screen.findByText(T.withdrawn)
    expect(body(fetchMock, `${S}/withdraw`)).toEqual({ version: '6' })
    // Title, artist, link and memo cannot be edited by the proposer.
    expect(screen.queryByText(T.menuEdit)).toBeNull()
  })

  it('has no withdraw entry for somebody else, after the deadline or in a locked performance', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByText(T.menuWithdraw)).toBeNull()
  })

  it('has no withdraw entry once the candidate deadline has passed', async () => {
    openSong(PATH, 'MEMBER', {
      policy: { candidateDeadline: '2020-01-01T00:00:00+09:00' },
      routes: base({
        proposedBy: { membershipId: 'm9', displayName: '송예림' },
      }),
    })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByText(T.menuWithdraw)).toBeNull()
  })

  it('edits only the changed fields with the version', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { title: '곡 제목', version: '8' },
        {},
        {
          [`PATCH ${S}`]: () => json({}),
        },
      ),
    })
    fireEvent.click(await screen.findByText(T.menuEdit))
    const title = await screen.findByRole('textbox', { name: T.fieldTitle })
    const saveButton = within(await screen.findByRole('dialog')).getByRole(
      'button',
      { name: T.save },
    )
    expect(saveButton.hasAttribute('disabled')).toBe(true)
    fireEvent.change(title, { target: { value: '새 제목' } })
    fireEvent.change(screen.getByRole('textbox', { name: T.fieldLink }), {
      target: { value: 'https://example.com/new' },
    })
    await inDialog(T.save)
    await screen.findByText(T.edited)
    expect(body(fetchMock, S)).toEqual({
      version: '8',
      title: '새 제목',
      referenceUrl: 'https://example.com/new',
    })
  })

  it('drops a server field error of the edit form once the field is edited', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { title: '곡 제목', version: '8' },
        {},
        {
          [`PATCH ${S}`]: () =>
            new Response(
              JSON.stringify({
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'x',
                  details: [
                    { field: 'artist', message: '가수를 확인해 주세요' },
                  ],
                },
              }),
              { status: 400 },
            ),
        },
      ),
    })
    fireEvent.click(await screen.findByText(T.menuEdit))
    const artist = await screen.findByRole('textbox', { name: T.fieldArtist })
    fireEvent.change(artist, { target: { value: '새 가수' } })
    await inDialog(T.save)
    await screen.findByText('* 가수를 확인해 주세요')
    fireEvent.change(artist, { target: { value: '새 가수 2' } })
    await waitFor(() =>
      expect(screen.queryByText('* 가수를 확인해 주세요')).toBeNull(),
    )
  })

  it('refuses a non-https link in the edit form', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: base() })
    fireEvent.click(await screen.findByText(T.menuEdit))
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.fieldLink }),
      {
        target: { value: 'http://example.com' },
      },
    )
    await screen.findByText(`* ${T.linkError}`)
    expect(
      within(screen.getByRole('dialog'))
        .getByRole('button', { name: T.save })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('deletes a candidate with an optional reason', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { version: '4' },
        {},
        { [`POST ${S}/remove`]: () => json({}) },
      ),
    })
    fireEvent.click(await screen.findByText(T.menuDelete))
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.deleteReason }),
      {
        target: { value: '중복 제안' },
      },
    )
    await inDialog(T.deleteAction)
    await screen.findByText(T.deleted)
    expect(body(fetchMock, `${S}/remove`)).toEqual({
      version: '4',
      reason: '중복 제안',
    })
  })

  it('shows no edit or delete entry for a selected song', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: base({ status: 'CONFIRMED' }) })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByText(T.menuEdit)).toBeNull()
    expect(screen.queryByText(T.menuDelete)).toBeNull()
  })
})

describe('SONG-003 officer decisions', () => {
  const bar = async () => screen.findByRole('toolbar')

  it('shows the decision bar of each state, and nothing for members or a finished performance', async () => {
    openSong(PATH, 'MEMBER', { routes: base() })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('offers 탈락 · 선정 for a candidate and 선정 취소 · 탈락 for a selected song', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: base() })
    expect(
      within(await bar())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([T.actionReject, T.actionConfirm])
  })

  it('hides the bar for a finished performance and a withdrawn song', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'FINISHED' },
      routes: base(),
    })
    await screen.findByText(T.requirementsTitle)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('selects with the scope team as the default and sends the version', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { candidateTeamId: '7', candidateTeamName: 'Crane Team', version: '8' },
        {},
        {
          [`GET ${TEAMS}`]: () =>
            json({
              items: [team('7', 'Crane Team'), team('8', '초안 팀', 'DRAFT')],
            }),
          [`POST ${S}/confirm`]: () => json({}),
        },
      ),
    })
    await click(T.actionConfirm)
    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByRole('combobox', {
      name: T.confirmTeamLabel,
    }) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('7'))
    // Only approved teams are offered.
    expect(within(select).queryByRole('option', { name: '초안 팀' })).toBeNull()
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: T.confirmReason }),
      {
        target: { value: '좋아요' },
      },
    )
    await inDialog(T.actionConfirm)
    await screen.findByText(T.confirmDone)
    expect(body(fetchMock, `${S}/confirm`)).toEqual({
      version: '8',
      assignedTeamId: '7',
      reason: '좋아요',
    })
  })

  it('selects with 나중에 정하기 as a null team', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { version: '8' },
        {},
        {
          [`GET ${TEAMS}`]: () => json({ items: [team('7', 'Crane Team')] }),
          [`POST ${S}/confirm`]: () => json({}),
        },
      ),
    })
    await click(T.actionConfirm)
    await screen.findByText(T.confirmOrderHint)
    await inDialog(T.actionConfirm)
    await screen.findByText(T.confirmDone)
    expect(body(fetchMock, `${S}/confirm`)).toEqual({
      version: '8',
      assignedTeamId: null,
    })
  })

  it('warns when the latest audition result is a failure', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        {},
        {
          auditions: [
            {
              id: '1',
              type: 'SESSION',
              result: 'PASSED',
              judgedAt: '2026-10-01T10:00:00+09:00',
            },
            {
              id: '2',
              type: 'SESSION',
              result: 'FAILED',
              judgedAt: '2026-10-09T10:00:00+09:00',
            },
          ],
        },
        { [`GET ${TEAMS}`]: () => json({ items: [] }) },
      ),
    })
    await click(T.actionConfirm)
    await screen.findByText(T.auditionFailed)
  })

  it('needs team, order, players and a reason together in a locked performance (X-05)', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'LOCKED' },
      routes: base(
        { version: '8' },
        {},
        {
          [`GET ${TEAMS}`]: () => json({ items: [team('7', 'Crane Team')] }),
          [`GET ${PERF}/members`]: () => participants(),
          [`POST ${S}/confirm`]: () => json({}),
        },
      ),
    })
    await click(T.actionConfirm)
    const dialog = await screen.findByRole('dialog')
    const submit = () =>
      within(dialog).getByRole('button', { name: T.actionConfirm })
    expect(submit().hasAttribute('disabled')).toBe(true)
    // The "later" choice does not exist here.
    expect(
      within(dialog).queryByRole('option', { name: T.assignedLater }),
    ).toBeNull()
    await within(dialog).findByRole('option', { name: 'Crane Team' })
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: T.confirmTeamLabel }),
      { target: { value: '7' } },
    )
    fireEvent.change(
      within(dialog).getByRole('spinbutton', { name: T.fieldOrder }),
      { target: { value: '2' } },
    )
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: T.lockedReason }),
      { target: { value: '긴급 추가' } },
    )
    expect(submit().hasAttribute('disabled')).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: T.addPlayer }))
    // The picker is the only reachable dialog while it is open.
    const part = await screen.findByRole('combobox', { name: T.pickerPart })
    const picker = within(part.closest('[role=dialog]') as HTMLElement)
    fireEvent.change(part, { target: { value: '4' } })
    // The team has no known members here: switch to everybody.
    fireEvent.click(picker.getByRole('tab', { name: T.pickerTabAll }))
    fireEvent.click(
      await picker.findByRole('button', { name: `정규채 ${T.pickerAction}` }),
    )
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
    await screen.findByText('드럼 · 정규채')
    await waitFor(() => expect(submit().hasAttribute('disabled')).toBe(false))
    fireEvent.click(submit())
    await screen.findByText(T.confirmDone)
    expect(body(fetchMock, `${S}/confirm`)).toEqual({
      version: '8',
      assignedTeamId: '7',
      reason: '긴급 추가',
      setlistOrder: 2,
      sessions: [{ performanceMemberId: '31', partId: '4' }],
    })
  })

  it('shows the rule copy when the locked conditions break (X-04)', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        {},
        {},
        {
          [`GET ${TEAMS}`]: () => json({ items: [] }),
          [`POST ${S}/confirm`]: () =>
            new Response(
              JSON.stringify({
                error: {
                  code: 'RULE_VIOLATION',
                  message: 'x',
                  details: [{ reason: 'LOCK_REQUIREMENTS_FAILED' }],
                },
              }),
              { status: 422 },
            ),
        },
      ),
    })
    await click(T.actionConfirm)
    await inDialog(T.actionConfirm)
    await screen.findByText(COPY.ruleViolationTitle)
    expect(screen.getByText(/공연 확정 조건을 깨뜨려요/)).toBeTruthy()
  })

  it('rejects a candidate with a decision note', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { title: '곡 제목', version: '8' },
        {},
        { [`POST ${S}/reject`]: () => json({}) },
      ),
    })
    await click(T.actionReject)
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.confirmReason }),
      {
        target: { value: '난이도' },
      },
    )
    await inDialog(T.actionReject)
    await screen.findByText(T.rejectDone)
    expect(body(fetchMock, `${S}/reject`)).toEqual({
      version: '8',
      decisionNote: '난이도',
    })
  })

  it('rejects a selected song through the server confirmation, listing its warnings (9-4)', async () => {
    let calls = 0
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { status: 'CONFIRMED', setlistOrder: 1, version: '8' },
        {},
        {
          [`POST ${S}/reject`]: () => {
            calls++
            return calls === 1
              ? new Response(
                  JSON.stringify({
                    error: {
                      code: 'CONFIRMATION_REQUIRED',
                      message: 'x',
                      details: [{ reason: 'CONFIRMED_SONG_REJECTION' }],
                      warnings: [
                        {
                          type: 'ASSIGNMENT_RELEASED',
                          teamId: '7',
                          setlistOrder: 1,
                        },
                        {
                          type: 'SCHEDULE_LINK_RELEASED',
                          scheduleIds: ['701'],
                        },
                      ],
                    },
                  }),
                  { status: 409 },
                )
              : json({})
          },
        },
      ),
    })
    await click(T.actionReject)
    await screen.findByText(T.rejectConfirmedTitle)
    // The sheet itself lists nothing: the server's warnings are the one list.
    expect(screen.queryByText(T.impactTeamOrder)).toBeNull()
    await inDialog(T.actionReject)
    await screen.findByText('담당 팀 배정과 곡 순서가 해제돼요')
    expect(screen.getByText('연결된 일정 1개가 해제돼요')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: COPY.proceed }))
    await screen.findByText(T.rejectDone)
    const posts = callsTo(fetchMock, `${S}/reject`).filter(
      ([, i]) => i?.method === 'POST',
    )
    expect(posts).toHaveLength(2)
    expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({ version: '8' })
    expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({
      version: '8',
      confirmed: true,
    })
  })

  it('sends the reason only in a locked performance, the note always', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { version: '8' },
        {},
        { [`POST ${S}/reject`]: () => json({}) },
      ),
    })
    await click(T.actionReject)
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.confirmReason }),
      {
        target: { value: '난이도' },
      },
    )
    await inDialog(T.actionReject)
    await screen.findByText(T.rejectDone)
    const sent = body(fetchMock, `${S}/reject`) as Record<string, unknown>
    expect(sent.decisionNote).toBe('난이도')
    expect('reason' in sent).toBe(false)
  })

  it('answers a CONFIRMATION_REQUIRED of the server with the confirmation and repeats the request', async () => {
    let calls = 0
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        {},
        {},
        {
          [`POST ${S}/reject`]: () => {
            calls++
            return calls === 1
              ? new Response(
                  JSON.stringify({
                    error: {
                      code: 'CONFIRMATION_REQUIRED',
                      message: 'x',
                      details: [{ message: '일정 연결이 풀려요' }],
                    },
                  }),
                  { status: 409 },
                )
              : json({})
          },
        },
      ),
    })
    await click(T.actionReject)
    await inDialog(T.actionReject)
    await screen.findByText('일정 연결이 풀려요')
    fireEvent.click(await screen.findByRole('button', { name: COPY.proceed }))
    await screen.findByText(T.rejectDone)
    expect(callsTo(fetchMock, `${S}/reject`)).toHaveLength(2)
    expect(body(fetchMock, `${S}/reject`)).toMatchObject({ confirmed: true })
  })

  it('cancels a selection and needs a reason in a locked performance (X-02)', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'LOCKED' },
      routes: base(
        { status: 'CONFIRMED', setlistOrder: 1, version: '8' },
        {},
        {
          [`POST ${S}/unconfirm`]: () => json({}),
        },
      ),
    })
    await click(T.actionUnconfirm)
    const dialog = await screen.findByRole('dialog')
    const submit = within(dialog).getByRole('button', {
      name: T.actionUnconfirm,
    })
    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: T.lockedReason }),
      {
        target: { value: '긴급' },
      },
    )
    fireEvent.click(submit)
    await screen.findByText(T.unconfirmDone)
    expect(body(fetchMock, `${S}/unconfirm`)).toEqual({
      version: '8',
      decisionNote: '긴급',
      reason: '긴급',
    })
  })

  it('reconsiders a rejected song', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { status: 'REJECTED', version: '8' },
        {},
        { [`POST ${S}/reconsider`]: () => json({}) },
      ),
    })
    await click(T.actionReconsider)
    await screen.findByText(T.reconsiderTitle)
    await inDialog(T.actionReconsider)
    await screen.findByText(T.reconsiderDone)
    expect(body(fetchMock, `${S}/reconsider`)).toEqual({ version: '8' })
  })

  it('shows the version conflict dialog and does not report success', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        {},
        {},
        { [`POST ${S}/reject`]: () => apiError('VERSION_CONFLICT', 409) },
      ),
    })
    await click(T.actionReject)
    await inDialog(T.actionReject)
    await screen.findByText(COPY.versionConflictTitle)
    expect(screen.queryByText(T.rejectDone)).toBeNull()
  })

  it('shows the state conflict dialog from the server', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        {},
        {},
        { [`POST ${S}/reject`]: () => apiError('STATE_CONFLICT', 409) },
      ),
    })
    await click(T.actionReject)
    await inDialog(T.actionReject)
    await screen.findByText(COPY.stateConflictTitle)
  })
})

describe('SONG-003 requirements and team editing', () => {
  it('edits the requirement steppers and saves only parts above zero', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { version: '8' },
        { requirements: [{ partId: '4', requiredCount: 1 }] },
        {
          [`PUT ${S}/requirements`]: () =>
            json({ songVersion: '9', items: [] }),
        },
      ),
    })
    await click(T.requirementsEdit)
    const dialog = await screen.findByRole('dialog')
    const plus = await within(dialog).findByRole('button', {
      name: T.stepperPlus('보컬'),
    })
    fireEvent.click(plus)
    fireEvent.click(plus)
    fireEvent.click(
      within(dialog).getByRole('button', { name: T.stepperMinus('드럼') }),
    )
    // Never below zero.
    fireEvent.click(
      within(dialog).getByRole('button', { name: T.stepperMinus('드럼') }),
    )
    expect(within(dialog).getByLabelText('드럼').textContent).toBe('0')
    fireEvent.click(within(dialog).getByRole('button', { name: T.save }))
    await screen.findByText(T.requirementsSaved)
    expect(body(fetchMock, `${S}/requirements`)).toEqual({
      version: '8',
      items: [{ partId: '5', requiredCount: 2 }],
    })
  })

  it('keeps the requirement of a part that is no longer active', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        { version: '8' },
        {
          requirements: [
            { partId: '4', requiredCount: 1 },
            { partId: '99', requiredCount: 2 },
          ],
        },
        {
          [`PUT ${S}/requirements`]: () =>
            json({ songVersion: '9', items: [] }),
        },
      ),
    })
    await click(T.requirementsEdit)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: T.stepperPlus('보컬'),
      }),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: T.save }))
    await screen.findByText(T.requirementsSaved)
    expect(body(fetchMock, `${S}/requirements`)).toEqual({
      version: '8',
      items: [
        { partId: '4', requiredCount: 1 },
        { partId: '5', requiredCount: 1 },
        { partId: '99', requiredCount: 2 },
      ],
    })
  })

  it('needs a reason for requirement changes in a locked performance', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'LOCKED' },
      routes: base(
        { status: 'CONFIRMED', version: '8' },
        {},
        {
          [`PUT ${S}/requirements`]: () =>
            json({ songVersion: '9', items: [] }),
        },
      ),
    })
    await click(T.requirementsEdit)
    const dialog = await screen.findByRole('dialog')
    const saveBtn = within(dialog).getByRole('button', { name: T.save })
    expect(saveBtn.hasAttribute('disabled')).toBe(true)
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: T.lockedReason }),
      { target: { value: '편성 변경' } },
    )
    fireEvent.click(saveBtn)
    await screen.findByText(T.requirementsSaved)
    expect(body(fetchMock, `${S}/requirements`)).toMatchObject({
      reason: '편성 변경',
    })
  })

  it('changes the team of a selected song', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      routes: base(
        {
          status: 'CONFIRMED',
          assignedTeamId: '7',
          assignedTeamName: 'Crane Team',
          version: '8',
        },
        {},
        {
          [`GET ${TEAMS}`]: () =>
            json({ items: [team('7', 'Crane Team'), team('8', 'Moon Team')] }),
          [`PUT ${S}/assigned-team`]: () => ok(),
        },
      ),
    })
    await click(T.changeTeam)
    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByRole('combobox', {
      name: T.confirmTeamLabel,
    }) as HTMLSelectElement
    await within(dialog).findByRole('option', { name: 'Moon Team' })
    fireEvent.change(select, { target: { value: '8' } })
    fireEvent.click(
      within(dialog).getByRole('button', { name: T.changeTeamAction }),
    )
    await screen.findByText(T.teamChanged)
    expect(body(fetchMock, `${S}/assigned-team`)).toEqual({
      version: '8',
      assignedTeamId: '8',
    })
  })

  it('does not offer the team change to members', async () => {
    openSong(PATH, 'MEMBER', {
      routes: base({ status: 'CONFIRMED', assignedTeamName: 'Crane Team' }),
    })
    await screen.findByText('Crane Team')
    expect(screen.queryByRole('button', { name: T.changeTeam })).toBeNull()
  })
})
