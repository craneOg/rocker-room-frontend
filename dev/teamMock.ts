import type { ServerResponse } from 'node:http'
import { bodyCache, type MockCtx } from './performanceViewMock.ts'

// Dev-server-only mock of TEAM-001 ~ 005 (API-061 ~ 074, 154, 155). Only
// `/clubs/:id/performances/:pid/teams...` of a club the user is an ACTIVE member of is taken;
// everything else falls through (the caller goes on to the next mock). State lives for the whole
// dev server run. Sample performances: p1 ACTIVE, p2 DRAFT, p3 LOCKED. Teams t1 ~ t9.
// Never imported by src/.

type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
type Source = 'ADMIN' | 'SELF' | 'FROM_SESSIONS'
type Member = { id: string; membershipId: string; partId: string | null }
type Team = {
  id: string
  pid: string
  name: string
  status: Status
  isDefault: boolean
  source: Source
  rejectReason: string | null
  leader: string | null
  members: Member[]
  version: number
}

const NAMES = ['명혜성', '송예림', '정규채', '김도윤', '이서연', '박지호']
const PARTS = [
  { id: 'p1', name: '보컬' },
  { id: 'p2', name: '기타' },
  { id: 'p3', name: '베이스' },
  { id: 'p4', name: '드럼' },
]
const indexOf = (membershipId: string) =>
  Number(membershipId.replace(/\D/g, '')) - 1
const nameOf = (membershipId: string) =>
  NAMES[indexOf(membershipId)] ?? `멤버${indexOf(membershipId) + 1}`
// The same roster as the performance view mock: member i owns the first (i % 4) + 1 parts.
const registered = (membershipId: string) =>
  PARTS.slice(0, (indexOf(membershipId) % 4) + 1).map((p) => p.id)
// u5 asked to take part through a team application (APPLIED); everyone else is confirmed.
const participation = (membershipId: string) =>
  membershipId === 'u5' ? 'APPLIED' : 'APPROVED'

let seq = 100
const mk = (
  id: string,
  pid: string,
  name: string,
  status: Status,
  source: Source,
  leader: string | null,
  people: [string, string | null][],
  extra: Partial<Team> = {},
): Team => ({
  id,
  pid,
  name,
  status,
  isDefault: false,
  source,
  rejectReason: null,
  leader,
  members: people.map(([membershipId, partId], i) => ({
    id: `tm${id}${i}`,
    membershipId,
    partId,
  })),
  version: 1,
  ...extra,
})

const initial = (): Team[] => [
  mk(
    't1',
    'p1',
    'Crane Team',
    'APPROVED',
    'ADMIN',
    'u1',
    [
      ['u1', 'p1'],
      ['u3', 'p3'],
    ],
    { isDefault: true },
  ),
  mk('t2', 'p1', '2팀', 'APPROVED', 'SELF', 'u3', [
    ['u3', 'p3'],
    ['u4', 'p4'],
  ]),
  mk('t3', 'p1', '3팀', 'DRAFT', 'SELF', 'u1', [
    ['u1', 'p1'],
    ['u2', 'p2'],
  ]),
  mk('t4', 'p1', '4팀', 'SUBMITTED', 'SELF', 'u5', [
    ['u5', 'p1'],
    ['u6', null],
  ]),
  mk('t5', 'p1', '5팀', 'SUBMITTED', 'SELF', 'u4', [['u4', 'p4']]),
  mk('t6', 'p1', '6팀', 'REJECTED', 'SELF', 'u1', [['u1', 'p1']], {
    rejectReason: '편성이 맞지 않아요.',
  }),
  mk('t7', 'p1', '7팀', 'WITHDRAWN', 'SELF', 'u3', [['u3', 'p3']]),
  mk('t8', 'p1', '8팀', 'DRAFT', 'SELF', 'u3', [['u3', 'p3']]),
  mk(
    't9',
    'p3',
    '확정 공연 팀',
    'APPROVED',
    'ADMIN',
    'u2',
    [
      ['u2', 'p2'],
      ['u3', 'p3'],
    ],
    { isDefault: true },
  ),
]

const PERFS: Record<string, 'DRAFT' | 'ACTIVE' | 'LOCKED'> = {
  p1: 'ACTIVE',
  p2: 'DRAFT',
  p3: 'LOCKED',
}
let teams = initial()

const song = (id: string, title: string, status: string, extra = {}) => ({
  id,
  performanceId: 'p1',
  title,
  artist: '아티스트',
  status,
  assignedTeamId: null,
  setlistOrder: null,
  version: '1',
  ...extra,
})

const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}
const fail = (
  res: ServerResponse,
  status: number,
  code: string,
  reason?: string,
) => {
  send(res, status, {
    error: {
      code,
      message: code,
      details: reason ? [{ field: 'request', reason }] : [],
    },
  })
  return true
}

