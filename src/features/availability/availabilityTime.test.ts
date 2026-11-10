import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayOfSlot,
  itemsFromSlots,
  minutesOfSlot,
  mondayOf,
  seasonWeeks,
  slotAt,
  slotsFromItems,
  toIso,
  weekdayOf,
} from './availabilityTime'

describe('availabilityTime', () => {
  it('works on KST days', () => {
    expect(weekdayOf('2026-10-12')).toBe(0)
    expect(mondayOf('2026-10-18')).toBe('2026-10-12')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(seasonWeeks('2026-10-06', '2026-10-20')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ])
  })

  it('round-trips a slot through the +09:00 form', () => {
    const t = slotAt('2026-10-15', 18 * 60 + 30)
    expect(toIso(t)).toBe('2026-10-15T18:30:00+09:00')
    expect(dayOfSlot(t)).toBe('2026-10-15')
    expect(minutesOfSlot(t)).toBe(18 * 60 + 30)
    // 00:00 KST is still the same KST day although it is the previous UTC day.
    expect(dayOfSlot(slotAt('2026-10-15', 0))).toBe('2026-10-15')
  })

  it('splits longer API items into 30-minute slots and sorts back', () => {
    const slots = slotsFromItems([
      {
        startAt: '2026-10-15T18:00:00+09:00',
        endAt: '2026-10-15T19:00:00+09:00',
      },
    ])
    expect(slots.size).toBe(2)
    expect(itemsFromSlots(slots)).toEqual([
      {
        startAt: '2026-10-15T18:00:00+09:00',
        endAt: '2026-10-15T18:30:00+09:00',
      },
      {
        startAt: '2026-10-15T18:30:00+09:00',
        endAt: '2026-10-15T19:00:00+09:00',
      },
    ])
  })
})
