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
})
