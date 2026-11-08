import { Button, TextArea, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { isApiError } from '../../shared/api/errors'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import {
  ErrorState,
  ListSkeleton,
  NotFoundView,
} from '../../shared/ui/StateViews'
import { getPerformance, performanceKey } from '../performance/api'
import { invalidatePerformance } from '../performance/viewApi'
import {
  auditionKey,
  findAudition,
  saveAuditionResult,
  type Audition,
  type AuditionResult as Result,
  type AuditionSaved,
} from './auditionApi'
import { targetText, typeLabel, whenText } from './auditionBits'
import { AUDITION_COPY as T } from './auditionCopy'
import './audition.css'

const COMMENT_MAX = 500

/**
 * 4-1: the follow-up the saved result suggests; it never changes the song or players itself (A-08).
 * ponytail: whether the server changes the song status after a judgement is unconfirmed (서버 미확인);
 * the dialog follows the `songStatus` the response carries.
 */
async function suggestFollowUp(
  saved: AuditionSaved,
  go: (path: string) => void,
  base: string,
) {
  const song = `${base}/songs/${saved.songId}`
  const ask = async (description: string, action: string, to: string) => {
    const choice = await feedback.dialog({
      title: T.followTitle,
      description,
      cancelLabel: T.later,
      confirmLabel: action,
    })
    go(choice === 'confirm' ? to : `${base}/auditions`)
  }
  const proposed = saved.songStatus === 'PROPOSED'
  const confirmed = saved.songStatus === 'CONFIRMED'
  const passed = saved.result === 'PASSED'

  if (saved.type === 'SONG') {
    if (passed && proposed) return ask(T.followSelect, T.select, song)
    if (!passed && proposed) return ask(T.followEliminate, T.eliminate, song)
    if (!passed && confirmed)
      return ask(T.followEliminateConfirmed, T.eliminate, song)
  } else if (passed && confirmed) {
    const q = new URLSearchParams({
      applicantPerformanceMemberId: saved.applicantPerformanceMemberId ?? '',
      partId: saved.partId ?? '',
    })
    return ask(
      T.followAssign(saved.applicantName ?? '', saved.partName ?? ''),
      T.assign,
      `${song}/players?${q.toString()}`,
    )
  } else if (passed && proposed) {
    await feedback.dialog({
      title: T.followTitle,
      description: T.followAssignLater,
      confirmLabel: T.ok,
    })
    return go(`${base}/auditions`)
  }
  feedback.toast(T.saved, 'positive')
  go(`${base}/auditions`)
}

function ResultForm({
  clubId,
  performanceId,
  audition,
  locked,
}: {
  clubId: string
  performanceId: string
  audition: Audition
  locked: boolean
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const base = `/clubs/${clubId}/performances/${performanceId}`
  const correcting = audition.result !== null
  const [result, setResult] = useState<Result | null>(audition.result)
  const [comment, setComment] = useState(audition.comment ?? '')
  const [asking, setAsking] = useState(false)
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: (reason?: string) =>
      saveAuditionResult(clubId, performanceId, audition.id, {
        result: result as Result,
        comment: comment.trim() || null,
        reason,
        version: audition.version,
      }),
    onSuccess: async (saved) => {
      setAsking(false)
      await invalidatePerformance(qc, clubId, performanceId)
      await suggestFollowUp(saved, (p) => void navigate(p), base)
    },
    onError: (e) => {
      // 400 REASON_REQUIRED: the screen thought the performance was not LOCKED; ask for the reason.
      setAsking(
        isApiError(e, 'VALIDATION_ERROR') &&
          e.details.some((d) => d.reason === 'REASON_REQUIRED'),
      )
    },
  })

  const submit = () => {
    setTried(true)
    if (result === null) return
    // X-02: a confirmed (LOCKED) performance takes the change only with a reason.
    if (locked) setAsking(true)
    else save.mutate(undefined)
  }

  return (
    <>
      {correcting ? (
        <Typography
          variant="body2"
          color="semantic.foreground.negative.primary"
        >
          {T.correctNotice}
        </Typography>
      ) : null}

      <div className="audition-summary" role="group" aria-label={T.summarySong}>
        <Typography variant="body2">{`${T.summaryType}: ${typeLabel(audition.type)}`}</Typography>
        <Typography variant="body2">{`${T.summarySong}: ${audition.songTitle}`}</Typography>
        {audition.type === 'SESSION' ? (
          <Typography variant="body2">{`${T.summaryApplicant}: ${targetText(audition)}`}</Typography>
        ) : null}
        <Typography variant="body2">{`${T.summarySchedule}: ${whenText(audition.scheduledAt)}`}</Typography>
        {audition.memo ? (
          <Typography variant="body2">{`${T.summaryMemo}: ${audition.memo}`}</Typography>
        ) : null}
      </div>

      <section className="start-section">
        <Typography variant="body2" weight="bold">
          {T.resultLabel}
        </Typography>
        <div className="chip-row" role="group" aria-label={T.resultLabel}>
          {(['PASSED', 'FAILED'] as const).map((r) => (
            <Button
              key={r}
              variant={result === r ? 'solid' : 'outlined'}
              color="assistive"
              aria-pressed={result === r}
              onClick={() => setResult(r)}
            >
              {r === 'PASSED' ? T.passed : T.failed}
            </Button>
          ))}
        </div>
        {tried && result === null ? (
          <span className="audition-error">{`* ${T.needResult}`}</span>
        ) : null}
      </section>

      <FormField label={T.commentLabel}>
        <TextArea
          aria-label={T.commentLabel}
          value={comment}
          placeholder={T.commentPlaceholder}
          maxLength={COMMENT_MAX}
          minRows={3}
          onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
        />
      </FormField>

      <Button size="large" loading={save.isPending} onClick={submit}>
        {T.save}
      </Button>

      <ReasonModal
        open={asking}
        title={T.reasonTitle}
        description={T.reasonHint}
        actionLabel={T.save}
        loading={save.isPending}
        onClose={() => setAsking(false)}
        onSubmit={(reason) => save.mutate(reason)}
      />
    </>
  )
}

/** AUDI-003: record or correct the result of one audition (officers). */
export function AuditionResult() {
  const { clubId = '', performanceId = '', auditionId = '' } = useParams()
  const navigate = useNavigate()
  const detail = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const audition = useQuery({
    queryKey: [...auditionKey(clubId, performanceId), 'one', auditionId],
    queryFn: () => findAudition(clubId, performanceId, auditionId),
  })

  const status = detail.data?.performance.status
  const closed = status === 'FINISHED' || status === 'CANCELED'

  let body
  if (audition.isError || detail.isError)
    body = (
      <ErrorState
        onRetry={() => {
          void audition.refetch()
          void detail.refetch()
        }}
      />
    )
  else if (audition.isPending || detail.isPending)
    body = <ListSkeleton rows={3} />
  else if (audition.data === null)
    body = <NotFoundView onHome={() => void navigate('/')} />
  else if (closed)
    body = <Typography variant="body2">{T.closedPerformance}</Typography>
  else
    body = (
      <ResultForm
        // The version changes with every save or reload: start the form over then.
        key={audition.data.version}
        clubId={clubId}
        performanceId={performanceId}
        audition={audition.data}
        locked={status === 'LOCKED'}
      />
    )

  return (
    <div className="start audition-form" data-screen-id="AUDI-003">
      <Typography variant="title2" weight="bold" as="h1">
        {T.resultTitle}
      </Typography>
      {body}
    </div>
  )
}
