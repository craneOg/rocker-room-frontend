import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import {
  formatKstDay,
  formatKstShort,
  formatKstTime,
} from '../../shared/lib/time'
import { Badge } from '../../shared/ui/Badge'
import type { BadgeValue } from '../../shared/ui/badges'
import { feedback } from '../../shared/ui/feedbackBus'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { getMember } from '../club/api'
import { ActionModal } from '../club/ManageBits'
import { getPerformance, performanceKey } from './api'
import type { FeatureState, PerformanceDetail as Detail } from './types'
import {
  applyParticipation,
  getMyParticipation,
  invalidatePerformance,
  type MyParticipation,
} from './viewApi'
import { performanceDate } from './viewBits'
import { PRESET_LABEL, VIEW_COPY as T } from './viewCopy'
import { WithdrawDialog } from './WithdrawDialog'
import './view.css'

const DAY = 86_400_000

/** COM-002 #2: the stored state plus what the deadline makes of it. */
function featureBadge(
  state: FeatureState,
  deadline: string | null,
): BadgeValue<'feature'> {
  if (state === 'OPEN' && deadline !== null) {
    const left = Date.parse(deadline) - Date.now()
    if (left <= 0) return 'DEADLINE_PASSED'
    if (left <= DAY) return 'DEADLINE_SOON'
  }
  return state === 'OPEN'
    ? 'OPEN'
    : state === 'DISABLED'
      ? 'DISABLED'
      : 'CLOSED'
}

type FeatureRow = {
  key: string
  name: string
  state: FeatureState
  deadline: string | null
  to: string | null
  progress: string | null
}

function featureRows(
  d: Detail,
  me: MyParticipation | null,
  base: string,
  canApply: boolean,
): FeatureRow[] {
  const { policy: p } = d
  const g = me?.progress
  const rows: FeatureRow[] = [
    {
      key: 'application',
      name: T.featureName.application,
      state: p.applicationState,
      deadline: p.applicationDeadline,
      // 4-1 opens from the row only while applying is possible.
      to: canApply ? '#apply' : null,
      progress: null,
    },
    {
      key: 'team',
      name: T.featureName.team,
      state: p.teamApplicationState,
      deadline: p.teamApplicationDeadline,
      to: `${base}/teams/apply`,
      progress: null,
    },
    {
      key: 'candidate',
      name: T.featureName.candidate,
      state: p.candidateState,
      deadline: p.candidateDeadline,
      to: `${base}/songs/new`,
      progress: g?.candidateSongs
        ? T.progressCandidate(g.candidateSongs.used, g.candidateSongs.limit)
        : null,
    },
    {
      key: 'playability',
      name: T.featureName.playability,
      state: p.playabilityState,
      deadline: p.playabilityDeadline,
      to: `${base}/songs`,
      progress:
        g?.unansweredPlayabilityCount != null
          ? T.progressPlayability(g.unansweredPlayabilityCount)
          : null,
    },
    {
      key: 'vote',
      name: T.featureName.vote,
      state: p.voteState,
      deadline: p.voteDeadline,
      to: `${base}/songs`,
      progress: g?.votes ? T.progressVote(g.votes.used, g.votes.limit) : null,
    },
    {
      key: 'availability',
      name: T.featureName.availability,
      state: p.availabilityState,
      deadline: p.availabilityDeadline,
      to: `${base}/availability`,
      progress:
        g?.availabilitySlotCount != null
          ? T.progressAvailability(g.availabilitySlotCount)
          : null,
    },
  ]
  // A feature the performance does not use is not listed.
  return rows.filter((r) => r.state !== 'DISABLED')
}

