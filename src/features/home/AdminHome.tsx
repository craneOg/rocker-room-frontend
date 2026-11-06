import { Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { COPY } from '../../shared/ui/copy'
import { EmptyState, ListSkeleton } from '../../shared/ui/StateViews'
import {
  getAdminHome,
  type AdminHomeData,
  type CheckItem,
  type PerformanceCheck,
  type ResponseRate,
} from './api'
import { HOME_COPY as T } from './copy'

function Tile({
  label,
  value,
  to,
  dim,
}: {
  label: string
  value: string
  to?: string
  dim?: boolean
}) {
  const className = `start-card home-tile${dim ? ' is-zero' : ''}`
  const body = (
    <>
      <Typography
        variant="caption1"
        color="semantic.foreground.neutral.secondary"
      >
        {label}
      </Typography>
      <Typography variant="body1" weight="bold">
        {value}
      </Typography>
    </>
  )
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function Pending({
  pending,
  base,
  perfBase,
}: {
  pending: AdminHomeData['pending']
  base: string
  /** Performance-level tiles need a performance; the first one in progress stands in. */
  perfBase: string | null
}) {
  const tiles: [string, number, string | undefined][] = [
    [T.pendingJoin, pending.joinRequests, `${base}/join-requests`],
    [
      T.pendingInvite,
      pending.invitesWaiting,
      `${base}/join-requests?tab=invites`,
    ],
    [
      T.pendingParticipation,
      pending.participationRequests,
      perfBase ? `${perfBase}/members` : undefined,
    ],
    [
      T.pendingTeam,
      pending.teamReviews,
      perfBase ? `${perfBase}/teams/review` : undefined,
    ],
    [
      T.pendingAudition,
      pending.auditionReviews,
      perfBase ? `${perfBase}/auditions` : undefined,
    ],
  ]
  return (
    <section className="start-section">
      <Typography variant="body1" weight="bold" as="h2">
        {T.pending}
      </Typography>
      <div className="home-tiles">
        {tiles.map(([label, n, to]) => (
          <Tile
            key={label}
            label={label}
            value={T.count(n)}
            to={to}
            dim={n === 0}
          />
        ))}
      </div>
    </section>
  )
}

/** Where a checklist row leads (screen spec 6); warnings L-07~L-11 have no target. */
function checkPath(perf: string, id: string) {
  switch (id) {
    case 'L-01':
      return `${perf}/setlist`
    case 'L-02':
    case 'L-03':
      return `${perf}/songs`
    case 'L-04':
      return `${perf}/teams/review`
    case 'L-05':
      return `${perf}/members`
    case 'L-06':
      return `${perf}/auditions`
    default:
      return undefined
  }
}

function checkMark(i: CheckItem) {
  if (i.satisfied) return { icon: '✓', text: T.checkMark.ok }
  return i.kind === 'WARNING'
    ? { icon: '△', text: T.checkMark.warning }
    : { icon: '✕', text: T.checkMark.blocker }
}

function CheckRow({ item, to }: { item: CheckItem; to?: string }) {
  const mark = checkMark(item)
  const body: ReactNode = (
    <>
      <span aria-label={mark.text}>{mark.icon}</span>
      <Typography variant="body2">
        {(T.check[item.checkId] ?? (() => item.checkId))(item.count)}
      </Typography>
    </>
  )
  return to ? (
    <Link to={to} className="start-card start-card-actions">
      {body}
    </Link>
  ) : (
    <div className="start-card start-card-actions">{body}</div>
  )
}

function Rate({
  label,
  rate,
  to,
}: {
  label: string
  rate: ResponseRate | null
  to: string
}) {
  if (!rate) return null
  return <Link to={to}>{T.rate(label, rate.answered, rate.total)}</Link>
}

function PerformanceCheckCard({
  check,
  base,
}: {
  check: PerformanceCheck
  base: string
}) {
  const perf = `${base}/performances/${check.performanceId}`
  const rates = check.responseRates
  return (
    <details className="start-card home-check">
      <summary>
        <Typography variant="body1" weight="bold" as="span">
          {T.checksSummary(check.performanceName, check.satisfied, check.total)}
        </Typography>
      </summary>
      <div className="home-check-list">
        {check.items.map((i) => (
          <CheckRow key={i.checkId} item={i} to={checkPath(perf, i.checkId)} />
        ))}
        <Rate
          label={T.ratePlayability}
          rate={rates.playability}
          to={`${perf}/songs/status`}
        />
        <Rate
          label={T.rateVote}
          rate={rates.vote}
          to={`${perf}/songs/status`}
        />
        <Rate
          label={T.rateAvailability}
          rate={rates.availability}
          to={`${perf}/availability/common`}
        />
      </div>
    </details>
  )
}

function Stats({
  stats,
  base,
}: {
  stats: AdminHomeData['clubStats']
  base: string
}) {
  const members = `${base}/members`
  const perfs = `${base}/performances`
  const p = stats.performances
  const tiles: [string, number, string][] = [
    [T.statsMembers, stats.activeMembers, members],
    [T.statsAdmins, stats.admins, members],
    [T.statsGraduated, stats.graduated, members],
    [T.statsGuests, stats.guests, members],
    [T.statsDraft, p.draft, perfs],
    [T.statsActive, p.active, perfs],
    [T.statsLocked, p.locked, perfs],
    [T.statsFinished, p.finished, perfs],
  ]
  return (
    <section className="start-section">
      <Typography variant="body1" weight="bold" as="h2">
        {T.stats}
      </Typography>
      <div className="home-tiles">
        {tiles.map(([label, n, to]) => (
          <Tile key={label} label={label} value={String(n)} to={to} />
        ))}
      </div>
    </section>
  )
}

/** HOME-001 5~7 (admin only): pending approvals, performance readiness, club stats. */
export function AdminHome({ clubId, base }: { clubId: string; base: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['home', clubId, 'admin'],
    queryFn: () => getAdminHome(clubId),
  })

  if (isPending) return <ListSkeleton />
  if (isError)
    return (
      <EmptyState
        description={COPY.unknownError}
        actionLabel={COPY.retry}
        onAction={() => void refetch()}
      />
    )
  const first = data.performanceChecks[0]
  return (
    <>
      <Pending
        pending={data.pending}
        base={base}
        perfBase={first ? `${base}/performances/${first.performanceId}` : null}
      />
      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.checks}
        </Typography>
        {data.performanceChecks.length === 0 ? (
          <EmptyState description={T.checksEmpty} />
        ) : (
          data.performanceChecks.map((c) => (
            <PerformanceCheckCard key={c.performanceId} check={c} base={base} />
          ))
        )}
      </section>
      <Stats stats={data.clubStats} base={base} />
    </>
  )
}
