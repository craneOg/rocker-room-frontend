import { Button, TextField, Typography } from '@montage-ui/core'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatKstDay } from '../../shared/lib/time'
import { Badge } from '../../shared/ui/Badge'
import { WarningBanner } from '../../shared/ui/WarningBanner'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import {
  decisionsFor,
  DECISION_LABEL,
  inputRights,
  isOpen,
  useArrivalWarnings,
  useSongContext,
  type SongContext,
} from './songBits'
import { ANSWER_LABEL, SONG_COPY as T } from './songCopy'
import {
  listSongs,
  listTeams,
  songsKey,
  teamsKey,
  type SongCard,
  type SongFilter,
  type SongSort,
  type SongStatus,
} from './songApi'
import { VoteButtons } from './SongRespond'
import { SongSheet, type SheetAction } from './SongSheets'
import './song.css'

const STATUS_CHIPS: SongStatus[] = ['PROPOSED', 'CONFIRMED', 'REJECTED']
const SORTS: SongSort[] = [
  'createdAt,desc',
  'voteCount,desc',
  'possibleCount,desc',
  'title,asc',
]
const EMPTY: Record<SongStatus, string> = {
  PROPOSED: T.emptyCandidate,
  CONFIRMED: T.emptyConfirmed,
  REJECTED: T.emptyRejected,
  WITHDRAWN: T.emptyWithdrawn,
}

/** The playability answers a member gave, as one chip text ("가능·불가"), or 미응답. */
const myAnswerText = (song: SongCard) =>
  song.myPlayability.length === 0
    ? T.unanswered
    : [...new Set(song.myPlayability.map((a) => ANSWER_LABEL[a.answer]))].join(
        '·',
      )

