import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'
import type { ClubDetail } from './api'

// Write APIs of CLUB-101 / 102 / 103 (officers only): API-016, 030, 031, 032, 142, 146, 160-163.
const clubPath = (clubId: string) => `/api/v1/clubs/${clubId}`
const memberPath = (clubId: string, membershipId: string) =>
  `${clubPath(clubId)}/memberships/${membershipId}`

/** 409 DUPLICATE(CLUB_NAME_TAKEN) as an own error, so the form shows it by the input, not as a toast. */
export class ClubNameTakenError extends Error {
  constructor() {
    super('club name taken')
    this.name = 'ClubNameTakenError'
  }
}

/** A 422 RULE_VIOLATION whose `reason` has screen copy of its own (shown as a dialog by the caller). */
export class RuleCopyError extends Error {
  readonly copy: string
  constructor(copy: string) {
    super(copy)
    this.name = 'RuleCopyError'
    this.copy = copy
  }
}

/** Maps known RULE_VIOLATION reasons to copy; any other error is left to the global handler. */
export async function withRuleCopy<T>(
  run: () => Promise<T>,
  copy: Record<string, string>,
): Promise<T> {
  try {
    return await run()
  } catch (e) {
    const reason = isApiError(e, 'RULE_VIOLATION')
      ? e.details.find((d) => d.reason !== undefined && d.reason in copy)
          ?.reason
      : undefined
    const text = reason === undefined ? undefined : copy[reason]
    if (text !== undefined) throw new RuleCopyError(text)
    throw e
  }
}

export type ClubUpdate = {
  name?: string
  description?: string | null
  clubType?: string
  /** Required by the server when `clubType` changes. */
  clubTypeChangeReason?: string
}

export const updateClub = async (clubId: string, body: ClubUpdate) => {
  try {
    return await api.patch<ClubDetail>(clubPath(clubId), body)
  } catch (e) {
    if (
      isApiError(e, 'DUPLICATE') &&
      e.details.some((d) => d.reason === 'CLUB_NAME_TAKEN')
    )
      throw new ClubNameTakenError()
    throw e
  }
}

export const setMemberRole = (
  clubId: string,
  membershipId: string,
  role: 'CLUB_ADMIN' | 'MEMBER',
) => api.put<unknown>(`${memberPath(clubId, membershipId)}/role`, { role })

export const setMemberParts = (
  clubId: string,
  membershipId: string,
  partIds: string[],
) => api.put<unknown>(`${memberPath(clubId, membershipId)}/parts`, { partIds })

/** API-029: the display name in this club, 0~50 chars; null clears it (the service name shows). */
export const setMyDisplayName = (
  clubId: string,
  membershipId: string,
  displayName: string | null,
) => api.patch<unknown>(memberPath(clubId, membershipId), { displayName })

export type SettableStatus = 'ACTIVE' | 'ON_LEAVE' | 'GRADUATED'

/** API-162 / 160 / 161: one action endpoint per target status. */
const STATUS_ACTION: Record<SettableStatus, string> = {
  ACTIVE: 'resume',
  ON_LEAVE: 'take-leave',
  GRADUATED: 'graduate',
}

export const changeMemberStatus = (
  clubId: string,
  membershipId: string,
  status: SettableStatus,
) =>
  api.post<unknown>(
    `${memberPath(clubId, membershipId)}/${STATUS_ACTION[status]}`,
    {},
  )

export const changeMemberType = (
  clubId: string,
  membershipId: string,
  memberType: 'REGULAR' | 'GUEST',
  reason: string,
) =>
  api.put<unknown>(`${memberPath(clubId, membershipId)}/member-type`, {
    memberType,
    reason,
  })

export type WithdrawPreview = {
  target: { membershipId: string; displayName: string; role: string }
  /** Successor of a sole officer (U-05); assumed null/absent when none is needed. */
  succession?: {
    type: string
    candidateMembershipId: string
    candidateName: string
  } | null
  performanceImpacts: {
    performanceId: string
    performanceName: string
    participationStatus: string
    isTeamLeader: boolean
    teamName: string | null
  }[]
  teamLeaderCandidates: {
    performanceId: string
    performanceName: string
    teamId: string
    teamName: string
    candidates: { membershipId: string; displayName: string }[]
  }[]
  warnings: string[]
}

export const getWithdrawPreview = (clubId: string, membershipId: string) =>
  api.get<WithdrawPreview>(
    `${memberPath(clubId, membershipId)}/withdraw-preview`,
  )

export const withdrawMember = (
  clubId: string,
  membershipId: string,
  teamLeaderSuccessors: { teamId: string; membershipId: string }[],
) =>
  api.post<unknown>(`${memberPath(clubId, membershipId)}/withdraw`, {
    teamLeaderSuccessors,
  })

export type BulkAction =
  | { action: 'CHANGE_STATUS'; params: { status: SettableStatus } }
  | {
      action: 'CHANGE_PARTS'
      params: { mode: 'ADD' | 'REMOVE'; partIds: string[] }
    }
  | { action: 'ASSIGN_PERFORMANCE'; params: { performanceId: string } }

export type BulkResult = {
  succeeded: { membershipId: string; skipped: boolean }[]
  failed: { membershipId: string; reason: string }[]
  summary: {
    requested: number
    succeeded: number
    failed: number
    skipped: number
  }
}

export const bulkMembers = (
  clubId: string,
  membershipIds: string[],
  body: BulkAction,
) =>
  api.post<BulkResult>(`${clubPath(clubId)}/memberships/bulk`, {
    membershipIds,
    ...body,
  })

/** Refreshes everything a club or member write can change on screen (and the session's club list). */
export const invalidateClub = (qc: QueryClient, clubId: string) =>
  Promise.all([
    ...['club-info', 'club-members', 'club-member', 'club-parts'].map((k) =>
      qc.invalidateQueries({ queryKey: [k, clubId] }),
    ),
    qc.invalidateQueries({ queryKey: ['me', 'memberships'] }),
  ])
