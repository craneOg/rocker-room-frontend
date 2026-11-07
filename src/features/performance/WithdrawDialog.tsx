import { TextArea, Typography } from '@montage-ui/core'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import { isApiError } from '../../shared/api/errors'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { ErrorState } from '../../shared/ui/StateViews'
import { ActionModal } from '../club/ManageBits'
import { performanceKey } from './api'
import {
  getTeamLite,
  getWithdrawImpact,
  invalidatePerformance,
  withdrawParticipation,
} from './viewApi'
import { VIEW_COPY as T } from './viewCopy'

/** 422 SONG_WITHOUT_PLAYER (X-04) as an own error: shown as a dialog here, not by the global handler. */
class SongWithoutPlayerError extends Error {
  readonly songs: number
  constructor(songs: number) {
    super('song without player')
    this.name = 'SongWithoutPlayerError'
    this.songs = songs
  }
}

type Props = {
  clubId: string
  performanceId: string
  performanceMemberId: string
  /** The person leaving: excluded from the successor choice. */
  membershipId: string
  title: string
  /** Impact copy under the title. */
  body: string
  /** LOCKED: the reason is required (API-060). */
  reasonRequired: boolean
  doneMessage: string
  actionLabel: string
  onClose: () => void
}

/**
 * PERF-003 4-2 (own withdrawal) and PMEM-001 3-1 (officer release): both end in API-060. A leader
 * of a team that keeps other members must name a successor per team (P-06 / P-07), read from the
 * impact (API-059) and the team details (API-063).
 */
export function WithdrawDialog({
  clubId,
  performanceId,
  performanceMemberId,
  membershipId,
  title,
  body,
  reasonRequired,
  doneMessage,
  actionLabel,
  onClose,
}: Props) {
  const qc = useQueryClient()
  const base = performanceKey(clubId, performanceId)
  const impact = useQuery({
    queryKey: [...base, 'impact', performanceMemberId],
    queryFn: () =>
      getWithdrawImpact(clubId, performanceId, performanceMemberId),
  })
  const teamIds = impact.data?.teamIds ?? [] // null (404): nothing to choose
  const teams = useQueries({
    queries: teamIds.map((teamId) => ({
      queryKey: [...base, 'team-lite', teamId],
      queryFn: () => getTeamLite(clubId, performanceId, teamId),
    })),
  })
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')

  const ready = impact.isSuccess && teams.every((t) => t.isSuccess)
  const failed = impact.isError || teams.some((t) => t.isError)
  // Teams I lead that keep other members after I leave.
  const needSuccessor = teams.flatMap((t) => {
    const team = t.data
    if (!team) return []
    const self = team.members.find((m) => m.membershipId === membershipId)
    const others = team.members.filter((m) => m.membershipId !== membershipId)
    return self?.isLeader && others.length > 0 ? [{ team, others }] : []
  })
  const missing = needSuccessor.some(({ team }) => !picks[team.id])
  const needReason = reasonRequired && reason.trim() === ''

  const run = useMutation({
    mutationFn: async () => {
      try {
        return await withdrawParticipation(
          clubId,
          performanceId,
          performanceMemberId,
          {
            reason: reason.trim() || undefined,
            teamLeaderSuccessors: needSuccessor.map(({ team }) => ({
              teamId: team.id,
              membershipId: picks[team.id] ?? '',
            })),
          },
        )
      } catch (e) {
        const songs = isApiError(e, 'RULE_VIOLATION')
          ? e.details.filter((d) => d.reason === 'SONG_WITHOUT_PLAYER')
          : []
        if (songs.length > 0) throw new SongWithoutPlayerError(songs.length)
        throw e
      }
    },
    onSuccess: async () => {
      await invalidatePerformance(qc, clubId, performanceId)
      feedback.toast(doneMessage, 'positive')
      onClose()
    },
    onError: (e) => {
      if (e instanceof SongWithoutPlayerError)
        void feedback.dialog({
          title: COPY.ruleViolationTitle,
          description: T.songWithoutPlayer(e.songs),
          confirmLabel: COPY.confirm,
        })
    },
  })

  return (
    <ActionModal
      open
      title={title}
      actionLabel={actionLabel}
      loading={run.isPending}
      actionDisabled={!ready || missing || needReason}
      onClose={onClose}
      onSubmit={() => run.mutate()}
    >
      <Typography variant="body2">{body}</Typography>
      {failed ? (
        <ErrorState
          onRetry={() => {
            void impact.refetch()
            teams.forEach((t) => void t.refetch())
          }}
        />
      ) : null}
      {needSuccessor.map(({ team, others }) => (
        <label key={team.id} className="withdraw-successor">
          <Typography variant="body2" weight="bold">
            {T.successorLabel(team.name)}
          </Typography>
          <select
            value={picks[team.id] ?? ''}
            onChange={(e) =>
              setPicks((p) => ({ ...p, [team.id]: e.target.value }))
            }
          >
            <option value="">{T.successorPick}</option>
            {others.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
      ))}
      {missing ? (
        <Typography variant="caption1" role="alert">
          {T.successorRequired}
        </Typography>
      ) : null}
      {reasonRequired ? (
        <>
          <Typography variant="caption1">{T.lockedReasonHint}</Typography>
          <TextArea
            aria-label={T.reasonLabel}
            value={reason}
            maxLength={COPY.reasonMax}
            minRows={3}
            onChange={(e) => setReason(e.target.value.slice(0, COPY.reasonMax))}
          />
        </>
      ) : null}
    </ActionModal>
  )
}
