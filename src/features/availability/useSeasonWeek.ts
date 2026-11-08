import { useState } from 'react'
import type { Season } from './availabilityEdit'
import { addDays, dayOfSlot, seasonWeeks } from './availabilityTime'

/** The weeks of the season and the one on screen (the week of today, else the nearest end). */
export function useSeasonWeek(season: Season | null) {
  const weeks = season ? seasonWeeks(season.start, season.end) : []
  const [today] = useState(() => dayOfSlot(Date.now()))
  const nearest = weeks.findIndex((m) => today <= addDays(m, 6))
  const [picked, setPicked] = useState<number | null>(null)
  const index = Math.min(
    picked ?? (nearest === -1 ? weeks.length - 1 : nearest),
    weeks.length - 1,
  )
  const monday = weeks[index] ?? ''
  return {
    weeks,
    index,
    monday,
    days: monday ? Array.from({ length: 7 }, (_, i) => addDays(monday, i)) : [],
    prev: index > 0 ? () => setPicked(index - 1) : undefined,
    next: index < weeks.length - 1 ? () => setPicked(index + 1) : undefined,
  }
}
