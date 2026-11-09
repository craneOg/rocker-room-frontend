import type { IncomingMessage, ServerResponse } from 'node:http'
import { auditionMock } from './auditionMock.ts'
import { handlePerformanceForm } from './performanceFormMock.ts'
import { createPerformancePolicyMock } from './performancePolicyMock.ts'
import { bodyCache, createPerformanceViewMock } from './performanceViewMock.ts'
import { createSongMock } from './songMock.ts'

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
const PREVIEW_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const TAKEN_HANDLES = ['admin', 'rocker', 'drummer_kim']
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const inDays = (days: number) => ago(-days)

const initialState = () => ({
  user: {
    id: '1',
    name: '명혜성',
    handle: null as string | null,
    profileImageUrl: null as string | null,
    profileImagePublic: true,
    onboardingRequired: true,
    isSuperAdmin: false,
  },
  memberships: [
    {
      id: 'm1',
      clubId: 'c1',
      club: clubOf('c1', '한빛 밴드 동아리'),
      role: 'CLUB_ADMIN',
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
    {
      id: 'u1',
      clubId: 'c10',
      club: clubOf('c10', '크레인 밴드'),
      role: 'CLUB_ADMIN',
      status: 'ACTIVE',
      invitationExpiresAt: null,
      requestedAt: null,
    },
  ] as Membership[],
  // CLUB-106/107 state of club c5 (API-016/017/018/019/033-035).
  settings: {
    joinCode: 'MOCKCODE22' as string | null,
    isSearchable: true,
    parts: ['보컬', '기타', '베이스', '드럼', '키보드'].map((name, i) => ({
      id: `p${i + 1}`,
      name,
      displayOrder: i,
      isActive: true,
      memberCount: 5 - i,
    })),
  },
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
  // API-135: unconfirmed succession notices (c1 = the club the invite card accepts).
  notices: [
    {
      id: 'n1',
      type: 'ADMIN',
      clubId: 'c1',
      clubName: '한빛 밴드 동아리',
      teamName: null,
      performanceName: null,
    },
  ] as { id: string; [k: string]: unknown }[],
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

// Club info and members (API-015/020/021/033) for club c10, where the mock user is an officer.
const PARTS = [
  { id: 'p1', name: '보컬', displayOrder: 1, isActive: true },
  { id: 'p2', name: '기타', displayOrder: 2, isActive: true },
  { id: 'p3', name: '베이스', displayOrder: 3, isActive: true },
  { id: 'p4', name: '드럼', displayOrder: 4, isActive: true },
  { id: 'p5', name: '건반', displayOrder: 5, isActive: false },
]

type MockMember = {
  id: string
  userName: string
  displayName: string | null
  handle: string
  memberType: 'REGULAR' | 'GUEST'
  role: 'CLUB_ADMIN' | 'MEMBER'
  status: 'ACTIVE' | 'ON_LEAVE' | 'GRADUATED' | 'WITHDRAWN'
  joinSource: string
  approvedAt: string
  partIds: string[]
}

// Editable club type (API-016); name and description are edited in place on CLUBS.
const clubMeta = { clubType: 'BAND' }

const NAMES = ['명혜성', '송예림', '정규채', '김도윤', '이서연', '박지호']
const MEMBERS: MockMember[] = Array.from({ length: 30 }, (_, i) => ({
  id: `u${i + 1}`,
  userName: i < NAMES.length ? (NAMES[i] ?? '') : `멤버${i + 1}`,
  displayName: i % 4 === 0 ? `별명${i + 1}` : null,
  handle: `member_${i + 1}`,
  memberType: i % 7 === 6 ? 'GUEST' : 'REGULAR',
  role: i === 0 || i === 1 ? 'CLUB_ADMIN' : 'MEMBER',
  status: i % 9 === 8 ? 'GRADUATED' : i % 8 === 7 ? 'ON_LEAVE' : 'ACTIVE',
  joinSource:
    i === 0
      ? 'CLUB_CREATE'
      : i % 7 === 6 || i % 3 === 2
        ? 'DIRECT_ADD'
        : i % 2
          ? 'JOIN_CODE'
          : 'SEARCH',
  approvedAt: ago(60 - i),
  partIds: ['p1', 'p2', 'p3', 'p4', 'p5'].slice(0, (i % 5) + 1),
}))

const memberView = (m: MockMember, admin: boolean) => {
  const publicView = {
    id: m.id,
    displayName: m.displayName,
    userName: m.userName,
    memberType: m.memberType,
    role: m.role,
    profileImageUrl: null,
    parts: PARTS.filter((p) => m.partIds.includes(p.id)),
  }
  return admin
    ? {
        ...publicView,
        handle: m.handle,
        status: m.status,
        joinSource: m.joinSource,
        approvedAt: m.approvedAt,
      }
    : publicView
}

const COOKIE_EXCHANGE = 'loginExchange'
const COOKIE_SESSION = 'mockSession'
// The 10-minute recovery-choice cookie that a withdrawn account gets instead of a session.
const COOKIE_RESTORE = 'restoreChoice'

export function createMockApi() {
  let state = initialState()
  const performancePolicy = createPerformancePolicyMock()
  const perfMock = createPerformanceViewMock()
  const songMock = createSongMock()

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
    const cached = bodyCache.get(req)
    if (cached) return cached
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
      perfMock.reset()
      songMock.reset()
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

    // PERF-002/006 (create, read and update of performances made here): dev/performanceFormMock.ts
    if (
      signedIn &&
      (await handlePerformanceForm(req, res, {
        path,
        method,
        memberships: state.memberships,
      }))
    )
      return

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
      // API-008 is partial; onboarding (AUTH-002) still sends both name and handle.
      const { name, handle, profileImageUrl, profileImagePublic } =
        await readBody(req)
      if (
        (name !== undefined &&
          (typeof name !== 'string' || name.length < 1 || name.length > 50)) ||
        (handle !== undefined &&
          (typeof handle !== 'string' || !/^[a-z0-9_]{5,30}$/.test(handle))) ||
        (profileImagePublic !== undefined &&
          typeof profileImagePublic !== 'boolean') ||
        (state.user.handle === null && (name === undefined || !handle))
      )
        return fail(res, 400, 'VALIDATION_ERROR')
      if (
        typeof handle === 'string' &&
        handle !== state.user.handle &&
        TAKEN_HANDLES.includes(handle)
      )
        return send(res, 409, {
          error: {
            code: 'DUPLICATE',
            message: 'DUPLICATE',
            details: [{ reason: 'HANDLE_TAKEN' }],
          },
        })
      if (typeof profileImageUrl === 'string') {
        // The key must come from API-129 (mock keys start with tmp/users/1/).
        if (!profileImageUrl.startsWith('tmp/users/1/'))
          return send(res, 404, {
            error: {
              code: 'NOT_FOUND',
              message: 'NOT_FOUND',
              details: [{ reason: 'IMAGE_KEY_NOT_FOUND' }],
            },
          })
        state.user.profileImageUrl = PREVIEW_PNG
      } else if (profileImageUrl === null) state.user.profileImageUrl = null
      if (typeof name === 'string') state.user.name = name
      if (typeof handle === 'string') state.user.handle = handle
      if (typeof profileImagePublic === 'boolean')
        state.user.profileImagePublic = profileImagePublic
      state.user.onboardingRequired = false
      return ok(res, state.user)
    }

    // API-129: the mock only checks for a multipart body; the preview is a 1x1 PNG.
    if (path === '/api/v1/me/profile-image' && method === 'POST') {
      if (
        !(req.headers['content-type'] ?? '').startsWith('multipart/form-data')
      )
        return fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE')
      req.resume() // the body is not read
      return send(res, 201, {
        data: {
          imageKey: `tmp/users/1/${Date.now()}.png`,
          previewUrl: PREVIEW_PNG,
          purpose: 'USER_PROFILE',
        },
      })
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
    // PERF-004 / PERF-005 (sample performances 91-96). Before the view mock, which answers 404 for ids it does not know.
    if (
      await performancePolicy({
        method,
        path,
        readBody: () => readBody(req),
        send: (status, body) => send(res, status, body),
        hasClub: (id) =>
          state.memberships.some(
            (m) => m.clubId === id && m.status === 'ACTIVE',
          ),
      })
    )
      return

    // SONG-001..005 (songs, evaluations, team reads of c10). Before the view mock, which would answer 404 for them.
    if (
      signedIn &&
      (await songMock({
        req,
        res,
        url,
        path,
        method,
        memberships: state.memberships,
      }))
    )
      return

    if (
      signedIn &&
      (await auditionMock({
        req,
        res,
        url,
        path,
        method,
        memberships: state.memberships,
      }))
    )
      return

    if (
      signedIn &&
      (await perfMock({
        req,
        res,
        url,
        path,
        method,
        memberships: state.memberships,
      }))
    )
      return

    // CLUB-101..103 reads. Every club the user is an ACTIVE member of serves the same sample data.
    const clubRoute =
      /^\/api\/v1\/clubs\/([^/]+)(?:\/(memberships|parts))?(?:\/([^/]+))?$/.exec(
        path,
      )
    const sampleClub = clubRoute
      ? CLUBS.find((c) => c.id === clubRoute[1])
      : undefined
    const sampleOwn = clubRoute
      ? state.memberships.find(
          (m) => m.clubId === clubRoute[1] && m.status === 'ACTIVE',
        )
      : undefined
    // A club without sample data (such as c5) falls through to its own handlers below; the last line is the 404.
    if (
      clubRoute &&
      method === 'GET' &&
      clubRoute[1] !== 'search' &&
      sampleClub &&
      sampleOwn
    ) {
      const [, , sub, memberId] = clubRoute
      const club = sampleClub
      const own = sampleOwn
      // The signed-in user is the sample member u1 (their name and handle follow the saved profile).
      const self = (m: MockMember): MockMember =>
        m.id === 'u1'
          ? {
              ...m,
              userName: state.user.name || m.userName,
              handle: state.user.handle ?? m.handle,
            }
          : m
      const members = MEMBERS.map(self)
      const admin = own.role === 'CLUB_ADMIN'
      if (!sub)
        return ok(res, {
          id: club.id,
          name: club.name,
          description: club.description,
          clubType: clubMeta.clubType,
          status: 'ACTIVE',
          isSearchable: true,
          profileImageUrl: null,
          themeColor: '#1A2B3C',
          createdAt: ago(90),
          updatedAt: ago(2),
        })
      if (sub === 'parts')
        return ok(res, {
          items: PARTS.map((p) => ({
            ...p,
            memberCount: MEMBERS.filter((m) => m.partIds.includes(p.id)).length,
          })),
        })
      if (memberId) {
        // A membership ID of the session (such as m1) is the user's own row.
        const m = members.find(
          (x) => x.id === (memberId === own.id ? 'u1' : memberId),
        )
        if (!m || (!admin && m.status === 'WITHDRAWN'))
          return fail(res, 404, 'NOT_FOUND')
        return ok(res, {
          ...memberView(m, admin),
          performances: [
            {
              id: 'f1',
              title: '정기 공연',
              status: 'ACTIVE',
              participationStatus: 'APPROVED',
            },
            {
              id: 'f2',
              title: '신입생 환영 공연',
              status: 'FINISHED',
              participationStatus: 'WITHDRAWN',
            },
          ],
        })
      }
      const q = url.searchParams
      const statusParam = q.get('status')
      if (statusParam && !admin) return fail(res, 403, 'FORBIDDEN')
      const statuses = (statusParam ?? 'ACTIVE').split(',')
      const name = (q.get('q') ?? '').trim()
      const partIds = (q.get('partId') ?? '').split(',').filter(Boolean)
      const hits = members
        .filter(
          (m) =>
            (admin ? statuses.includes(m.status) : m.status !== 'WITHDRAWN') &&
            (!name || `${m.displayName ?? ''}${m.userName}`.includes(name)) &&
            (!q.get('role') || m.role === q.get('role')) &&
            (!q.get('memberType') || m.memberType === q.get('memberType')) &&
            (partIds.length === 0 ||
              m.partIds.some((id) => partIds.includes(id))),
        )
        .sort(
          (a, b) =>
            Number(b.role === 'CLUB_ADMIN') - Number(a.role === 'CLUB_ADMIN'),
        )
      const size = Number(q.get('size') ?? 20)
      const page = Number(q.get('page') ?? 0)
      return ok(res, {
        items: hits
          .slice(page * size, (page + 1) * size)
          .map((m) => memberView(m, admin)),
        page,
        size,
        totalElements: hits.length,
        totalPages: Math.ceil(hits.length / size),
      })
    }

    // CLUB-101 1-1 / 102 4 / 103 writes (officers of c10). State lives in MEMBERS / PARTS / CLUBS.
    const writeRoute =
      /^\/api\/v1\/clubs\/c10(?:\/memberships\/(bulk|[^/]+)(?:\/(role|parts|member-type|take-leave|graduate|resume|withdraw|withdraw-preview))?)?$/.exec(
        path,
      )
    if (
      writeRoute &&
      (method !== 'GET' || writeRoute[2] === 'withdraw-preview')
    ) {
      const own = state.memberships.find(
        (m) => m.clubId === 'c10' && m.status === 'ACTIVE',
      )
      if (own?.role !== 'CLUB_ADMIN') return fail(res, 403, 'FORBIDDEN')
      const rule = (reason: string) =>
        send(res, 422, {
          error: {
            code: 'RULE_VIOLATION',
            message: reason,
            details: [{ reason }],
          },
        })
      const admins = () =>
        MEMBERS.filter(
          (m) =>
            m.role === 'CLUB_ADMIN' &&
            (m.status === 'ACTIVE' || m.status === 'ON_LEAVE'),
        )
      const [, target, action] = writeRoute
      const club = CLUBS.find((c) => c.id === 'c10')
      if (!target && method === 'PATCH' && club) {
        const body = await readBody(req)
        if (typeof body.name === 'string') {
          const name = body.name.trim()
          if (name.length < 1 || name.length > 100)
            return fail(res, 400, 'VALIDATION_ERROR')
          if (
            CLUBS.some(
              (c) =>
                c.id !== club.id && c.name.toLowerCase() === name.toLowerCase(),
            )
          )
            return send(res, 409, {
              error: {
                code: 'DUPLICATE',
                message: 'DUPLICATE',
                details: [{ reason: 'CLUB_NAME_TAKEN' }],
              },
            })
          club.name = name
        }
        if ('description' in body)
          club.description =
            typeof body.description === 'string' ? body.description : ''
        if (
          typeof body.clubType === 'string' &&
          body.clubType !== clubMeta.clubType
        ) {
          if (
            typeof body.clubTypeChangeReason !== 'string' ||
            !body.clubTypeChangeReason
          )
            return fail(res, 400, 'VALIDATION_ERROR')
          clubMeta.clubType = body.clubType
        }
        return ok(res, {
          id: club.id,
          name: club.name,
          clubType: clubMeta.clubType,
        })
      }
      if (target === 'bulk' && method === 'POST') {
        const body = await readBody(req)
        const ids = Array.isArray(body.membershipIds)
          ? (body.membershipIds as string[])
          : []
        const params = (body.params ?? {}) as Record<string, unknown>
        if (body.action === 'CHANGE_PARTS' && params.mode === 'ADD') {
          const partIds = Array.isArray(params.partIds)
            ? (params.partIds as string[])
            : []
          if (PARTS.some((p) => partIds.includes(p.id) && !p.isActive))
            return rule('PART_INACTIVE')
        }
        const succeeded: { membershipId: string; skipped: boolean }[] = []
        const failed: { membershipId: string; reason: string }[] = []
        for (const id of ids) {
          const m = MEMBERS.find((x) => x.id === id)
          if (!m) failed.push({ membershipId: id, reason: 'NOT_FOUND' })
          else if (!['ACTIVE', 'ON_LEAVE', 'GRADUATED'].includes(m.status))
            failed.push({
              membershipId: id,
              reason: 'INVALID_MEMBERSHIP_STATUS',
            })
          else if (body.action === 'CHANGE_STATUS') {
            const next = params.status
            if (
              next === 'GRADUATED' &&
              m.role === 'CLUB_ADMIN' &&
              admins().length < 2
            )
              failed.push({ membershipId: id, reason: 'LAST_ADMIN' })
            else if (next === m.status)
              failed.push({
                membershipId: id,
                reason: 'INVALID_MEMBERSHIP_STATUS',
              })
            else {
              if (next === 'GRADUATED') m.role = 'MEMBER'
              m.status = next as MockMember['status']
              succeeded.push({ membershipId: id, skipped: false })
            }
          } else if (body.action === 'CHANGE_PARTS') {
            const partIds = Array.isArray(params.partIds)
              ? (params.partIds as string[])
              : []
            m.partIds =
              params.mode === 'ADD'
                ? [...new Set([...m.partIds, ...partIds])]
                : m.partIds.filter((x) => !partIds.includes(x))
            succeeded.push({ membershipId: id, skipped: false })
          }
        }
        return ok(res, {
          succeeded,
          failed,
          summary: {
            requested: ids.length,
            succeeded: succeeded.length,
            failed: failed.length,
            skipped: 0,
          },
        })
      }
      const m = MEMBERS.find((x) => x.id === target)
      if (!m) return fail(res, 404, 'NOT_FOUND')
      const body = await readBody(req)
      const live = ['ACTIVE', 'ON_LEAVE', 'GRADUATED'].includes(m.status)
      if (action === 'role' && method === 'PUT') {
        if (body.role === 'CLUB_ADMIN') {
          if (
            m.memberType !== 'REGULAR' ||
            !['ACTIVE', 'ON_LEAVE'].includes(m.status)
          )
            return rule('ADMIN_TARGET_NOT_ELIGIBLE')
          m.role = 'CLUB_ADMIN'
        } else {
          if (m.role === 'CLUB_ADMIN' && admins().length < 2)
            return rule('LAST_ADMIN')
          m.role = 'MEMBER'
        }
        return ok(res, memberView(m, true))
      }
      if (action === 'parts' && method === 'PUT') {
        const partIds = Array.isArray(body.partIds)
          ? (body.partIds as string[])
          : []
        if (
          PARTS.some(
            (p) =>
              partIds.includes(p.id) &&
              !p.isActive &&
              !m.partIds.includes(p.id),
          )
        )
          return rule('PART_INACTIVE')
        m.partIds = partIds
        return ok(res, memberView(m, true))
      }
      if (
        (action === 'take-leave' ||
          action === 'graduate' ||
          action === 'resume') &&
        method === 'POST'
      ) {
        const next = {
          'take-leave': 'ON_LEAVE',
          graduate: 'GRADUATED',
          resume: 'ACTIVE',
        }[action] as MockMember['status']
        if (!live || m.status === next) return fail(res, 409, 'STATE_CONFLICT')
        if (next === 'GRADUATED' && m.role === 'CLUB_ADMIN') {
          if (admins().length < 2) return rule('LAST_ADMIN')
          m.role = 'MEMBER'
        }
        m.status = next
        return ok(res, memberView(m, true))
      }
      if (action === 'member-type' && method === 'PUT') {
        if (!live || m.memberType === body.memberType)
          return fail(res, 409, 'STATE_CONFLICT')
        if (typeof body.reason !== 'string' || !body.reason)
          return fail(res, 400, 'VALIDATION_ERROR')
        if (body.memberType === 'GUEST') {
          if (m.role === 'CLUB_ADMIN') return rule('ADMIN_CANNOT_BE_GUEST')
          if (m.joinSource !== 'DIRECT_ADD') return rule('NOT_DIRECTLY_ADDED')
        }
        m.memberType = body.memberType === 'GUEST' ? 'GUEST' : 'REGULAR'
        return ok(res, memberView(m, true))
      }
      const successorOf = (from: MockMember) =>
        MEMBERS.find(
          (x) =>
            x.id !== from.id &&
            x.status === 'ACTIVE' &&
            x.memberType === 'REGULAR',
        )
      if (action === 'withdraw-preview' && method === 'GET') {
        const successor = successorOf(m)
        return ok(res, {
          target: {
            membershipId: m.id,
            displayName: m.displayName ?? m.userName,
            role: m.role,
          },
          succession:
            m.role === 'CLUB_ADMIN' && admins().length < 2 && successor
              ? {
                  type: 'DESIGNATED_OR_EARLIEST',
                  candidateMembershipId: successor.id,
                  candidateName: successor.displayName ?? successor.userName,
                }
              : null,
          performanceImpacts: [
            {
              performanceId: 'f1',
              performanceName: '정기 공연',
              participationStatus: 'APPROVED',
              isTeamLeader: true,
              teamName: '1팀',
            },
          ],
          teamLeaderCandidates: [
            {
              performanceId: 'f1',
              performanceName: '정기 공연',
              teamId: 't1',
              teamName: '1팀',
              candidates: MEMBERS.filter(
                (x) => x.id !== m.id && x.status === 'ACTIVE',
              )
                .slice(0, 2)
                .map((x) => ({
                  membershipId: x.id,
                  displayName: x.displayName ?? x.userName,
                })),
            },
          ],
          warnings: [],
        })
      }
      if (action === 'withdraw' && method === 'POST') {
        if (!live) return fail(res, 409, 'STATE_CONFLICT')
        if (m.role === 'CLUB_ADMIN' && admins().length < 2) {
          const successor = successorOf(m)
          if (!successor) return rule('LAST_ADMIN')
          successor.role = 'CLUB_ADMIN'
        }
        m.status = 'WITHDRAWN'
        m.role = 'MEMBER'
        return ok(res, {
          resource: memberView(m, true),
          warnings: [],
          effects: {},
        })
      }
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

    // API-137: home data (dates are relative to now so the screen always looks current).
    if (/^\/api\/v1\/clubs\/[^/]+\/home$/.test(path) && method === 'GET') {
      const day = (n: number) => inDays(n).slice(0, 10)
      return ok(res, {
        banners: [{ type: 'MEMBER_GRADUATED' }],
        todos: [
          {
            type: 'VOTE',
            performanceId: 'p1',
            performanceName: '2026 가을 공연',
            label: '투표 (선택 0/3곡)',
            teamId: null,
            deadline: inDays(3),
          },
          {
            type: 'TEAM_SUBMIT',
            performanceId: 'p1',
            performanceName: '2026 가을 공연',
            label: '작성 중인 팀 신청서',
            teamId: 't1',
            deadline: null,
          },
        ],
        upcomingSchedules: [
          {
            scheduleId: 's1',
            performanceId: 'p1',
            startAt: inDays(2),
            endAt: new Date(
              Date.parse(inDays(2)) + 2 * 3_600_000,
            ).toISOString(),
            type: 'REHEARSAL',
            title: '1팀 합주',
            performanceName: '2026 가을 공연',
            location: '합주실 A',
          },
        ],
        myPerformances: [
          {
            performanceId: 'p1',
            name: '2026 가을 공연',
            status: 'ACTIVE',
            performanceDate: day(30),
            myStatus: 'APPROVED',
            teamNames: ['1팀', '2팀'],
            songCount: 2,
          },
        ],
      })
    }
    // API-138: admin home (5~7). API-139: home tab badge = todos (2) + pending (7).
    if (/^\/api\/v1\/clubs\/[^/]+\/home\/admin$/.test(path) && method === 'GET')
      return ok(res, {
        pending: {
          joinRequests: 2,
          invitesWaiting: 1,
          participationRequests: 3,
          teamReviews: 1,
          auditionReviews: 0,
        },
        performanceChecks: [
          {
            performanceId: 'p1',
            performanceName: '2026 가을 공연',
            satisfied: 4,
            total: 6,
            items: [
              { checkId: 'L-01', kind: 'BLOCKER', satisfied: false, count: 2 },
              { checkId: 'L-04', kind: 'BLOCKER', satisfied: false, count: 1 },
              { checkId: 'L-07', kind: 'WARNING', satisfied: false, count: 1 },
              { checkId: 'L-06', kind: 'BLOCKER', satisfied: true, count: 0 },
            ],
            responseRates: {
              playability: { answered: 12, total: 19 },
              vote: null,
              availability: { answered: 15, total: 19 },
            },
          },
        ],
        clubStats: {
          activeMembers: 19,
          admins: 3,
          graduated: 4,
          guests: 1,
          performances: { draft: 0, active: 1, locked: 0, finished: 2 },
        },
      })
    if (/^\/api\/v1\/clubs\/[^/]+\/home\/badge$/.test(path) && method === 'GET')
      return ok(res, { count: 9 })
    // API-135 / 136: succession notices.
    if (path === '/api/v1/me/succession-notices' && method === 'GET')
      return ok(res, { items: state.notices })
    const confirmNotice =
      /^\/api\/v1\/me\/succession-notices\/([^/]+)\/confirm$/.exec(path)
    if (confirmNotice && method === 'POST') {
      state.notices = state.notices.filter((n) => n.id !== confirmNotice[1])
      return ok(res, {
        id: confirmNotice[1],
        confirmedAt: new Date().toISOString(),
      })
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

    // CLUB-106/107/108 (club c5 only).
    const clubPath = /^\/api\/v1\/clubs\/c5(\/.*)?$/.exec(path)
    if (clubPath) {
      const sub = clubPath[1] ?? ''
      const settings = state.settings
      const clubDto = () => ({ id: 'c5', isSearchable: settings.isSearchable })
      if (sub === '' && method === 'GET') return ok(res, clubDto())
      if (sub === '' && method === 'PATCH') {
        const { isSearchable } = await readBody(req)
        if (typeof isSearchable === 'boolean')
          settings.isSearchable = isSearchable
        return ok(res, clubDto())
      }
      if (sub === '/join-code' && method === 'GET')
        return ok(res, { joinCode: settings.joinCode })
      if (sub === '/join-code' && method === 'DELETE') {
        settings.joinCode = null
        return send(res, 204)
      }
      if (sub === '/join-code/regenerate' && method === 'POST') {
        settings.joinCode = `NEW${Date.now().toString(36).toUpperCase()}`
          .replace(/[01]/g, '2')
          .padEnd(10, '2')
          .slice(0, 10)
        return ok(res, { joinCode: settings.joinCode })
      }
      if (sub === '/parts' && method === 'GET')
        return ok(res, {
          items: [...settings.parts].sort(
            (a, b) => a.displayOrder - b.displayOrder,
          ),
        })
      if (sub === '/parts' && method === 'POST') {
        const { name, displayOrder } = await readBody(req)
        if (typeof name !== 'string' || name.length < 1 || name.length > 50)
          return fail(res, 400, 'VALIDATION_ERROR')
        if (settings.parts.some((p) => p.name === name))
          return fail(res, 409, 'DUPLICATE')
        const part = {
          id: `p${Date.now()}`,
          name,
          displayOrder: Number(displayOrder ?? 0),
          isActive: true,
          memberCount: 0,
        }
        settings.parts.push(part)
        return send(res, 201, { data: { ...part, memberCount: undefined } })
      }
      const part = /^\/parts\/([^/]+)$/.exec(sub)
      if (part && method === 'PATCH') {
        const target = settings.parts.find((p) => p.id === part[1])
        if (!target) return fail(res, 404, 'NOT_FOUND')
        const body = await readBody(req)
        if (
          typeof body.name === 'string' &&
          settings.parts.some((p) => p !== target && p.name === body.name)
        )
          return fail(res, 409, 'DUPLICATE')
        if (typeof body.name === 'string') target.name = body.name
        if (typeof body.displayOrder === 'number')
          target.displayOrder = body.displayOrder
        if (typeof body.isActive === 'boolean') target.isActive = body.isActive
        return ok(res, { ...target, memberCount: undefined })
      }
      if (sub === '/memberships/me/leave-preview' && method === 'GET')
        return ok(res, {
          role: 'CLUB_ADMIN',
          succession: {
            type: 'DESIGNATED_OR_EARLIEST',
            candidateMembershipId: '23',
            candidateName: '김하늘',
          },
          performanceImpacts: [
            {
              performanceId: '31',
              performanceName: '2026 가을 공연',
              participationStatus: 'APPROVED',
              isTeamLeader: true,
              teamName: '1팀',
            },
          ],
          teamLeaderCandidates: [
            {
              performanceId: '31',
              performanceName: '2026 가을 공연',
              teamId: '41',
              teamName: '1팀',
              candidates: [
                { membershipId: '23', displayName: '김하늘' },
                { membershipId: '24', displayName: '박서연' },
              ],
            },
          ],
          warnings: [],
        })
      if (sub === '/memberships/m5/withdraw' && method === 'POST') {
        state.memberships = state.memberships.filter((m) => m.id !== 'm5')
        return ok(res, { resource: { id: 'm5', status: 'WITHDRAWN' } })
      }
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
