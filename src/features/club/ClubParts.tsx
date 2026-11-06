import { Button, ContentBadge, Typography } from '@montage-ui/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { feedback } from '../../shared/ui/feedbackBus'
import {
  JoinTargetGoneError,
  requestJoin,
  type ClubSummary,
  type JoinPreview,
} from './api'
import { CLUB_COPY as T, CLUB_TYPE_LABEL } from './copy'

/** Query keys of everything that shows `existingMembershipStatus` start with this. */
export const CLUB_JOIN_KEY = 'club-join'

export function ClubInfo({ club }: { club: ClubSummary }) {
  return (
    <div className="start-card-text">
      <div>
        <ContentBadge size="small" color="neutral" variant="outlined">
          {CLUB_TYPE_LABEL[club.clubType] ?? club.clubType}
        </ContentBadge>
      </div>
      <Typography variant="body1" weight="bold">
        {club.name}
      </Typography>
      <Typography
        variant="caption1"
        color="semantic.foreground.neutral.secondary"
        className="club-description"
      >
        {club.description || T.noDescription}
      </Typography>
    </div>
  )
}

/** Sends the join request, then tells the user and goes to AUTH-003 ("신청한 가입"). */
export function useJoinRequest() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      club: ClubSummary
      body: Parameters<typeof requestJoin>[1]
    }) => requestJoin(v.club.id, v.body),
    onSuccess: async (_, { club }) => {
      await queryClient.invalidateQueries({ queryKey: ['me', 'memberships'] })
      await feedback.dialog({
        title: T.applyDoneTitle,
        description: T.applyDone(club.name),
        confirmLabel: T.confirm,
      })
      navigate('/start')
    },
    // A conflict or a vanished club means things changed meanwhile: show the current state again.
    onError: (e) => {
      void queryClient.invalidateQueries({ queryKey: [CLUB_JOIN_KEY] })
      if (e instanceof JoinTargetGoneError)
        feedback.toast(T.applyGone, 'negative')
    },
  })
}

/** C-06: the apply button, or the status notice when the user already has a membership. */
export function JoinAction({
  preview,
  pending,
  onApply,
}: {
  preview: JoinPreview
  pending: boolean
  onApply: () => void
}) {
  const navigate = useNavigate()
  const { club, existingMembershipStatus: status, canApply } = preview
  const notice = (text: string, link?: { to: string; label: string }) => (
    <div className="start-card-actions">
      <Typography
        variant="caption1"
        color="semantic.foreground.neutral.secondary"
      >
        {text}
      </Typography>
      {link ? (
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={() => navigate(link.to)}
        >
          {link.label}
        </Button>
      ) : null}
    </div>
  )

  if (status === 'ACTIVE' || status === 'ON_LEAVE' || status === 'GRADUATED')
    return notice(T.alreadyMember, {
      to: `/clubs/${club.id}`,
      label: T.goClub,
    })
  if (status === 'PENDING') return notice(T.alreadyPending)
  if (status === 'INVITED')
    return notice(T.hasInvite, { to: '/start', label: T.viewInvite })
  return (
    <Button
      size="small"
      disabled={!canApply || pending}
      loading={pending}
      onClick={onApply}
    >
      {T.apply}
    </Button>
  )
}
