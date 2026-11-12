import { API_PATHS } from '../../shared/api/assumptions'
import { api } from '../../shared/api/client'
import { isApiError } from '../../shared/api/errors'
import type { ClubDetail } from './api'
import { ClubNameTakenError } from './manageApi'

// CLUB-001. Confirmed by the backend for API-011: the creator becomes an ACTIVE REGULAR
// CLUB_ADMIN, the default parts are created, the name is unique ignoring case and spaces
// (409 DUPLICATE / CLUB_NAME_TAKEN), `profileImageKey` must be the caller's own API-129
// (purpose=CLUB_PROFILE) key (else 404 IMAGE_KEY_NOT_FOUND), `themeColor` is #RRGGBB upper case,
// and `issueJoinCode: true` puts `joinCode` in the response.

export type CreateClubBody = {
  name: string
  description?: string
  clubType: 'CLUB' | 'BAND'
  isSearchable: boolean
  issueJoinCode: boolean
  profileImageKey?: string
  themeColor?: string
}

// Response (201) per the backend: the club detail plus `joinCode`, `createdByUserId`.
export type CreatedClub = ClubDetail & {
  joinCode?: string | null
  createdByUserId?: string
}

export const createClub = async (body: CreateClubBody) => {
  try {
    return await api.post<CreatedClub>('/api/v1/clubs', body)
  } catch (e) {
    if (
      isApiError(e, 'DUPLICATE') &&
      e.details.some((d) => d.reason === 'CLUB_NAME_TAKEN')
    )
      throw new ClubNameTakenError()
    throw e
  }
}

// ponytail: API-126 (club name availability) path and response are not in the spec we have;
// modelled on the handle check (`{ available }`).
export const checkClubName = (name: string, signal?: AbortSignal) =>
  api.get<{ available: boolean }>('/api/v1/clubs/name-availability', {
    query: { name },
    signal,
  })

/** API-129 response. `imageKey` goes to API-011; `previewUrl` is for display. */
export type ClubImageUpload = { imageKey: string; previewUrl: string }

// ponytail: assumed to be the user photo endpoint plus a `purpose` form field; the spec only says
// "club-only upload (CLUB-10)" and the backend said purpose=CLUB_PROFILE.
export const uploadClubImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', 'CLUB_PROFILE')
  return api.post<ClubImageUpload>(API_PATHS.profileImage, form)
}
