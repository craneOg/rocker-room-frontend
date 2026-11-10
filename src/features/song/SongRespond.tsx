import { Button, TextArea, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { feedback } from '../../shared/ui/feedbackBus'
import { RuleCopyError, withRuleCopy } from '../club/manageApi'
import { refreshSongs, type SongContext } from './songBits'
import { ANSWER_LABEL, SONG_COPY as T } from './songCopy'
import {
  deletePlayability,
  deleteVote,
  getEvaluations,
  getPlayability,
  getVotes,
  putPlayability,
  putVote,
  songKey,
  type Answer,
  type PlayabilityRow,
} from './songApi'
import './song.css'

type Ids = { clubId: string; performanceId: string; songId: string }

/** Approval: a toggle (cancel deletes). Score: 1~5, changed but never canceled (V-04). */
export function VoteButtons({
  clubId,
  performanceId,
  songId,
  method,
  limit,
  current,
}: Ids & { method: string; limit: number | null; current: number | null }) {
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (score: number | null) =>
      withRuleCopy(
        () =>
          score === null
            ? deleteVote(clubId, performanceId, songId, 'me')
            : putVote(clubId, performanceId, songId, 'me', score),
        { MAX_APPROVALS_EXCEEDED: T.maxApprovals(limit) },
      ),
    onSuccess: () => refreshSongs(qc, clubId, performanceId),
    onError: (e) => {
      if (e instanceof RuleCopyError) feedback.toast(e.copy, 'negative')
    },
  })
  if (method === 'SCORE')
    return (
      <div className="chip-row" role="group" aria-label={T.voteTitle}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            size="small"
            variant={current === n ? 'solid' : 'outlined'}
            color="assistive"
            aria-pressed={current === n}
            disabled={save.isPending}
            onClick={() => current !== n && save.mutate(n)}
          >
            {T.scoreButton(n)}
          </Button>
        ))}
      </div>
    )
  return (
    <Button
      size="small"
      variant={current !== null ? 'solid' : 'outlined'}
      color="assistive"
      aria-pressed={current !== null}
      disabled={save.isPending}
      onClick={() => save.mutate(current !== null ? null : 1)}
    >
      {T.approve}
    </Button>
  )
}

