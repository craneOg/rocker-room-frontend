import { useQuery } from '@tanstack/react-query'
import { createContext, use, useEffect, type ReactNode } from 'react'
import {
  getMe,
  getMemberships,
  type Me,
  type Membership,
} from '../../features/auth/api'
import { setSignedIn } from '../api/client'
import { isApiError } from '../api/errors'

export type Session = {
  /** `error`: /me or the memberships failed for a reason other than authentication. */
  status: 'loading' | 'anonymous' | 'authenticated' | 'error'
  me?: Me
  memberships: Membership[]
}

const SessionContext = createContext<Session>({
  status: 'loading',
  memberships: [],
})

// G-05: graduated members keep read access.
const CLUB_ACCESS_STATUSES = ['ACTIVE', 'ON_LEAVE', 'GRADUATED']
// ON_LEAVE has the same rights as ACTIVE; graduating removes the admin role.
const CLUB_ADMIN_STATUSES = ['ACTIVE', 'ON_LEAVE']

export const isClubMember = (s: Session, clubId: string) =>
  s.memberships.some(
    (m) => m.clubId === clubId && CLUB_ACCESS_STATUSES.includes(m.status),
  )

export const isClubAdmin = (s: Session, clubId: string) =>
  s.memberships.some(
    (m) =>
      m.clubId === clubId &&
      m.role === 'CLUB_ADMIN' &&
      CLUB_ADMIN_STATUSES.includes(m.status),
  )

export function SessionProvider({ children }: { children: ReactNode }) {
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: 60_000,
  })
  // Only a 401 ends the session: a failed refetch keeps the data it already has.
  const unauthenticated =
    isApiError(meQuery.error) && meQuery.error.status === 401
  const signedIn = meQuery.data !== undefined && !unauthenticated
  const membershipsQuery = useQuery({
    queryKey: ['me', 'memberships'],
    queryFn: getMemberships,
    enabled: signedIn,
  })

  useEffect(() => setSignedIn(signedIn), [signedIn])

  const session: Session = !signedIn
    ? unauthenticated
      ? { status: 'anonymous', memberships: [] }
      : { status: meQuery.isError ? 'error' : 'loading', memberships: [] }
    : membershipsQuery.data
      ? {
          status: 'authenticated',
          me: meQuery.data,
          memberships: membershipsQuery.data,
        }
      : {
          status: membershipsQuery.isError ? 'error' : 'loading',
          me: meQuery.data,
          memberships: [],
        }

  return <SessionContext value={session}>{children}</SessionContext>
}

export const useSession = () => use(SessionContext)
