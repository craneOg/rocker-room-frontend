import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { parseWarnings, type ApiWarning } from '../../shared/api/warnings'
import { performanceKey } from '../performance/api'

// API-105 ~ 115, 153 (Notion API spec). IDs are strings, times are ISO-8601 with +09:00.
const perfPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}`

export type EventType = 'PRACTICE' | 'REHEARSAL' | 'AUDITION' | 'ETC'
export type ScheduleStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELED'
export const EVENT_TYPES: EventType[] = [
  'PRACTICE',
  'REHEARSAL',
  'AUDITION',
  'ETC',
]

/** Item of API-105 and the `resource` of the mutations. */
export type Schedule = {
  id: string
  performanceId: string
  eventType: EventType
  status: ScheduleStatus
  startAt: string
  endAt: string
  title: string
  location: string | null
  version: string
}

/** API-108 `schedule` (also the create / update `resource`). */
export type ScheduleFull = Schedule & {
  memo: string | null
  forAllParticipants: boolean
  teamIds: string[]
  songIds: string[]
  performanceTitle: string
}

export type Person = { membershipId: string; displayName: string }

/**
 * One warning item (backend-confirmed): `type` plus type-specific fields, `message` only on
 * OVERLAP_OTHER_CLUB. OVERLAP, OVERLAP_OTHER_CLUB, OUT_OF_SEASON and, in API-113, check types such
 * as PART_SHORTAGE. Parsed by the shared `parseWarnings`.
 */
export type ScheduleWarning = ApiWarning & {
  scheduleId?: string
  title?: string
  startAt?: string
  endAt?: string
  participants?: Person[]
}

/** The warning fields are not final in the backend: keep only what has the shape the screens read. */
const warningsOf = (raw: unknown): ScheduleWarning[] =>
  parseWarnings(raw).map((w) => {
    const text = (v: unknown) => (typeof v === 'string' ? v : undefined)
    return {
      ...w,
      scheduleId: text(w.scheduleId),
      title: text(w.title),
      startAt: text(w.startAt),
      endAt: text(w.endAt),
      participants: Array.isArray(w.participants)
        ? w.participants.filter(
            (p): p is Person =>
              typeof p === 'object' &&
              p !== null &&
              typeof (p as Person).displayName === 'string',
          )
        : undefined,
    }
  })

/** A blocking item of a check: `{type, message}` (backend-confirmed; the type list is open). */
export type HardError = { type: string; message: string }

/** Reads `hardErrors`; a bare string is still shown as its own message. */
function hardErrorsOf(raw: unknown): HardError[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((e: unknown): HardError[] => {
    if (typeof e === 'string') return e ? [{ type: 'UNKNOWN', message: e }] : []
    if (typeof e !== 'object' || e === null) return []
    const r = e as Record<string, unknown>
    const message = typeof r.message === 'string' ? r.message : ''
    return [{ type: typeof r.type === 'string' ? r.type : 'UNKNOWN', message }]
  })
}

export type ScheduleParticipant = {
  userId: string
  performanceMemberId: string
  membershipId: string
  displayName: string
  parts: { id: string; name: string }[]
  memberType: 'REGULAR' | 'GUEST'
  isSupportPlayer: boolean
}

export type ScheduleDetail = {
  schedule: ScheduleFull
  participants: ScheduleParticipant[]
}

export type ScheduleBody = {
  eventType: EventType
  status: 'TENTATIVE' | 'CONFIRMED'
  startAt: string
  endAt: string
  title: string | null
  location: string | null
  memo: string | null
  forAllParticipants: boolean
  teamIds: string[]
  songIds: string[]
}

export type MutationResult<T> = {
  resource: T
  warnings: ScheduleWarning[]
  effects?: unknown
}

export type CalendarEvent = {
  id: string
  title: string
  startAt: string
  endAt: string
  eventType: EventType | 'PERFORMANCE'
  allDay: boolean
  /** Null for a performance day. */
  status: ScheduleStatus | null
  clubId: string
  performanceId: string
}

export type Range = { from: string; to: string }

/** API-114: every club I belong to. TENTATIVE never comes back. */
const parsed = <T>(r: MutationResult<T>): MutationResult<T> => ({
  ...r,
  warnings: warningsOf(r.warnings),
})

export const getMyCalendar = (
  p: Range & { clubIds?: string[]; includeCanceled?: boolean },
  signal?: AbortSignal,
) =>
  api
    .get<{ items: CalendarEvent[] }>('/api/v1/me/calendar', {
      query: {
        from: p.from,
        to: p.to,
        clubIds: p.clubIds?.length ? p.clubIds.join(',') : undefined,
        includeCanceled: p.includeCanceled || undefined,
      },
      signal,
    })
    .then((r) => r.items)

export type ClubCalendarFilter = Range & {
  performanceId?: string
  teamId?: string
  songId?: string
  eventTypes?: EventType[]
  /** Officers only. */
  includeTentative?: boolean
  includeCanceled?: boolean
}

/** API-115. */
export const getClubCalendar = (
  clubId: string,
  p: ClubCalendarFilter,
  signal?: AbortSignal,
) =>
  api
    .get<{ items: CalendarEvent[] }>(`/api/v1/clubs/${clubId}/calendar`, {
      query: {
        from: p.from,
        to: p.to,
        performanceId: p.performanceId || undefined,
        teamId: p.teamId || undefined,
        songId: p.songId || undefined,
        eventType: p.eventTypes?.length ? p.eventTypes.join(',') : undefined,
        includeTentative: p.includeTentative || undefined,
        includeCanceled: p.includeCanceled || undefined,
      },
      signal,
    })
    .then((r) => r.items)

/** API-105 (sorted startAt,asc by the server). */
export const listSchedules = (
  clubId: string,
  performanceId: string,
  p: Range,
  size = 100,
) =>
  api
    .get<{ items: Schedule[] }>(
      `${perfPath(clubId, performanceId)}/schedules`,
      {
        query: { from: p.from, to: p.to, page: 0, size },
      },
    )
    .then((r) => r.items)

/** API-108. */
export const getSchedule = (
  clubId: string,
  performanceId: string,
  scheduleId: string,
) =>
  api.get<ScheduleDetail>(
    `${perfPath(clubId, performanceId)}/schedules/${scheduleId}`,
  )

/** API-113: warnings and checks of one schedule; a member only gets what concerns them. */
export const getConflicts = (
  clubId: string,
  performanceId: string,
  scheduleId: string,
) =>
  api
    .get<{ items: ScheduleWarning[] }>(
      `${perfPath(clubId, performanceId)}/schedules/${scheduleId}/conflicts`,
    )
    .then((r) => warningsOf(r.items))

export type ValidationResult = {
  hardErrors: HardError[]
  warnings: ScheduleWarning[]
  /** The whole attendee list before saving (E-09). */
  participants: Person[]
}

/** API-106: computes without saving. Also used while editing (API-109 has no participants). */
export const validateSchedule = (
  clubId: string,
  performanceId: string,
  body: ScheduleBody,
  signal?: AbortSignal,
) =>
  api
    .post<ValidationResult>(
      `${perfPath(clubId, performanceId)}/schedules/validate`,
      body,
      { signal },
    )
    .then((r) => ({
      ...r,
      hardErrors: hardErrorsOf(r.hardErrors),
      warnings: warningsOf(r.warnings),
    }))

/** API-107. */
export const createSchedule = (
  clubId: string,
  performanceId: string,
  body: ScheduleBody,
) =>
  api
    .post<MutationResult<ScheduleFull>>(
      `${perfPath(clubId, performanceId)}/schedules`,
      body,
    )
    .then(parsed)

/**
 * API-110. It never changes `status` (use confirm / unconfirm for that).
 * ponytail: whether the server's PATCH also takes `status` is unconfirmed (backend).
 */
export const updateSchedule = (
  clubId: string,
  performanceId: string,
  scheduleId: string,
  body: Omit<ScheduleBody, 'status'> & { version: string },
) =>
  api
    .patch<MutationResult<ScheduleFull>>(
      `${perfPath(clubId, performanceId)}/schedules/${scheduleId}`,
      body,
    )
    .then(parsed)

/** API-111: with warnings the first call is 409 CONFIRMATION_REQUIRED; resend with `confirmed`. */
export const confirmSchedule = (
  clubId: string,
  performanceId: string,
  scheduleId: string,
  body: { version: string; confirmed: boolean },
) =>
  api
    .post<MutationResult<Schedule>>(
      `${perfPath(clubId, performanceId)}/schedules/${scheduleId}/confirm`,
      body,
    )
    .then(parsed)

/** API-153. */
export const unconfirmSchedule = (
  clubId: string,
  performanceId: string,
  scheduleId: string,
  version: string,
) =>
  api.post<{ id: string; status: ScheduleStatus; version: string }>(
    `${perfPath(clubId, performanceId)}/schedules/${scheduleId}/unconfirm`,
    { version },
  )

/**
 * API-112. The screen has no reason input, so none is sent.
 * ponytail: the cancel reason and the conflict lookup of a canceled schedule are unconfirmed (backend).
 */
export const cancelSchedule = (
  clubId: string,
  performanceId: string,
  scheduleId: string,
  version: string,
) =>
  api
    .post<MutationResult<Schedule>>(
      `${perfPath(clubId, performanceId)}/schedules/${scheduleId}/cancel`,
      { version },
    )
    .then(parsed)

export type Choice = { id: string; label: string }

/**
 * API-061 reduced to a choice list: approved teams (SCHD-003 6). Keeps the spec's `items`; the
 * backend said `content` and will fix the server. ponytail: max `size` unconfirmed.
 */
export const listTeamChoices = (clubId: string, performanceId: string) =>
  api
    .get<{ items: { id: string; name: string }[] }>(
      `${perfPath(clubId, performanceId)}/teams`,
      { query: { status: 'APPROVED', size: 100 } },
    )
    .then((r): Choice[] => r.items.map((t) => ({ id: t.id, label: t.name })))

/**
 * API-075 reduced to a choice list: candidate and confirmed songs (E-03).
 * ponytail: the max `size` (100 asked) and the response key `items` are unconfirmed (backend).
 */
export const listSongChoices = (clubId: string, performanceId: string) =>
  api
    .get<{ items: { id: string; title: string }[] }>(
      `${perfPath(clubId, performanceId)}/songs`,
      { query: { status: 'PROPOSED,CONFIRMED', size: 100 } },
    )
    .then((r): Choice[] => r.items.map((s) => ({ id: s.id, label: s.title })))

export const scheduleKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'schedule'] as const
export const choicesKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'schedule-choices'] as const

/** After a write: this performance (schedules and details) and every calendar. */
export const invalidateSchedules = (
  qc: QueryClient,
  clubId: string,
  performanceId: string,
) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: performanceKey(clubId, performanceId) }),
    qc.invalidateQueries({ queryKey: ['club', clubId, 'calendar'] }),
    qc.invalidateQueries({ queryKey: ['me', 'calendar'] }),
  ])
