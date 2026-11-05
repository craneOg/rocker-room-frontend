import { Loading, Typography } from '@montage-ui/core'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { AUTH_ERROR_QUERY_PARAM } from '../../shared/api/assumptions'
import { isApiError } from '../../shared/api/errors'
import { useSession } from '../../shared/auth/session'
import { feedback } from '../../shared/ui/feedbackBus'
import { exchangeLogin, getMe, startKakaoLogin } from './api'
import { AUTH_COPY as T } from './copy'

/** AUTH-001 2-1 / 2-2: exchanges the one-time login cookie, then routes by account state. */
export function AuthComplete() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const { me } = useSession()
  const [exchanged, setExchanged] = useState(false)
  // The exchange cookie is single-use: StrictMode re-runs effects, so guard with a ref.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const fail = async (message: string) => {
      navigate('/', { replace: true })
      const choice = await feedback.dialog({
        title: T.loginFailedTitle,
        items: [message],
        confirmLabel: T.retry,
      })
      if (choice === 'confirm') startKakaoLogin()
    }

    const run = async () => {
      if (params.get(AUTH_ERROR_QUERY_PARAM)) return fail(T.loginCancelled)
      // Let the page-load session check settle first: its token renewal could otherwise fail
      // after the exchange, and fetchQuery below would join it and report a good login as failed.
      await queryClient
        .fetchQuery({ queryKey: ['me'], queryFn: getMe })
        .catch(() => {})
      try {
        const { restoreRequired } = await exchangeLogin()
        if (restoreRequired) {
          // /restore is outside RequireAuth: refresh the session so a 401 cached from the
          // page-load check does not leave it signed out (and its expiry hook silent).
          await queryClient
            .fetchQuery({ queryKey: ['me'], queryFn: getMe, staleTime: 0 })
            .catch(() => {})
          navigate('/restore', { replace: true })
          return
        }
        // Refresh the session first; the redirect below waits until the guards can see it.
        await queryClient.fetchQuery({
          queryKey: ['me'],
          queryFn: getMe,
          staleTime: 0,
        })
        setExchanged(true)
      } catch (e) {
        await fail(isApiError(e, 'FORBIDDEN') ? T.loginAccount : T.loginNetwork)
      }
    }
    void run()
  }, [navigate, params, queryClient])

  if (exchanged && me)
    return <Navigate to={me.onboardingRequired ? '/onboarding' : '/'} replace />

  return (
    <div className="login-loading" role="status" data-screen-id="AUTH-COMPLETE">
      <Loading variant="circular" />
      <Typography variant="body1" weight="bold">
        {T.loggingIn}
      </Typography>
    </div>
  )
}
