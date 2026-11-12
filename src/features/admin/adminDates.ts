import { ADMIN_COPY as T } from './adminCopy'

const KST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Seoul' }

/** `2026. 11. 12.`, or a dash when there is none. */
export const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ko-KR', KST) : T.never

export const dateTimeText = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { ...KST, hour12: false })
