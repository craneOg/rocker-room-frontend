import { API_PATHS, membershipActionPath } from '../../shared/api/assumptions'
import { api, apiUrl } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'

// Assumed shapes (see shared/api/assumptions.ts); IDs are strings, times ISO-8601.
export type Me = {
  id: string
  onboardingRequired: boolean
  isSuperAdmin: boolean
  name: string
  /** Null until onboarding (AUTH-002) is done. */
  handle: string | null
  profileImageUrl: string | null
}

export type Membership = {
  membershipId: string
  clubId: string
  clubName: string
  /** Display text, e.g. "밴드 동아리". */
  clubType: string
  /** ERD: CLUB_ADMIN / MEMBER */
  role: 'CLUB_ADMIN' | 'MEMBER'
  /** ERD: PENDING / INVITED / REJECTED / ACTIVE / ON_LEAVE / ... */
  status: string
  /** INVITED only. */
  inviteExpiresAt?: string
  /** PENDING / REJECTED only. */
  requestedAt?: string
}

export const getMe = () => api.get<Me>(API_PATHS.me)
export const getMemberships = () => api.get<Membership[]>(API_PATHS.memberships)

/** Full-page navigation: the fixed authorize path only, nothing taken from the URL. */
export const startKakaoLogin = () =>
  location.assign(apiUrl(API_PATHS.kakaoAuthorize))

/** The login-exchange cookie is single-use, and a 401 here must not trigger token renewal. */
export const exchangeLogin = () =>
  api.post<{ loginResult: string }>(
    API_PATHS.exchange,
    {},
    { skipRenewal: true },
  )

export const logout = () => api.post<void>(API_PATHS.logout)

export const checkHandle = (handle: string, signal?: AbortSignal) =>
  api.get<{ available: boolean }>(API_PATHS.handleAvailability, {
    query: { handle },
    signal,
  })

export const saveProfile = (profile: { name: string; handle: string }) =>
  api.patch<Me>(API_PATHS.me, profile)

export const respondToMembership = (
  m: Pick<Membership, 'clubId' | 'membershipId'>,
  action: 'accept' | 'decline' | 'cancel-request',
) => api.post<void>(membershipActionPath(m.clubId, m.membershipId, action))

export type RecoveryInfo = {
  withdrawnAt: string
  expiresAt: string
  name: string
  profileImageUrl?: string | null
}

/**
 * 409 of the recovery APIs: already restored, discarded, or past the retention period. The screen
 * explains it itself; being no ApiError, it also stays out of the global error handler (which
 * would add its own toast or dialog).
 */
export class NotRestorableError extends Error {
  constructor() {
    super('not restorable')
    this.name = 'NotRestorableError'
  }
}

const recovery = async <T>(call: Promise<T>) => {
  try {
    return await call
  } catch (e) {
    if (isApiError(e) && e.status === 409) throw new NotRestorableError()
    throw e
  }
}

// The recovery APIs run on the choice cookie, not a session: a 401 is final (no token renewal).
const recoveryOpts = { skipRenewal: true }
export const getRecoveryInfo = () =>
  recovery(api.get<RecoveryInfo>(API_PATHS.recoveryInfo, recoveryOpts))
export const restoreProfile = () =>
  recovery(
    api.post<{ success: boolean }>(API_PATHS.restore, undefined, recoveryOpts),
  )
export const startNewAccount = () =>
  recovery(
    api.post<{ success: boolean }>(API_PATHS.startNew, undefined, recoveryOpts),
  )
