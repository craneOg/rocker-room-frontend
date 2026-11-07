import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ConfirmationDeclinedError } from '../../shared/api/errors'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { withRuleCopy } from '../club/manageApi'
import { showRuleCopy } from '../club/ManageBits'
import { getPerformance, performanceKey } from './api'
import {
  changeStatus,
  getChecklist,
  invalidatePerformance,
  lockPerformance,
  MemberInputExistsError,
  warningsKey,
  type ChecklistItem,
  type StatusAction,
} from './policyApi'
import { STATUS_COPY as T } from './policyCopy'
import type { PerformanceDetail, PerformanceStatus as Status } from './types'
import './policy.css'

type Transition = {
  id: StatusAction | 'lock'
  mode: 'confirm' | 'reason' | 'lock'
}

// Only the moves the current status allows. API-047 also allows finishing straight from ACTIVE (the screen spec said no; the API wins).
const TRANSITIONS: Record<Status, Transition[]> = {
  DRAFT: [
    { id: 'activate', mode: 'confirm' },
    { id: 'cancel', mode: 'reason' },
  ],
  ACTIVE: [
    { id: 'lock', mode: 'lock' },
    { id: 'finish', mode: 'confirm' },
    { id: 'revert-to-draft', mode: 'confirm' },
    { id: 'cancel', mode: 'reason' },
  ],
  LOCKED: [
    { id: 'finish', mode: 'confirm' },
    { id: 'reopen', mode: 'reason' },
    { id: 'cancel', mode: 'reason' },
  ],
  FINISHED: [{ id: 'revert-to-locked', mode: 'reason' }],
  CANCELED: [{ id: 'restore', mode: 'reason' }],
}

type Copy = {
  label: string
  hint: string
  title: string
  description?: string
  action: string
}
const copyOf = (id: StatusAction | 'lock'): Copy =>
  id === 'cancel'
    ? T.cancelPerf
    : id === 'lock'
      ? { ...T.lock, title: T.lockTitle, action: T.lockAction }
      : id === 'revert-to-draft'
        ? { ...T[id], description: undefined }
        : T[id]

const FLOW: Status[] = ['DRAFT', 'ACTIVE', 'LOCKED', 'FINISHED']

/** Where a checklist row leads ("해결하러 가기"); mirrors the home checklist. */
const resolvePath = (checkId: string) =>
  ({
    'L-01': 'setlist',
    'L-02': 'songs',
    'L-03': 'songs',
    'L-04': 'teams/review',
    'L-05': 'members',
    'L-06': 'auditions',
  })[checkId]

