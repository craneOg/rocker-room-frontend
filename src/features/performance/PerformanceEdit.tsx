import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { extractWarnings } from '../../shared/api/assumptions'
import { fieldErrors } from '../../shared/api/errors'
import { feedback } from '../../shared/ui/feedbackBus'
import { COPY } from '../../shared/ui/copy'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import { ErrorState, PageLoading } from '../../shared/ui/StateViews'
import { getPerformance, performanceKey } from './api'
import {
  BasicFields,
  isBasicValid,
  toBasicInfo,
  type BasicValue,
} from './BasicFields'
import { invalidatePerformances, updatePerformance } from './formApi'
import { FORM_COPY as T } from './formCopy'
import type { Performance } from './types'
import './form.css'

/** PERF-006: name, date and place. Officers only; the loaded version rides along on save. */
export function PerformanceEdit() {
  const { clubId = '', performanceId = '' } = useParams()
  const query = useQuery({
    queryKey: performanceKey(clubId, performanceId),
    queryFn: () => getPerformance(clubId, performanceId),
  })
  if (query.isPending) return <PageLoading />
  if (query.isError)
    return (
      <div data-screen-id="PERF-006">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    )
  // Keyed by version: after a VERSION_CONFLICT the refetched values replace the form.
  return (
    <EditForm
      key={query.data.performance.version}
      clubId={clubId}
      performance={query.data.performance}
    />
  )
}

const initial = (p: Performance): BasicValue => ({
  title: p.title,
  date: p.performDate ?? '',
  undecided: p.performDate === null,
  location: p.location ?? '',
})

function EditForm({
  clubId,
  performance,
}: {
  clubId: string
  performance: Performance
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [value, setValue] = useState(() => initial(performance))
  const [asking, setAsking] = useState(false)
  const locked = performance.status === 'LOCKED'
  const editable =
    performance.status !== 'FINISHED' && performance.status !== 'CANCELED'

  const sending = useRef(false)
  const save = useMutation({
    mutationFn: (reason?: string) =>
      updatePerformance(clubId, performance.id, {
        version: performance.version,
        ...toBasicInfo(value),
        ...(reason === undefined ? {} : { reason }),
      }),
    onSuccess: async (saved) => {
      setAsking(false)
      await invalidatePerformances(queryClient, clubId)
      feedback.toast(COPY.saved, 'positive')
      // A warning banner (F-06) belongs to this screen; it would vanish on navigation.
      if (extractWarnings(saved).length === 0)
        void navigate(`/clubs/${clubId}/performances/${performance.id}`)
    },
    onError: () => setAsking(false),
    onSettled: () => {
      sending.current = false
    },
  })
  const serverErrors = fieldErrors(save.error)
  const send = (reason?: string) => {
    if (sending.current) return
    sending.current = true
    save.mutate(reason)
  }
  const submit = () => {
    if (locked) setAsking(true)
    else send()
  }
  const canSave = editable && isBasicValid(value)

  return (
    <form
      className="perf-form"
      data-screen-id="PERF-006"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) submit()
      }}
    >
      {editable ? null : (
        <Typography variant="body2">{T.notEditable}</Typography>
      )}
      <BasicFields
        value={value}
        serverErrors={serverErrors}
        onChange={(next) => {
          setValue(next)
          if (save.isError) save.reset()
        }}
      />
      <div className="perf-actions">
        <Button
          type="submit"
          size="large"
          fullWidth
          loading={save.isPending}
          disabled={!canSave}
        >
          {T.save}
        </Button>
      </div>
      <ReasonModal
        open={asking}
        title={T.lockedReasonTitle}
        description={T.lockedReasonDescription}
        actionLabel={T.save}
        loading={save.isPending}
        onClose={() => setAsking(false)}
        onSubmit={send}
      />
    </form>
  )
}
