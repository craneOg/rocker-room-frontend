import { api } from '../../shared/api/client'

// API-141 / 118 / 122 / 123 / 125 (server DTOs, implemented). IDs are strings, times ISO-8601.
export type Paged<T> = {
  items: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type OverviewTrendPoint = {
  date: string
  newUsers: number
  newClubs: number
  newPerformances: number
  newSchedules: number
}
export type Overview = {
  periodDays: number
  metrics: {
    activeClubs: number
    totalUsers: number
    activeUsers30d: number
    ongoingPerformances: number
  }
  trend: OverviewTrendPoint[]
  joinStatus: {
    requested: number
    approved: number
    rejected: number
    invited: number
    invitationAccepted: number
    invitationExpired: number
  }
  /** `reason`: NO_ADMIN or ADMIN_INACTIVE_180D (BE-confirmed); an unknown one is shown as it is. */
  attention: {
    clubId: string
    clubName: string
    reason: string
    lastAdminActiveAt: string | null
  }[]
}

export const getOverview = (periodDays: number) =>
  api.get<Overview>('/api/v1/admin/overview', { query: { periodDays } })

export type AdminClub = {
  id: string
  name: string
  clubType: string
  status: 'ACTIVE' | 'INACTIVE'
  activeMemberCount: number
  adminCount: number
  lastActiveAt: string | null
  ongoingPerformanceCount: number
  createdAt: string
}
export type AdminClubFilter = {
  q: string
  status: '' | 'ACTIVE' | 'INACTIVE'
  noAdmin: boolean
  inactiveOver180Days: boolean
}

export const listAdminClubs = (
  f: AdminClubFilter,
  page: number,
  signal?: AbortSignal,
) =>
  api.get<Paged<AdminClub>>('/api/v1/admin/clubs', {
    query: {
      q: f.q || undefined,
      status: f.status || undefined,
      noAdmin: f.noAdmin || undefined,
      inactiveOver180Days: f.inactiveOver180Days || undefined,
      page,
      size: 20,
    },
    signal,
  })

// API-119 (server DTO, implemented). `joinCode` itself is never sent.
export type AdminClubDetail = {
  club: {
    id: string
    name: string
    description: string | null
    clubType: 'CLUB' | 'BAND'
    status: 'ACTIVE' | 'INACTIVE'
    isSearchable: boolean
    createdByUserId: string
    createdAt: string
    updatedAt: string
  }
  /** BE has not confirmed the value for a creator without an account or a withdrawn one: null is allowed. */
  creator: { userId: string; name: string } | null
  joinCodeEnabled: boolean
  admins: {
    membershipId: string
    userId: string
    displayName: string
    handle: string
    status: 'ACTIVE' | 'ON_LEAVE' | 'GRADUATED'
    lastActiveAt: string | null
  }[]
  counts: {
    members: number
    performances: number
    memberStatus: {
      active: number
      onLeave: number
      graduated: number
      guests: number
    }
    performanceStatus: {
      draft: number
      active: number
      locked: number
      finished: number
      canceled: number
    }
  }
  lastActiveAt: string | null
}

export const getAdminClub = (clubId: string, signal?: AbortSignal) =>
  api.get<AdminClubDetail>(`/api/v1/admin/clubs/${clubId}`, { signal })

// API-120 / 121 (deactivate, reactivate).
export const deactivateClub = (clubId: string, reason: string) =>
  api.post<unknown>(`/api/v1/admin/clubs/${clubId}/deactivate`, { reason })

/** 409 CONFIRMATION_REQUIRED (NO_CLUB_ADMIN) when an inactive club without officers is reactivated unconfirmed. */
export const reactivateClub = (
  clubId: string,
  reason: string,
  confirmed: boolean,
) =>
  api.post<unknown>(`/api/v1/admin/clubs/${clubId}/reactivate`, {
    reason,
    confirmed: confirmed || undefined,
  })

// ponytail: API-121 emergency replacement is not implemented on the server; the path and the
// body (`successorMembershipId`) are guesses (tmp/backend-questions.md, SADM-003). Fix when BE answers.
export const replaceClubAdmin = (
  clubId: string,
  reason: string,
  successorMembershipId: string,
) =>
  api.post<unknown>(`/api/v1/admin/clubs/${clubId}/replace-admin`, {
    reason,
    successorMembershipId,
  })

export type AdminUser = {
  id: string
  name: string
  handle: string
  profileImageUrl: string | null
  status: string
  isSuperAdmin: boolean
  lastActiveAt: string | null
  kakaoLinked: boolean
  createdAt: string
  clubs: {
    clubId: string
    name: string
    role: string
    membershipStatus: string
    joinSource: string | null
  }[]
}

/** Exact search by `@handle` or by user ID. */
export const findAdminUsers = (
  by: { handle: string } | { userId: string },
  signal?: AbortSignal,
) =>
  api
    .get<Paged<AdminUser>>('/api/v1/admin/users', {
      query: { ...by, page: 0, size: 20 },
      signal,
    })
    .then((r) => r.items)

export const forceLogout = (userId: string, reason: string) =>
  api.post<{ userId: string; revoked: boolean }>(
    `/api/v1/admin/users/${userId}/force-logout`,
    { reason },
  )

export type AuditLog = {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  actorUserId: string | null
  clubId: string | null
  reason: string | null
  detail: Record<string, unknown>
  createdAt: string
}
export type AuditFilter = {
  clubId: string
  actorUserId: string
  action: string
  from: string
  to: string
}

export const listAuditLogs = (
  f: AuditFilter,
  page: number,
  signal?: AbortSignal,
) =>
  api.get<Paged<AuditLog>>('/api/v1/admin/audit-logs', {
    query: {
      clubId: f.clubId || undefined,
      actorUserId: f.actorUserId || undefined,
      action: f.action || undefined,
      from: f.from ? `${f.from}T00:00:00+09:00` : undefined,
      to: f.to ? `${f.to}T23:59:59+09:00` : undefined,
      page,
      size: 50,
    },
    signal,
  })
