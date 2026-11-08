import { api } from '../../shared/api/client'
import { performanceKey } from '../performance/api'

// API-100 / 101 / 102 / 103 (availability) and API-061 (team list, read only for the target picker).
// API-104 (revision) is being retired in the spec and is not used.
const perfPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}`

export type AvailableTime = { startAt: string; endAt: string }
export type NamedMember = { performanceMemberId: string; displayName: string }

export const availabilityKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'availability'] as const

/** API-100. `from` / `to` are a pair (ISO with +09:00). */
export const getMyAvailability = (
  clubId: string,
  performanceId: string,
  from: string,
  to: string,
) =>
  api.get<{ items: AvailableTime[] }>(
    `${perfPath(clubId, performanceId)}/availability/me`,
    { query: { from, to } },
  )

/** API-101: replaces the caller's slots in [from, to) atomically. */
export const saveMyAvailability = (
  clubId: string,
  performanceId: string,
  body: { from: string; to: string; slots: AvailableTime[] },
) =>
  api.put<{ items: AvailableTime[] }>(
    `${perfPath(clubId, performanceId)}/availability/me`,
    body,
  )

/** API-102 (officers): one participant's slots; there is no write counterpart. */
export const getMemberAvailability = (
  clubId: string,
  performanceId: string,
  performanceMemberId: string,
  from: string,
  to: string,
) =>
  api.get<{ items: AvailableTime[] }>(
    `${perfPath(clubId, performanceId)}/availability/members/${performanceMemberId}`,
    { query: { from, to } },
  )

export type CommonTarget =
  | { kind: 'team'; teamId: string }
  | { kind: 'song'; songId: string }
  | { kind: 'all' }

export type CommonSlot = {
  startAt: string
  endAt: string
  availableCount: number
  /** Officers only. */
  availableMembers?: NamedMember[]
}

export type CommonAvailability = {
  participantCount: number
  respondedCount: number
  /** The three below are left out for a caller who is not an officer (AV-04). */
  participants?: NamedMember[]
  missingAvailabilityMemberIds?: string[]
  slots: CommonSlot[]
  warnings: unknown[]
}

/** API-103. A team member may only ask for their own team. */
export const getCommonAvailability = (
  clubId: string,
  performanceId: string,
  target: CommonTarget,
  from: string,
  to: string,
) =>
  api.get<CommonAvailability>(
    `${perfPath(clubId, performanceId)}/availability/common`,
    {
      query: {
        from,
        to,
        teamIds: target.kind === 'team' ? target.teamId : undefined,
        songIds: target.kind === 'song' ? target.songId : undefined,
        forAllParticipants: target.kind === 'all' ? true : undefined,
      },
    },
  )

export type TeamOption = { id: string; name: string }

/** API-061, reduced to the target picker: approved teams, only the caller's own with `mine`. */
export const listTeamOptions = async (
  clubId: string,
  performanceId: string,
  mine: boolean,
) =>
  (
    await api.get<{ items: TeamOption[] }>(
      `${perfPath(clubId, performanceId)}/teams`,
      // ponytail: first 100 teams only (the API maximum per page).
      { query: { status: 'APPROVED', mine, size: 100 } },
    )
  ).items.map((t) => ({ id: t.id, name: t.name }))
