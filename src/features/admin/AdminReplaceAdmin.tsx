import { Button, TextArea, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { COPY } from '../../shared/ui/copy'
import { ErrorState } from '../../shared/ui/StateViews'
import { listMembers } from '../club/api'
import { ActionModal, RadioList } from '../club/ManageBits'
import { type AdminClubDetail } from './adminApi'
import { ADMIN_COPY as T } from './adminCopy'

type Props = {
  clubId: string
  admins: AdminClubDetail['admins']
  loading: boolean
  onSubmit: (reason: string, successorMembershipId: string) => void
  onClose: () => void
}

/** SADM-003 5-1: reason, successor, the release notice, then the summary. Mounted only while open. */
export function AdminReplaceAdmin({
  clubId,
  admins,
  loading,
  onSubmit,
  onClose,
}: Props) {
  const [step, setStep] = useState(0)
  const [reason, setReason] = useState('')
  const [successor, setSuccessor] = useState('')

  // ponytail: first 100 active members only, no search or paging; add them when a club exceeds it.
  // Whether a Super Admin may call the club member API is unconfirmed (tmp/backend-questions.md).
  const members = useQuery({
    queryKey: ['admin', 'club', clubId, 'successors'],
    queryFn: ({ signal }) =>
      listMembers(
        clubId,
        { status: ['ACTIVE'], memberType: 'REGULAR' },
        0,
        signal,
        100,
      ),
    enabled: step === 1,
  })
  const candidates = (members.data?.items ?? []).filter(
    (m) =>
      m.role !== 'CLUB_ADMIN' &&
      m.memberType === 'REGULAR' &&
      m.status === 'ACTIVE',
  )
  const chosen = candidates.find((m) => m.id === successor)
  const last = T.replaceSteps.length - 1
  const name = (m: { displayName: string | null; userName: string }) =>
    m.displayName ?? m.userName

  const disabled =
    (step === 0 && reason.trim() === '') || (step === 1 && !chosen)

  return (
    <ActionModal
      open
      title={`${T.replace} (${T.replaceStep(step + 1, last + 1)})`}
      actionLabel={step === last ? T.replaceRun : T.replaceNext}
      actionDisabled={disabled}
      loading={loading}
      onSubmit={() =>
        step < last ? setStep(step + 1) : onSubmit(reason.trim(), successor)
      }
      onClose={onClose}
    >
      {step === 0 ? (
        <>
          <Typography variant="body2">{T.replaceReason}</Typography>
          <TextArea
            aria-label={T.replaceReason}
            value={reason}
            maxLength={COPY.reasonMax}
            minRows={3}
            onChange={(e) => setReason(e.target.value.slice(0, COPY.reasonMax))}
          />
          <p className="reason-counter">{`${reason.length} / ${COPY.reasonMax}`}</p>
        </>
      ) : step === 1 ? (
        members.isError ? (
          <ErrorState onRetry={() => void members.refetch()} />
        ) : members.isPending ? (
          <Typography variant="body2">{COPY.loading}</Typography>
        ) : candidates.length === 0 ? (
          <Typography variant="body2">{T.replaceNoCandidate}</Typography>
        ) : (
          <>
            <Typography variant="body2">{T.replaceSuccessor}</Typography>
            <RadioList
              name={T.replaceSuccessor}
              value={successor}
              onChange={setSuccessor}
              options={candidates.map((m) => ({
                value: m.id,
                label: name(m),
                hint: m.handle ? `@${m.handle}` : undefined,
              }))}
            />
          </>
        )
      ) : step === 2 ? (
        <Typography variant="body2">{T.replaceRelease}</Typography>
      ) : (
        <dl>
          <dt>{T.replaceSummaryReason}</dt>
          <dd>{reason.trim()}</dd>
          <dt>{T.replaceSummarySuccessor}</dt>
          <dd>{chosen ? name(chosen) : ''}</dd>
          <dt>{T.replaceSummaryReleased}</dt>
          <dd>
            {admins.length === 0
              ? T.never
              : admins.map((a) => a.displayName).join(', ')}
          </dd>
        </dl>
      )}
      {step > 0 ? (
        <Button
          variant="outlined"
          color="assistive"
          onClick={() => setStep(step - 1)}
        >
          {T.replacePrev}
        </Button>
      ) : null}
    </ActionModal>
  )
}
