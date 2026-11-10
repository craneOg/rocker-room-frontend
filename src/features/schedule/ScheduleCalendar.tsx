import { Button, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../shared/api/errors'
import {
  isClubAdmin,
  isClubMember,
  useSession,
} from '../../shared/auth/session'
import { readLastClubId } from '../../shared/lib/lastClub'
import { Badge } from '../../shared/ui/Badge'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listPerformances } from '../performance/api'
import {
  choicesKey,
  EVENT_TYPES,
  getClubCalendar,
  getMyCalendar,
  listSongChoices,
  listTeamChoices,
  type CalendarEvent,
  type EventType,
} from './scheduleApi'
import {
  addDays,
  addMonths,
  clockOf,
  dateOf,
  kstToday,
  monthGrid,
  shortDate,
  startOfWeek,
  toRange,
} from './scheduleBits'
import { SCHEDULE_COPY as T } from './scheduleCopy'
import './schedule.css'

type Scope = 'mine' | 'club'
type View = 'month' | 'week' | 'list'

const VIEWS: [View, string][] = [
  ['month', T.viewMonth],
  ['week', T.viewWeek],
  ['list', T.viewList],
]

const toggle = <V,>(list: V[], v: V) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

/** One schedule (to its detail) or a performance day (to its performance). */
function EventChip({ event, tag }: { event: CalendarEvent; tag?: string }) {
  const isPerformance = event.eventType === 'PERFORMANCE'
  const tentative = event.status === 'TENTATIVE'
  const canceled = event.status === 'CANCELED'
  const to = isPerformance
    ? `/clubs/${event.clubId}/performances/${event.id}`
    : `/clubs/${event.clubId}/performances/${event.performanceId}/schedules/${event.id}`
  return (
    <Link
      to={to}
      className={[
        'schd-chip',
        isPerformance ? 'is-performance' : '',
        tentative ? 'is-tentative' : '',
        canceled ? 'is-canceled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tag ? <span className="schd-tag">{tag}</span> : null}
      <span className="schd-time">
        {event.allDay ? T.allDay : clockOf(event.startAt)}
      </span>
      <span className="schd-chip-title">
        {isPerformance ? T.performanceBand(event.title) : event.title}
      </span>
      {isPerformance ? null : (
        <Badge kind="scheduleType" value={event.eventType as EventType} />
      )}
      {tentative ? (
        <span className="schd-tentative">{T.tentativeTag}</span>
      ) : null}
    </Link>
  )
}

function DayList({
  day,
  events,
  tagOf,
  showEmpty,
}: {
  day: string
  events: CalendarEvent[]
  tagOf: (e: CalendarEvent) => string | undefined
  showEmpty: boolean
}) {
  if (events.length === 0 && !showEmpty) return null
  return (
    <section className="schd-day" aria-label={shortDate(day)}>
      <Typography variant="body2" weight="bold" as="h3">
        {shortDate(day)}
      </Typography>
      {events.length === 0 ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.tertiary"
        >
          {T.emptyDay}
        </Typography>
      ) : (
        <ul className="schd-events">
          {events.map((e) => (
            <li key={`${e.eventType}:${e.id}`}>
              <EventChip event={e} tag={tagOf(e)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * SCHD-001: `내 일정` (all my clubs, /calendar) and `동아리 전체` (one club, optionally one
 * performance, /clubs/:clubId/performances/:performanceId/schedules) in one screen (UI-4).
 */
export function ScheduleCalendar() {
  const { clubId: routeClub, performanceId: routePerf } = useParams()
  const session = useSession()
  const today = kstToday()

  const clubs = session.memberships.filter((m) =>
    isClubMember(session, m.clubId),
  )
  const last = readLastClubId()
  const clubId =
    routeClub ??
    (clubs.find((m) => m.clubId === last) ?? clubs[0])?.clubId ??
    ''
  const admin = isClubAdmin(session, clubId)

  const [scope, setScope] = useState<Scope>(routePerf ? 'club' : 'mine')
  const [view, setView] = useState<View>(() =>
    window.matchMedia('(min-width: 768px)').matches ? 'month' : 'list',
  )
  const [anchor, setAnchor] = useState(today)
  const [pickedDay, setPickedDay] = useState(today)
  const [clubIds, setClubIds] = useState<string[]>([])
  const [performanceId, setPerformanceId] = useState(routePerf ?? '')
  const [teamId, setTeamId] = useState('')
  const [songId, setSongId] = useState('')
  const [types, setTypes] = useState<EventType[]>([])
  const [canceled, setCanceled] = useState(false)
  const [tentative, setTentative] = useState(true)

  const range =
    view === 'week'
      ? { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 6) }
      : monthGrid(anchor)
  const step = (dir: 1 | -1) => {
    const next =
      view === 'week' ? addDays(anchor, 7 * dir) : addMonths(anchor, dir)
    setAnchor(next)
    setPickedDay(next)
  }

  const calendar = useQuery({
    queryKey:
      scope === 'mine'
        ? ['me', 'calendar', range, clubIds]
        : [
            'club',
            clubId,
            'calendar',
            range,
            performanceId,
            teamId,
            songId,
            types,
            canceled,
            admin && tentative,
          ],
    queryFn: ({ signal }) =>
      scope === 'mine'
        ? getMyCalendar({ ...toRange(range.from, range.to), clubIds }, signal)
        : getClubCalendar(
            clubId,
            {
              ...toRange(range.from, range.to),
              performanceId,
              teamId,
              songId,
              eventTypes: types,
              includeTentative: admin && tentative,
              includeCanceled: canceled,
            },
            signal,
          ),
  })

  const club = scope === 'club'
  const performances = useQuery({
    queryKey: ['club', clubId, 'performances', 'calendar-options'],
    // Every page: the filter and the new-schedule target must not stop at the first 20.
    queryFn: async () => {
      const first = await listPerformances(clubId, {}, 0)
      const rest = await Promise.all(
        Array.from({ length: Math.max(first.totalPages - 1, 0) }, (_, i) =>
          listPerformances(clubId, {}, i + 1),
        ),
      )
      return {
        ...first,
        items: [...first.items, ...rest.flatMap((p) => p.items)],
      }
    },
    enabled: club && clubId !== '',
  })
  const teams = useQuery({
    queryKey: [...choicesKey(clubId, performanceId), 'teams'],
    queryFn: () => listTeamChoices(clubId, performanceId),
    enabled: club && performanceId !== '',
  })
  const songs = useQuery({
    queryKey: [...choicesKey(clubId, performanceId), 'songs'],
    queryFn: () => listSongChoices(clubId, performanceId),
    enabled: club && performanceId !== '',
  })

  // E-01: a finished or canceled performance takes no new schedule.
  const open = (performances.data?.items ?? []).filter(
    (p) => p.status !== 'FINISHED' && p.status !== 'CANCELED',
  )
  const target = performanceId
    ? performances.data
      ? open.find((p) => p.id === performanceId)?.id
      : performanceId
    : open[0]?.id

  const events = [...(calendar.data ?? [])].sort(
    (a, b) =>
      Number(b.allDay) - Number(a.allDay) || a.startAt.localeCompare(b.startAt),
  )
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const d = dateOf(e.startAt)
    byDay.set(d, [...(byDay.get(d) ?? []), e])
  }
  const tagOf = (e: CalendarEvent) =>
    scope === 'mine' && clubs.length > 1
      ? clubs.find((m) => m.clubId === e.clubId)?.club.name.slice(0, 2)
      : undefined

  const days = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => addDays(from, i))
  const label =
    view === 'week' ? T.weekLabel(range.from, range.to) : T.monthLabel(anchor)

  let body
  if (calendar.isError) {
    const tooLarge =
      isApiError(calendar.error, 'VALIDATION_ERROR') &&
      calendar.error.details.some((d) => d.reason === 'RANGE_TOO_LARGE')
    body = tooLarge ? (
      <EmptyState description={T.rangeTooLarge} />
    ) : (
      <ErrorState onRetry={() => void calendar.refetch()} />
    )
  } else if (calendar.isPending) body = <ListSkeleton rows={4} />
  else {
    const monthStart = `${anchor.slice(0, 8)}01`
    // A schedule that began before this month but runs into it is listed under its start day;
    // the others of that day are not this month's.
    const listEvents = (d: string) =>
      (byDay.get(d) ?? []).filter(
        (e) => d >= monthStart || dateOf(e.endAt) >= monthStart,
      )
    const listDays = [...byDay.keys()]
      .filter((d) => d < addMonths(monthStart, 1) && listEvents(d).length > 0)
      .sort()
    body = (
      <>
        {view === 'month' ? (
          <>
            <div className="schd-grid" role="grid" aria-label={label}>
              {T.weekdays.map((w) => (
                <span key={w} className="schd-grid-head" role="columnheader">
                  {w}
                </span>
              ))}
              {days(
                range.from,
                (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 +
                  1,
              ).map((d) => {
                const n = byDay.get(d)?.length ?? 0
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    className={[
                      'schd-cell',
                      d.slice(0, 7) === anchor.slice(0, 7) ? '' : 'is-outside',
                      d === today ? 'is-today' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={d === pickedDay}
                    aria-label={`${shortDate(d)} ${T.dayCount(n)}`}
                    onClick={() => {
                      setPickedDay(d)
                      // A day of the next / previous month moves the month too.
                      if (d.slice(0, 7) !== anchor.slice(0, 7)) setAnchor(d)
                    }}
                  >
                    <span>{Number(d.slice(8, 10))}</span>
                    {n ? <span className="schd-dot">{n}</span> : null}
                  </button>
                )
              })}
            </div>
            <DayList
              day={pickedDay}
              events={byDay.get(pickedDay) ?? []}
              tagOf={tagOf}
              showEmpty
            />
          </>
        ) : view === 'week' ? (
          days(range.from, 7).map((d) => (
            <DayList
              key={d}
              day={d}
              events={byDay.get(d) ?? []}
              tagOf={tagOf}
              showEmpty
            />
          ))
        ) : (
          listDays.map((d) => (
            <DayList
              key={d}
              day={d}
              events={listEvents(d)}
              tagOf={tagOf}
              showEmpty={false}
            />
          ))
        )}
        {/* The list shows this month only: events of the grid's outer days leave it empty too. */}
        {(view === 'list' ? listDays.length : events.length) === 0 ? (
          <EmptyState description={T.empty} />
        ) : null}
      </>
    )
  }

  return (
    <div className="schd" data-screen-id="SCHD-001">
      <Typography variant="title2" weight="bold" as="h1">
        {T.calendarTitle}
      </Typography>

      <div role="group" aria-label={T.scopeLabel} className="schd-seg">
        <Button
          size="small"
          variant={scope === 'mine' ? 'solid' : 'outlined'}
          aria-pressed={scope === 'mine'}
          onClick={() => setScope('mine')}
        >
          {T.scopeMine}
        </Button>
        {clubId ? (
          <Button
            size="small"
            variant={scope === 'club' ? 'solid' : 'outlined'}
            aria-pressed={scope === 'club'}
            onClick={() => setScope('club')}
          >
            {T.scopeClub}
          </Button>
        ) : null}
      </div>

      <div className="schd-nav">
        <Button size="small" variant="outlined" onClick={() => step(-1)}>
          {`‹ ${T.prev}`}
        </Button>
        <Typography variant="body1" weight="bold" as="h2">
          {label}
        </Typography>
        <Button size="small" variant="outlined" onClick={() => step(1)}>
          {`${T.next} ›`}
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            setAnchor(today)
            setPickedDay(today)
          }}
        >
          {T.today}
        </Button>
      </div>
      <div role="group" aria-label={T.viewLabel} className="schd-seg">
        {VIEWS.map(([v, text]) => (
          <button
            key={v}
            type="button"
            className="schd-pill"
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {text}
          </button>
        ))}
      </div>

      {scope === 'mine' ? (
        clubs.length > 1 ? (
          <div role="group" aria-label={T.clubChips} className="schd-seg">
            {clubs.map((m) => (
              <button
                key={m.clubId}
                type="button"
                className="schd-pill"
                aria-pressed={clubIds.includes(m.clubId)}
                onClick={() => setClubIds(toggle(clubIds, m.clubId))}
              >
                {m.club.name}
              </button>
            ))}
          </div>
        ) : null
      ) : (
        <div className="schd-filters">
          <label>
            {T.filterPerformance}
            <select
              value={performanceId}
              onChange={(e) => {
                setPerformanceId(e.target.value)
                setTeamId('')
                setSongId('')
              }}
            >
              <option value="">{T.filterAll}</option>
              {(performances.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {performanceId ? (
            <>
              <label>
                {T.filterTeam}
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">{T.filterAll}</option>
                  {(teams.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {T.filterSong}
                <select
                  value={songId}
                  onChange={(e) => setSongId(e.target.value)}
                >
                  <option value="">{T.filterAll}</option>
                  {(songs.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <div role="group" aria-label={T.filterType} className="schd-seg">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className="schd-pill"
                aria-pressed={types.includes(t)}
                onClick={() => setTypes(toggle(types, t))}
              >
                <Badge kind="scheduleType" value={t} />
              </button>
            ))}
          </div>
          <label className="schd-check">
            <input
              type="checkbox"
              checked={canceled}
              onChange={(e) => setCanceled(e.target.checked)}
            />
            {T.showCanceled}
          </label>
          {admin ? (
            <label className="schd-check">
              <input
                type="checkbox"
                checked={tentative}
                onChange={(e) => setTentative(e.target.checked)}
              />
              {T.showTentative}
            </label>
          ) : null}
        </div>
      )}

      {body}

      {club && admin && target ? (
        <Link
          className="schd-fab"
          to={`/clubs/${clubId}/performances/${target}/schedules/new`}
        >
          {T.addSchedule}
        </Link>
      ) : null}
    </div>
  )
}
