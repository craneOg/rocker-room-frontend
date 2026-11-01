import type { IncomingMessage, ServerResponse } from 'node:http'

// Dev-server-only mock backend (`npm run dev:mock`). In-memory state, plain Node handler.
// Paths and shapes mirror src/shared/api/assumptions.ts. Never imported by src/.

type Membership = {
  membershipId: string
  clubId: string
  clubName: string
  clubType: string
  role: 'CLUB_ADMIN' | 'MEMBER'
  status: 'INVITED' | 'PENDING' | 'REJECTED' | 'ACTIVE'
  inviteExpiresAt?: string
  requestedAt?: string
}

type Outcome = 'ok' | 'cancelled' | 'forbidden' | 'restore'

const DAY = 86_400_000
const TAKEN_HANDLES = ['admin', 'rocker', 'drummer_kim']
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const inDays = (days: number) => ago(-days)

const initialState = () => ({
  user: {
    id: '1',
    name: '명혜성',
    handle: null as string | null,
    profileImageUrl: null,
    onboardingRequired: true,
    isSuperAdmin: false,
  },
  memberships: [
    {
      membershipId: 'm1',
      clubId: 'c1',
      clubName: '한빛 밴드 동아리',
      clubType: '밴드 동아리',
      role: 'MEMBER',
      status: 'INVITED',
      inviteExpiresAt: inDays(5),
    },
    {
      membershipId: 'm2',
      clubId: 'c2',
      clubName: '지난 학기 합주단',
      clubType: '밴드 동아리',
      role: 'MEMBER',
      status: 'INVITED',
      inviteExpiresAt: ago(2),
    },
    {
      membershipId: 'm3',
      clubId: 'c3',
      clubName: '서울 인디 밴드',
      clubType: '밴드 동아리',
      role: 'MEMBER',
      status: 'PENDING',
      requestedAt: ago(3),
    },
    {
      membershipId: 'm4',
      clubId: 'c4',
      clubName: '홍대 합주단',
      clubType: '밴드 동아리',
      role: 'MEMBER',
      status: 'REJECTED',
      requestedAt: ago(8),
    },
  ] as Membership[],
  outcome: 'ok' as Outcome,
})

const COOKIE_EXCHANGE = 'loginExchange'
const COOKIE_SESSION = 'mockSession'

export function createMockApi() {
  let state = initialState()

  const hasCookie = (req: IncomingMessage, name: string) =>
    (req.headers.cookie ?? '').split(/;\s*/).includes(`${name}=1`)

  const send = (
    res: ServerResponse,
    status: number,
    body?: unknown,
    headers: Record<string, string | string[]> = {},
  ) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
    res.end(body === undefined ? undefined : JSON.stringify(body))
  }
  const ok = (res: ServerResponse, data: unknown) => send(res, 200, { data })
  const fail = (res: ServerResponse, status: number, code: string) =>
    send(res, status, { error: { code, message: code } })
  const setCookie = (name: string, on: boolean) =>
    `${name}=${on ? 1 : ''}; Path=/; HttpOnly; SameSite=Lax${on ? '' : '; Max-Age=0'}`

  const readBody = async (
    req: IncomingMessage,
  ): Promise<Record<string, unknown>> => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return async function handler(
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) {
    const url = new URL(req.url ?? '/', 'http://mock')
    const path = url.pathname
    if (!path.startsWith('/api/')) return next()
    const method = req.method ?? 'GET'
    const signedIn = hasCookie(req, COOKIE_SESSION)

    // Test controls: choose how the next login ends, or reset all state.
    if (method === 'POST' && path === '/api/__mock/reset') {
      state = initialState()
      return send(res, 204, undefined, {
        'Set-Cookie': [
          setCookie(COOKIE_SESSION, false),
          setCookie(COOKIE_EXCHANGE, false),
        ],
      })
    }
    if (method === 'POST' && path === '/api/__mock/login-outcome') {
      state.outcome = (await readBody(req)).outcome as Outcome
      return send(res, 204)
    }

    if (method === 'GET' && path === '/api/v1/auth/kakao/authorize') {
      const failed = state.outcome === 'cancelled'
      res.writeHead(302, {
        Location: failed
          ? '/auth/complete?error=access_denied'
          : '/auth/complete',
        'Set-Cookie': setCookie(COOKIE_EXCHANGE, !failed),
      })
      return res.end()
    }

    if (method === 'POST' && path === '/api/v1/auth/exchange') {
      if (!hasCookie(req, COOKIE_EXCHANGE))
        return fail(res, 401, 'LOGIN_EXCHANGE_INVALID')
      const outcome = state.outcome
      state.outcome = 'ok'
      if (outcome === 'forbidden') return fail(res, 403, 'FORBIDDEN')
      return send(
        res,
        200,
        { data: { restoreRequired: outcome === 'restore' } },
        {
          // The exchange cookie is single-use.
          'Set-Cookie': [
            setCookie(COOKIE_EXCHANGE, false),
            setCookie(COOKIE_SESSION, true),
          ],
        },
      )
    }

    if (method === 'POST' && path === '/api/v1/auth/token-renewals')
      return signedIn ? send(res, 204) : fail(res, 401, 'UNAUTHENTICATED')

    if (method === 'POST' && path === '/api/v1/auth/logout')
      return send(res, 204, undefined, {
        'Set-Cookie': setCookie(COOKIE_SESSION, false),
      })

    if (!signedIn) return fail(res, 401, 'UNAUTHENTICATED')

    if (path === '/api/v1/me' && method === 'GET') return ok(res, state.user)
    if (path === '/api/v1/me' && method === 'PATCH') {
      const { name, handle } = await readBody(req)
      if (
        typeof name !== 'string' ||
        name.length < 1 ||
        name.length > 50 ||
        typeof handle !== 'string' ||
        !/^[a-z0-9_]{5,30}$/.test(handle)
      )
        return fail(res, 400, 'VALIDATION_ERROR')
      if (TAKEN_HANDLES.includes(handle)) return fail(res, 409, 'DUPLICATE')
      Object.assign(state.user, { name, handle, onboardingRequired: false })
      return ok(res, state.user)
    }
    if (path === '/api/v1/me/memberships' && method === 'GET')
      return ok(res, state.memberships)

    if (path === '/api/v1/users/handle-availability' && method === 'GET') {
      const handle = url.searchParams.get('handle') ?? ''
      await new Promise((r) => setTimeout(r, 300)) // lets the "checking" state show
      return ok(res, { available: !TAKEN_HANDLES.includes(handle) })
    }

    const action =
      /^\/api\/v1\/clubs\/([^/]+)\/members\/([^/]+)\/(accept|decline|cancel-request)$/.exec(
        path,
      )
    if (action && method === 'POST') {
      const [, clubId, membershipId, what] = action
      const m = state.memberships.find(
        (x) => x.clubId === clubId && x.membershipId === membershipId,
      )
      if (!m) return fail(res, 404, 'NOT_FOUND')
      const invited = m.status === 'INVITED'
      if (what === 'cancel-request' ? m.status !== 'PENDING' : !invited)
        return fail(res, 409, 'STATE_CONFLICT')
      if (invited && Date.parse(m.inviteExpiresAt ?? '') <= Date.now())
        return fail(res, 409, 'STATE_CONFLICT')
      if (what === 'accept') m.status = 'ACTIVE'
      else state.memberships = state.memberships.filter((x) => x !== m)
      return send(res, 204)
    }

    return fail(res, 404, 'NOT_FOUND')
  }
}