/** One part of the requester's playability answer: 가능 / 불가 / 보류 (+ a reason for the latter two). */
function PartAnswer({
  ids,
  partName,
  partId,
  row,
  editable,
}: {
  ids: Ids
  partName: string
  partId: string
  row: PlayabilityRow | undefined
  editable: boolean
}) {
  const qc = useQueryClient()
  const [reason, setReason] = useState(row?.reason ?? '')
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: (v: { answer: Answer; reason: string | null }) =>
      putPlayability(
        ids.clubId,
        ids.performanceId,
        ids.songId,
        'me',
        partId,
        v,
      ),
    onSuccess: async () => {
      await refreshSongs(qc, ids.clubId, ids.performanceId)
      setSaved(true)
    },
  })
  const clear = useMutation({
    mutationFn: () =>
      deletePlayability(
        ids.clubId,
        ids.performanceId,
        ids.songId,
        'me',
        partId,
      ),
    onSuccess: async () => {
      await refreshSongs(qc, ids.clubId, ids.performanceId)
      setSaved(false)
      setReason('')
    },
  })
  const answer = row?.answer
  const needsReason = answer === 'IMPOSSIBLE' || answer === 'UNDECIDED'
  const send = (a: Answer, r: string) => {
    setSaved(false)
    // A changed answer drops the old reason on the server: drop it on the screen too.
    if (a !== answer) setReason(r)
    save.mutate({ answer: a, reason: a === 'POSSIBLE' || r === '' ? null : r })
  }
  return (
    <div
      className="song-part-answer"
      role="group"
      aria-label={T.answerGroup(partName)}
    >
      <Typography variant="body2" weight="bold">
        {partName}
      </Typography>
      <div className="chip-row">
        {(['POSSIBLE', 'IMPOSSIBLE', 'UNDECIDED'] as Answer[]).map((a) => (
          <Button
            key={a}
            size="small"
            variant={answer === a ? 'solid' : 'outlined'}
            color="assistive"
            aria-pressed={answer === a}
            disabled={!editable || save.isPending}
            onClick={() => send(a, a === answer ? reason : '')}
          >
            {ANSWER_LABEL[a]}
          </Button>
        ))}
        {editable && answer ? (
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            disabled={clear.isPending}
            onClick={() => clear.mutate()}
          >
            {T.proxyCancel}
          </Button>
        ) : null}
        {saved ? <span className="perf-chip">{T.savedMark}</span> : null}
      </div>
      {editable && needsReason ? (
        <div className="song-field">
          <TextArea
            aria-label={`${partName} ${T.reasonLabel}`}
            placeholder={T.reasonLabel}
            value={reason}
            maxLength={500}
            minRows={2}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
          />
          <Typography variant="caption1">{T.reasonNote}</Typography>
          <Button
            size="small"
            loading={save.isPending}
            onClick={() => answer && send(answer, reason.trim())}
          >
            {T.save}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** SONG-003 2: the requester's playability per part. `editable` is false after the deadline (read only). */
export function PlayabilityPanel({
  ids,
  ctx,
  editable,
}: {
  ids: Ids
  ctx: SongContext
  editable: boolean
}) {
  const { me, admin, activeParts, myPartIds } = ctx
  const mine = useQuery({
    queryKey: [
      ...songKey(ids.clubId, ids.performanceId, ids.songId),
      'my-playability',
    ],
    queryFn: async () =>
      (
        await getPlayability(
          ids.clubId,
          ids.performanceId,
          ids.songId,
          admin ? me?.id : undefined,
        )
      ).items.filter((r) => r.performanceMemberId === me?.id),
    enabled: !!me,
  })
  const [extra, setExtra] = useState<string[]>([])
  const [asking, setAsking] = useState('')
  const rows = mine.data ?? []
  const defaults = activeParts
    .filter((p) => myPartIds.includes(p.id))
    .map((p) => p.id)
  const shown = [
    ...new Set([...defaults, ...rows.map((r) => r.partId), ...extra]),
  ]
  const others = activeParts.filter((p) => !shown.includes(p.id))
  const nameOf = (id: string) => ctx.partName(id)
  return (
    <section
      className="song-section"
      id="playability"
      aria-label={T.playabilityTitle}
    >
      <Typography variant="body1" weight="bold">
        {T.playabilityTitle}
      </Typography>
      {!editable ? (
        <Typography variant="caption1">{T.playabilityClosed}</Typography>
      ) : null}
      {mine.isSuccess
        ? shown.map((id) => (
            <PartAnswer
              key={id}
              ids={ids}
              partId={id}
              partName={nameOf(id)}
              row={rows.find((r) => r.partId === id)}
              editable={editable}
            />
          ))
        : null}
      {editable && others.length > 0 ? (
        <label className="song-field">
          <Typography variant="caption1">{T.otherPart}</Typography>
          <select
            aria-label={T.otherPart}
            value={asking}
            onChange={(e) => setAsking(e.target.value)}
          >
            <option value="">{T.pickPart}</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {asking !== '' ? (
        <OtherPartConfirm
          part={nameOf(asking)}
          onConfirm={() => {
            setExtra([...extra, asking])
            setAsking('')
          }}
          onCancel={() => setAsking('')}
        />
      ) : null}
    </section>
  )
}

function OtherPartConfirm({
  part,
  onConfirm,
  onCancel,
}: {
  part: string
  onConfirm: () => void
  onCancel: () => void
}) {
  // 2-1: a plain inline confirmation keeps the screen simple; the dialog bus would lose the selected part.
  return (
    <div
      className="song-confirm"
      role="alertdialog"
      aria-label={T.otherPartTitle}
    >
      <Typography variant="body2">{T.otherPartConfirm(part)}</Typography>
      <div className="dialog-actions">
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={onCancel}
        >
          {T.cancel}
        </Button>
        <Button size="small" onClick={onConfirm}>
          {T.otherPartAction}
        </Button>
      </div>
    </div>
  )
}

/** SONG-003 3: the requester's vote. */
export function VotePanel({
  ids,
  ctx,
  editable,
  used,
}: {
  ids: Ids
  ctx: SongContext
  editable: boolean
  used: number | null
}) {
  const { me, admin, policy } = ctx
  const mine = useQuery({
    queryKey: [
      ...songKey(ids.clubId, ids.performanceId, ids.songId),
      'my-vote',
    ],
    queryFn: async () =>
      (
        await getVotes(
          ids.clubId,
          ids.performanceId,
          ids.songId,
          admin ? me?.id : undefined,
        )
      ).items.find((r) => r.performanceMemberId === me?.id)?.score ?? null,
    enabled: !!me,
  })
  const method = policy?.voteMethod ?? 'APPROVAL'
  return (
    <section className="song-section" aria-label={T.voteTitle}>
      <Typography variant="body1" weight="bold">
        {T.voteTitle}
      </Typography>
      {editable ? (
        <>
          <VoteButtons
            {...ids}
            method={method}
            limit={policy?.voteMaxChoices ?? null}
            current={mine.data ?? null}
          />
          {method !== 'SCORE' && used !== null ? (
            <Typography variant="caption1">
              {T.voteSelected(used, policy?.voteMaxChoices ?? null)}
            </Typography>
          ) : null}
        </>
      ) : (
        <Typography variant="caption1">{T.playabilityClosed}</Typography>
      )}
    </section>
  )
}

/** SONG-003 4: aggregate and, where visible, who answered what (V-09, UI-8). */
export function ResultsPanel({
  ids,
  ctx,
  inScope,
}: {
  ids: Ids
  ctx: SongContext
  inScope: boolean
}) {
  const { policy, admin, partName } = ctx
  const [tab, setTab] = useState<'playability' | 'vote'>(
    policy?.playabilityState !== 'DISABLED' ? 'playability' : 'vote',
  )
  const ev = useQuery({
    queryKey: [
      ...songKey(ids.clubId, ids.performanceId, ids.songId),
      'evaluations',
    ],
    queryFn: () => getEvaluations(ids.clubId, ids.performanceId, ids.songId),
  })
  const tabs = [
    ...(policy?.playabilityState !== 'DISABLED'
      ? (['playability'] as const)
      : []),
    ...(policy?.voteState !== 'DISABLED' ? (['vote'] as const) : []),
  ]
  if (tabs.length === 0 || !ev.data) return null
  const d = ev.data
  const names =
    tab === 'playability' ? d.namesVisible.playability : d.namesVisible.vote
  const absent =
    (tab === 'playability'
      ? d.nonResponders?.playability
      : d.nonResponders?.vote) ?? null
  return (
    <section className="song-section" aria-label={T.resultsTitle}>
      <Typography variant="body1" weight="bold">
        {T.resultsTitle}
      </Typography>
      <div className="chip-row" role="tablist">
        {tabs.map((t) => (
          <Button
            key={t}
            size="small"
            role="tab"
            variant={t === tab ? 'solid' : 'outlined'}
            color="assistive"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
          >
            {t === 'playability' ? T.tabPlayability : T.tabVote}
          </Button>
        ))}
      </div>
      {tab === 'playability' ? (
        d.playabilityByPart.length === 0 ? (
          <Typography variant="caption1">{T.noResponses}</Typography>
        ) : (
          d.playabilityByPart.map((part) => (
            <div key={part.partId} className="song-part-result">
              <Typography variant="body2" weight="bold">
                {T.partLine(
                  part.partName || partName(part.partId),
                  part.POSSIBLE ?? 0,
                  part.IMPOSSIBLE ?? 0,
                  part.UNDECIDED ?? 0,
                )}
              </Typography>
              <div className="chip-row">
                {(d.playabilityResponses ?? [])
                  .filter((r) => r.partId === part.partId)
                  .map((r) => (
                    <details key={r.performanceMemberId} className="song-chip">
                      <summary>
                        {`${r.displayName} ${ANSWER_LABEL[r.answer]}`}
                        {r.enteredByAdmin ? ` (${T.byAdmin})` : ''}
                      </summary>
                      {admin && r.reason ? <p>{r.reason}</p> : null}
                    </details>
                  ))}
              </div>
            </div>
          ))
        )
      ) : (
        <div className="song-part-result">
          {d.scoreAverage !== null ? (
            <>
              <Typography variant="body2" weight="bold">
                {T.scoreAverage(d.scoreAverage)}
              </Typography>
              {[1, 2, 3, 4, 5].map((s) => (
                <div key={s} className="song-score">
                  <span>
                    {T.scoreBar(s, d.scoreDistribution?.[String(s)] ?? 0)}
                  </span>
                  <progress
                    max={Math.max(1, d.voteCount)}
                    value={d.scoreDistribution?.[String(s)] ?? 0}
                  />
                </div>
              ))}
            </>
          ) : (
            <Typography variant="body2" weight="bold">
              {T.approvalCount(d.voteCount)}
            </Typography>
          )}
          <div className="chip-row">
            {(d.voteResponses ?? []).map((r) => (
              <span key={r.performanceMemberId} className="perf-chip">
                {d.scoreAverage !== null
                  ? `${r.displayName} ${T.scoreButton(r.score)}`
                  : r.displayName}
                {r.enteredByAdmin ? ` (${T.byAdmin})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {absent !== null ? (
        <details>
          <summary>{T.nonResponders(absent.length)}</summary>
          <ul className="song-plain-list">
            {absent.map((p) => (
              <li key={p.performanceMemberId}>{p.displayName}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {!names && inScope && !admin ? (
        <Typography variant="caption1">{T.numbersOnly}</Typography>
      ) : null}
    </section>
  )
}
