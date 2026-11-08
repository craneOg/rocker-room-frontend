import { describe, expect, it } from 'vitest'
import {
  addMonths,
  durationLabel,
  monthGrid,
  rangeLabel,
  startOfWeek,
  warningText,
} from './scheduleBits'

describe('scheduleBits', () => {
  it('weeks start on Sunday (UI-18)', () => {
    expect(startOfWeek('2026-10-15')).toBe('2026-10-11')
    expect(startOfWeek('2026-10-11')).toBe('2026-10-11')
  })

  it('the month grid runs Sunday to Saturday around the month', () => {
    expect(monthGrid('2026-10-15')).toEqual({
      from: '2026-09-27',
      to: '2026-10-31',
    })
    expect(monthGrid('2026-02-10')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
  })

  it('moves months from any day, including the 31st', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01')
  })

  it('labels a range with weekday and length', () => {
    expect(
      rangeLabel('2026-10-08T19:00:00+09:00', '2026-10-08T21:30:00+09:00'),
    ).toBe('10.08(목) 19:00 ~ 21:30 (2시간 30분)')
    expect(durationLabel(30)).toBe('30분')
  })

  it('words the warning types and falls back to the server message', () => {
    expect(
      warningText({
        type: 'OVERLAP',
        title: '밴드 합주',
        startAt: '2026-10-15T19:00:00+09:00',
        endAt: '2026-10-15T20:00:00+09:00',
        participants: [
          { membershipId: '1', displayName: '명혜성' },
          { membershipId: '2', displayName: '정규채' },
        ],
      }),
    ).toBe('명혜성, 정규채 · 밴드 합주 19:00~20:00와 겹쳐요')
    expect(warningText({ type: 'PART_SHORTAGE', message: '드럼 부족' })).toBe(
      '드럼 부족',
    )
    // no message: the shared wording builds it from the fields, or a generic line
    expect(
      warningText({
        type: 'PART_SHORTAGE',
        partName: '드럼',
        requiredCount: 2,
        assignedCount: 1,
      }),
    ).toBe('드럼 파트가 1명 부족해요 (필요 2명, 현재 1명)')
    expect(warningText({ type: 'FUTURE_TYPE' })).toBe(
      '확인이 필요한 항목이 있어요',
    )
    expect(
      warningText({
        type: 'OVERLAP_OTHER_CLUB',
        message: '다른 일정이 있어요',
        startAt: '2026-10-15T19:30:00+09:00',
        endAt: '2026-10-15T21:00:00+09:00',
        participants: [{ membershipId: '2', displayName: '임형규' }],
      }),
    ).toBe('임형규 · 다른 일정이 있어요 19:30~21:00')
  })
})
