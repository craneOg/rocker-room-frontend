import { Button, Typography } from '@montage-ui/core'
import { IconChevronRight } from '@montage-ui/icon'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { isClubMember, useSession } from '../../shared/auth/session'
import { formatKstDay } from '../../shared/lib/time'
import { COPY } from '../../shared/ui/copy'
import { Badge } from '../../shared/ui/Badge'
import { feedback } from '../../shared/ui/feedbackBus'
import { respondToMembership, type Membership } from './api'
import { AUTH_COPY as T } from './copy'

/** AUTH-003: invites, join requests and the ways to join a club. */
export function Start() {
  const session = useSession()
  const { me, memberships } = session
  const [joinedClubId, setJoinedClubId] = useState<string>()
  const queryClient = useQueryClient()
  const [now] = useState(Date.now)

  const invites = memberships.filter((m) => m.status === 'INVITED')
  const applications = memberships.filter(
    (m) => m.status === 'PENDING' || m.status === 'REJECTED',
  )

  const respond = useMutation({
    mutationFn: (v: {
      m: Membership
      action: 'accept' | 'decline' | 'cancel-request'
    }) => respondToMembership(v.m, v.action),
    onSuccess: async (_, { m, action }) => {
      // The server already accepted: a failed refetch must not hide that from the guards.
      if (action === 'accept')
        queryClient.setQueryData<Membership[]>(['me', 'memberships'], (list) =>
          list?.map((x) =>
            x.membershipId === m.membershipId ? { ...x, status: 'ACTIVE' } : x,
          ),
        )
      await queryClient.invalidateQueries({ queryKey: ['me', 'memberships'] })
      if (action === 'accept') {
        feedback.toast(T.accepted)
        setJoinedClubId(m.clubId)
      } else {
        feedback.toast(action === 'decline' ? T.declined : T.requestCancelled)
      }
    },
  })

  const confirmThen = async (
    m: Membership,
    action: 'decline' | 'cancel-request',
  ) => {
    const decline = action === 'decline'
    const choice = await feedback.dialog({
      title: (decline ? T.declineTitle : T.cancelTitle)(m.clubName),
      description: decline ? T.declineDescription : T.cancelDescription,
      cancelLabel: decline ? COPY.cancel : T.close,
      confirmLabel: decline ? T.decline : T.cancelRequest,
      danger: true,
    })
    if (choice === 'confirm') respond.mutate({ m, action })
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(me?.handle ?? '')
      feedback.toast(T.idCopied)
    } catch {
      feedback.toast(COPY.unknownError, 'negative')
    }
  }

  // Wait until the refreshed memberships reach the guards, or the club would look like a 404.
  if (joinedClubId && isClubMember(session, joinedClubId))
    return <Navigate to={`/clubs/${joinedClubId}`} />

  return (
    <div className="start" data-screen-id="AUTH-003">
      <header className="start-section">
        <Typography variant="title1" weight="bold" as="h1">
          {T.greeting(me?.name ?? '')}
        </Typography>
        <Typography
          variant="body2"
          color="semantic.foreground.neutral.secondary"
        >
          {T.greetingSub}
        </Typography>
      </header>

      {invites.length > 0 ? (
        <section className="start-section">
          <Typography variant="body1" weight="bold" as="h2">
            {T.invites}
          </Typography>
          {invites.map((m) => {
            const expiresAt = m.inviteExpiresAt
            const expired = expiresAt ? Date.parse(expiresAt) <= now : false
            return (
              <article key={m.membershipId} className="start-card">
                <div className="start-card-text">
                  <Typography
                    variant="caption1"
                    color="semantic.foreground.neutral.tertiary"
                  >
                    {m.clubType}
                  </Typography>
                  <Typography variant="body1" weight="bold">
                    {m.clubName}
                  </Typography>
                  <Typography
                    variant="caption1"
                    color="semantic.foreground.neutral.secondary"
                  >
                    {expired
                      ? T.inviteExpired
                      : expiresAt
                        ? T.inviteUntil(formatKstDay(expiresAt))
                        : null}
                  </Typography>
                </div>
                <div className="start-card-actions">
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={expired || respond.isPending}
                    onClick={() => void confirmThen(m, 'decline')}
                  >
                    {T.decline}
                  </Button>
                  <Button
                    size="small"
                    disabled={expired}
                    loading={respond.isPending}
                    onClick={() => respond.mutate({ m, action: 'accept' })}
                  >
                    {T.accept}
                  </Button>
                </div>
              </article>
            )
          })}
        </section>
      ) : null}

      {applications.length > 0 ? (
        <section className="start-section">
          <Typography variant="body1" weight="bold" as="h2">
            {T.applications}
          </Typography>
          {applications.map((m) =>
            m.status === 'REJECTED' ? (
              <article
                key={m.membershipId}
                className="start-card start-card-rejected"
                role="status"
              >
                <div className="start-card-text">
                  <Typography variant="body1" weight="bold">
                    {m.clubName}
                  </Typography>
                  <Typography
                    variant="caption1"
                    color="semantic.foreground.negative.primary"
                  >
                    {T.rejected}
                  </Typography>
                </div>
              </article>
            ) : (
              <article key={m.membershipId} className="start-card">
                <div className="start-card-text">
                  <Typography variant="body1" weight="bold">
                    {m.clubName}
                  </Typography>
                  <div>
                    <Badge kind="membership" value="PENDING" />
                  </div>
                  {m.requestedAt ? (
                    <Typography
                      variant="caption1"
                      color="semantic.foreground.neutral.secondary"
                    >
                      {T.requestedOn(formatKstDay(m.requestedAt))}
                    </Typography>
                  ) : null}
                </div>
                <div className="start-card-actions">
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={respond.isPending}
                    onClick={() => void confirmThen(m, 'cancel-request')}
                  >
                    {T.cancelRequest}
                  </Button>
                </div>
              </article>
            ),
          )}
        </section>
      ) : null}

      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.waysTitle}
        </Typography>
        {T.ways.map(([to, title, body]) => (
          <Link key={to} to={to} className="start-card start-way">
            <div className="start-card-text">
              <Typography variant="body1" weight="bold">
                {title}
              </Typography>
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {body}
              </Typography>
            </div>
            <IconChevronRight aria-hidden />
          </Link>
        ))}
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.tertiary"
        >
          {T.idNote}
        </Typography>
        <div className="start-id">
          <Typography variant="body2" weight="bold">
            {T.myId(me?.handle ?? '')}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => void copyId()}
          >
            {T.copyId}
          </Button>
        </div>
      </section>
    </div>
  )
}
