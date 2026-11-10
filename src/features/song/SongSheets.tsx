import { TextArea, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { withConfirmation } from '../../shared/api/handlers'
import { fieldErrors } from '../../shared/api/errors'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { ListSkeleton } from '../../shared/ui/StateViews'
import { withRuleCopy } from '../club/manageApi'
import { ActionModal, showRuleCopy } from '../club/ManageBits'
import { PlayerList, type Player } from './PlayerPicker'
import {
  refreshSongs,
  showWarnings,
  validLink,
  warningTexts,
  type SongContext,
} from './songBits'
import { SONG_COPY as T, SONG_RULE_COPY } from './songCopy'
import {
  assignTeam,
  confirmSong,
  getSong,
  listTeams,
  reconsiderSong,
  rejectSong,
  saveRequirements,
  songKey,
  teamsKey,
  unconfirmSong,
  updateSong,
  withdrawSong,
  type SongDetail,
  type SongPatch,
} from './songApi'
import { MiniButton } from './SongMini'
import './song.css'

export type SheetAction =
  | 'confirm'
  | 'reject'
  | 'unconfirm'
  | 'reconsider'
  | 'withdraw'
  | 'remove'
  | 'edit'
  | 'requirements'
  | 'team'

const MAX_REASON = 500

/** Multi-line reason with the counter of COM-003 13. */
function ReasonInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="song-field">
      <Typography variant="body2">{label}</Typography>
      <TextArea
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={MAX_REASON}
        minRows={2}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_REASON))}
      />
      <p className="reason-counter">{`${value.length} / ${MAX_REASON}`}</p>
    </div>
  )
}

type SheetProps = {
  clubId: string
  performanceId: string
  songId: string
  ctx: SongContext
  detail: SongDetail
  onClose: () => void
}

/** The write helper shared by the sheets: rule copy as a dialog, then refresh and close. */
function useSongWrite<V>(
  {
    clubId,
    performanceId,
    onClose,
  }: Pick<SheetProps, 'clubId' | 'performanceId' | 'onClose'>,
  run: (v: V) => Promise<unknown>,
  done: string,
  warnings?: (result: unknown) => string[],
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: V) => withRuleCopy(() => run(v), SONG_RULE_COPY),
    onSuccess: async (result) => {
      await refreshSongs(qc, clubId, performanceId)
      showWarnings(warnings?.(result) ?? [])
      feedback.toast(done, 'positive')
      onClose()
    },
    onError: showRuleCopy,
  })
}

const approvedTeams = (clubId: string, performanceId: string) => ({
  queryKey: teamsKey(clubId, performanceId),
  queryFn: () => listTeams(clubId, performanceId),
})

/** 9-1: select (and, in a LOCKED performance, place and staff) a candidate song. */
function ConfirmSheet(p: SheetProps) {
  const { clubId, performanceId, songId, ctx, detail } = p
  const song = detail.song
  const locked = ctx.perf?.status === 'LOCKED'
  const teams = useQuery(approvedTeams(clubId, performanceId))
  const approved = (teams.data ?? []).filter((t) => t.status === 'APPROVED')
  const [teamId, setTeamId] = useState<string>()
  // Default: the scope team when it is approved.
  const effectiveTeam =
    teamId !== undefined
      ? teamId
      : (approved.find((t) => t.id === song.candidateTeamId)?.id ?? '')
  const [reason, setReason] = useState('')
  const [order, setOrder] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const latestAudition = [...detail.auditions]
    .filter((a) => a.judgedAt !== null)
    .sort(
      (a, b) => Date.parse(b.judgedAt ?? '') - Date.parse(a.judgedAt ?? ''),
    )[0]

  const orderNumber = Number(order)
  const lockedReady =
    !locked ||
    (effectiveTeam !== '' &&
      Number.isInteger(orderNumber) &&
      orderNumber > 0 &&
      players.length > 0 &&
      reason.trim() !== '')
  const run = useSongWrite(
    p,
    () =>
      confirmSong(clubId, performanceId, songId, {
        version: song.version,
        assignedTeamId: effectiveTeam === '' ? null : effectiveTeam,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(locked
          ? {
              setlistOrder: orderNumber,
              sessions: players.map((x) => ({
                performanceMemberId: x.performanceMemberId,
                partId: x.partId,
              })),
            }
          : {}),
      }),
    T.confirmDone,
  )
  return (
    <ActionModal
      open
      title={T.confirmTitle(song.title)}
      actionLabel={T.actionConfirm}
      loading={run.isPending}
      actionDisabled={!lockedReady || teams.isPending}
      onClose={p.onClose}
      onSubmit={() => run.mutate(undefined)}
    >
      <label className="song-field">
        <Typography variant="body2">{T.confirmTeamLabel}</Typography>
        <select
          aria-label={T.confirmTeamLabel}
          value={effectiveTeam}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {locked ? null : <option value="">{T.assignedLater}</option>}
          {locked && effectiveTeam === '' ? (
            <option value="">{T.scopePlaceholder}</option>
          ) : null}
          {approved.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
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
            teamId={effectiveTeam || null}
            value={players}
            onChange={setPlayers}
          />
        </>
      ) : (
        <Typography variant="caption1">{T.confirmOrderHint}</Typography>
      )}
      <ReasonInput
        label={locked ? T.lockedReason : T.confirmReason}
        placeholder={locked ? T.lockedReasonPlaceholder : undefined}
        value={reason}
        onChange={setReason}
      />
      {latestAudition?.result === 'FAILED' ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.negative.primary"
        >
          {T.auditionFailed}
        </Typography>
      ) : null}
    </ActionModal>
  )
}

