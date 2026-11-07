import { API_PATHS } from '../../shared/api/assumptions'
import { json, type Route } from '../../test/harness'
import type { PerformanceDetail, PerformanceStatus } from './types'

/** Test fixtures shared by the PERF-004 / PERF-005 tests. */
export const PERF_URL = '/api/v1/clubs/10/performances/31'

const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = {
  id: '21',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'CLUB_ADMIN',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
}

export const sessionRoutes: Record<string, Route> = {
  [`GET ${API_PATHS.me}`]: () => json(user),
  [`GET ${API_PATHS.memberships}`]: () => json({ items: [membership] }),
}

export function detail(
  status: PerformanceStatus,
  policy: Partial<PerformanceDetail['policy']> = {},
): PerformanceDetail {
  return {
    performance: {
      id: '31',
      clubId: '10',
      title: '가을 정기공연',
      performDate: '2026-11-15',
      location: '공연장',
      preset: 'TEAM_FIRST',
      status,
      createdByUserId: '1',
      version: '8',
      createdAt: '2026-10-02T18:00:00+09:00',
      updatedAt: '2026-10-08T21:10:00+09:00',
    },
    policy: {
      performanceId: '31',
      performanceVersion: '8',
      applicationState: 'OPEN',
      applicationDeadline: '2026-11-05T23:30:00+09:00',
      candidateState: 'OPEN',
      candidateDeadline: null,
      playabilityState: 'CLOSED',
      playabilityDeadline: null,
      voteState: 'CLOSED',
      voteDeadline: null,
      teamApplicationState: 'DISABLED',
      teamApplicationDeadline: null,
      availabilityState: 'CLOSED',
      availabilityDeadline: null,
      candidateScope: 'ALL_PARTICIPANTS',
      candidateLimitPerMember: 3,
      voteMethod: 'APPROVAL',
      voteMaxChoices: null,
      playabilityResultPublic: true,
      voteResultPublic: true,
      practiceSeasonStart: null,
      practiceSeasonEnd: null,
      maxSongsPerMember: null,
      updatedAt: '2026-10-08T21:10:00+09:00',
      ...policy,
    },
  }
}

/** Parsed JSON body of a recorded fetch call. */
export const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<
    string,
    unknown
  >
