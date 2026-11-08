import { api, request } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'
import { performanceKey } from '../performance/api'
import type { ParticipationStatus } from '../performance/types'

// API-061 ~ 074, 154, 155 (Notion API spec). IDs and versions are strings.
const teamsPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}/teams`

export type TeamStatus =
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'

/** ADMIN: made by an officer, SELF: applied by a member, FROM_SESSIONS: made from a song's players. */
export type TeamSource = 'ADMIN' | 'SELF' | 'FROM_SESSIONS'

/** A member without a representative part is grouped into one item whose partId / partName are null. */
export type PartCount = {
  partId: string | null
  partName: string | null
  count: number
}

/** Item of API-061. The candidate song count is null for anyone who is neither a member nor an officer. */
export type TeamCard = {
  id: string
  performanceId: string
  name: string
  status: TeamStatus
  isDefault: boolean
  source: TeamSource
  rejectReason: string | null
  leaderMembershipId: string | null
  leaderDisplayName: string | null
  memberCount: number
  partSummary: PartCount[]
  assignedSongCount: number
  candidateSongCount: number | null
  isMine: boolean
  version: string
  /** Optional: the server sends them, the Notion card example does not. */
  submittedAt?: string | null
  decidedAt?: string | null
  createdAt?: string | null
}

export type TeamPage = {
  items: TeamCard[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  /** Officers only: counts of the whole performance, whatever the filter is. */
  statusCounts: Record<TeamStatus, number> | null
}

/** `team` of API-063. */
export type TeamView = Omit<
  TeamCard,
  'memberCount' | 'assignedSongCount' | 'candidateSongCount' | 'isMine'
>

export type TeamMemberRow = {
  /** The team-member row ID (teamMemberId): the path of the member edit / remove APIs. */
  id: string
  teamId: string
  membershipId: string
  performanceMemberId: string
  displayName: string
  profileImageUrl: string | null
  partId: string | null
  partName: string | null
  isLeader: boolean
  /** false: the representative part is not one of the member's own registered parts (T-11). */
  isRegisteredPart: boolean
  participationStatus: ParticipationStatus
}

export type TeamSong = {
  id: string
  performanceId: string
  title: string
  artist: string | null
  status: 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN'
  assignedTeamId: string | null
  setlistOrder: number | null
  version: string
  /** Assigned songs only. requirementsSatisfied null: no required lineup. */
  sessionCount?: number
  requirementsSatisfied?: boolean | null
  /** Candidate songs only. */
  candidateTeamId?: string
  evaluation?: {
    playability: Record<string, number>
    voteCount: number
    scoreAverage: number | null
  }
}

export type TeamDetail = {
  team: TeamView
  members: TeamMemberRow[]
  songs: TeamSong[]
  candidateSongs: TeamSong[]
}

/** The Team resource every write answers (inside `resource` for the MutationResult ones). */
export type TeamBrief = {
  id: string
  performanceId: string
  name: string
  status: TeamStatus
  leaderMembershipId: string | null
  version: string
}

/** Raw `warnings` of a write: parse them with parseWarnings (shared/api/warnings). */
export type MutationResult = {
  /** Notion spec shape. The backend answers a creation as `team` (both are read). */
  resource?: TeamBrief
  team?: TeamBrief
  warnings?: unknown
}

/** The Team of a write answer: `team`, `resource`, or the Team itself (API-064 / 068). */
export const briefOf = (r: MutationResult | TeamBrief): TeamBrief =>
  'id' in r ? r : (r.team ?? (r.resource as TeamBrief))

/** API-062 / 064 found the name already used in the performance (T-07). */
export class TeamNameTakenError extends Error {
  constructor() {
    super('team name taken')
    this.name = 'TeamNameTakenError'
  }
}

// ponytail: the spec and the server disagree (spec: 409 STATE_CONFLICT INELIGIBLE_TEAM_MEMBER, server:
// 422 RULE_VIOLATION MEMBER_NOT_ELIGIBLE); a server fix is to be requested, so both names are accepted.
export const INELIGIBLE_MEMBER_REASONS = [
  'MEMBER_NOT_ELIGIBLE',
  'INELIGIBLE_TEAM_MEMBER',
]

/** A member who cannot join a team (graduated, guest, ...), whichever name the server uses. */
export const isIneligibleMember = (e: unknown) =>
  (isApiError(e, 'RULE_VIOLATION') || isApiError(e, 'STATE_CONFLICT')) &&
  e.details.some(
    (d) =>
      d.reason !== undefined && INELIGIBLE_MEMBER_REASONS.includes(d.reason),
  )

// ponytail: server: 409 DUPLICATE reason DUPLICATE_TEAM_NAME; a DUPLICATE without a reason (the
// earlier assumption) is a name clash too. DUPLICATE_TEAM_MEMBER is not.
async function nameChecked<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (
      isApiError(e, 'DUPLICATE') &&
      (e.details.length === 0 ||
        e.details.some((d) => d.reason === 'DUPLICATE_TEAM_NAME' || !d.reason))
    )
      throw new TeamNameTakenError()
    throw e
  }
}

export const TEAM_PAGE_SIZE = 100

/** API-061. ponytail: one page of up to 100 teams (the server maximum); page through if a performance has more. */
export const listTeams = (
  clubId: string,
  performanceId: string,
  filter: { status?: TeamStatus[] } = {},
  signal?: AbortSignal,
) =>
  api.get<TeamPage>(teamsPath(clubId, performanceId), {
    query: {
      status: filter.status?.join(','),
      page: 0,
      size: TEAM_PAGE_SIZE,
    },
    signal,
  })

/** API-063. */
export const getTeam = (
  clubId: string,
  performanceId: string,
  teamId: string,
) => api.get<TeamDetail>(`${teamsPath(clubId, performanceId)}/${teamId}`)

/** API-154: the smallest free "n팀". */
export const getDefaultTeamName = async (
  clubId: string,
  performanceId: string,
) =>
  (
    await api.get<{ name: string }>(
      `${teamsPath(clubId, performanceId)}/default-name`,
    )
  ).name

export type NewTeam = {
  name: string
  /** A member's own request may list the requester too (a `partId` then sets their part at once). */
  members: { membershipId: string; partId: string | null }[]
  /** Officers only: a regular member's team always has the requester as leader. */
  leaderMembershipId?: string | null
}

/** API-062. */
export const createTeam = (
  clubId: string,
  performanceId: string,
  body: NewTeam,
) =>
  nameChecked(() =>
    api.post<MutationResult>(teamsPath(clubId, performanceId), body),
  )

/** API-064 answers the Team itself. `reason` is required on a LOCKED performance. */
export const renameTeam = (
  clubId: string,
  performanceId: string,
  teamId: string,
  body: { version: string; name: string; reason?: string },
) =>
  nameChecked(() =>
    api.patch<TeamBrief>(`${teamsPath(clubId, performanceId)}/${teamId}`, body),
  )

/** API-065. */
export const addTeamMember = (
  clubId: string,
  performanceId: string,
  teamId: string,
  body: {
    version: string
    membershipId: string
    partId: string | null
    reason?: string
  },
) =>
  api.post<MutationResult>(
    `${teamsPath(clubId, performanceId)}/${teamId}/members`,
    body,
  )

/**
 * API-065 takes one person per request and every write bumps the team version, so the picks go one
 * by one, each with the version the last answer carried. Answers `{warnings}` (all of them) so the
 * global success handler can show them.
 */
export async function addTeamMembers(
  clubId: string,
  performanceId: string,
  teamId: string,
  version: string,
  picks: { membershipId: string; partId: string | null }[],
  reason?: string,
) {
  const warnings: unknown[] = []
  let next = version
  for (const p of picks) {
    const r = await addTeamMember(clubId, performanceId, teamId, {
      version: next,
      membershipId: p.membershipId,
      partId: p.partId,
      reason,
    })
    next = versionOf(r)
    if (Array.isArray(r.warnings)) warnings.push(...r.warnings)
  }
  return { warnings }
}

/** API-066. */
export const changeMemberPart = (
  clubId: string,
  performanceId: string,
  teamId: string,
  teamMemberId: string,
  body: { version: string; partId: string | null; reason?: string },
) =>
  api.patch<MutationResult>(
    `${teamsPath(clubId, performanceId)}/${teamId}/members/${teamMemberId}`,
    body,
  )

/** API-067: the body of a DELETE carries version / removeSessions / reason. */
export const removeTeamMember = async (
  clubId: string,
  performanceId: string,
  teamId: string,
  teamMemberId: string,
  body: { version: string; removeSessions?: boolean; reason?: string },
) =>
  (
    await request<MutationResult>(
      `${teamsPath(clubId, performanceId)}/${teamId}/members/${teamMemberId}`,
      { method: 'DELETE', body },
    )
  ).data

/** API-068: `null` clears the leader (officers only). */
export const replaceLeader = (
  clubId: string,
  performanceId: string,
  teamId: string,
  body: {
    version: string
    leaderMembershipId: string | null
    reason?: string
  },
) =>
  api.put<TeamBrief>(
    `${teamsPath(clubId, performanceId)}/${teamId}/leader`,
    body,
  )

export type TeamTransition =
  'submit' | 'unsubmit' | 'approve' | 'reject' | 'withdraw' | 'reopen'

/** API-069 ~ 074. `reason` is required for reject; `confirmed` is for reject only. */
export const transitionTeam = (
  clubId: string,
  performanceId: string,
  teamId: string,
  action: TeamTransition,
  body: { version: string; reason?: string; confirmed?: boolean },
) =>
  api.post<MutationResult>(
    `${teamsPath(clubId, performanceId)}/${teamId}/${action}`,
    body,
  )

/** API-155: officers set the default team (an APPROVED team of the performance). */
export const setDefaultTeam = (
  clubId: string,
  performanceId: string,
  teamId: string,
) =>
  api.put<{ id: string; isDefault: boolean; version: string }>(
    `${teamsPath(clubId, performanceId)}/default`,
    { teamId },
  )

/** Query key of every team query of a performance (a prefix of the performance key). */
export const teamsKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'teams'] as const

export const teamKey = (
  clubId: string,
  performanceId: string,
  teamId: string,
) => [...teamsKey(clubId, performanceId), 'detail', teamId] as const

export const versionOf = (r: MutationResult | TeamBrief) => briefOf(r).version
