import type { RouteObject } from 'react-router'
import { Navigate } from 'react-router'
import { readLastClubId } from '../shared/lib/lastClub'
import { inviteOr } from '../shared/lib/pendingInvite'
import { LoginScreen } from '../features/auth/LoginScreen'
import { isClubMember, useSession } from '../shared/auth/session'
import { NotFoundView, PageLoading } from '../shared/ui/StateViews'
import { AppShell } from './AppShell'
import {
  RequireAuth,
  RequireClubAdmin,
  RequireClubMember,
  RequireOnboarded,
  RequireSuperAdmin,
} from './guards'
import { Placeholder } from './Placeholder'

export type RouteHandle = { title?: string; sub?: boolean }

const screen = (
  screenId: string,
  handle: RouteHandle = {},
): Pick<RouteObject, 'element' | 'handle'> => ({
  element: <Placeholder screenId={screenId} />,
  handle: { title: screenId, ...handle },
})

/** `/`: login screen, or the last (else first) club's home, or the start screen. */
function Landing() {
  const session = useSession()
  if (session.status === 'loading') return <PageLoading />
  if (session.status === 'anonymous') return <LoginScreen />
  if (session.me?.onboardingRequired)
    return <Navigate to="/onboarding" replace />
  // Opened an invite link before logging in: back to it.
  const invite = inviteOr('')
  if (invite) return <Navigate to={invite} replace />
  const last = readLastClubId()
  if (last && isClubMember(session, last))
    return <Navigate to={`/clubs/${last}`} replace />
  const first = session.memberships.find((m) => isClubMember(session, m.clubId))
  if (first) return <Navigate to={`/clubs/${first.clubId}`} replace />
  return <Navigate to="/start" replace />
}

function NotFoundRoute() {
  return <NotFoundView onHome={() => location.assign('/')} />
}

const subScreens = (entries: [path: string, screenId: string][]) =>
  entries.map(([path, screenId]) => ({
    path,
    ...screen(screenId, { sub: true }),
  }))

const PERF = 'performances/:performanceId'

