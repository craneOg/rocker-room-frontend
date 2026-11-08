import { Button, TextField, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { ActionModal } from '../club/ManageBits'
import { useParticipants, useTeamMembers } from './songBits'
import { SONG_COPY as T, ANSWER_LABEL } from './songCopy'
import { getEvaluations, songKey } from './songApi'
import { MiniButton } from './SongMini'
import './song.css'

/** A player row being edited (API-085 items plus what the screens show). */
export type Player = {
  performanceMemberId: string
  membershipId: string
  partId: string
  displayName: string
}

type PickerProps = {
  clubId: string
  performanceId: string
  songId?: string
  parts: { id: string; name: string }[]
  /** A slot fixes the part; otherwise the part is chosen here. */
  fixedPartId?: string
  teamId: string | null
  taken: Player[]
  onPick: (p: Player) => void
  onClose: () => void
}

/** SONG-004 2-1: pick one confirmed participant for a part. */
export function PlayerPicker({
  clubId,
  performanceId,
  songId,
  parts,
  fixedPartId,
  teamId,
  taken,
  onPick,
  onClose,
}: PickerProps) {
  const [partId, setPartId] = useState(fixedPartId ?? '')
  const [input, setInput] = useState('')
  const people = useParticipants(clubId, performanceId)
  const team = useTeamMembers(clubId, performanceId, teamId)
  const [tab, setTab] = useState<'team' | 'all'>(teamId ? 'team' : 'all')
  // The song's playability answers (API-089; officers see the names).
  // ponytail: reading a selected song's answers through API-089 is not confirmed by the server yet.
  const answers = useQuery({
    queryKey: [...songKey(clubId, performanceId, songId ?? ''), 'eval-picker'],
    queryFn: () => getEvaluations(clubId, performanceId, songId ?? ''),
    enabled: songId !== undefined,
  })

  const q = input.trim()
  const rows = (people.data ?? [])
    .filter((m) => tab === 'all' || (team.data ?? []).includes(m.membershipId))
    .filter((m) => q === '' || m.displayName.includes(q))
  const answerOf = (id: string) =>
    answers.data?.playabilityResponses?.find(
      (r) => r.performanceMemberId === id && r.partId === partId,
    )?.answer

  return (
    <ActionModal
      open
      title={T.pickerTitle}
      actionLabel={T.close}
      hideCancel
      onClose={onClose}
      onSubmit={onClose}
    >
      {fixedPartId === undefined ? (
        <label className="song-field">
          <Typography variant="caption1">{T.pickerPart}</Typography>
          <select
            aria-label={T.pickerPart}
            value={partId}
            onChange={(e) => setPartId(e.target.value)}
          >
            <option value="">{T.pickPart}</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <TextField
        value={input}
        placeholder={T.pickerSearch}
        aria-label={T.pickerSearch}
        maxLength={100}
        onChange={(e) => setInput(e.target.value)}
      />
      {teamId ? (
        <div className="chip-row" role="tablist">
          {(['team', 'all'] as const).map((t) => (
            <Button
              key={t}
              size="small"
              role="tab"
              variant={t === tab ? 'solid' : 'outlined'}
              color="assistive"
              aria-selected={t === tab}
              onClick={() => setTab(t)}
            >
              {t === 'team' ? T.pickerTabTeam : T.pickerTabAll}
            </Button>
          ))}
        </div>
      ) : null}
      {people.isPending ? <ListSkeleton rows={3} /> : null}
      {people.isError ? (
        <ErrorState onRetry={() => void people.refetch()} />
      ) : null}
      {people.isSuccess && rows.length === 0 ? (
        <EmptyState description={T.pickerEmpty} />
      ) : null}
      <ul className="song-picker-list">
        {rows.map((m) => {
          const dup = taken.some(
            (p) => p.performanceMemberId === m.id && p.partId === partId,
          )
          const answer = answerOf(m.id)
          return (
            <li key={m.id} className="song-picker-row">
              <span className="song-grow">
                <Typography variant="body2" weight="bold">
                  {m.displayName}
                </Typography>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {[
                    m.parts.map((p) => p.name).join('·'),
                    T.pickerSongCount(m.playedSongCount),
                    answer ? ANSWER_LABEL[answer] : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              </span>
              <MiniButton
                disabled={partId === '' || dup}
                label={`${m.displayName} ${T.pickerAction}`}
                title={
                  partId === ''
                    ? T.pickerNeedPart
                    : dup
                      ? T.pickerDuplicate
                      : undefined
                }
                onClick={() => {
                  onPick({
                    performanceMemberId: m.id,
                    membershipId: m.membershipId,
                    partId,
                    displayName: m.displayName,
                  })
                  onClose()
                }}
              >
                {T.pickerAction}
              </MiniButton>
            </li>
          )
        })}
      </ul>
    </ActionModal>
  )
}

/** A removable list of players with an add button; used by the LOCKED forms. */
export function PlayerList({
  clubId,
  performanceId,
  songId,
  parts,
  teamId,
  value,
  onChange,
}: {
  clubId: string
  performanceId: string
  songId?: string
  parts: { id: string; name: string }[]
  teamId: string | null
  value: Player[]
  onChange: (next: Player[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const partName = (id: string) => parts.find((p) => p.id === id)?.name ?? ''
  return (
    <div className="song-section">
      <Typography variant="body2" weight="bold">
        {T.lockedPlayersLabel}
      </Typography>
      <ul className="song-plain-list">
        {value.map((p) => (
          <li key={`${p.performanceMemberId}-${p.partId}`} className="song-row">
            <span className="song-grow">{`${partName(p.partId)} · ${p.displayName}`}</span>
            <MiniButton
              label={T.removePlayer(p.displayName)}
              onClick={() => onChange(value.filter((x) => x !== p))}
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
        onClick={() => setAdding(true)}
      >
        {T.addPlayer}
      </Button>
      {adding ? (
        <PlayerPicker
          clubId={clubId}
          performanceId={performanceId}
          songId={songId}
          parts={parts}
          teamId={teamId}
          taken={value}
          onPick={(p) => onChange([...value, p])}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}
