import { Button, Typography } from '@montage-ui/core'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { getPerformance, performanceKey } from '../performance/api'
import {
  auditionKey,
  listAuditions,
  type Audition,
  type AuditionTab,
  type AuditionType,
} from './auditionApi'
import {
  targetText,
  typeLabel,
  useScheduleOptions,
  useSongOptions,
  whenText,
} from './auditionBits'
import { AUDITION_COPY as T } from './auditionCopy'
import { formatKstYmd } from '../../shared/lib/time'
import './audition.css'

/** Where "재심 등록" opens the form: same target, new row (A-07). */
const reRegisterQuery = (a: Audition) => {
  const q = new URLSearchParams({ type: a.type, songId: a.songId })
  if (a.partId) q.set('partId', a.partId)
  if (a.applicantPerformanceMemberId)
    q.set('applicantId', a.applicantPerformanceMemberId)
  return q.toString()
}

/** Groups neighbouring rows of one song under a title line (the server sorts them together). */
const groupBySong = (items: Audition[]) => {
  const groups: { songId: string; songTitle: string; items: Audition[] }[] = []
  for (const a of items) {
    const last = groups.at(-1)
    if (last?.songId === a.songId) last.items.push(a)
    else groups.push({ songId: a.songId, songTitle: a.songTitle, items: [a] })
  }
  return groups
}

/** AUDI-001: officers' audition list with pending / done tabs and filters. */
export function AuditionList() {
  const { clubId = '', performanceId = '' } = useParams()
  const navigate = useNavigate()
  const base = `/clubs/${clubId}/performances/${performanceId}`
  const [tab, setTab] = useState<AuditionTab>('PENDING')
  const [type, setType] = useState<AuditionType | undefined>()
  const [songId, setSongId] = useState('')
  const [scheduleId, setScheduleId] = useState('')

  const detail = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const songs = useSongOptions(clubId, performanceId)
  const schedules = useScheduleOptions(clubId, performanceId)

  const list = useInfiniteQuery({
    queryKey: [
      ...auditionKey(clubId, performanceId),
      'list',
      tab,
      type,
      songId,
      scheduleId,
    ],
    queryFn: ({ pageParam, signal }) =>
      listAuditions(
        clubId,
        performanceId,
        { tab, type, songId, scheduleId },
        pageParam,
        undefined,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const pendingCount = list.data?.pages[0]?.pendingCount ?? 0
  // Registering and correcting end with the performance (API-148 / 149: INVALID_STATE).
  const status = detail.data?.performance.status
  const open =
    status !== undefined && status !== 'FINISHED' && status !== 'CANCELED'

  return (
    <div className="start" data-screen-id="AUDI-001">
      <Typography variant="title2" weight="bold" as="h1">
        {T.listTitle}
      </Typography>

      <div className="chip-row" role="tablist">
        <Button
          size="small"
          role="tab"
          variant={tab === 'PENDING' ? 'solid' : 'outlined'}
          color="assistive"
          aria-selected={tab === 'PENDING'}
          onClick={() => setTab('PENDING')}
        >
          {T.tabPending(pendingCount)}
        </Button>
        <Button
          size="small"
          role="tab"
          variant={tab === 'DONE' ? 'solid' : 'outlined'}
          color="assistive"
          aria-selected={tab === 'DONE'}
          onClick={() => setTab('DONE')}
        >
          {T.tabDone}
        </Button>
      </div>

      <div className="audition-filters">
        {(['SONG', 'SESSION'] as const).map((t) => (
          <Button
            key={t}
            size="small"
            variant={type === t ? 'solid' : 'outlined'}
            color="assistive"
            aria-pressed={type === t}
            onClick={() => setType(type === t ? undefined : t)}
          >
            {typeLabel(t)}
          </Button>
        ))}
        <select
          aria-label={T.filterSong}
          value={songId}
          onChange={(e) => setSongId(e.target.value)}
        >
          <option value="">{T.allSongs}</option>
          {(songs.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          aria-label={T.filterSchedule}
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
        >
          <option value="">{T.allSchedules}</option>
          {(schedules.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.title} ${whenText(s.startAt)}`}
            </option>
          ))}
        </select>
      </div>

      {list.isPending ? <ListSkeleton /> : null}
      {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && items.length === 0 ? (
        <EmptyState description={T.empty} />
      ) : null}

      {groupBySong(items).map((g) => (
        <section
          key={`${g.songId}:${g.items[0]?.id}`}
          className="audition-group"
        >
          <Typography variant="body1" weight="bold" as="h2">
            {g.songTitle}
          </Typography>
          {g.items.map((a) => (
            <article key={a.id} className="audition-card">
              <div className="perf-card-head">
                <span className="perf-chip">{typeLabel(a.type)}</span>
                <Typography variant="body2" weight="bold">
                  {targetText(a)}
                </Typography>
                <Badge kind="audition" value={a.result ?? 'PENDING'} />
              </div>
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {whenText(a.scheduledAt)}
              </Typography>
              {a.memo ? (
                <Typography variant="body2" className="audition-memo">
                  {a.memo}
                </Typography>
              ) : null}
              {a.result !== null ? (
                <>
                  {a.comment ? (
                    <Typography variant="body2">{a.comment}</Typography>
                  ) : null}
                  <Typography
                    variant="caption1"
                    color="semantic.foreground.neutral.secondary"
                  >
                    {T.judgedBy(
                      a.judgedByName ?? '',
                      a.judgedAt ? formatKstYmd(a.judgedAt) : '',
                    )}
                  </Typography>
                </>
              ) : null}
              {open ? (
                <div className="start-card-actions">
                  <Button
                    size="small"
                    variant={a.result === null ? 'solid' : 'outlined'}
                    onClick={() =>
                      void navigate(`${base}/auditions/${a.id}/result`)
                    }
                  >
                    {a.result === null ? T.enterResult : T.correct}
                  </Button>
                  {a.result !== null ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="assistive"
                      onClick={() =>
                        void navigate(
                          `${base}/auditions/new?${reRegisterQuery(a)}`,
                        )
                      }
                    >
                      {T.reRegister}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ))}

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

      {open ? (
        <Link className="perf-fab" to={`${base}/auditions/new`}>
          {`+ ${T.register}`}
        </Link>
      ) : null}
    </div>
  )
}
