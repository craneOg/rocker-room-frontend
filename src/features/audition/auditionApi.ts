import { api } from '../../shared/api/client'
import { performanceKey } from '../performance/api'

// API-147 / 148 / 149 / 150 (Notion API spec) plus the reads behind the AUDI-002 pickers
// (API-075 songs, API-105 schedules). IDs and versions are strings.
const perfPath = (clubId: string, performanceId: string) =>
  `/api/v1/clubs/${clubId}/performances/${performanceId}`

export type AuditionType = 'SONG' | 'SESSION'
export type AuditionResult = 'PASSED' | 'FAILED'
export type AuditionTab = 'PENDING' | 'DONE'
/** PROPOSED / CONFIRMED matter here; REJECTED and WITHDRAWN cannot be audited (A-03). */
export type SongStatus = 'PROPOSED' | 'CONFIRMED' | (string & {})

/** Item of API-147. A pending item has null result, comment and judge fields. */
export type Audition = {
  id: string
  type: AuditionType
  songId: string
  songTitle: string
  songStatus: SongStatus
  partId: string | null
  partName: string | null
  applicantPerformanceMemberId: string | null
  applicantName: string | null
  candidateTeamName: string | null
  linkedScheduleId: string | null
  scheduledAt: string | null
  memo: string | null
  result: AuditionResult | null
  comment: string | null
  judgedBy: string | null
  judgedByName: string | null
  judgedAt: string | null
  version: string
  createdAt: string
}

export type AuditionPage = {
  items: Audition[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  /** The pending count under the type / song / schedule filters, whatever the tab. */
  pendingCount: number
}

export type AuditionFilter = {
  tab: AuditionTab
  type?: AuditionType
  songId?: string
  scheduleId?: string
}

export const AUDITION_PAGE_SIZE = 20

/** Prefix of every audition query of one performance (writes invalidate performanceKey). */
export const auditionKey = (clubId: string, performanceId: string) =>
  [...performanceKey(clubId, performanceId), 'auditions'] as const

/** API-147. */
export const listAuditions = (
  clubId: string,
  performanceId: string,
  filter: AuditionFilter,
  page: number,
  size = AUDITION_PAGE_SIZE,
  signal?: AbortSignal,
) =>
  api.get<AuditionPage>(`${perfPath(clubId, performanceId)}/auditions`, {
    query: {
      tab: filter.tab,
      type: filter.type,
      songId: filter.songId || undefined,
      scheduleId: filter.scheduleId || undefined,
      page,
      size,
    },
    signal,
  })

/**
 * AUDI-003 has no single-read API (requested from the server): the target is found by paging
 * through both tabs, 100 rows a page.
 */
export const findAudition = async (
  clubId: string,
  performanceId: string,
  auditionId: string,
) => {
  for (const tab of ['PENDING', 'DONE'] as const) {
    let page = 0
    let totalPages = 1
    while (page < totalPages) {
      const r = await listAuditions(clubId, performanceId, { tab }, page, 100)
      const found = r.items.find((a) => a.id === auditionId)
      if (found) return found
      totalPages = r.totalPages
      page += 1
    }
  }
  return null
}

/** Body of API-148. A song audition sends neither `partId` nor applicants (A-02). */
export type AuditionCreate = {
  type: AuditionType
  songId: string
  partId?: string
  applicantPerformanceMemberIds?: string[]
  linkedScheduleId?: string
  memo?: string
}

/** API-148: one row for a song audition, one per applicant for a session audition (all or none). */
export const createAuditions = (
  clubId: string,
  performanceId: string,
  body: AuditionCreate,
) =>
  api.post<{ items: { id: string; version: string }[] }>(
    `${perfPath(clubId, performanceId)}/auditions`,
    body,
  )

/** Response of API-149: what the 4-1 follow-up needs. */
export type AuditionSaved = {
  id: string
  type: AuditionType
  songId: string
  songStatus: SongStatus
  partId: string | null
  partName: string | null
  applicantPerformanceMemberId: string | null
  applicantName: string | null
  result: AuditionResult
  comment: string | null
  judgedBy: string
  judgedByName: string
  judgedAt: string
  version: string
}

/** API-149. `reason` is required while the performance is LOCKED (X-02). */
export const saveAuditionResult = (
  clubId: string,
  performanceId: string,
  auditionId: string,
  body: {
    result: AuditionResult
    comment: string | null
    reason?: string
    version: string
  },
) =>
  api.put<AuditionSaved>(
    `${perfPath(clubId, performanceId)}/auditions/${auditionId}/result`,
    body,
  )

/** Item of API-150: the requester's own audition. */
export type MyAudition = {
  id: string
  clubId: string
  performanceId: string
  type: AuditionType
  songId: string
  songTitle: string
  partId: string | null
  partName: string | null
  scheduledAt: string | null
  result: AuditionResult | null
  comment: string | null
  judgedAt: string | null
  isLatest: boolean
}

/** API-150 is not under a performance: both ids are filters. All items come back, no paging. */
export const listMyAuditions = async (clubId: string, performanceId: string) =>
  (
    await api.get<{ items: MyAudition[] }>('/api/v1/me/auditions', {
      query: { clubId, performanceId },
    })
  ).items

export type SongOption = {
  id: string
  title: string
  artist: string
  status: SongStatus
}

/** API-075 reduced to the candidate and confirmed songs a picker offers (A-03). */
export const listAuditableSongs = async (
  clubId: string,
  performanceId: string,
) =>
  (
    await api.get<{ items: SongOption[] }>(
      `${perfPath(clubId, performanceId)}/songs`,
      {
        query: {
          status: 'PROPOSED,CONFIRMED',
          sort: 'title,asc',
          page: 0,
          size: 100,
        },
      },
    )
  ).items

export type ScheduleOption = {
  id: string
  title: string
  status: string
  startAt: string
}

const DAY = 86_400_000

/**
 * API-105 requires a window; ponytail: from 30 days ago to one year ahead, audition schedules
 * only; the server's limit on this window is unconfirmed (서버 미확인). Widen it (or page) if a
 * performance plans further out.
 */
export const listAuditionSchedules = async (
  clubId: string,
  performanceId: string,
) => {
  const now = Date.now()
  const r = await api.get<{ items: ScheduleOption[] }>(
    `${perfPath(clubId, performanceId)}/schedules`,
    {
      query: {
        from: new Date(now - 30 * DAY).toISOString(),
        to: new Date(now + 365 * DAY).toISOString(),
        eventType: 'AUDITION',
        sort: 'startAt,asc',
        page: 0,
        size: 100,
      },
    },
  )
  return r.items.filter((s) => s.status !== 'CANCELED')
}
