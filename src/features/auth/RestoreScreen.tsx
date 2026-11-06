import { Button, IconButton, Loading, Typography } from '@montage-ui/core'
import { IconClose } from '@montage-ui/icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { setSignedIn } from '../../shared/api/client'
import { isApiError, isRestorationCookieInvalid } from '../../shared/api/errors'
import { formatKstYmd } from '../../shared/lib/time'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import {
  getRecoveryInfo,
  logout,
  NotRestorableError,
  restoreProfile,
  startNewAccount,
} from './api'
import { AUTH_COPY as T } from './copy'

/** AUTH-004: Withdrawn account recovery choice screen (within 90 days). */
export function RestoreScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Cookie gone or used (401), or nothing left to restore (409): the choice cannot continue,
  // so say why and go back to the login screen. Returns false for any other error.
  const leaveIfOver = (e: unknown) => {
    const expired = isRestorationCookieInvalid(e)
    if (!expired && !(e instanceof NotRestorableError)) return false
    feedback.toast(expired ? T.restoreExpired : T.notRestorable, 'negative')
    navigate('/', { replace: true })
    return true
  }

  const {
    data: info,
    error,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['recovery-info'],
    queryFn: getRecoveryInfo,
  })

  useEffect(() => {
    if (error) leaveIfOver(error)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the error matters
  }, [error])

  const restore = useMutation({
    mutationFn: async () => {
      const res = await restoreProfile()
      if (!res.success) throw new Error('RESTORE_FAILED')
      return res
    },
    onSuccess: async () => {
      feedback.toast(T.restoreWelcome)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/onboarding', { replace: true })
    },
    onError: (e) => {
      if (leaveIfOver(e)) return
      if (!isApiError(e)) feedback.toast(COPY.unknownError, 'negative')
    },
  })

  const startNew = useMutation({
    mutationFn: async () => {
      const res = await startNewAccount()
      if (!res.success) throw new Error('START_NEW_FAILED')
      return res
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/onboarding', { replace: true })
    },
    onError: (e) => {
      if (leaveIfOver(e)) return
      if (!isApiError(e)) feedback.toast(COPY.unknownError, 'negative')
    },
  })

  const leave = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setSignedIn(false)
      await queryClient.resetQueries()
      navigate('/', { replace: true })
    },
  })

  const onClose = () => leave.mutate()

  const onConfirmStartNew = async () => {
    const choice = await feedback.dialog({
      title: T.startNewConfirmTitle,
      description: T.startNewConfirmDescription,
      cancelLabel: COPY.cancel,
      confirmLabel: T.startNewConfirm,
      danger: true,
    })
    if (choice === 'confirm') startNew.mutate()
  }

  const isPending = restore.isPending || startNew.isPending || leave.isPending

  if (isLoading) {
    return (
      <div className="restore-loading" role="status">
        <Loading variant="circular" />
      </div>
    )
  }

  if (isError || !info) {
    return (
      <div className="restore-error">
        <Typography
          variant="body1"
          color="semantic.foreground.negative.primary"
        >
          {COPY.unknownError}
        </Typography>
        <div className="restore-error-actions">
          <Button size="medium" onClick={() => void refetch()}>
            {T.retry}
          </Button>
          <Button
            size="medium"
            variant="outlined"
            color="assistive"
            disabled={leave.isPending}
            onClick={onClose}
          >
            {T.leave}
          </Button>
        </div>
      </div>
    )
  }

  const withdrawnDay = formatKstYmd(info.withdrawnAt)
  const expiresDay = formatKstYmd(info.expiresAt)

  return (
    <div className="restore" data-screen-id="AUTH-004">
      <header className="restore-top">
        <div>
          <Typography variant="title2" weight="bold" as="h1">
            {T.restoreTitle}
          </Typography>
          <Typography
            variant="body2"
            color="semantic.foreground.neutral.secondary"
          >
            {T.restoreSubtitle(withdrawnDay, expiresDay)}
          </Typography>
        </div>
        <IconButton
          type="button"
          aria-label={COPY.close}
          size="xlarge"
          disabled={isPending}
          onClick={onClose}
        >
          <IconClose />
        </IconButton>
      </header>

      <section className="restore-profile">
        <div className="profile-photo" role="img" aria-label={T.profilePhoto}>
          {info.profileImageUrl ? (
            <img src={info.profileImageUrl} alt="" />
          ) : (
            <span>{info.name.charAt(0)}</span>
          )}
        </div>
        <Typography variant="body1" weight="bold">
          {info.name}
        </Typography>
      </section>

      <section className="restore-notes">
        <Typography
          variant="caption1"
          weight="bold"
          color="semantic.foreground.neutral.secondary"
        >
          {T.restoreInfoTitle}
        </Typography>
        <ul className="restore-notes-list">
          {T.restoreNotes.map((note) => (
            <li key={note}>
              <Typography
                variant="body2"
                color="semantic.foreground.neutral.secondary"
              >
                {note}
              </Typography>
            </li>
          ))}
        </ul>
      </section>

      <div className="restore-actions">
        <Button
          type="button"
          size="large"
          fullWidth
          loading={restore.isPending}
          disabled={isPending}
          onClick={() => restore.mutate()}
        >
          {T.restoreAction}
        </Button>
        <Button
          type="button"
          size="large"
          fullWidth
          variant="outlined"
          color="assistive"
          loading={startNew.isPending}
          disabled={isPending}
          onClick={() => void onConfirmStartNew()}
        >
          {T.startNewAction}
        </Button>
      </div>
    </div>
  )
}
