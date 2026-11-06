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
