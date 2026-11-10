import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  setupDom,
} from '../../test/harness'
import {
  lastQuery,
  memberPage,
  memberRow,
  page,
  PERF,
} from '../performance/viewTestKit'
import { COPY } from '../../shared/ui/copy'
import { TEAM_COPY as T } from './teamCopy'
import {
  body,
  click,
  created,
  reasoned,
  clickLast,
  menuItem,
  mutation,
  open,
  stubAnimations,
  teamDetail,
  TEAMS,
  tmember,
  withTeamPolicy,
} from './teamTestKit'

setupDom()
beforeEach(stubAnimations)

const APPLY = '/clubs/10/performances/31/teams/apply'
const T201 = `${TEAMS}/201`
const MEMBERSHIPS = '/api/v1/clubs/10/memberships'
const OPEN = () =>
  withTeamPolicy(
    'OPEN',
    {},
    { teamApplicationDeadline: '2026-10-15T23:59:00+09:00' },
  )

const openNew = (extra: Parameters<typeof open>[2] = {}) =>
  open(APPLY, 'MEMBER', {
    [`GET ${PERF}`]: OPEN,
    [`GET ${TEAMS}/default-name`]: () => json({ name: '2팀' }),
    [`GET ${MEMBERSHIPS}`]: () =>
      page([
        {
          id: '23',
          displayName: null,
          userName: '이서연',
          memberType: 'REGULAR',
          role: 'MEMBER',
          profileImageUrl: null,
          parts: [{ id: '4', name: '드럼', displayOrder: 1, isActive: true }],
        },
      ]),
    [`GET ${PERF}/members`]: () =>
      memberPage([memberRow('1', '22', '김도윤')], { APPROVED: 1 }),
    ...extra,
  })

describe('TEAM-004 new application', () => {
  it('is closed while the window is closed', async () => {
    open(APPLY, 'MEMBER', { [`GET ${PERF}`]: () => withTeamPolicy('CLOSED') })
    await findScreen('TEAM-004')
    await screen.findByText(T.cannotApply)
  })

  it('is closed on a performance that is not ACTIVE', async () => {
    open(APPLY, 'MEMBER', {
      [`GET ${PERF}`]: () => withTeamPolicy('OPEN', { status: 'DRAFT' }),
    })
    await screen.findByText(T.cannotApply)
  })

  it('saves a draft with the requester and their part in one request, then continues on the saved team', async () => {
    const { fetchMock, router } = openNew({
      [`POST ${TEAMS}`]: () => created(),
      [`GET ${T201}`]: () =>
        teamDetail(
          {
            status: 'DRAFT',
            source: 'SELF',
            leaderMembershipId: 'm9',
            version: '2',
          },
          [tmember('501', 'm9', '송예림', { isLeader: true })],
        ),
    })
    await findScreen('TEAM-004')
    expect(await screen.findByText(/작성 중 · 마감/)).toBeTruthy()
    expect(
      (
        (await screen.findByRole('textbox', {
          name: T.nameLabel,
        })) as HTMLInputElement
      ).value,
    ).toBe('2팀')

    fireEvent.click(await screen.findByText(`+ ${T.addMember}`))
    fireEvent.click(await screen.findByRole('checkbox', { name: /이서연/ }))
    await clickLast(T.pickerAdd)
    // No client-side guess about the participation: the server says it after the save.
    expect(screen.queryByText(T.willApply)).toBeNull()
    fireEvent.change(await screen.findByLabelText(T.pickerPart(T.me)), {
      target: { value: '4' },
    })
    await click(T.saveDraft)

    await screen.findByText(T.draftSaved)
    expect(body(fetchMock, TEAMS)).toEqual({
      name: '2팀',
      members: [
        { membershipId: 'm9', partId: '4' },
        { membershipId: '23', partId: '4' },
      ],
    })
    // No follow-up write: the part went with the creation.
    expect(
      fetchMock.mock.calls.filter(([, i]) => i?.method === 'PATCH'),
    ).toHaveLength(0)
    await waitFor(() =>
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe(`${APPLY}?teamId=201`),
    )
    // The saved application is now read from the server.
    await screen.findByText(T.submit)
    // A regular member must not send `status` to the member list.
    const q = lastQuery(fetchMock, MEMBERSHIPS)
    expect(q.get('status')).toBeNull()
    expect(q.get('memberType')).toBe('REGULAR')
  })

  it('stays on the new form when the creation itself fails', async () => {
    const { router } = openNew({
      [`POST ${TEAMS}`]: () => apiError('FORBIDDEN', 403),
    })
    await screen.findByRole('textbox', { name: T.nameLabel })
    await click(T.saveDraft)
    await screen.findByText(COPY.officerOnly)
    expect(router.state.location.search).toBe('')
  })

  it.each([
    [
      'the server reason',
      () => reasoned('DUPLICATE', 409, 'DUPLICATE_TEAM_NAME'),
    ],
    ['a DUPLICATE without a reason', () => apiError('DUPLICATE', 409)],
  ])('shows a taken name under the input (%s)', async (_, answer) => {
    openNew({ [`POST ${TEAMS}`]: answer })
    await screen.findByRole('textbox', { name: T.nameLabel })
    await click(T.saveDraft)
    await screen.findByText(`* ${T.nameTaken}`)
  })

  it('shows NAME_REQUIRED under the input', async () => {
    openNew({
      [`POST ${TEAMS}`]: () =>
        reasoned('VALIDATION_ERROR', 400, 'NAME_REQUIRED'),
    })
    await screen.findByRole('textbox', { name: T.nameLabel })
    await click(T.saveDraft)
    await screen.findByText(`* ${T.nameRequired}`)
  })
})

