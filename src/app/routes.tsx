import type { RouteObject } from 'react-router'
import { Navigate } from 'react-router'
import { readLastClubId } from '../shared/lib/lastClub'
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

/** `/`: login screen, or the last club's home, or the start screen. */
function Landing() {
  const session = useSession()
  if (session.status === 'loading') return <PageLoading />
  if (session.status === 'anonymous') return <Placeholder screenId="AUTH-001" />
  if (session.me?.onboardingRequired)
    return <Navigate to="/onboarding" replace />
  const last = readLastClubId()
  if (last && isClubMember(session, last))
    return <Navigate to={`/clubs/${last}`} replace />
  return <Navigate to="/start" replace />
}

function NotFoundRoute() {
  return <NotFoundView onHome={() => location.assign('/')} />
}

// Screen IDs not yet fixed in the screen spec show their route pattern instead of a guessed ID.
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/join/:code', ...screen('JOIN (invite entry)', { sub: true }) },
      { path: '/auth/complete', ...screen('AUTH-COMPLETE (temporary)') },
      { path: '/restore', ...screen('AUTH-004', { sub: true }) },
      {
        element: <RequireAuth />,
        children: [
          { path: '/onboarding', ...screen('AUTH-002') },
          {
            element: <RequireOnboarded />,
            children: [
              { path: '/start', ...screen('AUTH-003') },
              { path: '/clubs/new', ...screen('/clubs/new', { sub: true }) },
              { path: '/clubs/join', ...screen('/clubs/join', { sub: true }) },
              {
                path: '/clubs/search',
                ...screen('/clubs/search', { sub: true }),
              },
              { path: '/calendar', ...screen('/calendar') },
              { path: '/me/*', ...screen('/me/...') },
              {
                path: '/clubs/:clubId',
                element: <RequireClubMember />,
                children: [
                  { index: true, ...screen('HOME-001') },
                  { path: 'info', ...screen('CLUB-101', { sub: true }) },
                  { path: 'members', ...screen('CLUB-102', { sub: true }) },
                  { path: 'performances', ...screen('PERF-001') },
                  ...[
                    'songs',
                    'teams',
                    'setlist',
                    'schedules',
                    'members',
                    'auditions',
                  ].map((p) => ({
                    path: `performances/:performanceId/${p}`,
                    ...screen(
                      `/clubs/:clubId/performances/:performanceId/${p}`,
                      { sub: true },
                    ),
                  })),
                  {
                    element: <RequireClubAdmin />,
                    children: [
                      {
                        path: 'join-requests',
                        ...screen('CLUB-103', { sub: true }),
                      },
                    ],
                  },
                ],
              },
              {
                element: <RequireSuperAdmin />,
                children: [
                  { path: '/admin/*', ...screen('/admin/...', { sub: true }) },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]
