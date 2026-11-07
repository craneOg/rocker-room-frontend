// Shared fixtures of the PERF-001 / PERF-003 / PMEM-001 tests.
import { API_PATHS } from '../../shared/api/assumptions'
import {
  callsTo,
  json,
  renderApp,
  stubApi,
  type Route,
} from '../../test/harness'

export const BASE = '/api/v1/clubs/10'
export const PERF = `${BASE}/performances/31`

const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}

export const membership = (
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: { status?: string; clubStatus?: string } = {},
) => ({
  id: 'm9',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType: 'BAND',
    status: extra.clubStatus ?? 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role,
  status: extra.status ?? 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
})

export const perf = (extra: Record<string, unknown> = {}) => ({
  id: '31',
  clubId: '10',
  title: '가을 정기공연',
  performDate: '2026-12-31',
  location: '학생회관',
  preset: 'TEAM_FIRST',
  status: 'ACTIVE',
  createdByUserId: '1',
  version: '8',
  createdAt: '2026-10-01T12:00:00+09:00',
  updatedAt: '2026-10-08T21:10:00+09:00',
  ...extra,
})

const policy = (extra: Record<string, unknown> = {}) => ({
  performanceId: '31',
  performanceVersion: '8',
  applicationState: 'OPEN',
  applicationDeadline: null,
  candidateState: 'OPEN',
  candidateDeadline: null,
  playabilityState: 'DISABLED',
  playabilityDeadline: null,
  voteState: 'DISABLED',
  voteDeadline: null,
  teamApplicationState: 'CLOSED',
  teamApplicationDeadline: null,
  availabilityState: 'CLOSED',
  availabilityDeadline: null,
  candidateScope: 'PERFORMANCE',
  candidateLimitPerMember: 3,
  voteMethod: 'APPROVAL',
  voteMaxChoices: null,
  playabilityResultPublic: true,
  voteResultPublic: true,
  practiceSeasonStart: null,
  practiceSeasonEnd: null,
  maxSongsPerMember: null,
  updatedAt: '2026-10-08T21:10:00+09:00',
  ...extra,
})

export const detail = (
  p: Record<string, unknown> = {},
  pol: Record<string, unknown> = {},
) => ({
  performance: perf(p),
  policy: policy(pol),
  counts: { teams: 2, candidateSongs: 5, confirmedSongs: 1, participants: 7 },
  nextSchedule: null,
})

export const memberRow = (
  id: string,
  membershipId: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  performanceId: '31',
  membershipId,
  status: 'APPROVED',
  source: 'APPLICATION',
  createdAt: '2026-10-03T12:00:00+09:00',
  updatedAt: '2026-10-08T21:10:00+09:00',
  displayName: name,
  profileImageUrl: null,
  memberType: 'REGULAR',
  parts: [{ id: '4', name: '드럼' }],
  teamNames: [],
  playedSongCount: 0,
  ...extra,
})

export const page = (items: unknown[], extra: Record<string, unknown> = {}) =>
  json({
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: 1,
    ...extra,
  })

export const memberPage = (
  items: unknown[],
  statusCounts: Record<string, number>,
) => page(items, { statusCounts })

/** Row of API-054: the requester's own participation. */
export const mine = (extra: Record<string, unknown> = {}) => ({
  id: '55',
  performanceId: '31',
  membershipId: 'm9',
  status: 'APPROVED',
  source: 'APPLICATION',
  createdAt: '2026-10-03T12:00:00+09:00',
  updatedAt: '2026-10-08T21:10:00+09:00',
  myTeams: [],
  myPlayingSongs: [],
  progress: {
    candidateSongs: { used: 1, limit: 3 },
    unansweredPlayabilityCount: null,
    votes: null,
    availabilitySlotCount: null,
  },
  ...extra,
})

/** JSON body of the last write (a call with a body) to `path`. */
export const body = (fetchMock: ReturnType<typeof stubApi>, path: string) =>
  JSON.parse(
    String(
      callsTo(fetchMock, path)
        .filter(([, init]) => init?.body !== undefined)
        .at(-1)?.[1]?.body,
    ),
  ) as unknown

/** The query string of the last GET to `path`. */
export const lastQuery = (
  fetchMock: ReturnType<typeof stubApi>,
  path: string,
) =>
  new URLSearchParams(
    String(callsTo(fetchMock, path).at(-1)?.[0]).split('?')[1] ?? '',
  )

export function open(
  path: string,
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: Record<string, Route> = {},
  m: { status?: string; clubStatus?: string } = {},
) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () =>
      json({ items: [membership(role, m)] }),
    [`GET ${BASE}/performances/31`]: () => json(detail()),
    [`GET ${BASE}/memberships/m9`]: () =>
      json({
        id: 'm9',
        displayName: null,
        userName: '송예림',
        memberType: 'REGULAR',
        role,
        status: 'ACTIVE',
        profileImageUrl: null,
        parts: [],
        performances: [],
      }),
    [`GET ${BASE}/parts`]: () =>
      json({
        items: [
          {
            id: '4',
            name: '드럼',
            displayOrder: 1,
            isActive: true,
            memberCount: 2,
          },
          {
            id: '9',
            name: '건반',
            displayOrder: 2,
            isActive: false,
            memberCount: 0,
          },
        ],
      }),
    ...extra,
  })
  return { fetchMock, router: renderApp(path) }
}