/** 3: the six required conditions (✓/✕ with the unmet targets) and the warnings. */
function Checklist({ items, base }: { items: ChecklistItem[]; base: string }) {
  const warnings = items.filter((i) => i.result === 'WARNING')
  return (
    <section className="policy-card" aria-label={T.checkTitle}>
      <Typography variant="body1" weight="bold" as="h2">
        {T.checkTitle}
      </Typography>
      <ul className="status-checks">
        {Object.entries(T.required).map(([id, label]) => {
          const unmet = items.filter(
            (i) => i.checkId === id && i.result === 'UNMET',
          )
          const to = resolvePath(id)
          return (
            <li key={id}>
              <span
                aria-label={unmet.length ? T.checkMarkUnmet : T.checkMarkOk}
              >
                {unmet.length ? '✕' : '✓'}
              </span>
              <Typography variant="body2">{label}</Typography>
              {unmet.length ? (
                <ul>
                  {unmet.map((i) => (
                    <li key={`${i.targetId}:${i.message}`}>{i.message}</li>
                  ))}
                </ul>
              ) : null}
              {unmet.length && to ? (
                <Link to={`${base}/${to}`}>{T.resolve}</Link>
              ) : null}
            </li>
          )
        })}
      </ul>
      {warnings.length ? (
        <>
          <Typography variant="body2" weight="bold">
            {T.checkWarning}
          </Typography>
          <ul className="status-checks">
            {warnings.map((i) => (
              <li key={`${i.checkId}:${i.targetId}:${i.message}`}>
                <span aria-label={T.checkMarkWarning}>△</span>
                <Typography variant="body2">{i.message}</Typography>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

function StatusEditor({
  clubId,
  performanceId,
  detail,
}: {
  clubId: string
  performanceId: string
  detail: PerformanceDetail
}) {
  const queryClient = useQueryClient()
  const { performance } = detail
  const { status, version } = performance
  const base = `/clubs/${clubId}/performances/${performanceId}`
  const [reasonFor, setReasonFor] = useState<StatusAction | null>(null)
  const [checking, setChecking] = useState(false)
  const showCheck = checking && status === 'ACTIVE'

  const checklist = useQuery({
    queryKey: warningsKey(clubId, performanceId),
    queryFn: () => getChecklist(clubId, performanceId),
    enabled: showCheck,
    // A check done earlier must not be reused for a lock.
    gcTime: 0,
  })
  const items = checklist.data?.items
  const blocked = items === undefined || items.some((i) => i.result === 'UNMET')

  const refresh = () =>
    invalidatePerformance(queryClient, clubId, performanceId)

  const change = useMutation({
    mutationFn: ({
      action,
      reason,
    }: {
      action: StatusAction
      reason?: string
    }) => changeStatus(clubId, performanceId, action, version, reason),
    onSuccess: async () => {
      setReasonFor(null)
      await refresh()
      feedback.toast(T.changed, 'positive')
    },
    onError: (e) => {
      setReasonFor(null)
      // 2-2: member input blocks the revert (COM-003 #7).
      if (e instanceof MemberInputExistsError)
        void feedback.dialog({
          title: T.memberInputTitle,
          items: e.items,
          confirmLabel: COPY.confirm,
        })
    },
  })

  const lock = useMutation({
    mutationFn: async () => {
      // 3-1: the screen's own confirmation, with the warnings the check showed.
      const warnings = (items ?? []).filter((i) => i.result === 'WARNING')
      const choice = await feedback.dialog({
        title: T.lockTitle,
        description: [
          T.lockDescription,
          warnings.length ? T.lockWarnings(warnings.length) : '',
        ]
          .filter(Boolean)
          .join('\n'),
        items: warnings.map((w) => w.message),
        cancelLabel: T.cancelButton,
        confirmLabel: T.confirm,
      })
      if (choice !== 'confirm') throw new ConfirmationDeclinedError()
      return withRuleCopy(
        () => lockPerformance(clubId, performanceId, version),
        {
          LOCK_REQUIREMENTS_FAILED: T.lockRuleFailed,
        },
      )
    },
    onSuccess: async () => {
      setChecking(false)
      await refresh()
      feedback.toast(T.locked, 'positive')
    },
    onError: (e) => {
      showRuleCopy(e)
      void queryClient.invalidateQueries({
        queryKey: warningsKey(clubId, performanceId),
      })
    },
  })

  const start = async (t: Transition) => {
    if (t.mode === 'lock') return setChecking(true)
    const id = t.id as StatusAction
    if (t.mode === 'reason') return setReasonFor(id)
    const c = copyOf(id)
    const choice = await feedback.dialog({
      title: c.title,
      description: c.description,
      cancelLabel: T.cancelButton,
      confirmLabel: c.action,
    })
    if (choice === 'confirm') change.mutate({ action: id })
  }

  const busy = change.isPending || lock.isPending
  const reasonCopy = reasonFor ? copyOf(reasonFor) : undefined
  const at = FLOW.indexOf(status)
  return (
    <>
      <ol className="status-flow" aria-label={T.flowLabel}>
        {FLOW.map((s, i) => (
          <li
            key={s}
            aria-current={s === status ? 'step' : undefined}
            className={i <= at ? 'is-reached' : undefined}
          >
            {T.statusLabel[s]}
          </li>
        ))}
      </ol>
      {status === 'CANCELED' ? (
        <Typography
          variant="body2"
          color="semantic.foreground.negative.primary"
        >
          {T.canceledNote}
        </Typography>
      ) : null}

      <section className="start-section">
        {TRANSITIONS[status].map((t) => {
          const c = copyOf(t.id)
          return (
            <div key={t.id} className="start-card">
              <div className="start-card-text">
                <Typography variant="body1" weight="bold">
                  {c.label}
                </Typography>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {c.hint}
                </Typography>
              </div>
              <Button
                size="small"
                variant="outlined"
                color={t.id === 'cancel' ? 'assistive' : undefined}
                disabled={busy}
                onClick={() => void start(t)}
              >
                {c.label}
              </Button>
            </div>
          )
        })}
      </section>

      {showCheck ? (
        <>
          {checklist.isError ? (
            <ErrorState onRetry={() => void checklist.refetch()} />
          ) : items === undefined ? (
            <ListSkeleton rows={3} />
          ) : (
            <Checklist items={items} base={base} />
          )}
          <Button
            size="large"
            loading={lock.isPending}
            disabled={blocked || busy}
            onClick={() => lock.mutate()}
          >
            {T.lockAction}
          </Button>
        </>
      ) : null}

      <ReasonModal
        open={reasonFor !== null}
        title={reasonCopy?.title}
        description={reasonCopy?.description}
        actionLabel={reasonCopy?.action ?? ''}
        loading={change.isPending}
        onClose={() => setReasonFor(null)}
        onSubmit={(reason) =>
          reasonFor && change.mutate({ action: reasonFor, reason })
        }
      />
    </>
  )
}

/** PERF-005: change the status of a performance (officers only); only the allowed moves are offered. */
export function PerformanceStatusScreen() {
  const { clubId = '', performanceId = '' } = useParams()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })

  let body
  if (isError) body = <ErrorState onRetry={() => void refetch()} />
  else if (isPending) body = <ListSkeleton rows={3} />
  else
    body = (
      <StatusEditor
        key={data.performance.version}
        clubId={clubId}
        performanceId={performanceId}
        detail={data}
      />
    )
  return (
    <div className="start policy" data-screen-id="PERF-005">
      <Typography variant="title2" weight="bold" as="h1">
        {T.title}
      </Typography>
      {data ? (
        <Typography
          variant="body2"
          color="semantic.foreground.neutral.secondary"
        >
          {data.performance.title}
        </Typography>
      ) : null}
      {body}
    </div>
  )
}