describe('TEAM-004 saved application', () => {
  const team = (
    status = 'DRAFT',
    extra: Record<string, unknown> = {},
    leader = 'm9',
  ) =>
    teamDetail(
      {
        status,
        source: 'SELF',
        leaderMembershipId: leader,
        version: '2',
        ...extra,
      },
      [
        tmember('501', 'm9', '송예림', { isLeader: leader === 'm9' }),
        tmember('502', '22', '김도윤', {
          participationStatus: 'APPLIED',
          isLeader: leader === '22',
        }),
      ],
      {
        candidateSongs: [
          {
            id: '302',
            performanceId: '31',
            title: '후보 곡',
            artist: '아티스트',
            status: 'PROPOSED',
            assignedTeamId: null,
            setlistOrder: null,
            version: '1',
          },
        ],
      },
    )
  const openEdit = (
    t: () => Response,
    extra: Parameters<typeof open>[2] = {},
    p: () => Response = OPEN,
  ) =>
    open(`${APPLY}?teamId=201`, 'MEMBER', {
      [`GET ${PERF}`]: p,
      [`GET ${T201}`]: t,
      ...extra,
    })

  it('renames on 임시 저장 and keeps editing', async () => {
    const { fetchMock } = openEdit(() => team(), {
      [`PATCH ${T201}`]: () => json({ id: '201', version: '3' }),
    })
    const name = await screen.findByRole('textbox', { name: T.nameLabel })
    expect(screen.getByText('나')).toBeTruthy()
    // Only the member the server marks APPLIED shows the hint (송예림 is APPROVED).
    expect(screen.getAllByText(T.willApply)).toHaveLength(1)
    fireEvent.change(name, { target: { value: ' 새 팀 ' } })
    await click(T.saveDraft)
    await screen.findByText(T.draftSaved)
    expect(body(fetchMock, T201)).toEqual({ version: '2', name: '새 팀' })
  })

  it('clears the name error of a saved application once the name is edited', async () => {
    openEdit(() => team(), {
      [`PATCH ${T201}`]: () =>
        reasoned('VALIDATION_ERROR', 400, 'NAME_REQUIRED'),
    })
    const name = await screen.findByRole('textbox', { name: T.nameLabel })
    fireEvent.change(name, { target: { value: '새 이름' } })
    await click(T.saveDraft)
    await screen.findByText(`* ${T.nameRequired}`)
    fireEvent.change(name, { target: { value: '새 이름 2' } })
    await waitFor(() =>
      expect(screen.queryByText(`* ${T.nameRequired}`)).toBeNull(),
    )
  })

  it('submits after a confirmation that summarizes members and songs', async () => {
    const { fetchMock } = openEdit(() => team(), {
      [`POST ${T201}/submit`]: () => mutation('3', { status: 'SUBMITTED' }),
    })
    await click(T.submit)
    await screen.findByText(new RegExp(T.submitSummary(2, 1)))
    expect(callsTo(fetchMock, `${T201}/submit`)).toHaveLength(0)
    await clickLast(T.submit)
    await screen.findByText(T.submitted)
    expect(body(fetchMock, `${T201}/submit`)).toEqual({ version: '2' })
  })

  it('keeps 제출 off while the typed name is not saved yet', async () => {
    openEdit(() => team())
    const name = await screen.findByRole('textbox', { name: T.nameLabel })
    const submit = () =>
      screen.getByRole('button', { name: T.submit }) as HTMLButtonElement
    expect(submit().disabled).toBe(false)
    fireEvent.change(name, { target: { value: '다른 이름' } })
    expect(submit().disabled).toBe(true)
  })

  it('shows the application of a finished performance as a record only', async () => {
    openEdit(
      () => team(),
      {},
      () => withTeamPolicy('OPEN', { status: 'FINISHED' }),
    )
    await screen.findByText('나')
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
    expect(screen.queryByRole('textbox', { name: T.nameLabel })).toBeNull()
  })

  it('does not submit when the confirmation is cancelled', async () => {
    const { fetchMock } = openEdit(() => team())
    await click(T.submit)
    await clickLast(T.cancel)
    await waitFor(() => expect(screen.queryByText(T.submitTitle)).toBeNull())
    expect(callsTo(fetchMock, `${T201}/submit`)).toHaveLength(0)
  })

  it('changes a part, the leader and removes a member at once', async () => {
    const { fetchMock } = openEdit(() => team(), {
      [`PATCH ${T201}/members/502`]: () => mutation('3'),
      [`PUT ${T201}/leader`]: () => json({ id: '201', version: '3' }),
      [`DELETE ${T201}/members/502`]: () => mutation('3'),
    })
    fireEvent.change(await screen.findByLabelText(T.pickerPart('김도윤')), {
      target: { value: '4' },
    })
    await screen.findByText(T.partChanged)
    expect(body(fetchMock, `${T201}/members/502`)).toEqual({
      version: '2',
      partId: '4',
    })

    await menuItem(`김도윤 ${T.rowMenu}`, T.makeLeader)
    await waitFor(() =>
      expect(body(fetchMock, `${T201}/leader`)).toEqual({
        version: '2',
        leaderMembershipId: '22',
      }),
    )
    await menuItem(`김도윤 ${T.rowMenu}`, T.removeMember)
    await waitFor(() =>
      expect(
        callsTo(fetchMock, `${T201}/members/502`).map(([, i]) => i?.method),
      ).toContain('DELETE'),
    )
    // The requester has no menu: leaving takes 신청서 삭제 (UI-17).
    expect(screen.queryByLabelText(`송예림 ${T.rowMenu}`)).toBeNull()
  })

  it('deletes the draft as a withdrawal after a confirmation', async () => {
    const { fetchMock } = openEdit(() => team(), {
      [`POST ${T201}/withdraw`]: () => mutation('3', { status: 'WITHDRAWN' }),
    })
    await click(T.deleteDraft)
    await screen.findByText(T.withdrawApplyBody)
    await clickLast(T.withdrawAction)
    await screen.findByText(T.withdrawn)
    expect(body(fetchMock, `${T201}/withdraw`)).toEqual({ version: '2' })
  })

  it('locks the form once submitted: only 제출 취소 and 신청 철회 remain', async () => {
    const { fetchMock } = openEdit(() => team('SUBMITTED'), {
      [`POST ${T201}/unsubmit`]: () => mutation('3'),
    })
    await screen.findByText(T.statusSubmitted)
    expect(screen.queryByRole('textbox', { name: T.nameLabel })).toBeNull()
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
    expect(screen.queryByText(`+ ${T.addMember}`)).toBeNull()
    expect(screen.getByRole('button', { name: T.withdrawApply })).toBeTruthy()
    await click(T.unsubmit)
    await screen.findByText(T.unsubmitted)
    expect(body(fetchMock, `${T201}/unsubmit`)).toEqual({ version: '2' })
  })

  it('shows the rejection reason and reopens the application', async () => {
    const { fetchMock } = openEdit(
      () => team('REJECTED', { rejectReason: '편성이 맞지 않아요.' }),
      { [`POST ${T201}/reopen`]: () => mutation('3') },
    )
    await screen.findByText(T.statusRejected('편성이 맞지 않아요.'))
    await click(T.menuReopen)
    await screen.findByText(T.reopened)
    expect(body(fetchMock, `${T201}/reopen`)).toEqual({ version: '2' })
  })

  it('shows only the status to a member who is not the leader', async () => {
    openEdit(() => team('DRAFT', {}, '22'))
    await screen.findByText(/작성 중/)
    await screen.findByText('후보 곡')
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
    expect(screen.queryByRole('textbox', { name: T.nameLabel })).toBeNull()
  })

  it('links to the song form while proposals are open, else explains', async () => {
    openEdit(() => team())
    expect(
      (await screen.findByText(`+ ${T.addSong}`))
        .closest('a')
        ?.getAttribute('href'),
    ).toBe('/clubs/10/performances/31/songs/new?teamId=201')
  })

  it('explains that songs cannot be proposed when proposals are closed', async () => {
    openEdit(
      () => team(),
      {},
      () => withTeamPolicy('OPEN', {}, { candidateState: 'CLOSED' }),
    )
    await screen.findByText(T.songsClosed)
    expect(screen.queryByText(`+ ${T.addSong}`)).toBeNull()
  })

  it('opens the 404 view for an application the requester may not see', async () => {
    openEdit(() => apiError('NOT_FOUND', 404))
    await screen.findByText('페이지를 찾을 수 없어요')
  })
})
