import { SCHEDULE_COPY as T } from './scheduleCopy'
import type { ScheduleWarning } from './scheduleApi'

// Dates stay plain `yyyy-MM-dd` strings; the API times are already +09:00, so the first 10
// characters of a time are its KST date and characters 11-16 its clock.

const DAY = 86_400_000
const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`)

export const addDays = (ymd: string, n: number) =>
  new Date(utc(ymd).getTime() + n * DAY).toISOString().slice(0, 10)

/** 0 = Sunday (UI-18: month and week views start on Sunday). */
export const weekday = (ymd: string) => utc(ymd).getUTCDay()
export const startOfWeek = (ymd: string) => addDays(ymd, -weekday(ymd))

export const kstToday = () =>
  new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)

export const addMonths = (ymd: string, n: number) => {
  const d = utc(`${ymd.slice(0, 8)}01`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** The grid of a month, Sunday to Saturday. */
export function monthGrid(anchor: string) {
  const first = `${anchor.slice(0, 8)}01`
  const last = addDays(addMonths(first, 1), -1)
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6) }
}

export const toRange = (from: string, to: string) => ({
  from: `${from}T00:00:00+09:00`,
  to: `${to}T23:59:59+09:00`,
})

export const dateOf = (iso: string) => iso.slice(0, 10)
export const clockOf = (iso: string) => iso.slice(11, 16)

export const minutesBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 60_000)

export const durationLabel = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ')
}

/** "10.08(목)" */
export const shortDate = (ymd: string) =>
  `${ymd.slice(5, 7)}.${ymd.slice(8, 10)}(${T.weekdays[weekday(ymd)]})`

/** "10.08(목) 19:00 ~ 21:00 (2시간)" */
export const rangeLabel = (startAt: string, endAt: string) =>
  `${shortDate(dateOf(startAt))} ${clockOf(startAt)} ~ ${clockOf(endAt)} (${durationLabel(minutesBetween(startAt, endAt))})`

export const inKst = (ymd: string, clock: string) => `${ymd}T${clock}:00+09:00`

/** 00:00 ... 23:30, the 30-minute picker values (E-04). */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  return `${h}:${i % 2 ? '30' : '00'}`
})

const names = (w: ScheduleWarning) =>
  (w.participants ?? []).map((p) => p.displayName).join(', ')
const span = (w: ScheduleWarning) =>
  w.startAt && w.endAt ? `${clockOf(w.startAt)}~${clockOf(w.endAt)}` : ''

/** The wording of a warning item (SCHD-003 9); other types fall back to the server message. */
export function warningText(w: ScheduleWarning): string {
  if (w.type === 'OVERLAP') return T.overlap(names(w), w.title ?? '', span(w))
  if (w.type === 'OVERLAP_OTHER_CLUB') return T.overlapOther(names(w), span(w))
  if (w.type === 'OUT_OF_SEASON') return T.outOfSeason
  return w.message ?? ''
}

export const warningTexts = (warnings: ScheduleWarning[]) =>
  warnings.map(warningText).filter(Boolean)
