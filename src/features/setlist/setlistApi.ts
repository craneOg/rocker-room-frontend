import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'
import { performanceKey } from '../performance/api'

// API-087 (read) and API-088 (save the whole order). The final confirmation (API-050 / 051) is
// PERF-005's `lock` flow in features/performance and is not repeated here.
const perfPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}`

export type SetlistSong = {
  id: string
  performanceId: string
  title: string
  artist: string
  status: string
  assignedTeamId: string | null
  assignedTeamName: string | null
  /** null = confirmed song without a place in the setlist. */
  setlistOrder: number | null
  /** The song's optimistic-lock version. */
  version: string
}

export type SetlistSession = {
  performanceMemberId: string
  partId: string
  displayName: string
}

export type SetlistEntry = { song: SetlistSong; sessions: SetlistSession[] }

export type Setlist = { items: SetlistEntry[]; performanceVersion: string }

export const setlistKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'setlist'] as const

export const getSetlist = (clubId: string, performanceId: string) =>
  api.get<Setlist>(`${perfPath(clubId, performanceId)}/setlist`)

export type OrderItem = {
  songId: string
  order: number | null
  version: string
}

/** 409 STATE_CONFLICT(SETLIST_CHANGED) as an own error, so 4-2 replaces the global dialog. */
export class SetlistChangedError extends Error {
  constructor() {
    super('setlist changed')
    this.name = 'SetlistChangedError'
  }
}

/** API-088. `reason` is required while the performance is LOCKED. */
export async function saveSetlistOrder(
  clubId: string,
  performanceId: string,
  body: { version: string; items: OrderItem[]; reason?: string },
) {
  try {
    return await api.put<{ performanceVersion: string }>(
      `${perfPath(clubId, performanceId)}/setlist/order`,
      body,
    )
  } catch (e) {
    if (
      isApiError(e, 'STATE_CONFLICT') &&
      e.details.some((d) => d.reason === 'SETLIST_CHANGED')
    )
      throw new SetlistChangedError()
    throw e
  }
}
