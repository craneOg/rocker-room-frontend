import type { MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of AVAIL-001 / AVAIL-002 (API-100..103 and the API-061 / 087 / 039 /
// 053 / 054 reads they need). It owns the sample performance p71: ACTIVE, availability OPEN,
// a practice season around today, the mock user (membership u1) a confirmed participant and
// three more participants. For p1 / p3 it only answers the availability paths (their policy
// in dev/performanceViewMock.ts has availability CLOSED, so saving answers 409).
// Never imported by src/.

type Json = Record<string, unknown>

const DAY = 86_400_000
const KST = 9 * 3_600_000
const SLOT = 30 * 60_000
const iso = (ms: number) =>
  `${new Date(ms + KST).toISOString().slice(0, 19)}+09:00`
const dayOf = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const addDays = (d: string, n: number) =>
  dayOf(Date.parse(`${d}T00:00:00+09:00`) + n * DAY)
const slotsBetween = (day: string, from: number, to: number) => {
  const out: number[] = []
  const base = Date.parse(`${day}T00:00:00+09:00`)
  for (let m = from; m < to; m += 30) out.push(base + m * 60_000)
  return out
}

/** [performanceMemberId, name] — the first is the mock user. */
const PEOPLE: [string, string][] = [
  ['pm71', '명혜성'],
  ['pm72', '송예림'],
  ['pm73', '정규채'],
  ['pm74', '김도윤'],
]
const TEAM_MEMBERS = ['pm71', 'pm72', 'pm73']

const seed = () => {
  const today = dayOf(Date.now())
  const monday = addDays(
    today,
    -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7),
  )
  const mine = new Set<number>(
    slotsBetween(addDays(monday, 2), 18 * 60, 20 * 60),
  )
  const slots: Record<string, Set<number>> = {
    pm71: mine,
    pm72: new Set(slotsBetween(addDays(monday, 2), 19 * 60, 21 * 60)),
    pm73: new Set(slotsBetween(addDays(monday, 2), 18 * 60, 22 * 60)),
    // pm74 never answered.
    pm74: new Set(),
  }
  return {
    slots,
    season: { start: addDays(monday, -7), end: addDays(monday, 27) },
    deadline: iso(Date.now() + 3 * DAY),
  }
}

export function createAvailabilityMock() {
  let state = seed()

  const send = (ctx: MockCtx, status: number, body?: unknown) => {
    ctx.res.writeHead(status, { 'Content-Type': 'application/json' })
    ctx.res.end(body === undefined ? undefined : JSON.stringify(body))
    return true
  }
  const ok = (ctx: MockCtx, data: unknown) => send(ctx, 200, { data })
  const fail = (ctx: MockCtx, status: number, code: string, reason?: string) =>
    send(ctx, status, {
      error: { code, message: code, details: reason ? [{ reason }] : [] },
    })
  const readJson = async (ctx: MockCtx) => {
    let raw = ''
    for await (const chunk of ctx.req) raw += chunk
    try {
      return raw ? (JSON.parse(raw) as Json) : {}
    } catch {
      return {}
    }
  }

  const performance = (clubId: string) => ({
    id: 'p71',
    clubId,
    title: '합주 일정 데모 공연',
    performDate: addDays(state.season.end, 7),
    location: '동아리방',
    preset: 'TEAM_FIRST',
    status: 'ACTIVE',
    createdByUserId: '1',
    version: '8',
    createdAt: iso(Date.now() - 30 * DAY),
    updatedAt: iso(Date.now() - DAY),
  })
  const policy = () => ({
    performanceId: 'p71',
    performanceVersion: '8',
    applicationState: 'CLOSED',
    applicationDeadline: null,
    candidateState: 'CLOSED',
    candidateDeadline: null,
    playabilityState: 'DISABLED',
    playabilityDeadline: null,
    voteState: 'DISABLED',
    voteDeadline: null,
    teamApplicationState: 'CLOSED',
    teamApplicationDeadline: null,
    availabilityState: 'OPEN',
    availabilityDeadline: state.deadline,
    candidateScope: 'PERFORMANCE',
    candidateLimitPerMember: 3,
    voteMethod: 'APPROVAL',
    voteMaxChoices: null,
    playabilityResultPublic: true,
    voteResultPublic: true,
    practiceSeasonStart: state.season.start,
    practiceSeasonEnd: state.season.end,
    maxSongsPerMember: null,
    updatedAt: iso(Date.now() - DAY),
  })
  const row = ([id, name]: [string, string]) => ({
    id,
    performanceId: 'p71',
    membershipId: id === 'pm71' ? 'u1' : `u${id.slice(2)}`,
    status: 'APPROVED',
    source: 'ADMIN',
    createdAt: iso(Date.now() - 5 * DAY),
    updatedAt: iso(Date.now() - DAY),
    displayName: name,
    profileImageUrl: null,
    memberType: 'REGULAR',
    parts: [],
    teamNames: TEAM_MEMBERS.includes(id) ? ['Crane Team'] : [],
    playedSongCount: 0,
  })

  const inRange = (set: Set<number>, from: number, to: number) =>
    [...set].filter((t) => t >= from && t < to).sort((a, b) => a - b)
  const items = (list: number[]) =>
    list.map((t) => ({ startAt: iso(t), endAt: iso(t + SLOT) }))

  async function handle(ctx: MockCtx): Promise<boolean> {
    const m =
      /^\/api\/v1\/clubs\/([^/]+)\/performances\/(p1|p3|p71)(?:\/(.*))?$/.exec(
        ctx.path,
      )
    if (!m) return false
    const [, clubId = '', pid = '', sub = ''] = m
    const own = ctx.memberships.find(
      (x) => x.clubId === clubId && x.status === 'ACTIVE',
    )
    if (!own) return false
    const admin = own.role === 'CLUB_ADMIN'
    const q = ctx.url.searchParams
    const demo = pid === 'p71'

    // p71 is served completely here; the view mock does not know it.
    if (demo && ctx.method === 'GET') {
      if (sub === '')
        return ok(ctx, {
          performance: performance(clubId),
          policy: policy(),
          counts: {
            teams: 1,
            candidateSongs: 0,
            confirmedSongs: 1,
            participants: 4,
          },
          nextSchedule: null,
        })
      if (sub === 'members/me') {
        const r = row(PEOPLE[0]!)
        return ok(ctx, {
          id: r.id,
          performanceId: 'p71',
          membershipId: r.membershipId,
          status: 'APPROVED',
          source: 'ADMIN',
          myTeams: [{ teamId: 't71', name: 'Crane Team', isLeader: true }],
          myPlayingSongs: [],
          progress: {
            candidateSongs: null,
            unansweredPlayabilityCount: null,
            votes: null,
            availabilitySlotCount: state.slots.pm71?.size ?? 0,
          },
        })
      }
      if (sub === 'members') {
        const page = PEOPLE.map(row)
        return ok(ctx, {
          items: page,
          statusCounts: { APPROVED: page.length },
          page: 0,
          size: 100,
          totalElements: page.length,
          totalPages: 1,
        })
      }
      if (sub === 'teams') {
        const mineOnly = q.get('mine') === 'true'
        return ok(ctx, {
          items: [{ id: 't71', name: 'Crane Team', status: 'APPROVED' }].concat(
            mineOnly
              ? []
              : [{ id: 't72', name: '두번째 팀', status: 'APPROVED' }],
          ),
          page: 0,
          size: 100,
          totalElements: mineOnly ? 1 : 2,
          totalPages: 1,
          statusCounts: null,
        })
      }
      if (sub === 'setlist')
        return ok(ctx, {
          items: [
            {
              song: {
                id: 'sl71',
                performanceId: 'p71',
                title: 'Mr. Brightside',
                artist: 'The Killers',
                assignedTeamId: 't71',
                assignedTeamName: 'Crane Team',
                setlistOrder: 1,
                version: '1',
              },
              sessions: [],
            },
          ],
          performanceVersion: '8',
        })
    }

    if (!sub.startsWith('availability')) return false
    const closed = !demo
    const mineId = 'pm71'
    const from = Date.parse(q.get('from') ?? '')
    const to = Date.parse(q.get('to') ?? '')

    if (sub === 'availability/me' && ctx.method === 'GET') {
      if (!demo) return ok(ctx, { items: [] })
      const set = state.slots[mineId] ?? new Set<number>()
      return ok(ctx, {
        items: items(
          Number.isNaN(from)
            ? [...set].sort((a, b) => a - b)
            : inRange(set, from, to),
        ),
      })
    }

    if (sub === 'availability/me' && ctx.method === 'PUT') {
      const body = await readJson(ctx)
      if (closed) return fail(ctx, 409, 'STATE_CONFLICT', 'AVAILABILITY_CLOSED')
      if (Date.now() > Date.parse(state.deadline))
        return fail(ctx, 409, 'STATE_CONFLICT', 'DEADLINE_PASSED')
      const f = Date.parse(String(body.from))
      const t = Date.parse(String(body.to))
      const slots = Array.isArray(body.slots)
        ? (body.slots as { startAt?: string; endAt?: string }[])
        : []
      if (Number.isNaN(f) || Number.isNaN(t) || f >= t)
        return fail(ctx, 400, 'VALIDATION_ERROR', 'INVALID_VALUE')
      const starts = slots.map((s) => Date.parse(String(s.startAt)))
      const seasonFrom = Date.parse(`${state.season.start}T00:00:00+09:00`)
      const seasonTo = Date.parse(
        `${addDays(state.season.end, 1)}T00:00:00+09:00`,
      )
      if (
        starts.some(
          (s, i) =>
            Number.isNaN(s) ||
            s % SLOT !== 0 ||
            Date.parse(String(slots[i]?.endAt)) !== s + SLOT ||
            s < f ||
            s >= t,
        )
      )
        return fail(ctx, 400, 'VALIDATION_ERROR', 'INVALID_VALUE')
      if (slots.length > 2000)
        return fail(ctx, 400, 'VALIDATION_ERROR', 'INVALID_VALUE')
      if (starts.some((s) => s < seasonFrom || s >= seasonTo))
        return fail(ctx, 400, 'VALIDATION_ERROR', 'OUTSIDE_PRACTICE_SEASON')
      // The request replaces everything of mine inside [from, to).
      const set = state.slots[mineId] ?? new Set<number>()
      for (const x of inRange(set, f, t)) set.delete(x)
      for (const s of starts) set.add(s)
      state.slots[mineId] = set
      return ok(ctx, { items: items(inRange(set, f, t)) })
    }

    const other = /^availability\/members\/(pm\d+)$/.exec(sub)
    if (other && ctx.method === 'GET') {
      if (!admin) return fail(ctx, 403, 'FORBIDDEN')
      const set = state.slots[other[1] ?? '']
      if (!set || !demo) return fail(ctx, 404, 'NOT_FOUND')
      return ok(ctx, { items: items(inRange(set, from, to)) })
    }

    if (sub === 'availability/common' && ctx.method === 'GET') {
      if (Number.isNaN(from) || Number.isNaN(to))
        return fail(ctx, 400, 'VALIDATION_ERROR', 'INVALID_VALUE')
      const teamIds = (q.get('teamIds') ?? '').split(',').filter(Boolean)
      const songIds = (q.get('songIds') ?? '').split(',').filter(Boolean)
      const everyone = q.get('forAllParticipants') === 'true'
      if (
        !admin &&
        (songIds.length > 0 || everyone || teamIds.some((id) => id !== 't71'))
      )
        return fail(ctx, 403, 'FORBIDDEN', 'TARGET_NOT_ALLOWED')
      if (
        teamIds.some((id) => !['t71', 't72'].includes(id)) ||
        songIds.some((id) => id !== 'sl71')
      )
        return fail(ctx, 404, 'NOT_FOUND')
      const ids = everyone
        ? PEOPLE.map(([id]) => id)
        : songIds.length > 0
          ? ['pm71', 'pm72']
          : teamIds.includes('t72') && !teamIds.includes('t71')
            ? []
            : TEAM_MEMBERS
      const people = PEOPLE.filter(([id]) => ids.includes(id))
      const missing = people.filter(
        ([id]) => (state.slots[id]?.size ?? 0) === 0,
      )
      const starts = new Set<number>()
      for (const [id] of people)
        for (const t of inRange(state.slots[id] ?? new Set(), from, to))
          starts.add(t)
      const named = (list: [string, string][]) =>
        list.map(([performanceMemberId, displayName]) => ({
          performanceMemberId,
          displayName,
        }))
      const slots = [...starts]
        .sort((a, b) => a - b)
        .map((t) => {
          const can = people.filter(([id]) => state.slots[id]?.has(t))
          return {
            startAt: iso(t),
            availableCount: can.length,
            ...(admin ? { availableMembers: named(can) } : {}),
          }
        })
      return ok(ctx, {
        from: iso(from),
        to: iso(to),
        participantCount: people.length,
        respondedCount: people.length - missing.length,
        ...(admin
          ? {
              participants: named(people),
              missingAvailabilityMemberIds: missing.map(([id]) => id),
            }
          : {}),
        slots,
      })
    }
    return false
  }

  return Object.assign(handle, {
    reset: () => {
      state = seed()
    },
  })
}
