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
              {
                path: '/me/membership',
                lazy: async () => {
                  const { MyMembership } =
                    await import('../features/my/MyMembership')
                  return { Component: MyMembership }
                },
              },
              ...subScreens([
                ['/clubs/new', 'CLUB-001'],
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
              {
                path: '/calendar',
                handle: { title: '캘린더' },
                lazy: async () => {
                  const { ScheduleCalendar } =
                    await import('../features/schedule/ScheduleCalendar')
                  return { Component: ScheduleCalendar }
                },
              },
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
                  {
                    path: 'performances',
                    handle: { title: '공연' },
                    lazy: async () => {
                      const { PerformanceList } =
                        await import('../features/performance/PerformanceList')
                      return { Component: PerformanceList }
                    },
                  },
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
                  {
                    path: PERF,
                    handle: { title: '공연 상세', sub: true },
                    lazy: async () => {
                      const { PerformanceDetail } =
                        await import('../features/performance/PerformanceDetail')
                      return { Component: PerformanceDetail }
                    },
                  },
                  {
                    path: `${PERF}/members`,
                    handle: { title: '참여자', sub: true },
                    lazy: async () => {
                      const { PerformanceMembers } =
                        await import('../features/performance/PerformanceMembers')
                      return { Component: PerformanceMembers }
                    },
                  },
                  {
                    path: `${PERF}/songs`,
                    handle: { title: '곡', sub: true },
                    lazy: async () => {
                      const { SongList } =
                        await import('../features/song/SongList')
                      return { Component: SongList }
                    },
                  },
                  {
                    path: `${PERF}/songs/new`,
                    handle: { title: '후보곡 제안', sub: true },
                    lazy: async () => {
                      const { SongCreate } =
                        await import('../features/song/SongCreate')
                      return { Component: SongCreate }
                    },
                  },
                  {
                    path: `${PERF}/songs/:songId`,
                    handle: { title: '곡 상세', sub: true },
                    lazy: async () => {
                      const { SongDetail } =
                        await import('../features/song/SongDetail')
                      return { Component: SongDetail }
                    },
                  },
                  {
                    path: `${PERF}/teams`,
                    handle: { title: '팀', sub: true },
                    lazy: async () => {
                      const { TeamList } =
                        await import('../features/team/TeamList')
                      return { Component: TeamList }
                    },
                  },
                  {
                    path: `${PERF}/teams/apply`,
                    handle: { title: '팀 신청', sub: true },
                    lazy: async () => {
                      const { TeamApply } =
                        await import('../features/team/TeamApply')
                      return { Component: TeamApply }
                    },
                  },
                  {
                    path: `${PERF}/teams/:teamId`,
                    handle: { title: '팀 상세', sub: true },
                    lazy: async () => {
                      const { TeamDetail } =
                        await import('../features/team/TeamDetail')
                      return { Component: TeamDetail }
                    },
                  },
                  {
                    path: `${PERF}/setlist`,
                    handle: { title: '세트리스트', sub: true },
                    lazy: async () => {
                      const { Setlist } =
                        await import('../features/setlist/Setlist')
                      return { Component: Setlist }
                    },
                  },
                  {
                    path: `${PERF}/availability`,
                    handle: { title: '합주 가능 시간', sub: true },
                    lazy: async () => {
                      const { Availability } =
                        await import('../features/availability/Availability')
                      return { Component: Availability }
                    },
                  },
                  {
                    path: `${PERF}/availability/common`,
                    handle: { title: '공통 가능 시간', sub: true },
                    lazy: async () => {
                      const { AvailabilityCommon } =
                        await import('../features/availability/AvailabilityCommon')
                      return { Component: AvailabilityCommon }
                    },
                  },
                  {
                    path: `${PERF}/auditions/mine`,
                    handle: { title: '내 오디션 결과', sub: true },
                    lazy: async () => {
                      const { MyAuditions } =
                        await import('../features/audition/MyAuditions')
                      return { Component: MyAuditions }
                    },
                  },
                  ...subScreens([]),
                  {
                    path: `${PERF}/schedules`,
                    handle: { title: '캘린더', sub: true },
                    lazy: async () => {
                      const { ScheduleCalendar } =
                        await import('../features/schedule/ScheduleCalendar')
                      return { Component: ScheduleCalendar }
                    },
                  },
                  {
                    path: `${PERF}/schedules/:scheduleId`,
                    handle: { title: '일정 상세', sub: true },
                    lazy: async () => {
                      const { ScheduleDetail } =
                        await import('../features/schedule/ScheduleDetail')
                      return { Component: ScheduleDetail }
                    },
                  },
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
                        path: 'performances/new',
                        handle: { title: '공연 만들기', sub: true },
                        lazy: async () => {
                          const { PerformanceCreate } =
                            await import('../features/performance/PerformanceCreate')
                          return { Component: PerformanceCreate }
                        },
                      },
                      {
                        path: `${PERF}/edit`,
                        handle: { title: '공연 정보 수정', sub: true },
                        lazy: async () => {
                          const { PerformanceEdit } =
                            await import('../features/performance/PerformanceEdit')
                          return { Component: PerformanceEdit }
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
                      {
                        path: `${PERF}/teams/new`,
                        handle: { title: '팀 만들기', sub: true },
                        lazy: async () => {
                          const { TeamCreate } =
                            await import('../features/team/TeamCreate')
                          return { Component: TeamCreate }
                        },
                      },
                      {
                        path: `${PERF}/teams/review`,
                        handle: { title: '팀 심사', sub: true },
                        lazy: async () => {
                          const { TeamReview } =
                            await import('../features/team/TeamReview')
                          return { Component: TeamReview }
                        },
                      },
                      {
                        path: `${PERF}/songs/status`,
                        handle: { title: '투표·가불 현황', sub: true },
                        lazy: async () => {
                          const { SongStatus } =
                            await import('../features/song/SongStatus')
                          return { Component: SongStatus }
                        },
                      },
                      {
                        path: `${PERF}/songs/:songId/players`,
                        handle: { title: '연주자 배정', sub: true },
                        lazy: async () => {
                          const { SongPlayers } =
                            await import('../features/song/SongPlayers')
                          return { Component: SongPlayers }
                        },
                      },
                      {
                        path: `${PERF}/auditions`,
                        handle: { title: '오디션', sub: true },
                        lazy: async () => {
                          const { AuditionList } =
                            await import('../features/audition/AuditionList')
                          return { Component: AuditionList }
                        },
                      },
                      {
                        path: `${PERF}/auditions/new`,
                        handle: { title: '오디션 등록', sub: true },
                        lazy: async () => {
                          const { AuditionCreate } =
                            await import('../features/audition/AuditionCreate')
                          return { Component: AuditionCreate }
                        },
                      },
                      {
                        path: `${PERF}/auditions/:auditionId/result`,
                        handle: { title: '심사 결과 입력', sub: true },
                        lazy: async () => {
                          const { AuditionResult } =
                            await import('../features/audition/AuditionResult')
                          return { Component: AuditionResult }
                        },
                      },
                      {
                        path: `${PERF}/schedules/new`,
                        handle: { title: '일정 만들기', sub: true },
                        lazy: async () => {
                          const { ScheduleForm } =
                            await import('../features/schedule/ScheduleForm')
                          return { Component: ScheduleForm }
                        },
                      },
                      {
                        path: `${PERF}/schedules/:scheduleId/edit`,
                        handle: { title: '일정 수정', sub: true },
                        lazy: async () => {
                          const { ScheduleForm } =
                            await import('../features/schedule/ScheduleForm')
                          return { Component: ScheduleForm }
                        },
                      },
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
