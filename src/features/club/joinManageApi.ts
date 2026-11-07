import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'

// API-020 / 022 / 023 / 024 / 025 / 143 (Notion API spec; confirmed). IDs are strings.

/** Query keys of everything below start with this (per club), so one call refreshes them all. */
export const memberKey = (clubId: string) =>
  ['club', clubId, 'members'] as const

export type ListedMembership = {
  id: string
  userName: string
  /** Null for a withdrawn user. */
  handle: string | null
  profileImageUrl: string | null
  displayName: string | null
  /** REGULAR / GUEST */
  memberType: string
  status: string
  /** JOIN_CODE / SEARCH / ADMIN_ADDED; unknown values are shown as no badge. */
  joinSource: string | null
  requestedAt: string | null
  invitationExpiresAt: string | null
}

export type MembershipPage = {
  items: ListedMembership[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type ListStatus = 'PENDING' | 'INVITED' | 'DECLINED'

/** Assumption: 100 is accepted as the page size and covers a club's waiting list (no paging UI). */
export const LIST_SIZE = 100

export const listMemberships = (
  clubId: string,
  status: ListStatus,
  signal?: AbortSignal,
) =>
  api.get<MembershipPage>(`/api/v1/clubs/${clubId}/memberships`, {
    query: { status, size: LIST_SIZE },
    signal,
  })

/**
 * 404 of an action: the membership is gone (already handled, or withdrawn). Being no ApiError,
 * it stays out of the global handler's full-page 404 view; the screen shows the list again.
 */
export class MembershipGoneError extends Error {
  constructor() {
    super('membership gone')
    this.name = 'MembershipGoneError'
  }
}

const orGone = async <T>(run: () => Promise<T>) => {
  try {
    return await run()
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) throw new MembershipGoneError()
    throw e
  }
}

export const decideJoin = (
  clubId: string,
  id: string,
  decision: 'approve' | 'reject',
) =>
  orGone(() =>
    api.post<unknown>(
      `/api/v1/clubs/${clubId}/memberships/${id}/${decision}`,
      {},
    ),
  )

export type BulkResult = {
  succeeded: { membershipId: string }[]
  failed: { membershipId: string; reason: string }[]
  summary: { requested: number; succeeded: number; failed: number }
}

export const decideJoinBulk = (
  clubId: string,
  membershipIds: string[],
  decision: 'APPROVE' | 'REJECT',
) =>
  orGone(() =>
    api.post<BulkResult>(
      `/api/v1/clubs/${clubId}/join-requests/bulk-decisions`,
      { membershipIds, decision },
    ),
  )

export type UserLookup = {
  userId: string
  handle: string
  name: string
  profileImageUrl: string | null
  /** Only ACTIVE / ON_LEAVE / GRADUATED / PENDING / INVITED rows are returned; else null. */
  membership: {
    id: string
    status: string
    invitationExpiresAt: string | null
  } | null
}

/** Exact match only; lower case, no spaces (CLUB-105 1). */
export const normalizeHandle = (raw: string) =>
  raw.replace(/\s+/g, '').toLowerCase()

/**
 * An unknown handle is an answer here ("not found"), not a missing page: null keeps the global
 * 404 view away. A malformed handle (400) cannot exist either, so it is the same answer.
 */
export const lookupUser = async (
  clubId: string,
  handle: string,
  signal?: AbortSignal,
) => {
  try {
    return await api.get<UserLookup>(`/api/v1/clubs/${clubId}/users/lookup`, {
      query: { handle },
      signal,
    })
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND') || isApiError(e, 'VALIDATION_ERROR'))
      return null
    throw e
  }
}

/** The target changed meanwhile: it joined or was invited by someone else (409), or vanished (404). */
export class InviteTargetError extends Error {
  readonly reason: 'duplicate' | 'gone'
  constructor(reason: 'duplicate' | 'gone') {
    super(`invite target: ${reason}`)
    this.name = 'InviteTargetError'
    this.reason = reason
  }
}

export const inviteMember = async (
  clubId: string,
  body: { handle: string; memberType: 'REGULAR' | 'GUEST' },
) => {
  try {
    return await api.post<unknown>(
      `/api/v1/clubs/${clubId}/memberships/invite`,
      body,
    )
  } catch (e) {
    if (isApiError(e, 'DUPLICATE')) throw new InviteTargetError('duplicate')
    if (isApiError(e, 'NOT_FOUND')) throw new InviteTargetError('gone')
    throw e
  }
}
