import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import { apiError, callsTo, findScreen, setupDom } from '../../test/harness'
import { PERF } from '../performance/viewTestKit'
import { TEAM_COPY as T } from './teamCopy'
import {
  body,
  card,
  click,
  clickLast,
  lastQuery,
  mutation,
  open,
  stubAnimations,
  teamDetail,
  teamPage,
  TEAMS,
  tmember,
  withTeamPolicy,
} from './teamTestKit'

setupDom()
beforeEach(stubAnimations)

const URL = '/clubs/10/performances/31/teams/review'
const T401 = `${TEAMS}/401`
const SUBMITTED = card('401', '신청 팀', {
  status: 'SUBMITTED',
  source: 'SELF',
  candidateSongCount: 2,
  version: '5',
})
const DETAIL = () =>
  teamDetail(
    {
      id: '401',
      name: '신청 팀',
      status: 'SUBMITTED',
      source: 'SELF',
      version: '5',
    },
    [
      tmember('601', '21', '정규채', { isLeader: true }),
      tmember('602', '22', '김도윤', {
        participationStatus: 'APPLIED',
        partName: '기타',
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
const openReview = (extra: Parameters<typeof open>[2] = {}) =>
  open(URL, 'CLUB_ADMIN', {
    [`GET ${TEAMS}`]: () => teamPage([SUBMITTED]),
    [`GET ${T401}`]: DETAIL,
    ...extra,
  })

describe('TEAM-005', () => {
  it('lists the submitted teams with the applied count and opens the details', async () => {
    const { fetchMock } = openReview()
    await findScreen('TEAM-005')
    await screen.findByText('신청 팀')
    expect(lastQuery(fetchMock, TEAMS).get('status')).toBe('SUBMITTED')
    await screen.findByText(/팀원 2명 · 신청 곡 2곡 · 참여 희망 1명 포함/)

    await click(T.expand)
    await screen.findByText('김도윤')
    expect(screen.getByText(T.appliedBadge)).toBeTruthy()
    expect(screen.getByText('후보 곡 - 아티스트')).toBeTruthy()
    expect(screen.getByRole('button', { name: T.collapse })).toBeTruthy()
  })

  it('lists the oldest submission first and shows the submission date', async () => {
    const mk = (id: string, name: string, at: string) =>
      card(id, name, { status: 'SUBMITTED', source: 'SELF', submittedAt: at })
    openReview({
      [`GET ${TEAMS}`]: () =>
        teamPage([
          mk('402', '나중 팀', '2026-10-09T10:00:00+09:00'),
          mk('401', '먼저 팀', '2026-10-03T10:00:00+09:00'),
        ]),
      [`GET ${TEAMS}/402`]: DETAIL,
    })
    await screen.findByText('먼저 팀')
    const names = screen
      .getAllByText(/^(먼저|나중) 팀$/)
      .map((e) => e.textContent)
    expect(names).toEqual(['먼저 팀', '나중 팀'])
    expect(screen.getAllByText(/제출 2026/).length).toBe(2)
  })

  it('keeps the server order when a team has no submission time', async () => {
    openReview({
      [`GET ${TEAMS}`]: () =>
        teamPage([
          card('402', '나중 팀', {
            status: 'SUBMITTED',
            submittedAt: '2026-10-09T10:00:00+09:00',
          }),
          card('401', '먼저 팀', { status: 'SUBMITTED' }),
        ]),
      [`GET ${TEAMS}/402`]: DETAIL,
    })
    await screen.findByText('먼저 팀')
    expect(
      screen.getAllByText(/^(먼저|나중) 팀$/).map((e) => e.textContent),
    ).toEqual(['나중 팀', '먼저 팀'])
  })

  it('shows the empty state', async () => {
    openReview({ [`GET ${TEAMS}`]: () => teamPage([]) })
    await screen.findByText(T.emptyReview)
  })

  it('approves after a confirmation that counts the applied members', async () => {
    const { fetchMock } = openReview({
      [`POST ${T401}/approve`]: () => mutation('6', { status: 'APPROVED' }),
    })
    await screen.findByText(/참여 희망 1명 포함/)
    await click(T.approve)
    await screen.findByText(T.approveBody(1))
    expect(callsTo(fetchMock, `${T401}/approve`)).toHaveLength(0)
    await clickLast(T.approve)
    await screen.findByText(T.approved)
    expect(body(fetchMock, `${T401}/approve`)).toEqual({ version: '5' })
  })

  it('keeps 승인 off until the team detail has arrived', async () => {
    let release: (() => void) | null = null
    openReview({
      [`GET ${T401}`]: () =>
        new Promise((resolve) => {
          release = () => resolve(DETAIL())
        }),
    })
    const approve = async () =>
      (await screen.findByRole('button', {
        name: T.approve,
      })) as HTMLButtonElement
    expect((await approve()).disabled).toBe(true)
    await waitFor(() => expect(release).not.toBeNull())
    release!()
    await screen.findByText(/참여 희망 1명 포함/)
    expect((await approve()).disabled).toBe(false)
  })

  it('does not approve when the confirmation is cancelled', async () => {
    const { fetchMock } = openReview()
    await screen.findByText(/참여 희망 1명 포함/)
    await click(T.approve)
    await clickLast(T.cancel)
    await waitFor(() => expect(screen.queryByText(T.approveBody(1))).toBeNull())
    expect(callsTo(fetchMock, `${T401}/approve`)).toHaveLength(0)
  })

  it('rejects only with a reason', async () => {
    const { fetchMock } = openReview({
      [`POST ${T401}/reject`]: () => mutation('6', { status: 'REJECTED' }),
    })
    await screen.findByText('신청 팀')
    await click(T.reject)
    const reason = await screen.findByRole('textbox', { name: T.rejectTitle })
    const submit = screen.getAllByRole('button', { name: T.reject }).at(-1)
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(reason, {
      target: { value: '편성이 맞지 않아 거절합니다.' },
    })
    await clickLast(T.reject)
    await screen.findByText(T.rejected)
    expect(body(fetchMock, `${T401}/reject`)).toEqual({
      version: '5',
      reason: '편성이 맞지 않아 거절합니다.',
      confirmed: false,
    })
  })

  it('asks again when selected songs are in the team scope, then repeats with confirmed', async () => {
    let calls = 0
    const { fetchMock } = openReview({
      [`POST ${T401}/reject`]: () => {
        calls++
        return calls === 1
          ? new Response(
              JSON.stringify({
                error: {
                  code: 'CONFIRMATION_REQUIRED',
                  message: 'x',
                  details: [
                    {
                      reason: 'CONFIRMED_SONGS_IN_TEAM_SCOPE',
                      message: '선정된 곡 1곡이 이 팀 범위예요.',
                    },
                  ],
                },
              }),
              { status: 409 },
            )
          : mutation('6', { status: 'REJECTED' })
      },
    })
    await screen.findByText('신청 팀')
    await click(T.reject)
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.rejectTitle }),
      {
        target: { value: '사유' },
      },
    )
    await clickLast(T.reject)
    await screen.findByText('선정된 곡 1곡이 이 팀 범위예요.')
    await clickLast(COPY.proceed)
    await screen.findByText(T.rejected)
    const sent = callsTo(fetchMock, `${T401}/reject`).map(([, i]) =>
      JSON.parse(String(i?.body)),
    )
    expect(sent).toEqual([
      { version: '5', reason: '사유', confirmed: false },
      { version: '5', reason: '사유', confirmed: true },
    ])
  })

  it('does not reject when the confirmation is declined', async () => {
    const { fetchMock } = openReview({
      [`POST ${T401}/reject`]: () => apiError('CONFIRMATION_REQUIRED', 409),
    })
    await screen.findByText('신청 팀')
    await click(T.reject)
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.rejectTitle }),
      {
        target: { value: '사유' },
      },
    )
    await clickLast(T.reject)
    await clickLast(COPY.cancel)
    await waitFor(() =>
      expect(screen.queryByText(COPY.confirmTitle)).toBeNull(),
    )
    expect(callsTo(fetchMock, `${T401}/reject`)).toHaveLength(1)
  })

  it('disables the decisions while the performance is not ACTIVE', async () => {
    openReview({
      [`GET ${PERF}`]: () => withTeamPolicy('OPEN', { status: 'LOCKED' }),
    })
    await screen.findByText(T.reviewNotActive)
    expect(
      (screen.getByRole('button', { name: T.approve }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: T.reject }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('shows the version-conflict dialog when the team changed meanwhile', async () => {
    openReview({
      [`POST ${T401}/approve`]: () => apiError('VERSION_CONFLICT', 409),
    })
    await screen.findByText(/참여 희망 1명 포함/)
    await click(T.approve)
    await clickLast(T.approve)
    await screen.findByText(COPY.versionConflictTitle)
  })
})
