import { Button, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { fieldErrors } from '../../shared/api/errors'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { withRuleCopy } from '../club/manageApi'
import { ActionModal, showRuleCopy } from '../club/ManageBits'
import { PlayerPicker, type Player } from './PlayerPicker'
import {
  refreshSongs,
  useParticipants,
  useSongContext,
  useTeamMembers,
  warningTexts,
} from './songBits'
import { SONG_COPY as T, SONG_RULE_COPY } from './songCopy'
import {
  createTeamFromSong,
  getDefaultTeamName,
  getSong,
  saveSessions,
  songKey,
} from './songApi'
import { MiniButton } from './SongMini'
import './song.css'

type Picking = { partId?: string } | null

/** SONG-004 5-1: a new approved team from the song's players, which then becomes the song's team. */
function TeamSheet({
  clubId,
  performanceId,
  songId,
  version,
  players,
  onClose,
}: {
  clubId: string
  performanceId: string
  songId: string
  version: string
  players: Player[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const suggested = useQuery({
    queryKey: ['default-team-name', clubId, performanceId],
    queryFn: () => getDefaultTeamName(clubId, performanceId),
    // The value is read once as the input's initial text.
    staleTime: Infinity,
    gcTime: 0,
  })
  const [name, setName] = useState<string>()
  const [leader, setLeader] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const value = name ?? suggested.data ?? ''
  const people = [
    ...new Map(players.map((p) => [p.membershipId, p.displayName])),
  ]
  const run = useMutation({
    mutationFn: () =>
      withRuleCopy(
        () =>
          createTeamFromSong(clubId, performanceId, {
            sourceSongId: songId,
            version,
            name: value.trim(),
            leaderMembershipId: leader || null,
          }),
        SONG_RULE_COPY,
      ),
    onSuccess: async () => {
      await refreshSongs(qc, clubId, performanceId)
      feedback.toast(T.teamCreated, 'positive')
      onClose()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      showRuleCopy(e)
    },
  })
  return (
    <ActionModal
      open
      title={T.teamSheetTitle}
      actionLabel={T.teamCreate}
      loading={run.isPending}
      actionDisabled={value.trim() === '' || suggested.isPending}
      onClose={onClose}
      onSubmit={() => run.mutate()}
    >
      <FormField label={T.teamName} error={errors.name}>
        <TextField
          value={value}
          maxLength={100}
          aria-label={T.teamName}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <Typography variant="body2">{T.teamMembers}</Typography>
      <ul className="song-plain-list">
        {people.map(([id, display]) => (
          <li key={id}>{display}</li>
        ))}
      </ul>
      <label className="song-field">
        <Typography variant="body2">{T.teamLeader}</Typography>
        <select
          aria-label={T.teamLeader}
          value={leader}
          onChange={(e) => setLeader(e.target.value)}
        >
          <option value="">{T.teamLeaderNone}</option>
          {people.map(([id, display]) => (
            <option key={id} value={id}>
              {display}
            </option>
          ))}
        </select>
      </label>
      <Typography variant="caption1">{T.teamHint}</Typography>
    </ActionModal>
  )
}

/** SONG-004: staff a selected song part by part (API-085) and, without a team, make one from the players (API-086). */
export function SongPlayers() {
  const { clubId = '', performanceId = '', songId = '' } = useParams()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const qc = useQueryClient()
  const ctx = useSongContext(clubId, performanceId)
  const detail = useQuery({
    queryKey: [...songKey(clubId, performanceId, songId), 'detail'],
    queryFn: () => getSong(clubId, performanceId, songId),
  })
  const people = useParticipants(clubId, performanceId)
  const teamId = detail.data?.song.assignedTeamId ?? null
  const team = useTeamMembers(clubId, performanceId, teamId)
  const [edited, setEdited] = useState<Player[]>()
  const [picking, setPicking] = useState<Picking>(null)
  const [asking, setAsking] = useState(false)
  const [makingTeam, setMakingTeam] = useState(false)

  const save = useMutation({
    mutationFn: ({ items, reason }: { items: Player[]; reason?: string }) =>
      withRuleCopy(
        () =>
          saveSessions(clubId, performanceId, songId, {
            version: detail.data?.song.version ?? '',
            items: items.map((p) => ({
              performanceMemberId: p.performanceMemberId,
              partId: p.partId,
            })),
            ...(reason === undefined ? {} : { reason }),
          }),
        SONG_RULE_COPY,
      ),
    onSuccess: async (r) => {
      await refreshSongs(qc, clubId, performanceId)
      feedback.toast(T.playersSaved, 'positive')
      const warnings = warningTexts(r.warnings)
      void navigate(
        `/clubs/${clubId}/performances/${performanceId}/songs/${songId}`,
        { state: warnings.length ? { warnings } : undefined },
      )
    },
    onError: (e) => {
      setAsking(false)
      showRuleCopy(e)
    },
  })

  if (detail.isPending || ctx.loading || people.isPending)
    return <ListSkeleton rows={5} />
  if (
    detail.isError ||
    ctx.error ||
    people.isError ||
    !detail.data ||
    !ctx.perf
  )
    return (
      <ErrorState
        onRetry={() => {
          void detail.refetch()
          void people.refetch()
          ctx.refetch()
        }}
      />
    )

  const { song, requirements, sessions } = detail.data
  const locked = ctx.perf.status === 'LOCKED'
  const staffable = ['DRAFT', 'ACTIVE', 'LOCKED'].includes(ctx.perf.status)
  if (song.status !== 'CONFIRMED' || !staffable)
    return (
      <div className="start" data-screen-id="SONG-004">
        <EmptyState description={T.playersNotConfirmed} />
      </div>
    )

  const byId = new Map((people.data ?? []).map((m) => [m.id, m]))
  const saved: Player[] = sessions.map((s) => ({
    performanceMemberId: s.performanceMemberId,
    membershipId: byId.get(s.performanceMemberId)?.membershipId ?? '',
    partId: s.partId,
    displayName: s.displayName,
  }))
  // From an audition result (F3): the applicant starts as a player of that part. Unknown people or
  // parts are ignored, and so is someone who already plays it.
  const applicant = byId.get(search.get('applicantPerformanceMemberId') ?? '')
  const presetPart = search.get('partId') ?? ''
  const preset: Player | null =
    applicant &&
    ctx.activeParts.some((p) => p.id === presetPart) &&
    !saved.some(
      (p) => p.performanceMemberId === applicant.id && p.partId === presetPart,
    )
      ? {
          performanceMemberId: applicant.id,
          membershipId: applicant.membershipId,
          partId: presetPart,
          displayName: applicant.displayName,
        }
      : null
  const players = edited ?? (preset ? [...saved, preset] : saved)
  const dirty = edited !== undefined || preset !== null
  const set = (next: Player[]) => setEdited(next)
  const teamMembers = team.data ?? []
  // The 지원 badge needs a team (UI-26): it marks players outside the assigned team.
  const isSupport = (p: Player) =>
    teamId !== null && !teamMembers.includes(p.membershipId)

  const need = requirements.map((r) => ({
    ...r,
    have: players.filter((p) => p.partId === r.partId),
  }))
  const slotted = new Set(need.flatMap((r) => r.have.slice(0, r.requiredCount)))
  const extras = players.filter((p) => !slotted.has(p))

  const warnings: string[] = []
  for (const r of need) {
    const diff = r.requiredCount - r.have.length
    const name = ctx.partName(r.partId)
    if (diff > 0) warnings.push(T.warnShortage(name, diff))
    if (diff < 0) warnings.push(T.warnExcess(name, -diff))
  }
  const wasPlaying = new Set(saved.map((p) => p.performanceMemberId))
  for (const pmId of new Set(players.map((p) => p.performanceMemberId))) {
    const row = byId.get(pmId)
    if (!row) continue
    // playedSongCount includes this song once it is saved; count this song exactly once.
    const total = row.playedSongCount - (wasPlaying.has(pmId) ? 1 : 0) + 1
    if (total >= 3) warnings.push(T.warnSongCount(row.displayName, total))
  }

  const slotRow = (p: Player) => (
    <li key={`${p.performanceMemberId}-${p.partId}`} className="song-row">
      <span className="song-grow">{p.displayName}</span>
      {isSupport(p) ? (
        <span className="perf-chip">{T.supportBadge}</span>
      ) : null}
      <MiniButton
        label={T.removePlayer(p.displayName)}
        onClick={() => set(players.filter((x) => x !== p))}
      >
        ✕
      </MiniButton>
    </li>
  )

  return (
    <div className="start song-screen" data-screen-id="SONG-004">
      <section className="song-section" aria-label={T.playersScreenTitle}>
        <Typography variant="body1" weight="bold">
          {song.artist ? `${song.title} – ${song.artist}` : song.title}
        </Typography>
        <Typography variant="body2">
          {T.playersSummaryTeam(song.assignedTeamName)}
        </Typography>
      </section>

      {need.map((r) => (
        <section
          key={r.partId}
          className="song-section"
          aria-label={ctx.partName(r.partId)}
        >
          <Typography variant="body2" weight="bold">
            {ctx.partName(r.partId)}
          </Typography>
          <ul className="song-plain-list">
            {r.have.slice(0, r.requiredCount).map(slotRow)}
            {Array.from(
              { length: Math.max(0, r.requiredCount - r.have.length) },
              (_, i) => (
                <li key={`empty-${i}`} className="song-row">
                  <MiniButton
                    label={T.fillSlot(ctx.partName(r.partId))}
                    onClick={() => setPicking({ partId: r.partId })}
                  >
                    {T.emptySlot}
                  </MiniButton>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}

      <section className="song-section">
        <ul className="song-plain-list">
          {extras.map((p) => (
            <li
              key={`${p.performanceMemberId}-${p.partId}`}
              className="song-row"
            >
              <span className="song-grow">{`${ctx.partName(p.partId)} · ${p.displayName}`}</span>
              {isSupport(p) ? (
                <span className="perf-chip">{T.supportBadge}</span>
              ) : null}
              <MiniButton
                label={T.removePlayer(p.displayName)}
                onClick={() => set(players.filter((x) => x !== p))}
              >
                ✕
              </MiniButton>
            </li>
          ))}
        </ul>
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={() => setPicking({})}
        >
          {T.addPlayer}
        </Button>
      </section>

      {warnings.length > 0 ? (
        <div className="song-warning" role="status">
          <Typography variant="body2" weight="bold">
            {T.warningsTitle}
          </Typography>
          <ul className="warning-list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {teamId === null && players.length > 0 && ctx.perf.status === 'ACTIVE' ? (
        <Button
          variant="outlined"
          color="assistive"
          disabled={dirty}
          title={dirty ? T.teamNeedSave : undefined}
          onClick={() => setMakingTeam(true)}
        >
          {T.makeTeam}
        </Button>
      ) : null}

      <div className="song-bar">
        <Link
          to={`/clubs/${clubId}/performances/${performanceId}/songs/${songId}`}
          className="song-link-button"
        >
          {T.cancel}
        </Link>
        <Button
          loading={save.isPending}
          disabled={!dirty || players.length === 0}
          onClick={() =>
            locked ? setAsking(true) : save.mutate({ items: players })
          }
        >
          {T.save}
        </Button>
      </div>

      {picking ? (
        <PlayerPicker
          clubId={clubId}
          performanceId={performanceId}
          songId={songId}
          parts={ctx.activeParts}
          fixedPartId={picking.partId}
          teamId={teamId}
          taken={players}
          onPick={(p) => set([...players, p])}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {asking ? (
        <ReasonModal
          open
          title={T.lockedSaveTitle}
          description={T.lockedReasonHint}
          actionLabel={T.save}
          loading={save.isPending}
          onClose={() => setAsking(false)}
          onSubmit={(reason) => save.mutate({ items: players, reason })}
        />
      ) : null}
      {makingTeam ? (
        <TeamSheet
          clubId={clubId}
          performanceId={performanceId}
          songId={songId}
          version={song.version}
          players={players}
          onClose={() => setMakingTeam(false)}
        />
      ) : null}
    </div>
  )
}
