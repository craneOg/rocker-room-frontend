import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'
import { performanceKey } from './api'
import type { Performance, PerformancePolicy } from './types'

// PERF-004 / PERF-005 write APIs (042-049, 051, 151, 152) and the readers 043 / 052.
const perfPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}`

/** The editable policy fields; `voteMethod` has its own API (043 / 044). */
export type PolicyPatch = Partial<
  Omit<
    PerformancePolicy,
    'performanceId' | 'performanceVersion' | 'updatedAt' | 'voteMethod'
  >
>

export type Warning = string | { message: string; affectedCount?: number }

/** API-042. Only the changed fields are sent, next to the performance version. */
export const updatePolicy = (
  clubId: string,
  performanceId: string,
  version: string,
  patch: PolicyPatch,
) =>
  api.patch<{ policy: PerformancePolicy; warnings: Warning[] }>(
    `${perfPath(clubId, performanceId)}/policy`,
    { version, ...patch },
  )

/** API-043: no change is made; the warnings carry the number of votes a change would delete. */
export const validateVoteMethod = (
  clubId: string,
  performanceId: string,
  version: string,
  voteMethod: string,
) =>
  api.post<{ hardErrors: unknown[]; warnings: Warning[] }>(
    `${perfPath(clubId, performanceId)}/policy/vote-method/validate`,
    { version, voteMethod },
  )

/** API-044: `reason` is required (the policy screen asks for it when the method changes). */
export const changeVoteMethod = (
  clubId: string,
  performanceId: string,
  body: {
    version: string
    voteMethod: string
    confirmed: boolean
    reason: string
  },
) =>
  api.put<{ policy: PerformancePolicy; removedVoteCount: number }>(
    `${perfPath(clubId, performanceId)}/policy/vote-method`,
    body,
  )

/** Deleted votes of a method change: the `affectedCount` of API-043's warnings. */
export const affectedVoteCount = (warnings: Warning[]) =>
  warnings.reduce(
    (sum, w) => sum + (typeof w === 'object' ? (w.affectedCount ?? 0) : 0),
    0,
  )

export type StatusAction =
  | 'activate'
  | 'finish'
  | 'reopen'
  | 'cancel'
  | 'restore'
  | 'revert-to-draft'
  | 'revert-to-locked'

/**
 * API-045..049, 151, 152. 151 / 152 take no version (their spec has none); 151's reason is optional.
 * 045 / 047 take an optional reason that no screen asks for.
 */
/** 422 MEMBER_INPUT_EXISTS of 151 as an own error (so the global rule dialog stays out); `items` are the per-kind counts. */
export class MemberInputExistsError extends Error {
  readonly items: string[]
  constructor(items: string[]) {
    super('member input exists')
    this.name = 'MemberInputExistsError'
    this.items = items
  }
}

export const changeStatus = async (
  clubId: string,
  performanceId: string,
  action: StatusAction,
  version: string,
  reason?: string,
) => {
  const body =
    action === 'revert-to-draft'
      ? {}
      : action === 'revert-to-locked'
        ? { reason }
        : { version, ...(reason === undefined ? {} : { reason }) }
  try {
    return await api.post<Pick<Performance, 'id' | 'status' | 'version'>>(
      `${perfPath(clubId, performanceId)}/${action}`,
      body,
    )
  } catch (e) {
    if (
      isApiError(e, 'RULE_VIOLATION') &&
      e.details.some((d) => d.reason === 'MEMBER_INPUT_EXISTS')
    )
      // ponytail: the counts' wire shape is unknown; each detail's `message` is shown as a row.
      throw new MemberInputExistsError(
        e.details.flatMap((d) => (d.message ? [d.message] : [])),
      )
    throw e
  }
}

/** API-051. `confirmed: true` is sent after the screen's own confirmation (3-1) showed the warnings. */
export const lockPerformance = (
  clubId: string,
  performanceId: string,
  version: string,
) =>
  api.post<{ resource: Performance; warnings: Warning[] }>(
    `${perfPath(clubId, performanceId)}/lock`,
    { version, confirmed: true },
  )

export type CheckResult = 'SATISFIED' | 'UNMET' | 'WARNING'
export type ChecklistItem = {
  checkId: string
  result: CheckResult
  type?: string
  message: string
  targetType?: string
  targetId?: string
}

export const warningsKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'warnings'] as const

/** API-052: the L-01..L-11 checklist. */
export const getChecklist = (clubId: string, performanceId: string) =>
  api.get<{ items: ChecklistItem[] }>(
    `${perfPath(clubId, performanceId)}/warnings`,
  )

/** Refreshes every screen of the performance, the home (banner, counts) and the club's list. */
export const invalidatePerformance = (
  queryClient: QueryClient,
  clubId: string,
  performanceId: string,
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: performanceKey(clubId, performanceId),
    }),
    queryClient.invalidateQueries({ queryKey: ['home', clubId] }),
    queryClient.invalidateQueries({
      queryKey: ['club', clubId, 'performances'],
    }),
  ])
