/**
 * A warning of the API (`data.warnings[]` of a success and `error.warnings[]` of a
 * CONFIRMATION_REQUIRED): an object with a `type` and type-specific fields. Most carry no
 * `message`, so the sentence is built here from the type (confirmed by the backend).
 */
export type ApiWarning = { type: string; message?: string } & Record<
  string,
  unknown
>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/** Reads a `warnings` array: objects with a `type`, or a bare string (kept as its own message). */
export function parseWarnings(raw: unknown): ApiWarning[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((w: unknown): ApiWarning[] => {
    if (typeof w === 'string') return w ? [{ type: 'MESSAGE', message: w }] : []
    if (!isRecord(w)) return []
    const message =
      typeof w.message === 'string' && w.message ? w.message : undefined
    const type = typeof w.type === 'string' && w.type ? w.type : 'UNKNOWN'
    return [{ ...w, type, message }]
  })
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : undefined
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v : undefined

// ponytail: the sentences are a draft (the spec gives none); the fields are the backend's.
const BUILDERS: Record<string, (w: ApiWarning) => string | undefined> = {
  PART_SHORTAGE: (w) => {
    const need = num(w.requiredCount)
    const have = num(w.assignedCount)
    const name = str(w.partName) ?? '일부'
    return need !== undefined && have !== undefined
      ? `${name} 파트가 ${Math.max(need - have, 0)}명 부족해요 (필요 ${need}명, 현재 ${have}명)`
      : `${name} 파트 인원이 부족해요`
  },
  PART_EXCESS: (w) => {
    const need = num(w.requiredCount)
    const have = num(w.assignedCount)
    const name = str(w.partName) ?? '일부'
    return need !== undefined && have !== undefined
      ? `${name} 파트가 ${Math.max(have - need, 0)}명 많아요 (필요 ${need}명, 현재 ${have}명)`
      : `${name} 파트 인원이 필요보다 많아요`
  },
  SONG_COUNT_EXCEEDED: (w) => {
    const count = num(w.songCount)
    const name = str(w.displayName) ?? '이 참여자'
    return count !== undefined
      ? `${name}님이 ${count}곡에 출연해요`
      : `${name}님의 출연 곡 수가 권장보다 많아요`
  },
  DUPLICATE_SONG: () => '같은 곡이 이미 있어요',
  PART_NOT_REGISTERED: () => '등록하지 않은 파트로 지정돼요',
  ASSIGNMENT_RELEASED: () => '담당 팀 배정과 곡 순서가 해제돼요',
  SCHEDULE_LINK_RELEASED: (w) => {
    const n = Array.isArray(w.scheduleIds) ? w.scheduleIds.length : undefined
    return n === undefined
      ? '연결된 일정이 해제돼요'
      : `연결된 일정 ${n}개가 해제돼요`
  },
  OVERLAP: (w) =>
    str(w.title)
      ? `'${str(w.title)}' 일정과 시간이 겹쳐요`
      : '다른 일정과 시간이 겹쳐요',
  OVERLAP_OTHER_CLUB: () => '다른 동아리 일정과 겹쳐요',
}

export const GENERIC_WARNING = '확인이 필요한 항목이 있어요'

/** The sentence of a warning: the server's `message` when it has one, else built from `type`. */
export function warningText(w: ApiWarning): string {
  return w.message ?? BUILDERS[w.type]?.(w) ?? GENERIC_WARNING
}
