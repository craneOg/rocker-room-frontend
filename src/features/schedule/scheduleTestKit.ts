// Shared fixtures of the SCHD-001 / 002 / 003 tests (club 10, performance 31, user 1 = 송예림).
import { vi } from 'vitest'
import { json, type Route } from '../../test/harness'
import { PERF, open, perf } from '../performance/viewTestKit'

export const SCH = `${PERF}/schedules`
export const ONE = `${SCH}/401`

export const sched = (extra: Record<string, unknown> = {}) => ({
  id: '401',
  performanceId: '31',
  eventType: 'PRACTICE',
  status: 'CONFIRMED',
  startAt: '2026-10-15T18:00:00+09:00',
  endAt: '2026-10-15T20:00:00+09:00',
  title: '정기 합주',
  location: '합주실 A',
  version: '3',
  memo: '개인 악기를 준비해 주세요.',
  forAllParticipants: false,
  teamIds: ['101'],
  songIds: ['301'],
  performanceTitle: '가을 정기공연',
  ...extra,
})

export const who = (
  userId: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  userId,
  performanceMemberId: `pm${userId}`,
  membershipId: `m${userId}`,
  displayName: name,
  parts: [{ id: '4', name: '드럼' }],
  memberType: 'REGULAR',
  isSupportPlayer: false,
  ...extra,
})

export const detailOf = (extra: Record<string, unknown> = {}) => ({
  schedule: sched(extra),
  participants: [
    who('7', '정규채', { memberType: 'GUEST' }),
    who('1', '송예림'),
    who('9', '박지호', { isSupportPlayer: true }),
  ],
})

export const event = (extra: Record<string, unknown> = {}) => ({
  id: '401',
  title: '정기 합주',
  startAt: '2026-10-15T18:00:00+09:00',
  endAt: '2026-10-15T20:00:00+09:00',
  eventType: 'PRACTICE',
  allDay: false,
  status: 'CONFIRMED',
  clubId: '10',
  performanceId: '31',
  ...extra,
})

export const performanceDay = () =>
  event({
    id: '31',
    title: '가을 정기공연',
    startAt: '2026-10-20T00:00:00+09:00',
    endAt: '2026-10-20T23:59:00+09:00',
    eventType: 'PERFORMANCE',
    allDay: true,
    status: null,
  })

export const overlap = {
  type: 'OVERLAP',
  scheduleId: '402',
  title: '밴드 합주',
  startAt: '2026-10-15T19:00:00+09:00',
  endAt: '2026-10-15T20:00:00+09:00',
  participants: [{ membershipId: 'm7', displayName: '정규채' }],
}

/** `Date` only is faked, so waiting helpers keep working. Today = 2026-10-15 (KST). */
export const freezeToday = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T03:00:00Z'))
}

const teams: Route = () =>
  json({
    items: [
      { id: '101', name: 'Crane Team' },
      { id: '102', name: '2팀' },
    ],
  })
const songs: Route = () =>
  json({
    items: [
      { id: '301', title: '후보 곡' },
      { id: '302', title: '선정 곡' },
    ],
  })

export const choiceRoutes: Record<string, Route> = {
  [`GET ${PERF}/teams`]: teams,
  [`GET ${PERF}/songs`]: songs,
}

export function openSchedule(
  path: string,
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: Record<string, Route> = {},
) {
  Element.prototype.getAnimations = () => []
  return open(path, role, {
    ...choiceRoutes,
    [`GET /api/v1/clubs/10/performances`]: () =>
      json({
        items: [
          perf({ id: '32', title: '지난 공연', status: 'FINISHED' }),
          perf(),
        ],
        page: 0,
        size: 20,
        totalElements: 2,
        totalPages: 1,
      }),
    ...extra,
  })
}
