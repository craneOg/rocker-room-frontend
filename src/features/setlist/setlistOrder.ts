import type { SetlistEntry } from './setlistApi'

/** The editable arrangement: placed songs in order, then the ones without a place. */
export type Arrangement = { placed: SetlistEntry[]; unplaced: SetlistEntry[] }

/** Placed songs sorted by order; unplaced ones keep the server order (id order). */
export function arrange(items: SetlistEntry[]): Arrangement {
  const placed = items
    .filter((e) => e.song.setlistOrder !== null)
    .sort((a, b) => (a.song.setlistOrder ?? 0) - (b.song.setlistOrder ?? 0))
  return {
    placed,
    unplaced: items.filter((e) => e.song.setlistOrder === null),
  }
}

export const moveItem = <T>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [x] = next.splice(from, 1)
  if (x !== undefined) next.splice(to, 0, x)
  return next
}

/** L-10: names of the players who also play in the song right before. */
export function overlapWithPrevious(prev: SetlistEntry, cur: SetlistEntry) {
  const before = new Set(prev.sessions.map((s) => s.performanceMemberId))
  const seen = new Set<string>()
  return cur.sessions.flatMap((s) => {
    if (!before.has(s.performanceMemberId) || seen.has(s.performanceMemberId))
      return []
    seen.add(s.performanceMemberId)
    return [s.displayName]
  })
}

/** API-088 items: every confirmed song once, numbered from 1 on the screen (O-01, O-03). */
export const toOrderItems = ({ placed, unplaced }: Arrangement) => [
  ...placed.map((e, i) => ({
    songId: e.song.id,
    order: i + 1,
    version: e.song.version,
  })),
  ...unplaced.map((e) => ({
    songId: e.song.id,
    order: null,
    version: e.song.version,
  })),
]

export const sameArrangement = (a: Arrangement, b: Arrangement) =>
  a.placed.length === b.placed.length &&
  a.placed.every((e, i) => e.song.id === b.placed[i]?.song.id)
