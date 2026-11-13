import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
  type Route,
} from '../../test/harness'
import { MEMBER_COPY as T } from './copy'
import { LAST_ADMIN_ROLE, MANAGE_COPY as M } from './manageCopy'

setupDom()

// Toasts and dialogs animate, which needs this (missing in jsdom).
beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const BASE = '/api/v1/clubs/10'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = (role: 'CLUB_ADMIN' | 'MEMBER') => ({
  id: 'm9',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role,
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
})
const club = {
  id: '10',
  name: 'Crane Band',
  description: '신촌 기반 밴드',
  clubType: 'BAND',
  status: 'ACTIVE',
  isSearchable: true,
  profileImageUrl: null,
  themeColor: null,
  createdAt: '2026-10-01T12:00:00+09:00',
  updatedAt: '2026-10-08T21:10:00+09:00',
}
const part = (id: string, name: string, isActive = true) => ({
  id,
  name,
  displayOrder: Number(id),
  isActive,
})
const member = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  displayName: name,
  userName: `${name}-서비스`,
  memberType: 'REGULAR',
  role: 'MEMBER',
  status: 'ACTIVE',
  profileImageUrl: null,
  parts: [part('1', '보컬')],
  ...extra,
})
const page = (items: unknown[]) =>
  json({ items, page: 0, size: 20, totalElements: items.length, totalPages: 1 })

/** JSON body of the last write (a call with a body) to `path`. */
const body = (fetchMock: ReturnType<typeof stubApi>, path: string) =>
  JSON.parse(
    String(
      callsTo(fetchMock, path)
        .filter(([, init]) => init?.body !== undefined)
        .at(-1)?.[1]?.body,
    ),
  ) as unknown

function open(
  path: string,
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: Record<string, Route> = {},
) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [membership(role)] }),
    [`GET ${BASE}`]: () => json(club),
    [`GET ${BASE}/memberships`]: () =>
      page([member('21', '정규채'), member('22', '김도윤')]),
    [`GET ${BASE}/memberships/m9`]: () =>
      json({ ...member('m9', '송예림'), performances: [] }),
    [`GET ${BASE}/memberships/21`]: () =>
      json({ ...member('21', '정규채'), performances: [] }),
    [`GET ${BASE}/parts`]: () =>
      json({
        items: [
          { ...part('1', '보컬'), memberCount: 2 },
          { ...part('2', '기타'), memberCount: 1 },
          { ...part('9', '건반', false), memberCount: 1 },
        ],
      }),
    ...extra,
  })
  return { fetchMock, router: renderApp(path) }
}

const button = (name: string | RegExp) => screen.findByRole('button', { name })
const click = async (name: string | RegExp) =>
  fireEvent.click(await button(name))

