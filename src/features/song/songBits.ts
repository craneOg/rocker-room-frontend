import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { warningsStore } from '../../shared/ui/feedbackBus'
import { getMember, listParts } from '../club/api'
import { getPerformance, performanceKey } from '../performance/api'
import { invalidatePerformance } from '../performance/policyApi'
import type { PerformancePolicy } from '../performance/types'
import {
  getMyParticipation,
  getTeamLite,
  listPerformanceMembers,
  type MyParticipation,
} from '../performance/viewApi'
import { SONG_COPY as T } from './songCopy'
import type { SongCard, SongStatus, Warning } from './songApi'
import type { SheetAction } from './SongSheets'

/** A feature is usable while OPEN and before its deadline (G-10). */
export const isOpen = (state: string, deadline: string | null) =>
  state === 'OPEN' && (deadline === null || Date.parse(deadline) > Date.now())

/**
 * Everything the song screens decide from: the performance (status, policy), the requester's own
 * participation and role, and the club parts. Shares the cache keys of PerformanceDetail / PMEM-001.
 */
export function useSongContext(clubId: string, performanceId: string) {
  const session = useSession()
  const key = performanceKey(clubId, performanceId)
  const detail = useQuery({
    queryKey: [...key, 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const me = useQuery({
    queryKey: [...key, 'me'],
    queryFn: () => getMyParticipation(clubId, performanceId),
  })
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  const membershipId = session.memberships.find((m) => m.clubId === clubId)?.id
  // The requester's own registered parts (the default parts of a playability answer).
  const self = useQuery({
    queryKey: ['club-member', clubId, membershipId],
    queryFn: () => getMember(clubId, membershipId ?? ''),
    enabled: membershipId !== undefined,
  })
  const perf = detail.data?.performance
  const policy = detail.data?.policy
  return {
    admin: isClubAdmin(session, clubId),
    membershipId,
    myPartIds: (self.data?.parts ?? []).map((p) => p.id),
    perf,
    policy,
    /** `null`: not a participant. `undefined`: still loading. */
    me: me.data,
    ready: detail.isSuccess && me.isSuccess,
    loading: detail.isPending || me.isPending,
    error: detail.isError || me.isError,
    refetch: () => {
      void detail.refetch()
      void me.refetch()
    },
    parts: parts.data ?? [],
    activeParts: (parts.data ?? []).filter((p) => p.isActive),
    partName: (id: string) =>
      parts.data?.find((p) => p.id === id)?.name ?? T.unknownPerson,
  }
}
export type SongContext = ReturnType<typeof useSongContext>

/** The requester may answer for (or vote on) this song: inside its response scope (V-02). */
export const inScope = (
  song: Pick<SongCard, 'candidateTeamId'>,
  me: MyParticipation | null | undefined,
) =>
  !!me &&
  (song.candidateTeamId === null ||
    me.myTeams.some((t) => t.teamId === song.candidateTeamId))

/** Whether the requester can answer playability / vote on a PROPOSED song right now (V-01..V-03, G-10). */
export function inputRights(
  song: Pick<SongCard, 'status' | 'candidateTeamId'>,
  perf: { status: string } | undefined,
  policy: PerformancePolicy | undefined,
  me: MyParticipation | null | undefined,
) {
  const base =
    song.status === 'PROPOSED' && perf?.status === 'ACTIVE' && !!policy
  const scoped = inScope(song, me)
  return {
    // Participants who applied or are approved answer playability (V-03); only approved ones vote.
    playability:
      base &&
      scoped &&
      (me?.status === 'APPLIED' || me?.status === 'APPROVED') &&
      isOpen(policy.playabilityState, policy.playabilityDeadline),
    vote:
      base &&
      scoped &&
      me?.status === 'APPROVED' &&
      isOpen(policy.voteState, policy.voteDeadline),
  }
}

/** Texts of the post-write warnings (COM-003 4). A song count is only shown from 3 songs on (UI-23). */
export function warningTexts(
  warnings: Warning[] | undefined,
  duplicateTitle?: string,
): string[] {
  return (warnings ?? []).flatMap((w): string[] => {
    if (typeof w === 'object' && w !== null) {
      if (w.type === 'PART_SHORTAGE' && 'partName' in w)
        return [T.warnShortage(w.partName, w.requiredCount - w.assignedCount)]
      if (w.type === 'PART_EXCESS' && 'partName' in w)
        return [T.warnExcess(w.partName, w.assignedCount - w.requiredCount)]
      if (w.type === 'SONG_COUNT_EXCEEDED' && 'songCount' in w)
        return w.songCount >= 3
          ? [T.warnSongCount(w.displayName, w.songCount)]
          : []
    }
    // ponytail: the spec leaves the duplicate-song warning's shape open; anything else on a create is read as that warning.
    return duplicateTitle === undefined
      ? []
      : [T.duplicateWarning(duplicateTitle)]
  })
}

export const showWarnings = (texts: string[]) => {
  if (texts.length > 0) warningsStore.set(texts)
}

/**
 * Warnings handed over by `navigate(to, { state: { warnings } })` after a write that leaves its
 * screen. Read once into local state, then the history entry is cleaned so a reload or going
 * back does not show them again.
 */
export function useArrivalWarnings() {
  const { state, pathname } = useLocation() as {
    state: { warnings?: string[] } | null
    pathname: string
  }
  const navigate = useNavigate()
  const [warnings, setWarnings] = useState<string[]>(state?.warnings ?? [])
  useEffect(() => {
    if (state?.warnings) void navigate(pathname, { replace: true, state: null })
  }, [state, pathname, navigate])
  return [warnings, () => setWarnings([])] as const
}

/** After any song write: the song queries, the performance counts, the home and the lists. */
export const refreshSongs = (
  qc: QueryClient,
  clubId: string,
  performanceId: string,
) => invalidatePerformance(qc, clubId, performanceId)

/** `https://` only, up to 500 characters (S-11). Empty is fine. */
export const validLink = (v: string) =>
  v === '' || (v.length <= 500 && /^https:\/\/\S+$/.test(v))

// ponytail: first 100 approved participants; page through if a performance grows past that.
export function useParticipants(clubId: string, performanceId: string) {
  return useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'approved-100'],
    queryFn: async () =>
      (
        await listPerformanceMembers(
          clubId,
          performanceId,
          { status: ['APPROVED'] },
          0,
          100,
        )
      ).items,
  })
}

/** Membership IDs of the assigned team (for the 지원 badge and the 담당 팀원 tab); empty without a team. */
export function useTeamMembers(
  clubId: string,
  performanceId: string,
  teamId: string | null,
) {
  return useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'team-lite', teamId],
    queryFn: async () =>
      (await getTeamLite(clubId, performanceId, teamId ?? ''))?.members.map(
        (m) => m.membershipId,
      ) ?? [],
    enabled: teamId !== null,
  })
}

/** The decisions the card menu offers for a song in this state (8.1); none once the performance is over. */
export const decisionsFor = (
  status: SongStatus,
  performanceStatus: string | undefined,
): SheetAction[] => {
  if (performanceStatus === 'FINISHED' || performanceStatus === 'CANCELED')
    return []
  switch (status) {
    case 'PROPOSED':
      return ['reject', 'confirm']
    case 'CONFIRMED':
      return ['unconfirm', 'reject']
    case 'REJECTED':
      return ['reconsider']
    default:
      return []
  }
}
export const DECISION_LABEL: Record<string, string> = {
  confirm: T.actionConfirm,
  reject: T.actionReject,
  unconfirm: T.actionUnconfirm,
  reconsider: T.actionReconsider,
}
