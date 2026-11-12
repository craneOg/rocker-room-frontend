import type { ServerResponse } from 'node:http'
import { bodyCache, type MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of SADM-001 ~ 005 (API-141, 118, 122, 123, 125). The real server has these;
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

const paged = <T>(all: T[], page: number, size: number) => ({
  items: all.slice(page * size, page * size + size),
  page,
  size,
  totalElements: all.length,
  totalPages: Math.max(1, Math.ceil(all.length / size)),
})

export async function handleAdmin(ctx: MockCtx): Promise<boolean> {
  const { req, res, url, path, method } = ctx
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
          reason: 'ADMIN_INACTIVE_180D',
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
    const [action, clubId, actor] = ['action', 'clubId', 'actorUserId'].map(
      (k) => q.get(k),
    )
    const from = q.get('from') ? Date.parse(q.get('from')!) : -Infinity
    const to = q.get('to') ? Date.parse(q.get('to')!) : Infinity
    const rows = LOGS.filter(
      (l) =>
        (!action || l.action === action) &&
        (!clubId || l.clubId === clubId) &&
        (!actor || l.actorUserId === actor) &&
        Date.parse(l.createdAt) >= from &&
        Date.parse(l.createdAt) <= to,
    )
    send(res, paged(rows, page, size))
    return true
  }
  return false
}
