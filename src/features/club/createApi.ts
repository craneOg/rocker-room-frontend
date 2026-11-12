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

/** API-126 (BE confirmed): login required; blank or over 100 chars is 400. A hint only, API-011's 409 decides. */
export const checkClubName = (
  name: string,
  signal?: AbortSignal,
  /** Renaming (API-016): the club itself does not count as a duplicate. */
  excludeClubId?: string,
) =>
  api.get<{ available: boolean }>('/api/v1/clubs/name-availability', {
    query: { name, excludeClubId },
    signal,
  })

/** API-129 response. `imageKey` goes to API-011; `previewUrl` is for display. */
export type ClubImageUpload = { imageKey: string; previewUrl: string }

/** API-129 (BE confirmed): same endpoint as the user photo, `purpose=CLUB_PROFILE`; jpeg/png/webp, 2MiB or less. */
export const uploadClubImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', 'CLUB_PROFILE')
  return api.post<ClubImageUpload>(API_PATHS.profileImage, form)
}
