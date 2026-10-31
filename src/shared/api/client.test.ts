import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PATHS } from './assumptions'
import { api, configureClient, request, setSignedIn } from './client'
import { ApiError } from './errors'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status })
const unauthenticated = () =>
  json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })

const fetchMock = vi.fn<typeof fetch>()
const onSessionExpired = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  configureClient({ onSessionExpired })
  setSignedIn(false)
})
afterEach(() => {
  fetchMock.mockReset()
  onSessionExpired.mockReset()
  vi.unstubAllGlobals()
})

const callsTo = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path))
const headersOf = (call: Parameters<typeof fetch>) =>
  new Headers(call[1]?.headers)
const isRenewal = (url: unknown) => String(url).endsWith(API_PATHS.tokenRenewal)

describe('response parsing', () => {
  it('unwraps {data, meta} and sends cookies', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { data: { id: '7' }, meta: { page: 1 } }),
    )
    const res = await request<{ id: string }>('/api/v1/x')
    expect(res).toEqual({ data: { id: '7' }, meta: { page: 1 } })
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include')
  })

  it('turns {error} into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      json(422, {
        error: {
          code: 'RULE_VIOLATION',
          message: 'nope',
          details: [{ field: 'name', message: 'bad' }],
          requestId: 'r-1',
        },
      }),
    )
    const err = await api.get('/api/v1/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 422,
      code: 'RULE_VIOLATION',
      message: 'nope',
      requestId: 'r-1',
      details: [{ field: 'name', message: 'bad' }],
    })
  })

  it('maps unknown codes to UNKNOWN and network failure to NETWORK_ERROR', async () => {
    fetchMock.mockResolvedValueOnce(json(500))
    await expect(api.get('/a')).rejects.toMatchObject({
      code: 'UNKNOWN',
      status: 500,
    })
    fetchMock.mockRejectedValueOnce(new TypeError('failed'))
    await expect(api.get('/a')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    })
  })
})

describe('X-Requested-With', () => {
  it('is attached to state-changing requests only', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { data: null })),
    )
    await api.get('/g')
    await api.post('/p', { a: 1 })
    await api.delete('/d')
    const [get, post, del] = fetchMock.mock.calls
    expect(headersOf(get!).has('X-Requested-With')).toBe(false)
    expect(headersOf(post!).has('X-Requested-With')).toBe(true)
    expect(headersOf(del!).has('X-Requested-With')).toBe(true)
  })
})

describe('401 handling', () => {
  it('renews once for concurrent 401s and retries each request once', async () => {
    let renewed = false
    fetchMock.mockImplementation((url) => {
      if (isRenewal(url)) {
        renewed = true
        return Promise.resolve(json(200, { data: null }))
      }
      return Promise.resolve(
        renewed ? json(200, { data: 'ok' }) : unauthenticated(),
      )
    })
    const results = await Promise.all([
      api.get('/a'),
      api.get('/b'),
      api.get('/c'),
    ])
    expect(results).toEqual(['ok', 'ok', 'ok'])
    expect(callsTo(API_PATHS.tokenRenewal)).toHaveLength(1)
    expect(callsTo('/a')).toHaveLength(2)
    expect(
      headersOf(callsTo(API_PATHS.tokenRenewal)[0]!).has('X-Requested-With'),
    ).toBe(true)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('signals session expiry once when renewal fails for a signed-in user', async () => {
    setSignedIn(true)
    fetchMock.mockImplementation(() => Promise.resolve(unauthenticated()))
    await expect(
      Promise.all([api.get('/a'), api.get('/b')]),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    await expect(api.get('/c')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    expect(callsTo(API_PATHS.tokenRenewal)).toHaveLength(2)
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('stays silent on a first visit', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(unauthenticated()))
    await expect(api.get('/me')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('retries only once when the retried request is still 401', async () => {
    setSignedIn(true)
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        isRenewal(url) ? json(200, { data: null }) : unauthenticated(),
      ),
    )
    await expect(api.get('/a')).rejects.toBeInstanceOf(ApiError)
    expect(callsTo('/a')).toHaveLength(2)
    expect(callsTo(API_PATHS.tokenRenewal)).toHaveLength(1)
  })
})
