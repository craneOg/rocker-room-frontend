import type { IncomingMessage, ServerResponse } from 'node:http'

// Dev-server-only mock backend (`npm run dev:mock`). In-memory state, plain Node handler.
// Paths and shapes mirror src/shared/api/assumptions.ts. Never imported by src/.

type Membership = {
  id: string
  clubId: string
  club: {
    id: string
    name: string
    clubType: string
    status: 'ACTIVE' | 'INACTIVE'
    profileImageUrl: null
    themeColor: null
  }
  role: 'CLUB_ADMIN' | 'MEMBER'
  status: 'INVITED' | 'PENDING' | 'REJECTED' | 'ACTIVE'
  invitationExpiresAt: string | null
  requestedAt: string | null
}

const clubOf = (id: string, name: string): Membership['club'] => ({
  id,
  name,
  clubType: 'BAND',
  status: 'ACTIVE',
  profileImageUrl: null,
  themeColor: null,
})

type Outcome = 'ok' | 'cancelled' | 'forbidden' | 'restore'

type RecoveryMock = {
  withdrawnAt: string
  expiresAt: string
  name: string
  profileImageUrl: string | null
}

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
      id: 'm1',
      clubId: 'c1',
      club: clubOf('c1', '한빛 밴드 동아리'),
      role: 'MEMBER',
      status: 'INVITED',
      invitationExpiresAt: inDays(5),
      requestedAt: null,
    },
    {
      id: 'm2',
      clubId: 'c2',
      club: clubOf('c2', '지난 학기 합주단'),
      role: 'MEMBER',
      status: 'INVITED',
      invitationExpiresAt: ago(2),
      requestedAt: null,
    },
    {
      id: 'm3',
      clubId: 'c3',
      club: clubOf('c3', '서울 인디 밴드'),
      role: 'MEMBER',
      status: 'PENDING',
      invitationExpiresAt: null,
      requestedAt: ago(3),
    },
    {
      id: 'm5',
      clubId: 'c5',
      club: clubOf('c5', '크레인 밴드 (임원)'),
      role: 'CLUB_ADMIN',
      status: 'ACTIVE',
      invitationExpiresAt: null,
      requestedAt: null,
    },
    {
      id: 'm4',
      clubId: 'c4',
      club: clubOf('c4', '홍대 합주단'),
      role: 'MEMBER',
      status: 'REJECTED',
      invitationExpiresAt: null,
      requestedAt: null,
    },
  ] as Membership[],
  // Members of club c5 as an officer sees them (API-020/022/023/024/025/143).
  clubMembers: [
    ['p1', '김민수', 'minsu_kim', 'PENDING', 'JOIN_CODE', 'REGULAR'],
    ['p2', '이서연', 'seoyeon_lee', 'PENDING', 'SEARCH', 'REGULAR'],
    ['i1', '박지훈', 'jihun_park', 'INVITED', 'ADMIN_ADDED', 'REGULAR'],
    ['i2', '최유나', 'yuna_choi', 'INVITED', 'ADMIN_ADDED', 'GUEST'],
    ['d1', '정하늘', 'haneul_jung', 'DECLINED', 'ADMIN_ADDED', 'REGULAR'],
    ['a1', '한소희', 'sohee_han', 'ACTIVE', 'JOIN_CODE', 'REGULAR'],
  ].map(([id, userName, handle, status, joinSource, memberType], i) => ({
    id,
    userName,
    handle,
    profileImageUrl: null,
    displayName: null,
    memberType,
    status,
    joinSource,
    requestedAt: status === 'PENDING' ? ago(i + 1) : null,
    // i2 is already expired: it shows the "다시 초대" button.
    invitationExpiresAt:
      status === 'INVITED' ? (id === 'i2' ? ago(1) : inDays(10)) : null,
  })),
  outcome: 'ok' as Outcome,
  recovery: {
    withdrawnAt: ago(30),
    expiresAt: inDays(60),
    name: '송예림',
    profileImageUrl: null,
  } as RecoveryMock | null,
})

// Clubs for the join screens (API-012/013/014). Code ABCD234XYZ joins "크레인 밴드".
const CLUBS = [
  ['c10', '크레인 밴드', 'ABCD234XYZ', '신촌 기반 밴드 동아리입니다.'],
  ['c1', '한빛 밴드 동아리', 'HANBIT2345', '초대를 받은 동아리 (INVITED).'],
  ['c3', '서울 인디 밴드', 'SEOULINDI2', '이미 가입 신청한 동아리 (PENDING).'],
  ...Array.from({ length: 25 }, (_, i) => [
    `c2${i}`,
    `합주단 ${i + 1}호`,
    `HAPJU${String(i + 1).padStart(5, '2')}`,
    '검색 결과 더 보기 확인용',
  ]),
].map(([id, name, code, description]) => ({ id, name, code, description }))

const preview = (c: (typeof CLUBS)[number], memberships: Membership[]) => ({
  club: {
    id: c.id,
    name: c.name,
    description: c.description,
    clubType: 'CLUB',
    profileImageUrl: null,
    themeColor: null,
  },
  existingMembershipStatus:
    memberships.find((m) => m.clubId === c.id)?.status ?? null,
  canApply: !memberships.some(
    (m) =>
      m.clubId === c.id && ['INVITED', 'PENDING', 'ACTIVE'].includes(m.status),
  ),
})

