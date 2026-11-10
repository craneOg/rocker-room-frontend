// Shared fixtures of the SONG-001..005 tests (performance 31 of club 10).
import { apiError, callsTo, json, type Route } from '../../test/harness'
import {
  BASE,
  body,
  detail,
  lastQuery,
  memberRow,
  mine,
  open,
  page,
  PERF,
} from '../performance/viewTestKit'

export { BASE, PERF, body, callsTo, lastQuery }
export const SONGS = `${PERF}/songs`
export const EVALS = `${PERF}/evaluations`
export const TEAMS = `${PERF}/teams`

export const PARTS = [
  { id: '4', name: '드럼', displayOrder: 1, isActive: true, memberCount: 2 },
  { id: '5', name: '보컬', displayOrder: 2, isActive: true, memberCount: 1 },
  { id: '9', name: '건반', displayOrder: 3, isActive: false, memberCount: 0 },
]

/** Policy values the song screens read; everything open, approval votes capped at 3. */
export const SONG_POLICY = {
  candidateState: 'OPEN',
  playabilityState: 'OPEN',
  voteState: 'OPEN',
  voteMethod: 'APPROVAL',
  voteMaxChoices: 3,
  candidateLimitPerMember: 3,
}

export const card = (
  id: string,
  title: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  performanceId: '31',
  title,
  artist: '아티스트',
  status: 'PROPOSED',
  candidateTeamId: null,
  candidateTeamName: null,
  assignedTeamId: null,
  assignedTeamName: null,
  setlistOrder: null,
  referenceUrl: null,
  createdAt: '2026-10-05T14:20:00+09:00',
  proposedBy: { membershipId: '21', displayName: '정규채' },
  evaluation: {
    playability: { POSSIBLE: 2, IMPOSSIBLE: 1, UNDECIDED: 0 },
    voteCount: 3,
    scoreAverage: null,
  },
  myPlayability: [],
  myVote: null,
  sessionCount: null,
  requirementsSatisfied: null,
  version: '3',
  ...extra,
})

export const songPage = (
  items: unknown[],
  extra: Record<string, unknown> = {},
) => page(items, { myProposalCount: 1, myVoteCount: 0, ...extra })

/** Body of API-077. */
export const songDetail = (
  song: Record<string, unknown> = {},
  rest: Record<string, unknown> = {},
) =>
  json({
    song: {
      ...card('41', '곡 제목', { memo: null }),
      decisionNote: null,
      withdrawalType: null,
      ...song,
    },
    requirements: [],
    sessions: [],
    schedules: [],
    auditions: [],
    ...rest,
  })

export const evaluation = (extra: Record<string, unknown> = {}) =>
  json({
    playability: { POSSIBLE: 2, IMPOSSIBLE: 1, UNDECIDED: 0 },
    playabilityByPart: [
      {
        partId: '4',
        partName: '드럼',
        POSSIBLE: 2,
        IMPOSSIBLE: 1,
        UNDECIDED: 0,
      },
    ],
    voteCount: 3,
    scoreAverage: null,
    scoreDistribution: null,
    namesVisible: { playability: true, vote: true },
    playabilityResponses: [
      {
        performanceMemberId: '31',
        displayName: '정규채',
        partId: '4',
        answer: 'POSSIBLE',
        reason: null,
        enteredByAdmin: false,
      },
      {
        performanceMemberId: '32',
        displayName: '김도윤',
        partId: '4',
        answer: 'IMPOSSIBLE',
        reason: '시험 기간',
        enteredByAdmin: true,
      },
    ],
    voteResponses: [
      {
        performanceMemberId: '31',
        displayName: '정규채',
        score: 1,
        enteredByAdmin: false,
      },
    ],
    nonResponders: {
      playability: [{ performanceMemberId: '33', displayName: '이도윤' }],
      vote: [{ performanceMemberId: '33', displayName: '이도윤' }],
    },
    ...extra,
  })

export const team = (id: string, name: string, status = 'APPROVED') => ({
  id,
  name,
  status,
  isMine: true,
})

type Options = {
  /** Fields of the performance (`status`, ...). */
  perf?: Record<string, unknown>
  /** Fields of the policy on top of SONG_POLICY. */
  policy?: Record<string, unknown>
  /** The requester's participation; `null` is "not a participant". */
  me?: Record<string, unknown> | null
  routes?: Record<string, Route>
}

/** Opens a song screen with the performance, own participation, own member row and parts served. */
export function openSong(
  path: string,
  role: 'CLUB_ADMIN' | 'MEMBER',
  o: Options = {},
) {
  return open(path, role, {
    [`GET ${PERF}`]: () =>
      json(detail(o.perf ?? {}, { ...SONG_POLICY, ...(o.policy ?? {}) })),
    [`GET ${PERF}/members/me`]: () =>
      o.me === null ? apiError('NOT_FOUND', 404) : json(mine(o.me ?? {})),
    [`GET ${BASE}/memberships/m9`]: () =>
      json({
        id: 'm9',
        displayName: null,
        userName: '송예림',
        memberType: 'REGULAR',
        role,
        status: 'ACTIVE',
        profileImageUrl: null,
        parts: [{ id: '4', name: '드럼' }],
        performances: [],
      }),
    [`GET ${BASE}/parts`]: () => json({ items: PARTS }),
    ...(o.routes ?? {}),
  })
}

/** Approved participants as API-053 returns them (the player picker). */
export const participants = () =>
  page(
    [
      memberRow('31', '21', '정규채', { playedSongCount: 2 }),
      memberRow('32', '22', '김도윤', { playedSongCount: 3 }),
      memberRow('33', '23', '이서연', {
        parts: [{ id: '5', name: '보컬' }],
      }),
    ],
    { statusCounts: { APPROVED: 3 } },
  )
