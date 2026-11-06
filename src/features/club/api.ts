import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'

// API-012 / 013 / 014 (Notion API spec; confirmed). IDs are strings.
export type ClubSummary = {
  id: string
  name: string
  description: string | null
  /** API example: "CLUB". Other values are unconfirmed; unknown ones are shown as they are. */
  clubType: string
  profileImageUrl: string | null
  themeColor: string | null
}

export type JoinPreview = {
  club: ClubSummary
  /** The caller's own membership status in this club, or null when there is none. */
  existingMembershipStatus: string | null
  canApply: boolean
}

export type ClubSearchPage = {
  items: JoinPreview[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export const SEARCH_PAGE_SIZE = 20

/**
 * The code goes in the body, never the URL (it is a credential). Every failure is 404, which
 * is an answer here ("invalid code"), not a missing page: null keeps the global 404 view away.
 */
export const resolveJoinCode = async (joinCode: string) => {
  try {
    return await api.post<JoinPreview>('/api/v1/clubs/join-code/resolve', {
      joinCode,
    })
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) return null
    throw e
  }
}

export const searchClubs = (q: string, page: number, signal?: AbortSignal) =>
  api.get<ClubSearchPage>('/api/v1/clubs/search', {
    query: { q, page, size: SEARCH_PAGE_SIZE, sort: 'name,asc' },
    signal,
  })

/**
 * 404 of a join request: the club or its code is gone (the code was re-issued, or the club was
 * deactivated). Being no ApiError, it stays out of the global handler's full-page 404 view.
 */
export class JoinTargetGoneError extends Error {
  constructor() {
    super('join target gone')
    this.name = 'JoinTargetGoneError'
  }
}

export const requestJoin = async (
  clubId: string,
  body: { source: 'JOIN_CODE'; joinCode: string } | { source: 'SEARCH' },
) => {
  try {
    return await api.post<unknown>(
      `/api/v1/clubs/${clubId}/join-requests`,
      body,
    )
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) throw new JoinTargetGoneError()
    throw e
  }
}

/** Normalizes input the way CLUB-002 specifies: no whitespace, upper case. */
export const normalizeJoinCode = (raw: string) =>
  raw.replace(/\s+/g, '').toUpperCase()

export const JOIN_CODE_PATTERN = /^[A-Z2-9]{10}$/

// API-015 / 020 / 021 / 033 (Notion API spec). IDs are strings, times ISO-8601 +09:00.
export type ClubDetail = ClubSummary & {
  status: 'ACTIVE' | 'INACTIVE'
  isSearchable: boolean
  createdAt: string
  updatedAt: string
}

export const getClub = (clubId: string) =>
  api.get<ClubDetail>(`/api/v1/clubs/${clubId}`)

export type MemberPart = {
  id: string
  name: string
  displayOrder: number
  /** false: shown as "(사용 중지)" (C-12). */
  isActive: boolean
}

/**
 * Item of API-020 / response of API-021. Regular members get the public subset: `status`,
 * `handle`, `joinSource` and `approvedAt` are absent for them (D-4), so they are optional.
 */
export type Member = {
  id: string
  displayName: string | null
  /** Service name; "탈퇴한 사용자" for a withdrawn user. */
  userName: string
  /** REGULAR / GUEST */
  memberType: string
  role: 'CLUB_ADMIN' | 'MEMBER'
  profileImageUrl: string | null
  parts: MemberPart[]
  handle?: string | null
  /** ACTIVE / ON_LEAVE / GRADUATED / WITHDRAWN, officers only. */
  status?: string
  joinSource?: string
  approvedAt?: string | null
}

export type MemberListPage = {
  items: Member[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type MemberFilter = {
  q?: string
  /** Officers only: a regular member sending it gets 403. */
  status?: string[]
  role?: 'CLUB_ADMIN'
  memberType?: string
  partIds?: string[]
}

export const MEMBER_PAGE_SIZE = 20

export const listMembers = (
  clubId: string,
  filter: MemberFilter,
  page: number,
  signal?: AbortSignal,
  size = MEMBER_PAGE_SIZE,
) =>
  api.get<MemberListPage>(`/api/v1/clubs/${clubId}/memberships`, {
    query: {
      q: filter.q || undefined,
      status: filter.status?.join(','),
      role: filter.role,
      memberType: filter.memberType,
      partId: filter.partIds?.length ? filter.partIds.join(',') : undefined,
      page,
      size,
    },
    signal,
  })

export type MemberPerformance = {
  id: string
  title: string
  status: 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'FINISHED' | 'CANCELED'
  participationStatus: 'APPLIED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
}

export type MemberDetail = Member & { performances: MemberPerformance[] }

export const getMember = (clubId: string, membershipId: string) =>
  api.get<MemberDetail>(`/api/v1/clubs/${clubId}/memberships/${membershipId}`)

export type ClubPart = MemberPart & { memberCount: number }

export const listParts = async (clubId: string) =>
  (await api.get<{ items: ClubPart[] }>(`/api/v1/clubs/${clubId}/parts`)).items
