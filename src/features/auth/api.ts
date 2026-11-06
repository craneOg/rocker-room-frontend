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
  /** API-007: show my photo to other members (default true). Optional: older fixtures omit it. */
  profileImagePublic?: boolean
}

/** API-010 item (only the fields the app reads). */
export type Membership = {
  /** The membership ID: the `membershipId` / `requestId` of API-026/027/028. */
  id: string
  clubId: string
  club: {
    id: string
    name: string
    /** API example: "BAND". Shown through CLUB_TYPE_LABEL. */
    clubType: string
    status: 'ACTIVE' | 'INACTIVE'
    profileImageUrl: string | null
    themeColor: string | null
  }
  /** CLUB_ADMIN / MEMBER */
  role: 'CLUB_ADMIN' | 'MEMBER'
  /** PENDING / INVITED / REJECTED / DECLINED / ACTIVE / ON_LEAVE / GRADUATED / WITHDRAWN */
  status: string
  /** INVITED only. */
  invitationExpiresAt: string | null
  /** PENDING only (the latest application time). */
  requestedAt: string | null
}

export const getMe = () => api.get<Me>(API_PATHS.me)
// ponytail: first page only (the server default is 100, its maximum); page through if a user can
// belong to more clubs than that.
export const getMemberships = async () =>
  (await api.get<{ items: Membership[] }>(API_PATHS.memberships)).items

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

/** API-008, partial: only the changed fields. `profileImageUrl` holds an API-129 key (null = default image). */
export type ProfilePatch = {
  name?: string
  handle?: string
  profileImageUrl?: string | null
  profileImagePublic?: boolean
}
export const updateProfile = (patch: ProfilePatch) =>
  api.patch<Me>(API_PATHS.me, patch)

/** API-129 response (USER_PROFILE). `imageKey` is what API-008 takes; `previewUrl` is for display. */
export type ImageUpload = { imageKey: string; previewUrl: string }
export const uploadProfileImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<ImageUpload>(API_PATHS.profileImage, form)
}

export const respondToMembership = (
  m: Pick<Membership, 'clubId' | 'id'>,
  action: 'accept' | 'decline' | 'cancel',
) => api.post<void>(membershipActionPath(m.clubId, m.id, action))

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
