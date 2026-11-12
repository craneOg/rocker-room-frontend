import { Button, TextField, Typography } from '@montage-ui/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listAuditLogs, type AuditFilter, type AuditLog } from './adminApi'
import { ADMIN_COPY as T } from './adminCopy'
import { dateTimeText } from './adminDates'

const NONE: AuditFilter = {
  clubId: '',
  actorUserId: '',
  action: '',
  from: '',
  to: '',
}
const actionText = (a: string) => (T.actions[a] ? `${T.actions[a]} (${a})` : a)

/** SADM-005: audit records, newest first, with a detail sheet per record. */
export function AuditLogs() {
  const [filter, setFilter] = useState(NONE)
  const [open, setOpen] = useState<AuditLog | null>(null)
  const sheet = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) sheet.current?.focus()
  }, [open])
  const close = () => {
    setOpen(null)
    opener.current?.focus()
  }
  const list = useInfiniteQuery({
    queryKey: ['admin', 'audit', filter],
    queryFn: ({ pageParam, signal }) =>
      listAuditLogs(filter, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const set = (patch: Partial<AuditFilter>) =>
    setFilter((f) => ({ ...f, ...patch }))

  return (
    <div data-screen-id="SADM-005" className="admin-body">
      <div className="admin-row">
        <TextField
          value={filter.clubId}
          placeholder={T.auditFilterClub}
          aria-label={T.auditFilterClub}
          inputMode="numeric"
          onChange={(e) => set({ clubId: e.target.value.replace(/\D/g, '') })}
        />
        <TextField
          value={filter.actorUserId}
          placeholder={T.auditFilterActor}
          aria-label={T.auditFilterActor}
          inputMode="numeric"
          onChange={(e) =>
            set({ actorUserId: e.target.value.replace(/\D/g, '') })
          }
        />
        <select
          aria-label={T.auditFilterAction}
          value={filter.action}
          onChange={(e) => set({ action: e.target.value })}
        >
          <option value="">{T.auditActionAll}</option>
          {Object.keys(T.actions).map((a) => (
            <option key={a} value={a}>
              {actionText(a)}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label={T.auditFrom}
          value={filter.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <input
          type="date"
          aria-label={T.auditTo}
          value={filter.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>

      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState description={T.auditEmpty} />
      ) : (
        <ul className="admin-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={(e) => {
                  opener.current = e.currentTarget
                  setOpen(r)
                }}
              >
                {actionText(r.action)}
              </button>
              <span>{dateTimeText(r.createdAt)}</span>
              <span>{r.clubId ? `#${r.clubId}` : T.never}</span>
              <span>{r.actorUserId ? `@${r.actorUserId}` : T.system}</span>
              <span>
                {r.targetType ? `${r.targetType} ${r.targetId ?? ''}` : T.never}
              </span>
              <span>{r.reason?.slice(0, 40) ?? T.never}</span>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <Button
          variant="outlined"
          color="assistive"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {T.auditMore}
        </Button>
      ) : null}

      {open ? (
        <section
          ref={sheet}
          tabIndex={-1}
          role="dialog"
          aria-label={actionText(open.action)}
        >
          <Typography variant="body1" weight="bold">
            {actionText(open.action)}
          </Typography>
          <Typography variant="body2">{`${T.reasonLabel}: ${open.reason ?? T.never}`}</Typography>
          <table>
            <caption>{T.detailLabel}</caption>
            <tbody>
              {Object.entries(open.detail).map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{typeof v === 'string' ? v : JSON.stringify(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outlined" color="assistive" onClick={close}>
            {T.close}
          </Button>
        </section>
      ) : null}
    </div>
  )
}
