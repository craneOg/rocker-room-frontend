import type { ServerResponse } from 'node:http'
import { bodyCache, type MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of SADM-001 ~ 005 (API-141, 118, 119, 120, 122, 123, 125) and API-121 (not on the server yet). The real server has these;
// the mock lets `dev:mock` show the screens. It does not check the Super Admin flag.
// Never imported by src/.

const send = (res: ServerResponse, data: unknown) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ data }))
}
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString()

const CLUBS = Array.from({ length: 45 }, (_, i) => ({
  id: String(i + 1),
  name: `샘플 동아리 ${i + 1}`,
  clubType: i % 3 === 0 ? 'BAND' : 'CLUB',
  status: i % 7 === 6 ? 'INACTIVE' : 'ACTIVE',
  activeMemberCount: 5 + i,
  adminCount: i % 9 === 8 ? 0 : 2,
  lastActiveAt: iso(i * 5),
  ongoingPerformanceCount: i % 4,
  createdAt: iso(200 + i),
}))
const USERS = [
  {
    id: '1',
    name: '명혜성',
    handle: 'hyeseong',
    profileImageUrl: null,
    status: 'ACTIVE',
    isSuperAdmin: true,
    lastActiveAt: iso(0),
    kakaoLinked: true,
    createdAt: iso(120),
    clubs: [
      {
        clubId: '1',
        name: '샘플 동아리 1',
        role: 'CLUB_ADMIN',
        membershipStatus: 'ACTIVE',
        joinSource: 'CREATOR',
      },
    ],
  },
]
const ACTIONS = ['CLUB_DEACTIVATED', 'FORCE_LOGOUT', 'MEMBERSHIP_APPROVED']
const LOGS = Array.from({ length: 60 }, (_, i) => ({
  id: String(i + 1),
  action: ACTIONS[i % 3]!,
  targetType: 'CLUB',
  targetId: String((i % 45) + 1),
  actorUserId: i % 5 === 0 ? null : '1',
  clubId: String((i % 45) + 1),
  reason: `샘플 사유 ${i + 1}`,
  detail: { before: 'ACTIVE', after: 'INACTIVE' },
  createdAt: iso(i / 4),
}))

// SADM-003: admins per club (by adminCount; club 5, 10, ... has one), kept in memory.
const adminsOf = new Map<string, Record<string, unknown>[]>()
const admins = (c: (typeof CLUBS)[number]) => {
  let list = adminsOf.get(c.id)
  if (!list) {
    const n = Number(c.id) % 5 === 0 && c.adminCount > 0 ? 1 : c.adminCount
    list = Array.from({ length: n }, (_, i) => ({
      membershipId: `${c.id}0${i}`,
      userId: `${c.id}0${i}`,
      displayName: `임원 ${c.id}-${i + 1}`,
      handle: `admin${c.id}_${i + 1}`,
      status: 'ACTIVE',
      lastActiveAt: iso(i + 1),
    }))
    adminsOf.set(c.id, list)
  }
  return list
}
const readBody = async (ctx: MockCtx) => {
  let raw = ''
  for await (const chunk of ctx.req) raw += String(chunk)
  const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  bodyCache.set(ctx.req, body)
  return body
}

const paged = <T>(all: T[], page: number, size: number) => ({
  items: all.slice(page * size, page * size + size),
  page,
  size,
  totalElements: all.length,
  totalPages: Math.max(1, Math.ceil(all.length / size)),
})

