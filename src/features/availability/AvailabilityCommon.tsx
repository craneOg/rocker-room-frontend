import { Button, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { isApiError } from '../../shared/api/errors'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { ActionModal } from '../club/ManageBits'
import { getPerformance, performanceKey } from '../performance/api'
import { getSetlist, setlistKey } from '../setlist/setlistApi'
import {
  availabilityKey,
  getCommonAvailability,
  listTeamOptions,
  type CommonTarget,
} from './availabilityApi'
import { AVAIL_COPY as T } from './availabilityCopy'
import { AvailabilityGrid } from './AvailabilityGrid'
import { WeekNav } from './AvailabilityWeek'
import { useSeasonWeek } from './useSeasonWeek'
import {
  addDays,
  dayOfSlot,
  dayStart,
  hhmm,
  inSeason,
  minutesOfSlot,
  mmddWeekday,
  SLOT_MS,
  toIso,
} from './availabilityTime'
import './availability.css'

type Range = { anchor: number; to: number }

const decode = (v: string): CommonTarget =>
  v.startsWith('team:')
    ? { kind: 'team', teamId: v.slice(5) }
    : v.startsWith('song:')
      ? { kind: 'song', songId: v.slice(5) }
      : { kind: 'all' }

/** Shade 0..4 of n available out of m. */
const levelOf = (n: number, m: number) =>
  n <= 0 || m <= 0 ? 0 : Math.min(4, Math.ceil((4 * n) / m))

/** AVAIL-002: how many of the target can rehearse in each cell; officers also see the names. */
export function AvailabilityCommon() {
  const { clubId = '', performanceId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const session = useSession()
  const admin = isClubAdmin(session, clubId)
  const key = performanceKey(clubId, performanceId)

  const [picked, setPicked] = useState<string | null>(null)
  const [fullRange, setFullRange] = useState(false)
  const [minCount, setMinCount] = useState(0)
  const [allOnly, setAllOnly] = useState(false)
  const [range, setRangeState] = useState<Range | null>(null)
  // The ref lets a keyboard click (start and end in one event) see the range it just set.
  const rangeRef = useRef<Range | null>(null)
  const setRange = (r: Range | null) => {
    rangeRef.current = r
    setRangeState(r)
  }
  const [sheet, setSheet] = useState<Range | null>(null)
  const [tip, setTip] = useState<string | null>(null)

  const detail = useQuery({
    queryKey: [...key, 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const policy = detail.data?.policy
  const season =
    policy?.practiceSeasonStart && policy.practiceSeasonEnd
      ? { start: policy.practiceSeasonStart, end: policy.practiceSeasonEnd }
      : null
  const week = useSeasonWeek(season)

  const teams = useQuery({
    queryKey: [...key, 'team-options', admin],
    queryFn: () => listTeamOptions(clubId, performanceId, !admin),
  })
  const songs = useQuery({
    queryKey: setlistKey(clubId, performanceId),
    queryFn: () => getSetlist(clubId, performanceId),
    enabled: admin,
  })

  // The link from a team page (`?teamId=`) preselects that team; else the first team, else everyone.
  const wanted = params.get('teamId')
  const initial = wanted
    ? `team:${wanted}`
    : teams.data?.[0]
      ? `team:${teams.data[0].id}`
      : admin
        ? 'all'
        : null
  const targetKey = picked ?? initial
  const target = targetKey ? decode(targetKey) : null

  const common = useQuery({
    queryKey: [
      ...availabilityKey(clubId, performanceId),
      'common',
      targetKey,
      week.monday,
    ],
    queryFn: () =>
      target
        ? getCommonAvailability(
            clubId,
            performanceId,
            target,
            toIso(dayStart(week.monday)),
            toIso(dayStart(addDays(week.monday, 7))),
          )
        : Promise.reject(new Error('no target')),
    enabled: season !== null && target !== null && teams.isSuccess,
  })
  const data = common.data
  const total = data?.participantCount ?? 0
  const byStart = new Map(
    (data?.slots ?? []).map((s) => [Date.parse(s.startAt), s]),
  )

  const span = (r: Range) => {
    const a = Math.min(r.anchor, r.to)
    return { from: a, to: Math.max(r.anchor, r.to) + SLOT_MS }
  }
  const inRange = (ms: number) => {
    if (!range) return false
    const s = span(range)
    return ms >= s.from && ms < s.to
  }
  const scheduleUrl = (s: { from: number; to: number }) => {
    const q = new URLSearchParams({
      startAt: toIso(s.from),
      endAt: toIso(s.to),
    })
    if (target?.kind === 'team') q.set('teamIds', target.teamId)
    if (target?.kind === 'song') q.set('songIds', target.songId)
    if (target?.kind === 'all') q.set('forAllParticipants', 'true')
    return `/clubs/${clubId}/performances/${performanceId}/schedules/new?${q}`
  }

  const onEnd = () => {
    const r = rangeRef.current
    if (!r || r.anchor !== r.to) return
    // One cell: officers get the detail sheet (5-1), members the "n명 가능" tooltip.
    if (admin) setSheet(r)
    else setTip(T.tooltip(byStart.get(r.anchor)?.availableCount ?? 0))
    setRange(null)
  }

  const missing = new Set(data?.missingAvailabilityMemberIds ?? [])
  const forbidden =
    common.isError &&
    isApiError(common.error, 'FORBIDDEN') &&
    common.error.details.some((d) => d.reason === 'TARGET_NOT_ALLOWED')

  const sheetSlot = sheet ? byStart.get(sheet.anchor) : undefined
  const available = new Set(
    (sheetSlot?.availableMembers ?? []).map((m) => m.performanceMemberId),
  )

  return (
    <div className="avail" data-screen-id="AVAIL-002">
      {detail.isPending || teams.isPending ? <ListSkeleton /> : null}
      {detail.isError || teams.isError ? (
        <ErrorState
          onRetry={() => {
            void detail.refetch()
            void teams.refetch()
          }}
        />
      ) : null}
      {detail.isSuccess && teams.isSuccess ? (
        <>
          {target === null ? (
            <EmptyState description={T.noTarget} />
          ) : (
            <label className="avail-field">
              {T.target}
              <select
                value={targetKey ?? ''}
                onChange={(e) => {
                  setPicked(e.target.value)
                  setRange(null)
                  setTip(null)
                }}
              >
                {admin ? (
                  <>
                    <optgroup label={T.teamGroup}>
                      {teams.data.map((t) => (
                        <option key={t.id} value={`team:${t.id}`}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={T.songGroup}>
                      {(songs.data?.items ?? []).map((e) => (
                        <option key={e.song.id} value={`song:${e.song.id}`}>
                          {e.song.title}
                        </option>
                      ))}
                    </optgroup>
                    <option value="all">{T.allOption}</option>
                  </>
                ) : (
                  teams.data.map((t) => (
                    <option key={t.id} value={`team:${t.id}`}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          {season === null ? (
            <Typography variant="body2">{T.noSeason}</Typography>
          ) : target === null ? null : (
            <>
              <WeekNav monday={week.monday} prev={week.prev} next={week.next} />
              {common.isPending ? <ListSkeleton rows={3} /> : null}
              {forbidden ? (
                <Typography variant="body2">{T.targetNotAllowed}</Typography>
              ) : common.isError ? (
                <ErrorState onRetry={() => void common.refetch()} />
              ) : null}
              {data ? (
                <>
                  <section className="avail-summary">
                    <Typography variant="body1" weight="bold">
                      {T.responded(total, data.respondedCount)}
                    </Typography>
                    {admin && missing.size > 0 ? (
                      <details>
                        <summary>{T.missingNames}</summary>
                        <ul>
                          {(data.participants ?? [])
                            .filter((p) => missing.has(p.performanceMemberId))
                            .map((p) => (
                              <li key={p.performanceMemberId}>
                                {p.displayName}
                              </li>
                            ))}
                        </ul>
                      </details>
                    ) : null}
                    {total === 0 ? (
                      <Typography variant="body2">
                        {T.noParticipants}
                      </Typography>
                    ) : null}
                  </section>

                  <div className="avail-tools">
                    <Button
                      size="small"
                      variant="outlined"
                      color="assistive"
                      aria-pressed={fullRange}
                      onClick={() => setFullRange((v) => !v)}
                    >
                      {`${T.fullRange} ${fullRange ? T.fullRangeOn : T.fullRangeOff}`}
                    </Button>
                    <label className="avail-field avail-inline">
                      {T.minCount}
                      <input
                        type="number"
                        min={0}
                        max={total}
                        value={minCount}
                        onChange={(e) =>
                          setMinCount(
                            Math.max(
                              0,
                              Math.floor(Number(e.target.value)) || 0,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="choice-row">
                      <input
                        type="checkbox"
                        checked={allOnly}
                        onChange={(e) => setAllOnly(e.target.checked)}
                      />
                      {T.allOnly}
                    </label>
                  </div>
                  <div className="avail-legend" aria-label={T.legend}>
                    {[0, 1, 2, 3, 4].map((l) => (
                      <span key={l} className="avail-cell" data-level={l} />
                    ))}
                  </div>

                  <AvailabilityGrid
                    days={week.days}
                    fullRange={fullRange}
                    ariaLabel={T.commonTitle}
                    cell={(ms, day) => {
                      const n = byStart.get(ms)?.availableCount ?? 0
                      const strong = total > 0 && n === total
                      return {
                        label: T.cellLabel(
                          mmddWeekday(day),
                          hhmm(minutesOfSlot(ms)),
                          n,
                          total,
                        ),
                        disabled:
                          !season || !inSeason(day, season.start, season.end),
                        text: `${n}/${total}`,
                        level: levelOf(n, total),
                        strong,
                        dim: n < minCount || (allOnly && !strong),
                        selected: inRange(ms) ? true : undefined,
                      }
                    }}
                    onStart={(ms) => {
                      setTip(null)
                      setRange({ anchor: ms, to: ms })
                    }}
                    onOver={(ms) => {
                      // Only an officer picks a range, and only inside one day.
                      const r = rangeRef.current
                      if (admin && r && dayOfSlot(ms) === dayOfSlot(r.anchor))
                        setRange({ ...r, to: ms })
                    }}
                    onEnd={onEnd}
                  />
                  {tip ? (
                    <p role="status" className="avail-tip">
                      {tip}
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {admin && range && range.anchor !== range.to ? (
        <div className="avail-bar">
          <Button onClick={() => navigate(scheduleUrl(span(range)))}>
            {T.makeSchedule}
          </Button>
        </div>
      ) : null}

      {sheet ? (
        <ActionModal
          open
          title={T.detailTitle(
            dayOfSlot(sheet.anchor),
            hhmm(minutesOfSlot(sheet.anchor)),
            hhmm(minutesOfSlot(sheet.anchor) + 30),
          )}
          actionLabel={T.makeSchedule}
          onClose={() => setSheet(null)}
          onSubmit={() => navigate(scheduleUrl(span(sheet)))}
        >
          <Typography variant="body2" weight="bold">
            {T.available}
          </Typography>
          <ul>
            {(sheetSlot?.availableMembers ?? []).map((m) => (
              <li key={m.performanceMemberId}>{m.displayName}</li>
            ))}
            {available.size === 0 ? <li>{T.noOne}</li> : null}
          </ul>
          <Typography variant="body2" weight="bold">
            {T.unavailable}
          </Typography>
          <ul>
            {(data?.participants ?? [])
              .filter((p) => !available.has(p.performanceMemberId))
              .map((p) => (
                <li key={p.performanceMemberId}>{p.displayName}</li>
              ))}
          </ul>
        </ActionModal>
      ) : null}
    </div>
  )
}
