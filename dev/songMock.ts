import type { ServerResponse } from 'node:http'
import { bodyCache, type MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of SONG-001..005 (API-075..086, 089..099, 156..158) and the team reads of
// API-061 / 154 for sample club c10, performances p1 (ACTIVE), p2 (DRAFT) and p3 (LOCKED). The
// requester is the officer u1 (performance member pm1 of p1). Paths that are not its own return
// false so the caller keeps looking. Never imported by src/.

type Answer = 'POSSIBLE' | 'IMPOSSIBLE' | 'UNDECIDED'
type SongStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN'
type Song = {
  id: string
  pid: string
  title: string
  artist: string | null
  status: SongStatus
  candidateTeamId: string | null
  assignedTeamId: string | null
  order: number | null
  link: string | null
  memo: string | null
  proposer: string
  note: string | null
  withdrawal: 'PROPOSER' | 'ADMIN' | null
  version: number
  requirements: { partId: string; requiredCount: number }[]
  sessions: { pm: string; partId: string }[]
  playability: {
    pm: string
    partId: string
    answer: Answer
    reason: string | null
    byAdmin: boolean
  }[]
  votes: { pm: string; score: number; byAdmin: boolean }[]
}

const PERF_STATUS: Record<string, string> = {
  p1: 'ACTIVE',
  p2: 'DRAFT',
  p3: 'LOCKED',
  p4: 'FINISHED',
}
const NAMES = ['명혜성', '송예림', '정규채', '김도윤', '이서연', '박지호']
const PARTS: Record<string, string> = {
  p1: '보컬',
  p2: '기타',
  p3: '베이스',
  p4: '드럼',
}
// Participants of p1 / p3 as the performance view mock seeds them: performance member -> club member.
const ROSTER: Record<string, { pm: string; member: string }[]> = {
  p1: [
    { pm: 'pm1', member: 'u1' },
    { pm: 'pm3', member: 'u3' },
    { pm: 'pm4', member: 'u4' },
    { pm: 'pm5', member: 'u5' },
  ],
  p3: [
    { pm: 'pm12', member: 'u2' },
    { pm: 'pm13', member: 'u3' },
  ],
}
const SELF_PM: Record<string, string> = { p1: 'pm1' }
const initialTeams = (): Record<
  string,
  { id: string; name: string; status: string }[]
> => ({
  p1: [{ id: 't1', name: 'Crane Team', status: 'APPROVED' }],
})
let TEAMS = initialTeams()

const nameOf = (member: string) =>
  NAMES[Number(member.replace(/\D/g, '')) - 1] ?? member
const pmName = (pid: string, pm: string) =>
  nameOf(ROSTER[pid]?.find((r) => r.pm === pm)?.member ?? pm)
const at = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().replace('Z', '+09:00')

const song = (s: Partial<Song> & Pick<Song, 'id' | 'pid' | 'title'>): Song => ({
  artist: null,
  status: 'PROPOSED',
  candidateTeamId: null,
  assignedTeamId: null,
  order: null,
  link: null,
  memo: null,
  proposer: 'u3',
  note: null,
  withdrawal: null,
  version: 1,
  requirements: [],
  sessions: [],
  playability: [],
  votes: [],
  ...s,
})

const initial = (): Song[] => [
  song({
    id: 's1',
    pid: 'p3',
    title: '잠들지 못하는 밤',
    artist: '넬',
    status: 'CONFIRMED',
    order: 1,
    proposer: 'u2',
    requirements: [{ partId: 'p2', requiredCount: 1 }],
    sessions: [{ pm: 'pm12', partId: 'p2' }],
  }),
  song({
    id: 's2',
    pid: 'p1',
    title: '꿈의 아이',
    artist: '이소라',
    link: 'https://example.com/s2',
    memo: '원곡 키로 진행해요.',
    playability: [
      {
        pm: 'pm3',
        partId: 'p2',
        answer: 'POSSIBLE',
        reason: null,
        byAdmin: false,
      },
      {
        pm: 'pm4',
        partId: 'p2',
        answer: 'IMPOSSIBLE',
        reason: '시험 기간',
        byAdmin: false,
      },
    ],
    votes: [{ pm: 'pm3', score: 1, byAdmin: false }],
  }),
  song({
    id: 's3',
    pid: 'p1',
    title: 'Superstition',
    artist: 'Stevie Wonder',
    proposer: 'u1',
    requirements: [
      { partId: 'p2', requiredCount: 1 },
      { partId: 'p4', requiredCount: 1 },
    ],
  }),
  song({
    id: 's4',
    pid: 'p1',
    title: 'Creep',
    artist: 'Radiohead',
    candidateTeamId: 't1',
  }),
  song({
    id: 's5',
    pid: 'p1',
    title: '사랑이 었다',
    artist: '밴드 크레인',
    status: 'CONFIRMED',
    candidateTeamId: 't1',
    assignedTeamId: 't1',
    order: 1,
    requirements: [
      { partId: 'p1', requiredCount: 1 },
      { partId: 'p2', requiredCount: 2 },
    ],
    sessions: [
      { pm: 'pm1', partId: 'p1' },
      { pm: 'pm3', partId: 'p2' },
    ],
  }),
  song({
    id: 's6',
    pid: 'p1',
    title: '아무 노래',
    artist: '지코',
    status: 'CONFIRMED',
  }),
  song({
    id: 's7',
    pid: 'p1',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    status: 'REJECTED',
    note: '편성이 맞지 않아요.',
  }),
  song({
    id: 's8',
    pid: 'p1',
    title: '철회된 곡',
    status: 'WITHDRAWN',
    withdrawal: 'PROPOSER',
  }),
  song({ id: 's9', pid: 'p1', title: '봄날', artist: 'BTS', proposer: 'u4' }),
]

export function createSongMock() {
  let songs = initial()
  let seq = 100
  const reset = () => {
    songs = initial()
    seq = 100
    TEAMS = initialTeams()
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
    reason?: string,
  ) =>
    send(res, status, {
      error: {
        code,
        message: code,
        details: reason ? [{ field: 'request', reason }] : [],
      },
    })
  const readBody = async (ctx: MockCtx) => {
    const cached = bodyCache.get(ctx.req)
    if (cached) return cached
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

  const person = (s: Song) => ({
    membershipId: s.proposer,
    displayName: nameOf(s.proposer),
  })
  const teamName = (pid: string, id: string | null) =>
    id === null ? null : (TEAMS[pid]?.find((t) => t.id === id)?.name ?? null)
  const aggregate = (s: Song) => {
    const counts = (a: Answer) =>
      s.playability.filter((p) => p.answer === a).length
    return {
      playability: {
        POSSIBLE: counts('POSSIBLE'),
        IMPOSSIBLE: counts('IMPOSSIBLE'),
        UNDECIDED: counts('UNDECIDED'),
      },
      voteCount: s.votes.length,
      scoreAverage: null,
    }
  }
  const body = (s: Song) => ({
    id: s.id,
    performanceId: s.pid,
    title: s.title,
    artist: s.artist,
    status: s.status,
    candidateTeamId: s.candidateTeamId,
    candidateTeamName: teamName(s.pid, s.candidateTeamId),
    assignedTeamId: s.assignedTeamId,
    assignedTeamName: teamName(s.pid, s.assignedTeamId),
    setlistOrder: s.order,
    referenceUrl: s.link,
    createdAt: at(-3),
    proposedBy: person(s),
    version: String(s.version),
  })
  const sessionRows = (s: Song) =>
    s.sessions.map((x) => ({
      performanceMemberId: x.pm,
      partId: x.partId,
      displayName: pmName(s.pid, x.pm),
      isSupport:
        s.assignedTeamId !== null &&
        !(
          s.assignedTeamId === 't1' &&
          ['u1', 'u3'].includes(
            ROSTER[s.pid]?.find((r) => r.pm === x.pm)?.member ?? '',
          )
        ),
      isGuest: false,
    }))
  const requirementsOk = (s: Song) =>
    s.requirements.length === 0
      ? null
      : s.requirements.every(
          (r) =>
            s.sessions.filter((x) => x.partId === r.partId).length >=
            r.requiredCount,
        )
  const card = (s: Song) => {
    const self = SELF_PM[s.pid]
    return {
      ...body(s),
      evaluation: aggregate(s),
      myPlayability: s.playability
        .filter((p) => p.pm === self)
        .map((p) => ({ partId: p.partId, answer: p.answer })),
      myVote: (() => {
        const v = s.votes.find((x) => x.pm === self)
        return v ? { score: v.score } : null
      })(),
      sessionCount: s.status === 'CONFIRMED' ? s.sessions.length : null,
      requirementsSatisfied:
        s.status === 'CONFIRMED' ? requirementsOk(s) : null,
    }
  }
  const resource = (s: Song) => ({
    resource: {
      id: s.id,
      performanceId: s.pid,
      title: s.title,
      status: s.status,
      assignedTeamId: s.assignedTeamId,
      setlistOrder: s.order,
      version: String(s.version),
    },
    warnings: [] as unknown[],
    effects: {
      approvedPerformanceMemberIds: [],
      affectedScheduleIds: [],
      affectedUserIds: [],
    },
  })

  const renumber = (pid: string) =>
    songs
      .filter(
        (s) => s.pid === pid && s.status === 'CONFIRMED' && s.order !== null,
      )
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((s, i) => {
        s.order = i + 1
      })
  const shift = (pid: string, order: number) => {
    songs
      .filter(
        (s) => s.pid === pid && s.order !== null && (s.order ?? 0) >= order,
      )
      .forEach((s) => {
        s.order = (s.order ?? 0) + 1
      })
  }

  const handle = async function handle(ctx: MockCtx): Promise<boolean> {
    const { res, url, path, method } = ctx
    const m =
      /^\/api\/v1\/clubs\/c10\/performances\/([^/]+)\/(songs|evaluations|teams)(?:\/(.*))?$/.exec(
        path,
      )
    if (!m) return false
    const [, pid = '', area = '', rest = ''] = m
    const own = ctx.memberships.find(
      (x) => x.clubId === 'c10' && x.status === 'ACTIVE',
    )
    if (!own || !(pid in PERF_STATUS)) return false
    const admin = own.role === 'CLUB_ADMIN'
    const pstatus = PERF_STATUS[pid]
    const self = SELF_PM[pid]
    const done = (s: unknown) => {
      ok(res, s)
      return true
    }
    const no = (status: number, code: string, reason?: string) => {
      fail(res, status, code, reason)
      return true
    }

    // ---- teams (API-061 read, 154, 086) --------------------------------------------------------
    if (area === 'teams') {
      if (method === 'GET' && rest === '')
        return done({
          items: (TEAMS[pid] ?? []).map((t) => ({ ...t, isMine: true })),
          page: 0,
          size: 100,
          totalElements: (TEAMS[pid] ?? []).length,
          totalPages: 1,
        })
      if (method === 'GET' && rest === 'default-name') {
        const used = new Set((TEAMS[pid] ?? []).map((t) => t.name))
        let n = 1
        while (used.has(`${n}팀`)) n++
        return done({ name: `${n}팀` })
      }
      if (method === 'POST' && rest === '') {
        const b = await readBody(ctx)
        if (typeof b.sourceSongId !== 'string') return false
        if (!admin) return no(403, 'FORBIDDEN')
        const s = songs.find((x) => x.id === b.sourceSongId && x.pid === pid)
        if (!s) return no(404, 'NOT_FOUND')
        if (
          pstatus !== 'ACTIVE' ||
          s.status !== 'CONFIRMED' ||
          s.assignedTeamId !== null
        )
          return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
        if (String(b.version) !== String(s.version))
          return no(409, 'VERSION_CONFLICT')
        const name = String(b.name ?? '').trim()
        if (name === '') return no(400, 'VALIDATION_ERROR', 'INVALID_VALUE')
        if ((TEAMS[pid] ?? []).some((t) => t.name === name))
          return no(409, 'DUPLICATE')
        const leader = b.leaderMembershipId
        if (
          typeof leader === 'string' &&
          !s.sessions.some(
            (x) => ROSTER[pid]?.find((r) => r.pm === x.pm)?.member === leader,
          )
        )
          return no(422, 'RULE_VIOLATION', 'LEADER_NOT_TEAM_MEMBER')
        const team = { id: `t${seq++}`, name, status: 'APPROVED' }
        TEAMS[pid] = [...(TEAMS[pid] ?? []), team]
        s.assignedTeamId = team.id
        s.version++
        ok(res, { team: { ...team, performanceId: pid }, song: body(s) }, 201)
        return true
      }
      return false
    }

    // ---- API-158 board -----------------------------------------------------------------------
    if (area === 'evaluations') {
      if (method !== 'GET' || rest !== '') return false
      if (!admin) return no(403, 'FORBIDDEN')
      const type = url.searchParams.get('type') ?? 'PLAYABILITY'
      const teamId = url.searchParams.get('teamId')
      const list = songs.filter(
        (s) =>
          s.pid === pid &&
          s.status === 'PROPOSED' &&
          (teamId === null || s.candidateTeamId === teamId),
      )
      const members = (ROSTER[pid] ?? []).map((r) => ({
        performanceMemberId: r.pm,
        displayName: nameOf(r.member),
      }))
      const answered = new Set(
        list.flatMap((s) =>
          (type === 'VOTE' ? s.votes : s.playability).map((x) => x.pm),
        ),
      )
      return done({
        voteMethod: 'APPROVAL',
        songs: list.map((s) => ({
          songId: s.id,
          title: s.title,
          playability: s.playability.map((p) => ({
            performanceMemberId: p.pm,
            partId: p.partId,
            answer: p.answer,
            reason: p.reason,
            enteredByAdmin: p.byAdmin,
          })),
          votes: s.votes.map((v) => ({
            performanceMemberId: v.pm,
            score: v.score,
            enteredByAdmin: v.byAdmin,
          })),
        })),
        members,
        responseRate: { answered: answered.size, total: members.length },
        nonResponders: members
          .filter((p) => !answered.has(p.performanceMemberId))
          .map((p) => ({
            ...p,
            unrespondedSongCount: list.length,
          })),
      })
    }

    // ---- songs -------------------------------------------------------------------------------
    if (rest === '') {
      if (method === 'GET') {
        const wanted = (
          url.searchParams.get('status') ?? 'PROPOSED,CONFIRMED'
        ).split(',')
        const q = url.searchParams.get('q')
        const team = url.searchParams.get('candidateTeamId')
        let items = songs.filter(
          (s) =>
            s.pid === pid &&
            wanted.includes(s.status) &&
            (team === null || s.candidateTeamId === team) &&
            (q === null || s.title.includes(q) || (s.artist ?? '').includes(q)),
        )
        if (url.searchParams.get('proposedByMe') === 'true')
          items = items.filter((s) => s.proposer === 'u1')
        if (url.searchParams.get('unresponded') === 'true')
          items = items.filter(
            (s) =>
              s.status === 'PROPOSED' &&
              !s.playability.some((p) => p.pm === self) &&
              !s.votes.some((v) => v.pm === self),
          )
        const sort = url.searchParams.get('sort') ?? 'createdAt,desc'
        if (sort === 'title,asc')
          items.sort((a, b) => a.title.localeCompare(b.title))
        if (sort === 'voteCount,desc')
          items.sort((a, b) => b.votes.length - a.votes.length)
        if (sort === 'possibleCount,desc')
          items.sort(
            (a, b) =>
              b.playability.filter((p) => p.answer === 'POSSIBLE').length -
              a.playability.filter((p) => p.answer === 'POSSIBLE').length,
          )
        if (sort === 'setlistOrder,asc')
          items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        const page = Number(url.searchParams.get('page') ?? 0)
        const size = Number(url.searchParams.get('size') ?? 20)
        return done({
          items: items.slice(page * size, (page + 1) * size).map(card),
          page,
          size,
          totalElements: items.length,
          totalPages: Math.ceil(items.length / size),
          myProposalCount: songs.filter(
            (s) =>
              s.pid === pid && s.proposer === 'u1' && s.status !== 'WITHDRAWN',
          ).length,
          myVoteCount: songs.filter(
            (s) => s.pid === pid && s.votes.some((v) => v.pm === self),
          ).length,
        })
      }
      if (method === 'POST') {
        const b = await readBody(ctx)
        const title = String(b.title ?? '').trim()
        if (title === '' || title.length > 200)
          return no(400, 'VALIDATION_ERROR', 'INVALID_VALUE')
        if (
          typeof b.referenceUrl === 'string' &&
          !b.referenceUrl.startsWith('https://')
        )
          return no(400, 'VALIDATION_ERROR', 'INVALID_URL')
        const confirm = b.status === 'CONFIRMED'
        if (confirm && !admin) return no(403, 'FORBIDDEN')
        if (pstatus === 'LOCKED') {
          if (!confirm) return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
          if (typeof b.reason !== 'string' || b.reason === '')
            return no(400, 'VALIDATION_ERROR', 'REASON_REQUIRED')
          if (
            !b.setlistOrder ||
            !b.assignedTeamId ||
            !Array.isArray(b.sessions) ||
            b.sessions.length === 0
          )
            return no(422, 'RULE_VIOLATION', 'LOCKED_INPUT_INCOMPLETE')
        }
        if (!confirm && pstatus !== 'ACTIVE' && !admin)
          return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
        if (
          !admin &&
          songs.filter(
            (s) =>
              s.pid === pid && s.proposer === 'u1' && s.status !== 'WITHDRAWN',
          ).length >= 3
        )
          return no(422, 'RULE_VIOLATION', 'LIMIT_EXCEEDED')
        const dup = songs.find(
          (s) =>
            s.pid === pid &&
            s.title === title &&
            s.artist === (b.artist ?? null),
        )
        const created = song({
          id: `s${seq++}`,
          pid,
          title,
          artist: typeof b.artist === 'string' ? b.artist : null,
          link: typeof b.referenceUrl === 'string' ? b.referenceUrl : null,
          memo: typeof b.memo === 'string' ? b.memo : null,
          candidateTeamId:
            typeof b.candidateTeamId === 'string' ? b.candidateTeamId : null,
          proposer: 'u1',
          status: confirm ? 'CONFIRMED' : 'PROPOSED',
          assignedTeamId:
            typeof b.assignedTeamId === 'string' ? b.assignedTeamId : null,
        })
        if (confirm && typeof b.setlistOrder === 'number') {
          shift(pid, b.setlistOrder)
          created.order = b.setlistOrder
        }
        if (Array.isArray(b.sessions))
          created.sessions = (
            b.sessions as { performanceMemberId: string; partId: string }[]
          ).map((x) => ({ pm: x.performanceMemberId, partId: x.partId }))
        songs = [...songs, created]
        renumber(pid)
        const result = resource(created)
        if (dup) result.warnings = [{ type: 'DUPLICATE_SONG' }]
        ok(res, result, 201)
        return true
      }
      return false
    }

    const sm = /^([^/]+)(?:\/(.*))?$/.exec(rest)
    const s = songs.find((x) => x.id === sm?.[1] && x.pid === pid)
    if (!sm) return false
    if (!s) return no(404, 'NOT_FOUND')
    const sub = sm[2] ?? ''
    const b = method === 'GET' || method === 'DELETE' ? {} : await readBody(ctx)
    const over = pstatus === 'FINISHED' || pstatus === 'CANCELED'
    const guard = (versioned = true): boolean | null => {
      if (!admin) return no(403, 'FORBIDDEN')
      if (versioned && String(b.version) !== String(s.version))
        return no(409, 'VERSION_CONFLICT')
      return null
    }
    const needReason = (): boolean | null =>
      pstatus === 'LOCKED' && (typeof b.reason !== 'string' || b.reason === '')
        ? no(400, 'VALIDATION_ERROR', 'REASON_REQUIRED')
        : null

    if (sub === '' && method === 'GET') {
      if (s.status === 'WITHDRAWN' && !admin && s.proposer !== 'u1')
        return no(404, 'NOT_FOUND')
      return done({
        song: {
          ...body(s),
          memo: s.memo,
          decisionNote: s.note,
          withdrawalType: s.withdrawal,
        },
        requirements: s.requirements,
        sessions: sessionRows(s),
        evaluation: aggregate(s),
        schedules:
          s.status === 'CONFIRMED'
            ? [
                {
                  id: 'sc1',
                  eventType: 'PRACTICE',
                  title: '정기 합주',
                  status: 'CONFIRMED',
                  startAt: at(3),
                  endAt: at(3.1),
                },
                {
                  id: 'sc0',
                  eventType: 'PRACTICE',
                  title: '지난 합주',
                  status: 'CONFIRMED',
                  startAt: at(-9),
                  endAt: at(-8.9),
                },
              ]
            : [],
        auditions:
          s.status === 'CONFIRMED'
            ? [
                {
                  id: 'a1',
                  type: 'SESSION',
                  applicantName: nameOf('u3'),
                  result: 'PASSED',
                  judgedAt: at(-6),
                },
              ]
            : [],
      })
    }

    if (sub === '' && method === 'PATCH') {
      const e = guard()
      if (e !== null) return e
      if (
        s.status !== 'PROPOSED' ||
        !['DRAFT', 'ACTIVE'].includes(pstatus ?? '')
      )
        return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
      if (
        typeof b.referenceUrl === 'string' &&
        !b.referenceUrl.startsWith('https://')
      )
        return no(400, 'VALIDATION_ERROR', 'INVALID_URL')
      if (typeof b.title === 'string') s.title = b.title
      if ('artist' in b) s.artist = (b.artist as string | null) ?? null
      if ('referenceUrl' in b)
        s.link = (b.referenceUrl as string | null) ?? null
      if ('memo' in b) s.memo = (b.memo as string | null) ?? null
      s.version++
      return done(body(s))
    }

    if (sub === 'requirements' && method === 'PUT') {
      const e = guard() ?? needReason()
      if (e !== null) return e
      s.requirements =
        (b.items as { partId: string; requiredCount: number }[]) ?? []
      s.version++
      return done({ songVersion: String(s.version), items: s.requirements })
    }

    if (sub === 'confirm' && method === 'POST') {
      const e = guard() ?? needReason()
      if (e !== null) return e
      if (s.status !== 'PROPOSED' || over)
        return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
      if (
        pstatus === 'LOCKED' &&
        (!b.setlistOrder ||
          !b.assignedTeamId ||
          !Array.isArray(b.sessions) ||
          b.sessions.length === 0)
      )
        return no(422, 'RULE_VIOLATION', 'LOCKED_INPUT_INCOMPLETE')
      s.status = 'CONFIRMED'
      s.assignedTeamId =
        'assignedTeamId' in b
          ? ((b.assignedTeamId as string | null) ?? null)
          : s.candidateTeamId
      if (typeof b.setlistOrder === 'number') {
        shift(pid, b.setlistOrder)
        s.order = b.setlistOrder
      }
      if (Array.isArray(b.sessions))
        s.sessions = (
          b.sessions as { performanceMemberId: string; partId: string }[]
        ).map((x) => ({
          pm: x.performanceMemberId,
          partId: x.partId,
        }))
      if (typeof b.reason === 'string') s.note = b.reason
      s.version++
      renumber(pid)
      return done(body(s))
    }

    if ((sub === 'unconfirm' || sub === 'reject') && method === 'POST') {
      const e = guard() ?? needReason()
      if (e !== null) return e
      const allowed =
        sub === 'unconfirm' ? ['CONFIRMED'] : ['PROPOSED', 'CONFIRMED']
      if (!allowed.includes(s.status) || over)
        return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
      if (
        sub === 'reject' &&
        s.status === 'CONFIRMED' &&
        b.confirmed !== true
      ) {
        send(res, 409, {
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'CONFIRMATION_REQUIRED',
            details: [{ reason: 'CONFIRMED_SONG_REJECTION' }],
            warnings: [
              {
                type: 'ASSIGNMENT_RELEASED',
                teamId: s.assignedTeamId,
                setlistOrder: s.order,
              },
              { type: 'SCHEDULE_LINK_RELEASED', scheduleIds: ['sc1'] },
            ],
          },
        })
        return true
      }
      s.status = sub === 'unconfirm' ? 'PROPOSED' : 'REJECTED'
      s.assignedTeamId = null
      s.order = null
      if (typeof b.decisionNote === 'string') s.note = b.decisionNote
      s.version++
      renumber(pid)
      return done(resource(s))
    }

    if (sub === 'reconsider' && method === 'POST') {
      const e = guard()
      if (e !== null) return e
      if (s.status !== 'REJECTED')
        return no(409, 'STATE_CONFLICT', 'NOT_REJECTED')
      s.status = 'PROPOSED'
      s.version++
      return done({ id: s.id, status: s.status, version: String(s.version) })
    }

    if ((sub === 'withdraw' || sub === 'remove') && method === 'POST') {
      const e = guard()
      if (e !== null) return e
      if (s.status !== 'PROPOSED')
        return no(409, 'STATE_CONFLICT', 'NOT_PROPOSED')
      s.status = 'WITHDRAWN'
      s.withdrawal = sub === 'withdraw' ? 'PROPOSER' : 'ADMIN'
      s.version++
      return done({
        id: s.id,
        status: s.status,
        withdrawalType: s.withdrawal,
        version: String(s.version),
      })
    }

    if (sub === 'assigned-team' && method === 'PUT') {
      const e = guard() ?? needReason()
      if (e !== null) return e
      if (s.status !== 'CONFIRMED')
        return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
      if (pstatus === 'LOCKED' && b.assignedTeamId === null)
        return no(422, 'RULE_VIOLATION', 'LOCK_REQUIREMENTS_FAILED')
      s.assignedTeamId = (b.assignedTeamId as string | null) ?? null
      s.version++
      return done(resource(s))
    }

    if (sub === 'sessions' && method === 'PUT') {
      const e = guard() ?? needReason()
      if (e !== null) return e
      if (s.status !== 'CONFIRMED' || over)
        return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
      const items =
        (b.items as { performanceMemberId: string; partId: string }[]) ?? []
      s.sessions = items.map((x) => ({
        pm: x.performanceMemberId,
        partId: x.partId,
      }))
      s.version++
      const result = resource(s)
      result.warnings = s.requirements.flatMap((r) => {
        const have = s.sessions.filter((x) => x.partId === r.partId).length
        return have === r.requiredCount
          ? []
          : [
              {
                type: have < r.requiredCount ? 'PART_SHORTAGE' : 'PART_EXCESS',
                partId: r.partId,
                partName: PARTS[r.partId] ?? r.partId,
                requiredCount: r.requiredCount,
                assignedCount: have,
              },
            ]
      })
      return done(result)
    }

    // ---- evaluations of one song (API-089 / 090 / 095) and the answers (091..099) ------------
    if (sub === 'evaluations' && method === 'GET') {
      const names = ROSTER[pid] ?? []
      const answered = (pm: string) => s.playability.some((p) => p.pm === pm)
      return done({
        ...aggregate(s),
        playabilityByPart: Object.keys(PARTS).flatMap((partId) => {
          const rows = s.playability.filter((p) => p.partId === partId)
          if (rows.length === 0) return []
          const n = (a: Answer) => rows.filter((p) => p.answer === a).length
          return [
            {
              partId,
              partName: PARTS[partId],
              POSSIBLE: n('POSSIBLE'),
              IMPOSSIBLE: n('IMPOSSIBLE'),
              UNDECIDED: n('UNDECIDED'),
            },
          ]
        }),
        scoreDistribution: null,
        namesVisible: { playability: true, vote: true },
        playabilityResponses: s.playability.map((p) => ({
          performanceMemberId: p.pm,
          displayName: pmName(pid, p.pm),
          partId: p.partId,
          answer: p.answer,
          reason: admin ? p.reason : null,
          enteredByAdmin: p.byAdmin,
        })),
        voteResponses: s.votes.map((v) => ({
          performanceMemberId: v.pm,
          displayName: pmName(pid, v.pm),
          score: v.score,
          enteredByAdmin: v.byAdmin,
        })),
        nonResponders: {
          playability: names
            .filter((r) => !answered(r.pm))
            .map((r) => ({
              performanceMemberId: r.pm,
              displayName: nameOf(r.member),
            })),
          vote: names
            .filter((r) => !s.votes.some((v) => v.pm === r.pm))
            .map((r) => ({
              performanceMemberId: r.pm,
              displayName: nameOf(r.member),
            })),
        },
      })
    }
    if (sub === 'playability' && method === 'GET') {
      const only = url.searchParams.get('performanceMemberId')
      return done({
        items: s.playability
          .filter((p) => only === null || p.pm === only)
          .map((p) => ({
            performanceMemberId: p.pm,
            displayName: pmName(pid, p.pm),
            partId: p.partId,
            answer: p.answer,
            reason: admin ? p.reason : null,
            enteredByAdmin: p.byAdmin,
          })),
      })
    }
    if (sub === 'votes' && method === 'GET') {
      const only = url.searchParams.get('performanceMemberId')
      return done({
        items: s.votes
          .filter((v) => only === null || v.pm === only)
          .map((v) => ({
            performanceMemberId: v.pm,
            displayName: pmName(pid, v.pm),
            score: v.score,
            enteredByAdmin: v.byAdmin,
          })),
      })
    }

    const pb = /^playability\/(?:me|members\/([^/]+))\/([^/]+)$/.exec(sub)
    const vt = /^votes\/(?:me|members\/([^/]+))$/.exec(sub)
    const target = pb ?? vt
    if (target && ['PUT', 'DELETE'].includes(method)) {
      const proxy = target[1]
      const pm = proxy ?? self
      if (proxy && !admin) return no(403, 'FORBIDDEN')
      if (!pm) return no(403, 'FORBIDDEN')
      if (s.status !== 'PROPOSED' || (!proxy && pstatus !== 'ACTIVE'))
        return no(409, 'STATE_CONFLICT', 'INVALID_STATE')
      if (pb) {
        const partId = pb[2] ?? ''
        s.playability = s.playability.filter(
          (p) => !(p.pm === pm && p.partId === partId),
        )
        if (method === 'PUT') {
          const a = b.answer as Answer
          if (!['POSSIBLE', 'IMPOSSIBLE', 'UNDECIDED'].includes(a))
            return no(400, 'VALIDATION_ERROR', 'INVALID_VALUE')
          s.playability.push({
            pm,
            partId,
            answer: a,
            reason: typeof b.reason === 'string' ? b.reason : null,
            byAdmin: !!proxy,
          })
          return done({
            performanceMemberId: pm,
            partId,
            answer: a,
            reason: b.reason ?? null,
          })
        }
      } else {
        s.votes = s.votes.filter((v) => v.pm !== pm)
        if (method === 'PUT') {
          const score = Number(b.score)
          if (!(score >= 1 && score <= 5))
            return no(400, 'VALIDATION_ERROR', 'INVALID_VALUE')
          s.votes.push({ pm, score, byAdmin: !!proxy })
          return done({ performanceMemberId: pm, score })
        }
      }
      send(res, 204)
      return true
    }
    return false
  }
  return Object.assign(handle, { reset })
}
