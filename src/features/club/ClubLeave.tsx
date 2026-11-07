import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { Membership } from '../auth/api'
import { isClubMember, useSession } from '../../shared/auth/session'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { ListSkeleton } from '../../shared/ui/StateViews'
import { getLeavePreview, leaveClub, type LeavePreview } from './settingsApi'
import { SETTINGS_COPY as T } from './settingsCopy'
import { LoadError } from './SettingsViews'

const MEMBERSHIPS_KEY = ['me', 'memberships']
// What the user decided on: if any of it differs at the last moment, they must confirm again.
const signature = (p: LeavePreview) =>
  JSON.stringify([p.succession, p.performanceImpacts, p.teamLeaderCandidates])

/** CLUB-108: leave the current club after seeing who takes over (self only). */
export function ClubLeave() {
  const { clubId = '' } = useParams()
  const session = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const club = session.memberships.find(
    (m) => m.clubId === clubId && isClubMember(session, clubId),
  )
  const clubName = club?.club.name ?? ''
  const key = ['club', clubId, 'leave-preview']
  const fetchPreview = () => getLeavePreview(clubId)
  const preview = useQuery({ queryKey: key, queryFn: fetchPreview })
  // teamId -> chosen successor; a team without a pick uses its default (first candidate).
  const [picks, setPicks] = useState<Record<string, string>>({})

  const left = useRef<Membership>(null)
  // Dropping the membership while this screen is still shown would turn it into a 404 view.
  useEffect(
    () => () => {
      const membership = left.current
      if (!membership) return
      queryClient.setQueryData<Membership[]>(MEMBERSHIPS_KEY, (list) =>
        list?.filter((m) => m.id !== membership.id),
      )
      void queryClient.invalidateQueries({ queryKey: MEMBERSHIPS_KEY })
    },
    [queryClient],
  )

  const leave = useMutation({
    mutationFn: (v: { membership: Membership; data: LeavePreview }) =>
      leaveClub(
        clubId,
        v.membership.id,
        v.data.teamLeaderCandidates.flatMap((t) => {
          const membershipId = picks[t.teamId] ?? t.candidates[0]?.membershipId
          return membershipId ? [{ teamId: t.teamId, membershipId }] : []
        }),
      ),
    onSuccess: (_, { membership }) => {
      const next = session.memberships.find(
        (m) => m.clubId !== clubId && isClubMember(session, m.clubId),
      )
      // Dropped from the cache only once this screen is gone (see the effect below).
      left.current = membership
      void navigate(next ? `/clubs/${next.clubId}` : '/start', {
        replace: true,
      })
      feedback.toast(T.left)
    },
    // The successors may be stale (RULE_VIOLATION): show the server's current picture.
    onError: () => void queryClient.invalidateQueries({ queryKey: key }),
  })

  const confirmLeave = async (shown: LeavePreview) => {
    if (!club) return
    const choice = await feedback.dialog({
      title: T.leaveConfirmTitle(clubName),
      cancelLabel: T.cancel,
      confirmLabel: T.leaveConfirm,
      danger: true,
    })
    if (choice !== 'confirm') return
    // COM-004 R-3: look again right before acting.
    let fresh: LeavePreview
    try {
      fresh = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: fetchPreview,
        staleTime: 0,
      })
    } catch {
      return // the global handler has told the user
    }
    if (signature(fresh) !== signature(shown)) {
      setPicks({})
      await feedback.dialog({
        title: T.leaveChangedTitle,
        description: T.leaveChangedDescription,
        confirmLabel: COPY.confirm,
      })
      return
    }
    leave.mutate({ membership: club, data: fresh })
  }

  if (preview.isError)
    return <LoadError onRetry={() => void preview.refetch()} />
  const data = preview.data
  if (!data)
    return (
      <div className="start" data-screen-id="CLUB-108">
        <ListSkeleton rows={3} />
      </div>
    )

  const successor = data.succession
  const leaderTeams = data.teamLeaderCandidates
  return (
    <div className="start" data-screen-id="CLUB-108">
      <Typography variant="title2" weight="bold" as="h1">
        {T.leaveTitle}
      </Typography>
      <Typography variant="body2">{T.leaveNotice(clubName)}</Typography>

      {data.performanceImpacts.length > 0 ? (
        <section className="start-section">
          <Typography variant="body2" weight="bold">
            {T.leaveImpacts}
          </Typography>
          <ul className="restore-notes-list">
            {data.performanceImpacts.map((p) => (
              <li key={p.performanceId}>
                {p.teamName
                  ? `${p.performanceName} · ${p.teamName}`
                  : p.performanceName}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {successor ? (
        <section className="start-section">
          <Typography variant="body2" weight="bold">
            {T.leaveSuccession}
          </Typography>
          {successor.candidateName ? (
            <Typography variant="body1">{successor.candidateName}</Typography>
          ) : (
            <Typography
              variant="body2"
              color="semantic.foreground.negative.primary"
            >
              {T.leaveNoSuccessor}
            </Typography>
          )}
        </section>
      ) : null}

      {leaderTeams.map((t) => (
        <section key={t.teamId} className="start-section">
          <label htmlFor={`leader-${t.teamId}`}>
            <Typography variant="body2" weight="bold">
              {T.leaderSuccessor(`${t.performanceName} ${t.teamName}`)}
            </Typography>
          </label>
          <select
            id={`leader-${t.teamId}`}
            className="leave-select"
            disabled={t.candidates.length === 0}
            value={picks[t.teamId] ?? t.candidates[0]?.membershipId ?? ''}
            onChange={(e) =>
              setPicks((p) => ({ ...p, [t.teamId]: e.target.value }))
            }
          >
            {t.candidates.length === 0 ? (
              <option value="">{T.noLeader}</option>
            ) : (
              t.candidates.map((c) => (
                <option key={c.membershipId} value={c.membershipId}>
                  {c.displayName}
                </option>
              ))
            )}
          </select>
        </section>
      ))}

      <Button
        color="negative"
        size="large"
        disabled={!club}
        loading={leave.isPending}
        onClick={() => void confirmLeave(data)}
      >
        {T.leave}
      </Button>
    </div>
  )
}
