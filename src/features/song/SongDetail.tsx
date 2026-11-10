import { Button, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import {
  formatKstDay,
  formatKstTime,
  formatKstYmd,
} from '../../shared/lib/time'
import { Badge } from '../../shared/ui/Badge'
import { WarningBanner } from '../../shared/ui/WarningBanner'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import {
  decisionsFor,
  DECISION_LABEL,
  inScope,
  inputRights,
  isOpen,
  useArrivalWarnings,
  useSongContext,
} from './songBits'
import { SONG_COPY as T } from './songCopy'
import { getSong, songKey, type SessionRow } from './songApi'
import { PlayabilityPanel, ResultsPanel, VotePanel } from './SongRespond'
import { SongSheet, type SheetAction } from './SongSheets'
import './song.css'

/** SONG-003: one song with the requester's playability and vote, the results, staffing and decisions. */
export function SongDetail() {
  const { clubId = '', performanceId = '', songId = '' } = useParams()
  const { hash } = useLocation()
  const ctx = useSongContext(clubId, performanceId)
  const [arrival, clearArrival] = useArrivalWarnings()
  const [now] = useState(Date.now)
  const { perf, policy, me, admin } = ctx
  const [sheet, setSheet] = useState<SheetAction>()
  const detail = useQuery({
    queryKey: [...songKey(clubId, performanceId, songId), 'detail'],
    queryFn: () => getSong(clubId, performanceId, songId),
  })
  const loaded = detail.isSuccess && ctx.ready
  useEffect(() => {
    if (loaded && hash === '#playability')
      document.getElementById('playability')?.scrollIntoView?.()
  }, [loaded, hash])

  if (detail.isPending || ctx.loading) return <ListSkeleton rows={6} />
  if (detail.isError || ctx.error || !detail.data || !perf || !policy)
    return (
      <ErrorState
        onRetry={() => {
          void detail.refetch()
          ctx.refetch()
        }}
      />
    )

  const { song, requirements, sessions, schedules, auditions } = detail.data
  const ids = { clubId, performanceId, songId }
  const over = perf.status === 'FINISHED' || perf.status === 'CANCELED'
  const candidate = song.status === 'PROPOSED'
  const isProposer = ctx.membershipId === song.proposedBy.membershipId
  const rights = inputRights(song, perf, policy, me)
  const scoped = inScope(song, me)
  const base = candidate && perf.status === 'ACTIVE' && scoped
  const showPlayability =
    base &&
    policy.playabilityState !== 'DISABLED' &&
    (me?.status === 'APPLIED' || me?.status === 'APPROVED')
  const showVote =
    base && policy.voteState !== 'DISABLED' && me?.status === 'APPROVED'
  const withdrawn = song.status === 'WITHDRAWN'
  const decisions = admin ? decisionsFor(song.status, perf.status) : []
  const canEdit =
    admin && candidate && ['DRAFT', 'ACTIVE'].includes(perf.status)
  const canRemove = admin && candidate && !over
  const canWithdraw =
    isProposer &&
    candidate &&
    perf.status === 'ACTIVE' &&
    isOpen(policy.candidateState, policy.candidateDeadline)
  const showMenu = canEdit || canRemove || canWithdraw
  const canEditRequirements =
    admin && !withdrawn && !over && song.status !== 'REJECTED'
  const byStart = [...schedules].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  )
  const upcoming = byStart.filter((s) => Date.parse(s.endAt) >= now)
  const past = byStart.filter((s) => Date.parse(s.endAt) < now)
  const playersOf = (partId: string) =>
    sessions.filter((s) => s.partId === partId).length

  const scheduleRow = (s: (typeof schedules)[number]) => (
    <li
      key={s.id}
      className={s.status === 'CANCELED' ? 'badge-strike' : undefined}
    >
      <Link
        to={`/clubs/${clubId}/performances/${performanceId}/schedules/${s.id}`}
      >
        {`${formatKstDay(s.startAt)} ${formatKstTime(s.startAt)} ${s.title}`}
      </Link>
      {s.status === 'CANCELED' ? ` (${T.canceledSchedule})` : ''}
    </li>
  )
  const playerRow = (s: SessionRow) => (
    <li key={`${s.performanceMemberId}-${s.partId}`} className="song-row">
      <span className="song-grow">{`${ctx.partName(s.partId)} · ${s.displayName}`}</span>
      {s.isSupport && song.assignedTeamId ? (
        <span className="perf-chip">{T.supportBadge}</span>
      ) : null}
      {s.isGuest ? <span className="perf-chip">{T.guestBadge}</span> : null}
    </li>
  )

  return (
    <div className="start song-screen" data-screen-id="SONG-003">
      <WarningBanner warnings={arrival} onClose={clearArrival} />
      <header className="song-header">
        <div className="song-card-head">
          <Typography variant="heading2" weight="bold">
            {song.artist ? `${song.title} – ${song.artist}` : song.title}
          </Typography>
          <Badge
            kind="song"
            value={song.status}
            suffix={
              song.status === 'CONFIRMED' && song.setlistOrder !== null
                ? `· ${song.setlistOrder}번`
                : undefined
            }
          />
          {showMenu ? (
            <details className="perf-menu song-menu">
              <summary aria-label={T.menu}>{T.moreStatus}</summary>
              {canWithdraw && !admin ? (
                <button type="button" onClick={() => setSheet('withdraw')}>
                  {T.menuWithdraw}
                </button>
              ) : null}
              {canEdit ? (
                <button type="button" onClick={() => setSheet('edit')}>
                  {T.menuEdit}
                </button>
              ) : null}
              {canRemove ? (
                <button type="button" onClick={() => setSheet('remove')}>
                  {T.menuDelete}
                </button>
              ) : null}
              {canWithdraw && admin && isProposer ? (
                <button type="button" onClick={() => setSheet('withdraw')}>
                  {T.menuWithdraw}
                </button>
              ) : null}
            </details>
          ) : null}
        </div>
        {canWithdraw && !admin ? (
          <Typography variant="caption1">{T.changeAfterProposal}</Typography>
        ) : null}
        {song.decisionNote ? (
          <p className="song-note">{T.decisionNote(song.decisionNote)}</p>
        ) : null}
        <dl className="song-facts">
          <dt>{T.scopeLabel}</dt>
          <dd>{song.candidateTeamName ?? T.scopeAll}</dd>
          {song.status === 'CONFIRMED' ? (
            <>
              <dt>{T.assignedTeamLabel}</dt>
              <dd>
                {song.assignedTeamName ?? T.noTeam}
                {admin && !over ? (
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    onClick={() => setSheet('team')}
                  >
                    {T.changeTeam}
                  </Button>
                ) : null}
              </dd>
              {song.setlistOrder !== null ? (
                <>
                  <dt>{T.orderLabel}</dt>
                  <dd>{T.orderValue(song.setlistOrder)}</dd>
                </>
              ) : null}
            </>
          ) : null}
          <dt>{T.proposerLabel}</dt>
          <dd>{`${song.proposedBy.displayName} · ${formatKstYmd(song.createdAt)}`}</dd>
          {song.referenceUrl?.startsWith('https://') ? (
            <>
              <dt>{T.referenceLink}</dt>
              <dd>
                <a
                  href={song.referenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {song.referenceUrl}
                </a>
              </dd>
            </>
          ) : null}
          {song.memo ? (
            <>
              <dt>{T.memo}</dt>
              <dd>{song.memo}</dd>
            </>
          ) : null}
        </dl>
      </header>

      {withdrawn ? (
        <Typography variant="body2">
          {song.withdrawalType === 'ADMIN'
            ? T.withdrawnAdmin
            : T.withdrawnProposer}
        </Typography>
      ) : (
        <>
          {showPlayability ? (
            <PlayabilityPanel
              ids={ids}
              ctx={ctx}
              editable={!!rights.playability}
            />
          ) : null}
          {showVote ? (
            <VotePanel
              ids={ids}
              ctx={ctx}
              editable={!!rights.vote}
              used={me?.progress.votes?.used ?? null}
            />
          ) : null}
          <ResultsPanel ids={ids} ctx={ctx} inScope={scoped} />

          <section className="song-section" aria-label={T.requirementsTitle}>
            <div className="song-card-head">
              <Typography variant="body1" weight="bold">
                {T.requirementsTitle}
              </Typography>
              {canEditRequirements ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  onClick={() => setSheet('requirements')}
                >
                  {T.requirementsEdit}
                </Button>
              ) : null}
            </div>
            {requirements.length === 0 ? (
              <Typography variant="caption1">{T.requirementsNone}</Typography>
            ) : (
              <div className="chip-row">
                {requirements.map((r) => {
                  const have = playersOf(r.partId)
                  const confirmed = song.status === 'CONFIRMED'
                  return (
                    <span key={r.partId} className="perf-chip">
                      {confirmed
                        ? T.partProgress(
                            ctx.partName(r.partId),
                            have,
                            r.requiredCount,
                          )
                        : T.partCount(ctx.partName(r.partId), r.requiredCount)}
                      {confirmed && have < r.requiredCount
                        ? ` ${T.requirementShort}`
                        : ''}
                      {confirmed && have > r.requiredCount
                        ? ` ${T.requirementExcess}`
                        : ''}
                    </span>
                  )
                })}
              </div>
            )}
          </section>

          {song.status === 'CONFIRMED' ? (
            <section className="song-section" aria-label={T.playersTitle}>
              <div className="song-card-head">
                <Typography variant="body1" weight="bold">
                  {T.playersTitle}
                </Typography>
                {admin && !over ? (
                  <Link to="players" className="song-link-button">
                    {T.assignPlayers}
                  </Link>
                ) : null}
              </div>
              {sessions.length === 0 ? (
                <Typography variant="caption1">{T.playersEmpty}</Typography>
              ) : (
                <ul className="song-plain-list">{sessions.map(playerRow)}</ul>
              )}
            </section>
          ) : null}

          {auditions.length > 0 || (admin && !over) ? (
            <section className="song-section" aria-label={T.auditionsTitle}>
              <div className="song-card-head">
                <Typography variant="body1" weight="bold">
                  {T.auditionsTitle}
                </Typography>
                {admin && !over ? (
                  <Link
                    to={`/clubs/${clubId}/performances/${performanceId}/auditions/new?songId=${songId}`}
                    className="song-link-button"
                  >
                    {T.auditionRegister}
                  </Link>
                ) : null}
              </div>
              <ul className="song-plain-list">
                {auditions.map((a) => (
                  <li key={a.id} className="song-row">
                    <span className="song-grow">
                      {`${a.applicantName ?? T.auditionSong}${a.judgedAt ? ` · ${formatKstYmd(a.judgedAt)}` : ''}`}
                    </span>
                    <Badge kind="audition" value={a.result ?? 'PENDING'} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {schedules.length > 0 ? (
            <section className="song-section" aria-label={T.schedulesTitle}>
              <Typography variant="body1" weight="bold">
                {T.schedulesTitle}
              </Typography>
              <ul className="song-plain-list">{upcoming.map(scheduleRow)}</ul>
              {past.length > 0 ? (
                <details>
                  <summary>{T.pastSchedules(past.length)}</summary>
                  <ul className="song-plain-list">{past.map(scheduleRow)}</ul>
                </details>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {decisions.length > 0 ? (
        <div className="song-bar" role="toolbar">
          {decisions.map((a) => (
            <Button
              key={a}
              variant={
                a === 'confirm' || a === 'reconsider' ? 'solid' : 'outlined'
              }
              color={
                a === 'confirm' || a === 'reconsider' ? undefined : 'assistive'
              }
              onClick={() => setSheet(a)}
            >
              {DECISION_LABEL[a]}
            </Button>
          ))}
        </div>
      ) : null}

      {sheet ? (
        <SongSheet
          {...ids}
          action={sheet}
          ctx={ctx}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
    </div>
  )
}
