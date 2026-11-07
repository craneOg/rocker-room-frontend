import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'
import { performanceKey } from './api'
import type { ParticipationStatus } from './types'

// API-053 / 054 / 055 / 056 / 057 / 058 / 059 / 060 / 144 (Notion API spec) and API-063 (team detail,
// read only for the successor choice). IDs are strings.
const perfPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}`

export type ParticipationSource = 'APPLICATION' | 'ADMIN' | 'TEAM_SUBMISSION'

/** The PerformanceMember core shared by every participation API. */
export type PerformanceMember = {
  id: string
  performanceId: string
  membershipId: string
  status: ParticipationStatus
  source: ParticipationSource
}

/** Item of API-053. `membershipStatus` is present for officers only (D-4). */
export type PerformanceMemberRow = PerformanceMember & {
  displayName: string
  profileImageUrl: string | null
  memberType: 'REGULAR' | 'GUEST'
  membershipStatus?: 'ACTIVE' | 'ON_LEAVE' | 'GRADUATED'
  parts: { id: string; name: string }[]
  teamNames: string[]
  playedSongCount: number
}

export type PerformanceMemberPage = {
  items: PerformanceMemberRow[]
  /** A regular member only gets the APPROVED key. */
  statusCounts: Partial<Record<ParticipationStatus, number>>
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export const PERFORMANCE_MEMBER_PAGE_SIZE = 20

export const listPerformanceMembers = (
  clubId: string,
  performanceId: string,
  filter: {
    status?: ParticipationStatus[]
    q?: string
    partIds?: string[]
  },
  page: number,
  size = PERFORMANCE_MEMBER_PAGE_SIZE,
  signal?: AbortSignal,
) =>
  api.get<PerformanceMemberPage>(`${perfPath(clubId, performanceId)}/members`, {
    query: {
      status: filter.status?.join(','),
      q: filter.q || undefined,
      partId: filter.partIds?.length ? filter.partIds.join(',') : undefined,
      page,
      size,
    },
    signal,
  })

/** API-054 response: the requester's own row with what the overview cards show. */
export type MyParticipation = PerformanceMember & {
  myTeams: { teamId: string; name: string; isLeader: boolean }[]
  myPlayingSongs: {
    songId: string
    title: string
    partId: string
    partName: string
    setlistOrder: number | null
  }[]
  /** An item is null while that feature is unused or unavailable to my status. */
  progress: {
    candidateSongs: { used: number; limit: number | null } | null
    unansweredPlayabilityCount: number | null
    votes: { used: number; limit: number | null } | null
    availabilitySlotCount: number | null
  }
}

/**
 * No row means "not a participant" (404): an answer here, not a missing page, so null keeps the
 * global 404 view away.
 */
export const getMyParticipation = async (
  clubId: string,
  performanceId: string,
) => {
  try {
    return await api.get<MyParticipation>(
      `${perfPath(clubId, performanceId)}/members/me`,
    )
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) return null
    throw e
  }
}

/** API-055: applies, or applies again after a rejection or withdrawal. */
export const applyParticipation = (clubId: string, performanceId: string) =>
  api.post<PerformanceMember>(
    `${perfPath(clubId, performanceId)}/applications`,
    {},
  )

/** API-056: officers assign members as APPROVED in one transaction (all or none). */
export const assignParticipants = (
  clubId: string,
  performanceId: string,
  membershipIds: string[],
) =>
  api.post<{ items: PerformanceMember[] }>(
    `${perfPath(clubId, performanceId)}/members`,
    { membershipIds },
  )

type Successor = { teamId: string; membershipId: string }

/** API-057 (approve) / 058 (reject). `reason` is required on a LOCKED performance only. */
export const decideParticipation = (
  clubId: string,
  performanceId: string,
  performanceMemberId: string,
  decision: 'approve' | 'reject',
  body: { performanceVersion: string; reason?: string },
) =>
  api.post<unknown>(
    `${perfPath(clubId, performanceId)}/members/${performanceMemberId}/${decision}`,
    body,
  )

export type BulkDecisionResult = {
  succeeded: { performanceMemberId: string }[]
  failed: { performanceMemberId: string; reason: string }[]
  summary: { requested: number; succeeded: number; failed: number }
}

/** API-144: partial failure; DRAFT / ACTIVE only. */
export const bulkDecide = (
  clubId: string,
  performanceId: string,
  performanceMemberIds: string[],
  decision: 'APPROVE' | 'REJECT',
) =>
  api.post<BulkDecisionResult>(
    `${perfPath(clubId, performanceId)}/members/bulk-decisions`,
    { performanceMemberIds, decision },
  )

/** API-059. Only the ids are used: the successor choice reads the teams (API-063). */
export type WithdrawImpact = {
  teamIds: string[]
  songIds: string[]
  scheduleIds: string[]
  affectedUserIds: string[]
  warnings: string[]
}

/** 404 (the row or team is gone) is null: the dialog goes on without it instead of the global 404 view. */
export const getWithdrawImpact = async (
  clubId: string,
  performanceId: string,
  performanceMemberId: string,
) => {
  try {
    return await api.get<WithdrawImpact>(
      `${perfPath(clubId, performanceId)}/members/${performanceMemberId}/impact`,
    )
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) return null
    throw e
  }
}

export type TeamMemberLite = {
  membershipId: string
  displayName: string
  isLeader: boolean
}

/** API-063, reduced to what the successor choice needs; null on 404. */
export const getTeamLite = async (
  clubId: string,
  performanceId: string,
  teamId: string,
) => {
  try {
    const r = await api.get<{
      team: { id: string; name: string }
      members: TeamMemberLite[]
    }>(`${perfPath(clubId, performanceId)}/teams/${teamId}`)
    return { id: r.team.id, name: r.team.name, members: r.members }
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) return null
    throw e
  }
}

/** API-060: both the requester's own withdrawal and an officer's release (result WITHDRAWN). */
export const withdrawParticipation = (
  clubId: string,
  performanceId: string,
  performanceMemberId: string,
  body: { reason?: string; teamLeaderSuccessors: Successor[] },
) =>
  api.post<unknown>(
    `${perfPath(clubId, performanceId)}/members/${performanceMemberId}/withdraw`,
    body,
  )

/** Query key of the performance list screens of one club (PERF-001 and the CLUB-102 picker). */
export const performanceListKey = (clubId: string) =>
  ['club', clubId, 'performances'] as const

/** After a participation write: every query of that performance plus the lists. */
export const invalidatePerformance = (
  qc: QueryClient,
  clubId: string,
  performanceId: string,
) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: performanceKey(clubId, performanceId) }),
    qc.invalidateQueries({ queryKey: performanceListKey(clubId) }),
  ])
