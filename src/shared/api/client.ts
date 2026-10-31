import { API_PATHS, REQUESTED_WITH_HEADER } from './assumptions'
import { ApiError, parseErrorBody } from './errors'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RequestOptions = {
  method?: Method
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

export type ApiEnvelope<T> = { data: T; meta?: unknown }

type ClientHooks = {
  /** Called once when token renewal fails for a user who had been signed in. */
  onSessionExpired: () => void
}

const baseUrl: string = import.meta.env.VITE_API_BASE_URL ?? ''
let hooks: ClientHooks = { onSessionExpired: () => {} }
let signedIn = false
let renewal: Promise<boolean> | null = null

export function configureClient(next: ClientHooks) {
  hooks = next
}

/** Lets the client know whether a 401 means "session expired" or "first visit". */
export function setSignedIn(value: boolean) {
  signedIn = value
}

const isStateChanging = (method: Method) => method !== 'GET'

function buildUrl(path: string, query: RequestOptions['query']) {
  const url = baseUrl + path
  if (!query) return url
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (isStateChanging(method)) Object.assign(headers, REQUESTED_WITH_HEADER)
  try {
    return await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'network error',
    })
  }
}

async function readJson(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  try {
    return await res.json()
  } catch {
    return undefined
  }
}

/** Single-flight: concurrent 401s share one renewal request. */
function renewToken(): Promise<boolean> {
  renewal ??= send(API_PATHS.tokenRenewal, { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      renewal = null
    })
  return renewal
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  let res = await send(path, opts)
  if (res.status === 401 && path !== API_PATHS.tokenRenewal) {
    if (await renewToken()) {
      res = await send(path, opts)
    }
    if (res.status === 401) {
      if (signedIn) {
        signedIn = false
        hooks.onSessionExpired()
      }
    }
  }
  const body = await readJson(res)
  if (!res.ok) throw parseErrorBody(res.status, body)
  const envelope = (body ?? {}) as Partial<ApiEnvelope<T>>
  return { data: envelope.data as T, meta: envelope.meta }
}

export const api = {
  get: async <T>(
    path: string,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => (await request<T>(path, { ...opts, method: 'GET' })).data,
  post: async <T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => (await request<T>(path, { ...opts, method: 'POST', body })).data,
  put: async <T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => (await request<T>(path, { ...opts, method: 'PUT', body })).data,
  patch: async <T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => (await request<T>(path, { ...opts, method: 'PATCH', body })).data,
  delete: async <T>(
    path: string,
    opts?: Omit<RequestOptions, 'method' | 'body'>,
  ) => (await request<T>(path, { ...opts, method: 'DELETE' })).data,
}
