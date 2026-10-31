import { useQuery } from '@tanstack/react-query'
import { createContext, use, useEffect, type ReactNode } from 'react'
import {
  getMe,
  getMemberships,
  type Me,
  type Membership,
} from '../../features/auth/api'
import { setSignedIn } from '../api/client'

export type Session = {
  status: 'loading' | 'anonymous' | 'authenticated'
  me?: Me
  memberships: Membership[]
}

const SessionContext = createContext<Session>({
  status: 'loading',
  memberships: [],
})

const ACTIVE_STATUSES = ['ACTIVE', 'ON_LEAVE']

export const isClubMember = (s: Session, clubId: string) =>
  s.memberships.some(
    (m) => m.clubId === clubId && ACTIVE_STATUSES.includes(m.status),
  )

export const isClubAdmin = (s: Session, clubId: string) =>
  s.memberships.some(
    (m) =>
      m.clubId === clubId && m.role === 'CLUB_ADMIN' && m.status === 'ACTIVE',
  )

export function SessionProvider({ children }: { children: ReactNode }) {
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: 60_000,
  })
  const signedIn = meQuery.isSuccess
  const membershipsQuery = useQuery({
    queryKey: ['me', 'memberships'],
    queryFn: getMemberships,
    enabled: signedIn,
  })

  useEffect(() => setSignedIn(signedIn), [signedIn])

  const session: Session = meQuery.isPending
    ? { status: 'loading', memberships: [] }
    : signedIn
      ? membershipsQuery.isPending
        ? { status: 'loading', me: meQuery.data, memberships: [] }
        : {
            status: 'authenticated',
            me: meQuery.data,
            memberships: membershipsQuery.data ?? [],
          }
      : { status: 'anonymous', memberships: [] }

  return <SessionContext value={session}>{children}</SessionContext>
}

export const useSession = () => use(SessionContext)
