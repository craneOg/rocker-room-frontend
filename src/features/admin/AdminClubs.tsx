import { Button, TextField } from '@montage-ui/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { CLUB_TYPE_LABEL } from '../club/copy'
import { listAdminClubs, type AdminClubFilter } from './adminApi'
import { ADMIN_COPY as T } from './adminCopy'
import { dateText } from './adminDates'

const NONE: AdminClubFilter = {
  q: '',
  status: '',
  noAdmin: false,
  inactiveOver180Days: false,
}

/** SADM-002: every club with search and filters; a row opens SADM-003. */
export function AdminClubs() {
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState(NONE)
  const list = useInfiniteQuery({
    queryKey: ['admin', 'clubs', filter],
    queryFn: ({ pageParam, signal }) =>
      listAdminClubs(filter, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const set = (patch: Partial<AdminClubFilter>) =>
    setFilter((f) => ({ ...f, ...patch }))

  return (
    <div data-screen-id="SADM-002" className="admin-body">
      <form
        className="admin-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: input.trim() })
        }}
      >
        <TextField
          value={input}
          placeholder={T.clubSearchPlaceholder}
          aria-label={T.clubSearchPlaceholder}
          maxLength={100}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit">{T.userSearch}</Button>
      </form>
      <div className="admin-row">
        <select
          aria-label={T.col.status}
          value={filter.status}
          onChange={(e) =>
            set({ status: e.target.value as AdminClubFilter['status'] })
          }
        >
          <option value="">{T.statusAll}</option>
          <option value="ACTIVE">{T.statusActive}</option>
          <option value="INACTIVE">{T.statusInactive}</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={filter.noAdmin}
            onChange={(e) => set({ noAdmin: e.target.checked })}
          />{' '}
          {T.filterNoAdmin}
        </label>
        <label>
          <input
            type="checkbox"
            checked={filter.inactiveOver180Days}
            onChange={(e) => set({ inactiveOver180Days: e.target.checked })}
          />{' '}
          {T.filterIdle}
        </label>
      </div>

      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState description={T.clubEmpty} />
      ) : (
        <ul className="admin-list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link to={`/admin/clubs/${c.id}`}>{c.name}</Link>
              <span>{CLUB_TYPE_LABEL[c.clubType] ?? c.clubType}</span>
              <span>
                {c.status === 'ACTIVE' ? T.statusActive : T.statusInactive}
              </span>
              <span>{`${T.col.members} ${c.activeMemberCount}`}</span>
              <span>{`${T.col.admins} ${c.adminCount}`}</span>
              <span>{`${T.col.lastActive} ${dateText(c.lastActiveAt)}`}</span>
              <span>{`${T.col.ongoing} ${c.ongoingPerformanceCount}`}</span>
              <span>{`${T.col.createdAt} ${dateText(c.createdAt)}`}</span>
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
          {T.moreClubs}
        </Button>
      ) : null}
    </div>
  )
}
