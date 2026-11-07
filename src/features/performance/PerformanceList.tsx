import { Button, Typography } from '@montage-ui/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { Badge } from '../../shared/ui/Badge'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listPerformances, type PerformanceSort } from './api'
import type { PerformanceListItem, PerformanceStatus } from './types'
import { performanceListKey } from './viewApi'
import { performanceDate } from './viewBits'
import { PRESET_LABEL, VIEW_COPY as T } from './viewCopy'
import './view.css'

type Tab = 'active' | 'draft' | 'past'

const TABS: Record<
  Tab,
  { statuses: PerformanceStatus[]; sort: PerformanceSort; empty: string }
> = {
  active: {
    statuses: ['ACTIVE', 'LOCKED'],
    sort: 'performDate,asc',
    empty: T.emptyActive,
  },
  draft: { statuses: ['DRAFT'], sort: 'performDate,asc', empty: T.emptyDraft },
  past: {
    statuses: ['FINISHED', 'CANCELED'],
    sort: 'performDate,desc',
    empty: T.emptyPast,
  },
}

const TAB_LABEL: Record<Tab, string> = {
  active: T.tabActive,
  draft: T.tabDraft,
  past: T.tabPast,
}

function PerformanceCard({
  clubId,
  item,
}: {
  clubId: string
  item: PerformanceListItem
}) {
  const preset = PRESET_LABEL[item.preset] ?? item.preset
  return (
    <li>
      <Link
        to={`/clubs/${clubId}/performances/${item.id}`}
        className="perf-card"
      >
        <div className="perf-card-head">
          <Typography variant="body1" weight="bold">
            {item.title}
          </Typography>
          <Badge kind="performance" value={item.status} />
          {item.myParticipationStatus ? (
            <Badge kind="participation" value={item.myParticipationStatus} />
          ) : null}
        </div>
        <Typography variant="body2">{performanceDate(item)}</Typography>
        {item.location ? (
          <Typography variant="body2">{item.location}</Typography>
        ) : null}
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {preset}
        </Typography>
        {item.openFeatures.length > 0 ? (
          <div className="perf-chips">
            {item.openFeatures.map((f) => (
              <span key={f.feature} className="perf-chip">
                {T.featureChip[f.feature]?.(f.deadlineAt) ?? f.feature}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
    </li>
  )
}

/** PERF-001: the club's performances by status; officers also see drafts and the create button. */
export function PerformanceList() {
  const { clubId = '' } = useParams()
  const session = useSession()
  const navigate = useNavigate()
  const admin = isClubAdmin(session, clubId)
  // G-08: no creating while the club is inactive.
  const inactive = session.memberships.some(
    (m) => m.clubId === clubId && m.club.status === 'INACTIVE',
  )
  const canCreate = admin && !inactive
  const [tab, setTab] = useState<Tab>('active')
  const view = TABS[tab]

  const list = useInfiniteQuery({
    queryKey: [...performanceListKey(clubId), tab],
    queryFn: ({ pageParam, signal }) =>
      listPerformances(
        clubId,
        { status: view.statuses, sort: view.sort },
        pageParam,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const tabs: Tab[] = admin ? ['active', 'draft', 'past'] : ['active', 'past']

  return (
    <div className="start" data-screen-id="PERF-001">
      <div className="chip-row" role="tablist">
        {tabs.map((t) => (
          <Button
            key={t}
            size="small"
            role="tab"
            variant={t === tab ? 'solid' : 'outlined'}
            color="assistive"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </Button>
        ))}
      </div>

      {list.isPending ? <ListSkeleton /> : null}
      {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && items.length === 0 ? (
        <EmptyState
          description={view.empty}
          actionLabel={tab === 'draft' && canCreate ? T.create : undefined}
          onAction={() => void navigate(`/clubs/${clubId}/performances/new`)}
        />
      ) : null}
      <ul className="perf-list">
        {items.map((item) => (
          <PerformanceCard key={item.id} clubId={clubId} item={item} />
        ))}
      </ul>
      {list.hasNextPage ? (
        <Button
          variant="outlined"
          color="assistive"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {T.loadMore}
        </Button>
      ) : null}
      {canCreate ? (
        <Link to={`/clubs/${clubId}/performances/new`} className="perf-fab">
          {`+ ${T.create}`}
        </Link>
      ) : null}
    </div>
  )
}
