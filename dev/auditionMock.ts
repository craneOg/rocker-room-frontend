import type { IncomingMessage, ServerResponse } from 'node:http'
import type { MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of AUDI-001 ~ AUDI-004 (API-147 ~ 150). Takes only
// `/clubs/:id/performances/:pid/auditions...` and `/me/auditions`; everything else falls through.
// The songs and schedules the pickers read (API-075 / 105) belong to the song and schedule mocks.
// Never imported by src/.

type Result = 'PASSED' | 'FAILED' | null
type Row = {
  id: string
  pid: string
  type: 'SONG' | 'SESSION'
  songId: string
  partId: string | null
  applicant: string | null // performance member id
  scheduleId: string | null
  memo: string | null
  result: Result
  comment: string | null
  judgedAt: string | null
  version: number
  createdAt: string
}

const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().replace('Z', '+09:00')

// Same ids as the performance view mock: p1 ACTIVE, p2 DRAFT, p3 LOCKED, p4 FINISHED.
const PERF_STATUS: Record<string, string> = {
  p1: 'ACTIVE',
  p2: 'DRAFT',
  p3: 'LOCKED',
  p4: 'FINISHED',
}
const SONGS: Record<string, { title: string; status: string }> = {
  s1: { title: 'Song A', status: 'CONFIRMED' },
  s2: { title: 'Song B', status: 'PROPOSED' },
  s3: { title: 'Song C', status: 'PROPOSED' },
  s4: { title: 'Song D', status: 'REJECTED' },
}
const PARTS: Record<string, string> = {
  p1: '보컬',
  p2: '기타',
  p3: '베이스',
  p4: '드럼',
  p5: '키보드',
}
// Participants (APPLIED / APPROVED) per performance member id, as in the view mock.
const MEMBERS: Record<string, { name: string; membershipId: string }> = {
  pm1: { name: '명혜성', membershipId: 'u1' },
  pm3: { name: '정규채', membershipId: 'u3' },
  pm4: { name: '김도윤', membershipId: 'u4' },
  pm5: { name: '이서연', membershipId: 'u5' },
}
const SCHEDULES = new Set(['sc1', 'sc2']) // AUDITION schedules; other ids are not
const JUDGE = '명혜성'

const initial = (): Row[] => {
  const r = (
    id: string,
    pid: string,
    type: Row['type'],
    songId: string,
    partId: string | null,
    applicant: string | null,
    result: Result,
    created: number,
    extra: Partial<Row> = {},
  ): Row => ({
    id,
    pid,
    type,
    songId,
    partId,
    applicant,
    scheduleId: 'sc1',
    memo: null,
    result,
    comment: result ? '리듬이 안정적입니다.' : null,
    judgedAt: result ? day(created + 1) : null,
    version: 1,
    createdAt: day(created),
    ...extra,
  })
  return [
    r('a1', 'p1', 'SONG', 's1', null, null, null, -5, {
      memo: '후렴 파트 위주로 심사합니다.',
    }),
    r('a2', 'p1', 'SESSION', 's1', 'p2', 'pm3', null, -4),
    r('a3', 'p1', 'SESSION', 's1', 'p2', 'pm1', 'FAILED', -10, {
      comment: '박자 보완이 필요합니다.',
    }),
    r('a4', 'p1', 'SESSION', 's1', 'p2', 'pm1', 'PASSED', -3),
    r('a5', 'p1', 'SONG', 's2', null, null, 'PASSED', -8),
    r('a6', 'p1', 'SESSION', 's2', 'p4', 'pm4', null, -2, { scheduleId: null }),
    r('a7', 'p3', 'SONG', 's2', null, null, null, -6),
    r('a8', 'p3', 'SESSION', 's1', 'p3', 'pm3', 'PASSED', -7),
    r('a9', 'p4', 'SONG', 's3', null, null, 'FAILED', -40),
  ]
}

function createAuditionMock() {
  let rows = initial()
  let seq = 100

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
  const readBody = async (req: IncomingMessage) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  const view = (r: Row) => {
    const song = SONGS[r.songId]
    const member = r.applicant ? MEMBERS[r.applicant] : undefined
    return {
      id: r.id,
      type: r.type,
      songId: r.songId,
      songTitle: song?.title ?? r.songId,
      songStatus: song?.status ?? 'PROPOSED',
      partId: r.partId,
      partName: r.partId ? (PARTS[r.partId] ?? null) : null,
      applicantPerformanceMemberId: r.applicant,
      applicantName: member?.name ?? null,
      candidateTeamName: r.type === 'SONG' ? 'Crane Team' : null,
      linkedScheduleId: r.scheduleId,
      scheduledAt: r.scheduleId ? day(3) : null,
      memo: r.memo,
      result: r.result,
      comment: r.comment,
      judgedBy: r.result ? 'u1' : null,
      judgedByName: r.result ? JUDGE : null,
      judgedAt: r.judgedAt,
      version: String(r.version),
      createdAt: r.createdAt,
    }
  }

  /** Same target = same song (+ applicant and part for a session audition). */
  const sameTarget = (a: Row, b: Row) =>
    a.pid === b.pid &&
    a.type === b.type &&
    a.songId === b.songId &&
    a.partId === b.partId &&
    a.applicant === b.applicant

  async function handle(ctx: MockCtx): Promise<boolean> {
    const { req, res, url, path, method } = ctx
    const mine = path === '/api/v1/me/auditions'
    const m =
      /^\/api\/v1\/clubs\/([^/]+)\/performances\/([^/]+)\/auditions(?:\/([^/]+)\/result)?$/.exec(
        path,
      )
    if (!mine && !m) return false

    if (mine) {
      if (method !== 'GET') return false
      const clubId = url.searchParams.get('clubId')
      const pid = url.searchParams.get('performanceId')
      const own = ctx.memberships.find(
        (x) => x.clubId === 'c10' && x.status === 'ACTIVE',
      )
      if (!own || (clubId && clubId !== 'c10')) return false
      const self = 'u1'
      const items = rows
        .filter((r) => !pid || r.pid === pid)
        .filter(
          (r) => r.applicant && MEMBERS[r.applicant]?.membershipId === self,
        )
        // Group by target; newest first inside a group, groups by their newest row.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const groups: Row[][] = []
      for (const r of items) {
        const g = groups.find((x) => x[0] && sameTarget(x[0], r))
        if (g) g.push(r)
        else groups.push([r])
      }
      ok(res, {
        items: groups.flat().map((r, i, all) => {
          const isLatest = !all.slice(0, i).some((o) => sameTarget(o, r))
          return {
            id: r.id,
            clubId: 'c10',
            performanceId: r.pid,
            type: r.type,
            songId: r.songId,
            songTitle: SONGS[r.songId]?.title ?? r.songId,
            partId: r.partId,
            partName: r.partId ? (PARTS[r.partId] ?? null) : null,
            scheduledAt: r.scheduleId ? day(3) : null,
            result: r.result,
            comment: r.type === 'SESSION' ? r.comment : null,
            judgedAt: r.judgedAt,
            isLatest,
          }
        }),
      })
      return true
    }

    const [, clubId, pid = '', auditionId] = m ?? []
    const own = ctx.memberships.find(
      (x) => x.clubId === clubId && x.status === 'ACTIVE',
    )
    if (clubId !== 'c10' || !own) return false
    if (own.role !== 'CLUB_ADMIN') {
      fail(res, 403, 'FORBIDDEN')
      return true
    }
    const status = PERF_STATUS[pid]
    if (!status) {
      fail(res, 404, 'NOT_FOUND')
      return true
    }
    const finished = status === 'FINISHED' || status === 'CANCELED'

    if (!auditionId && method === 'GET') {
      const q = url.searchParams
      const tab = q.get('tab') ?? 'PENDING'
      const filtered = rows
        .filter((r) => r.pid === pid)
        .filter((r) => !q.get('type') || r.type === q.get('type'))
        .filter((r) => !q.get('songId') || r.songId === q.get('songId'))
        .filter(
          (r) => !q.get('scheduleId') || r.scheduleId === q.get('scheduleId'),
        )
      const shown = filtered
        .filter((r) => (tab === 'DONE' ? r.result : !r.result))
        .sort(
          (a, b) =>
            (SONGS[a.songId]?.title ?? '').localeCompare(
              SONGS[b.songId]?.title ?? '',
            ) ||
            a.songId.localeCompare(b.songId) ||
            (tab === 'DONE'
              ? (b.judgedAt ?? '').localeCompare(a.judgedAt ?? '')
              : a.createdAt.localeCompare(b.createdAt)),
        )
      const page = Number(q.get('page') ?? 0)
      const size = Number(q.get('size') ?? 20)
      ok(res, {
        items: shown.slice(page * size, (page + 1) * size).map(view),
        page,
        size,
        totalElements: shown.length,
        totalPages: Math.ceil(shown.length / size),
        pendingCount: filtered.filter((r) => !r.result).length,
      })
      return true
    }

    if (!auditionId && method === 'POST') {
      const b = await readBody(req)
      if (finished) {
        fail(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
        return true
      }
      const type = b.type === 'SESSION' ? 'SESSION' : 'SONG'
      const ids = Array.isArray(b.applicantPerformanceMemberIds)
        ? (b.applicantPerformanceMemberIds as string[])
        : []
      const partId = typeof b.partId === 'string' ? b.partId : null
      const songId = String(b.songId ?? '')
      if (
        (b.type !== 'SONG' && b.type !== 'SESSION') ||
        (type === 'SONG' && (partId !== null || ids.length > 0)) ||
        (type === 'SESSION' &&
          (partId === null || ids.length < 1 || ids.length > 50)) ||
        (typeof b.memo === 'string' && b.memo.length > 500)
      ) {
        fail(res, 400, 'VALIDATION_ERROR', [
          { field: 'request', reason: 'INVALID_VALUE' },
        ])
        return true
      }
      const song = SONGS[songId]
      if (!song) {
        fail(res, 404, 'NOT_FOUND')
        return true
      }
      if (!['PROPOSED', 'CONFIRMED'].includes(song.status)) {
        fail(res, 409, 'STATE_CONFLICT', [{ reason: 'SONG_NOT_AUDITIONABLE' }])
        return true
      }
      const bad: { field: string; reason: string }[] = []
      ids.forEach((id, i) => {
        if (!MEMBERS[id])
          bad.push({
            field: `applicantPerformanceMemberIds[${i}]`,
            reason: 'APPLICANT_NOT_ELIGIBLE',
          })
      })
      if (partId !== null && !PARTS[partId])
        bad.push({ field: 'partId', reason: 'PART_NOT_ACTIVE' })
      const schedule =
        typeof b.linkedScheduleId === 'string' ? b.linkedScheduleId : null
      if (schedule !== null && !SCHEDULES.has(schedule))
        bad.push({ field: 'linkedScheduleId', reason: 'SCHEDULE_NOT_AUDITION' })
      if (bad.length > 0) {
        fail(res, 422, 'RULE_VIOLATION', bad)
        return true
      }
      const made: Row[] = (type === 'SONG' ? [null] : ids).map((id) => ({
        id: `a${seq++}`,
        pid,
        type,
        songId,
        partId,
        applicant: id,
        scheduleId: schedule,
        memo: typeof b.memo === 'string' && b.memo ? b.memo : null,
        result: null,
        comment: null,
        judgedAt: null,
        version: 1,
        createdAt: day(0),
      }))
      // A-06: a pending row for the same target rejects the whole request.
      const dup = made.flatMap((n, i) =>
        rows.some((r) => !r.result && sameTarget(r, n))
          ? [
              {
                field:
                  type === 'SONG'
                    ? 'songId'
                    : `applicantPerformanceMemberIds[${i}]`,
                reason: 'AUDITION_ALREADY_PENDING',
              },
            ]
          : [],
      )
      if (dup.length > 0) {
        fail(res, 409, 'DUPLICATE', dup)
        return true
      }
      rows = [...rows, ...made]
      ok(res, { items: made.map(view) }, 201)
      return true
    }

    if (auditionId && method === 'PUT') {
      const b = await readBody(req)
      const row = rows.find((r) => r.id === auditionId && r.pid === pid)
      if (!row) {
        fail(res, 404, 'NOT_FOUND')
        return true
      }
      if (b.result !== 'PASSED' && b.result !== 'FAILED') {
        fail(res, 400, 'VALIDATION_ERROR', [
          { field: 'result', reason: 'INVALID_VALUE' },
        ])
        return true
      }
      if (status === 'LOCKED' && !b.reason) {
        fail(res, 400, 'VALIDATION_ERROR', [
          { field: 'reason', reason: 'REASON_REQUIRED' },
        ])
        return true
      }
      if (finished) {
        fail(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }])
        return true
      }
      if (String(b.version) !== String(row.version)) {
        fail(res, 409, 'VERSION_CONFLICT')
        return true
      }
      row.result = b.result
      row.comment =
        typeof b.comment === 'string' && b.comment.trim() ? b.comment : null
      row.judgedAt = day(0)
      row.version += 1
      const v = view(row)
      ok(res, {
        id: v.id,
        type: v.type,
        songId: v.songId,
        songStatus: v.songStatus,
        partId: v.partId,
        partName: v.partName,
        applicantPerformanceMemberId: v.applicantPerformanceMemberId,
        applicantName: v.applicantName,
        result: v.result,
        comment: v.comment,
        judgedBy: v.judgedBy,
        judgedByName: v.judgedByName,
        judgedAt: v.judgedAt,
        version: v.version,
      })
      return true
    }
    return false
  }

  return Object.assign(handle, {
    reset: () => {
      rows = initial()
      seq = 100
    },
  })
}

/** One instance for the dev server (state lives for the process; no reset hook). */
export const auditionMock = createAuditionMock()
