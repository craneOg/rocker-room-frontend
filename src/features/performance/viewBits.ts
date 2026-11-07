import { formatDDay } from '../../shared/lib/time'
import { VIEW_COPY as T } from './viewCopy'

/** "2026.10.31 D-3", or "날짜 미정" while the date is not decided. */
export const performanceDate = (p: { performDate: string | null }): string =>
  p.performDate === null
    ? T.dateUndecided
    : `${p.performDate.replaceAll('-', '.')} ${formatDDay(p.performDate, Date.now())}`
