import { Navigate, Outlet, useParams } from 'react-router'
import { saveLastClubId } from '../shared/lib/lastClub'
import { isClubAdmin, isClubMember, useSession } from '../shared/auth/session'
import { PageLoading } from '../shared/ui/StateViews'
import { useEffect } from 'react'

// Guards only control what is shown; the server response is the source of truth for permissions.

export function RequireAuth() {
  const session = useSession()
  if (session.status === 'loading') return <PageLoading />
  if (session.status === 'anonymous') return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireOnboarded() {
  const { me } = useSession()
  if (me?.onboardingRequired) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export function RequireClubMember() {
  const session = useSession()
  const { clubId = '' } = useParams()
  const member = isClubMember(session, clubId)
  useEffect(() => {
    if (member) saveLastClubId(clubId)
  }, [member, clubId])
  if (!member) return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireClubAdmin() {
  const session = useSession()
  const { clubId = '' } = useParams()
  if (!isClubAdmin(session, clubId))
    return <Navigate to={`/clubs/${clubId}`} replace />
  return <Outlet />
}

export function RequireSuperAdmin() {
  const { me } = useSession()
  if (!me?.isSuperAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
