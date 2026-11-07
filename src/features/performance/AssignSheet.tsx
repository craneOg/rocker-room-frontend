import { Button, TextField, Typography } from '@montage-ui/core'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { feedback } from '../../shared/ui/feedbackBus'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listMembers } from '../club/api'
import { ActionModal } from '../club/ManageBits'
import { memberName } from '../club/MemberBits'
import { performanceKey } from './api'
import {
  assignParticipants,
  invalidatePerformance,
  listPerformanceMembers,
} from './viewApi'
import { VIEW_COPY as T } from './viewCopy'

// Active, on-leave and graduated members; guests are listed too (P-02).
const ASSIGNABLE = ['ACTIVE', 'ON_LEAVE', 'GRADUATED']

/** PMEM-001 4-1: officers pick club members to assign as confirmed participants (API-056). */
export function AssignSheet({
  clubId,
  performanceId,
  onClose,
}: {
  clubId: string
  performanceId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const q = useDeferredValue(input.trim())
  const [picked, setPicked] = useState<string[]>([])

  const members = useInfiniteQuery({
    queryKey: ['club-members', clubId, { q, status: ASSIGNABLE, assign: true }],
    queryFn: ({ pageParam, signal }) =>
      listMembers(clubId, { q, status: ASSIGNABLE }, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  // ponytail: first 100 confirmed participants only; the server returns an already APPROVED
  // target unchanged, so a missed one is harmless. Page through if clubs grow past that.
  const inPerformance = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'approved-ids'],
    queryFn: async () =>
      new Set(
        (
          await listPerformanceMembers(
            clubId,
            performanceId,
            { status: ['APPROVED'] },
            0,
            100,
          )
        ).items.map((m) => m.membershipId),
      ),
  })
  const items = members.data?.pages.flatMap((p) => p.items) ?? []

  const run = useMutation({
    mutationFn: () => assignParticipants(clubId, performanceId, picked),
    onSuccess: async (r) => {
      await invalidatePerformance(qc, clubId, performanceId)
      feedback.toast(T.assigned(r.items.length), 'positive')
      onClose()
    },
  })

  return (
    <ActionModal
      open
      title={T.assignTitle}
      actionLabel={T.assignSubmit}
      loading={run.isPending}
      actionDisabled={picked.length === 0}
      onClose={onClose}
      onSubmit={() => run.mutate()}
    >
      <TextField
        value={input}
        placeholder={T.assignSearch}
        aria-label={T.assignSearch}
        maxLength={100}
        onChange={(e) => setInput(e.target.value)}
      />
      {members.isPending ? <ListSkeleton rows={3} /> : null}
      {members.isError ? (
        <ErrorState onRetry={() => void members.refetch()} />
      ) : null}
      {members.isSuccess && items.length === 0 ? (
        <EmptyState description={T.assignEmpty} />
      ) : null}
      <div className="choice-list assign-list">
        {items.map((m) => {
          const already = inPerformance.data?.has(m.id) ?? false
          return (
            <label key={m.id} className="choice-row">
              <input
                type="checkbox"
                checked={already || picked.includes(m.id)}
                disabled={already}
                onChange={() =>
                  setPicked((ids) =>
                    ids.includes(m.id)
                      ? ids.filter((x) => x !== m.id)
                      : [...ids, m.id],
                  )
                }
              />
              <Typography variant="body2">{memberName(m)}</Typography>
              {already ? (
                <Typography variant="caption1">{T.assignAlready}</Typography>
              ) : null}
            </label>
          )
        })}
      </div>
      {members.hasNextPage ? (
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          loading={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
        >
          {T.loadMore}
        </Button>
      ) : null}
      <Typography variant="body2" weight="bold">
        {T.assignCount(picked.length)}
      </Typography>
    </ActionModal>
  )
}
