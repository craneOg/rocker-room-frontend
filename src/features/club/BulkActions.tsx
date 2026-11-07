import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listParts, type Member } from './api'
import {
  bulkMembers,
  invalidateClub,
  type BulkAction,
  type BulkResult,
  type SettableStatus,
} from './manageApi'
import { BULK_FAIL_REASON, MANAGE_COPY as M } from './manageCopy'
import { ActionModal, RadioList } from './ManageBits'
import { memberName } from './MemberBits'
import { feedback } from '../../shared/ui/feedbackBus'
import { BulkAssignSheet } from '../performance/BulkAssignSheet'
import { VIEW_COPY as P } from '../performance/viewCopy'

type Props = {
  clubId: string
  selected: Member[]
  /** Called after a finished bulk request: leaves select mode. */
  onDone: () => void
}

/**
 * CLUB-102 4: fixed bar with 상태 변경 / 파트 변경 / 공연에 추가 (4-1, 4-2, 4-3) and the
 * partial-failure result (4-4).
 */
export function BulkBar({ clubId, selected, onDone }: Props) {
  const qc = useQueryClient()
  const [sheet, setSheet] = useState<'status' | 'parts' | 'assign' | null>(null)
  const [result, setResult] = useState<BulkResult | null>(null)
  const run = useMutation({
    mutationFn: (body: BulkAction) =>
      bulkMembers(
        clubId,
        selected.map((m) => m.id),
        body,
      ),
    onSuccess: async (r) => {
      setSheet(null)
      await invalidateClub(qc, clubId)
      // 공연에 추가 changes the performances' participants.
      await qc.invalidateQueries({ queryKey: ['club', clubId] })
      if (r.failed.length > 0) setResult(r)
      else {
        feedback.toast(
          M.bulkDone(r.summary.succeeded - r.summary.skipped),
          'positive',
        )
        onDone()
      }
    },
  })
  const names = new Map(selected.map((m) => [m.id, memberName(m)]))

  return (
    <>
      <div className="bulk-bar" role="toolbar">
        <Typography variant="body2" weight="bold">
          {M.selectedCount(selected.length)}
        </Typography>
        <Button
          size="small"
          disabled={selected.length === 0}
          onClick={() => setSheet('status')}
        >
          {M.bulkStatus}
        </Button>
        <Button
          size="small"
          disabled={selected.length === 0}
          onClick={() => setSheet('parts')}
        >
          {M.bulkParts}
        </Button>
        <Button
          size="small"
          disabled={selected.length === 0}
          onClick={() => setSheet('assign')}
        >
          {P.bulkAssign}
        </Button>
      </div>

      {sheet === 'status' ? (
        <StatusSheet
          loading={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(status) =>
            run.mutate({ action: 'CHANGE_STATUS', params: { status } })
          }
        />
      ) : null}
      {sheet === 'parts' ? (
        <PartsSheet
          clubId={clubId}
          loading={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(mode, partIds) =>
            run.mutate({ action: 'CHANGE_PARTS', params: { mode, partIds } })
          }
        />
      ) : null}
      {sheet === 'assign' ? (
        <BulkAssignSheet
          clubId={clubId}
          loading={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(performanceId) =>
            run.mutate({
              action: 'ASSIGN_PERFORMANCE',
              params: { performanceId },
            })
          }
        />
      ) : null}
      {result ? (
        <ActionModal
          open
          title={M.bulkResultTitle}
          actionLabel={M.confirm}
          hideCancel
          onClose={() => {
            setResult(null)
            onDone()
          }}
          onSubmit={() => {
            setResult(null)
            onDone()
          }}
        >
          <Typography variant="body1" weight="bold">
            {M.bulkResult(
              result.summary.succeeded - result.summary.skipped,
              result.summary.failed,
            )}
          </Typography>
          <ul className="dialog-items">
            {result.failed.map((f) => (
              <li key={f.membershipId}>
                {`${names.get(f.membershipId) ?? f.membershipId}: ${BULK_FAIL_REASON[f.reason] ?? f.reason}`}
              </li>
            ))}
          </ul>
        </ActionModal>
      ) : null}
    </>
  )
}

/** 4-1: 활동 / 휴학 / 졸업. Withdrawal is not bulk (it needs the successor confirmation). */
function StatusSheet({
  loading,
  onClose,
  onSubmit,
}: {
  loading: boolean
  onClose: () => void
  onSubmit: (status: SettableStatus) => void
}) {
  const [status, setStatus] = useState<string>('ACTIVE')
  return (
    <ActionModal
      open
      title={M.bulkStatus}
      actionLabel={M.change}
      loading={loading}
      onClose={onClose}
      onSubmit={() => onSubmit(status as SettableStatus)}
    >
      <RadioList
        name={M.bulkStatus}
        value={status}
        onChange={setStatus}
        options={[
          { value: 'ACTIVE', label: M.statusActive },
          { value: 'ON_LEAVE', label: M.statusOnLeave },
          { value: 'GRADUATED', label: M.statusGraduated },
        ]}
      />
    </ActionModal>
  )
}

/** 4-2: add or remove the checked active parts (C-12: inactive parts are not offered). */
function PartsSheet({
  clubId,
  loading,
  onClose,
  onSubmit,
}: {
  clubId: string
  loading: boolean
  onClose: () => void
  onSubmit: (mode: 'ADD' | 'REMOVE', partIds: string[]) => void
}) {
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  const [mode, setMode] = useState<string>('ADD')
  const [picked, setPicked] = useState<string[]>([])
  const active = (parts.data ?? []).filter((p) => p.isActive)
  return (
    <ActionModal
      open
      title={M.bulkParts}
      actionLabel={M.apply}
      loading={loading}
      actionDisabled={picked.length === 0}
      onClose={onClose}
      onSubmit={() => onSubmit(mode === 'REMOVE' ? 'REMOVE' : 'ADD', picked)}
    >
      <RadioList
        name={M.bulkParts}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'ADD', label: M.partsAdd },
          { value: 'REMOVE', label: M.partsRemove },
        ]}
      />
      {parts.isSuccess && active.length === 0 ? (
        <Typography variant="body2">{M.noActiveParts}</Typography>
      ) : null}
      <div className="choice-list">
        {active.map((p) => (
          <label key={p.id} className="choice-row">
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              onChange={() =>
                setPicked((ids) =>
                  ids.includes(p.id)
                    ? ids.filter((x) => x !== p.id)
                    : [...ids, p.id],
                )
              }
            />
            <Typography variant="body2">{p.name}</Typography>
          </label>
        ))}
      </div>
    </ActionModal>
  )
}
