import { api } from '../../shared/api/client'

// API-134 (preview, no changes) and API-009 (withdrawal). The server answers a withdrawal without
// `confirmed` with 409 CONFIRMATION_REQUIRED; this screen reads the same figures from 134.
const PATH = '/api/v1/me/withdrawal'

export type Candidate = { membershipId: string; displayName: string }

export type ClubSuccession = {
  /** DESIGNATED_OR_EARLIEST: pick a successor; NOT_REQUIRED: other officers exist; NONE: no candidate. */
  type: 'DESIGNATED_OR_EARLIEST' | 'NOT_REQUIRED' | 'NONE'
  candidateUserId: string | null
  candidates: (Candidate & { userId: string })[]
}

export type TeamTransfer = {
  teamId: string
  teamName: string
  performanceName: string
  /** APPROVED: pick; SUBMITTED: automatic; DRAFT: deleted. */
  teamStatus: 'APPROVED' | 'SUBMITTED' | 'DRAFT'
  defaultMembershipId: string | null
  candidates: Candidate[]
}

export type WithdrawalClub = {
  clubId: string
  clubName: string
  role: string
  succession: ClubSuccession
  teamLeaderTransfers: TeamTransfer[]
}

export type WithdrawalPreview = { clubs: WithdrawalClub[] }

export const getWithdrawalPreview = () =>
  api.get<WithdrawalPreview>(`${PATH}-preview`)

export type WithdrawalBody = {
  successors: { clubId: string; userId: string }[]
  teamLeaderSuccessors: { teamId: string; membershipId: string }[]
  confirmed: true
}

/** API-009 response (BE-confirmed): KST ISO-8601 times; `successions` is not used by the screen. */
export type WithdrawalResult = {
  withdrawnAt: string
  /** `withdrawnAt` + 90 days: the account can be restored until then (same field as API-131). */
  restorableUntil: string
}

export const withdrawService = (body: WithdrawalBody) =>
  api.post<WithdrawalResult>(PATH, body)