const brief = (t: Team) => ({
  id: t.id,
  performanceId: t.pid,
  name: t.name,
  status: t.status,
  leaderMembershipId: t.leader,
  version: String(t.version),
})
const result = (t: Team, warnings: string[] = []) => ({
  resource: brief(t),
  warnings,
  effects: {
    approvedPerformanceMemberIds: [],
    affectedScheduleIds: [],
    affectedUserIds: [],
  },
})

const partSummary = (t: Team) => {
  const counts = new Map<string | null, number>()
  for (const m of t.members)
    counts.set(m.partId, (counts.get(m.partId) ?? 0) + 1)
  return [...counts].map(([partId, count]) => ({
    partId,
    partName: PARTS.find((p) => p.id === partId)?.name ?? null,
    count,
  }))
}

export async function handleTeams(ctx: MockCtx): Promise<boolean> {
  const { req, res, url, path, method } = ctx
  const m =
    /^\/api\/v1\/clubs\/([^/]+)\/performances\/([^/]+)\/teams(?:\/(.*))?$/.exec(
      path,
    )
  if (!m) return false
  const [, clubId, pid = '', rest = ''] = m
  const own = ctx.memberships.find(
    (x) => x.clubId === clubId && x.status === 'ACTIVE',
  )
  if (!own) return false
  const perfStatus = PERFS[pid]
  if (!perfStatus) return false
  const admin = own.role === 'CLUB_ADMIN'
  // The own roster id: c10 / sample clubs use u1, other clubs use their membership id.
  const self = clubId === 'c10' ? 'u1' : own.id

  const readBody = async () => {
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

  const mine = (t: Team) => t.members.some((x) => x.membershipId === self)
  // API-061 scope: officers see all, members see APPROVED and the teams they belong to.
  const visible = (t: Team) =>
    t.pid === pid && (admin || t.status === 'APPROVED' || mine(t))
  const card = (t: Team) => ({
    ...brief(t),
    isDefault: t.isDefault,
    source: t.source,
    rejectReason:
      t.status === 'REJECTED' && (admin || mine(t)) ? t.rejectReason : null,
    leaderDisplayName: t.leader ? nameOf(t.leader) : null,
    memberCount: t.members.length,
    partSummary: partSummary(t),
    assignedSongCount: t.id === 't1' ? 1 : 0,
    candidateSongCount:
      admin || mine(t) ? (['t1', 't3', 't4'].includes(t.id) ? 1 : 0) : null,
    isMine: mine(t),
  })

  if (rest === '' && method === 'GET') {
    const wanted = (url.searchParams.get('status') ?? '')
      .split(',')
      .filter(Boolean)
    const list = teams
      .filter(visible)
      .filter((t) => wanted.length === 0 || wanted.includes(t.status))
      .sort(
        (a, b) =>
          Number(b.isDefault) - Number(a.isDefault) ||
          a.name.localeCompare(b.name),
      )
    const count = (s: Status) =>
      teams.filter((t) => t.pid === pid && t.status === s).length
    send(res, 200, {
      data: {
        items: list.map(card),
        page: 0,
        size: Number(url.searchParams.get('size') ?? 20),
        totalElements: list.length,
        totalPages: 1,
        statusCounts: admin
          ? {
              DRAFT: count('DRAFT'),
              SUBMITTED: count('SUBMITTED'),
              APPROVED: count('APPROVED'),
              REJECTED: count('REJECTED'),
              WITHDRAWN: count('WITHDRAWN'),
            }
          : null,
      },
    })
    return true
  }
  if (rest === 'default-name' && method === 'GET') {
    const used = new Set(
      teams.filter((t) => t.pid === pid).map((t) => t.name.toLowerCase()),
    )
    let n = 1
    while (used.has(`${n}팀`)) n++
    send(res, 200, { data: { name: `${n}팀` } })
    return true
  }

  const body = method === 'GET' ? {} : await readBody()
  const taken = (name: string, except?: string) =>
    teams.some(
      (t) =>
        t.pid === pid &&
        t.id !== except &&
        t.name.toLowerCase() === name.toLowerCase(),
    )
  const nameOk = (v: unknown): v is string =>
    typeof v === 'string' && v.trim().length >= 1 && v.length <= 100
  const bad = () => fail(res, 400, 'VALIDATION_ERROR', 'INVALID_VALUE')
  const roster = (membershipId: string, partId: string | null) => ({
    id: `tm${seq++}`,
    membershipId,
    partId,
  })
  const warn = (members: Member[]) =>
    members
      .filter(
        (x) =>
          x.partId !== null && !registered(x.membershipId).includes(x.partId),
      )
      .map(
        (x) => `${nameOf(x.membershipId)}님의 대표 파트가 등록 파트에 없어요.`,
      )

  if (rest === '' && method === 'POST') {
    if (
      !['DRAFT', 'ACTIVE'].includes(perfStatus) ||
      (!admin && perfStatus !== 'ACTIVE')
    )
      return fail(res, 403, 'FORBIDDEN')
    if (!nameOk(body.name)) return bad()
    if (taken(body.name.trim()))
      return fail(res, 409, 'DUPLICATE', 'TEAM_NAME_TAKEN')
    const people = Array.isArray(body.members)
      ? (body.members as { membershipId: string; partId: string | null }[])
      : []
    const members = people.map((p) => roster(p.membershipId, p.partId ?? null))
    if (!admin) members.unshift(roster(self, null))
    const leader = admin
      ? typeof body.leaderMembershipId === 'string' &&
        members.some((x) => x.membershipId === body.leaderMembershipId)
        ? body.leaderMembershipId
        : null
      : self
    const team: Team = {
      id: `t${seq++}`,
      pid,
      name: body.name.trim(),
      status: admin ? 'APPROVED' : 'DRAFT',
      isDefault: false,
      source: admin ? 'ADMIN' : 'SELF',
      rejectReason: null,
      leader,
      members,
      version: 1,
    }
    teams.push(team)
    send(res, 201, { data: result(team, warn(members)) })
    return true
  }

  if (rest === 'default' && method === 'PUT') {
    if (!admin) return fail(res, 403, 'FORBIDDEN')
    const target = teams.find((t) => t.pid === pid && t.id === body.teamId)
    if (!target || target.status !== 'APPROVED')
      return fail(res, 409, 'STATE_CONFLICT', 'TEAM_NOT_APPROVED')
    for (const t of teams) if (t.pid === pid) t.isDefault = t.id === target.id
    target.version++
    send(res, 200, {
      data: { id: target.id, isDefault: true, version: String(target.version) },
    })
    return true
  }

  const sub = /^([^/]+)(?:\/(.*))?$/.exec(rest)
  const team = sub
    ? teams.find((t) => t.id === sub[1] && visible(t))
    : undefined
  if (!sub || !team) return fail(res, 404, 'NOT_FOUND')
  const tail = sub[2] ?? ''

  if (tail === '' && method === 'GET') {
    const view = card(team)
    send(res, 200, {
      data: {
        team: {
          id: view.id,
          performanceId: pid,
          name: view.name,
          status: view.status,
          isDefault: view.isDefault,
          source: view.source,
          rejectReason: view.rejectReason,
          leaderMembershipId: view.leaderMembershipId,
          leaderDisplayName: view.leaderDisplayName,
          partSummary: view.partSummary,
          version: view.version,
        },
        members: team.members.map((x) => ({
          id: x.id,
          teamId: team.id,
          membershipId: x.membershipId,
          performanceMemberId: `pm${indexOf(x.membershipId) + 1}`,
          displayName: nameOf(x.membershipId),
          profileImageUrl: null,
          partId: x.partId,
          partName: PARTS.find((p) => p.id === x.partId)?.name ?? null,
          isLeader: x.membershipId === team.leader,
          isRegisteredPart:
            x.partId === null || registered(x.membershipId).includes(x.partId),
          participationStatus: participation(x.membershipId),
        })),
        songs:
          team.id === 't1'
            ? [
                song('s1', '곡 제목', 'CONFIRMED', {
                  assignedTeamId: 't1',
                  setlistOrder: 1,
                  sessionCount: 2,
                  requirementsSatisfied: true,
                }),
              ]
            : [],
        candidateSongs:
          (admin || mine(team)) && ['t1', 't3', 't4'].includes(team.id)
            ? [
                song('s2', '후보 곡', 'PROPOSED', {
                  candidateTeamId: team.id,
                  evaluation: {
                    playability: { POSSIBLE: 2, IMPOSSIBLE: 0, UNDECIDED: 1 },
                    voteCount: 2,
                    scoreAverage: null,
                  },
                }),
              ]
            : [],
      },
    })
    return true
  }

  // Writes: permission (A, or the leader of a DRAFT team), LOCKED reason, then the optimistic lock.
  const leader = team.leader === self
  const reasonOk =
    perfStatus !== 'LOCKED' ||
    !admin ||
    (typeof body.reason === 'string' && body.reason.trim() !== '')
  const check = () => {
    if (!(admin || (leader && team.status === 'DRAFT'))) {
      fail(res, 403, 'FORBIDDEN')
      return false
    }
    if (!reasonOk) {
      bad()
      return false
    }
    if (String(body.version) !== String(team.version)) {
      fail(res, 409, 'VERSION_CONFLICT')
      return false
    }
    return true
  }
  const done = (status = 200, warnings: string[] = []) => {
    team.version++
    send(res, status, { data: result(team, warnings) })
    return true
  }

  if (tail === '' && method === 'PATCH') {
    if (!check()) return true
    if (!nameOk(body.name)) return bad()
    if (taken(body.name.trim(), team.id))
      return fail(res, 409, 'DUPLICATE', 'TEAM_NAME_TAKEN')
    team.name = body.name.trim()
    team.version++
    send(res, 200, { data: brief(team) })
    return true
  }
  if (tail === 'members' && method === 'POST') {
    if (!check()) return true
    const id = String(body.membershipId)
    if (team.members.some((x) => x.membershipId === id))
      return fail(res, 409, 'DUPLICATE', 'DUPLICATE_TEAM_MEMBER')
    const added = roster(
      id,
      typeof body.partId === 'string' ? body.partId : null,
    )
    team.members.push(added)
    return done(201, warn([added]))
  }
  const member = /^members\/([^/]+)$/.exec(tail)
  const row = member ? team.members.find((x) => x.id === member[1]) : undefined
  if (member && !row) return fail(res, 404, 'NOT_FOUND')
  if (row && method === 'PATCH') {
    if (!check()) return true
    row.partId = typeof body.partId === 'string' ? body.partId : null
    return done(200, warn([row]))
  }
  if (row && method === 'DELETE') {
    if (!check()) return true
    if (row.membershipId === team.leader)
      return fail(res, 409, 'STATE_CONFLICT', 'LEADER_CHANGE_REQUIRED')
    team.members = team.members.filter((x) => x !== row)
    return done()
  }
  if (tail === 'leader' && method === 'PUT') {
    if (!check()) return true
    const next = body.leaderMembershipId
    if (next === null && !admin) return fail(res, 403, 'FORBIDDEN')
    if (next !== null && !team.members.some((x) => x.membershipId === next))
      return fail(res, 409, 'STATE_CONFLICT', 'LEADER_NOT_TEAM_MEMBER')
    team.leader = next as string | null
    team.version++
    send(res, 200, { data: brief(team) })
    return true
  }

  // Status transitions (API-069 ~ 074). The performance must be ACTIVE.
  const moves: Record<
    string,
    { from: Status[]; to: Status; adminOnly?: boolean }
  > = {
    submit: { from: ['DRAFT'], to: 'SUBMITTED' },
    unsubmit: { from: ['SUBMITTED'], to: 'DRAFT' },
    approve: { from: ['SUBMITTED'], to: 'APPROVED', adminOnly: true },
    reject: { from: ['SUBMITTED'], to: 'REJECTED', adminOnly: true },
    withdraw: { from: ['DRAFT', 'SUBMITTED', 'APPROVED'], to: 'WITHDRAWN' },
    reopen: { from: ['REJECTED', 'WITHDRAWN'], to: 'DRAFT' },
  }
  const move = moves[tail]
  if (move && method === 'POST') {
    if (perfStatus !== 'ACTIVE' && !(tail === 'withdraw' && admin))
      return fail(res, 409, 'STATE_CONFLICT', 'INVALID_STATE')
    if (!(move.adminOnly ? admin : admin || leader))
      return fail(res, 403, 'FORBIDDEN')
    if (String(body.version) !== String(team.version))
      return fail(res, 409, 'VERSION_CONFLICT')
    if (!move.from.includes(team.status))
      return fail(res, 409, 'STATE_CONFLICT', 'INVALID_STATE')
    if (
      tail === 'submit' &&
      (team.leader === null || team.members.length === 0)
    )
      return fail(res, 409, 'STATE_CONFLICT', 'INELIGIBLE_TEAM_MEMBER')
    if (tail === 'withdraw' && team.status === 'APPROVED' && !admin)
      return fail(res, 403, 'FORBIDDEN')
    if (tail === 'withdraw' && team.isDefault)
      return fail(res, 409, 'STATE_CONFLICT', 'INVALID_STATE')
    if (tail === 'reject') {
      if (
        typeof body.reason !== 'string' ||
        body.reason.trim() === '' ||
        body.reason.length > 500
      )
        return bad()
      // A CONFIRMED song in the team's scope asks for confirmation first (t4 has one in this sample).
      if (team.id === 't4' && body.confirmed !== true) {
        send(res, 409, {
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'CONFIRMATION_REQUIRED',
            details: [
              {
                reason: 'CONFIRMED_SONGS_IN_TEAM_SCOPE',
                message:
                  '선정된 곡 1곡이 이 팀 범위예요. 곡은 그대로 남고 담당 팀을 다시 정해야 해요.',
              },
            ],
          },
        })
        return true
      }
      team.rejectReason = body.reason
    }
    team.status = move.to
    return done()
  }
  return fail(res, 404, 'NOT_FOUND')
}
