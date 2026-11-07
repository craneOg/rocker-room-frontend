import { api } from '../../shared/api/client'
import type {
  PerformanceDetail,
  PerformancePage,
  PerformanceStatus,
} from './types'

export const PERFORMANCE_PAGE_SIZE = 20

export type PerformanceSort =
  'performDate,asc' | 'performDate,desc' | 'createdAt,desc'

/** API-037. `status` is sent as a comma list; null-date performances come last on the server. */
export const listPerformances = (
  clubId: string,
  filter: { status?: PerformanceStatus[]; sort?: PerformanceSort },
  page: number,
  signal?: AbortSignal,
) =>
  api.get<PerformancePage>(`/api/v1/clubs/${clubId}/performances`, {
    query: {
      status: filter.status?.join(','),
      sort: filter.sort,
      page,
      size: PERFORMANCE_PAGE_SIZE,
    },
    signal,
  })

/** API-039. */
export const getPerformance = (clubId: string, performanceId: string) =>
  api.get<PerformanceDetail>(
    `/api/v1/clubs/${clubId}/performances/${performanceId}`,
  )

/** Query key of one performance; writes invalidate this prefix to refresh every screen at once. */
export const performanceKey = (clubId: string, performanceId: string) =>
  ['club', clubId, 'performance', performanceId] as const
