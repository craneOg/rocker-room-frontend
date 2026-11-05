import { describe, expect, it } from 'vitest'
import { formatKstDay, formatKstShort, formatKstYmd } from './time'

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
})
