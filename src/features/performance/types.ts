/** Shared shapes of the performance APIs (API-037, API-039); the E-stage screens build on these. */

export type PerformanceStatus =
  'DRAFT' | 'ACTIVE' | 'LOCKED' | 'FINISHED' | 'CANCELED'

/** The preset names in the API examples; an unknown value is shown as it is. */
export type PerformancePreset = 'TEAM_FIRST' | (string & {})

export type ParticipationStatus =
  'APPLIED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'

export type FeatureState = 'OPEN' | 'CLOSED' | (string & {})

export type Performance = {
  id: string
  clubId: string
  title: string
  /** yyyy-MM-dd; null when the date is not decided yet. */
  performDate: string | null
  location: string | null
  preset: PerformancePreset
  status: PerformanceStatus
  createdByUserId: string
  /** The optimistic-lock version (a string). */
  version: string
  createdAt: string
  updatedAt: string
}

export type OpenFeatureName =
  | 'APPLICATION'
  | 'TEAM_APPLICATION'
  | 'CANDIDATE'
  | 'PLAYABILITY'
  | 'VOTE'
  | 'AVAILABILITY'

/** A list item adds the requester's own participation and at most two open features. */
export type PerformanceListItem = Performance & {
  myParticipationStatus: ParticipationStatus | null
  openFeatures: { feature: OpenFeatureName; deadlineAt: string | null }[]
}

export type PerformancePage = {
  items: PerformanceListItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type PerformancePolicy = {
  performanceId: string
  performanceVersion: string
  applicationState: FeatureState
  applicationDeadline: string | null
  candidateState: FeatureState
  candidateDeadline: string | null
  playabilityState: FeatureState
  playabilityDeadline: string | null
  voteState: FeatureState
  voteDeadline: string | null
  teamApplicationState: FeatureState
  teamApplicationDeadline: string | null
  availabilityState: FeatureState
  availabilityDeadline: string | null
  candidateScope: string
  candidateLimitPerMember: number | null
  voteMethod: string
  voteMaxChoices: number | null
  playabilityResultPublic: boolean
  voteResultPublic: boolean
  /** yyyy-MM-dd; required while availability is OPEN (F-04). */
  practiceSeasonStart: string | null
  practiceSeasonEnd: string | null
  maxSongsPerMember: number | null
  updatedAt: string
}

/** `counts` and `nextSchedule` are left out for a guest member. */
export type PerformanceDetail = {
  performance: Performance
  policy: PerformancePolicy
  counts?: {
    teams: number
    candidateSongs: number
    confirmedSongs: number
    participants: number
  }
  nextSchedule?: { id: string; title: string; startAt: string } | null
}
