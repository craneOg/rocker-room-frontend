import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { PolicyDraft, Preset } from './presets'
import type { Performance } from './types'

const base = (clubId: string) => `/api/v1/clubs/${clubId}/performances`

export type BasicInfo = {
  title: string
  /** yyyy-MM-dd, or null while undecided. */
  performDate: string | null
  location: string | null
}

export type CreateBody = BasicInfo & {
  preset: Preset
  /** Sent only for CUSTOM; a fixed preset leaves the policy to the server (API-038). */
  policy?: PolicyDraft
}

/** API-038. */
export const createPerformance = (clubId: string, body: CreateBody) =>
  api.post<Performance>(base(clubId), body)

export type UpdateBody = Partial<BasicInfo> & {
  /** The version received when the screen opened (optimistic lock, API-040). */
  version: string
  /** Required while the performance is LOCKED. */
  reason?: string
}

/** API-040; the response carries `warnings` (F-06), shown by the global handler. */
export const updatePerformance = (
  clubId: string,
  performanceId: string,
  body: UpdateBody,
) => api.patch<Performance>(`${base(clubId)}/${performanceId}`, body)

/** Refreshes every performance list and detail of the club after a write. */
export const invalidatePerformances = (
  queryClient: QueryClient,
  clubId: string,
) =>
  queryClient.invalidateQueries({
    predicate: ({ queryKey: k }) =>
      k[0] === 'club' &&
      k[1] === clubId &&
      typeof k[2] === 'string' &&
      k[2].startsWith('performance'),
  })
