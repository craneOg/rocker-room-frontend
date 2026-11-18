import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createMockApi } from './mockApi.ts'

type Reply = { status: number; data?: Record<string, unknown> }

/** Runs one request through a fresh mock handler (signed-in session cookie). */
function client() {
  const handler = createMockApi()
  return async (
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Reply> => {
    const raw = body === undefined ? '' : JSON.stringify(body)
    const req = Object.assign(
      (async function* () {
        if (raw) yield raw
      })(),
      { url, method, headers: { cookie: 'mockSession=1' } },
    ) as unknown as IncomingMessage
    return new Promise<Reply>((resolve) => {
      let status = 0
      const res = {
        writeHead: (s: number) => {
          status = s
        },
        end: (text?: string) =>
          resolve({
            status,
            data: text ? (JSON.parse(text) as Reply['data']) : undefined,
          }),
      } as unknown as ServerResponse
      void handler(req, res, () => resolve({ status: 0 }))
    })
  }
}

const base = '/api/v1/clubs/c10/memberships'

const reason = (r: Reply) =>
  (r.data as { error: { details: { reason: string }[] } }).error.details[0]
    ?.reason

describe('dev mock: club management writes', () => {
  it('lets a directly added regular member become a guest', async () => {
    const call = client()
    // u6 (index 5) is directly added through the i % 3 === 2 seed rule.
    const res = await call('PUT', `${base}/u6/member-type`, {
      memberType: 'GUEST',
      reason: 'test',
    })
    expect(res.status).toBe(200)
  })

  it('promotes the preview successor when the only admin withdraws', async () => {
    const call = client()
    expect(
      (await call('PUT', `${base}/u2/role`, { role: 'MEMBER' })).status,
    ).toBe(200)
    const preview = await call('GET', `${base}/u1/withdraw-preview`)
    const successorId = (
      preview.data as {
        data: { succession: { candidateMembershipId: string } }
      }
    ).data.succession.candidateMembershipId
    expect((await call('POST', `${base}/u1/withdraw`, {})).status).toBe(200)
    const successor = await call('GET', `${base}/${successorId}`)
    expect((successor.data as { data: { role: string } }).data.role).toBe(
      'CLUB_ADMIN',
    )
  })

  it('answers a repeated or disallowed change with a 409 reason', async () => {
    const call = client()
    const same = await call('PUT', `${base}/u2/role`, { role: 'CLUB_ADMIN' })
    expect([same.status, reason(same)]).toEqual([409, 'RELATION_CONFLICT'])
    const type = await call('PUT', `${base}/u2/member-type`, {
      memberType: 'REGULAR',
      reason: 'test',
    })
    expect([type.status, reason(type)]).toEqual([409, 'SAME_MEMBER_TYPE'])
    const resume = await call('POST', `${base}/u2/resume`, {})
    expect([resume.status, reason(resume)]).toEqual([
      409,
      'INVALID_MEMBERSHIP_STATUS',
    ])
    await call('POST', `${base}/u3/withdraw`, {})
    const parts = await call('PUT', `${base}/u3/parts`, { partIds: [] })
    expect([parts.status, reason(parts)]).toEqual([
      409,
      'INVALID_MEMBERSHIP_STATUS',
    ])
  })

  it('rejects a blank display name', async () => {
    const call = client()
    expect(
      (await call('PATCH', `${base}/u1`, { displayName: '  ' })).status,
    ).toBe(400)
  })
})

describe('dev mock: invite and join request actions', () => {
  it('returns 200 with the membership and 409 reasons', async () => {
    const call = client()
    const expired = await call('POST', '/api/v1/clubs/c2/memberships/m2/accept')
    expect([expired.status, reason(expired)]).toEqual([
      409,
      'INVITATION_EXPIRED',
    ])
    const accepted = await call(
      'POST',
      '/api/v1/clubs/c1/memberships/m1/accept',
    )
    expect(accepted.status).toBe(200)
    expect((accepted.data as { data: { status: string } }).data.status).toBe(
      'ACTIVE',
    )
    const again = await call('POST', '/api/v1/clubs/c1/memberships/m1/decline')
    expect([again.status, reason(again)]).toEqual([409, 'INVALID_STATE'])
  })
})
