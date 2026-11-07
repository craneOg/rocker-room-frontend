// Dev-server-only mock of PERF-004 / PERF-005 (API-039, 041-049, 051, 052, 151, 152).
// Any club the user is an active member of works; only these performance paths are taken over.
// State lives here (keyed by club and performance) so it can be merged with other mocks later.
// Sample performances (ids 91-96, so they never clash with other mocks): 91 DRAFT,
// 92 ACTIVE (votes, member input, an unmet condition), 93 LOCKED, 94 FINISHED,
// 95 CANCELED, 96 ACTIVE (lockable, with one warning).

type Json = Record<string, unknown>
type Status = 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'FINISHED' | 'CANCELED'

export type MockContext = {
  method: string
  path: string
  readBody: () => Promise<Json>
  send: (status: number, body?: unknown) => void
  hasClub: (clubId: string) => boolean
}

type Perf = {
  status: Status
  version: number
  votes: number
  memberInputs: string[]
  unmet: { checkId: string; message: string; targetId: string }[]
  warnings: { checkId: string; message: string; targetId: string }[]
  policy: Json
}

const SEEDS: Record<string, { title: string; status: Status; votes?: number }> =
  {
    '91': { title: '봄 정기공연 (준비 중)', status: 'DRAFT' },
    '92': { title: '여름 공연 (진행 중)', status: 'ACTIVE', votes: 4 },
    '93': { title: '가을 공연 (확정)', status: 'LOCKED' },
    '94': { title: '지난 공연 (종료)', status: 'FINISHED' },
    '95': { title: '취소된 공연', status: 'CANCELED' },
    '96': { title: '겨울 공연 (확정 가능)', status: 'ACTIVE' },
  }

const policyOf = (): Json => ({
  applicationState: 'OPEN',
  applicationDeadline: '2026-12-05T23:30:00+09:00',
  candidateState: 'OPEN',
  candidateDeadline: null,
  playabilityState: 'CLOSED',
  playabilityDeadline: null,
  voteState: 'CLOSED',
  voteDeadline: null,
  teamApplicationState: 'DISABLED',
  teamApplicationDeadline: null,
  availabilityState: 'CLOSED',
  availabilityDeadline: null,
  candidateScope: 'ALL_PARTICIPANTS',
  candidateLimitPerMember: 3,
  voteMethod: 'APPROVAL',
  voteMaxChoices: 3,
  playabilityResultPublic: true,
  voteResultPublic: true,
  practiceSeasonStart: null,
  practiceSeasonEnd: null,
  maxSongsPerMember: null,
})

const NOW = '2026-11-01T12:00:00+09:00'

