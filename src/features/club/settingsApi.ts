import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'

// CLUB-106 / 107 / 108 (Notion API spec; confirmed unless noted). IDs are strings.
const club = (clubId: string) => `/api/v1/clubs/${clubId}`

/** API-015 / API-016: only the field CLUB-106 reads and writes is typed. */
export type ClubSettings = { id: string; isSearchable: boolean }

export const getClubSettings = (clubId: string) =>
  api.get<ClubSettings>(club(clubId))
export const setSearchable = (clubId: string, isSearchable: boolean) =>
  api.patch<ClubSettings>(club(clubId), { isSearchable })

/** API-017 / 018 / 019. `joinCode` is null while the code is switched off. */
export type JoinCodeInfo = { joinCode: string | null }

export const getJoinCode = (clubId: string) =>
  api.get<JoinCodeInfo>(`${club(clubId)}/join-code`)
/** Issues a new code; from the "off" state it switches the code on again (CLUB-106 2). */
export const regenerateJoinCode = (clubId: string) =>
  api.post<{ joinCode: string }>(`${club(clubId)}/join-code/regenerate`, {})
export const disableJoinCode = (clubId: string) =>
  api.delete<void>(`${club(clubId)}/join-code`)

/** API-033..035. `memberCount` comes with the list only. */
export type Part = {
  id: string
  name: string
  displayOrder: number
  isActive: boolean
  memberCount?: number
}

export const PART_NAME_MAX = 50

/**
 * 409 DUPLICATE (PART_NAME_TAKEN). The screen shows it as helper text, so it is no ApiError and
 * stays out of the global handler (which would toast the server message).
 */
export class PartNameTakenError extends Error {
  constructor() {
    super('part name taken')
    this.name = 'PartNameTakenError'
  }
}

const nameTaken = async <T>(call: Promise<T>) => {
  try {
    return await call
  } catch (e) {
    if (isApiError(e, 'DUPLICATE')) throw new PartNameTakenError()
    throw e
  }
}

export const getParts = async (clubId: string) =>
  (await api.get<{ items: Part[] }>(`${club(clubId)}/parts`)).items
export const addPart = (clubId: string, name: string, displayOrder: number) =>
  nameTaken(api.post<Part>(`${club(clubId)}/parts`, { name, displayOrder }))
export const updatePart = (
  clubId: string,
  partId: string,
  patch: { name?: string; displayOrder?: number; isActive?: boolean },
) => nameTaken(api.patch<Part>(`${club(clubId)}/parts/${partId}`, patch))

/** API-145. `succession` is assumed to be null/absent unless the caller is the only admin. */
export type TeamLeaderCandidates = {
  performanceId: string
  performanceName: string
  teamId: string
  teamName: string
  candidates: { membershipId: string; displayName: string }[]
}
export type LeavePreview = {
  role: string
  succession?: {
    type: string
    candidateMembershipId: string | null
    candidateName: string | null
  } | null
  performanceImpacts: {
    performanceId: string
    performanceName: string
    participationStatus: string
    isTeamLeader: boolean
    teamName: string | null
  }[]
  teamLeaderCandidates: TeamLeaderCandidates[]
  warnings: string[]
}

export const getLeavePreview = (clubId: string) =>
  api.get<LeavePreview>(`${club(clubId)}/memberships/me/leave-preview`)

/** API-030 (self leave). No `successorMembershipId`: the server picks the earliest active member. */
export const leaveClub = (
  clubId: string,
  membershipId: string,
  teamLeaderSuccessors: { teamId: string; membershipId: string }[],
) =>
  api.post<unknown>(`${club(clubId)}/memberships/${membershipId}/withdraw`, {
    teamLeaderSuccessors,
  })
