// Fixed-offset (KST, no DST) calendar helpers for the availability grid. A slot is the epoch
// millisecond of its start; days are "YYYY-MM-DD" strings.
export const SLOT_MS = 30 * 60_000
const DAY_MS = 86_400_000
const KST_MS = 9 * 3_600_000

/** Epoch ms of 00:00 KST on `day`. */
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00+09:00`)

export const slotAt = (day: string, minutes: number) =>
  dayStart(day) + minutes * 60_000

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10)

/** 0 = Monday ... 6 = Sunday. */
export const weekdayOf = (day: string) =>
  (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7

export const mondayOf = (day: string) => addDays(day, -weekdayOf(day))

export const dayOfSlot = (ms: number) =>
  new Date(ms + KST_MS).toISOString().slice(0, 10)

export const minutesOfSlot = (ms: number) =>
  Math.round((ms - dayStart(dayOfSlot(ms))) / 60_000)

/** ISO-8601 with the +09:00 offset the API uses. */
export const toIso = (ms: number) =>
  `${new Date(ms + KST_MS).toISOString().slice(0, 19)}+09:00`

export const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** "10.12" for "2026-10-12". */
export const mmdd = (day: string) => `${day.slice(5, 7)}.${day.slice(8, 10)}`

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/** "10.12(월)". */
export const mmddWeekday = (day: string) =>
  `${mmdd(day)}(${WEEKDAYS[weekdayOf(day)]})`

/** Mondays of every week the season touches. */
export function seasonWeeks(start: string, end: string): string[] {
  const weeks: string[] = []
  for (let w = mondayOf(start); w <= end; w = addDays(w, 7)) weeks.push(w)
  return weeks
}

export const inSeason = (day: string, start: string, end: string) =>
  day >= start && day <= end

/** Every 30-minute start inside [startMin, endMin) of `day`. */
export const slotsOfRange = (day: string, startMin: number, endMin: number) => {
  const out: number[] = []
  for (let m = startMin; m < endMin; m += 30) out.push(slotAt(day, m))
  return out
}

/** API items -> slot starts; a longer item is split into 30-minute slots. */
export function slotsFromItems(items: { startAt: string; endAt: string }[]) {
  const out = new Set<number>()
  for (const it of items) {
    const end = Date.parse(it.endAt)
    for (let t = Date.parse(it.startAt); t < end; t += SLOT_MS) out.add(t)
  }
  return out
}

export const itemsFromSlots = (slots: Iterable<number>) =>
  [...slots]
    .sort((a, b) => a - b)
    .map((t) => ({ startAt: toIso(t), endAt: toIso(t + SLOT_MS) }))

export const sameSet = (a: Set<number>, b: Set<number>) =>
  a.size === b.size && [...a].every((x) => b.has(x))
