import type { IncomingMessage, ServerResponse } from 'node:http'

// Dev-only mock of API-038 (create), API-039 (read) and API-040 (update) for PERF-002/006.
// It owns only the performances created here, so GET /performances/:id of other mock data falls
// through. Keep the state in this module: a later list/detail mock can share it.

type Row = {
  performance: Record<string, unknown> & { version: string }
  policy: Record<string, unknown>
}

const rows = new Map<string, Row>()
let seq = 100

const POLICY = (
  application: string,
  team: string,
  candidate: string,
  scope: string,
  playability: string,
  vote: string,
) => ({
  applicationState: application,
  teamApplicationState: team,
  candidateState: candidate,
  candidateScope: scope,
  playabilityState: playability,
  voteState: vote,
})
const PRESETS: Record<string, Record<string, unknown>> = {
  TEAM_FIRST: POLICY(
    'OPEN',
    'CLOSED',
    'OPEN',
    'TEAM_MEMBERS',
    'OPEN',
    'CLOSED',
  ),
  SONG_FIRST: POLICY(
    'OPEN',
    'CLOSED',
    'OPEN',
    'ALL_PARTICIPANTS',
    'OPEN',
    'OPEN',
  ),
  SONG_FIXED: POLICY(
    'CLOSED',
    'DISABLED',
    'DISABLED',
    'ALL_PARTICIPANTS',
    'CLOSED',
    'DISABLED',
  ),
  SELF_TEAM: POLICY('OPEN', 'OPEN', 'OPEN', 'TEAM_MEMBERS', 'OPEN', 'CLOSED'),
  BAND: POLICY(
    'CLOSED',
    'DISABLED',
    'OPEN',
    'ALL_PARTICIPANTS',
    'OPEN',
    'OPEN',
  ),
  CUSTOM: POLICY(
    'OPEN',
    'DISABLED',
    'OPEN',
    'ALL_PARTICIPANTS',
    'OPEN',
    'DISABLED',
  ),
}
const POLICY_DEFAULTS = {
  availabilityState: 'CLOSED',
  candidateLimitPerMember: null,
  voteMethod: 'APPROVAL',
  voteMaxChoices: null,
  playabilityResultPublic: true,
  voteResultPublic: true,
  practiceSeasonStart: null,
  practiceSeasonEnd: null,
  maxSongsPerMember: null,
  applicationDeadline: null,
  candidateDeadline: null,
  playabilityDeadline: null,
  voteDeadline: null,
  teamApplicationDeadline: null,
  availabilityDeadline: null,
}

