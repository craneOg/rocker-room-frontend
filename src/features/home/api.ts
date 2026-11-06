import { api } from '../../shared/api/client'

// API-137 / 135 / 136 (Notion API spec; confirmed, not yet implemented on the server).
export type HomeBanner =
  | { type: 'CLUB_INACTIVE' }
  | { type: 'MEMBER_GRADUATED' }
  | {
      type: 'PERFORMANCE_FINISH_DUE'
      performanceId: string
      performanceName: string
      performanceDate: string
    }

export type HomeTodoType =
  | 'PARTICIPATION_APPLY'
  | 'SONG_PROPOSE'
  | 'PLAYABILITY'
  | 'VOTE'
  | 'AVAILABILITY'
  | 'TEAM_SUBMIT'

export type HomeTodo = {
  type: HomeTodoType
  performanceId: string
  performanceName: string
  /** Display text from the server, e.g. "투표 (선택 0/3곡)". */
  label: string
  /** Only TEAM_SUBMIT: the draft team. */
  teamId: string | null
  /** Null = no deadline (listed last). */
  deadline: string | null
}

export type HomeSchedule = {
  scheduleId: string
  performanceId: string
  startAt: string
  endAt: string
  /** PRACTICE / REHEARSAL / AUDITION / ETC */
  type: string
  title: string
  performanceName: string
  location: string | null
}

export type HomePerformance = {
  performanceId: string
  name: string
  /** ACTIVE / LOCKED */
  status: string
  /** "YYYY-MM-DD" */
  performanceDate: string
  /** APPLIED / APPROVED */
  myStatus: string
  teamNames: string[]
  songCount: number
}

export type HomeData = {
  banners: HomeBanner[]
  todos: HomeTodo[]
  upcomingSchedules: HomeSchedule[]
  myPerformances: HomePerformance[]
}

export type SuccessionNotice = {
  id: string
  /** ADMIN: became club admin. TEAM_LEADER: became leader of a team in a running performance. */
  type: 'ADMIN' | 'TEAM_LEADER'
  clubId: string
  clubName: string
  teamName: string | null
  performanceName: string | null
}

export const getHome = (clubId: string) =>
  api.get<HomeData>(`/api/v1/clubs/${clubId}/home`)

export const getSuccessionNotices = async () =>
  (
    await api.get<{ items: SuccessionNotice[] }>(
      '/api/v1/me/succession-notices',
    )
  ).items

/** Irreversible; confirming twice is fine (200 both times). */
export const confirmSuccessionNotice = (id: string) =>
  api.post<unknown>(`/api/v1/me/succession-notices/${id}/confirm`)