export function createPerformancePolicyMock() {
  const perfs = new Map<string, Perf>()
  const get = (clubId: string, pid: string) => {
    const key = `${clubId}:${pid}`
    const seed = SEEDS[pid]
    if (!perfs.has(key) && seed)
      perfs.set(key, {
        status: seed.status,
        version: 1,
        votes: seed.votes ?? 0,
        memberInputs: pid === '92' ? ['참여 신청 3건', '투표 4건'] : [],
        unmet:
          pid === '92'
            ? [
                {
                  checkId: 'L-05',
                  message: '이서연 참여 승인 대기',
                  targetId: '7',
                },
              ]
            : [],
        warnings:
          pid === '92' || pid === '96'
            ? [
                {
                  checkId: 'L-09',
                  message: '한소희 권장 곡 수(2곡) 초과',
                  targetId: '9',
                },
              ]
            : [],
        policy: policyOf(),
      })
    return perfs.get(key)
  }

  const performanceOf = (clubId: string, pid: string, p: Perf) => ({
    id: pid,
    clubId,
    title: SEEDS[pid]?.title ?? pid,
    performDate: '2026-12-20',
    location: '동아리방',
    preset: 'TEAM_FIRST',
    status: p.status,
    createdByUserId: '1',
    version: String(p.version),
    createdAt: NOW,
    updatedAt: NOW,
  })
  const policyJson = (p: Perf) => ({
    performanceId: '',
    performanceVersion: String(p.version),
    ...p.policy,
    updatedAt: `${NOW}#${p.version}`,
  })

  /** Returns true when the request was answered. */
  return async function handle(ctx: MockContext): Promise<boolean> {
    const m =
      /^\/api\/v1\/clubs\/([^/]+)\/performances\/(\d+)(?:\/(.+))?$/.exec(
        ctx.path,
      )
    if (!m) return false
    const [, clubId = '', pid = '', sub = ''] = m
    if (!ctx.hasClub(clubId)) return false
    const fail = (status: number, code: string, extra: Json = {}) =>
      ctx.send(status, {
        error: { code, message: code, details: [], ...extra },
      })
    const ok = (data: unknown) => ctx.send(200, { data })
    const p = get(clubId, pid)
    // Not one of the sample performances: leave it to the other handlers.
    if (!p) return false
    const body = ctx.method === 'GET' ? {} : await ctx.readBody()
    const stale = () => body.version !== String(p.version)
    const rule = (reason: string, extra: Json = {}) =>
      fail(422, 'RULE_VIOLATION', { details: [{ reason, ...extra }] })
    const conflict = (reason: string) =>
      fail(409, 'STATE_CONFLICT', { details: [{ reason }] })
    const editable = p.status === 'DRAFT' || p.status === 'ACTIVE'
    const move = (to: Status) => {
      p.status = to
      p.version += 1
    }

    if (ctx.method === 'GET' && sub === '') {
      ok({
        performance: performanceOf(clubId, pid, p),
        policy: { ...policyJson(p), performanceId: pid },
      })
    } else if (ctx.method === 'GET' && sub === 'policy') {
      ok({ ...policyJson(p), performanceId: pid })
    } else if (ctx.method === 'PATCH' && sub === 'policy') {
      if (!editable) conflict('INVALID_STATE')
      else if (stale()) fail(409, 'VERSION_CONFLICT')
      else {
        const { version: _version, ...patch } = body
        const next = { ...p.policy, ...patch }
        if (next.availabilityState === 'OPEN' && !next.practiceSeasonStart)
          rule('PRACTICE_SEASON_REQUIRED')
        else {
          p.policy = next
          p.version += 1
          const late =
            typeof next.practiceSeasonEnd === 'string' &&
            next.practiceSeasonEnd > '2026-12-20'
          ok({
            policy: { ...policyJson(p), performanceId: pid },
            warnings: late
              ? [{ message: '합주 시즌 종료일이 공연일 이후예요.' }]
              : [],
          })
        }
      }
    } else if (ctx.method === 'POST' && sub === 'policy/vote-method/validate') {
      if (!editable) conflict('INVALID_STATE')
      else
        ok({
          hardErrors: [],
          warnings:
            body.voteMethod !== p.policy.voteMethod && p.votes > 0
              ? [
                  {
                    type: 'VOTES_DELETED',
                    message: `투표 ${p.votes}건이 삭제돼요.`,
                    affectedCount: p.votes,
                  },
                ]
              : [],
          versions: { performance: String(p.version) },
        })
    } else if (ctx.method === 'PUT' && sub === 'policy/vote-method') {
      const changes = body.voteMethod !== p.policy.voteMethod
      if (!editable) conflict('INVALID_STATE')
      else if (stale()) fail(409, 'VERSION_CONFLICT')
      else if (changes && p.votes > 0 && body.confirmed !== true)
        fail(409, 'CONFIRMATION_REQUIRED', {
          details: [{ message: `투표 ${p.votes}건이 삭제돼요.` }],
        })
      else {
        const removed = changes ? p.votes : 0
        p.policy = { ...p.policy, voteMethod: body.voteMethod }
        p.votes = changes ? 0 : p.votes
        p.version += 1
        ok({
          policy: { ...policyJson(p), performanceId: pid },
          removedVoteCount: removed,
        })
      }
    } else if (ctx.method === 'GET' && sub === 'warnings') {
      ok({
        items: [
          ...p.unmet.map((i) => ({
            ...i,
            result: 'UNMET',
            targetType: 'PERFORMANCE_MEMBER',
          })),
          ...p.warnings.map((i) => ({
            ...i,
            result: 'WARNING',
            targetType: 'PERFORMANCE_MEMBER',
          })),
        ],
      })
    } else if (ctx.method === 'POST' && sub === 'lock') {
      if (p.status !== 'ACTIVE') conflict('INVALID_STATE')
      else if (stale()) fail(409, 'VERSION_CONFLICT')
      else if (p.unmet.length > 0) rule('LOCK_REQUIREMENTS_FAILED')
      else if (p.warnings.length > 0 && body.confirmed !== true)
        fail(409, 'CONFIRMATION_REQUIRED', {
          details: p.warnings.map((w) => ({ message: w.message })),
        })
      else {
        move('LOCKED')
        ok({
          resource: performanceOf(clubId, pid, p),
          warnings: p.warnings.map((w) => ({ message: w.message })),
          effects: {
            approvedPerformanceMemberIds: [],
            affectedScheduleIds: [],
            affectedUserIds: [],
          },
        })
      }
    } else if (ctx.method === 'POST') {
      // action -> [allowed from, to, reason required, takes a version]
      const rules: Record<string, [Status[], Status, boolean, boolean]> = {
        activate: [['DRAFT'], 'ACTIVE', false, true],
        finish: [['ACTIVE', 'LOCKED'], 'FINISHED', false, true],
        reopen: [['LOCKED'], 'ACTIVE', true, true],
        cancel: [['DRAFT', 'ACTIVE', 'LOCKED'], 'CANCELED', true, true],
        restore: [['CANCELED'], 'DRAFT', true, true],
        'revert-to-draft': [['ACTIVE'], 'DRAFT', false, false],
        'revert-to-locked': [['FINISHED'], 'LOCKED', true, false],
      }
      const r = rules[sub]
      if (!r) return false
      const [from, to, needsReason, versioned] = r
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (!from.includes(p.status)) conflict('INVALID_STATE')
      else if (needsReason && reason === '') fail(400, 'VALIDATION_ERROR')
      else if (versioned && stale()) fail(409, 'VERSION_CONFLICT')
      else if (sub === 'revert-to-draft' && p.memberInputs.length > 0)
        // The counts' wire shape is unknown; one message per kind is assumed.
        fail(422, 'RULE_VIOLATION', {
          details: p.memberInputs.map((message) => ({
            reason: 'MEMBER_INPUT_EXISTS',
            message,
          })),
        })
      else {
        move(to)
        ok(
          sub.startsWith('revert-to')
            ? { id: pid, status: p.status, version: String(p.version) }
            : performanceOf(clubId, pid, p),
        )
      }
    } else return false
    return true
  }
}
