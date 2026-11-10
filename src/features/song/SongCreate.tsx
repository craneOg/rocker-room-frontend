import { Button, TextArea, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
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
import { RadioList, showRuleCopy } from '../club/ManageBits'
import { PlayerList, type Player } from './PlayerPicker'
import {
  isOpen,
  refreshSongs,
  useSongContext,
  validLink,
  warningTexts,
} from './songBits'
import { SONG_COPY as T, SONG_RULE_COPY } from './songCopy'
import { createSong, listTeams, teamsKey, type CreateSongBody } from './songApi'
import './song.css'

/** SONG-002: a member proposes a candidate song; an officer registers it, optionally as selected at once. */
export function SongCreate() {
  const { clubId = '', performanceId = '' } = useParams()
  const [search] = useSearchParams()
  const presetTeam = search.get('teamId') ?? undefined
  const navigate = useNavigate()
  const qc = useQueryClient()
  const ctx = useSongContext(clubId, performanceId)
  const { perf, policy, me, admin } = ctx

  const [f, setF] = useState({ title: '', artist: '', link: '', memo: '' })
  const [team, setTeam] = useState(presetTeam ?? '')
  const [mode, setMode] = useState<'PROPOSED' | 'CONFIRMED'>('PROPOSED')
  const [assigned, setAssigned] = useState('')
  const [order, setOrder] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [asking, setAsking] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const teams = useQuery({
    queryKey: teamsKey(clubId, performanceId),
    queryFn: () => listTeams(clubId, performanceId),
    enabled: admin,
  })
  // candidateScope is ALL_PARTICIPANTS or TEAM_MEMBERS (backend-confirmed).
  const teamScope = policy?.candidateScope === 'TEAM_MEMBERS'
  // Scope team choices: a member picks among own teams, an officer among the live teams.
  const teamChoices = admin
    ? (teams.data ?? [])
        .filter((t) => ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(t.status))
        .map((t) => ({ id: t.id, name: t.name }))
    : (me?.myTeams ?? []).map((t) => ({ id: t.teamId, name: t.name }))
  const onlyTeam =
    teamScope && !admin && teamChoices.length === 1
      ? teamChoices[0]?.id
      : undefined
  // An officer's list hides the scope select only for a performance-wide scope; a member's list needs TEAM.
  const teamValue = admin || teamScope ? team || onlyTeam || '' : ''
  const locked = perf?.status === 'LOCKED'

  const send = useMutation({
    mutationFn: (reason?: string) => {
      const confirmNow = admin && (locked || mode === 'CONFIRMED')
      const body: CreateSongBody = {
        title: f.title.trim(),
        artist: f.artist.trim() || null,
        referenceUrl: f.link.trim() || null,
        memo: f.memo.trim() || null,
        candidateTeamId: teamValue || null,
        status: confirmNow ? 'CONFIRMED' : 'PROPOSED',
        ...(confirmNow
          ? {
              assignedTeamId: assigned || null,
              ...(locked
                ? {
                    setlistOrder: Number(order),
                    sessions: players.map((p) => ({
                      performanceMemberId: p.performanceMemberId,
                      partId: p.partId,
                    })),
                    reason,
                  }
                : {}),
            }
          : {}),
      }
      return withRuleCopy(
        () => createSong(clubId, performanceId, body),
        SONG_RULE_COPY,
      )
    },
    onSuccess: async (r) => {
      await refreshSongs(qc, clubId, performanceId)
      feedback.toast(admin ? T.registered : T.proposed, 'positive')
      const warnings = warningTexts(r.warnings, f.title.trim())
      void navigate(`/clubs/${clubId}/performances/${performanceId}/songs`, {
        state: warnings.length ? { warnings } : undefined,
      })
    },
    onError: (e) => {
      setAsking(false)
      setErrors(fieldErrors(e))
      showRuleCopy(e)
    },
  })

  if (ctx.loading) return <ListSkeleton rows={4} />
  if (ctx.error || !perf || !policy) return <ErrorState onRetry={ctx.refetch} />

  const participant = me?.status === 'APPLIED' || me?.status === 'APPROVED'
  const memberAllowed =
    perf.status === 'ACTIVE' &&
    isOpen(policy.candidateState, policy.candidateDeadline) &&
    participant
  const adminAllowed = ['DRAFT', 'ACTIVE', 'LOCKED'].includes(perf.status)
  if (!(admin ? adminAllowed : memberAllowed))
    return (
      <div className="start" data-screen-id="SONG-002">
        <EmptyState description={T.createClosed} />
      </div>
    )

  const progress = me?.progress.candidateSongs ?? null
  const limit = admin
    ? null
    : (progress?.limit ?? policy.candidateLimitPerMember)
  const used = progress?.used ?? 0
  const exhausted = limit !== null && used >= limit

  const showScope = admin || teamScope
  const scopeRequired = teamScope
  const noTeam = !admin && teamScope && teamChoices.length === 0

  const titleBlank = f.title.trim() === ''
  const linkOk = validLink(f.link.trim())
  const confirmNow = admin && (locked || mode === 'CONFIRMED')
  const lockedReady =
    !locked ||
    (assigned !== '' &&
      Number.isInteger(Number(order)) &&
      Number(order) > 0 &&
      players.length > 0)
  const canSubmit =
    !titleBlank &&
    linkOk &&
    !exhausted &&
    !noTeam &&
    (!scopeRequired || teamValue !== '') &&
    lockedReady

  const clearError = (key: string) =>
    setErrors(({ [key]: _cleared, ...rest }) => rest)

  const submit = () => {
    setErrors({})
    if (locked) setAsking(true)
    else send.mutate(undefined)
  }
  return (
    <div className="start song-screen" data-screen-id="SONG-002">
      {limit !== null ? (
        <Typography variant="body2" role="status">
          {exhausted ? T.limitReached : T.remaining(limit - used, used, limit)}
        </Typography>
      ) : null}

      <FormField
        label={T.fieldTitle}
        error={
          errors.title ??
          (titleBlank && f.title !== '' ? T.fieldTitleError : undefined)
        }
      >
        <TextField
          value={f.title}
          maxLength={200}
          placeholder={T.fieldTitle}
          aria-label={T.fieldTitle}
          disabled={exhausted}
          onChange={(e) => {
            setF({ ...f, title: e.target.value })
            clearError('title')
          }}
        />
      </FormField>
      <FormField label={T.fieldArtist} error={errors.artist}>
        <TextField
          value={f.artist}
          maxLength={200}
          placeholder={T.fieldArtist}
          aria-label={T.fieldArtist}
          disabled={exhausted}
          onChange={(e) => {
            setF({ ...f, artist: e.target.value })
            clearError('artist')
          }}
        />
      </FormField>
      <FormField
        label={T.fieldLink}
        error={linkOk ? errors.referenceUrl : T.linkError}
      >
        <TextField
          value={f.link}
          maxLength={500}
          placeholder={T.linkPlaceholder}
          aria-label={T.fieldLink}
          disabled={exhausted}
          onChange={(e) => {
            setF({ ...f, link: e.target.value })
            clearError('referenceUrl')
          }}
        />
      </FormField>
      <FormField label={T.fieldMemo} error={errors.memo}>
        <TextArea
          value={f.memo}
          maxLength={500}
          minRows={3}
          placeholder={T.memoPlaceholder}
          aria-label={T.fieldMemo}
          disabled={exhausted}
          onChange={(e) => {
            setF({ ...f, memo: e.target.value.slice(0, 500) })
            clearError('memo')
          }}
        />
      </FormField>
      <p className="reason-counter">{`${f.memo.length} / 500`}</p>

      {showScope ? (
        <label className="song-field">
          <Typography variant="body2">{T.fieldScope}</Typography>
          <select
            aria-label={T.fieldScope}
            value={teamValue}
            disabled={presetTeam !== undefined || exhausted || noTeam}
            onChange={(e) => setTeam(e.target.value)}
          >
            {scopeRequired ? (
              <option value="">{T.scopePlaceholder}</option>
            ) : (
              <option value="">{T.scopeAll}</option>
            )}
            {teamChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {noTeam ? (
        <Typography variant="caption1">{T.noTeamToPropose}</Typography>
      ) : null}

      {admin ? (
        <>
          {locked ? (
            <Typography variant="caption1">{T.lockedHint}</Typography>
          ) : (
            <RadioList
              name={T.fieldRegisterAs}
              value={mode}
              options={[
                { value: 'PROPOSED', label: T.asCandidate },
                { value: 'CONFIRMED', label: T.asConfirmed },
              ]}
              onChange={(v) => setMode(v as typeof mode)}
            />
          )}
          {confirmNow ? (
            <label className="song-field">
              <Typography variant="body2">{T.fieldAssignedTeam}</Typography>
              <select
                aria-label={T.fieldAssignedTeam}
                value={assigned}
                onChange={(e) => setAssigned(e.target.value)}
              >
                <option value="">
                  {locked ? T.scopePlaceholder : T.assignedLater}
                </option>
                {(teams.data ?? [])
                  .filter((t) => t.status === 'APPROVED')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          {locked ? (
            <>
              <FormField label={T.fieldOrder}>
                <TextField
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={order}
                  aria-label={T.fieldOrder}
                  onChange={(e) => setOrder(e.target.value)}
                />
              </FormField>
              <PlayerList
                clubId={clubId}
                performanceId={performanceId}
                parts={ctx.activeParts}
                teamId={assigned || null}
                value={players}
                onChange={setPlayers}
              />
            </>
          ) : null}
        </>
      ) : (
        <Typography variant="caption1">{T.proposeNotice}</Typography>
      )}

      <Button loading={send.isPending} disabled={!canSubmit} onClick={submit}>
        {admin ? T.submitAdmin : T.submitMember}
      </Button>

      {asking ? (
        <ReasonModal
          open
          title={T.lockedReasonTitle}
          description={T.lockedReasonHint}
          actionLabel={T.submitAdmin}
          loading={send.isPending}
          onClose={() => setAsking(false)}
          onSubmit={(reason) => send.mutate(reason)}
        />
      ) : null}
    </div>
  )
}
