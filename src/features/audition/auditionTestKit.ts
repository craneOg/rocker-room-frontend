// Shared fixtures of the AUDI-001 ~ AUDI-004 tests.
import { json, type Route } from '../../test/harness'
import { BASE, detail, PERF } from '../performance/viewTestKit'

export { BASE, PERF }
export const AUDITIONS = `${PERF}/auditions`

export const audition = (
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  type: 'SONG',
  songId: '41',
  songTitle: 'Song A',
  songStatus: 'PROPOSED',
  partId: null,
  partName: null,
  applicantPerformanceMemberId: null,
  applicantName: null,
  candidateTeamName: '은하수',
  linkedScheduleId: '305',
  scheduledAt: '2026-11-05T19:00:00+09:00',
  memo: '후렴 파트 위주로 심사합니다.',
  result: null,
  comment: null,
  judgedBy: null,
  judgedByName: null,
  judgedAt: null,
  version: '1',
  createdAt: '2026-11-01T10:00:00+09:00',
  ...extra,
})

export const session = (
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> =>
  audition(id, {
    type: 'SESSION',
    partId: '4',
    partName: '기타',
    applicantPerformanceMemberId: '88',
    applicantName: '박서연',
    candidateTeamName: null,
    memo: null,
    ...extra,
  })

export const done = (
  id: string,
  result: 'PASSED' | 'FAILED',
  extra: Record<string, unknown> = {},
) =>
  session(id, {
    result,
    comment: '리듬이 안정적입니다.',
    judgedBy: '7',
    judgedByName: '명혜성',
    judgedAt: '2026-11-05T20:00:00+09:00',
    version: '2',
    ...extra,
  })

export const auditionPage = (
  items: unknown[],
  extra: Record<string, unknown> = {},
) =>
  json({
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: 1,
    pendingCount: items.length,
    ...extra,
  })

/** Pickers every audition screen reads (API-075 songs, API-105 schedules). */
export const pickerRoutes: Record<string, Route> = {
  [`GET ${PERF}/songs`]: () =>
    json({
      items: [
        { id: '41', title: 'Song A', artist: 'A', status: 'PROPOSED' },
        { id: '42', title: 'Song B', artist: 'B', status: 'CONFIRMED' },
      ],
    }),
  [`GET ${PERF}/schedules`]: () =>
    json({
      items: [
        {
          id: '305',
          title: '오디션 1차',
          status: 'CONFIRMED',
          startAt: '2026-11-05T19:00:00+09:00',
        },
        {
          id: '306',
          title: '취소된 오디션',
          status: 'CANCELED',
          startAt: '2026-11-06T19:00:00+09:00',
        },
      ],
    }),
}

export const performanceAt = (status: string): Record<string, Route> => ({
  [`GET ${PERF}`]: () => json(detail({ status })),
})