const upcomingSchedules = (d: SongDetail) =>
  d.schedules.filter(
    (s) => s.status !== 'CANCELED' && Date.parse(s.startAt) > Date.now(),
  ).length

function ImpactList({ detail }: { detail: SongDetail }) {
  return (
    <ul className="dialog-items">
      <li>{T.impactTeamOrder}</li>
      <li>{T.impactSchedules(upcomingSchedules(detail))}</li>
      <li>{T.impactSessions}</li>
    </ul>
  )
}

/** 9-2 / 9-4 reject and 9-3 unconfirm: a decision note, and a reason in a LOCKED performance. */
function DecideSheet(p: SheetProps & { kind: 'reject' | 'unconfirm' }) {
  const { clubId, performanceId, songId, ctx, detail, kind } = p
  const song = detail.song
  const confirmedSong = song.status === 'CONFIRMED'
  const locked = ctx.perf?.status === 'LOCKED'
  const [note, setNote] = useState('')
  const body = () => ({
    version: song.version,
    ...(note.trim()
      ? {
          decisionNote: note.trim(),
          ...(locked ? { reason: note.trim() } : {}),
        }
      : {}),
  })
  const run = useSongWrite(
    p,
    () =>
      kind === 'unconfirm'
        ? unconfirmSong(clubId, performanceId, songId, body())
        : // A selected song answers CONFIRMATION_REQUIRED (CONFIRMED_SONG_REJECTION) with what would be released: the
          // shared dialog lists those warnings (9-4), and "계속 진행" repeats the call with confirmed=true.
          withConfirmation((confirmed) =>
            rejectSong(clubId, performanceId, songId, {
              ...body(),
              ...(confirmed ? { confirmed: true } : {}),
            }),
          ),
    kind === 'unconfirm' ? T.unconfirmDone : T.rejectDone,
  )
  return (
    <ActionModal
      open
      title={
        kind === 'unconfirm'
          ? T.unconfirmTitle
          : confirmedSong
            ? T.rejectConfirmedTitle
            : T.rejectTitle(song.title)
      }
      actionLabel={kind === 'unconfirm' ? T.actionUnconfirm : T.actionReject}
      loading={run.isPending}
      actionDisabled={locked && note.trim() === ''}
      onClose={p.onClose}
      onSubmit={() => run.mutate(undefined)}
    >
      {kind === 'unconfirm' ? <ImpactList detail={detail} /> : null}
      <ReasonInput
        label={locked ? T.lockedReason : T.confirmReason}
        placeholder={
          kind === 'reject' && !confirmedSong
            ? T.rejectReasonPlaceholder
            : locked
              ? T.lockedReasonPlaceholder
              : undefined
        }
        value={note}
        onChange={setNote}
      />
    </ActionModal>
  )
}

/** 9-5 reconsider, 1-1 proposer withdrawal and 1-2 officer deletion. */
function SimpleSheet(
  p: SheetProps & { kind: 'reconsider' | 'withdraw' | 'remove' },
) {
  const { clubId, performanceId, songId, detail, kind } = p
  const song = detail.song
  const [reason, setReason] = useState('')
  const run = useSongWrite(
    p,
    () =>
      kind === 'reconsider'
        ? reconsiderSong(clubId, performanceId, songId, song.version)
        : withdrawSong(
            clubId,
            performanceId,
            songId,
            {
              version: song.version,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            },
            kind === 'withdraw' ? 'proposer' : 'officer',
          ),
    kind === 'reconsider'
      ? T.reconsiderDone
      : kind === 'withdraw'
        ? T.withdrawn
        : T.deleted,
  )
  return (
    <ActionModal
      open
      title={
        kind === 'reconsider'
          ? T.reconsiderTitle
          : kind === 'withdraw'
            ? T.withdrawTitle
            : T.deleteTitle(song.title)
      }
      actionLabel={
        kind === 'reconsider'
          ? T.actionReconsider
          : kind === 'withdraw'
            ? T.withdrawAction
            : T.deleteAction
      }
      loading={run.isPending}
      onClose={p.onClose}
      onSubmit={() => run.mutate(undefined)}
    >
      {kind === 'withdraw' ? (
        <Typography variant="body2">{T.withdrawBody}</Typography>
      ) : null}
      {kind === 'remove' ? (
        <>
          <Typography variant="body2">{T.deleteBody}</Typography>
          <ReasonInput
            label={T.deleteReason}
            value={reason}
            onChange={setReason}
          />
        </>
      ) : null}
    </ActionModal>
  )
}