function SongItem({
  song,
  ctx,
  base,
  onSheet,
}: {
  song: SongCard
  ctx: SongContext
  base: { clubId: string; performanceId: string }
  onSheet: (a: SheetAction, songId: string) => void
}) {
  const { policy, perf, me, admin } = ctx
  const path = `/clubs/${base.clubId}/performances/${base.performanceId}/songs/${song.id}`
  const rights = inputRights(song, perf, policy, me)
  const showVoteSummary = policy?.voteState !== 'DISABLED'
  const showPlaySummary = policy?.playabilityState !== 'DISABLED'
  const e = song.evaluation
  const decisions = admin ? decisionsFor(song.status, perf?.status) : []
  const candidate = song.status === 'PROPOSED'
  // Input rows exist while the feature is on; a closed one shows no buttons.
  const voteOn =
    candidate && policy !== undefined && policy.voteState === 'OPEN'
  const playOn =
    candidate && policy !== undefined && policy.playabilityState === 'OPEN'
  return (
    <li className="song-card">
      <div className="song-card-head">
        <Link to={path} className="song-title">
          <Typography variant="body1" weight="bold">
            {song.artist ? `${song.title} – ${song.artist}` : song.title}
          </Typography>
        </Link>
        <Badge
          kind="song"
          value={song.status}
          suffix={
            song.status === 'CONFIRMED' && song.setlistOrder !== null
              ? `· ${song.setlistOrder}번`
              : undefined
          }
        />
        {song.candidateTeamName ? (
          <span className="perf-chip">{song.candidateTeamName}</span>
        ) : null}
        {song.referenceUrl?.startsWith('https://') ? (
          <a
            href={song.referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${song.title} ${T.referenceLink}`}
          >
            🔗
          </a>
        ) : null}
        {decisions.length > 0 ? (
          <details className="perf-menu song-menu">
            <summary aria-label={`${song.title} ${T.cardMenu}`}>
              {T.moreStatus}
            </summary>
            {decisions.map((a) => (
              <button key={a} type="button" onClick={() => onSheet(a, song.id)}>
                {DECISION_LABEL[a]}
              </button>
            ))}
          </details>
        ) : null}
      </div>

      {candidate ? (
        <div className="song-summary">
          {showVoteSummary && voteOn ? (
            <span>
              {policy?.voteMethod === 'SCORE'
                ? T.voteSummaryScore(e.scoreAverage, e.voteCount)
                : T.voteSummaryApproval(e.voteCount)}
            </span>
          ) : null}
          {showPlaySummary && playOn ? (
            <span>
              {T.playabilitySummary(
                e.playability.POSSIBLE ?? 0,
                e.playability.IMPOSSIBLE ?? 0,
                e.playability.UNDECIDED ?? 0,
              )}
            </span>
          ) : null}
          <span>{T.proposedBy(song.proposedBy.displayName)}</span>
        </div>
      ) : (
        <div className="song-summary">
          {song.status === 'CONFIRMED' ? (
            <>
              <span>{T.confirmedTeam(song.assignedTeamName)}</span>
              <span>{T.confirmedOrder(song.setlistOrder)}</span>
              <span>{T.confirmedPlayers(song.sessionCount)}</span>
              {song.requirementsSatisfied === null ? null : (
                <span>
                  {song.requirementsSatisfied
                    ? T.requirementsOk
                    : T.requirementsShort}
                </span>
              )}
            </>
          ) : (
            <span>{T.proposedBy(song.proposedBy.displayName)}</span>
          )}
        </div>
      )}

      {voteOn ? (
        <div className="song-actions">
          {rights.vote ? (
            <VoteButtons
              {...base}
              songId={song.id}
              method={policy?.voteMethod ?? 'APPROVAL'}
              limit={policy?.voteMaxChoices ?? null}
              current={song.myVote?.score ?? null}
            />
          ) : (
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {T.notEligible}
            </Typography>
          )}
        </div>
      ) : null}
      {playOn && rights.playability ? (
        <div className="song-actions">
          <Link
            to={`${path}#playability`}
            className="perf-chip"
            aria-label={`${song.title} ${T.myPlayability}`}
          >
            {`${T.myPlayability} ${myAnswerText(song)}`}
          </Link>
        </div>
      ) : null}
    </li>
  )
}

/** SONG-001: candidate and selected songs with the feature band, filters, vote and playability entry. */
export function SongList() {
  const { clubId = '', performanceId = '' } = useParams()
  const navigate = useNavigate()
  const [arrival, clearArrival] = useArrivalWarnings()
  const ctx = useSongContext(clubId, performanceId)
  const { perf, policy, me, admin } = ctx
  const base = { clubId, performanceId }

  const [status, setStatus] = useState<SongStatus>('PROPOSED')
  const [teamId, setTeamId] = useState<string>()
  const [unresponded, setUnresponded] = useState(false)
  const [proposedByMe, setProposedByMe] = useState(false)
  const [sort, setSort] = useState<SongSort>('createdAt,desc')
  const [input, setInput] = useState('')
  const q = useDeferredValue(input.trim())
  const [sheet, setSheet] = useState<{ action: SheetAction; songId: string }>()

  // candidateScope is ALL_PARTICIPANTS or TEAM_MEMBERS (backend-confirmed).
  const teamScope = policy?.candidateScope === 'TEAM_MEMBERS'
  const teams = useQuery({
    queryKey: teamsKey(clubId, performanceId),
    queryFn: () => listTeams(clubId, performanceId),
    enabled: teamScope,
  })

  const filter: SongFilter = {
    status,
    candidateTeamId: teamId,
    q,
    proposedByMe,
    unresponded,
    sort,
  }
  const songs = useInfiniteQuery({
    queryKey: [...songsKey(clubId, performanceId), 'list', filter],
    queryFn: ({ pageParam, signal }) =>
      listSongs(clubId, performanceId, filter, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  const items = songs.data?.pages.flatMap((p) => p.items) ?? []
  const first = songs.data?.pages[0]

  const candidateOpen =
    !!policy && isOpen(policy.candidateState, policy.candidateDeadline)
  const playabilityOpen = policy?.playabilityState === 'OPEN'
  const voteOpen = policy?.voteState === 'OPEN'
  const participant = me?.status === 'APPLIED' || me?.status === 'APPROVED'
  const canPropose = perf?.status === 'ACTIVE' && candidateOpen && participant
  const adminRegister =
    admin && (perf?.status === 'DRAFT' || perf?.status === 'ACTIVE')
  const adminLocked = admin && perf?.status === 'LOCKED'
  const filtered =
    proposedByMe || unresponded || q !== '' || teamId !== undefined

  const unanswered = me?.progress.unansweredPlayabilityCount ?? null
  const voteUsed =
    policy?.voteMethod === 'SCORE'
      ? null
      : (first?.myVoteCount ?? me?.progress.votes?.used ?? null)

  if (ctx.loading) return <ListSkeleton />
  if (ctx.error) return <ErrorState onRetry={ctx.refetch} />

  return (
    <div className="start song-screen" data-screen-id="SONG-001">
      <WarningBanner warnings={arrival} onClose={clearArrival} />
      {policy && (candidateOpen || playabilityOpen || voteOpen) ? (
        <div className="chip-row song-band" aria-label={T.listTitle}>
          {candidateOpen ? (
            <Button
              size="small"
              variant={proposedByMe ? 'solid' : 'outlined'}
              color="assistive"
              aria-pressed={proposedByMe}
              onClick={() => {
                setProposedByMe(!proposedByMe)
                setStatus('PROPOSED')
              }}
            >
              {T.bandCandidate(
                policy.candidateDeadline
                  ? `~${formatKstDay(policy.candidateDeadline)}`
                  : null,
                first?.myProposalCount ?? 0,
                policy.candidateLimitPerMember,
              )}
            </Button>
          ) : null}
          {playabilityOpen ? (
            <Button
              size="small"
              variant={unresponded ? 'solid' : 'outlined'}
              color="assistive"
              aria-pressed={unresponded}
              onClick={() => {
                setUnresponded(!unresponded)
                setStatus('PROPOSED')
              }}
            >
              {T.bandPlayability(unanswered)}
            </Button>
          ) : null}
          {voteOpen ? (
            <Button
              size="small"
              variant={unresponded ? 'solid' : 'outlined'}
              color="assistive"
              aria-pressed={unresponded}
              onClick={() => {
                setUnresponded(!unresponded)
                setStatus('PROPOSED')
              }}
            >
              {T.bandVote(voteUsed, policy.voteMaxChoices)}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="chip-row" role="tablist" aria-label={T.listTitle}>
        {STATUS_CHIPS.map((s) => (
          <Button
            key={s}
            size="small"
            role="tab"
            variant={s === status ? 'solid' : 'outlined'}
            color="assistive"
            aria-selected={s === status}
            onClick={() => setStatus(s)}
          >
            {T.statusChips[s]}
          </Button>
        ))}
        <details className="perf-menu song-menu">
          <summary aria-label={T.statusChips.WITHDRAWN}>{T.moreStatus}</summary>
          <button type="button" onClick={() => setStatus('WITHDRAWN')}>
            {T.statusChips.WITHDRAWN}
          </button>
        </details>
      </div>

      {teamScope && (teams.data ?? []).length > 0 ? (
        <div className="chip-row" role="group" aria-label={T.scopeChips}>
          <Button
            size="small"
            variant={teamId === undefined ? 'solid' : 'outlined'}
            color="assistive"
            aria-pressed={teamId === undefined}
            onClick={() => setTeamId(undefined)}
          >
            {T.scopeAllChip}
          </Button>
          {(teams.data ?? [])
            .filter((t) => t.status !== 'REJECTED' && t.status !== 'WITHDRAWN')
            .map((t) => (
              <Button
                key={t.id}
                size="small"
                variant={teamId === t.id ? 'solid' : 'outlined'}
                color="assistive"
                aria-pressed={teamId === t.id}
                onClick={() => setTeamId(t.id)}
              >
                {t.name}
              </Button>
            ))}
        </div>
      ) : null}

      <div className="song-filters">
        <TextField
          value={input}
          placeholder={T.searchPlaceholder}
          aria-label={T.searchPlaceholder}
          maxLength={100}
          onChange={(e) => setInput(e.target.value)}
        />
        {playabilityOpen || voteOpen ? (
          <label className="choice-row">
            <input
              type="checkbox"
              checked={unresponded}
              onChange={() => setUnresponded(!unresponded)}
            />
            <Typography variant="body2">{T.unrespondedOnly}</Typography>
          </label>
        ) : null}
        <select
          aria-label={T.sortLabel}
          value={sort}
          onChange={(e) => setSort(e.target.value as SongSort)}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {s === 'voteCount,desc' && policy?.voteMethod === 'SCORE'
                ? T.sortScoreOption
                : T.sortOptions[s as keyof typeof T.sortOptions]}
            </option>
          ))}
        </select>
      </div>

      {songs.isPending ? <ListSkeleton /> : null}
      {songs.isError ? (
        <ErrorState onRetry={() => void songs.refetch()} />
      ) : null}
      {songs.isSuccess && items.length === 0 ? (
        <EmptyState
          description={filtered ? T.emptyFiltered : EMPTY[status]}
          actionLabel={
            !filtered && status === 'PROPOSED' && canPropose
              ? T.proposeAction
              : undefined
          }
          onAction={() => void navigate('new')}
        />
      ) : null}
      <ul className="song-list">
        {items.map((s) => (
          <SongItem
            key={s.id}
            song={s}
            ctx={ctx}
            base={base}
            onSheet={(action, songId) => setSheet({ action, songId })}
          />
        ))}
      </ul>
      {songs.hasNextPage ? (
        <Button
          variant="outlined"
          color="assistive"
          loading={songs.isFetchingNextPage}
          onClick={() => void songs.fetchNextPage()}
        >
          {T.loadMore}
        </Button>
      ) : null}

      <div className="song-bottom">
        {admin ? (
          <Link to="status" className="song-link-button">
            {T.statusBoardButton}
          </Link>
        ) : null}
        {adminRegister || canPropose || adminLocked ? (
          <Link to="new" className="perf-fab">
            {adminLocked
              ? T.registerLockedButton
              : admin
                ? T.registerButton
                : T.proposeButton}
          </Link>
        ) : null}
      </div>

      {sheet ? (
        <SongSheet
          clubId={clubId}
          performanceId={performanceId}
          songId={sheet.songId}
          action={sheet.action}
          ctx={ctx}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
    </div>
  )
}
