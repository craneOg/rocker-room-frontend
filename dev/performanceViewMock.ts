import type { IncomingMessage, ServerResponse } from 'node:http'

// Dev-server-only mock of PERF-001 / PERF-003 / PMEM-001 (API-037, 039, 053-060, 144, 063) and the
// ASSIGN_PERFORMANCE action of API-142. Any club the user is an ACTIVE member of is served; only
// `/clubs/:id/performances...` and `POST /clubs/:id/memberships/bulk` with that action are taken,
// everything else falls through (the caller answers 404). Never imported by src/.

type Status = 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'FINISHED' | 'CANCELED'
type PStatus = 'APPLIED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
type Source = 'APPLICATION' | 'ADMIN' | 'TEAM_SUBMISSION'

type Perf = {
  id: string
  title: string
  performDate: string | null
  location: string | null
  status: Status
  applicationOpen: boolean
}
type Row = {
  id: string
  membershipId: string
  status: PStatus
  source: Source
}
type Team = { id: string; name: string; leader: string; members: string[] }

export type MockCtx = {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  path: string
  method: string
  memberships: { id: string; clubId: string; role: string; status: string }[]
}

/** Body already read by this module: the main mock's readBody must reuse it (a stream reads once). */
export const bodyCache = new WeakMap<IncomingMessage, Record<string, unknown>>()

const NAMES = ['명혜성', '송예림', '정규채', '김도윤', '이서연', '박지호']
const PARTS = [
  { id: 'p1', name: '보컬' },
  { id: 'p2', name: '기타' },
  { id: 'p3', name: '베이스' },
  { id: 'p4', name: '드럼' },
]
// The roster matches the c10 sample members (u1..u30).
const person = (membershipId: string) => {
  const i = Number(membershipId.replace(/\D/g, '')) - 1
  return {
    name: NAMES[i] ?? `멤버${i + 1}`,
    guest: i % 7 === 6,
    graduated: i % 9 === 8,
    parts: PARTS.slice(0, (i % 4) + 1),
  }
}

const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const at = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().replace('Z', '+09:00')

const initial = () => ({
  perfs: [
    ['p1', '2026 가을 정기공연', day(20), '학생회관 소극장', 'ACTIVE', true],
    ['p2', '겨울 버스킹 (준비 중)', null, null, 'DRAFT', false],
    ['p3', '신입생 환영 공연', day(7), '야외 무대', 'LOCKED', false],
    ['p4', '지난 봄 공연', day(-60), '소극장', 'FINISHED', false],
    ['p71', '합주 가능 시간 데모', day(30), '합주실', 'ACTIVE', false],
  ].map(([id, title, performDate, location, status, applicationOpen]) => ({
    id,
    title,
    performDate,
    location,
    status,
    applicationOpen,
  })) as Perf[],
  rows: {
    p1: [
      ['pm1', 'u1', 'APPROVED', 'ADMIN'],
      ['pm3', 'u3', 'APPROVED', 'APPLICATION'],
      ['pm4', 'u4', 'APPLIED', 'APPLICATION'],
      ['pm5', 'u5', 'APPLIED', 'TEAM_SUBMISSION'],
      ['pm6', 'u6', 'REJECTED', 'APPLICATION'],
    ],
    p2: [],
    // u2 is the only player of song s1: releasing them breaks X-04.
    p3: [
      ['pm12', 'u2', 'APPROVED', 'ADMIN'],
      ['pm13', 'u3', 'APPROVED', 'ADMIN'],
    ],
    p4: [['pm21', 'u1', 'APPROVED', 'ADMIN']],
  } as Record<string, unknown[][]>,
  teams: {
    p1: [{ id: 't1', name: 'Crane Team', leader: 'u1', members: ['u1', 'u3'] }],
  } as Record<string, Team[]>,
  seq: 100,
})