/** API-078: title, artist, link and memo of a candidate song (the scope team cannot change). */
function EditSheet(p: SheetProps) {
  const { clubId, performanceId, songId, detail } = p
  const song = detail.song
  const [f, setF] = useState({
    title: song.title,
    artist: song.artist ?? '',
    link: song.referenceUrl ?? '',
    memo: song.memo ?? '',
  })
  const patch: SongPatch = {}
  if (f.title.trim() !== song.title) patch.title = f.title.trim()
  if (f.artist.trim() !== (song.artist ?? ''))
    patch.artist = f.artist.trim() || null
  if (f.link.trim() !== (song.referenceUrl ?? ''))
    patch.referenceUrl = f.link.trim() || null
  if (f.memo.trim() !== (song.memo ?? '')) patch.memo = f.memo.trim() || null
  const linkOk = validLink(f.link.trim())
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const edit = (key: keyof typeof f, errorKey: string, value: string) => {
    setF({ ...f, [key]: value })
    setServerErrors(({ [errorKey]: _cleared, ...rest }) => rest)
  }
  const qc = useQueryClient()
  const run = useMutation({
    mutationFn: () =>
      updateSong(clubId, performanceId, songId, song.version, patch),
    onSuccess: async () => {
      await refreshSongs(qc, clubId, performanceId)
      feedback.toast(T.edited, 'positive')
      p.onClose()
    },
    onError: (e) => setServerErrors(fieldErrors(e)),
  })
  return (
    <ActionModal
      open
      title={T.editTitle}
      actionLabel={T.save}
      loading={run.isPending}
      actionDisabled={
        Object.keys(patch).length === 0 || f.title.trim() === '' || !linkOk
      }
      onClose={p.onClose}
      onSubmit={() => run.mutate()}
    >
      <FormField
        label={T.fieldTitle}
        error={f.title.trim() === '' ? T.fieldTitleError : serverErrors.title}
      >
        <TextField
          value={f.title}
          maxLength={200}
          aria-label={T.fieldTitle}
          onChange={(e) => edit('title', 'title', e.target.value)}
        />
      </FormField>
      <FormField label={T.fieldArtist} error={serverErrors.artist}>
        <TextField
          value={f.artist}
          maxLength={200}
          aria-label={T.fieldArtist}
          onChange={(e) => edit('artist', 'artist', e.target.value)}
        />
      </FormField>
      <FormField
        label={T.fieldLink}
        error={linkOk ? serverErrors.referenceUrl : T.linkError}
      >
        <TextField
          value={f.link}
          maxLength={500}
          placeholder={T.linkPlaceholder}
          aria-label={T.fieldLink}
          onChange={(e) => edit('link', 'referenceUrl', e.target.value)}
        />
      </FormField>
      <FormField label={T.fieldMemo} error={serverErrors.memo}>
        <TextArea
          value={f.memo}
          maxLength={500}
          minRows={2}
          placeholder={T.memoPlaceholder}
          aria-label={T.fieldMemo}
          onChange={(e) => edit('memo', 'memo', e.target.value)}
        />
      </FormField>
    </ActionModal>
  )
}

