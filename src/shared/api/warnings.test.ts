import { describe, expect, it } from 'vitest'
import { extractWarnings } from './assumptions'
import {
  GENERIC_WARNING,
  parseWarnings,
  warningText,
  type ApiWarning,
} from './warnings'

describe('parseWarnings', () => {
  it('keeps objects with their fields, bare strings as messages, and drops the rest', () => {
    expect(
      parseWarnings([
        { type: 'DUPLICATE_SONG' },
        'plain',
        { message: 'no type' },
        7,
        null,
        '',
      ]),
    ).toEqual([
      { type: 'DUPLICATE_SONG', message: undefined },
      { type: 'MESSAGE', message: 'plain' },
      { type: 'UNKNOWN', message: 'no type' },
    ])
    expect(parseWarnings(undefined)).toEqual([])
  })
})

describe('warningText', () => {
  const text = (w: ApiWarning) => warningText(w)

  it('builds a sentence from the type and its fields', () => {
    expect(
      text({
        type: 'PART_SHORTAGE',
        partName: '기타',
        requiredCount: 3,
        assignedCount: 1,
      }),
    ).toBe('기타 파트가 2명 부족해요 (필요 3명, 현재 1명)')
    expect(
      text({
        type: 'PART_EXCESS',
        partName: '드럼',
        requiredCount: 1,
        assignedCount: 2,
      }),
    ).toBe('드럼 파트가 1명 많아요 (필요 1명, 현재 2명)')
    expect(
      text({
        type: 'SONG_COUNT_EXCEEDED',
        displayName: '김도윤',
        songCount: 4,
      }),
    ).toBe('김도윤님이 4곡에 출연해요')
    expect(text({ type: 'DUPLICATE_SONG' })).toBe('같은 곡이 이미 있어요')
    expect(
      text({ type: 'SCHEDULE_LINK_RELEASED', scheduleIds: ['1', '2'] }),
    ).toBe('연결된 일정 2개가 해제돼요')
    expect(text({ type: 'OVERLAP', title: '정기 합주' })).toBe(
      "'정기 합주' 일정과 시간이 겹쳐요",
    )
  })

  it('prefers the server message and falls back for unknown types', () => {
    expect(
      text({ type: 'OVERLAP_OTHER_CLUB', message: '다른 일정 있음' }),
    ).toBe('다른 일정 있음')
    expect(text({ type: 'SOMETHING_NEW' })).toBe(GENERIC_WARNING)
    expect(text({ type: 'PART_SHORTAGE' })).toBe('일부 파트 인원이 부족해요')
  })

  it('reaches the success banner through extractWarnings', () => {
    expect(
      extractWarnings({ warnings: [{ type: 'DUPLICATE_SONG' }, 'x'] }),
    ).toEqual(['같은 곡이 이미 있어요', 'x'])
  })
})
