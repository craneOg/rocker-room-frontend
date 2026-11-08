import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import { findScreen, json, setupDom } from '../../test/harness'
import { lastQuery, membership } from '../performance/viewTestKit'
import {
  event,
  freezeToday,
  openSchedule,
  performanceDay,
} from './scheduleTestKit'
import { SCHEDULE_COPY as T } from './scheduleCopy'

setupDom()
beforeEach(freezeToday)
afterEach(() => vi.useRealTimers())

const MINE = '/api/v1/me/calendar'
const CLUB = '/api/v1/clubs/10/calendar'
const items =
  (...e: unknown[]) =>
  () =>
    json({ items: e })

const ready = async () => {
  await findScreen('SCHD-001')
  await screen.findByRole('button', { name: T.scopeMine })
}

describe('SCHD-001 ScheduleCalendar', () => {
  it('shows my schedules first, asks for the month grid and links each event', async () => {
    const { fetchMock } = openSchedule('/calendar', 'MEMBER', {
      [`GET ${MINE}`]: items(event(), performanceDay()),
    })
    await ready()
    const chip = await screen.findByRole('link', { name: /정기 합주/ })
    expect(chip.getAttribute('href')).toBe(
      '/clubs/10/performances/31/schedules/401',
    )
    expect(
      screen
        .getByRole('link', { name: /공연 · 가을 정기공연/ })
        .getAttribute('href'),
    ).toBe('/clubs/10/performances/31')
    expect(screen.getByText('10.15(목)')).toBeTruthy()
    // Sunday-first grid of October 2026 (UI-18).
    const q = lastQuery(fetchMock, MINE)
    expect(q.get('from')).toBe('2026-09-27T00:00:00+09:00')
    expect(q.get('to')).toBe('2026-10-31T23:59:59+09:00')
    expect(q.has('includeCanceled')).toBe(false)
    expect(screen.getByText('2026년 10월')).toBeTruthy()
  })

  it('moves by month and returns to today', async () => {
    const { fetchMock } = openSchedule('/calendar', 'MEMBER', {
      [`GET ${MINE}`]: items(event()),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: `${T.next} ›` }))
    await screen.findByText('2026년 11월')
    await waitFor(() =>
      expect(lastQuery(fetchMock, MINE).get('from')).toBe(
        '2026-11-01T00:00:00+09:00',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: T.today }))
    await screen.findByText('2026년 10월')
  })

  it('month view lists the picked day under the grid; week view lists seven days', async () => {
    openSchedule('/calendar', 'MEMBER', {
      [`GET ${MINE}`]: items(
        event(),
        event({
          id: '402',
          title: '다음 날',
          startAt: '2026-10-16T18:00:00+09:00',
        }),
      ),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: T.viewMonth }))
    const cell = await screen.findByRole('gridcell', { name: '10.15(목) 1건' })
    expect(within(cell).getByText('1')).toBeTruthy()
    fireEvent.click(screen.getByRole('gridcell', { name: '10.16(금) 1건' }))
    await screen.findByRole('link', { name: /다음 날/ })
    expect(screen.queryByRole('link', { name: /정기 합주/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: T.viewWeek }))
    // 2026-10-11 (Sun) .. 10-17 (Sat)
    await screen.findByText('10.11(일)')
    expect(screen.getByText('10.17(토)')).toBeTruthy()
    expect(screen.getAllByText(T.emptyDay).length).toBe(5)
  })

  it('marks tentative with a dashed chip and a tag, and canceled with a strike', async () => {
    openSchedule('/clubs/10/performances/31/schedules', 'CLUB_ADMIN', {
      [`GET ${CLUB}`]: items(
        event({ id: '1', title: '임시 일정', status: 'TENTATIVE' }),
        event({ id: '2', title: '취소 일정', status: 'CANCELED' }),
      ),
    })
    await findScreen('SCHD-001')
    const tentative = await screen.findByRole('link', { name: /임시 일정/ })
    expect(tentative.className).toContain('is-tentative')
    expect(within(tentative).getByText(T.tentativeTag)).toBeTruthy()
    expect(screen.getByRole('link', { name: /취소 일정/ }).className).toContain(
      'is-canceled',
    )
  })

  it('the performance entry opens the club view filtered by that performance', async () => {
    const { fetchMock } = openSchedule(
      '/clubs/10/performances/31/schedules',
      'MEMBER',
      { [`GET ${CLUB}`]: items(event()) },
    )
    await findScreen('SCHD-001')
    await screen.findByRole('link', { name: /정기 합주/ })
    const q = lastQuery(fetchMock, CLUB)
    expect(q.get('performanceId')).toBe('31')
    expect(
      screen
        .getByRole('button', { name: T.scopeClub })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes(MINE))).toBe(
      false,
    )
  })

  it('club view: an officer asks for tentative by default, a member never does', async () => {
    const admin = openSchedule('/calendar', 'CLUB_ADMIN', {
      [`GET ${MINE}`]: items(),
      [`GET ${CLUB}`]: items(event()),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: T.scopeClub }))
    await screen.findByRole('link', { name: /정기 합주/ })
    expect(lastQuery(admin.fetchMock, CLUB).get('includeTentative')).toBe(
      'true',
    )
    fireEvent.click(screen.getByLabelText(T.showTentative))
    await waitFor(() =>
      expect(lastQuery(admin.fetchMock, CLUB).has('includeTentative')).toBe(
        false,
      ),
    )
  })

  it('club view for a member: no tentative toggle, no add button', async () => {
    const { fetchMock } = openSchedule('/calendar', 'MEMBER', {
      [`GET ${MINE}`]: items(),
      [`GET ${CLUB}`]: items(event()),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: T.scopeClub }))
    await screen.findByRole('link', { name: /정기 합주/ })
    expect(screen.queryByLabelText(T.showTentative)).toBeNull()
    expect(screen.queryByRole('link', { name: T.addSchedule })).toBeNull()
    expect(lastQuery(fetchMock, CLUB).has('includeTentative')).toBe(false)
  })

  it('club view filters: canceled, type and performance reach the query', async () => {
    const { fetchMock } = openSchedule('/calendar', 'MEMBER', {
      [`GET ${MINE}`]: items(),
      [`GET ${CLUB}`]: items(),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: T.scopeClub }))
    await screen.findByText(T.empty)
    fireEvent.click(screen.getByLabelText(T.showCanceled))
    fireEvent.click(
      within(screen.getByRole('group', { name: T.filterType })).getByRole(
        'button',
        { name: '리허설' },
      ),
    )
    const select = screen.getByLabelText(T.filterPerformance, {
      selector: 'select',
    })
    await within(select).findByRole('option', { name: '가을 정기공연' })
    fireEvent.change(select, { target: { value: '31' } })
    await waitFor(() => {
      const q = lastQuery(fetchMock, CLUB)
      expect(q.get('includeCanceled')).toBe('true')
      expect(q.get('eventType')).toBe('REHEARSAL')
      expect(q.get('performanceId')).toBe('31')
    })
    // team and song filters appear with a performance
    await within(
      screen.getByLabelText(T.filterTeam, { selector: 'select' }),
    ).findByRole('option', {
      name: 'Crane Team',
    })
    fireEvent.change(
      screen.getByLabelText(T.filterTeam, { selector: 'select' }),
      {
        target: { value: '101' },
      },
    )
    await waitFor(() =>
      expect(lastQuery(fetchMock, CLUB).get('teamId')).toBe('101'),
    )
  })

  it('the add button goes to a performance that still takes schedules', async () => {
    openSchedule('/calendar', 'CLUB_ADMIN', {
      [`GET ${MINE}`]: items(),
      [`GET ${CLUB}`]: items(),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: T.scopeClub }))
    const add = await screen.findByRole('link', { name: T.addSchedule })
    // performance 32 is FINISHED (E-01): the first open one is 31.
    expect(add.getAttribute('href')).toBe(
      '/clubs/10/performances/31/schedules/new',
    )
  })

  it('tags the club on my schedules when I belong to several clubs', async () => {
    const second = {
      ...membership('MEMBER'),
      id: 'm10',
      clubId: '20',
      club: { ...membership('MEMBER').club, id: '20', name: '노을밴드' },
    }
    const { fetchMock } = openSchedule('/calendar', 'MEMBER', {
      [`GET ${API_PATHS.memberships}`]: () =>
        json({ items: [membership('MEMBER'), second] }),
      [`GET ${MINE}`]: items(event({ clubId: '20', title: '노을 합주' })),
    })
    await findScreen('SCHD-001')
    const chip = await screen.findByRole('link', { name: /노을 합주/ })
    expect(within(chip).getByText('노을')).toBeTruthy()
    // the club chips filter the query
    fireEvent.click(screen.getByRole('button', { name: '노을밴드' }))
    await waitFor(() =>
      expect(lastQuery(fetchMock, MINE).get('clubIds')).toBe('20'),
    )
  })

  it('says so when nothing is scheduled and when the range is too large', async () => {
    openSchedule('/calendar', 'MEMBER', { [`GET ${MINE}`]: items() })
    await ready()
    await screen.findByText(T.empty)
  })

  it('RANGE_TOO_LARGE asks for a shorter period', async () => {
    openSchedule('/calendar', 'MEMBER', {
      [`GET ${MINE}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'x',
              details: [{ field: 'to', reason: 'RANGE_TOO_LARGE' }],
            },
          }),
          { status: 400 },
        ),
    })
    await findScreen('SCHD-001')
    await screen.findByText(T.rangeTooLarge)
  })
})