/** 5-1: a stepper (0~9) per active part; 0 removes the part. */
function RequirementsSheet(p: SheetProps) {
  const { clubId, performanceId, songId, ctx, detail } = p
  const locked = ctx.perf?.status === 'LOCKED'
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      detail.requirements.map((r) => [r.partId, r.requiredCount]),
    ),
  )
  const [reason, setReason] = useState('')
  const run = useSongWrite(
    p,
    () =>
      saveRequirements(clubId, performanceId, songId, {
        version: detail.song.version,
        items: [
          ...ctx.activeParts
            .filter((x) => (counts[x.id] ?? 0) > 0)
            .map((x) => ({ partId: x.id, requiredCount: counts[x.id] ?? 0 })),
          // The PUT replaces everything: a part that was deactivated has no row here and must stay.
          ...detail.requirements.filter(
            (r) => !ctx.activeParts.some((x) => x.id === r.partId),
          ),
        ],
        ...(locked ? { reason: reason.trim() } : {}),
      }),
    T.requirementsSaved,
  )
  const step = (id: string, d: number) =>
    setCounts((c) => ({
      ...c,
      [id]: Math.min(9, Math.max(0, (c[id] ?? 0) + d)),
    }))
  return (
    <ActionModal
      open
      title={T.requirementsEditTitle}
      actionLabel={T.save}
      loading={run.isPending}
      actionDisabled={locked && reason.trim() === ''}
      onClose={p.onClose}
      onSubmit={() => run.mutate(undefined)}
    >
      <ul className="song-plain-list">
        {ctx.activeParts.map((x) => (
          <li key={x.id} className="song-row">
            <span className="song-grow">{x.name}</span>
            <MiniButton
              label={T.stepperMinus(x.name)}
              onClick={() => step(x.id, -1)}
            >
              -
            </MiniButton>
            <output aria-label={x.name}>{counts[x.id] ?? 0}</output>
            <MiniButton
              label={T.stepperPlus(x.name)}
              onClick={() => step(x.id, 1)}
            >
              +
            </MiniButton>
          </li>
        ))}
      </ul>
      {locked ? (
        <ReasonInput
          label={T.lockedReason}
          placeholder={T.lockedReasonPlaceholder}
          value={reason}
          onChange={setReason}
        />
      ) : null}
    </ActionModal>
  )
}

/** API-084: assign or change the team of a confirmed song. */
function TeamSheet(p: SheetProps) {
  const { clubId, performanceId, songId, ctx, detail } = p
  const locked = ctx.perf?.status === 'LOCKED'
  const teams = useQuery(approvedTeams(clubId, performanceId))
  const approved = (teams.data ?? []).filter((t) => t.status === 'APPROVED')
  const [teamId, setTeamId] = useState(detail.song.assignedTeamId ?? '')
  const [reason, setReason] = useState('')
  const run = useSongWrite(
    p,
    () =>
      assignTeam(clubId, performanceId, songId, {
        version: detail.song.version,
        assignedTeamId: teamId === '' ? null : teamId,
        ...(locked ? { reason: reason.trim() } : {}),
      }),
    T.teamChanged,
    (r) => warningTexts((r as { warnings?: unknown }).warnings),
  )
  return (
    <ActionModal
      open
      title={T.changeTeamTitle}
      actionLabel={T.changeTeamAction}
      loading={run.isPending}
      actionDisabled={
        teams.isPending || (locked && (teamId === '' || reason.trim() === ''))
      }
      onClose={p.onClose}
      onSubmit={() => run.mutate(undefined)}
    >
      <label className="song-field">
        <Typography variant="body2">{T.confirmTeamLabel}</Typography>
        <select
          aria-label={T.confirmTeamLabel}
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {locked ? null : <option value="">{T.noTeam}</option>}
          {locked && !approved.some((t) => t.id === teamId) ? (
            <option value="">{T.scopePlaceholder}</option>
          ) : null}
          {approved.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {locked ? (
        <ReasonInput
          label={T.lockedReason}
          placeholder={T.lockedReasonPlaceholder}
          value={reason}
          onChange={setReason}
        />
      ) : null}
    </ActionModal>
  )
}

/** Loads the song once and opens the sheet of `action` (shared by SONG-001's card menu and SONG-003). */
export function SongSheet({
  action,
  ...rest
}: Omit<SheetProps, 'detail'> & { action: SheetAction }) {
  const { clubId, performanceId, songId, onClose } = rest
  const detail = useQuery({
    queryKey: [...songKey(clubId, performanceId, songId), 'detail'],
    queryFn: () => getSong(clubId, performanceId, songId),
  })
  if (!detail.data)
    return (
      <ActionModal
        open
        title={T.detailTitle}
        actionLabel={COPY.close}
        hideCancel
        onClose={onClose}
        onSubmit={onClose}
      >
        {detail.isPending ? <ListSkeleton rows={2} /> : null}
        {detail.isError ? (
          <Typography variant="body2">{COPY.unknownError}</Typography>
        ) : null}
      </ActionModal>
    )
  const props = { ...rest, detail: detail.data }
  switch (action) {
    case 'confirm':
      return <ConfirmSheet {...props} />
    case 'reject':
    case 'unconfirm':
      return <DecideSheet {...props} kind={action} />
    case 'reconsider':
    case 'withdraw':
    case 'remove':
      return <SimpleSheet {...props} kind={action} />
    case 'edit':
      return <EditSheet {...props} />
    case 'requirements':
      return <RequirementsSheet {...props} />
    case 'team':
      return <TeamSheet {...props} />
  }
}
