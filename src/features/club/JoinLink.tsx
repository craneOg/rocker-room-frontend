import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router'
import { LoginScreen } from '../auth/LoginScreen'
import { useSession } from '../../shared/auth/session'
import {
  clearPendingInvite,
  savePendingInvite,
} from '../../shared/lib/pendingInvite'
import { PageLoading } from '../../shared/ui/StateViews'
import { JoinCode } from './JoinCode'

/**
 * `/join/{code}` (UI-32): logged in -> CLUB-002 with the code filled in; not yet -> keep the
 * code, log in (and onboard), then come back here.
 */
export function JoinLink() {
  const { code = '' } = useParams()
  const { status, me } = useSession()
  const needsLogin = status === 'anonymous' || me?.onboardingRequired === true

  useEffect(() => {
    if (needsLogin) savePendingInvite(code)
    else if (status === 'authenticated') clearPendingInvite()
  }, [needsLogin, status, code])

  if (status === 'loading') return <PageLoading />
  if (status === 'anonymous') return <LoginScreen />
  if (me?.onboardingRequired) return <Navigate to="/onboarding" replace />
  return <JoinCode key={code} initialCode={code} />
}
