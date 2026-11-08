import { Button, TextArea, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { feedback } from '../../shared/ui/feedbackBus'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { withRuleCopy } from '../club/manageApi'
import { ActionModal, RadioList, showRuleCopy } from '../club/ManageBits'
import { useParams } from 'react-router'
import { isOpen, refreshSongs, useSongContext } from './songBits'
import { ANSWER_LABEL, SONG_COPY as T } from './songCopy'
import {
  boardKey,
  deletePlayability,
  deleteVote,
  getBoard,
  listTeams,
  putPlayability,
  putVote,
  teamsKey,
  type Answer,
  type EvaluationBoard,
} from './songApi'
import './song.css'

type Tab = 'PLAYABILITY' | 'VOTE'
type Cell = {
  songId: string
  title: string
  performanceMemberId: string
  displayName: string
}

/** 3-1: an officer answers or votes for someone (recorded as an officer input, V-08). */
function ProxySheet({
  ids,
  tab,
  cell,
  board,
  ctx,
  onClose,
}: {
  ids: { clubId: string; performanceId: string }
  tab: Tab
  cell: Cell
  board: EvaluationBoard
  ctx: ReturnType<typeof useSongContext>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const song = board.songs.find((s) => s.songId === cell.songId)
  const answers = (song?.playability ?? []).filter(
    (r) => r.performanceMemberId === cell.performanceMemberId,
  )
  const [partId, setPartId] = useState(
    answers[0]?.partId ?? ctx.activeParts[0]?.id ?? '',
  )
  const current = answers.find((r) => r.partId === partId)
  const [answer, setAnswer] = useState<Answer | ''>(current?.answer ?? '')
  const [reason, setReason] = useState(current?.reason ?? '')
  const currentVote = song?.votes.find(
    (v) => v.performanceMemberId === cell.performanceMemberId,
  )
  const [score, setScore] = useState<number | null>(currentVote?.score ?? null)
  const target = { performanceMemberId: cell.performanceMemberId }
  const limit = ctx.policy?.voteMaxChoices ?? null

  const done = async (message: string) => {
    await refreshSongs(qc, ids.clubId, ids.performanceId)
    feedback.toast(message, 'positive')
    onClose()
  }
  const run = useMutation({
    mutationFn: () =>
      withRuleCopy(
        () =>
          tab === 'PLAYABILITY'
            ? putPlayability(
                ids.clubId,
                ids.performanceId,
                cell.songId,
                target,
                partId,
                {
                  answer: answer as Answer,
                  reason:
                    answer === 'POSSIBLE' || reason.trim() === ''
                      ? null
                      : reason.trim(),
                },
              )
            : putVote(
                ids.clubId,
                ids.performanceId,
                cell.songId,
                target,
                score ?? 1,
              ),
        { MAX_APPROVALS_EXCEEDED: T.maxApprovals(limit) },
      ),
    onSuccess: () => done(T.proxyDone),
    onError: showRuleCopy,
  })
  const cancel = useMutation({
    mutationFn: () =>
      tab === 'PLAYABILITY'
        ? deletePlayability(
            ids.clubId,
            ids.performanceId,
            cell.songId,
            target,
            partId,
          )
        : deleteVote(ids.clubId, ids.performanceId, cell.songId, target),
    onSuccess: () => done(T.proxyCanceled),
  })
  const hasCurrent =
    tab === 'PLAYABILITY' ? current !== undefined : currentVote !== undefined
  const ready =
    tab === 'PLAYABILITY' ? partId !== '' && answer !== '' : score !== null

  return (
    <ActionModal
      open
      title={T.proxyTitle(cell.displayName)}
      actionLabel={T.save}
      loading={run.isPending}
      actionDisabled={!ready}
      onClose={onClose}
      onSubmit={() => run.mutate()}
    >
      <Typography variant="body2" weight="bold">
        {cell.title}
      </Typography>
      {tab === 'PLAYABILITY' ? (
        <>
          <label className="song-field">
            <Typography variant="caption1">{T.proxyPart}</Typography>
            <select
              aria-label={T.proxyPart}
              value={partId}
              onChange={(e) => {
                const next = answers.find((r) => r.partId === e.target.value)
                setPartId(e.target.value)
                setAnswer(next?.answer ?? '')
                setReason(next?.reason ?? '')
              }}
            >
              {ctx.activeParts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <RadioList
            name={T.proxyAnswer}
            value={answer}
            options={(['POSSIBLE', 'IMPOSSIBLE', 'UNDECIDED'] as Answer[]).map(
              (a) => ({
                value: a,
                label: ANSWER_LABEL[a],
              }),
            )}
            onChange={(v) => setAnswer(v as Answer)}
          />
          {answer === 'IMPOSSIBLE' || answer === 'UNDECIDED' ? (
            <TextArea
              aria-label={T.reasonLabel}
              placeholder={T.reasonLabel}
              value={reason}
              maxLength={500}
              minRows={2}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
            />
          ) : null}
        </>
      ) : (
        <div className="chip-row" role="group" aria-label={T.proxyScore}>
          {(board.voteMethod === 'SCORE' ? [1, 2, 3, 4, 5] : [1]).map((n) => (
            <Button
              key={n}
              size="small"
              variant={score === n ? 'solid' : 'outlined'}
              color="assistive"
              aria-pressed={score === n}
              onClick={() => setScore(n)}
            >
              {board.voteMethod === 'SCORE' ? T.scoreButton(n) : T.proxyApprove}
            </Button>
          ))}
        </div>
      )}
      {hasCurrent ? (
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          loading={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          {T.proxyCancel}
        </Button>
      ) : null}
      <Typography variant="caption1">{T.proxyNote}</Typography>
    </ActionModal>
  )
}

/** SONG-005: who answered what per candidate song (API-158), the response rate and proxy input. */
export function SongStatus() {
  const { clubId = '', performanceId = '' } = useParams()
  const ctx = useSongContext(clubId, performanceId)
  const { perf, policy } = ctx
  const [tab, setTab] = useState<Tab>('PLAYABILITY')
  const [teamId, setTeamId] = useState('')
  const [sortDesc, setSortDesc] = useState(false)
  const [cell, setCell] = useState<Cell>()
  const teams = useQuery({
    queryKey: teamsKey(clubId, performanceId),
    queryFn: () => listTeams(clubId, performanceId),
  })
  const board = useQuery({
    queryKey: [...boardKey(clubId, performanceId), tab, teamId],
    queryFn: () => getBoard(clubId, performanceId, tab, teamId || undefined),
  })

  if (ctx.loading) return <ListSkeleton rows={5} />
  if (ctx.error || !perf || !policy) return <ErrorState onRetry={ctx.refetch} />

  const open =
    perf.status === 'ACTIVE' &&
    (tab === 'PLAYABILITY'
      ? isOpen(policy.playabilityState, policy.playabilityDeadline)
      : isOpen(policy.voteState, policy.voteDeadline))
  const b = board.data
  const members = b?.members ?? []
  const total = (s: EvaluationBoard['songs'][number]) =>
    tab === 'PLAYABILITY'
      ? s.playability.filter((r) => r.answer === 'POSSIBLE').length
      : s.votes.length
  const songs = b ? [...b.songs] : []
  if (sortDesc) songs.sort((x, y) => total(y) - total(x))

  const cellText = (s: EvaluationBoard['songs'][number], pmId: string) => {
    if (tab === 'VOTE') {
      const v = s.votes.find((r) => r.performanceMemberId === pmId)
      if (!v) return ''
      return b?.voteMethod === 'SCORE' ? String(v.score) : T.boardApproveMark
    }
    const rows = s.playability.filter((r) => r.performanceMemberId === pmId)
    return rows
      .map(
        (r) =>
          `${rows.length > 1 ? `${ctx.partName(r.partId)}:` : ''}${ANSWER_LABEL[r.answer]}${r.reason ? '※' : ''}`,
      )
      .join(' / ')
  }
  const sumText = (s: EvaluationBoard['songs'][number]) => {
    if (tab === 'PLAYABILITY') {
      const n = (a: Answer) =>
        s.playability.filter((r) => r.answer === a).length
      return T.playabilitySummary(
        n('POSSIBLE'),
        n('IMPOSSIBLE'),
        n('UNDECIDED'),
      )
    }
    return b?.voteMethod === 'SCORE'
      ? T.voteSummaryScore(
          s.votes.length === 0
            ? null
            : s.votes.reduce((a, v) => a + v.score, 0) / s.votes.length,
          s.votes.length,
        )
      : T.voteSummaryApproval(s.votes.length)
  }

  return (
    <div className="start song-screen" data-screen-id="SONG-005">
      <div className="chip-row" role="tablist">
        {(['PLAYABILITY', 'VOTE'] as Tab[]).map((t) => (
          <Button
            key={t}
            size="small"
            role="tab"
            variant={t === tab ? 'solid' : 'outlined'}
            color="assistive"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
          >
            {t === 'PLAYABILITY' ? T.boardTabPlayability : T.boardTabVote}
          </Button>
        ))}
      </div>
      {(teams.data ?? []).length > 0 ? (
        <label className="song-field">
          <Typography variant="caption1">{T.scopeChips}</Typography>
          <select
            aria-label={T.scopeChips}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            <option value="">{T.boardScopeAll}</option>
            {(teams.data ?? [])
              .filter((t) =>
                ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(t.status),
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      {board.isPending ? <ListSkeleton rows={4} /> : null}
      {board.isError ? (
        <ErrorState onRetry={() => void board.refetch()} />
      ) : null}
      {b ? (
        <>
          <Typography variant="body1" weight="bold" role="status">
            {T.boardRate(b.responseRate.answered, b.responseRate.total)}
          </Typography>
          {b.songs.length === 0 ? (
            <EmptyState description={T.boardEmpty} />
          ) : b.members === null ? (
            <Typography variant="body2">{T.boardNamesHidden}</Typography>
          ) : (
            <div className="song-table-wrap">
              <table className="song-table">
                <thead>
                  <tr>
                    <th scope="col">{T.boardSong}</th>
                    {members.map((m) => (
                      <th key={m.performanceMemberId} scope="col">
                        {m.displayName}
                      </th>
                    ))}
                    <th scope="col">
                      <button
                        type="button"
                        onClick={() => setSortDesc(!sortDesc)}
                      >
                        {T.boardTotal}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {songs.map((s) => (
                    <tr key={s.songId}>
                      <th scope="row">{s.title}</th>
                      {members.map((m) => (
                        <td key={m.performanceMemberId}>
                          {open ? (
                            <button
                              type="button"
                              className="song-cell"
                              aria-label={T.boardCell(s.title, m.displayName)}
                              onClick={() =>
                                setCell({
                                  songId: s.songId,
                                  title: s.title,
                                  performanceMemberId: m.performanceMemberId,
                                  displayName: m.displayName,
                                })
                              }
                            >
                              {cellText(s, m.performanceMemberId) || '·'}
                            </button>
                          ) : (
                            cellText(s, m.performanceMemberId)
                          )}
                        </td>
                      ))}
                      <td>{sumText(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <section className="song-section" aria-label={T.boardNonResponders}>
            <Typography variant="body1" weight="bold">
              {T.boardNonResponders}
            </Typography>
            {(b.nonResponders ?? []).length === 0 ? (
              <Typography variant="caption1">
                {T.boardNonRespondersEmpty}
              </Typography>
            ) : (
              <ul className="song-plain-list">
                {(b.nonResponders ?? []).map((p) => (
                  <li key={p.performanceMemberId}>
                    {`${p.displayName} · ${T.boardUnresponded(p.unrespondedSongCount)}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {cell && b ? (
        <ProxySheet
          ids={{ clubId, performanceId }}
          tab={tab}
          cell={cell}
          board={b}
          ctx={ctx}
          onClose={() => setCell(undefined)}
        />
      ) : null}
    </div>
  )
}
