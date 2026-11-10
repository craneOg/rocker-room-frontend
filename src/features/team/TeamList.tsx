import { Button, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { TeamCardLink } from './teamBits'
import { useTeamContext } from './teamHooks'
import { listTeams, teamsKey, type TeamStatus } from './teamApi'
import { TEAM_COPY as T } from './teamCopy'

type Filter = 'all' | 'approved' | 'draft' | 'closed'

const FILTER_STATUS: Record<Filter, TeamStatus[] | undefined> = {
  all: undefined,
  approved: ['APPROVED'],
  draft: ['DRAFT'],
  closed: ['REJECTED', 'WITHDRAWN'],
}

/** TEAM-001: officers see every team; members see approved teams and the teams they belong to. */
export function TeamList() {
  const c = useTeamContext()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')

  const teams = useQuery({
    queryKey: [...teamsKey(c.clubId, c.performanceId), 'list', filter],
    queryFn: ({ signal }) =>
      listTeams(
        c.clubId,
        c.performanceId,
        { status: FILTER_STATUS[filter] },
        signal,
      ),
  })
  const items = teams.data?.items ?? []
  const counts = teams.data?.statusCounts
  // The filter chips are the officer's; "내 팀" is shown while no status is picked.
  const split = !c.admin || filter === 'all'
  const mine = split ? items.filter((t) => t.isMine) : []
  const rest = split ? items.filter((t) => !t.isMine) : items

  const status = c.perf?.status
  const canCreate = c.admin && (status === 'DRAFT' || status === 'ACTIVE')
  const canApply =
    status === 'ACTIVE' &&
    c.policy?.teamApplicationState === 'OPEN' &&
    c.regular

  const chips: [Filter | 'review', string][] = [
    ['all', T.filterAll],
    ['approved', T.filterApproved],
    ['review', T.filterSubmitted(counts?.SUBMITTED ?? 0)],
    ['draft', T.filterDraft],
    ['closed', T.filterClosed],
  ]

  return (
    <div className="start" data-screen-id="TEAM-001">
      {c.admin ? (
        <div className="chip-row" role="group" aria-label={T.filterLabel}>
          {chips.map(([key, label]) => (
            <Button
              key={key}
              size="small"
              variant={key === filter ? 'solid' : 'outlined'}
              color="assistive"
              aria-pressed={key === filter}
              onClick={() =>
                key === 'review'
                  ? void navigate(`${c.base}/teams/review`)
                  : setFilter(key)
              }
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}

      {teams.isPending ? <ListSkeleton /> : null}
      {teams.isError ? (
        <ErrorState onRetry={() => void teams.refetch()} />
      ) : null}
      {teams.isSuccess && items.length === 0 ? (
        <EmptyState description={T.emptyTeams} />
      ) : null}

      {mine.length > 0 ? (
        <section className="perf-section" aria-label={T.myTeams}>
          <Typography variant="body1" weight="bold">
            {T.myTeams}
          </Typography>
          <ul className="perf-list">
            {mine.map((t) => (
              <TeamCardLink key={t.id} team={t} base={c.base} />
            ))}
          </ul>
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section className="perf-section" aria-label={T.allTeams}>
          {mine.length > 0 ? (
            <Typography variant="body1" weight="bold">
              {T.allTeams}
            </Typography>
          ) : null}
          <ul className="perf-list">
            {rest.map((t) => (
              <TeamCardLink key={t.id} team={t} base={c.base} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="team-actions">
        {canCreate ? (
          <Button onClick={() => void navigate(`${c.base}/teams/new`)}>
            {`+ ${T.createTeam}`}
          </Button>
        ) : null}
        {canApply ? (
          <Button
            variant={canCreate ? 'outlined' : 'solid'}
            onClick={() => void navigate(`${c.base}/teams/apply`)}
          >
            {`+ ${T.applyTeam}`}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