type Ctx = {
  path: string
  method: string
  memberships: { clubId: string; role: string; status: string }[]
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
const fail = (
  res: ServerResponse,
  status: number,
  code: string,
  details: unknown[] = [],
) => send(res, status, { error: { code, message: code, details } })
const field = (name: string, message: string) => ({ field: name, message })

async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const isDate = (v: unknown) =>
  v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
const tooLong = (v: unknown, max: number) =>
  typeof v === 'string' && v.length > max

/** Returns true when the request was answered. Any club with an active officer membership works. */
export async function handlePerformanceForm(
  req: IncomingMessage,
  res: ServerResponse,
  { path, method, memberships }: Ctx,
): Promise<boolean> {
  const m = /^\/api\/v1\/clubs\/([^/]+)\/performances(?:\/([^/]+))?$/.exec(path)
  if (!m) return false
  const [, clubId = '', id] = m
  const isCreate = method === 'POST' && id === undefined
  const isPatch = method === 'PATCH' && id !== undefined
  const isRead = method === 'GET' && id !== undefined && rows.has(id)
  if (!isCreate && !isPatch && !isRead) return false

  const mine = memberships.find(
    (x) => x.clubId === clubId && x.status === 'ACTIVE',
  )
  if (!mine) return (fail(res, 404, 'NOT_FOUND'), true)
  if (mine.role !== 'CLUB_ADMIN') return (fail(res, 403, 'FORBIDDEN'), true)

  if (isRead) {
    const row = rows.get(id!)!
    send(res, 200, {
      data: { performance: row.performance, policy: row.policy },
    })
    return true
  }

  const body = await readBody(req)
  const errors: unknown[] = []
  if (isCreate) {
    const title = body.title
    if (typeof title !== 'string' || title.trim() === '' || title.length > 200)
      errors.push(field('title', '공연 이름은 1~200자예요'))
    if (!isDate(body.performDate ?? null))
      errors.push(field('performDate', '날짜 형식이 올바르지 않아요'))
    if (tooLong(body.location, 200))
      errors.push(field('location', '장소는 200자까지예요'))
    const preset = body.preset ?? 'TEAM_FIRST'
    if (typeof preset !== 'string' || !(preset in PRESETS))
      errors.push(field('preset', '진행 방식이 올바르지 않아요'))
    if (errors.length) return (fail(res, 400, 'VALIDATION_ERROR', errors), true)

    const key = String(preset)
    const now = new Date().toISOString()
    const performance = {
      id: `p${++seq}`,
      clubId,
      title: String(title).trim(),
      performDate: (body.performDate as string | null | undefined) ?? null,
      location: (body.location as string | null | undefined) ?? null,
      preset: key,
      status: 'DRAFT',
      createdByUserId: '1',
      version: '1',
      createdAt: now,
      updatedAt: now,
    }
    const requested =
      typeof body.policy === 'object' && body.policy !== null ? body.policy : {}
    rows.set(performance.id, {
      performance,
      policy: {
        performanceId: performance.id,
        performanceVersion: performance.version,
        ...POLICY_DEFAULTS,
        ...PRESETS[key],
        ...requested,
        updatedAt: now,
      },
    })
    send(res, 201, { data: performance })
    return true
  }

  // PATCH
  const row = rows.get(id!)
  if (!row) return (fail(res, 404, 'NOT_FOUND'), true)
  const p = row.performance
  if (p.status === 'FINISHED' || p.status === 'CANCELED')
    return (
      fail(res, 409, 'STATE_CONFLICT', [{ reason: 'INVALID_STATE' }]),
      true
    )
  if (typeof body.version !== 'string')
    return (
      fail(res, 400, 'VALIDATION_ERROR', [field('version', '필수예요')]),
      true
    )
  if (body.version !== p.version)
    return (fail(res, 409, 'VERSION_CONFLICT'), true)
  if (
    'title' in body &&
    (typeof body.title !== 'string' ||
      body.title.trim() === '' ||
      body.title.length > 200)
  )
    errors.push(field('title', '공연 이름은 1~200자예요'))
  if ('performDate' in body && !isDate(body.performDate))
    errors.push(field('performDate', '날짜 형식이 올바르지 않아요'))
  if (tooLong(body.location, 200))
    errors.push(field('location', '장소는 200자까지예요'))
  if (
    p.status === 'LOCKED' &&
    (typeof body.reason !== 'string' || body.reason === '')
  )
    errors.push(field('reason', '사유를 입력해 주세요'))
  if (errors.length) return (fail(res, 400, 'VALIDATION_ERROR', errors), true)

  if (typeof body.title === 'string') p.title = body.title.trim()
  if ('performDate' in body) p.performDate = body.performDate
  if ('location' in body) p.location = body.location
  p.version = String(Number(p.version) + 1)
  p.updatedAt = new Date().toISOString()
  row.policy.performanceVersion = p.version
  const end = row.policy.practiceSeasonEnd
  const warnings =
    typeof end === 'string' &&
    typeof p.performDate === 'string' &&
    end > p.performDate
      ? [
          {
            type: 'SEASON_ENDS_AFTER_PERFORM_DATE',
            message: '합주 시즌이 공연일 이후까지예요.',
          },
        ]
      : []
  send(res, 200, { data: { ...p, warnings } })
  return true
}
