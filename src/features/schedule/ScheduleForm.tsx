import { Button, TextArea, TextField, Typography } from '@montage-ui/core'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { withConfirmation } from '../../shared/api/handlers'
import { fieldErrors } from '../../shared/api/errors'
import { Badge } from '../../shared/ui/Badge'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { withRuleCopy } from '../club/manageApi'
import { showRuleCopy } from '../club/ManageBits'
import { getPerformance, performanceKey } from '../performance/api'
import {
  choicesKey,
  confirmSchedule,
  createSchedule,
  EVENT_TYPES,
  getSchedule,
  invalidateSchedules,
  listSchedules,
  listSongChoices,
  listTeamChoices,
  scheduleKey,
  unconfirmSchedule,
  updateSchedule,
  validateSchedule,
  type EventType,
  type ScheduleBody,
  type ScheduleDetail,
  type ScheduleWarning,
} from './scheduleApi'
import {
  addDays,
  clockOf,
  dateOf,
  HALF_HOURS,
  inKst,
  kstToday,
  toRange,
  warningTexts,
} from './scheduleBits'
import { SCHEDULE_COPY as T } from './scheduleCopy'
import './schedule.css'

type Status = 'TENTATIVE' | 'CONFIRMED'
type Form = {
  eventType: EventType
  title: string
  date: string
  start: string
  end: string
  /** Days between the start date and the end date: 0 unless an existing schedule runs past midnight. */
  spanDays: number
  location: string
  forAll: boolean
  teamIds: string[]
  songIds: string[]
  memo: string
  status: Status
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])
const isType = (v: string | null): v is EventType =>
  EVENT_TYPES.some((t) => t === v)

const KST_ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?\+09:00$/

/** One KST time -> date and the nearest half hour (capped at 23:30); null if malformed. */
function halfHour(iso: string | null) {
  const m = iso === null ? null : KST_ISO.exec(iso)
  if (!m || Number.isNaN(Date.parse(iso ?? ''))) return null
  const total = Math.min(
    Math.round((Number(m[2]) * 60 + Number(m[3])) / 30) * 30,
    23 * 60 + 30,
  )
  const clock = `${String(Math.floor(total / 60)).padStart(2, '0')}:${total % 60 ? '30' : '00'}`
  return { date: m[1] ?? '', clock, total }
}

/** `startAt` / `endAt` of the AVAIL links as date, start and end; null unless both are valid. */
function windowOf(prefill: URLSearchParams) {
  const a = halfHour(prefill.get('startAt'))
  const b = halfHour(prefill.get('endAt'))
  if (!a || !b) return null
  // A later end day is cut to 23:30 of the start day (no overnight schedules).
  const end =
    b.date === a.date
      ? b
      : b.date > a.date
        ? { ...b, clock: '23:30', total: 1410 }
        : null
  if (!end || end.total <= a.total) return null
  return { date: a.date, start: a.clock, end: end.clock }
}

function initialForm(
  existing: ScheduleDetail | undefined,
  prefill: URLSearchParams,
): Form {
  const s = existing?.schedule
  if (s)
    return {
      eventType: s.eventType,
      title: s.title,
      date: dateOf(s.startAt),
      start: clockOf(s.startAt),
      end: clockOf(s.endAt),
      spanDays: Math.max(
        0,
        Math.round(
          (Date.parse(dateOf(s.endAt)) - Date.parse(dateOf(s.startAt))) /
            86_400_000,
        ),
      ),
      location: s.location ?? '',
      forAll: s.forAllParticipants,
      teamIds: s.teamIds,
      songIds: s.songIds,
      memo: s.memo ?? '',
      status: s.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE',
    }
  // Entry from AVAIL-002 / AUDI-002: time, targets and type can come in the query.
  const type = prefill.get('eventType')
  // `startAt` / `endAt` (ISO) only fill what `date` / `start` / `end` leave out: those win.
  const win = windowOf(prefill)
  const teamIds = csv(prefill.get('teamIds'))
  const songIds = csv(prefill.get('songIds'))
  return {
    eventType: isType(type) ? type : 'PRACTICE',
    title: '',
    date: prefill.get('date') ?? win?.date ?? kstToday(),
    start: prefill.get('start') ?? win?.start ?? '19:00',
    end: prefill.get('end') ?? win?.end ?? '21:00',
    spanDays: 0,
    location: '',
    // Teams / songs in the query win over "all participants".
    forAll:
      prefill.get('forAllParticipants') === 'true' &&
      teamIds.length === 0 &&
      songIds.length === 0,
    teamIds,
    songIds,
    memo: '',
    status: 'TENTATIVE',
  }
}

