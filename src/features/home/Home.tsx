import { Button, ContentBadge, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  formatDDay,
  formatKstDay,
  formatKstShort,
  formatKstTime,
} from '../../shared/lib/time'
import { Badge } from '../../shared/ui/Badge'
import type { BadgeValue } from '../../shared/ui/badges'
import { COPY } from '../../shared/ui/copy'
import { EmptyState, ListSkeleton } from '../../shared/ui/StateViews'
import {
  getHome,
  type HomeBanner,
  type HomePerformance,
  type HomeSchedule,
  type HomeTodo,
} from './api'
import { HOME_COPY as T } from './copy'
import { SuccessionNotices } from './SuccessionNotices'

const MAX_BANNERS = 3

/** Where a to-do leads (screen spec 2.2). */
function todoPath(base: string, t: HomeTodo) {
  const perf = `${base}/performances/${t.performanceId}`
  switch (t.type) {
    case 'PARTICIPATION_APPLY':
      return perf
    case 'SONG_PROPOSE':
    case 'PLAYABILITY':
    case 'VOTE':
      return `${perf}/songs`
    case 'AVAILABILITY':
      return `${perf}/availability`
    case 'TEAM_SUBMIT':
      return `${perf}/teams/apply`
  }
}

function Banners({ banners, base }: { banners: HomeBanner[]; base: string }) {
  const navigate = useNavigate()
  const [all, setAll] = useState(false)
  const shown = all ? banners : banners.slice(0, MAX_BANNERS)
  const hidden = banners.length - shown.length
  if (banners.length === 0) return null
  return (
    <section className="start-section" aria-label="안내">
      {shown.map((b) => (
        <div
          key={b.type + ('performanceId' in b ? b.performanceId : '')}
          className="start-card"
          role="status"
        >
          <Typography variant="body2">
            {b.type === 'CLUB_INACTIVE'
              ? T.clubInactive
              : b.type === 'MEMBER_GRADUATED'
                ? T.graduated
                : T.finishDue(b.performanceName)}
          </Typography>
          {b.type === 'PERFORMANCE_FINISH_DUE' ? (
            <Button
              size="small"
              onClick={() =>
                navigate(`${base}/performances/${b.performanceId}/status`)
              }
            >
              {T.finish}
            </Button>
          ) : null}
        </div>
      ))}
      {hidden > 0 ? (
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={() => setAll(true)}
        >
          {T.moreBanners(hidden)}
        </Button>
      ) : null}
    </section>
  )
}

function Todos({ todos, base }: { todos: HomeTodo[]; base: string }) {
  return (
    <section className="start-section">
      <Typography variant="body1" weight="bold" as="h2">
        {T.todos}
      </Typography>
      {todos.length === 0 ? (
        <EmptyState description={T.todosEmpty} />
      ) : (
        todos.map((t, i) => (
          <Link
            key={`${t.type}-${t.performanceId}-${i}`}
            to={todoPath(base, t)}
            className="start-card start-way"
          >
            <div className="start-card-text">
              <Typography variant="body1" weight="bold">
                {t.label}
              </Typography>
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {t.performanceName}
              </Typography>
            </div>
            {t.deadline ? (
              <ContentBadge size="small" color="neutral" variant="outlined">
                {T.deadline(formatKstShort(t.deadline))}
              </ContentBadge>
            ) : null}
          </Link>
        ))
      )}
    </section>
  )
}

function Upcoming({
  schedules,
  base,
}: {
  schedules: HomeSchedule[]
  base: string
}) {
  return (
    <section className="start-section">
      <div className="start-card-actions">
        <Typography variant="body1" weight="bold" as="h2">
          {T.upcoming}
        </Typography>
        <Link to="/calendar">{T.viewAll}</Link>
      </div>
      {schedules.length === 0 ? (
        <EmptyState description={T.upcomingEmpty} />
      ) : (
        schedules.map((s) => (
          <Link
            key={s.scheduleId}
            to={`${base}/performances/${s.performanceId}/schedules/${s.scheduleId}`}
            className="start-card start-way"
          >
            <div className="start-card-text">
              <Typography variant="body2" weight="bold">
                {`${formatKstDay(s.startAt)} ${formatKstTime(s.startAt)}~${formatKstTime(s.endAt)}`}
              </Typography>
              <div>
                <Badge
                  kind="scheduleType"
                  value={s.type as BadgeValue<'scheduleType'>}
                />
              </div>
              <Typography variant="body1" weight="bold">
                {s.title}
              </Typography>
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {[s.performanceName, s.location].filter(Boolean).join(' · ')}
              </Typography>
            </div>
          </Link>
        ))
      )}
    </section>
  )
}

function MyPerformances({
  performances,
  base,
}: {
  performances: HomePerformance[]
  base: string
}) {
  const navigate = useNavigate()
  const [now] = useState(Date.now)
  return (
    <section className="start-section">
      <Typography variant="body1" weight="bold" as="h2">
        {T.myPerformances}
      </Typography>
      {performances.length === 0 ? (
        <EmptyState
          description={T.myPerformancesEmpty}
          actionLabel={T.viewPerformances}
          onAction={() => navigate(`${base}/performances`)}
        />
      ) : (
        <div className="home-scroll">
          {performances.map((p) => (
            <Link
              key={p.performanceId}
              to={`${base}/performances/${p.performanceId}`}
              className="start-card home-perf-card"
            >
              <div className="start-card-text">
                <Typography variant="body1" weight="bold">
                  {p.name}
                </Typography>
                <div className="start-card-actions">
                  <Badge
                    kind="performance"
                    value={p.status as BadgeValue<'performance'>}
                  />
                  <Badge
                    kind="participation"
                    value={p.myStatus as BadgeValue<'participation'>}
                  />
                </div>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {`${p.performanceDate.replaceAll('-', '.')} ${formatDDay(p.performanceDate, now)}`}
                </Typography>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {[T.teams(p.teamNames), T.songs(p.songCount)]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/** HOME-001: what I have to do, my upcoming schedules and performances in the current club. */
export function Home() {
  const { clubId = '' } = useParams()
  const base = `/clubs/${clubId}`
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['home', clubId],
    queryFn: () => getHome(clubId),
  })

  return (
    <div className="start" data-screen-id="HOME-001">
      <SuccessionNotices clubId={clubId} />
      {isPending ? <ListSkeleton /> : null}
      {isError ? (
        <EmptyState
          description={COPY.unknownError}
          actionLabel={COPY.retry}
          onAction={() => void refetch()}
        />
      ) : null}
      {data ? (
        <>
          <Banners banners={data.banners} base={base} />
          <Todos todos={data.todos} base={base} />
          <Upcoming schedules={data.upcomingSchedules} base={base} />
          <MyPerformances performances={data.myPerformances} base={base} />
        </>
      ) : null}
    </div>
  )
}
