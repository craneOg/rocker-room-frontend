import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import {
  freezeToday,
  ONE,
  SCH,
  detailOf,
  openSchedule,
  overlap,
} from './scheduleTestKit'
import { SCHEDULE_COPY as T } from './scheduleCopy'

setupDom()
beforeEach(freezeToday)
afterEach(() => vi.useRealTimers())

const NEW = '/clubs/10/performances/31/schedules/new'
const EDIT = '/clubs/10/performances/31/schedules/401/edit'
const VALIDATE = `${SCH}/validate`

const preview =
  (warnings: unknown[] = []): Route =>
  () =>
    json({
      hardErrors: [],
      warnings,
      participants: [
        { membershipId: 'm7', displayName: '정규채' },
        { membershipId: 'm1', displayName: '송예림' },
      ],
    })

const rules = (extra: Record<string, Route> = {}) => ({
  [`POST ${VALIDATE}`]: preview(),
  [`GET ${SCH}`]: () =>
    json({
      items: [
        { id: '1', location: '합주실 B', startAt: '2026-10-01T10:00:00+09:00' },
        { id: '2', location: '합주실 A', startAt: '2026-10-10T10:00:00+09:00' },
        { id: '3', location: null, startAt: '2026-10-11T10:00:00+09:00' },
      ],
    }),
  ...extra,
})

const openNew = async (extra: Record<string, Route> = {}, path = NEW) => {
  const opened = openSchedule(path, 'CLUB_ADMIN', rules(extra))
  await findScreen('SCHD-003')
  await screen.findByRole('button', { name: 'Crane Team' })
  return opened
}
const pick = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))
const select = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const saveButton = () =>
  screen.getByRole('button', { name: T.save }) as HTMLButtonElement

