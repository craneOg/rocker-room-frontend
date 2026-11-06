import { describe, expect, it } from 'vitest'
import {
  formatDDay,
  formatKstDay,
  formatKstShort,
  formatKstTime,
  formatKstYmd,
} from './time'

describe('time formatting', () => {
  it('formats KST short date with time', () => {
    // 2026-10-31T03:00:00Z = 2026-10-31 12:00 KST
    expect(formatKstShort('2026-10-31T03:00:00Z')).toBe('10.31 12:00')
  })

  it('formats KST day with weekday', () => {
    // 2026-10-31 is Saturday
    expect(formatKstDay('2026-10-31T03:00:00Z')).toBe('10.31(토)')
  })

  it('formats KST date as YYYY.MM.DD', () => {
    expect(formatKstYmd('2026-09-01T03:00:00Z')).toBe('2026.09.01')
    expect(formatKstYmd('2026-11-30T03:00:00Z')).toBe('2026.11.30')
  })

  it('formats KST time as HH:mm', () => {
    expect(formatKstTime('2026-11-08T10:00:00Z')).toBe('19:00')
  })

  it('counts D-day by KST calendar date, not by 24h', () => {
    // 2026-11-07 23:30 KST = 14:30Z; the performance is on 11-10 (KST).
    const now = Date.parse('2026-11-07T14:30:00Z')
    expect(formatDDay('2026-11-10', now)).toBe('D-3')
    expect(formatDDay('2026-11-07', now)).toBe('D-Day')
    expect(formatDDay('2026-11-05', now)).toBe('D+2')
    // Just after midnight KST on 11-08 the same instant-of-day shift must show D-2.
    expect(formatDDay('2026-11-10', Date.parse('2026-11-07T15:10:00Z'))).toBe(
      'D-2',
    )
  })
})
