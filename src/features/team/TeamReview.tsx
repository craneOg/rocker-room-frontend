import { Button, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { withConfirmation } from '../../shared/api/handlers'
import { formatKstYmd } from '../../shared/lib/time'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { TeamBadges } from './teamBits'
import {
  confirmDialog,
  partSummaryText,
  useTeamContext,
  useTeamWrite,
  type TeamContext,
} from './teamHooks'
import {
  getTeam,
  listTeams,
  teamKey,
  teamsKey,
  transitionTeam,
  type TeamCard,
} from './teamApi'
import { TEAM_COPY as T } from './teamCopy'

/** TEAM-005: an officer approves or rejects the teams members submitted (API-071 / 072). */
export function TeamReview() {
  const c = useTeamContext()
  const teams = useQuery({
    queryKey: [...teamsKey(c.clubId, c.performanceId), 'list', 'submitted'],
    queryFn: ({ signal }) =>
      listTeams(c.clubId, c.performanceId, { status: ['SUBMITTED'] }, signal),
  })
  // 제출 순: oldest submission first. Without a `submittedAt` on every item the server order stays.
  const fetched = teams.data?.items ?? []
  const items = fetched.every((t) => t.submittedAt)
    ? [...fetched].sort(
        (a, b) =>
          Date.parse(a.submittedAt ?? '') - Date.parse(b.submittedAt ?? ''),
      )
    : fetched
  const active = c.perf?.status === 'ACTIVE'
  return (
    <div className="start" data-screen-id="TEAM-005">
      {c.perf && !active ? (
        <div className="team-banner" role="status">
          <Typography variant="body2">{T.reviewNotActive}</Typography>
        </div>
      ) : null}
      {teams.isPending ? <ListSkeleton /> : null}
      {teams.isError ? (
        <ErrorState onRetry={() => void teams.refetch()} />
      ) : null}
      {teams.isSuccess && items.length === 0 ? (
        <EmptyState description={T.emptyReview} />
      ) : null}
      <ul className="perf-list">
        {items.map((t) => (
          <ReviewCard key={t.id} c={c} team={t} active={active} />
        ))}
      </ul>
    </div>
  )
}

function ReviewCard({
  c,
  team,
  active,
}: {
  c: TeamContext
  team: TeamCard
  active: boolean
}) {
  const write = useTeamWrite(c)
  const [open, setOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  // ponytail: one detail read per card (the applied count and the open view); batch it if the queue grows long.
  const detail = useQuery({
    queryKey: teamKey(c.clubId, c.performanceId, team.id),
    queryFn: () => getTeam(c.clubId, c.performanceId, team.id),
  })
  const d = detail.data
  const applied = d?.members.filter((m) => m.participationStatus === 'APPLIED')
  const version = d?.team.version ?? team.version

  const approve = async () => {
    if (
      await confirmDialog(
        T.approveTitle(team.name),
        T.approveBody(applied?.length ?? 0),
        T.approve,
      )
    )
      write.mutate({
        run: () =>
          transitionTeam(c.clubId, c.performanceId, team.id, 'approve', {
            version,
          }),
        done: T.approved,
      })
  }

  return (
    <li className="perf-card">
      <div className="perf-card-head">
        <Typography variant="body1" weight="bold">
          {team.name}
        </Typography>
        <TeamBadges team={team} />
      </div>
      <Typography variant="caption1">
        {[
          team.submittedAt
            ? T.submittedOn(formatKstYmd(team.submittedAt))
            : null,
          T.leader(team.leaderDisplayName),
          T.members(team.memberCount),
          T.reviewSongs(team.candidateSongCount ?? 0),
          applied && applied.length > 0
            ? T.reviewApplied(applied.length)
            : null,
        ]
          .filter((s) => s !== null)
          .join(' · ')}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        color="assistive"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? T.collapse : T.expand}
      </Button>
      {open ? (
        <div className="team-review-body">
          {detail.isPending ? <ListSkeleton rows={2} /> : null}
          {detail.isError ? (
            <ErrorState onRetry={() => void detail.refetch()} />
          ) : null}
          {d ? (
            <>
              <ul className="perf-plain-list">
                {d.members.map((m) => (
                  <li key={m.id} className="team-row-line">
                    <Typography variant="body2" weight="bold">
                      {m.displayName}
                    </Typography>
                    <Typography variant="caption1">
                      {m.partName ?? T.partNone}
                    </Typography>
                    {m.participationStatus === 'APPLIED' ? (
                      <span className="perf-chip">{T.appliedBadge}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Typography variant="caption1">
                {partSummaryText(d.team.partSummary)}
              </Typography>
              <ul className="perf-plain-list">
                {d.candidateSongs.map((s) => (
                  <li key={s.id}>
                    <Typography variant="body2">
                      {s.artist ? `${s.title} - ${s.artist}` : s.title}
                    </Typography>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="team-actions">
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          disabled={!active || write.isPending}
          onClick={() => setRejecting(true)}
        >
          {T.reject}
        </Button>
        <Button
          size="small"
          disabled={!active || write.isPending || !d}
          onClick={() => void approve()}
        >
          {T.approve}
        </Button>
      </div>
      {rejecting ? (
        <ReasonModal
          open
          title={T.rejectTitle}
          description={T.rejectBody}
          actionLabel={T.reject}
          loading={write.isPending}
          onClose={() => setRejecting(false)}
          onSubmit={(reason) => {
            setRejecting(false)
            write.mutate({
              // A CONFIRMED song in the team's scope asks for confirmation first (CONFIRMED_SONGS_IN_TEAM_SCOPE).
              run: () =>
                withConfirmation((confirmed) =>
                  transitionTeam(c.clubId, c.performanceId, team.id, 'reject', {
                    version,
                    reason,
                    confirmed,
                  }),
                ),
              done: T.rejected,
            })
          }}
        />
      ) : null}
    </li>
  )
}
