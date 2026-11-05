// Every unconfirmed backend contract lives here (runbook "임시 가정").
// Revise this file once the API revision (2.1) is confirmed.

export const API_PATHS = {
  tokenRenewal: '/api/v1/auth/token-renewals',
  kakaoAuthorize: '/api/v1/auth/kakao/authorize',
  exchange: '/api/v1/auth/exchange',
  me: '/api/v1/me',
  memberships: '/api/v1/me/memberships',
  // Not in the API table (AUTH-14, path unknown).
  logout: '/api/v1/auth/logout',
  handleAvailability: '/api/v1/users/handle-availability',
  // AUTH-004: Recovery choice (paths unknown, runbook 임시 가정).
  recoveryInfo: '/api/v1/auth/recovery-info',
  restore: '/api/v1/auth/restore',
  startNew: '/api/v1/auth/start-new',
} as const

// API-026/027 accept/decline an invite; API-028 cancels a join request (confirmed in the API
// spec). `membershipId` is the `id` of the memberships list item.
export const membershipActionPath = (
  clubId: string,
  membershipId: string,
  action: 'accept' | 'decline' | 'cancel',
) =>
  action === 'cancel'
    ? `/api/v1/clubs/${clubId}/join-requests/${membershipId}/cancel`
    : `/api/v1/clubs/${clubId}/memberships/${membershipId}/${action}`

// Where the SPA lands after Kakao login (needs agreement with the backend).
export const AUTH_COMPLETE_PATH = '/auth/complete'

// Assumption: the backend sends a failed Kakao login back to AUTH_COMPLETE_PATH with this query
// param (any non-empty value = the user cancelled).
export const AUTH_ERROR_QUERY_PARAM = 'error'

// Assumed response shapes (types live in features/auth/api.ts):
// - exchange: `{ loginResult }`; token fields are never read (HttpOnly cookies). Confirmed by the
//   backend: `RESTORATION_REQUIRED` means a withdrawn account (a 10-minute choice cookie is set
//   instead of the login cookies). The other values are not known, so only this one is compared.
// - handle availability: `{ available: boolean }`.
// - Me: `name`, `handle` (null until onboarding), `profileImageUrl` (nullable).
// - Membership (API-010, confirmed): see features/auth/api.ts.

export const LOGIN_RESULT_RESTORATION_REQUIRED = 'RESTORATION_REQUIRED'

export const REQUESTED_WITH_HEADER = { 'X-Requested-With': 'XMLHttpRequest' }

export type RawWarning = string | { code?: string; message: string }

/** Assumption: warnings of a successful response live at `data.warnings`. */
export function extractWarnings(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || !('warnings' in data)) {
    return []
  }
  const warnings = (data as { warnings: unknown }).warnings
  if (!Array.isArray(warnings)) return []
  return warnings.flatMap((w: RawWarning) =>
    typeof w === 'string'
      ? [w]
      : typeof w?.message === 'string'
        ? [w.message]
        : [],
  )
}