function ApplySheet({
  clubId,
  performanceId,
  title,
  deadline,
  onClose,
}: {
  clubId: string
  performanceId: string
  title: string
  deadline: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const run = useMutation({
    mutationFn: () => applyParticipation(clubId, performanceId),
    onSuccess: async () => {
      await invalidatePerformance(qc, clubId, performanceId)
      feedback.toast(T.applied, 'positive')
      onClose()
    },
  })
  return (
    <ActionModal
      open
      title={T.applyTitle(title)}
      actionLabel={T.apply}
      loading={run.isPending}
      onClose={onClose}
      onSubmit={() => run.mutate()}
    >
      <Typography variant="body2">{T.applyBody}</Typography>
      {deadline ? (
        <Typography variant="caption1">
          {T.applyDeadline(formatKstShort(deadline))}
        </Typography>
      ) : null}
    </ActionModal>
  )
}

/** PERF-003 4: my status on this performance and what I can do about it. */
function MyCard({
  me,
  canApply,
  guestLike,
  typeKnown,
  applicationOpen,
  actionable,
  base,
  onApply,
  onWithdraw,
}: {
  me: MyParticipation | null
  canApply: boolean
  guestLike: boolean
  /** False while the member type loads: no hint yet, to avoid a wrong one flashing. */
  typeKnown: boolean
  applicationOpen: boolean
  /** Apply and withdraw only exist while the performance is ACTIVE (2.1). */
  actionable: boolean
  base: string
  onApply: () => void
  onWithdraw: () => void
}) {
  const status = me?.status
  return (
    <section className="start-card perf-section" aria-label={T.myCard}>
      <Typography variant="body1" weight="bold" as="h2">
        {T.myCard}
      </Typography>
      {status ? <Badge kind="participation" value={status} /> : null}
      {status === undefined ? (
        canApply ? (
          <>
            <Typography variant="body2">{T.canApplyHint}</Typography>
            <Button size="small" onClick={onApply}>
              {T.apply}
            </Button>
          </>
        ) : typeKnown ? (
          <Typography variant="body2">
            {guestLike ? T.guestHint : T.officerPicks}
          </Typography>
        ) : null
      ) : null}
      {status === 'APPLIED' ? (
        <>
          <Typography variant="body2">{T.appliedHint}</Typography>
          {actionable ? (
            <Button
              size="small"
              variant="outlined"
              color="assistive"
              onClick={onWithdraw}
            >
              {T.cancelApply}
            </Button>
          ) : null}
        </>
      ) : null}
      {status === 'APPROVED' && me ? (
        <>
          {me.myTeams.length > 0 ? (
            <div>
              <Typography variant="caption1">{T.myTeams}</Typography>
              <ul className="perf-plain-list">
                {me.myTeams.map((t) => (
                  <li key={t.teamId}>
                    <Typography variant="body2">{t.name}</Typography>
                    {t.isLeader ? (
                      <span className="perf-chip">{T.leader}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {me.myPlayingSongs.length > 0 ? (
            <div>
              <Typography variant="caption1">{T.myPlaying}</Typography>
              <ul className="perf-plain-list">
                {[...me.myPlayingSongs]
                  .sort(
                    (a, b) =>
                      (a.setlistOrder ?? Infinity) -
                      (b.setlistOrder ?? Infinity),
                  )
                  .map((s) => (
                    <li key={s.songId}>
                      <Typography variant="body2">
                        {`${s.setlistOrder ?? T.noOrder} · ${s.title} (${s.partName})`}
                      </Typography>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {actionable ? (
            <Button
              size="small"
              variant="outlined"
              color="assistive"
              onClick={onWithdraw}
            >
              {T.withdraw}
            </Button>
          ) : null}
        </>
      ) : null}
      {(status === 'REJECTED' || status === 'WITHDRAWN') &&
      applicationOpen &&
      canApply ? (
        <Button size="small" onClick={onApply}>
          {T.reapply}
        </Button>
      ) : null}
      <Link to={`${base}/auditions/mine`}>{T.auditionResult}</Link>
    </section>
  )
}

/** PERF-003 (the 개요 tab): header, banner, my card, feature rows and the summary. */
export function PerformanceDetail() {
  const { clubId = '', performanceId = '' } = useParams()
  const session = useSession()
  const admin = isClubAdmin(session, clubId)
  const base = `/clubs/${clubId}/performances/${performanceId}`
  const key = performanceKey(clubId, performanceId)
  const [sheet, setSheet] = useState<'apply' | 'withdraw' | null>(null)

  const detail = useQuery({
    queryKey: [...key, 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const me = useQuery({
    queryKey: [...key, 'me'],
    queryFn: () => getMyParticipation(clubId, performanceId),
  })
  const membership = session.memberships.find((m) => m.clubId === clubId)
  const graduated = membership?.status === 'GRADUATED'
  // The member type is not in the session: read the own member row (only needed to explain
  // why a non-participant cannot apply).
  const self = useQuery({
    queryKey: ['club-member', clubId, membership?.id],
    queryFn: () => getMember(clubId, membership?.id ?? ''),
    // A new or returning applicant: the others never need the type.
    enabled:
      membership !== undefined &&
      (!me.data ||
        me.data.status === 'REJECTED' ||
        me.data.status === 'WITHDRAWN'),
  })

  if (detail.isPending || me.isPending) return <ListSkeleton rows={6} />
  if (detail.isError || me.isError || !detail.data)
    return (
      <ErrorState
        onRetry={() => {
          void detail.refetch()
          void me.refetch()
        }}
      />
    )

  const { performance: p, policy, counts, nextSchedule } = detail.data
  const mine = me.data ?? null
  const active = p.status === 'ACTIVE'
  const applicationOpen =
    active &&
    policy.applicationState === 'OPEN' &&
    (policy.applicationDeadline === null ||
      Date.parse(policy.applicationDeadline) > Date.now())
  // Graduated and guest members cannot apply (P-01); an unreadable type is treated as unknown.
  const guestLike = graduated || self.data?.memberType === 'GUEST'
  const canApply =
    applicationOpen && !graduated && self.data?.memberType === 'REGULAR'
  const typeKnown = graduated || self.isSuccess || self.isError
  const rows = featureRows(detail.data, mine, base, canApply)
  const banner = T.banner[p.status]?.(admin)
  const tabs: [string, string, boolean][] = [
    ['', T.tabs.overview, true],
    ['/songs', T.tabs.songs, true],
    ['/teams', T.tabs.teams, true],
    ['/setlist', T.tabs.setlist, true],
    ['/schedules', T.tabs.schedules, true],
    ['/members', T.tabs.members, true],
    ['/auditions', T.tabs.auditions, admin],
  ]

  return (
    <div className="start" data-screen-id="PERF-003">
      <header className="perf-header">
        <div className="perf-card-head">
          <Typography variant="heading2" weight="bold" as="h1">
            {p.title}
          </Typography>
          <Badge kind="performance" value={p.status} />
        </div>
        <Typography variant="body2">{performanceDate(p)}</Typography>
        {p.location ? (
          <Typography variant="body2">{p.location}</Typography>
        ) : null}
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {PRESET_LABEL[p.preset] ?? p.preset}
        </Typography>
        {admin ? (
          <details className="perf-menu">
            <summary>{T.menu}</summary>
            <Link to={`${base}/edit`}>{T.menuEdit}</Link>
            <Link to={`${base}/policy`}>{T.menuPolicy}</Link>
            <Link to={`${base}/status`}>{T.menuStatus}</Link>
          </details>
        ) : null}
      </header>

      <nav className="perf-tabs" aria-label={T.detailTitle}>
        {tabs
          .filter(([, , shown]) => shown)
          .map(([path, label]) =>
            path === '' ? (
              <span key="overview" aria-current="page">
                {label}
              </span>
            ) : (
              <Link key={path} to={`${base}${path}`}>
                {label}
              </Link>
            ),
          )}
      </nav>

      {banner ? (
        <div className="start-card" role="status">
          <Typography variant="body2">{banner}</Typography>
        </div>
      ) : null}

      <MyCard
        me={mine}
        canApply={canApply}
        guestLike={guestLike}
        typeKnown={typeKnown}
        applicationOpen={applicationOpen}
        actionable={active}
        base={base}
        onApply={() => setSheet('apply')}
        onWithdraw={() => setSheet('withdraw')}
      />

      {rows.length > 0 ? (
        <section className="perf-section" aria-label={T.features}>
          <Typography variant="body1" weight="bold" as="h2">
            {T.features}
          </Typography>
          <ul className="perf-plain-list">
            {rows.map((r) => {
              const inner = (
                <>
                  <Typography variant="body2" weight="bold">
                    {r.name}
                  </Typography>
                  <Badge
                    kind="feature"
                    value={featureBadge(r.state, r.deadline)}
                  />
                  {r.progress ? (
                    <Typography variant="caption1">{r.progress}</Typography>
                  ) : null}
                </>
              )
              return (
                <li key={r.key}>
                  {r.to === '#apply' ? (
                    <button
                      type="button"
                      className="perf-feature"
                      onClick={() => setSheet('apply')}
                    >
                      {inner}
                    </button>
                  ) : r.to ? (
                    <Link to={r.to} className="perf-feature">
                      {inner}
                    </Link>
                  ) : (
                    <div className="perf-feature">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {counts ? (
        <section className="perf-section" aria-label={T.summary}>
          <Typography variant="body1" weight="bold" as="h2">
            {T.summary}
          </Typography>
          <div className="perf-tiles">
            <span className="start-card">
              {T.tileParticipants(counts.participants)}
            </span>
            <span className="start-card">{T.tileTeams(counts.teams)}</span>
            <span className="start-card">
              {T.tileCandidates(counts.candidateSongs)}
            </span>
            <span className="start-card">
              {T.tileConfirmed(counts.confirmedSongs)}
            </span>
            <span className="start-card">
              {`${T.nextSchedule} `}
              {nextSchedule
                ? `${formatKstDay(nextSchedule.startAt)} ${formatKstTime(nextSchedule.startAt)} ${nextSchedule.title}`
                : T.noSchedule}
            </span>
          </div>
        </section>
      ) : null}

      {sheet === 'apply' ? (
        <ApplySheet
          clubId={clubId}
          performanceId={performanceId}
          title={p.title}
          deadline={policy.applicationDeadline}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'withdraw' && mine ? (
        <WithdrawDialog
          clubId={clubId}
          performanceId={performanceId}
          performanceMemberId={mine.id}
          membershipId={mine.membershipId}
          title={T.withdrawTitle}
          body={T.withdrawImpact}
          reasonRequired={false}
          doneMessage={T.withdrawn}
          actionLabel={T.withdrawAction}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  )
}