const COOKIE_EXCHANGE = 'loginExchange'
const COOKIE_SESSION = 'mockSession'
// The 10-minute recovery-choice cookie that a withdrawn account gets instead of a session.
const COOKIE_RESTORE = 'restoreChoice'

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
      if (failed) state.outcome = 'ok' // exchange is skipped, so reset here
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
      const restore = outcome === 'restore'
      return send(
        res,
        200,
        {
          data: {
            loginResult: restore ? 'RESTORATION_REQUIRED' : 'LOGGED_IN',
            user: null,
            onboardingRequired: false,
          },
        },
        {
          // The exchange cookie is single-use. A withdrawn account gets the choice cookie only.
          'Set-Cookie': restore
            ? [
                setCookie(COOKIE_EXCHANGE, false),
                setCookie(COOKIE_RESTORE, true),
              ]
            : [
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

    // Recovery choice (API 131-133): runs on the choice cookie, not a session. 131 does not
    // consume the cookie; 132/133 do, and a success logs the account in.
    if (
      path.startsWith('/api/v1/auth/') &&
      hasCookie(req, COOKIE_RESTORE) === false
    ) {
      if (
        (path === '/api/v1/auth/recovery-info' && method === 'GET') ||
        ((path === '/api/v1/auth/restore' ||
          path === '/api/v1/auth/start-new') &&
          method === 'POST')
      )
        return send(res, 401, {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'UNAUTHENTICATED',
            details: [
              { field: 'request', reason: 'RESTORATION_COOKIE_INVALID' },
            ],
          },
        })
    }
    if (path === '/api/v1/auth/recovery-info' && method === 'GET') {
      if (!state.recovery) return fail(res, 409, 'NOT_RESTORABLE')
      return ok(res, state.recovery)
    }
    if (
      (path === '/api/v1/auth/restore' || path === '/api/v1/auth/start-new') &&
      method === 'POST'
    ) {
      const restoring = path === '/api/v1/auth/restore'
      const consume = [
        setCookie(COOKIE_RESTORE, false),
        setCookie(COOKIE_SESSION, true),
      ]
      if (
        !state.recovery ||
        (restoring && Date.parse(state.recovery.expiresAt) <= Date.now())
      )
        return send(
          res,
          409,
          { error: { code: 'NOT_RESTORABLE', message: 'NOT_RESTORABLE' } },
          { 'Set-Cookie': setCookie(COOKIE_RESTORE, false) },
        )
      state.user.name = restoring ? state.recovery.name : '새사용자'
      state.user.onboardingRequired = true
      state.recovery = null
      return send(
        res,
        200,
        { data: { success: true } },
        { 'Set-Cookie': consume },
      )
    }

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
      return ok(res, { items: state.memberships })

    if (path === '/api/v1/users/handle-availability' && method === 'GET') {
      const handle = url.searchParams.get('handle') ?? ''
      await new Promise((r) => setTimeout(r, 300)) // lets the "checking" state show
      return ok(res, { available: !TAKEN_HANDLES.includes(handle) })
    }

    if (path === '/api/v1/clubs/join-code/resolve' && method === 'POST') {
      const { joinCode } = await readBody(req)
      const club = CLUBS.find((c) => c.code === joinCode)
      return club
        ? ok(res, preview(club, state.memberships))
        : fail(res, 404, 'NOT_FOUND')
    }
    if (path === '/api/v1/clubs/search' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim()
      if (q.length < 2 || q.length > 100)
        return fail(res, 400, 'VALIDATION_ERROR')
      const size = Number(url.searchParams.get('size') ?? 20)
      const page = Number(url.searchParams.get('page') ?? 0)
      const hits = CLUBS.filter((c) => c.name.includes(q))
      return ok(res, {
        items: hits
          .slice(page * size, (page + 1) * size)
          .map((c) => preview(c, state.memberships)),
        page,
        size,
        totalElements: hits.length,
        totalPages: Math.ceil(hits.length / size),
      })
    }
    const joinRequest = /^\/api\/v1\/clubs\/([^/]+)\/join-requests$/.exec(path)
    if (joinRequest && method === 'POST') {
      const club = CLUBS.find((c) => c.id === joinRequest[1])
      if (!club) return fail(res, 404, 'NOT_FOUND')
      const { source, joinCode } = await readBody(req)
      if (source === 'JOIN_CODE' ? joinCode !== club.code : source !== 'SEARCH')
        return fail(res, 404, 'NOT_FOUND')
      if (!preview(club, state.memberships).canApply)
        return fail(res, 409, 'DUPLICATE')
      state.memberships = state.memberships.filter((m) => m.clubId !== club.id)
      state.memberships.push({
        id: `m${Date.now()}`,
        clubId: club.id,
        club: clubOf(club.id, club.name),
        role: 'MEMBER',
        status: 'PENDING',
        invitationExpiresAt: null,
        requestedAt: new Date().toISOString(),
      })
      return send(res, 201, { data: { status: 'PENDING', approvedAt: null } })
    }

    // API-026/027 (invite) and API-028 (cancel a join request).
    const action =
      /^\/api\/v1\/clubs\/([^/]+)\/(?:memberships\/([^/]+)\/(accept|decline)|join-requests\/([^/]+)\/(cancel))$/.exec(
        path,
      )
    if (action && method === 'POST') {
      const clubId = action[1]
      const id = action[2] ?? action[4]
      const what = action[3] ?? action[5]
      const m = state.memberships.find(
        (x) => x.clubId === clubId && x.id === id,
      )
      if (!m) return fail(res, 404, 'NOT_FOUND')
      const invited = m.status === 'INVITED'
      if (what === 'cancel' ? m.status !== 'PENDING' : !invited)
        return fail(res, 409, 'STATE_CONFLICT')
      if (invited && Date.parse(m.invitationExpiresAt ?? '') <= Date.now())
        return fail(res, 409, 'STATE_CONFLICT')
      if (what === 'accept') m.status = 'ACTIVE'
      else state.memberships = state.memberships.filter((x) => x !== m)
      return send(res, 204)
    }

    // CLUB-104/105: only club c5 has members in this mock.
    const clubApi = /^\/api\/v1\/clubs\/c5\/(.+)$/.exec(path)
    if (clubApi) {
      const sub = clubApi[1]
      const list = state.clubMembers
      if (method === 'GET' && sub === 'memberships') {
        const wanted = (url.searchParams.get('status') ?? 'ACTIVE').split(',')
        const items = list.filter((m) => wanted.includes(m.status))
        return ok(res, {
          items,
          page: 0,
          size: 100,
          totalElements: items.length,
          totalPages: 1,
        })
      }
      const decide = /^memberships\/([^/]+)\/(approve|reject)$/.exec(sub)
      if (method === 'POST' && decide) {
        const m = list.find((x) => x.id === decide[1])
        if (!m) return fail(res, 404, 'NOT_FOUND')
        if (m.status !== 'PENDING') return fail(res, 409, 'STATE_CONFLICT')
        m.status = decide[2] === 'approve' ? 'ACTIVE' : 'REJECTED'
        return ok(res, m)
      }
      if (method === 'POST' && sub === 'join-requests/bulk-decisions') {
        const { membershipIds, decision } = await readBody(req)
        const ids = Array.isArray(membershipIds) ? membershipIds : []
        const succeeded: { membershipId: string }[] = []
        const failed: { membershipId: string; reason: string }[] = []
        for (const id of ids) {
          const m = list.find((x) => x.id === id)
          if (m?.status === 'PENDING') {
            m.status = decision === 'APPROVE' ? 'ACTIVE' : 'REJECTED'
            succeeded.push({ membershipId: String(id) })
          } else
            failed.push({ membershipId: String(id), reason: 'NOT_PENDING' })
        }
        return ok(res, {
          succeeded,
          failed,
          summary: {
            requested: ids.length,
            succeeded: succeeded.length,
            failed: failed.length,
          },
        })
      }
      if (method === 'GET' && sub === 'users/lookup') {
        const handle = url.searchParams.get('handle') ?? ''
        const known = [
          ...list.map((m) => [m.handle, m.userName] as const),
          ['newbie_kim', '신입 김'],
        ]
        const hit = known.find(([h]) => h === handle)
        if (!hit) return fail(res, 404, 'NOT_FOUND')
        const m = list.find((x) => x.handle === handle)
        const live = m && ['ACTIVE', 'PENDING', 'INVITED'].includes(m.status)
        return ok(res, {
          userId: handle,
          handle,
          name: hit[1],
          profileImageUrl: null,
          membership: live
            ? {
                id: m.id,
                status: m.status,
                invitationExpiresAt: m.invitationExpiresAt,
              }
            : null,
        })
      }
      if (method === 'POST' && sub === 'memberships/invite') {
        const { handle, memberType } = await readBody(req)
        const m = list.find((x) => x.handle === handle)
        const expired =
          m?.status === 'INVITED' &&
          Date.parse(m.invitationExpiresAt ?? '') <= Date.now()
        if (m && ['ACTIVE', 'PENDING'].includes(m.status))
          return fail(res, 409, 'DUPLICATE')
        if (m?.status === 'INVITED' && !expired)
          return fail(res, 409, 'DUPLICATE')
        const type = memberType === 'GUEST' ? 'GUEST' : 'REGULAR'
        const until = inDays(30)
        if (m)
          Object.assign(m, {
            status: 'INVITED',
            memberType: type,
            invitationExpiresAt: until,
          })
        else
          list.push({
            id: `n${Date.now()}`,
            userName: '신입 김',
            handle: String(handle),
            profileImageUrl: null,
            displayName: null,
            memberType: type,
            status: 'INVITED',
            joinSource: 'ADMIN_ADDED',
            requestedAt: null,
            invitationExpiresAt: until,
          })
        return send(res, expired ? 200 : 201, { data: { status: 'INVITED' } })
      }
    }

    return fail(res, 404, 'NOT_FOUND')
  }
}