describe('SCHD-003 ScheduleForm (create)', () => {
  it('starts as a tentative practice from 19:00 to 21:00 and cannot save without a target', async () => {
    await openNew()
    expect(
      (screen.getByLabelText(T.startField) as HTMLSelectElement).value,
    ).toBe('19:00')
    expect((screen.getByLabelText(T.endField) as HTMLSelectElement).value).toBe(
      '21:00',
    )
    expect(
      (screen.getByLabelText(T.statusTentative) as HTMLInputElement).checked,
    ).toBe(true)
    expect(screen.getByText(`* ${T.targetRequired}`)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('blocks an end that is not later than the start', async () => {
    await openNew()
    pick('Crane Team')
    expect(saveButton().disabled).toBe(false)
    select(T.endField, '19:00')
    await screen.findByText(`* ${T.endBeforeStart}`)
    expect(saveButton().disabled).toBe(true)
  })

  it('previews attendees and overlaps from the server and sends the full body on save', async () => {
    const { fetchMock, router } = await openNew({
      [`POST ${VALIDATE}`]: preview([
        overlap,
        {
          type: 'OVERLAP_OTHER_CLUB',
          startAt: '2026-10-15T19:30:00+09:00',
          endAt: '2026-10-15T21:00:00+09:00',
          message: '다른 일정 있음',
          participants: [{ membershipId: 'm1', displayName: '송예림' }],
        },
        { type: 'OUT_OF_SEASON', message: 'x' },
      ]),
      [`POST ${SCH}`]: () =>
        json(
          {
            resource: { ...detailOf().schedule, id: '500' },
            warnings: [overlap],
          },
          201,
        ),
      [`GET ${SCH}/500`]: () => json(detailOf({ id: '500' })),
      [`GET ${SCH}/500/conflicts`]: () => json({ items: [] }),
    })
    pick('Crane Team')
    pick('선정 곡')
    pick('리허설')
    select(T.startField, '18:30')
    select(T.endField, '20:00')
    fireEvent.change(screen.getByLabelText(T.dateField), {
      target: { value: '2026-10-20' },
    })
    fireEvent.click(screen.getByLabelText(T.statusConfirmed))
    fireEvent.change(screen.getByLabelText(T.locationField), {
      target: { value: '합주실 C' },
    })
    fireEvent.change(screen.getByLabelText(T.memoField), {
      target: { value: '  메모  ' },
    })
    await screen.findByText(T.attendees(2))
    await screen.findByText('정규채 · 밴드 합주 19:00~20:00와 겹쳐요')
    expect(screen.getByText('송예림 · 다른 일정 있음 19:30~21:00')).toBeTruthy()
    expect(screen.getByText(T.outOfSeason)).toBeTruthy()

    fireEvent.click(saveButton())
    await screen.findByText(T.saved)
    expect(body(fetchMock, SCH)).toEqual({
      eventType: 'REHEARSAL',
      status: 'CONFIRMED',
      startAt: '2026-10-20T18:30:00+09:00',
      endAt: '2026-10-20T20:00:00+09:00',
      title: null,
      location: '합주실 C',
      memo: '메모',
      forAllParticipants: false,
      teamIds: ['101'],
      songIds: ['302'],
    })
    // saved: lands on the detail with the saved warnings as a banner (COM-003 #4)
    await findScreen('SCHD-002')
    expect(router.state.location.pathname).toBe(
      '/clubs/10/performances/31/schedules/500',
    )
    await screen.findByText('정규채 · 밴드 합주 19:00~20:00와 겹쳐요')
  })

  it('a bare-string warning of the save response still reaches the banner', async () => {
    await openNew({
      [`POST ${SCH}`]: () =>
        json(
          { resource: detailOf().schedule, warnings: ['문자열 경고예요'] },
          201,
        ),
      [`GET ${ONE}`]: () => json(detailOf()),
      [`GET ${ONE}/conflicts`]: () => json({ items: [] }),
    })
    pick('Crane Team')
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await findScreen('SCHD-002')
    await screen.findByText('문자열 경고예요')
  })

  it('"all participants" hides teams and songs and sends empty lists', async () => {
    const { fetchMock } = await openNew({
      [`POST ${SCH}`]: () =>
        json({ resource: detailOf().schedule, warnings: [] }, 201),
      [`GET ${ONE}`]: () => json(detailOf()),
      [`GET ${ONE}/conflicts`]: () => json({ items: [] }),
    })
    pick('Crane Team')
    fireEvent.click(screen.getByLabelText(T.forAll))
    expect(screen.queryByRole('button', { name: 'Crane Team' })).toBeNull()
    fireEvent.change(screen.getByLabelText(T.titleField), {
      target: { value: ' 전체 합주 ' },
    })
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    fireEvent.click(saveButton())
    await screen.findByText(T.saved)
    expect(body(fetchMock, SCH)).toMatchObject({
      title: '전체 합주',
      forAllParticipants: true,
      teamIds: [],
      songIds: [],
    })
  })

  it('offers the three latest places as chips', async () => {
    await openNew()
    const place = screen.getByLabelText(T.locationField) as HTMLInputElement
    // the most recent first, without duplicates or empty places
    const chips = screen
      .getByRole('group', { name: T.recentLocations })
      .querySelectorAll('button')
    expect([...chips].map((b) => b.textContent)).toEqual([
      '합주실 A',
      '합주실 B',
    ])
    fireEvent.click(chips[1] as HTMLElement)
    expect(place.value).toBe('합주실 B')
  })

  it('prefills type, time and teams from the query (AVAIL-002 / AUDI-002)', async () => {
    await openNew(
      {},
      `${NEW}?eventType=AUDITION&date=2026-10-22&start=14:00&end=15:30&teamIds=101`,
    )
    expect(
      screen
        .getByRole('button', { name: '오디션' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect((screen.getByLabelText(T.dateField) as HTMLInputElement).value).toBe(
      '2026-10-22',
    )
    expect(
      (screen.getByLabelText(T.startField) as HTMLSelectElement).value,
    ).toBe('14:00')
    expect(
      screen
        .getByRole('button', { name: 'Crane Team' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(saveButton().disabled).toBe(false)
  })

  const q = (query: string) => openNew({}, `${NEW}?${query}`)
  const field = (l: string) =>
    (screen.getByLabelText(l) as HTMLInputElement | HTMLSelectElement).value

  it('prefills from startAt / endAt (AVAIL links), rounding to the half hour', async () => {
    await q(
      'startAt=2026-10-22T14:10:00%2B09:00&endAt=2026-10-22T15:50:00%2B09:00&songIds=301',
    )
    expect(field(T.dateField)).toBe('2026-10-22')
    expect(field(T.startField)).toBe('14:00')
    expect(field(T.endField)).toBe('16:00')
  })

  it('cuts an end on a later day to 23:30 and ignores malformed times', async () => {
    await q(
      'startAt=2026-10-22T22:00:00%2B09:00&endAt=2026-10-23T02:00:00%2B09:00',
    )
    expect(field(T.endField)).toBe('23:30')
    expect(field(T.startField)).toBe('22:00')
  })

  it('ignores a bad or backwards startAt / endAt', async () => {
    await q('startAt=soon&endAt=2026-10-22T15:00:00%2B09:00')
    expect(field(T.startField)).toBe('19:00')
    expect(field(T.endField)).toBe('21:00')
  })

  it('ignores an end that is not after the start', async () => {
    await q(
      'startAt=2026-10-22T15:00:00%2B09:00&endAt=2026-10-22T14:00:00%2B09:00',
    )
    expect(field(T.startField)).toBe('19:00')
    expect(field(T.endField)).toBe('21:00')
  })

  it('date / start / end win over startAt / endAt', async () => {
    await q(
      'date=2026-10-25&start=10:00&startAt=2026-10-22T14:00:00%2B09:00&endAt=2026-10-22T15:00:00%2B09:00',
    )
    expect(field(T.dateField)).toBe('2026-10-25')
    expect(field(T.startField)).toBe('10:00')
    expect(field(T.endField)).toBe('15:00')
  })

  it('forAllParticipants=true preselects everyone unless teams or songs come too', async () => {
    openSchedule(`${NEW}?forAllParticipants=true`, 'CLUB_ADMIN', rules())
    await findScreen('SCHD-003')
    await screen.findByLabelText(T.forAll)
    expect((screen.getByLabelText(T.forAll) as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('teams in the query win over forAllParticipants', async () => {
    await q('forAllParticipants=true&teamIds=101')
    expect((screen.getByLabelText(T.forAll) as HTMLInputElement).checked).toBe(
      false,
    )
    expect(
      screen
        .getByRole('button', { name: 'Crane Team' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('the preview is not asked for before a target is chosen', async () => {
    const { fetchMock } = await openNew()
    expect(callsTo(fetchMock, VALIDATE)).toHaveLength(0)
    pick('Crane Team')
    await screen.findByText(T.attendees(2))
    expect(callsTo(fetchMock, VALIDATE).length).toBeGreaterThan(0)
  })

  it('hard errors of the check ({type, message}) show their message and block the save', async () => {
    await openNew({
      [`POST ${VALIDATE}`]: () =>
        json({
          hardErrors: [
            { type: 'SCHEDULE_TARGET_EMPTY', message: '참석 대상이 없습니다.' },
            { type: 'SOMETHING_NEW', message: '처음 보는 사유예요' },
            '문자열도 읽어요',
          ],
          warnings: [],
          participants: [],
        }),
    })
    pick('Crane Team')
    await screen.findByText('참석 대상이 없습니다.')
    expect(screen.getByText('처음 보는 사유예요')).toBeTruthy()
    expect(screen.getByText('문자열도 읽어요')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('an empty confirmed target on save is a rule violation with its own copy', async () => {
    await openNew({
      [`POST ${SCH}`]: () =>
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
    })
    pick('Crane Team')
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await screen.findByText(COPY.ruleViolationTitle)
    expect(screen.getByText(T.targetEmptyRule)).toBeTruthy()
  })

  it('a field error of the server shows under the title', async () => {
    await openNew({
      [`POST ${SCH}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'x',
              details: [{ field: 'title', message: '100자 이하로 써 주세요' }],
            },
          }),
          { status: 400 },
        ),
    })
    pick('Crane Team')
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await screen.findByText('* 100자 이하로 써 주세요')
  })

  it('a finished or canceled performance takes no schedule (E-01)', async () => {
    openSchedule(NEW, 'CLUB_ADMIN', {
      ...rules(),
      [`GET ${PERF}`]: () =>
        json({
          performance: {
            id: '31',
            clubId: '10',
            title: '지난 공연',
            performDate: null,
            location: null,
            preset: 'TEAM_FIRST',
            status: 'FINISHED',
            createdByUserId: '1',
            version: '8',
            createdAt: '2026-10-01T12:00:00+09:00',
            updatedAt: '2026-10-01T12:00:00+09:00',
          },
          policy: {},
        }),
    })
    await findScreen('SCHD-003')
    await screen.findByText(T.endedPerformance)
    expect(screen.queryByRole('button', { name: T.save })).toBeNull()
  })

  it('a member cannot open the form', async () => {
    const { router } = openSchedule(NEW, 'MEMBER', rules())
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10'),
    )
    expect(document.querySelector('[data-screen-id="SCHD-003"]')).toBeNull()
  })
})

describe('SCHD-003 ScheduleForm (edit)', () => {
  const openEdit = async (
    schedule: Record<string, unknown> = {},
    extra: Record<string, Route> = {},
  ) => {
    const opened = openSchedule(
      EDIT,
      'CLUB_ADMIN',
      rules({
        [`GET ${ONE}`]: () =>
          json(detailOf({ status: 'TENTATIVE', ...schedule })),
        [`GET ${ONE}/conflicts`]: () => json({ items: [] }),
        ...extra,
      }),
    )
    await findScreen('SCHD-003')
    await screen.findByDisplayValue('정기 합주')
    await screen.findByRole('button', { name: 'Crane Team' })
    return opened
  }
  const patched = (status: string) => () =>
    json({
      resource: { ...detailOf().schedule, status, version: '4' },
      warnings: [],
    })

  it('fills the form from the schedule and patches without the status', async () => {
    const { fetchMock } = await openEdit(
      {},
      { [`PATCH ${ONE}`]: patched('TENTATIVE') },
    )
    expect(
      screen.getAllByRole('heading', { name: T.editTitle }).length,
    ).toBeGreaterThan(0)
    expect(
      (screen.getByLabelText(T.locationField) as HTMLInputElement).value,
    ).toBe('합주실 A')
    expect(
      (screen.getByLabelText(T.startField) as HTMLSelectElement).value,
    ).toBe('18:00')
    expect(
      screen
        .getByRole('button', { name: 'Crane Team' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.change(screen.getByLabelText(T.titleField), {
      target: { value: '바뀐 제목' },
    })
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await screen.findByText(T.saved)
    const sent = body(fetchMock, ONE) as Record<string, unknown>
    expect(sent).toMatchObject({
      version: '3',
      title: '바뀐 제목',
      startAt: '2026-10-15T18:00:00+09:00',
      teamIds: ['101'],
      songIds: ['301'],
    })
    expect('status' in sent).toBe(false)
    expect(callsTo(fetchMock, `${ONE}/confirm`)).toHaveLength(0)
    expect(callsTo(fetchMock, `${ONE}/unconfirm`)).toHaveLength(0)
  })

  it('tentative -> confirmed saves first, then confirms with the new version', async () => {
    const { fetchMock } = await openEdit(
      {},
      {
        [`PATCH ${ONE}`]: patched('TENTATIVE'),
        [`POST ${ONE}/confirm`]: () =>
          json({ resource: { id: '401' }, warnings: [] }),
      },
    )
    fireEvent.click(screen.getByLabelText(T.statusConfirmed))
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await screen.findByText(T.saved)
    const order = fetchMock.mock.calls
      .map(([u, i]) => `${i?.method ?? 'GET'} ${String(u).split('?')[0]}`)
      .filter((c) => c.endsWith('/401') || c.endsWith('/confirm'))
    expect(order.filter((c) => !c.startsWith('GET'))).toEqual([
      `PATCH ${ONE}`,
      `POST ${ONE}/confirm`,
    ])
    expect(body(fetchMock, `${ONE}/confirm`)).toEqual({
      version: '4',
      confirmed: false,
    })
  })

  it('confirmed -> tentative warns and then calls unconfirm', async () => {
    const { fetchMock } = await openEdit(
      { status: 'CONFIRMED' },
      {
        [`PATCH ${ONE}`]: patched('CONFIRMED'),
        [`POST ${ONE}/unconfirm`]: () =>
          json({ id: '401', status: 'TENTATIVE', version: '5' }),
      },
    )
    expect(screen.queryByText(T.unconfirmNotice)).toBeNull()
    fireEvent.click(screen.getByLabelText(T.statusTentative))
    await screen.findByText(T.unconfirmNotice)
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await screen.findByText(T.saved)
    expect(body(fetchMock, `${ONE}/unconfirm`)).toEqual({ version: '4' })
  })

  it('does not count the schedule itself as an overlap', async () => {
    await openEdit(
      {},
      {
        [`POST ${VALIDATE}`]: preview([
          { ...overlap, scheduleId: '401', title: '나 자신' },
          overlap,
        ]),
      },
    )
    await screen.findByText('정규채 · 밴드 합주 19:00~20:00와 겹쳐요')
    expect(screen.queryByText(/나 자신/)).toBeNull()
  })

  it('a version conflict on save shows the shared dialog', async () => {
    await openEdit(
      {},
      { [`PATCH ${ONE}`]: () => apiError('VERSION_CONFLICT', 409) },
    )
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await screen.findByText(COPY.versionConflictTitle)
  })

  it('a canceled schedule answers STATE_CONFLICT with the shared dialog', async () => {
    await openEdit(
      {},
      { [`PATCH ${ONE}`]: () => apiError('STATE_CONFLICT', 409) },
    )
    await screen.findByText(T.attendees(2))
    fireEvent.click(saveButton())
    await screen.findByText(COPY.stateConflictTitle)
  })
})
