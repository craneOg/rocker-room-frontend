import { Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { ActionModal, RadioList } from '../club/ManageBits'
import { listPerformances } from './api'
import { performanceListKey } from './viewApi'
import { performanceDate } from './viewBits'
import { VIEW_COPY as T } from './viewCopy'

/** CLUB-102 4-3: pick a draft or active performance to add the selected members to (API-142). */
export function BulkAssignSheet({
  clubId,
  loading,
  onClose,
  onSubmit,
}: {
  clubId: string
  loading: boolean
  onClose: () => void
  onSubmit: (performanceId: string) => void
}) {
  // ponytail: first page (20) of the assignable performances; add paging if a club keeps more open.
  const list = useQuery({
    queryKey: [...performanceListKey(clubId), 'assignable'],
    queryFn: () =>
      listPerformances(
        clubId,
        { status: ['DRAFT', 'ACTIVE'], sort: 'performDate,asc' },
        0,
      ),
  })
  const [picked, setPicked] = useState('')
  const items = list.data?.items ?? []
  return (
    <ActionModal
      open
      title={T.bulkAssignTitle}
      actionLabel={T.bulkAssignAdd}
      loading={loading}
      actionDisabled={picked === ''}
      onClose={onClose}
      onSubmit={() => onSubmit(picked)}
    >
      {list.isPending ? <ListSkeleton rows={3} /> : null}
      {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && items.length === 0 ? (
        <Typography variant="body2">{T.noAssignable}</Typography>
      ) : null}
      <RadioList
        name={T.bulkAssignTitle}
        value={picked}
        onChange={setPicked}
        options={items.map((p) => ({
          value: p.id,
          label: p.title,
          hint: performanceDate(p),
        }))}
      />
      <Typography variant="caption1">{T.bulkAssignHint}</Typography>
    </ActionModal>
  )
}