export function createPerformanceViewMock() {
  let state = initial()
  const rowsOf = (pid: string): Row[] =>
    (state.rows[pid] ??= []).map(([id, membershipId, status, source]) => ({
      id: String(id),
      membershipId: String(membershipId),
      status: status as PStatus,
      source: source as Source,
    }))
  const store = (pid: string, rows: Row[]) => {
    state.rows[pid] = rows.map((r) => [
      r.id,
      r.membershipId,
      r.status,
      r.source,
    ])
  }

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(body === undefined ? undefined : JSON.stringify(body))
  }
  const ok = (res: ServerResponse, data: unknown, status = 200) =>
    send(res, status, { data })
  const fail = (
    res: ServerResponse,
    status: number,
    code: string,
    details: { field?: string; reason?: string }[] = [],
  ) => send(res, status, { error: { code, message: code, details } })

  /** Answers with an error and tells the caller the request is handled. */
  const no = (...args: Parameters<typeof fail>) => {
    fail(...args)
    return true
  }

  const readBody = async (req: IncomingMessage) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    let body: Record<string, unknown> = {}
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      body = {}
    }
    bodyCache.set(req, body)
    return body
  }

  const view = (p: Perf, clubId: string) => ({
    id: p.id,
    clubId,
    title: p.title,
    performDate: p.performDate,
    location: p.location,
    preset: 'TEAM_FIRST',
    status: p.status,
    createdByUserId: '1',
    version: '8',
    createdAt: at(-30),
    updatedAt: at(-1),
  })
  const dto = (r: Row, pid: string) => ({
    ...r,
    performanceId: pid,
    createdAt: at(-5),
    updatedAt: at(-1),
  })

  async function handle(ctx: MockCtx): Promise<boolean> {
    const { req, res, url, path, method } = ctx
    const m =
      /^\/api\/v1\/clubs\/([^/]+)\/performances(?:\/([^/]+)(?:\/(.*))?)?$/.exec(
        path,
      )
    const bulk = /^\/api\/v1\/clubs\/([^/]+)\/memberships\/bulk$/.exec(path)
    const clubId = m?.[1] ?? bulk?.[1]
    if (!clubId) return false
    const own = ctx.memberships.find(
      (x) => x.clubId === clubId && x.status === 'ACTIVE',
    )
    if (!own) return false
    const admin = own.role === 'CLUB_ADMIN'
    // The own roster id: c10 / sample clubs use u1, other clubs use their membership id.
    const self = clubId === 'c10' ? 'u1' : own.id

    if (bulk) {
      if (method !== 'POST') return false
      const body = await readBody(req)
      if (body.action !== 'ASSIGN_PERFORMANCE') return false
      if (!admin) return no(res, 403, 'FORBIDDEN')
      const params = (body.params ?? {}) as Record<string, unknown>
      const pid = String(params.performanceId)
      const perf = state.perfs.find((p) => p.id === pid)
      if (!perf) return no(res, 404, 'NOT_FOUND')
      if (!['DRAFT', 'ACTIVE'].includes(perf.status))
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
      const ids = Array.isArray(body.membershipIds)
        ? (body.membershipIds as string[])
        : []
      const rows = rowsOf(pid)
      const succeeded: { membershipId: string; skipped: boolean }[] = []
      const failed: { membershipId: string; reason: string }[] = []
      for (const id of ids) {
        const cur = rows.find((r) => r.membershipId === id)
        if (cur && ['APPLIED', 'APPROVED'].includes(cur.status))
          succeeded.push({ membershipId: id, skipped: true })
        else if (!/^u\d+$/.test(id) && id !== own.id)
          failed.push({ membershipId: id, reason: 'NOT_FOUND' })
        else {
          if (cur) cur.status = 'APPROVED'
          else
            rows.push({
              id: `pm${state.seq++}`,
              membershipId: id,
              status: 'APPROVED',
              source: 'ADMIN',
            })
          succeeded.push({ membershipId: id, skipped: false })
        }
      }
      store(pid, rows)
      ok(res, {
        succeeded,
        failed,
        summary: {
          requested: ids.length,
          succeeded: succeeded.length,
          failed: failed.length,
          skipped: succeeded.filter((s) => s.skipped).length,
        },
      })
      return true
    }

    const [, , pid, rest = ''] = m ?? []
    if (!pid) {
      if (method !== 'GET') return false
      const wanted = (url.searchParams.get('status') ?? '').split(',')
      const sort = url.searchParams.get('sort') ?? 'performDate,asc'
      const items = state.perfs
        .filter((p) => wanted.includes(p.status))
        .filter((p) => admin || p.status !== 'DRAFT')
        .sort((a, b) => {
          if (a.performDate === null || b.performDate === null)
            return a.performDate === null ? 1 : -1
          return sort.endsWith('desc')
            ? b.performDate.localeCompare(a.performDate)
            : a.performDate.localeCompare(b.performDate)
        })
      const page = Number(url.searchParams.get('page') ?? 0)
      const size = Number(url.searchParams.get('size') ?? 20)
      ok(res, {
        items: items.slice(page * size, (page + 1) * size).map((p) => ({
          ...view(p, clubId),
          myParticipationStatus:
            rowsOf(p.id).find((r) => r.membershipId === self)?.status ?? null,
          openFeatures: p.applicationOpen
            ? [{ feature: 'APPLICATION', deadlineAt: at(5) }]
            : [],
        })),
        page,
        size,
        totalElements: items.length,
        totalPages: Math.ceil(items.length / size),
      })
      return true
    }
    // `new` and the other E-stage routes belong to other mock modules (or none): fall through.
    const perf = state.perfs.find((p) => p.id === pid)
    if (!perf) return pid === 'new' ? false : no(res, 404, 'NOT_FOUND')
    if (!admin && perf.status === 'DRAFT') return no(res, 404, 'NOT_FOUND')

    if (rest === '' && method === 'GET') {
      const rows = rowsOf(pid)
      const policy = {
        performanceId: pid,
        performanceVersion: '8',
        applicationState: perf.applicationOpen ? 'OPEN' : 'CLOSED',
        applicationDeadline: perf.applicationOpen ? at(5) : null,
        candidateState: 'OPEN',
        candidateDeadline: null,
        playabilityState: 'OPEN',
        playabilityDeadline: null,
        voteState: 'DISABLED',
        voteDeadline: null,
        teamApplicationState: 'CLOSED',
        teamApplicationDeadline: null,
        availabilityState: 'CLOSED',
        availabilityDeadline: null,
        candidateScope: 'ALL_PARTICIPANTS',
        candidateLimitPerMember: 3,
        voteMethod: 'APPROVAL',
        voteMaxChoices: null,
        playabilityResultPublic: true,
        voteResultPublic: true,
        practiceSeasonStart: null,
        practiceSeasonEnd: null,
        maxSongsPerMember: null,
        updatedAt: at(-1),
      }
      ok(res, {
        performance: view(perf, clubId),
        policy,
        counts: {
          teams: (state.teams[pid] ?? []).length,
          candidateSongs: 3,
          confirmedSongs: 1,
          participants: rows.filter((r) => r.status === 'APPROVED').length,
        },
        nextSchedule: null,
      })
      return true
    }

    const team = /^teams\/([^/]+)$/.exec(rest)
    if (team && method === 'GET') {
      const t = (state.teams[pid] ?? []).find((x) => x.id === team[1])
      if (!t) return no(res, 404, 'NOT_FOUND')
      ok(res, {
        team: { id: t.id, name: t.name, leaderMembershipId: t.leader },
        members: t.members.map((id) => ({
          membershipId: id,
          displayName: person(id).name,
          isLeader: id === t.leader,
        })),
      })
      return true
    }

    if (rest === 'applications' && method === 'POST') {
      await readBody(req)
      if (perf.status !== 'ACTIVE')
        return no(res, 409, 'STATE_CONFLICT', [
          { reason: 'PERFORMANCE_NOT_ACTIVE' },
        ])
      if (!perf.applicationOpen)
        return no(res, 409, 'STATE_CONFLICT', [
          { reason: 'APPLICATION_CLOSED' },
        ])
      const rows = rowsOf(pid)
      const cur = rows.find((r) => r.membershipId === self)
      if (cur && ['APPLIED', 'APPROVED'].includes(cur.status))
        return no(res, 409, 'DUPLICATE', [{ reason: 'ALREADY_APPLIED' }])
      const next: Row = cur ?? {
        id: `pm${state.seq++}`,
        membershipId: self,
        status: 'APPLIED',
        source: 'APPLICATION',
      }
      next.status = 'APPLIED'
      if (!cur) rows.push(next)
      store(pid, rows)
      ok(res, dto(next, pid), 201)
      return true
    }

    if (rest === 'members/me' && method === 'GET') {
      const r = rowsOf(pid).find((x) => x.membershipId === self)
      if (!r) return no(res, 404, 'NOT_FOUND')
      const teams = (state.teams[pid] ?? []).filter((t) =>
        t.members.includes(self),
      )
      ok(res, {
        ...dto(r, pid),
        myTeams: teams.map((t) => ({
          teamId: t.id,
          name: t.name,
          isLeader: t.leader === self,
        })),
        myPlayingSongs:
          r.status === 'APPROVED'
            ? [
                {
                  songId: 's1',
                  title: 'Mr. Brightside',
                  partId: 'p2',
                  partName: '기타',
                  setlistOrder: 1,
                },
              ]
            : [],
        progress: {
          candidateSongs: { used: 1, limit: 3 },
          unansweredPlayabilityCount: 4,
          votes: null,
          availabilitySlotCount: null,
        },
      })
      return true
    }

    if (rest === 'members' && method === 'GET') {
      const rows = rowsOf(pid)
      const counts = (['APPLIED', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const)
        .map((s) => [s, rows.filter((r) => r.status === s).length] as const)
        .filter(([s]) => admin || s === 'APPROVED')
      const wanted = admin
        ? (url.searchParams.get('status') ?? 'APPROVED').split(',')
        : ['APPROVED']
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const partIds = (url.searchParams.get('partId') ?? '')
        .split(',')
        .filter(Boolean)
      const items = rows
        .filter((r) => wanted.includes(r.status))
        .map((r) => ({ r, p: person(r.membershipId) }))
        .filter(({ p }) => p.name.toLowerCase().includes(q))
        .filter(
          ({ p }) =>
            partIds.length === 0 || p.parts.some((x) => partIds.includes(x.id)),
        )
      const page = Number(url.searchParams.get('page') ?? 0)
      const size = Number(url.searchParams.get('size') ?? 20)
      ok(res, {
        items: items.slice(page * size, (page + 1) * size).map(({ r, p }) => ({
          ...dto(r, pid),
          displayName: p.name,
          profileImageUrl: null,
          memberType: p.guest ? 'GUEST' : 'REGULAR',
          ...(admin
            ? { membershipStatus: p.graduated ? 'GRADUATED' : 'ACTIVE' }
            : {}),
          parts: p.parts,
          teamNames: (state.teams[pid] ?? [])
            .filter((t) => t.members.includes(r.membershipId))
            .map((t) => t.name),
          playedSongCount: r.status === 'APPROVED' ? 1 : 0,
        })),
        statusCounts: Object.fromEntries(counts),
        page,
        size,
        totalElements: items.length,
        totalPages: Math.ceil(items.length / size),
      })
      return true
    }

    if (!admin && !/^members\/[^/]+\/(impact|withdraw)$/.test(rest))
      return method === 'GET' ? false : no(res, 403, 'FORBIDDEN')

    if (rest === 'members' && method === 'POST') {
      const body = await readBody(req)
      if (!['DRAFT', 'ACTIVE'].includes(perf.status))
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
      const ids = Array.isArray(body.membershipIds)
        ? (body.membershipIds as string[])
        : []
      if (ids.length === 0) return no(res, 400, 'VALIDATION_ERROR')
      const rows = rowsOf(pid)
      const items = ids.map((id) => {
        const cur = rows.find((r) => r.membershipId === id)
        if (cur) {
          if (cur.status !== 'APPROVED') cur.status = 'APPROVED'
          return cur
        }
        const row: Row = {
          id: `pm${state.seq++}`,
          membershipId: id,
          status: 'APPROVED',
          source: 'ADMIN',
        }
        rows.push(row)
        return row
      })
      store(pid, rows)
      ok(res, { items: items.map((r) => dto(r, pid)) }, 201)
      return true
    }

    if (rest === 'members/bulk-decisions' && method === 'POST') {
      const body = await readBody(req)
      if (!['DRAFT', 'ACTIVE'].includes(perf.status))
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
      const ids = Array.isArray(body.performanceMemberIds)
        ? (body.performanceMemberIds as string[])
        : []
      const rows = rowsOf(pid)
      const succeeded: { performanceMemberId: string }[] = []
      const failed: { performanceMemberId: string; reason: string }[] = []
      for (const id of ids) {
        const r = rows.find((x) => x.id === id)
        if (r?.status === 'APPLIED') {
          r.status = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
          succeeded.push({ performanceMemberId: id })
        } else failed.push({ performanceMemberId: id, reason: 'NOT_APPLIED' })
      }
      store(pid, rows)
      ok(res, {
        succeeded,
        failed,
        summary: {
          requested: ids.length,
          succeeded: succeeded.length,
          failed: failed.length,
        },
      })
      return true
    }

    const one = /^members\/([^/]+)\/(approve|reject|withdraw|impact)$/.exec(
      rest,
    )
    if (one) {
      const rows = rowsOf(pid)
      const r = rows.find((x) => x.id === one[1])
      if (!r) return no(res, 404, 'NOT_FOUND')
      // A regular member may only touch the own row (OWNER).
      if (!admin && r.membershipId !== self) return no(res, 403, 'FORBIDDEN')
      const teams = (state.teams[pid] ?? []).filter((t) =>
        t.members.includes(r.membershipId),
      )
      if (one[2] === 'impact' && method === 'GET') {
        ok(res, {
          teamIds: teams.map((t) => t.id),
          songIds: perf.status === 'LOCKED' ? ['s1'] : [],
          scheduleIds: [],
          affectedUserIds: [],
          warnings: [],
        })
        return true
      }
      if (method !== 'POST') return false
      const body = await readBody(req)
      const reason = typeof body.reason === 'string' ? body.reason : ''
      if (perf.status === 'LOCKED' && reason === '')
        return no(res, 400, 'VALIDATION_ERROR', [
          { field: 'reason', reason: 'REQUIRED' },
        ])
      if (one[2] === 'withdraw') {
        if (['FINISHED', 'CANCELED'].includes(perf.status))
          return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
        if (perf.status === 'LOCKED' && r.membershipId === 'u2')
          return no(res, 422, 'RULE_VIOLATION', [
            { field: 'songId:s1', reason: 'SONG_WITHOUT_PLAYER' },
          ])
        const successors = Array.isArray(body.teamLeaderSuccessors)
          ? (body.teamLeaderSuccessors as {
              teamId: string
              membershipId: string
            }[])
          : []
        for (const t of teams.filter((x) => x.leader === r.membershipId)) {
          const left = t.members.filter((x) => x !== r.membershipId)
          const pick = successors.find((s) => s.teamId === t.id)
          if (left.length > 0 && !(pick && left.includes(pick.membershipId)))
            return no(res, 400, 'VALIDATION_ERROR', [
              { field: 'teamLeaderSuccessors', reason: 'SUCCESSOR_REQUIRED' },
            ])
          t.members = left
          if (pick) t.leader = pick.membershipId
        }
        r.status = 'WITHDRAWN'
      } else {
        if (r.status !== 'APPLIED')
          return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
        r.status = one[2] === 'approve' ? 'APPROVED' : 'REJECTED'
      }
      store(pid, rows)
      ok(res, {
        resource: dto(r, pid),
        warnings: [],
        effects: {
          approvedPerformanceMemberIds: [],
          affectedScheduleIds: [],
          affectedUserIds: [],
        },
      })
      return true
    }
    return false
  }

  return Object.assign(handle, {
    reset: () => {
      state = initial()
    },
  })
}