const bodyOf = (f: Form): ScheduleBody => ({
  eventType: f.eventType,
  status: f.status,
  startAt: inKst(f.date, f.start),
  // The end date keeps its distance from the start date, so a schedule over midnight stays one.
  endAt: inKst(addDays(f.date, f.spanDays), f.end),
  title: f.title.trim() === '' ? null : f.title.trim(),
  location: f.location.trim() === '' ? null : f.location.trim(),
  memo: f.memo.trim() === '' ? null : f.memo.trim(),
  forAllParticipants: f.forAll,
  teamIds: f.forAll ? [] : f.teamIds,
  songIds: f.forAll ? [] : f.songIds,
})

/** A time picker value; the saved time is kept even when it is not on the half hour. */
function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const options = HALF_HOURS.includes(value)
    ? HALF_HOURS
    : [value, ...HALF_HOURS]
  return (
    <label className="schd-field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  )
}

function FormBody({
  clubId,
  performanceId,
  existing,
  performanceTitle,
}: {
  clubId: string
  performanceId: string
  existing?: ScheduleDetail
  performanceTitle: string
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [prefill] = useSearchParams()
  const base = `/clubs/${clubId}/performances/${performanceId}`
  const editId = existing?.schedule.id
  const [form, setForm] = useState(() => initialForm(existing, prefill))
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  const teams = useQuery({
    queryKey: [...choicesKey(clubId, performanceId), 'teams'],
    queryFn: () => listTeamChoices(clubId, performanceId),
  })
  const songs = useQuery({
    queryKey: [...choicesKey(clubId, performanceId), 'songs'],
    queryFn: () => listSongChoices(clubId, performanceId),
  })
  const recent = useQuery({
    queryKey: [...scheduleKey(clubId, performanceId), 'recent-locations'],
    queryFn: () => {
      const today = kstToday()
      return listSchedules(
        clubId,
        performanceId,
        toRange(addDays(today, -90), addDays(today, 90)),
      )
    },
  })
  const recentLocations = [
    ...new Set(
      [...(recent.data ?? [])]
        .reverse()
        .flatMap((s) => (s.location ? [s.location] : [])),
    ),
  ].slice(0, 3)

  const endAfterStart = form.spanDays > 0 || form.end > form.start
  const hasTarget =
    form.forAll || form.teamIds.length > 0 || form.songIds.length > 0
  const body = bodyOf(form)

  // 7-9: who attends and what overlaps, recomputed by the server (API-106) as the form changes.
  const preview = useQuery({
    queryKey: [...scheduleKey(clubId, performanceId), 'preview', body],
    queryFn: ({ signal }) =>
      validateSchedule(clubId, performanceId, body, signal),
    enabled: endAfterStart && hasTarget && form.date !== '',
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
  // keepPreviousData also serves the last answer after the query is turned off.
  const previewData =
    endAfterStart && hasTarget && form.date !== '' ? preview.data : undefined
  const warnings: ScheduleWarning[] = (previewData?.warnings ?? []).filter(
    (w) => w.scheduleId === undefined || w.scheduleId !== editId,
  )
  const hardErrors = previewData?.hardErrors ?? []

  const save = useMutation({
    mutationFn: async () => {
      const run = async () => {
        if (!existing) {
          const r = await createSchedule(clubId, performanceId, body)
          return { id: r.resource.id, warnings: r.warnings }
        }
        const { schedule } = existing
        const { status, ...patch } = body
        const r = await updateSchedule(clubId, performanceId, schedule.id, {
          ...patch,
          version: schedule.version,
        })
        const all = [...r.warnings]
        // API-110 never changes the public status: follow up with 111 / 153.
        if (status !== schedule.status) {
          const version = r.resource.version
          if (status === 'CONFIRMED') {
            const c = await withConfirmation((confirmed) =>
              confirmSchedule(clubId, performanceId, schedule.id, {
                version,
                confirmed,
              }),
            )
            all.push(...c.warnings)
          } else
            await unconfirmSchedule(clubId, performanceId, schedule.id, version)
        }
        return { id: schedule.id, warnings: all }
      }
      return withRuleCopy(run, { SCHEDULE_TARGET_EMPTY: T.targetEmptyRule })
    },
    onSuccess: async (r) => {
      await invalidateSchedules(qc, clubId, performanceId)
      feedback.toast(T.saved, 'positive')
      const texts = [...new Set(warningTexts(r.warnings))]
      void navigate(`${base}/schedules/${r.id}`, {
        state: texts.length ? { warnings: texts } : undefined,
      })
    },
    onError: (e) => {
      showRuleCopy(e)
      // A save that failed after API-110 went through leaves the form out of date.
      if (existing) void invalidateSchedules(qc, clubId, performanceId)
    },
  })
  const errors = fieldErrors(save.error)

  const valid = endAfterStart && hasTarget && form.date !== ''
  const unconfirming =
    existing?.schedule.status === 'CONFIRMED' && form.status === 'TENTATIVE'

  return (
    <form
      className="schd schd-form"
      data-screen-id="SCHD-003"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && hardErrors.length === 0 && !save.isPending) save.mutate()
      }}
    >
      <Typography variant="title2" weight="bold" as="h1">
        {existing ? T.editTitle : T.createTitle}
      </Typography>

      <div className="schd-section">
        <Typography variant="body2" weight="bold">
          {T.performanceField}
        </Typography>
        <Link to={base}>{performanceTitle}</Link>
      </div>

      <div role="group" aria-label={T.typeField} className="schd-seg">
        {EVENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className="schd-pill"
            aria-pressed={form.eventType === t}
            onClick={() => set({ eventType: t })}
          >
            <Badge kind="scheduleType" value={t} />
          </button>
        ))}
      </div>

      <FormField label={T.titleField} hint={T.titleHint} error={errors.title}>
        <TextField
          value={form.title}
          maxLength={100}
          status={errors.title ? 'negative' : 'normal'}
          onChange={(e) => set({ title: e.target.value })}
        />
      </FormField>

      <div className="schd-when">
        <label className="schd-field">
          {T.dateField}
          <input
            type="date"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </label>
        <TimeSelect
          label={T.startField}
          value={form.start}
          onChange={(v) => set({ start: v })}
        />
        <TimeSelect
          label={T.endField}
          value={form.end}
          onChange={(v) => set({ end: v })}
        />
      </div>
      <div className="helper-slot">
        {endAfterStart ? null : (
          <span
            className="schd-error"
            role="alert"
          >{`* ${T.endBeforeStart}`}</span>
        )}
      </div>

      <FormField label={T.locationField} error={errors.location}>
        <TextField
          value={form.location}
          maxLength={200}
          status={errors.location ? 'negative' : 'normal'}
          onChange={(e) => set({ location: e.target.value })}
        />
      </FormField>
      {recentLocations.length ? (
        <div role="group" aria-label={T.recentLocations} className="schd-seg">
          {recentLocations.map((l) => (
            <button
              key={l}
              type="button"
              className="schd-pill"
              onClick={() => set({ location: l })}
            >
              {l}
            </button>
          ))}
        </div>
      ) : null}

      <fieldset className="schd-section">
        <legend>{T.targetField}</legend>
        <label className="schd-check">
          <input
            type="checkbox"
            checked={form.forAll}
            onChange={(e) => set({ forAll: e.target.checked })}
          />
          {T.forAll}
        </label>
        {form.forAll ? null : (
          <>
            <div role="group" aria-label={T.teamsField} className="schd-seg">
              {(teams.data ?? []).length === 0 && teams.isSuccess ? (
                <span>{T.noTeams}</span>
              ) : null}
              {(teams.data ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="schd-pill"
                  aria-pressed={form.teamIds.includes(t.id)}
                  onClick={() => set({ teamIds: toggle(form.teamIds, t.id) })}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="group" aria-label={T.songsField} className="schd-seg">
              {(songs.data ?? []).length === 0 && songs.isSuccess ? (
                <span>{T.noSongs}</span>
              ) : null}
              {(songs.data ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="schd-pill"
                  aria-pressed={form.songIds.includes(s.id)}
                  onClick={() => set({ songIds: toggle(form.songIds, s.id) })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="helper-slot">
          {hasTarget ? null : (
            <span className="schd-error">{`* ${T.targetRequired}`}</span>
          )}
        </div>
      </fieldset>

      <section className="schd-section" aria-label={T.previewTitle}>
        <Typography variant="body1" weight="bold" as="h2">
          {previewData
            ? T.attendees(previewData.participants.length)
            : T.previewTitle}
        </Typography>
        {preview.isError ? (
          <ErrorState onRetry={() => void preview.refetch()} />
        ) : previewData ? (
          <ul className="schd-people">
            {previewData.participants.map((p) => (
              <li key={p.membershipId} className="schd-person">
                {p.displayName}
              </li>
            ))}
          </ul>
        ) : preview.isFetching ? (
          <Typography variant="caption1">{T.previewLoading}</Typography>
        ) : null}
        {/* ponytail: 8 (available head-count) needs API-103 of the availability bundle; only its link is here. */}
        <Link to={`${base}/availability/common`}>{T.availabilityLink}</Link>
      </section>

      <section className="schd-section" aria-label={T.warningsTitle}>
        <Typography variant="body1" weight="bold" as="h2">
          {T.warningsTitle}
        </Typography>
        {hardErrors.length ? (
          <ul className="warning-list">
            {hardErrors.map((e, i) => (
              <li key={i}>{e.message || T.hardErrorsTitle}</li>
            ))}
          </ul>
        ) : null}
        {previewData && warnings.length === 0 ? (
          <Typography variant="body2">{T.noOverlap}</Typography>
        ) : (
          <ul className="warning-list">
            {warningTexts(warnings).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>

      <FormField label={T.memoField} error={errors.memo}>
        <TextArea
          value={form.memo}
          maxLength={500}
          onChange={(e) => set({ memo: e.target.value })}
        />
      </FormField>

      <fieldset className="schd-section">
        <legend>{T.statusField}</legend>
        {(
          [
            ['TENTATIVE', T.statusTentative],
            ['CONFIRMED', T.statusConfirmed],
          ] as const
        ).map(([v, text]) => (
          <label key={v} className="schd-check">
            <input
              type="radio"
              name="schedule-status"
              checked={form.status === v}
              onChange={() => set({ status: v })}
            />
            {text}
          </label>
        ))}
        {unconfirming ? (
          <Typography variant="caption1">{T.unconfirmNotice}</Typography>
        ) : null}
      </fieldset>

      <Button
        type="submit"
        size="large"
        loading={save.isPending}
        disabled={!valid || hardErrors.length > 0}
      >
        {T.save}
      </Button>
    </form>
  )
}

/** SCHD-003: create (`schedules/new`) or edit (`schedules/:scheduleId/edit`). Officers only. */
export function ScheduleForm() {
  const { clubId = '', performanceId = '', scheduleId } = useParams()
  const detail = useQuery({
    queryKey: [...scheduleKey(clubId, performanceId), scheduleId, 'detail'],
    queryFn: () => getSchedule(clubId, performanceId, scheduleId ?? ''),
    enabled: scheduleId !== undefined,
    // The form restarts when the version changes (below): a silent refetch would drop the draft.
    refetchOnReconnect: false,
  })
  const perf = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })

  if (detail.isError || perf.isError)
    return (
      <ErrorState
        onRetry={() => {
          void detail.refetch()
          void perf.refetch()
        }}
      />
    )
  if (!perf.data || (scheduleId !== undefined && !detail.data))
    return (
      <div className="schd" data-screen-id="SCHD-003">
        <ListSkeleton rows={4} />
      </div>
    )
  const { performance } = perf.data
  // E-01: nothing is created or changed on a finished or canceled performance.
  if (performance.status === 'FINISHED' || performance.status === 'CANCELED')
    return (
      <div className="schd" data-screen-id="SCHD-003">
        <Typography variant="body1">{T.endedPerformance}</Typography>
      </div>
    )
  return (
    <FormBody
      // A reload after a version conflict starts the form over from the new content.
      key={detail.data?.schedule.version ?? 'new'}
      clubId={clubId}
      performanceId={performanceId}
      existing={detail.data}
      performanceTitle={performance.title}
    />
  )
}
