import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import { body, PERF } from '../performance/viewTestKit'
import { ONE, detailOf, openSchedule, overlap } from './scheduleTestKit'
import { SCHEDULE_COPY as T } from './scheduleCopy'

setupDom()

const PATH = '/clubs/10/performances/31/schedules/401'
const show = async (
  role: 'CLUB_ADMIN' | 'MEMBER',
  schedule: Record<string, unknown> = {},
  extra: Record<string, Route> = {},
) => {
  const opened = openSchedule(PATH, role, {
    [`GET ${ONE}`]: () => json(detailOf(schedule)),
    [`GET ${ONE}/conflicts`]: () => json({ items: [] }),
    ...extra,
  })
  await findScreen('SCHD-002')
  await screen.findByRole('heading', { name: '정기 합주' })
  return opened
}
const inDialog = (name: string) =>
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) as HTMLElement)
const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent)

describe('SCHD-002 ScheduleDetail', () => {
  it('shows header, time, place, target chips, attendees and memo to a member', async () => {
    await show('MEMBER')
    expect(screen.getByText('확정')).toBeTruthy()
    expect(screen.getByText('합주')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '가을 정기공연' }).getAttribute('href'),
    ).toBe('/clubs/10/performances/31')
    expect(screen.getByText('10.15(목) 18:00 ~ 20:00 (2시간)')).toBeTruthy()
    expect(screen.getByText('합주실 A')).toBeTruthy()
    // names come from the team / song lists, and chips lead to their details
    const team = await screen.findByRole('link', { name: 'Crane Team' })
    expect(team.getAttribute('href')).toBe(
      '/clubs/10/performances/31/teams/101',
    )
    expect(
      screen.getByRole('link', { name: '후보 곡' }).getAttribute('href'),
    ).toBe('/clubs/10/performances/31/songs/301')
    expect(screen.getByText('개인 악기를 준비해 주세요.')).toBeTruthy()
    // I am first and called "나"; guest and support players are badged
    const people = screen.getByRole('region', { name: T.attendees(3) })
    const names = within(people)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(names[0]).toContain(T.me)
    expect(names[1]).toContain('정규채')
    expect(names[1]).toContain('객원')
    expect(names[2]).toContain('지원')
    expect(buttons()).not.toContain(T.confirmButton)
    expect(screen.queryByText(T.editButton)).toBeNull()
  })

  it('says everyone for an all-participants schedule and none for a missing place', async () => {
    await show('MEMBER', { forAllParticipants: true, location: null })
    expect(screen.getByText(T.targetAll)).toBeTruthy()
    expect(screen.getByText(T.locationNone)).toBeTruthy()
  })

  it('lists the conflicts the server reports', async () => {
    await show(
      'MEMBER',
      {},
      {
        [`GET ${ONE}/conflicts`]: () =>
          json({
            items: [
              overlap,
              { type: 'PART_SHORTAGE', message: '드럼이 1명 부족합니다.' },
            ],
          }),
      },
    )
    await screen.findByText('정규채 · 밴드 합주 19:00~20:00와 겹쳐요')
    expect(screen.getByText('드럼이 1명 부족합니다.')).toBeTruthy()
  })

  it('an officer confirms a tentative schedule after the dialog, sending its version', async () => {
    const { fetchMock } = await show(
      'CLUB_ADMIN',
      { status: 'TENTATIVE' },
      {
        [`POST ${ONE}/confirm`]: () =>
          json({ resource: { id: '401' }, warnings: [] }),
      },
    )
    expect(buttons()).toEqual(
      expect.arrayContaining([T.confirmButton, T.editButton, T.cancelButton]),
    )
    expect(buttons()).not.toContain(T.unconfirmButton)
    fireEvent.click(screen.getByRole('button', { name: T.confirmButton }))
    await screen.findByText(T.confirmDialogTitle)
    expect(callsTo(fetchMock, `${ONE}/confirm`)).toHaveLength(0)
    inDialog(T.confirmDialogAction)
    await screen.findByText(T.confirmedToast)
    expect(body(fetchMock, `${ONE}/confirm`)).toEqual({
      version: '3',
      confirmed: false,
    })
  })

  it('declining the confirm dialog sends nothing', async () => {
    const { fetchMock } = await show('CLUB_ADMIN', { status: 'TENTATIVE' })
    fireEvent.click(screen.getByRole('button', { name: T.confirmButton }))
    await screen.findByText(T.confirmDialogTitle)
    inDialog(T.dialogCancel)
    await waitFor(() =>
      expect(screen.queryByText(T.confirmDialogTitle)).toBeNull(),
    )
    expect(callsTo(fetchMock, `${ONE}/confirm`)).toHaveLength(0)
  })

  it('CONFIRMATION_REQUIRED shows the warnings and resends with confirmed=true', async () => {
    let n = 0
    const { fetchMock } = await show(
      'CLUB_ADMIN',
      { status: 'TENTATIVE' },
      {
        [`POST ${ONE}/confirm`]: () =>
          n++ === 0
            ? new Response(
                JSON.stringify({
                  error: {
                    code: 'CONFIRMATION_REQUIRED',
                    message: 'x',
                    warnings: [
                      {
                        type: 'OVERLAP',
                        title: '밴드 합주',
                        scheduleId: '402',
                      },
                    ],
                  },
                }),
                { status: 409 },
              )
            : json({
                resource: { id: '401' },
                warnings: [{ type: 'OUT_OF_SEASON', message: 'x' }],
              }),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: T.confirmButton }))
    await screen.findByText(T.confirmDialogTitle)
    inDialog(T.confirmDialogAction)
    await screen.findByText(COPY.confirmTitle)
    expect(screen.getByText("'밴드 합주' 일정과 시간이 겹쳐요")).toBeTruthy()
    inDialog(COPY.proceed)
    await screen.findByText(T.confirmedToast)
    expect(callsTo(fetchMock, `${ONE}/confirm`)).toHaveLength(2)
    expect(body(fetchMock, `${ONE}/confirm`)).toEqual({
      version: '3',
      confirmed: true,
    })
    // the saved warning is shown as a banner (COM-003 #4)
    expect(screen.getAllByText(T.outOfSeason).length).toBeGreaterThan(0)
  })

  it('an empty target on confirm is a rule violation with its own copy', async () => {
    await show(
      'CLUB_ADMIN',
      { status: 'TENTATIVE' },
      {
        [`POST ${ONE}/confirm`]: () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'RULE_VIOLATION',
                message: 'x',
                details: [{ reason: 'SCHEDULE_TARGET_EMPTY' }],
              },
            }),
            { status: 422 },
          ),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: T.confirmButton }))
    await screen.findByText(T.confirmDialogTitle)
    inDialog(T.confirmDialogAction)
    await screen.findByText(COPY.ruleViolationTitle)
    expect(screen.getByText(T.targetEmptyRule)).toBeTruthy()
  })

  it('a confirmed schedule can go back to tentative (API-153) after a dialog', async () => {
    const { fetchMock } = await show(
      'CLUB_ADMIN',
      {},
      {
        [`POST ${ONE}/unconfirm`]: () =>
          json({ id: '401', status: 'TENTATIVE', version: '4' }),
      },
    )
    expect(buttons()).not.toContain(T.confirmButton)
    fireEvent.click(screen.getByRole('button', { name: T.unconfirmButton }))
    await screen.findByText(T.unconfirmDialogBody)
    inDialog(T.unconfirmDialogAction)
    await screen.findByText(T.unconfirmedToast)
    expect(body(fetchMock, `${ONE}/unconfirm`)).toEqual({ version: '3' })
  })

  it('cancels with the version only, after the dialog', async () => {
    const { fetchMock } = await show(
      'CLUB_ADMIN',
      {},
      {
        [`POST ${ONE}/cancel`]: () =>
          json({ resource: { id: '401' }, warnings: [] }),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: T.cancelButton }))
    await screen.findByText(T.cancelDialogBody)
    inDialog(T.cancelDialogAction)
    await screen.findByText(T.canceledToast)
    expect(body(fetchMock, `${ONE}/cancel`)).toEqual({ version: '3' })
  })

  it('a canceled schedule has no officer buttons', async () => {
    await show('CLUB_ADMIN', { status: 'CANCELED' })
    expect(screen.getByText('취소')).toBeTruthy()
    expect(buttons()).not.toContain(T.cancelButton)
    expect(buttons()).not.toContain(T.confirmButton)
    expect(buttons()).not.toContain(T.unconfirmButton)
    expect(buttons()).not.toContain(T.editButton)
  })

  it('a finished performance offers no edit (E-01)', async () => {
    await show(
      'CLUB_ADMIN',
      {},
      {
        [`GET ${PERF}`]: () =>
          json({
            performance: { ...detailPerf('FINISHED') },
            policy: {},
          }),
      },
    )
    await waitFor(() => expect(buttons()).not.toContain(T.editButton))
    expect(buttons()).toContain(T.cancelButton)
  })

  it('a version conflict shows the shared dialog', async () => {
    await show(
      'CLUB_ADMIN',
      {},
      { [`POST ${ONE}/cancel`]: () => apiError('VERSION_CONFLICT', 409) },
    )
    fireEvent.click(screen.getByRole('button', { name: T.cancelButton }))
    await screen.findByText(T.cancelDialogBody)
    inDialog(T.cancelDialogAction)
    await screen.findByText(COPY.versionConflictTitle)
  })

  it('an unknown or hidden schedule is the not-found view', async () => {
    openSchedule(PATH, 'MEMBER', {
      [`GET ${ONE}`]: () => apiError('NOT_FOUND', 404),
    })
    await screen.findByText(COPY.notFoundTitle)
  })
})

const detailPerf = (status: string) => ({
  id: '31',
  clubId: '10',
  title: '가을 정기공연',
  performDate: '2026-12-31',
  location: null,
  preset: 'TEAM_FIRST',
  status,
  createdByUserId: '1',
  version: '8',
  createdAt: '2026-10-01T12:00:00+09:00',
  updatedAt: '2026-10-08T21:10:00+09:00',
})
