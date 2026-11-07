import { Avatar, Button, TextField, Typography } from '@montage-ui/core'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { useParams } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { Badge } from '../../shared/ui/Badge'
import { feedback } from '../../shared/ui/feedbackBus'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listParts } from '../club/api'
import { getPerformance, performanceKey } from './api'
import { AssignSheet } from './AssignSheet'
import type { ParticipationStatus } from './types'
import {
  bulkDecide,
  decideParticipation,
  invalidatePerformance,
  listPerformanceMembers,
  type PerformanceMemberRow,
} from './viewApi'
import { DECISION_FAIL_REASON, VIEW_COPY as T } from './viewCopy'
import { WithdrawDialog } from './WithdrawDialog'
import './view.css'

type Tab = 'approved' | 'applied' | 'rejected'

const TAB_STATUS: Record<Tab, ParticipationStatus[]> = {
  approved: ['APPROVED'],
  applied: ['APPLIED'],
  rejected: ['REJECTED', 'WITHDRAWN'],
}

type Pending =
  | { kind: 'release'; row: PerformanceMemberRow }
  | {
      kind: 'reason'
      row: PerformanceMemberRow
      decision: 'approve' | 'reject'
    }

const toggle = <V,>(list: V[], v: V) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

/** PMEM-001: confirmed participants for everyone; officers also review applications and manage. */
export function PerformanceMembers() {
  const { clubId = '', performanceId = '' } = useParams()
  const session = useSession()
  const qc = useQueryClient()
  const admin = isClubAdmin(session, clubId)
  const key = performanceKey(clubId, performanceId)

  const [tab, setTab] = useState<Tab>('approved')
  const [input, setInput] = useState('')
  const q = useDeferredValue(input.trim())
  const [partIds, setPartIds] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [assigning, setAssigning] = useState(false)

  const detail = useQuery({
    queryKey: [...key, 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  const activeParts = (parts.data ?? []).filter((p) => p.isActive)

  const members = useInfiniteQuery({
    queryKey: [...key, 'members', tab, q, partIds, admin],
    queryFn: ({ pageParam, signal }) =>
      listPerformanceMembers(
        clubId,
        performanceId,
        {
          // A regular member only reads APPROVED and must not send `status`.
          status: admin ? TAB_STATUS[tab] : undefined,
          q,
          partIds,
        },
        pageParam,
        undefined,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  const items = members.data?.pages.flatMap((p) => p.items) ?? []
  // Only the rows still on screen: a filter or a per-row decision can drop picked rows.
  const chosen = selected.filter((id) => items.some((m) => m.id === id))
  const counts = members.data?.pages[0]?.statusCounts
  const count = (t: Tab) =>
    TAB_STATUS[t].reduce((n, s) => n + (counts?.[s] ?? 0), 0)

  const perf = detail.data?.performance
  const locked = perf?.status === 'LOCKED'
  // API-056 works in DRAFT / ACTIVE only; the button is hidden from LOCKED on (2.1).
  // Review and release exist until the performance ends or is canceled.
  const manage =
    admin && (locked || perf?.status === 'DRAFT' || perf?.status === 'ACTIVE')
  const canAssign =
    admin && (perf?.status === 'DRAFT' || perf?.status === 'ACTIVE')

  const decide = useMutation({
    mutationFn: (v: {
      row: PerformanceMemberRow
      decision: 'approve' | 'reject'
      reason?: string
    }) =>
      decideParticipation(clubId, performanceId, v.row.id, v.decision, {
        performanceVersion: perf?.version ?? '',
        reason: v.reason,
      }),
    onSuccess: async (_, v) => {
      setPending(null)
      await invalidatePerformance(qc, clubId, performanceId)
      feedback.toast(
        v.decision === 'approve' ? T.approved : T.rejected,
        'positive',
      )
    },
  })
  const bulk = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') =>
      bulkDecide(clubId, performanceId, chosen, decision),
    onSuccess: async (r) => {
      setSelected([])
      await invalidatePerformance(qc, clubId, performanceId)
      if (r.failed.length === 0)
        feedback.toast(T.bulkResult(r.summary.succeeded, 0), 'positive')
      else {
        const names = new Map(items.map((m) => [m.id, m.displayName]))
        void feedback.dialog({
          title: T.bulkResultTitle,
          description: T.bulkResult(r.summary.succeeded, r.summary.failed),
          items: r.failed.map(
            (f) =>
              `${names.get(f.performanceMemberId) ?? f.performanceMemberId}: ${DECISION_FAIL_REASON[f.reason] ?? f.reason}`,
          ),
          confirmLabel: T.confirm,
        })
      }
    },
  })

  const onDecide = (
    row: PerformanceMemberRow,
    decision: 'approve' | 'reject',
  ) =>
    // LOCKED: an emergency change that needs a reason (API-057 / 058).
    locked
      ? setPending({ kind: 'reason', row, decision })
      : decide.mutate({ row, decision })

  const tabs: Tab[] = admin ? ['approved', 'applied', 'rejected'] : ['approved']
  const tabLabel = (t: Tab) =>
    t === 'approved'
      ? T.tabApproved(count(t))
      : t === 'applied'
        ? T.tabApplied(count(t))
        : T.tabRejected(count(t))
  const bulkable = admin && tab === 'applied' && !locked && perf !== undefined
  const allSelected = items.length > 0 && chosen.length === items.length

  return (
    <div className="start" data-screen-id="PMEM-001">
      <div className="chip-row" role="tablist">
        {tabs.map((t) => (
          <Button
            key={t}
            size="small"
            role="tab"
            variant={t === tab ? 'solid' : 'outlined'}
            color="assistive"
            aria-selected={t === tab}
            onClick={() => {
              setTab(t)
              setSelected([])
            }}
          >
            {tabLabel(t)}
          </Button>
        ))}
      </div>

      <TextField
        value={input}
        placeholder={T.searchPlaceholder}
        aria-label={T.searchPlaceholder}
        maxLength={100}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="chip-row">
        {activeParts.map((p) => (
          <Button
            key={p.id}
            size="small"
            variant={partIds.includes(p.id) ? 'solid' : 'outlined'}
            color="assistive"
            aria-pressed={partIds.includes(p.id)}
            onClick={() => setPartIds((ids) => toggle(ids, p.id))}
          >
            {p.name}
          </Button>
        ))}
      </div>

      {bulkable && items.length > 0 ? (
        <label className="choice-row">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? [] : items.map((m) => m.id))
            }
          />
          <Typography variant="body2">{T.selectAll}</Typography>
        </label>
      ) : null}

      {members.isPending ? <ListSkeleton /> : null}
      {members.isError ? (
        <ErrorState onRetry={() => void members.refetch()} />
      ) : null}
      {members.isSuccess && items.length === 0 ? (
        <EmptyState description={T.emptyMembers} />
      ) : null}
      <ul className="member-list">
        {items.map((m) => (
          <li key={m.id} className={bulkable ? 'select-row' : undefined}>
            {bulkable ? (
              <input
                type="checkbox"
                aria-label={T.selectRow(m.displayName)}
                checked={selected.includes(m.id)}
                onChange={() => setSelected((ids) => toggle(ids, m.id))}
              />
            ) : null}
            <div className="member-row pmem-row">
              <Avatar
                size="medium"
                src={m.profileImageUrl ?? undefined}
                alt={m.displayName}
              />
              <div className="start-card-text">
                <div className="member-row-name">
                  <Typography variant="body1" weight="bold">
                    {m.displayName}
                  </Typography>
                  {m.memberType === 'GUEST' ? (
                    <Badge kind="membership" value="GUEST" />
                  ) : null}
                  {admin && m.membershipStatus === 'GRADUATED' ? (
                    <Badge kind="membership" value="GRADUATED" />
                  ) : null}
                </div>
                <div className="member-row-parts">
                  {m.parts.map((p) => (
                    <Typography
                      key={p.id}
                      variant="caption1"
                      color="semantic.foreground.neutral.secondary"
                    >
                      {p.name}
                    </Typography>
                  ))}
                  {m.teamNames.map((n) => (
                    <span key={n} className="perf-chip">
                      {n}
                    </span>
                  ))}
                  {tab === 'approved' ? (
                    <Typography variant="caption1">
                      {T.playedSongs(m.playedSongCount)}
                    </Typography>
                  ) : null}
                </div>
                {admin && tab === 'applied' ? (
                  <div className="member-row-parts">
                    <span className="perf-chip">
                      {m.source === 'TEAM_SUBMISSION'
                        ? T.viaTeam
                        : T.viaApplication}
                    </span>
                    {m.source === 'TEAM_SUBMISSION' ? (
                      <Typography variant="caption1">
                        {T.withTeamHint}
                      </Typography>
                    ) : null}
                  </div>
                ) : null}
                {admin && tab === 'rejected' ? (
                  <Badge kind="participation" value={m.status} />
                ) : null}
              </div>
              {manage && tab === 'applied' ? (
                <div className="start-card-actions">
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={decide.isPending}
                    onClick={() => onDecide(m, 'reject')}
                  >
                    {T.reject}
                  </Button>
                  <Button
                    size="small"
                    disabled={decide.isPending}
                    onClick={() => onDecide(m, 'approve')}
                  >
                    {T.approve}
                  </Button>
                </div>
              ) : null}
              {manage && tab === 'approved' ? (
                <details className="perf-menu">
                  <summary aria-label={`${m.displayName} ${T.rowMenu}`}>
                    {T.rowMenu}
                  </summary>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: 'release', row: m })}
                  >
                    {T.release}
                  </button>
                </details>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {members.hasNextPage ? (
        <Button
          variant="outlined"
          color="assistive"
          loading={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
        >
          {T.loadMore}
        </Button>
      ) : null}

      {bulkable && chosen.length > 0 ? (
        <div className="bulk-bar" role="toolbar">
          <Typography variant="body2" weight="bold">
            {T.selectedCount(chosen.length)}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            disabled={bulk.isPending}
            onClick={() => bulk.mutate('REJECT')}
          >
            {T.bulkReject}
          </Button>
          <Button
            size="small"
            disabled={bulk.isPending}
            onClick={() => bulk.mutate('APPROVE')}
          >
            {T.bulkApprove}
          </Button>
        </div>
      ) : null}
      {canAssign ? (
        <Button size="small" onClick={() => setAssigning(true)}>
          {`+ ${T.assignButton}`}
        </Button>
      ) : null}

      {assigning ? (
        <AssignSheet
          clubId={clubId}
          performanceId={performanceId}
          onClose={() => setAssigning(false)}
        />
      ) : null}
      {pending?.kind === 'release' ? (
        <WithdrawDialog
          clubId={clubId}
          performanceId={performanceId}
          performanceMemberId={pending.row.id}
          membershipId={pending.row.membershipId}
          title={T.releaseTitle(pending.row.displayName)}
          body={T.releaseBody}
          reasonRequired={locked}
          doneMessage={T.released}
          actionLabel={T.release}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'reason' ? (
        <ReasonModal
          open
          title={T.lockedReasonTitle}
          description={T.lockedReasonHint}
          actionLabel={pending.decision === 'approve' ? T.approve : T.reject}
          loading={decide.isPending}
          onClose={() => setPending(null)}
          onSubmit={(reason) =>
            decide.mutate({
              row: pending.row,
              decision: pending.decision,
              reason,
            })
          }
        />
      ) : null}
    </div>
  )
}
