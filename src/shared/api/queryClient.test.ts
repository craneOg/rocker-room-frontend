import { describe, expect, it } from 'vitest'
import { ApiError, type ApiErrorCode } from './errors'
import { createQueryClient } from './queryClient'

const retry = createQueryClient().getDefaultOptions().queries?.retry as (
  count: number,
  error: Error,
) => boolean
const apiError = (code: ApiErrorCode, status: number) =>
  new ApiError({ status, code, message: code })

describe('query retry', () => {
  it('retries network failures twice', () => {
    const error = apiError('NETWORK_ERROR', 0)
    expect(retry(0, error)).toBe(true)
    expect(retry(1, error)).toBe(true)
    expect(retry(2, error)).toBe(false)
  })

  it('does not retry server answers or programming errors', () => {
    expect(retry(0, apiError('UNKNOWN', 500))).toBe(false)
    expect(retry(0, new TypeError('bug'))).toBe(false)
  })
})