describe('CLUB-101 1-1 club edit', () => {
  it('is for officers only', async () => {
    open('/clubs/10/info', 'MEMBER')
    await screen.findByText('Crane Band')
    expect(screen.queryByRole('button', { name: M.edit })).toBeNull()
  })

  describe('photo and theme colour', () => {
    const photoClub = {
      ...club,
      profileImageUrl: 'https://cdn.test/old.png',
      themeColor: '#112233',
    }
    const upload = (name = 'new.png') =>
      fireEvent.change(screen.getByTestId('photo-input'), {
        target: {
          files: [new File(['x'], name, { type: 'image/png' })],
        },
      })

    it('sends the uploaded photo key and the upper-cased colour', async () => {
      const { fetchMock } = open('/clubs/10/info', 'CLUB_ADMIN', {
        [`PATCH ${BASE}`]: () => json(club),
        [`POST ${API_PATHS.profileImage}`]: () =>
          json(
            {
              imageKey: 'tmp/clubs/k.png',
              previewUrl: 'https://cdn.test/k.png',
            },
            201,
          ),
      })
      await click(M.edit)
      await screen.findByDisplayValue('Crane Band')
      upload()
      await waitFor(() =>
        expect(
          (
            screen
              .getByRole('img', { name: '프로필 사진' })
              .querySelector('img') as HTMLImageElement | null
          )?.src,
        ).toBe('https://cdn.test/k.png'),
      )
      fireEvent.change(screen.getByPlaceholderText('#1A2B3C'), {
        target: { value: '#abcdef' },
      })
      await click(M.save)

      await screen.findByText(COPY.saved)
      expect(body(fetchMock, BASE)).toMatchObject({
        profileImageKey: 'tmp/clubs/k.png',
        themeColor: '#ABCDEF',
      })
      const form = callsTo(fetchMock, API_PATHS.profileImage)[0]?.[1]
        ?.body as FormData
      expect(form.get('purpose')).toBe('CLUB_PROFILE')
    })

    it('goes back to the default image and clears the colour with null', async () => {
      const { fetchMock } = open('/clubs/10/info', 'CLUB_ADMIN', {
        [`GET ${BASE}`]: () => json(photoClub),
        [`PATCH ${BASE}`]: () => json(photoClub),
      })
      await click(M.edit)
      await screen.findByDisplayValue('Crane Band')
      fireEvent.click(await button('기본 이미지로'))
      fireEvent.change(screen.getByPlaceholderText('#1A2B3C'), {
        target: { value: '' },
      })
      await click(M.save)

      await screen.findByText(COPY.saved)
      expect(body(fetchMock, BASE)).toMatchObject({
        profileImageKey: null,
        themeColor: null,
      })
    })

    it('does not send photo or colour when they are left alone', async () => {
      const { fetchMock } = open('/clubs/10/info', 'CLUB_ADMIN', {
        [`GET ${BASE}`]: () => json(photoClub),
        [`PATCH ${BASE}`]: () => json(photoClub),
      })
      await click(M.edit)
      fireEvent.change(await screen.findByDisplayValue('Crane Band'), {
        target: { value: 'Heron Band' },
      })
      await click(M.save)

      await screen.findByText(COPY.saved)
      const sent = body(fetchMock, BASE) as Record<string, unknown>
      expect('profileImageKey' in sent).toBe(false)
      expect('themeColor' in sent).toBe(false)
    })

    it('blocks saving a malformed colour', async () => {
      open('/clubs/10/info', 'CLUB_ADMIN')
      await click(M.edit)
      await screen.findByDisplayValue('Crane Band')
      fireEvent.change(screen.getByPlaceholderText('#1A2B3C'), {
        target: { value: '#12' },
      })
      await screen.findByText(/#RRGGBB/)
      const save = await button(M.save)
      expect(
        save.hasAttribute('disabled') ||
          save.getAttribute('aria-disabled') === 'true',
      ).toBe(true)
    })
  })

  it('saves name and description, then refreshes the club', async () => {
    const { fetchMock } = open('/clubs/10/info', 'CLUB_ADMIN', {
      [`PATCH ${BASE}`]: () => json(club),
    })
    await click(M.edit)
    const name = await screen.findByDisplayValue('Crane Band')
    fireEvent.change(name, { target: { value: '  Heron Band ' } })
    fireEvent.change(screen.getByDisplayValue('신촌 기반 밴드'), {
      target: { value: '' },
    })
    await click(M.save)

    await screen.findByText(COPY.saved)
    // The type is unchanged: no reason, no type in the body.
    expect(body(fetchMock, BASE)).toEqual({
      name: 'Heron Band',
      description: null,
    })
    await waitFor(() =>
      expect(callsTo(fetchMock, BASE).length).toBeGreaterThan(2),
    )
  })

  it('shows a taken name by the input, keeping the form open', async () => {
    open('/clubs/10/info', 'CLUB_ADMIN', {
      [`PATCH ${BASE}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'DUPLICATE',
              message: 'x',
              details: [{ reason: 'CLUB_NAME_TAKEN' }],
            },
          }),
          { status: 409 },
        ),
    })
    await click(M.edit)
    await screen.findByDisplayValue('Crane Band')
    await click(M.save)
    await screen.findByText(`* ${M.nameTaken}`)
    expect(screen.getByDisplayValue('Crane Band')).toBeTruthy()
  })

  it('asks for a reason when the type changes and sends it with the type', async () => {
    const { fetchMock } = open('/clubs/10/info', 'CLUB_ADMIN', {
      [`PATCH ${BASE}`]: () => json(club),
    })
    await click(M.edit)
    fireEvent.click(await screen.findByRole('radio', { name: M.typeClub }))
    await click(M.save)

    // Notice of the band -> club change, then the required reason.
    await screen.findByText(M.typeToClub)
    expect(
      callsTo(fetchMock, BASE).filter(([, i]) => i?.method === 'PATCH'),
    ).toHaveLength(0)
    const reason = await screen.findByRole('textbox', {
      name: M.clubTypeReasonTitle,
    })
    expect(screen.getByRole('button', { name: M.save })).toHaveProperty(
      'disabled',
      true,
    )
    fireEvent.change(reason, { target: { value: '합주 위주로 전환' } })
    await click(M.save)

    await screen.findByText(COPY.saved)
    expect(body(fetchMock, BASE)).toMatchObject({
      name: 'Crane Band',
      clubType: 'CLUB',
      clubTypeChangeReason: '합주 위주로 전환',
    })
  })
})

describe('CLUB-102 4 select mode and bulk actions', () => {
  const BULK = `${BASE}/memberships/bulk`

  it('is hidden from regular members', async () => {
    open('/clubs/10/members', 'MEMBER')
    await screen.findByText('정규채')
    expect(screen.queryByRole('button', { name: M.select })).toBeNull()
  })

  it('selects members and changes their status', async () => {
    const { fetchMock } = open('/clubs/10/members', 'CLUB_ADMIN', {
      [`POST ${BULK}`]: () =>
        json({
          succeeded: [{ membershipId: '21', skipped: false }],
          failed: [],
          summary: { requested: 1, succeeded: 1, failed: 0, skipped: 0 },
        }),
    })
    await findScreen('CLUB-102')
    await screen.findByText('정규채')
    await click(M.select)
    expect(await button(M.bulkStatus)).toHaveProperty('disabled', true)

    fireEvent.click(
      screen.getByRole('checkbox', { name: M.selectRow('정규채') }),
    )
    await screen.findByText(M.selectedCount(1))
    await click(M.bulkStatus)
    fireEvent.click(await screen.findByRole('radio', { name: T.chipGraduated }))
    await click(M.change)

    await screen.findByText(M.bulkDone(1))
    expect(body(fetchMock, BULK)).toEqual({
      membershipIds: ['21'],
      action: 'CHANGE_STATUS',
      params: { status: 'GRADUATED' },
    })
    // Leaves select mode and reloads the list.
    await waitFor(() =>
      expect(screen.queryByText(M.selectedCount(0))).toBeNull(),
    )
    await screen.findByRole('button', { name: M.select })
    expect(callsTo(fetchMock, `${BASE}/memberships`).length).toBeGreaterThan(1)
  })

  it('reports a partial failure per person', async () => {
    open('/clubs/10/members', 'CLUB_ADMIN', {
      [`POST ${BULK}`]: () =>
        json({
          succeeded: [{ membershipId: '21', skipped: false }],
          failed: [{ membershipId: '22', reason: 'LAST_ADMIN' }],
          summary: { requested: 2, succeeded: 1, failed: 1, skipped: 0 },
        }),
    })
    await screen.findByText('정규채')
    await click(M.select)
    for (const n of ['정규채', '김도윤'])
      fireEvent.click(
        await screen.findByRole('checkbox', { name: M.selectRow(n) }),
      )
    await click(M.bulkStatus)
    fireEvent.click(await screen.findByRole('radio', { name: T.chipGraduated }))
    await click(M.change)

    await screen.findByText(M.bulkResult(1, 1))
    expect(screen.getByText(/김도윤: 임원은 활동·휴학 상태로/)).toBeTruthy()
  })

  it('removes parts in bulk and offers active parts only', async () => {
    const { fetchMock } = open('/clubs/10/members', 'CLUB_ADMIN', {
      [`POST ${BULK}`]: () =>
        json({
          succeeded: [{ membershipId: '21', skipped: false }],
          failed: [],
          summary: { requested: 1, succeeded: 1, failed: 0, skipped: 0 },
        }),
    })
    await screen.findByText('정규채')
    await click(M.select)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: M.selectRow('정규채') }),
    )
    await click(M.bulkParts)
    fireEvent.click(await screen.findByRole('radio', { name: M.partsRemove }))
    fireEvent.click(await screen.findByRole('checkbox', { name: '보컬' }))
    expect(screen.queryByRole('checkbox', { name: /건반/ })).toBeNull()
    await click(M.apply)

    await screen.findByText(M.bulkDone(1))
    expect(body(fetchMock, BULK)).toEqual({
      membershipIds: ['21'],
      action: 'CHANGE_PARTS',
      params: { mode: 'REMOVE', partIds: ['1'] },
    })
  })
})

describe('CLUB-103 officer actions', () => {
  const detail =
    (extra: Record<string, unknown> = {}) =>
    () =>
      json({
        ...member('21', '정규채', {
          parts: [part('1', '보컬'), part('9', '건반', false)],
          ...extra,
        }),
        performances: [],
      })
  const at = (path: string) => `${BASE}/memberships/21${path}`

  it('shows no actions to a regular member', async () => {
    open('/clubs/10/members/21', 'MEMBER')
    await screen.findByText('정규채-서비스')
    expect(screen.queryByRole('button', { name: M.withdraw })).toBeNull()
    expect(screen.queryByRole('button', { name: M.editPartsTitle })).toBeNull()
  })

  it('saves the whole part set, keeping an inactive part unless unchecked', async () => {
    const { fetchMock } = open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`GET ${at('')}`]: detail(),
      [`PUT ${at('/parts')}`]: () => json({}),
    })
    await click(M.editPartsTitle)
    // The inactive part the member already has stays; the others are active only.
    const inactive = await screen.findByRole('checkbox', {
      name: `건반 ${T.inactivePart}`,
    })
    expect((inactive as HTMLInputElement).checked).toBe(true)
    fireEvent.click(await screen.findByRole('checkbox', { name: '기타' }))
    await click(M.save)

    await screen.findByText(COPY.saved)
    expect(body(fetchMock, at('/parts'))).toEqual({ partIds: ['1', '9', '2'] })
  })

  it('changes status through the action endpoint of the target status', async () => {
    const { fetchMock } = open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`POST ${at('/take-leave')}`]: () => json({}),
    })
    await click(M.manageStatus)
    expect(await button(M.change)).toHaveProperty('disabled', true)
    fireEvent.click(
      await screen.findByRole('radio', {
        name: new RegExp(`^${T.chipOnLeave}`),
      }),
    )
    await click(M.change)

    await screen.findByText(M.changed)
    expect(callsTo(fetchMock, at('/take-leave'))).toHaveLength(1)
  })

  it('warns that graduating drops the officer role', async () => {
    open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`GET ${at('')}`]: detail({ role: 'CLUB_ADMIN' }),
    })
    await click(M.manageStatus)
    fireEvent.click(
      await screen.findByRole('radio', {
        name: new RegExp(`^${T.chipGraduated}`),
      }),
    )
    await screen.findByText(M.graduateDropsAdmin)
  })

  it('grants officer rights after a confirmation', async () => {
    const { fetchMock } = open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`PUT ${at('/role')}`]: () => json({}),
    })
    await click(M.grantAdmin)
    await screen.findByText(M.grantTitle('정규채'))
    await click(M.grantConfirm)

    await screen.findByText(M.changed)
    expect(body(fetchMock, at('/role'))).toEqual({ role: 'CLUB_ADMIN' })
  })

  it('shows the last-officer rule with its own copy', async () => {
    open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`GET ${at('')}`]: detail({ role: 'CLUB_ADMIN' }),
      [`PUT ${at('/role')}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'RULE_VIOLATION',
              message: 'server text',
              details: [{ reason: 'LAST_ADMIN' }],
            },
          }),
          { status: 422 },
        ),
    })
    await click(M.revokeAdmin)
    await click(M.revokeConfirm)
    await screen.findByText(LAST_ADMIN_ROLE)
    expect(screen.queryByText('server text')).toBeNull()
  })

  it('disables granting to a guest and says why', async () => {
    open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`GET ${at('')}`]: detail({ memberType: 'GUEST' }),
    })
    expect(await button(M.grantAdmin)).toHaveProperty('disabled', true)
    expect(screen.getByText(M.adminOnlyEligible)).toBeTruthy()
  })

  it('changes the member type with a required reason', async () => {
    const { fetchMock } = open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`PUT ${at('/member-type')}`]: () => json({}),
    })
    await click(M.changeType)
    fireEvent.click(await screen.findByRole('radio', { name: M.typeGuest }))
    await click(M.change)
    const reason = await screen.findByRole('textbox', {
      name: M.typeReasonTitle,
    })
    fireEvent.change(reason, { target: { value: '활동 축소' } })
    await click(M.change)

    await screen.findByText(M.typeChanged)
    expect(body(fetchMock, at('/member-type'))).toEqual({
      memberType: 'GUEST',
      reason: '활동 축소',
    })
  })

  it('explains why a member cannot become a guest', async () => {
    open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`PUT ${at('/member-type')}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'RULE_VIOLATION',
              message: 'server text',
              details: [{ reason: 'NOT_DIRECTLY_ADDED' }],
            },
          }),
          { status: 422 },
        ),
    })
    await click(M.changeType)
    fireEvent.click(await screen.findByRole('radio', { name: M.typeGuest }))
    await click(M.change)
    fireEvent.change(
      await screen.findByRole('textbox', { name: M.typeReasonTitle }),
      {
        target: { value: '사유' },
      },
    )
    await click(M.change)
    await screen.findByText(/직접 추가한 멤버만 객원으로 바꿀 수 있어요/)
  })

  it('previews the impact, then withdraws with the chosen team leader successors', async () => {
    const { fetchMock, router } = open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`GET ${at('/withdraw-preview')}`]: () =>
        json({
          target: { membershipId: '21', displayName: '정규채', role: 'MEMBER' },
          succession: null,
          performanceImpacts: [
            {
              performanceId: '31',
              performanceName: '가을 공연',
              participationStatus: 'APPROVED',
              isTeamLeader: true,
              teamName: '1팀',
            },
          ],
          teamLeaderCandidates: [
            {
              performanceId: '31',
              performanceName: '가을 공연',
              teamId: '41',
              teamName: '1팀',
              candidates: [
                { membershipId: '23', displayName: '김하늘' },
                { membershipId: '24', displayName: '박서연' },
              ],
            },
          ],
          warnings: [],
        }),
      [`POST ${at('/withdraw')}`]: () => json({}),
    })
    await click(M.withdraw)
    await screen.findByText(M.withdrawTitle('정규채'))
    await screen.findByText(M.withdrawPerformances(1))
    await screen.findByText(M.withdrawLeader('가을 공연', '1팀', '김하늘'))
    fireEvent.change(
      screen.getByRole('combobox', { name: `1팀 ${M.changeSuccessor}` }),
      {
        target: { value: '24' },
      },
    )
    await screen.findByText(M.withdrawLeader('가을 공연', '1팀', '박서연'))
    expect(callsTo(fetchMock, at('/withdraw'))).toHaveLength(0)
    await click(M.withdrawConfirm)

    await screen.findByText(M.withdrawn)
    expect(body(fetchMock, at('/withdraw'))).toEqual({
      teamLeaderSuccessors: [{ teamId: '41', membershipId: '24' }],
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/members'),
    )
  })

  it('offers only role revocation and a leave link on the own page', async () => {
    open('/clubs/10/members/m9', 'CLUB_ADMIN', {
      [`GET ${BASE}/memberships/m9`]: () =>
        json({
          ...member('m9', '송예림', { role: 'CLUB_ADMIN' }),
          performances: [],
        }),
    })
    await click(M.revokeAdmin)
    expect(
      screen.getByText(M.leaveInstead).closest('a')?.getAttribute('href'),
    ).toBe('/clubs/10/leave')
    expect(screen.queryByRole('button', { name: M.withdraw })).toBeNull()
    expect(screen.queryByRole('button', { name: M.manageStatus })).toBeNull()
    expect(screen.queryByRole('button', { name: M.changeType })).toBeNull()
  })

  it('shows the state-conflict dialog and refetches on 409', async () => {
    const { fetchMock } = open('/clubs/10/members/21', 'CLUB_ADMIN', {
      [`POST ${at('/take-leave')}`]: () => apiError('STATE_CONFLICT', 409),
    })
    await click(M.manageStatus)
    fireEvent.click(
      await screen.findByRole('radio', {
        name: new RegExp(`^${T.chipOnLeave}`),
      }),
    )
    await click(M.change)
    await screen.findByText(COPY.stateConflictTitle)
    // The global handler refetches once the dialog is acknowledged.
    await click(COPY.confirm)
    await waitFor(() =>
      expect(callsTo(fetchMock, at('')).length).toBeGreaterThan(1),
    )
  })
})
