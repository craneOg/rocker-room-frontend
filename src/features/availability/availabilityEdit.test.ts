import { describe, expect, it } from 'vitest'
import {
  applyRepeat,
  changedWeekSaves,
  clearWeek,
  copyPreviousWeek,
} from './availabilityEdit'
import { slotAt } from './availabilityTime'

const season = { start: '2026-10-06', end: '2026-10-20' }

describe('availabilityEdit', () => {
  it('clears only the given week', () => {
    const a = slotAt('2026-10-13', 600)
    const b = slotAt('2026-10-20', 600)
    expect(clearWeek(new Set([a, b]), '2026-10-12')).toEqual(new Set([b]))
  })

  it('copies the previous week and drops what falls outside the season', () => {
    const tue = slotAt('2026-10-13', 600)
    const next = copyPreviousWeek(new Set([tue]), '2026-10-19', season)
    expect(next).toEqual(new Set([tue, slotAt('2026-10-20', 600)]))
    // the Tuesday of the week after the season end is cut: only the original stays
    const last = slotAt('2026-10-20', 600)
    expect(copyPreviousWeek(new Set([last]), '2026-10-26', season)).toEqual(
      new Set([last]),
    )
  })

  it('repeats a weekday over this week or the whole season, inside the season only', () => {
    const rep = { weekdays: [0], startMin: 1080, endMin: 1140 }
    // Mondays: 10.05 (before the season), 10.12, 10.19
    const all = applyRepeat(
      new Set(),
      { ...rep, scope: 'season' },
      '2026-10-12',
      season,
    )
    expect([...all].sort()).toEqual(
      [
        slotAt('2026-10-12', 1080),
        slotAt('2026-10-12', 1110),
        slotAt('2026-10-19', 1080),
        slotAt('2026-10-19', 1110),
      ].sort(),
    )
    const week = applyRepeat(
      new Set(),
      { ...rep, scope: 'week' },
      '2026-10-12',
      season,
    )
    expect(week.size).toBe(2)
  })
})

describe('changedWeekSaves', () => {
  const season = { start: '2026-10-06', end: '2026-10-25' }
  const at = (day: string, h: number) =>
    Date.parse(`${day}T${String(h).padStart(2, '0')}:00:00+09:00`)

  it('sends nothing when nothing changed', () => {
    const same = new Set([at('2026-10-14', 20)])
    expect(changedWeekSaves(season, same, new Set(same))).toEqual([])
  })

  it('sends only the changed weeks, each cut to the season and at most 7 days', () => {
    const saved = new Set([at('2026-10-08', 18)])
    const working = new Set([
      at('2026-10-08', 18),
      at('2026-10-07', 19),
      at('2026-10-22', 19),
    ])
    const sent = changedWeekSaves(season, working, saved)
    expect(sent.map((w) => [w.from, w.to, w.slots.length])).toEqual([
      ['2026-10-06T00:00:00+09:00', '2026-10-12T00:00:00+09:00', 2],
      ['2026-10-19T00:00:00+09:00', '2026-10-26T00:00:00+09:00', 1],
    ])
  })

  it('sends an empty week to delete its slots', () => {
    const saved = new Set([at('2026-10-14', 20)])
    expect(changedWeekSaves(season, new Set(), saved)).toEqual([
      {
        from: '2026-10-12T00:00:00+09:00',
        to: '2026-10-19T00:00:00+09:00',
        slots: [],
      },
    ])
  })
})