export async function handleAdmin(ctx: MockCtx): Promise<boolean> {
  const { req, res, url, path, method } = ctx
  // Successor candidates of SADM-003 (club member API) for the sample clubs.
  const mem = /^\/api\/v1\/clubs\/(\d+)\/memberships$/.exec(path)
  if (mem && method === 'GET') {
    send(res, {
      items: Array.from({ length: 4 }, (_, i) => ({
        id: `${mem[1]}9${i}`,
        displayName: `정회원 ${mem[1]}-${i + 1}`,
        userName: `정회원 ${i + 1}`,
        memberType: 'REGULAR',
        role: 'MEMBER',
        profileImageUrl: null,
        parts: [],
        handle: `member${mem[1]}_${i + 1}`,
        status: 'ACTIVE',
      })),
      page: 0,
      size: 100,
      totalElements: 4,
      totalPages: 1,
    })
    return true
  }
  if (!path.startsWith('/api/v1/admin/')) return false
  const q = url.searchParams
  const page = Number(q.get('page') ?? 0)
  const size = Number(q.get('size') ?? 20)

  if (path === '/api/v1/admin/overview' && method === 'GET') {
    const days = Number(q.get('periodDays') ?? 30)
    send(res, {
      periodDays: days,
      metrics: {
        activeClubs: 38,
        totalUsers: 412,
        activeUsers30d: 190,
        ongoingPerformances: 12,
      },
      trend: Array.from({ length: days }, (_, i) => ({
        date: iso(days - i).slice(0, 10),
        newUsers: (i * 7) % 5,
        newClubs: i % 6 === 0 ? 1 : 0,
        newPerformances: (i * 3) % 4,
        newSchedules: (i * 5) % 7,
      })),
      joinStatus: {
        requested: 40,
        approved: 31,
        rejected: 4,
        invited: 12,
        invitationAccepted: 9,
        invitationExpired: 2,
      },
      attention: [
        {
          clubId: '9',
          clubName: '샘플 동아리 9',
          reason: 'NO_ADMIN',
          lastAdminActiveAt: null,
        },
        {
          clubId: '4',
          clubName: '샘플 동아리 4',
          reason: 'ADMIN_INACTIVE_OVER_180_DAYS',
          lastAdminActiveAt: iso(200),
        },
      ],
    })
    return true
  }
  if (path === '/api/v1/admin/clubs' && method === 'GET') {
    const term = (q.get('q') ?? '').toLowerCase()
    const status = q.get('status')
    const rows = CLUBS.filter(
      (c) =>
        (!term || c.name.toLowerCase().includes(term) || c.id === term) &&
        (!status || c.status === status) &&
        (q.get('noAdmin') !== 'true' || c.adminCount === 0) &&
        (q.get('inactiveOver180Days') !== 'true' ||
          Date.now() - Date.parse(c.lastActiveAt) > 180 * 86_400_000),
    )
    send(res, paged(rows, page, size))
    return true
  }
  const one =
    /^\/api\/v1\/admin\/clubs\/(\d+)(?:\/(deactivate|reactivate|replace-admin))?$/.exec(
      path,
    )
  const target = one && CLUBS.find((c) => c.id === one[1])
  if (one && !target) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'NOT_FOUND' } }),
    )
    return true
  }
  if (one && target && !one[2] && method === 'GET') {
    const list = admins(target)
    send(res, {
      club: {
        id: target.id,
        name: target.name,
        description: null,
        clubType: target.clubType,
        status: target.status,
        isSearchable: true,
        createdByUserId: '1',
        createdAt: target.createdAt,
        updatedAt: target.createdAt,
      },
      creator: { userId: '1', name: '명혜성' },
      joinCodeEnabled: true,
      admins: list,
      counts: {
        members: target.activeMemberCount + 3,
        performances: 6,
        memberStatus: {
          active: target.activeMemberCount,
          onLeave: 2,
          graduated: 1,
          guests: 0,
        },
        performanceStatus: {
          draft: 1,
          active: 2,
          locked: 1,
          finished: 2,
          canceled: 0,
        },
      },
      lastActiveAt: target.lastActiveAt,
    })
    return true
  }
  if (one && target && one[2] && method === 'POST') {
    const body = await readBody(ctx)
    const fail = (status: number, code: string, extra = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code, message: code, ...extra } }))
    }
    if (one[2] === 'deactivate') {
      target.status = 'INACTIVE'
      send(res, { id: target.id, status: target.status })
    } else if (one[2] === 'reactivate') {
      if (admins(target).length === 0 && body.confirmed !== true)
        fail(409, 'CONFIRMATION_REQUIRED', {
          warnings: [
            {
              type: 'NO_CLUB_ADMIN',
              message: '이 동아리에는 임원이 없어요. 그래도 다시 활성화할까요?',
            },
          ],
        })
      else {
        target.status = 'ACTIVE'
        send(res, { id: target.id, status: target.status })
      }
    } else {
      // ponytail: body and response are guesses (API-121 is not on the server).
      adminsOf.set(target.id, [
        {
          membershipId: String(body.successorMembershipId),
          userId: String(body.successorMembershipId),
          displayName: '새 임원',
          handle: 'new_admin',
          status: 'ACTIVE',
          lastActiveAt: iso(0),
        },
      ])
      send(res, { clubId: target.id })
    }
    return true
  }
  if (path === '/api/v1/admin/users' && method === 'GET') {
    const handle = q.get('handle')
    const userId = q.get('userId')
    send(
      res,
      paged(
        USERS.filter((u) => u.handle === handle || u.id === userId),
        0,
        20,
      ),
    )
    return true
  }
  const out = /^\/api\/v1\/admin\/users\/([^/]+)\/force-logout$/.exec(path)
  if (out && method === 'POST') {
    // Read through the shared cache so the main mock may read the body again.
    let raw = ''
    for await (const chunk of req) raw += String(chunk)
    bodyCache.set(req, raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
    send(res, { userId: out[1], revoked: true })
    return true
  }
  if (path === '/api/v1/admin/audit-logs' && method === 'GET') {
    const action = q.get('action')
    const rows = LOGS.filter((l) => !action || l.action === action)
    send(res, paged(rows, page, size))
    return true
  }
  return false
}
