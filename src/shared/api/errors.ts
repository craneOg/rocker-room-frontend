export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'STATE_CONFLICT',
  'DUPLICATE',
  'VERSION_CONFLICT',
  'CONFIRMATION_REQUIRED',
  'RULE_VIOLATION',
] as const

export type ApiErrorCode =
  (typeof ERROR_CODES)[number] | 'UNKNOWN' | 'NETWORK_ERROR'

export type ErrorDetail = { field?: string; message?: string; code?: string }

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly details: ErrorDetail[]
  readonly requestId?: string

  constructor(init: {
    status: number
    code: ApiErrorCode
    message: string
    details?: ErrorDetail[]
    requestId?: string
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? []
    this.requestId = init.requestId
  }
}

/** The user dismissed a CONFIRMATION_REQUIRED warning; not a failure to report. */
export class ConfirmationDeclinedError extends Error {
  constructor() {
    super('confirmation declined')
    this.name = 'ConfirmationDeclinedError'
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Turns a failed response body `{error: {code, message, details, requestId}}` into an ApiError. */
export function parseErrorBody(status: number, body: unknown): ApiError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined
  const known = ERROR_CODES.find((c) => c === error?.code)
  const details = Array.isArray(error?.details)
    ? error.details.filter(isRecord).map((d) => ({
        field: typeof d.field === 'string' ? d.field : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
        code: typeof d.code === 'string' ? d.code : undefined,
      }))
    : []
  return new ApiError({
    status,
    code: known ?? 'UNKNOWN',
    message:
      typeof error?.message === 'string' ? error.message : `HTTP ${status}`,
    details,
    requestId:
      typeof error?.requestId === 'string' ? error.requestId : undefined,
  })
}

export function isApiError(e: unknown, code?: ApiErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code)
}

/** VALIDATION_ERROR details -> `{fieldName: message}` for input helper text. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error, 'VALIDATION_ERROR')) return {}
  const result: Record<string, string> = {}
  for (const d of error.details) {
    if (d.field && !(d.field in result)) result[d.field] = d.message ?? ''
  }
  return result
}

/** CONFIRMATION_REQUIRED warning list (assumption: `details[].message`). */
export function confirmationWarnings(error: ApiError): string[] {
  return error.details.flatMap((d) => (d.message ? [d.message] : []))
}
