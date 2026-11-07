import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { findScreen, json, setupDom, type Route } from '../../test/harness'
import { MANAGE_COPY as M } from '../club/manageCopy'
import { BASE, body, lastQuery, open, page, perf } from './viewTestKit'
import { VIEW_COPY as T } from './viewCopy'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

// CLUB-102 4-3: 공연에 추가 (ASSIGN_PERFORMANCE of API-142).
const BULK = `${BASE}/memberships/bulk`
const LIST = `${BASE}/performances`
const member = (id: string, name: string) => ({
  id,
  displayName: name,
  userName: `${name}-서비스`,
  memberType: 'REGULAR',
  role: 'MEMBER',
  status: 'ACTIVE',
  profileImageUrl: null,
  parts: [],
})
const listed =
  (items: unknown[]): Route =>
  () =>
    page(
      items.map((p) => ({
        ...(p as object),
        myParticipationStatus: null,
        openFeatures: [],
      })),
    )

function openMembers(extra: Record<string, Route> = {}) {
  return open('/clubs/10/members', 'CLUB_ADMIN', {
    [`GET ${BASE}/memberships`]: () =>
      page([member('21', '정규채'), member('22', '김도윤')]),
    ...extra,
  })
}
const selectOne = async () => {
  await findScreen('CLUB-102')
  await screen.findByText('정규채')
  fireEvent.click(await screen.findByRole('button', { name: M.select }))
  fireEvent.click(
    await screen.findByRole('checkbox', { name: M.selectRow('정규채') }),
  )
  await screen.findByText(M.selectedCount(1))
}
const click = async (name: string) =>
  fireEvent.click(await screen.findByRole('button', { name }))

describe('CLUB-102 4-3 add to a performance', () => {
  it('is not shown to regular members (no select mode)', async () => {
    open('/clubs/10/members', 'MEMBER', {
      [`GET ${BASE}/memberships`]: () => page([member('21', '정규채')]),
    })
    await screen.findByText('정규채')
    expect(screen.queryByRole('button', { name: T.bulkAssign })).toBeNull()
  })

  it('stays disabled until someone is selected', async () => {
    openMembers()
    await findScreen('CLUB-102')
    await screen.findByText('정규채')
    fireEvent.click(await screen.findByRole('button', { name: M.select }))
    expect(
      (await screen.findByRole('button', {
        name: T.bulkAssign,
      })) as HTMLButtonElement,
    ).toHaveProperty('disabled', true)
  })

  it('adds the selection to the chosen performance and reports the count', async () => {
    const { fetchMock } = openMembers({
      [`GET ${LIST}`]: listed([
        perf({ id: '31', title: '가을 정기공연' }),
        perf({
          id: '32',
          title: '겨울 공연',
          status: 'DRAFT',
          performDate: null,
        }),
      ]),
      [`POST ${BULK}`]: () =>
        json({
          succeeded: [{ membershipId: '21', skipped: false }],
          failed: [],
          summary: { requested: 1, succeeded: 1, failed: 0, skipped: 0 },
        }),
    })
    await selectOne()
    await click(T.bulkAssign)
    await screen.findByText(T.bulkAssignHint)
    // Draft and active performances only.
    await screen.findByRole('radio', { name: /겨울 공연/ })
    expect(lastQuery(fetchMock, LIST).get('status')).toBe('DRAFT,ACTIVE')
    const add = screen.getByRole('button', { name: T.bulkAssignAdd })
    expect((add as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /겨울 공연/ }))
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(add)

    await screen.findByText(M.bulkDone(1))
    expect(body(fetchMock, BULK)).toEqual({
      membershipIds: ['21'],
      action: 'ASSIGN_PERFORMANCE',
      params: { performanceId: '32' },
    })
  })

  it('does not count a skipped (already participating) member as changed', async () => {
    openMembers({
      [`GET ${LIST}`]: listed([perf()]),
      [`POST ${BULK}`]: () =>
        json({
          succeeded: [{ membershipId: '21', skipped: true }],
          failed: [],
          summary: { requested: 1, succeeded: 1, failed: 0, skipped: 1 },
        }),
    })
    await selectOne()
    await click(T.bulkAssign)
    fireEvent.click(await screen.findByRole('radio', { name: /가을 정기공연/ }))
    await click(T.bulkAssignAdd)
    await screen.findByText(M.bulkDone(0))
  })

  it('reports a failed member in the result dialog', async () => {
    openMembers({
      [`GET ${LIST}`]: listed([perf()]),
      [`POST ${BULK}`]: () =>
        json({
          succeeded: [],
          failed: [{ membershipId: '21', reason: 'INVALID_MEMBERSHIP_STATUS' }],
          summary: { requested: 1, succeeded: 0, failed: 1, skipped: 0 },
        }),
    })
    await selectOne()
    await click(T.bulkAssign)
    fireEvent.click(await screen.findByRole('radio', { name: /가을 정기공연/ }))
    await click(T.bulkAssignAdd)
    await screen.findByText(M.bulkResult(0, 1))
    expect(screen.getByText(/정규채: 현재 상태에서는/)).toBeTruthy()
  })

  it('says so when no performance can take members', async () => {
    openMembers({ [`GET ${LIST}`]: listed([]) })
    await selectOne()
    await click(T.bulkAssign)
    await screen.findByText(T.noAssignable)
    expect(
      (
        screen.getByRole('button', {
          name: T.bulkAssignAdd,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
