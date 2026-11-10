import {
  addDays,
  dayOfSlot,
  inSeason,
  slotsOfRange,
  seasonWeeks,
} from './availabilityTime'

// Pure edits of the painted-slot set. `season` bounds every edit: nothing outside it is painted.
export type Season = { start: string; end: string }

const weekDays = (monday: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(monday, i))

const inWeek = (ms: number, monday: string) => {
  const d = dayOfSlot(ms)
  return d >= monday && d <= addDays(monday, 6)
}

export function clearWeek(slots: Set<number>, monday: string) {
  return new Set([...slots].filter((t) => !inWeek(t, monday)))
}

/** The week takes the previous week's pattern (same weekday and time), cut to the season. */
export function copyPreviousWeek(
  slots: Set<number>,
  monday: string,
  season: Season,
) {
  const next = clearWeek(slots, monday)
  const prev = addDays(monday, -7)
  for (const t of slots) {
    if (!inWeek(t, prev)) continue
    const shifted = t + 7 * 86_400_000
    if (inSeason(dayOfSlot(shifted), season.start, season.end))
      next.add(shifted)
  }
  return next
}

export type Repeat = {
  /** 0 = Monday ... 6 = Sunday. */
  weekdays: number[]
  startMin: number
  endMin: number
  scope: 'week' | 'season'
}

/** 4-1: paints the chosen weekdays and times in this week, or in every week of the season. */
export function applyRepeat(
  slots: Set<number>,
  repeat: Repeat,
  monday: string,
  season: Season,
) {
  const next = new Set(slots)
  const mondays =
    repeat.scope === 'week' ? [monday] : seasonWeeks(season.start, season.end)
  for (const m of mondays)
    for (const wd of repeat.weekdays) {
      const day = weekDays(m)[wd]
      if (day === undefined || !inSeason(day, season.start, season.end))
        continue
      for (const t of slotsOfRange(day, repeat.startMin, repeat.endMin))
        next.add(t)
    }
  return next
}
