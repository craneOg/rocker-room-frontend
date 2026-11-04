import { API_PATHS } from '../../shared/api/assumptions'
import { api } from '../../shared/api/client'

// Assumed shapes (see shared/api/assumptions.ts); IDs are strings, times ISO-8601.
export type Me = {
  id: string
  onboardingRequired: boolean
  isSuperAdmin: boolean
}

export type Membership = {
  clubId: string
  /** ERD: CLUB_ADMIN / MEMBER */
  role: 'CLUB_ADMIN' | 'MEMBER'
  /** ERD: PENDING / INVITED / ACTIVE / ON_LEAVE / ... */
  status: string
}

export const getMe = () => api.get<Me>(API_PATHS.me)
export const getMemberships = () => api.get<Membership[]>(API_PATHS.memberships)
