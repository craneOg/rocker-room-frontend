// Every unconfirmed backend contract lives here (runbook "임시 가정").
// Revise this file once the API revision (2.1) is confirmed.

export const API_PATHS = {
  tokenRenewal: '/api/v1/auth/token-renewals',
  kakaoAuthorize: '/api/v1/auth/kakao/authorize',
  exchange: '/api/v1/auth/exchange',
  me: '/api/v1/me',
  memberships: '/api/v1/me/memberships',
} as const

// Where the SPA lands after Kakao login (needs agreement with the backend).
export const AUTH_COMPLETE_PATH = '/auth/complete'

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
