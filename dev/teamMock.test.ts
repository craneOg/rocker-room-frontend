import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { handleTeams } from './teamMock.ts'

type Reply = { status: number; body: Record<string, unknown> }

/** One request through the team mock as the signed-in officer of club c10. */
async function call(
  method: string,
  path: string,
  payload?: unknown,
): Promise<Reply> {
  const raw = payload === undefined ? '' : JSON.stringify(payload)
  const req = Object.assign(
    (async function* () {
      if (raw) yield raw
    })(),
    { url: path, method, headers: {} },
  ) as unknown as IncomingMessage
  let status = 0
  let text = ''
  const res = {
    writeHead: (s: number) => {
      status = s
    },
    end: (t?: string) => {
      text = t ?? ''
    },
  } as unknown as ServerResponse
  await handleTeams({
    req,
    res,
    url: new URL(path, 'http://mock'),
    path: new URL(path, 'http://mock').pathname,
    method,
    memberships: [
      { id: 'u1', clubId: 'c10', role: 'CLUB_ADMIN', status: 'ACTIVE' },
    ],
  })
  return { status, body: text ? JSON.parse(text) : {} }
}

const P = '/api/v1/clubs/c10/performances/p1/teams'
const reason = (r: Reply) =>
  (r.body.error as { details: { reason?: string }[] }).details[0]?.reason

// The reasons the backend confirmed (the dev mock must speak the same names).
describe('team mock reasons', () => {
  it('blank name: 400 NAME_REQUIRED', async () => {
    const r = await call('POST', P, { name: ' ', members: [] })
    expect([r.status, reason(r)]).toEqual([400, 'NAME_REQUIRED'])
  })

  it('taken name: 409 DUPLICATE_TEAM_NAME', async () => {
    const r = await call('POST', P, { name: 'Crane Team', members: [] })
    expect([r.status, reason(r)]).toEqual([409, 'DUPLICATE_TEAM_NAME'])
  })

  it('ineligible member: 422 RULE_VIOLATION MEMBER_NOT_ELIGIBLE', async () => {
    const r = await call('POST', P, {
      name: '자격 없음 팀',
      members: [{ membershipId: 'guest9', partId: null }],
    })
    expect(r.status).toBe(422)
    expect((r.body.error as { code: string }).code).toBe('RULE_VIOLATION')
    expect(reason(r)).toBe('MEMBER_NOT_ELIGIBLE')
  })

  it('answers a creation as `team` and an officer team as APPROVED', async () => {
    const r = await call('POST', P, {
      name: '새 팀 A',
      members: [{ membershipId: 'u2', partId: 'p2' }],
    })
    const data = r.body.data as { team: { status: string }; resource?: unknown }
    expect(r.status).toBe(201)
    expect(data.team.status).toBe('APPROVED')
    expect(data.resource).toBeUndefined()
  })

  it('lists submission times for the review queue', async () => {
    const r = await call('GET', `${P}?status=SUBMITTED`)
    const items = (
      r.body.data as { items: { id: string; submittedAt: string }[] }
    ).items
    expect(items.map((t) => t.id).sort()).toEqual(['t4', 't5'])
    expect(items.every((t) => typeof t.submittedAt === 'string')).toBe(true)
  })
})
