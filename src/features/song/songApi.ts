import { api } from '../../shared/api/client'
import { performanceKey } from '../performance/api'

// API-075..086, 089..099, 156..158 (Notion API spec) plus the two team reads of API-061 / 154 that
// the song screens need. IDs and versions are strings.
const perfPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}`
const songPath = (clubId: string, performanceId: string, songId: string) =>
  `${perfPath(clubId, performanceId)}/songs/${songId}`

export type SongStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN'
export type Answer = 'POSSIBLE' | 'IMPOSSIBLE' | 'UNDECIDED'
export type Person = { membershipId: string; displayName: string }
export type Evaluation = {
  playability: Partial<Record<Answer, number>>
  voteCount: number
  scoreAverage: number | null
}

/** Item of API-075. */
export type SongCard = {
  id: string
  performanceId: string
  title: string
  artist: string | null
  status: SongStatus
  candidateTeamId: string | null
  candidateTeamName: string | null
  assignedTeamId: string | null
  assignedTeamName: string | null
  setlistOrder: number | null
  referenceUrl: string | null
  createdAt: string
  proposedBy: Person
  evaluation: Evaluation
  myPlayability: { partId: string; answer: Answer }[]
  myVote: { score: number } | null
  sessionCount: number | null
  requirementsSatisfied: boolean | null
  version: string
}

export type SongPage = {
  items: SongCard[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  myProposalCount: number
  /** Null for the SCORE vote method. */
  myVoteCount: number | null
}

export type SongSort =
  'createdAt,desc' | 'voteCount,desc' | 'possibleCount,desc' | 'title,asc'

export const SONG_PAGE_SIZE = 20

export type SongFilter = {
  status: SongStatus
  candidateTeamId?: string
  q?: string
  proposedByMe?: boolean
  unresponded?: boolean
  sort: SongSort
}

export const listSongs = (
  clubId: string,
  performanceId: string,
  f: SongFilter,
  page: number,
  signal?: AbortSignal,
) =>
  api.get<SongPage>(`${perfPath(clubId, performanceId)}/songs`, {
    query: {
      status: f.status,
      candidateTeamId: f.candidateTeamId,
      q: f.q || undefined,
      proposedByMe: f.proposedByMe ? true : undefined,
      unresponded: f.unresponded ? true : undefined,
      sort: f.sort,
      page,
      size: SONG_PAGE_SIZE,
    },
    signal,
  })

export type Requirement = { partId: string; requiredCount: number }
export type SessionInput = { performanceMemberId: string; partId: string }
export type SessionRow = SessionInput & {
  displayName: string
  isSupport: boolean
  isGuest: boolean
}
export type SongBody = {
  id: string
  performanceId: string
  title: string
  artist: string | null
  status: SongStatus
  candidateTeamId: string | null
  candidateTeamName: string | null
  assignedTeamId: string | null
  assignedTeamName: string | null
  setlistOrder: number | null
  referenceUrl: string | null
  memo: string | null
  proposedBy: Person
  createdAt: string
  decisionNote: string | null
  withdrawalType: 'PROPOSER' | 'ADMIN' | null
  version: string
}
export type ScheduleSummary = {
  id: string
  eventType: string
  title: string
  status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELED'
  startAt: string
  endAt: string
}
export type AuditionSummary = {
  id: string
  type: string
  applicantName?: string
  result: 'PASSED' | 'FAILED' | null
  judgedAt: string | null
}
export type SongDetail = {
  song: SongBody
  requirements: Requirement[]
  sessions: SessionRow[]
  schedules: ScheduleSummary[]
  auditions: AuditionSummary[]
}

/** API-077. */
export const getSong = (
  clubId: string,
  performanceId: string,
  songId: string,
) => api.get<SongDetail>(songPath(clubId, performanceId, songId))

export type Warning =
  | {
      type: 'PART_SHORTAGE' | 'PART_EXCESS'
      partName: string
      requiredCount: number
      assignedCount: number
    }
  | { type: 'SONG_COUNT_EXCEEDED'; displayName: string; songCount: number }
  | { type: string }
  | string

/** Write result of API-076 / 081 / 082 / 084 / 085. */
export type MutationResult = {
  resource: { id: string; status: SongStatus; version: string }
  warnings: Warning[]
}

export type CreateSongBody = {
  title: string
  artist?: string | null
  referenceUrl?: string | null
  memo?: string | null
  candidateTeamId?: string | null
  status?: 'PROPOSED' | 'CONFIRMED'
  setlistOrder?: number | null
  assignedTeamId?: string | null
  sessions?: SessionInput[]
  reason?: string
}

/** API-076: a member proposes (PROPOSED); an officer may also confirm at once. */
export const createSong = (
  clubId: string,
  performanceId: string,
  body: CreateSongBody,
) => api.post<MutationResult>(`${perfPath(clubId, performanceId)}/songs`, body)

export type SongPatch = {
  title?: string
  artist?: string | null
  referenceUrl?: string | null
  memo?: string | null
}
/** API-078: only the sent fields change. */
export const updateSong = (
  clubId: string,
  performanceId: string,
  songId: string,
  version: string,
  patch: SongPatch,
) =>
  api.patch<unknown>(songPath(clubId, performanceId, songId), {
    version,
    ...patch,
  })

/** API-079. */
export const saveRequirements = (
  clubId: string,
  performanceId: string,
  songId: string,
  body: { version: string; items: Requirement[]; reason?: string },
) =>
  api.put<{ songVersion: string; items: Requirement[] }>(
    `${songPath(clubId, performanceId, songId)}/requirements`,
    body,
  )

export type ConfirmBody = {
  version: string
  setlistOrder?: number | null
  assignedTeamId?: string | null
  sessions?: SessionInput[]
  reason?: string
}
/** API-080. */
export const confirmSong = (
  clubId: string,
  performanceId: string,
  songId: string,
  body: ConfirmBody,
) =>
  api.post<unknown>(`${songPath(clubId, performanceId, songId)}/confirm`, body)

type Decision = { version: string; reason?: string; decisionNote?: string }
/** API-081. */
export const unconfirmSong = (
  clubId: string,
  performanceId: string,
  songId: string,
  body: Decision,
) =>
  api.post<MutationResult>(
    `${songPath(clubId, performanceId, songId)}/unconfirm`,
    body,
  )
/** API-082; `confirmed` is required to reject a CONFIRMED song. */
export const rejectSong = (
  clubId: string,
  performanceId: string,
  songId: string,
  body: Decision & { confirmed?: boolean },
) =>
  api.post<MutationResult>(
    `${songPath(clubId, performanceId, songId)}/reject`,
    body,
  )
/** API-083 (proposer) / 157 (officer deletes). */
export const withdrawSong = (
  clubId: string,
  performanceId: string,
  songId: string,
  body: { version: string; reason?: string },
  by: 'proposer' | 'officer',
) =>
  api.post<unknown>(
    `${songPath(clubId, performanceId, songId)}/${by === 'proposer' ? 'withdraw' : 'remove'}`,
    body,
  )
/** API-156. */
export const reconsiderSong = (
  clubId: string,
  performanceId: string,
  songId: string,
  version: string,
) =>
  api.post<unknown>(`${songPath(clubId, performanceId, songId)}/reconsider`, {
    version,
  })
/** API-084. */
export const assignTeam = (
  clubId: string,
  performanceId: string,
  songId: string,
  body: { version: string; assignedTeamId: string | null; reason?: string },
) =>
  api.put<MutationResult>(
    `${songPath(clubId, performanceId, songId)}/assigned-team`,
    body,
  )
/** API-085: replaces every player of the song. */
export const saveSessions = (
  clubId: string,
  performanceId: string,
  songId: string,
  body: { version: string; items: SessionInput[]; reason?: string },
) =>
  api.put<MutationResult>(
    `${songPath(clubId, performanceId, songId)}/sessions`,
    body,
  )
/** API-086: POST .../teams with `sourceSongId`. */
export const createTeamFromSong = (
  clubId: string,
  performanceId: string,
  body: {
    sourceSongId: string
    version: string
    name: string
    leaderMembershipId?: string | null
  },
) =>
  api.post<{ team: { id: string; name: string } }>(
    `${perfPath(clubId, performanceId)}/teams`,
    body,
  )

// ---- evaluations -----------------------------------------------------------------------------

export type EvaluationSummary = Evaluation & {
  playabilityByPart: ({ partId: string; partName: string } & Partial<
    Record<Answer, number>
  >)[]
  scoreDistribution: Record<string, number> | null
  namesVisible: { playability: boolean; vote: boolean }
  playabilityResponses:
    | {
        performanceMemberId: string
        displayName: string
        partId: string
        answer: Answer
        reason: string | null
        enteredByAdmin: boolean
      }[]
    | null
  voteResponses:
    | {
        performanceMemberId: string
        displayName: string
        score: number
        enteredByAdmin: boolean
      }[]
    | null
  nonResponders: {
    playability: { performanceMemberId: string; displayName: string }[] | null
    vote: { performanceMemberId: string; displayName: string }[] | null
  } | null
}
/** API-089. */
export const getEvaluations = (
  clubId: string,
  performanceId: string,
  songId: string,
) =>
  api.get<EvaluationSummary>(
    `${songPath(clubId, performanceId, songId)}/evaluations`,
  )

export type PlayabilityRow = {
  performanceMemberId: string
  displayName?: string
  partId: string
  answer: Answer
  reason: string | null
  enteredByAdmin?: boolean
}
/** API-090: `performanceMemberId` is for officers only. */
export const getPlayability = (
  clubId: string,
  performanceId: string,
  songId: string,
  performanceMemberId?: string,
) =>
  api.get<{ items: PlayabilityRow[] }>(
    `${songPath(clubId, performanceId, songId)}/playability`,
    { query: { performanceMemberId } },
  )
export type VoteRow = {
  performanceMemberId: string
  displayName?: string
  score: number
  enteredByAdmin?: boolean
}
/** API-095. */
export const getVotes = (
  clubId: string,
  performanceId: string,
  songId: string,
  performanceMemberId?: string,
) =>
  api.get<{ items: VoteRow[] }>(
    `${songPath(clubId, performanceId, songId)}/votes`,
    { query: { performanceMemberId } },
  )

/** `me` is the own row (API-091/093/096/098); an officer's proxy for a participant is API-092/094/097/099. */
export type Target = 'me' | { performanceMemberId: string }
const playabilityUrl = (
  clubId: string,
  performanceId: string,
  songId: string,
  target: Target,
  partId: string,
) =>
  `${songPath(clubId, performanceId, songId)}/playability/${
    target === 'me' ? 'me' : `members/${target.performanceMemberId}`
  }/${partId}`
const voteUrl = (
  clubId: string,
  performanceId: string,
  songId: string,
  target: Target,
) =>
  `${songPath(clubId, performanceId, songId)}/votes/${
    target === 'me' ? 'me' : `members/${target.performanceMemberId}`
  }`

export const putPlayability = (
  clubId: string,
  performanceId: string,
  songId: string,
  target: Target,
  partId: string,
  body: { answer: Answer; reason?: string | null },
) =>
  api.put<unknown>(
    playabilityUrl(clubId, performanceId, songId, target, partId),
    body,
  )
export const deletePlayability = (
  clubId: string,
  performanceId: string,
  songId: string,
  target: Target,
  partId: string,
) =>
  api.delete<unknown>(
    playabilityUrl(clubId, performanceId, songId, target, partId),
  )
export const putVote = (
  clubId: string,
  performanceId: string,
  songId: string,
  target: Target,
  score: number,
) => api.put<unknown>(voteUrl(clubId, performanceId, songId, target), { score })
export const deleteVote = (
  clubId: string,
  performanceId: string,
  songId: string,
  target: Target,
) => api.delete<unknown>(voteUrl(clubId, performanceId, songId, target))

/** API-158. */
export type EvaluationBoard = {
  voteMethod: 'APPROVAL' | 'SCORE' | (string & {})
  songs: {
    songId: string
    title: string
    playability: {
      performanceMemberId: string
      partId: string
      answer: Answer
      reason: string | null
      enteredByAdmin: boolean
    }[]
    votes: {
      performanceMemberId: string
      score: number
      enteredByAdmin: boolean
    }[]
  }[]
  /** Null when the requester may not see names. */
  members: { performanceMemberId: string; displayName: string }[] | null
  responseRate: { answered: number; total: number }
  nonResponders:
    | {
        performanceMemberId: string
        displayName: string
        unrespondedSongCount: number
      }[]
    | null
}
export const getBoard = (
  clubId: string,
  performanceId: string,
  type: 'PLAYABILITY' | 'VOTE',
  teamId?: string,
) =>
  api.get<EvaluationBoard>(`${perfPath(clubId, performanceId)}/evaluations`, {
    query: { type, teamId },
  })

// ---- teams (API-061 / 154, read only) ----------------------------------------------------------

export type TeamLite = {
  id: string
  name: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  isMine: boolean
}
// ponytail: first 100 teams only; page through if a performance ever has more.
export const listTeams = async (clubId: string, performanceId: string) =>
  (
    await api.get<{ items: TeamLite[] }>(
      `${perfPath(clubId, performanceId)}/teams`,
      { query: { size: 100 } },
    )
  ).items
export const getDefaultTeamName = async (
  clubId: string,
  performanceId: string,
) =>
  (
    await api.get<{ name: string }>(
      `${perfPath(clubId, performanceId)}/teams/default-name`,
    )
  ).name

// ---- query keys ---------------------------------------------------------------------------------

/** Every song query of a performance hangs under this prefix (the performance prefix covers it too). */
export const songsKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'songs'] as const
export const songKey = (
  clubId: string,
  performanceId: string,
  songId: string,
) => [...songsKey(clubId, performanceId), songId] as const
export const teamsKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'teams'] as const
export const boardKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'evaluation-board'] as const
