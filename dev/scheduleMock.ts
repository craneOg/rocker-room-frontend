import type { ServerResponse } from 'node:http'
import { bodyCache, type MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of SCHD-001 / 002 / 003 (API-105 ~ 115, 153) for club c10 and the
// performances p1 (ACTIVE), p2 (DRAFT) and p3 (LOCKED) of the performance view mock. It also
// answers the team / song choice lists (API-061 / 075) that the schedule form and the calendar
// filters read. Sample schedules are sc1 ~ sc9. Everything else falls through (`false`).
// Never imported by src/.

type Status = 'TENTATIVE' | 'CONFIRMED' | 'CANCELED'
type Sch = {
  id: string
  pid: string
  eventType: string
  status: Status
  startAt: string
  endAt: string
  title: string
  location: string | null
  memo: string | null
  forAll: boolean
  teamIds: string[]
  songIds: string[]
  version: number
}

const PERF_INFO: Record<string, { title: string; day: number | null }> = {
  p1: { title: '2026 가을 정기공연', day: 20 },
  p2: { title: '겨울 버스킹 (준비 중)', day: null },
  p3: { title: '신입생 환영 공연', day: 7 },
  p4: { title: '지난 봄 공연', day: -60 },
}
const NAMES = ['명혜성', '송예림', '정규채', '김도윤', '이서연', '박지호']
const name = (u: string) => {
  const i = Number(u.replace(/\D/g, '')) - 1
  return NAMES[i] ?? `멤버${i + 1}`
}
const TEAMS = [
  { id: 't1', name: 'Crane Team', members: ['u1', 'u3'] },
  { id: 't2', name: '보컬 팀', members: ['u2', 'u4'] },
]
const SONGS = [
  { id: 's1', title: '첫 곡', players: ['u2'] },
  { id: 's2', title: '둘째 곡', players: ['u1', 'u5'] },
]
const EVERYONE = ['u1', 'u2', 'u3', 'u4']

const kstNow = () => new Date(Date.now() + 9 * 3_600_000)
const ymd = (offset: number) =>
  new Date(kstNow().getTime() + offset * 86_400_000).toISOString().slice(0, 10)
const when = (offset: number, hm: string) => `${ymd(offset)}T${hm}:00+09:00`

const sample = (
  n: number,
  pid: string,
  eventType: string,
  status: Status,
  offset: number,
  extra: Partial<Sch> = {},
): Sch => ({
  id: `sc${n}`,
  pid,
  eventType,
  status,
  startAt: when(offset, '18:00'),
  endAt: when(offset, '20:00'),
  title: '',
  location: '합주실 A',
  memo: null,
  forAll: false,
  teamIds: [],
  songIds: [],
  version: 1,
  ...extra,
})

const initial = (): { rows: Sch[]; seq: number } => ({
  rows: [
    sample(1, 'p1', 'PRACTICE', 'CONFIRMED', 2, {
      title: 'Crane Team 합주',
      teamIds: ['t1'],
    }),
    sample(2, 'p1', 'REHEARSAL', 'CONFIRMED', 10, {
      title: '리허설',
      forAll: true,
      location: '학생회관 소극장',
      memo: '악기와 케이블을 챙겨 주세요.',
    }),
    sample(3, 'p1', 'PRACTICE', 'TENTATIVE', 2, {
      title: '보컬 팀 합주 (임시)',
      startAt: when(2, '19:00'),
      endAt: when(2, '21:00'),
      teamIds: ['t2'],
      songIds: ['s2'],
    }),
    sample(4, 'p1', 'AUDITION', 'CONFIRMED', 6, {
      title: '오디션',
      forAll: true,
      location: null,
    }),
    sample(5, 'p1', 'PRACTICE', 'CANCELED', 1, {
      title: '취소된 합주',
      teamIds: ['t1'],
    }),
    sample(6, 'p2', 'PRACTICE', 'TENTATIVE', 8, {
      title: '버스킹 합주 (임시)',
      forAll: true,
    }),
    sample(7, 'p3', 'REHEARSAL', 'CONFIRMED', 3, {
      title: '환영 공연 리허설',
      forAll: true,
    }),
    sample(8, 'p3', 'ETC', 'CONFIRMED', -3, {
      title: '뒤풀이 모임',
      songIds: ['s2'],
    }),
    sample(9, 'p1', 'PRACTICE', 'CONFIRMED', 12, {
      title: '막바지 합주',
      forAll: true,
    }),
  ],
  seq: 100,
})

export function createScheduleMock() {
  let state = initial()

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
    details: { field?: string; reason?: string; message?: string }[] = [],
  ) => send(res, status, { error: { code, message: code, details } })
  const no = (...args: Parameters<typeof fail>) => {
    fail(...args)
    return true
  }

  const readBody = async (ctx: MockCtx) => {
    let raw = ''
    for await (const chunk of ctx.req) raw += chunk
    let body: Record<string, unknown> = {}
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      body = {}
    }
    bodyCache.set(ctx.req, body)
    return body
  }

  const attendees = (s: {
    forAll: boolean
    teamIds: string[]
    songIds: string[]
  }) => {
    if (s.forAll) return EVERYONE
    const ids = [
      ...TEAMS.filter((t) => s.teamIds.includes(t.id)).flatMap(
        (t) => t.members,
      ),
      ...SONGS.filter((x) => s.songIds.includes(x.id)).flatMap(
        (x) => x.players,
      ),
    ]
    return [...new Set(ids)]
  }
  const autoTitle = (s: Sch) => {
    const info = PERF_INFO[s.pid]
    const end = { PRACTICE: '합주', REHEARSAL: '리허설', AUDITION: '오디션' }[
      s.eventType
    ]
    const teams = TEAMS.filter((t) => s.teamIds.includes(t.id))
    const team =
      teams.length > 1
        ? `${teams[0]?.name} 외 ${teams.length - 1}팀`
        : (teams[0]?.name ?? '')
    return [info?.title, team, end ?? '일정'].filter(Boolean).join(' ')
  }
  const resource = (s: Sch) => ({
    id: s.id,
    performanceId: s.pid,
    eventType: s.eventType,
    status: s.status,
    startAt: s.startAt,
    endAt: s.endAt,
    title: s.title || autoTitle(s),
    location: s.location,
    version: String(s.version),
    memo: s.memo,
    forAllParticipants: s.forAll,
    teamIds: s.teamIds,
    songIds: s.songIds,
    performanceTitle: PERF_INFO[s.pid]?.title ?? '',
  })

  /** OVERLAP against the other live schedules of the club, OUT_OF_SEASON a month ahead. */
  const warningsFor = (
    cand: { startAt: string; endAt: string } & Parameters<typeof attendees>[0],
    selfId?: string,
  ) => {
    const mine = attendees(cand)
    const warnings: Record<string, unknown>[] = []
    for (const o of state.rows) {
      if (o.id === selfId || o.status === 'CANCELED') continue
      const from = Math.max(Date.parse(o.startAt), Date.parse(cand.startAt))
      const to = Math.min(Date.parse(o.endAt), Date.parse(cand.endAt))
      if (from >= to) continue
      const shared = attendees(o).filter((u) => mine.includes(u))
      if (!shared.length) continue
      const iso = (t: number) =>
        new Date(t + 9 * 3_600_000).toISOString().replace(/\.\d+Z$/, '+09:00')
      warnings.push({
        type: 'OVERLAP',
        scheduleId: o.id,
        title: o.title || autoTitle(o),
        startAt: iso(from),
        endAt: iso(to),
        participants: shared.map((u) => ({
          membershipId: u,
          displayName: name(u),
        })),
      })
    }
    if (cand.startAt.slice(0, 10) > ymd(30))
      warnings.push({ type: 'OUT_OF_SEASON', message: '합주 시즌 밖' })
    return warnings
  }

  const parse = (b: Record<string, unknown>, base?: Sch) => {
    const text = (v: unknown, max: number) =>
      typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null
    const ids = (v: unknown, fallback: string[]) =>
      Array.isArray(v) ? v.map(String) : fallback
    return {
      eventType:
        typeof b.eventType === 'string'
          ? b.eventType
          : (base?.eventType ?? 'PRACTICE'),
      startAt:
        typeof b.startAt === 'string' ? b.startAt : (base?.startAt ?? ''),
      endAt: typeof b.endAt === 'string' ? b.endAt : (base?.endAt ?? ''),
      title: 'title' in b ? (text(b.title, 100) ?? '') : (base?.title ?? ''),
      location:
        'location' in b ? text(b.location, 200) : (base?.location ?? null),
      memo: 'memo' in b ? text(b.memo, 500) : (base?.memo ?? null),
      forAll:
        typeof b.forAllParticipants === 'boolean'
          ? b.forAllParticipants
          : (base?.forAll ?? false),
      teamIds: ids(b.teamIds, base?.teamIds ?? []),
      songIds: ids(b.songIds, base?.songIds ?? []),
    }
  }
  const badTimes = (startAt: string, endAt: string) => {
    const half = (t: string) => /:(00|30):00\+09:00$/.test(t)
    return (
      !half(startAt) || !half(endAt) || Date.parse(endAt) <= Date.parse(startAt)
    )
  }

  const calendar = (ctx: MockCtx, clubWide: boolean, admin: boolean) => {
    const q = ctx.url.searchParams
    const from = Date.parse(q.get('from') ?? '')
    const to = Date.parse(q.get('to') ?? '')
    if (Number.isNaN(from) || Number.isNaN(to))
      return no(ctx.res, 400, 'VALIDATION_ERROR', [
        { field: 'from', reason: 'INVALID_VALUE' },
      ])
    const types = q.get('eventType')?.split(',').filter(Boolean)
    const inRange = (a: string) => {
      const t = Date.parse(a)
      return t >= from && t <= to
    }
    const showCanceled = q.get('includeCanceled') === 'true'
    const showTentative =
      clubWide && admin && q.get('includeTentative') === 'true'
    const perfFilter = q.get('performanceId')
    const teamFilter = q.get('teamId')
    const songFilter = q.get('songId')

    const items: Record<string, unknown>[] = state.rows
      .filter((s) => inRange(s.startAt))
      .filter(
        (s) =>
          s.status === 'CONFIRMED' || s.status === 'CANCELED' || showTentative,
      )
      .filter((s) => s.status !== 'CANCELED' || showCanceled)
      .filter((s) => s.status !== 'TENTATIVE' || showTentative)
      // My own schedules: attendee u1 (the signed-in sample member).
      .filter((s) => clubWide || attendees(s).includes('u1'))
      .filter((s) => !perfFilter || s.pid === perfFilter)
      .filter((s) => !teamFilter || s.teamIds.includes(teamFilter))
      .filter((s) => !songFilter || s.songIds.includes(songFilter))
      .filter((s) => !types?.length || types.includes(s.eventType))
      .map((s) => ({
        id: s.id,
        title: s.title || autoTitle(s),
        startAt: s.startAt,
        endAt: s.endAt,
        eventType: s.eventType,
        allDay: false,
        status: s.status,
        clubId: 'c10',
        performanceId: s.pid,
      }))
    if (q.get('includePerformanceDates') !== 'false')
      for (const [pid, info] of Object.entries(PERF_INFO)) {
        if (info.day === null || (perfFilter && perfFilter !== pid)) continue
        if (pid === 'p2' && !admin) continue
        const startAt = when(info.day, '00:00')
        if (inRange(startAt))
          items.push({
            id: pid,
            title: info.title,
            startAt,
            endAt: when(info.day, '23:59'),
            eventType: 'PERFORMANCE',
            allDay: true,
            status: null,
            clubId: 'c10',
            performanceId: pid,
          })
      }
    if (items.length > 2000)
      return no(ctx.res, 400, 'VALIDATION_ERROR', [
        { field: 'to', reason: 'RANGE_TOO_LARGE' },
      ])
    ok(ctx.res, { items })
    return true
  }

  async function handle(ctx: MockCtx): Promise<boolean> {
    const { res, url, path, method } = ctx
    if (path === '/api/v1/me/calendar' && method === 'GET') {
      if (!ctx.memberships.some((m) => m.clubId === 'c10')) {
        ok(res, { items: [] })
        return true
      }
      return calendar(ctx, false, false)
    }
    const m =
      /^\/api\/v1\/clubs\/([^/]+)\/(?:calendar|performances\/([^/]+)\/(teams|songs|schedules)(?:\/([^/]+)(?:\/([a-z]+))?)?)$/.exec(
        path,
      )
    if (!m) return false
    const [, clubId, pid, kind, sid, action] = m
    if (clubId !== 'c10') return false
    const own = ctx.memberships.find(
      (x) => x.clubId === clubId && x.status === 'ACTIVE',
    )
    if (!own) return false
    const admin = own.role === 'CLUB_ADMIN'

    if (!pid) return method === 'GET' ? calendar(ctx, true, admin) : false
    if (!PERF_INFO[pid]) return false
    if (kind === 'teams' && method === 'GET' && !sid) {
      ok(res, {
        items: TEAMS.map((t) => ({ id: t.id, name: t.name })),
        page: 0,
        size: 100,
        totalElements: TEAMS.length,
        totalPages: 1,
      })
      return true
    }
    if (kind === 'songs' && method === 'GET' && !sid) {
      ok(res, {
        items: SONGS.map((s) => ({ id: s.id, title: s.title })),
        page: 0,
        size: 100,
        totalElements: SONGS.length,
        totalPages: 1,
      })
      return true
    }
    if (kind !== 'schedules') return false
    if (!admin && pid === 'p2') return no(res, 404, 'NOT_FOUND')
    const visible = (s: Sch) => admin || s.status !== 'TENTATIVE'

    // List and create
    if (!sid) {
      if (method === 'GET') {
        const from = Date.parse(url.searchParams.get('from') ?? '')
        const to = Date.parse(url.searchParams.get('to') ?? '')
        if (Number.isNaN(from) || Number.isNaN(to))
          return no(res, 400, 'VALIDATION_ERROR', [
            { field: 'from', reason: 'INVALID_VALUE' },
          ])
        const items = state.rows
          .filter((s) => s.pid === pid && visible(s))
          .filter(
            (s) => Date.parse(s.startAt) >= from && Date.parse(s.startAt) <= to,
          )
          .sort((a, b) => a.startAt.localeCompare(b.startAt))
          .map((s) => ({
            id: s.id,
            performanceId: s.pid,
            eventType: s.eventType,
            status: s.status,
            startAt: s.startAt,
            endAt: s.endAt,
            title: s.title || autoTitle(s),
            location: s.location,
            version: String(s.version),
          }))
        ok(res, {
          items,
          page: 0,
          size: 100,
          totalElements: items.length,
          totalPages: 1,
        })
        return true
      }
      if (method !== 'POST') return false
      if (!admin) return no(res, 403, 'FORBIDDEN')
      // E-01: p4 is FINISHED.
      if (pid === 'p4')
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
      const b = await readBody(ctx)
      const f = parse(b)
      if (badTimes(f.startAt, f.endAt))
        return no(res, 400, 'VALIDATION_ERROR', [
          { field: 'startAt', message: '시간이 올바르지 않아요' },
        ])
      const status: Status =
        b.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE'
      const row: Sch = {
        id: `sc${state.seq++}`,
        pid,
        status,
        version: 1,
        ...f,
      }
      if (status === 'CONFIRMED' && attendees(row).length === 0)
        return no(res, 422, 'RULE_VIOLATION', [
          { reason: 'SCHEDULE_TARGET_EMPTY' },
        ])
      state.rows.push(row)
      ok(
        res,
        {
          resource: resource(row),
          warnings: warningsFor(row, row.id),
          effects: {},
        },
        201,
      )
      return true
    }

    // Validate (new)
    if (sid === 'validate') {
      if (method !== 'POST') return false
      if (!admin) return no(res, 403, 'FORBIDDEN')
      const f = parse(await readBody(ctx))
      if (badTimes(f.startAt, f.endAt))
        return no(res, 400, 'VALIDATION_ERROR', [
          { field: 'startAt', reason: 'INVALID_VALUE' },
        ])
      ok(res, {
        hardErrors: [],
        warnings: warningsFor(f),
        participants: attendees(f).map((u) => ({
          membershipId: u,
          displayName: name(u),
        })),
        versions: { performance: '8' },
      })
      return true
    }

    const row = state.rows.find((s) => s.id === sid && s.pid === pid)
    if (!row || !visible(row)) return no(res, 404, 'NOT_FOUND')

    if (!action && method === 'GET') {
      ok(res, {
        schedule: resource(row),
        participants: attendees(row).map((u, i) => ({
          userId: u === 'u1' ? '1' : u,
          performanceMemberId: `pm${u}`,
          membershipId: u,
          displayName: name(u),
          parts: [
            {
              id: `p${(i % 4) + 1}`,
              name: ['보컬', '기타', '베이스', '드럼'][i % 4],
            },
          ],
          memberType: u === 'u4' ? 'GUEST' : 'REGULAR',
          isSupportPlayer:
            !row.forAll &&
            row.songIds.length > 0 &&
            !TEAMS.some(
              (t) => row.teamIds.includes(t.id) && t.members.includes(u),
            ),
        })),
      })
      return true
    }
    if (action === 'conflicts' && method === 'GET') {
      ok(res, { items: warningsFor(row, row.id) })
      return true
    }

    if (method === 'GET') return false
    if (!admin) return no(res, 403, 'FORBIDDEN')
    const b = await readBody(ctx)
    const stale = String(b.version ?? '') !== String(row.version)

    if (!action && method === 'PATCH') {
      if (stale) return no(res, 409, 'VERSION_CONFLICT')
      if (row.status === 'CANCELED' || pid === 'p4')
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
      const f = parse(b, row)
      if (badTimes(f.startAt, f.endAt))
        return no(res, 400, 'VALIDATION_ERROR', [
          { field: 'startAt', message: '시간이 올바르지 않아요' },
        ])
      if (row.status === 'CONFIRMED' && attendees(f).length === 0)
        return no(res, 422, 'RULE_VIOLATION', [
          { reason: 'SCHEDULE_TARGET_EMPTY' },
        ])
      Object.assign(row, f, { version: row.version + 1 })
      ok(res, {
        resource: resource(row),
        warnings: warningsFor(row, row.id),
        effects: {},
      })
      return true
    }
    if (method !== 'POST') return false
    if (action === 'confirm') {
      if (stale) return no(res, 409, 'VERSION_CONFLICT')
      if (row.status !== 'TENTATIVE')
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
      if (attendees(row).length === 0)
        return no(res, 422, 'RULE_VIOLATION', [
          { reason: 'SCHEDULE_TARGET_EMPTY' },
        ])
      const warnings = warningsFor(row, row.id)
      if (warnings.length && b.confirmed !== true)
        return no(res, 409, 'CONFIRMATION_REQUIRED', [
          { message: '다른 일정과 겹치거나 합주 시즌 밖이에요.' },
        ])
      row.status = 'CONFIRMED'
      row.version += 1
      ok(res, { resource: resource(row), warnings, effects: {} })
      return true
    }
    if (action === 'unconfirm') {
      if (stale) return no(res, 409, 'VERSION_CONFLICT')
      if (row.status !== 'CONFIRMED')
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'NOT_CONFIRMED' }])
      row.status = 'TENTATIVE'
      row.version += 1
      ok(res, { id: row.id, status: row.status, version: String(row.version) })
      return true
    }
    if (action === 'cancel') {
      if (stale) return no(res, 409, 'VERSION_CONFLICT')
      if (row.status === 'CANCELED')
        return no(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
      row.status = 'CANCELED'
      row.version += 1
      ok(res, { resource: resource(row), warnings: [], effects: {} })
      return true
    }
    return false
  }

  return Object.assign(handle, {
    reset() {
      state = initial()
    },
  })
}