// Route-level code splitting: new screens use `lazy` like these.
// Screen IDs follow APPX-002. Paths are this app's own decision: the spec fixes only /join/{code}.
export const routes: RouteObject[] = [
  // Outside AppShell: the shell swaps its layout when the session changes, which would remount
  // this screen mid-exchange and replay the single-use exchange.
  {
    path: '/auth/complete',
    HydrateFallback: PageLoading,
    lazy: async () => {
      const { AuthComplete } = await import('../features/auth/AuthComplete')
      return { Component: AuthComplete }
    },
  },
  {
    element: <AppShell />,
    HydrateFallback: PageLoading,
    children: [
      { path: '/', element: <Landing /> },
      {
        path: '/join/:code',
        lazy: async () => {
          const { JoinLink } = await import('../features/club/JoinLink')
          return { Component: JoinLink }
        },
      },
      {
        path: '/restore',
        lazy: async () => {
          const { RestoreScreen } =
            await import('../features/auth/RestoreScreen')
          return { Component: RestoreScreen }
        },
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/onboarding',
            lazy: async () => {
              const { Onboarding } = await import('../features/auth/Onboarding')
              return { Component: Onboarding }
            },
          },
          {
            element: <RequireOnboarded />,
            children: [
              {
                path: '/start',
                lazy: async () => {
                  const { Start } = await import('../features/auth/Start')
                  return { Component: Start }
                },
              },
              {
                path: '/clubs/join',
                lazy: async () => {
                  const { JoinCode } = await import('../features/club/JoinCode')
                  return { Component: JoinCode }
                },
              },
              {
                path: '/clubs/search',
                lazy: async () => {
                  const { ClubSearch } =
                    await import('../features/club/ClubSearch')
                  return { Component: ClubSearch }
                },
              },
              ...subScreens([
                ['/clubs/new', 'CLUB-001'],
                ['/me/membership', 'MY-003'],
                ['/me/withdrawal', 'MY-004'],
              ]),
              {
                path: '/me/profile',
                handle: { title: 'MY-002', sub: true },
                lazy: async () => {
                  const { MyProfile } = await import('../features/my/MyProfile')
                  return { Component: MyProfile }
                },
              },
              { path: '/calendar', ...screen('SCHD-001') },
              {
                path: '/me',
                handle: { title: 'MY-001' },
                lazy: async () => {
                  const { MyInfo } = await import('../features/my/MyInfo')
                  return { Component: MyInfo }
                },
              },
              {
                path: '/clubs/:clubId',
                element: <RequireClubMember />,
                children: [
                  {
                    index: true,
                    handle: { title: 'HOME-001' },
                    lazy: async () => {
                      const { Home } = await import('../features/home/Home')
                      return { Component: Home }
                    },
                  },
                  { path: 'performances', ...screen('PERF-001') },
                  {
                    path: 'info',
                    handle: { title: '동아리', sub: true },
                    lazy: async () => {
                      const { ClubOverview } =
                        await import('../features/club/ClubOverview')
                      return { Component: ClubOverview }
                    },
                  },
                  {
                    path: 'members',
                    handle: { title: '멤버', sub: true },
                    lazy: async () => {
                      const { MemberList } =
                        await import('../features/club/MemberList')
                      return { Component: MemberList }
                    },
                  },
                  {
                    path: 'members/:membershipId',
                    handle: { title: '멤버 상세', sub: true },
                    lazy: async () => {
                      const { MemberDetail } =
                        await import('../features/club/MemberDetail')
                      return { Component: MemberDetail }
                    },
                  },
                  ...subScreens([
                    [PERF, 'PERF-003'],
                    [`${PERF}/members`, 'PMEM-001'],
                    [`${PERF}/teams`, 'TEAM-001'],
                    [`${PERF}/teams/apply`, 'TEAM-004'],
                    [`${PERF}/teams/:teamId`, 'TEAM-002'],
                    [`${PERF}/songs`, 'SONG-001'],
                    [`${PERF}/songs/new`, 'SONG-002'],
                    [`${PERF}/songs/:songId`, 'SONG-003'],
                    [`${PERF}/setlist`, 'SET-001'],
                    [`${PERF}/auditions/mine`, 'AUDI-004'],
                    [`${PERF}/availability`, 'AVAIL-001'],
                    [`${PERF}/availability/common`, 'AVAIL-002'],
                    [`${PERF}/schedules`, 'SCHD-001'],
                    [`${PERF}/schedules/:scheduleId`, 'SCHD-002'],
                  ]),
                  {
                    path: 'leave',
                    handle: { title: '동아리 나가기', sub: true },
                    lazy: async () => {
                      const { ClubLeave } =
                        await import('../features/club/ClubLeave')
                      return { Component: ClubLeave }
                    },
                  },
                  {
                    element: <RequireClubAdmin />,
                    children: [
                      {
                        path: 'join-code',
                        handle: { title: '가입 코드·공개 설정', sub: true },
                        lazy: async () => {
                          const { JoinCodeSettings } =
                            await import('../features/club/JoinCodeSettings')
                          return { Component: JoinCodeSettings }
                        },
                      },
                      {
                        path: 'parts',
                        handle: { title: '파트 관리', sub: true },
                        lazy: async () => {
                          const { PartSettings } =
                            await import('../features/club/PartSettings')
                          return { Component: PartSettings }
                        },
                      },
                      {
                        path: 'join-requests',
                        handle: { title: '가입 관리', sub: true },
                        lazy: async () => {
                          const { JoinManage } =
                            await import('../features/club/JoinManage')
                          return { Component: JoinManage }
                        },
                      },
                      {
                        path: 'members/new',
                        handle: { title: '멤버 직접 추가', sub: true },
                        lazy: async () => {
                          const { MemberAdd } =
                            await import('../features/club/MemberAdd')
                          return { Component: MemberAdd }
                        },
                      },
                      {
                        path: `${PERF}/policy`,
                        handle: { title: '운영 정책', sub: true },
                        lazy: async () => {
                          const { PerformancePolicy } =
                            await import('../features/performance/PerformancePolicy')
                          return { Component: PerformancePolicy }
                        },
                      },
                      {
                        path: `${PERF}/status`,
                        handle: { title: '공연 상태 변경', sub: true },
                        lazy: async () => {
                          const { PerformanceStatusScreen } =
                            await import('../features/performance/PerformanceStatus')
                          return { Component: PerformanceStatusScreen }
                        },
                      },
                      ...subScreens([
                        ['performances/new', 'PERF-002'],
                        [`${PERF}/edit`, 'PERF-006'],
                        [`${PERF}/teams/new`, 'TEAM-003'],
                        [`${PERF}/teams/review`, 'TEAM-005'],
                        [`${PERF}/songs/status`, 'SONG-005'],
                        [`${PERF}/songs/:songId/players`, 'SONG-004'],
                        [`${PERF}/auditions`, 'AUDI-001'],
                        [`${PERF}/auditions/new`, 'AUDI-002'],
                        [`${PERF}/auditions/:auditionId/result`, 'AUDI-003'],
                        [`${PERF}/schedules/new`, 'SCHD-003'],
                        [`${PERF}/schedules/:scheduleId/edit`, 'SCHD-003'],
                      ]),
                    ],
                  },
                ],
              },
              {
                element: <RequireSuperAdmin />,
                children: subScreens([
                  ['/admin', 'SADM-001'],
                  ['/admin/clubs', 'SADM-002'],
                  ['/admin/clubs/:clubId', 'SADM-003'],
                  ['/admin/users', 'SADM-004'],
                  ['/admin/audit-logs', 'SADM-005'],
                ]),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]
