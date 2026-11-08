import type { MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of SET-001 (API-087 read, API-088 save the whole order) for the sample
// performances p1 (ACTIVE) and p3 (LOCKED) of any club the user is an ACTIVE member of. Only
// `/performances/{p1|p3}/setlist[/order]` is taken; everything else falls through.
// Songs use the roster of dev/performanceViewMock.ts (membership u1.. = performance member pm..).
// Never imported by src/.

type Song = {
  id: string
  title: string
  artist: string
  team: string | null
  order: number | null
  version: number
  /** [performanceMemberId, partId, name] */
  players: [string, string, string][]
}

const initial = (): Record<string, { version: number; songs: Song[] }> => ({
  p1: {
    version: 8,
    songs: [
      {
        id: 'sl1',
        title: 'Mr. Brightside',
        artist: 'The Killers',
        team: 'Crane Team',
        order: 1,
        version: 1,
        players: [
          ['pm1', 'p2', '명혜성'],
          ['pm3', 'p4', '정규채'],
        ],
      },
      {
        id: 'sl2',
        title: 'Seven Nation Army',
        artist: 'The White Stripes',
        team: 'Crane Team',
        order: 2,
        version: 1,
        players: [
          ['pm1', 'p2', '명혜성'],
          ['pm3', 'p3', '정규채'],
          ['pm4', 'p1', '김도윤'],
        ],
      },
      {
        id: 'sl3',
        title: 'Creep',
        artist: 'Radiohead',
        team: null,
        order: 3,
        version: 1,
        players: [['pm4', 'p1', '김도윤']],
      },
      {
        id: 'sl4',
        title: "Don't Look Back in Anger",
        artist: 'Oasis',
        team: 'Crane Team',
        order: null,
        version: 1,
        players: [['pm3', 'p4', '정규채']],
      },
    ],
  },
  p3: {
    version: 5,
    songs: [
      {
        id: 'sl11',
        title: 'Yellow',
        artist: 'Coldplay',
        team: null,
        order: 1,
        version: 2,
        players: [['pm12', 'p2', '송예림']],
      },
      {
        id: 'sl12',
        title: 'Wonderwall',
        artist: 'Oasis',
        team: null,
        order: 2,
        version: 2,
        players: [['pm13', 'p3', '정규채']],
      },
    ],
  },
})

export function createSetlistMock() {
  const state = initial()
  const statusOf: Record<string, string> = { p1: 'ACTIVE', p3: 'LOCKED' }

  const send = (ctx: MockCtx, status: number, body?: unknown) => {
    ctx.res.writeHead(status, { 'Content-Type': 'application/json' })
    ctx.res.end(body === undefined ? undefined : JSON.stringify(body))
    return true
  }
  const fail = (ctx: MockCtx, status: number, code: string, reason?: string) =>
    send(ctx, status, {
      error: {
        code,
        message: code,
        details: reason ? [{ reason }] : [],
      },
    })
  const readJson = async (ctx: MockCtx) => {
    let raw = ''
    for await (const chunk of ctx.req) raw += chunk
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  const songJson = (pid: string, s: Song) => ({
    id: s.id,
    performanceId: pid,
    title: s.title,
    artist: s.artist,
    status: 'CONFIRMED',
    assignedTeamId: s.team ? 't1' : null,
    assignedTeamName: s.team,
    setlistOrder: s.order,
    version: String(s.version),
  })

  async function handle(ctx: MockCtx): Promise<boolean> {
    const m =
      /^\/api\/v1\/clubs\/([^/]+)\/performances\/(p1|p3)\/setlist(\/order)?$/.exec(
        ctx.path,
      )
    if (!m) return false
    const [, clubId = '', pid = '', order] = m
    const own = ctx.memberships.find(
      (x) => x.clubId === clubId && x.status === 'ACTIVE',
    )
    if (!own) return false
    const admin = own.role === 'CLUB_ADMIN'
    const perf = state[pid]
    if (!perf) return false

    if (!order && ctx.method === 'GET') {
      // Placed songs by order, then the unplaced ones by id.
      const songs = [...perf.songs].sort(
        (a, b) =>
          (a.order ?? Number.MAX_SAFE_INTEGER) -
            (b.order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
      )
      return send(ctx, 200, {
        data: {
          items: songs.map((s) => ({
            song: songJson(pid, s),
            sessions: s.players.map(
              ([performanceMemberId, partId, displayName]) => ({
                performanceMemberId,
                partId,
                displayName,
              }),
            ),
          })),
          performanceVersion: String(perf.version),
        },
      })
    }

    if (order && ctx.method === 'PUT') {
      const body = await readJson(ctx)
      if (!admin) return fail(ctx, 403, 'FORBIDDEN')
      const status = statusOf[pid]
      if (status !== 'DRAFT' && status !== 'ACTIVE' && status !== 'LOCKED')
        return fail(ctx, 409, 'STATE_CONFLICT', 'INVALID_STATE')
      const items = Array.isArray(body.items)
        ? (body.items as {
            songId?: string
            order?: number | null
            version?: string
          }[])
        : []
      if (
        typeof body.version !== 'string' ||
        (status === 'LOCKED' &&
          (typeof body.reason !== 'string' || body.reason.trim() === ''))
      )
        return fail(ctx, 400, 'VALIDATION_ERROR', 'INVALID_VALUE')
      if (body.version !== String(perf.version))
        return fail(ctx, 409, 'VERSION_CONFLICT')
      // O-01: exactly the current confirmed songs, each once.
      const ids = items.map((i) => i.songId)
      if (
        ids.length !== perf.songs.length ||
        new Set(ids).size !== ids.length ||
        !perf.songs.every((s) => ids.includes(s.id))
      )
        return fail(ctx, 409, 'STATE_CONFLICT', 'SETLIST_CHANGED')
      if (
        items.some(
          (i) =>
            perf.songs.find((s) => s.id === i.songId)?.version !==
            Number(i.version),
        )
      )
        return fail(ctx, 409, 'VERSION_CONFLICT')
      // O-03: placed orders are 1..n without gaps or repeats.
      const placed = items
        .flatMap((i) => (typeof i.order === 'number' ? [i.order] : []))
        .sort((a, b) => a - b)
      if (!placed.every((o, idx) => o === idx + 1))
        return fail(ctx, 400, 'VALIDATION_ERROR', 'INVALID_VALUE')
      if (status === 'LOCKED' && placed.length !== perf.songs.length)
        return fail(ctx, 422, 'RULE_VIOLATION', 'LOCK_REQUIREMENTS_FAILED')
      for (const i of items) {
        const s = perf.songs.find((x) => x.id === i.songId)
        if (s) {
          s.order = typeof i.order === 'number' ? i.order : null
          s.version += 1
        }
      }
      perf.version += 1
      return send(ctx, 200, {
        data: {
          performanceVersion: String(perf.version),
          items: perf.songs.map((s) => songJson(pid, s)),
        },
      })
    }
    return false
  }

  return handle
}
