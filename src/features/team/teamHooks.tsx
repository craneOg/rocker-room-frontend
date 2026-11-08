import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { fieldErrors } from '../../shared/api/errors'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { feedback } from '../../shared/ui/feedbackBus'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import { listParts } from '../club/api'
import { getPerformance, performanceKey } from '../performance/api'
import { invalidatePerformance } from '../performance/viewApi'
import { TeamNameTakenError, type PartCount } from './teamApi'
import { TEAM_COPY as T } from './teamCopy'

/** What every team screen needs: the route ids, the performance and who the requester is. */
export function useTeamContext() {
  const { clubId = '', performanceId = '', teamId } = useParams()
  const session = useSession()
  const detail = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const mine = session.memberships.find((m) => m.clubId === clubId)
  return {
    clubId,
    performanceId,
    teamId,
    base: `/clubs/${clubId}/performances/${performanceId}`,
    detail,
    perf: detail.data?.performance,
    policy: detail.data?.policy,
    admin: isClubAdmin(session, clubId),
    myMembershipId: mine?.id,
    // The club type decides whether a default team exists (TEAM-002 1-2: band clubs only).
    isBand: mine?.club.clubType === 'BAND',
    // 활동·휴학 정회원 (UI-16). ponytail: the session has no member type, so a guest is stopped by the server.
    regular: mine?.status === 'ACTIVE' || mine?.status === 'ON_LEAVE',
  }
}

export type TeamContext = ReturnType<typeof useTeamContext>

/** After a team write: every query of the performance (teams, counts) and the performance lists. */
export const refreshTeams = (qc: QueryClient, c: TeamContext) =>
  invalidatePerformance(qc, c.clubId, c.performanceId)

export type Write = {
  run: () => Promise<unknown>
  /** Toast after the write. */
  done: string
  onDone?: () => void
}

/** One team write: refreshes the performance's queries, toasts, and reports a taken team name. */
export function useTeamWrite(c: TeamContext) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (w: Write) => w.run(),
    onSuccess: async (_, w) => {
      await refreshTeams(qc, c)
      feedback.toast(w.done, 'positive')
      w.onDone?.()
    },
    onError: async (e) => {
      // A write chain may have stopped half way (members added one by one): show what was saved.
      await refreshTeams(qc, c)
      const text = teamNameError(e)
      if (text !== undefined) feedback.toast(text, 'negative')
    },
  })
}

/** A two-button confirmation; true when confirmed. */
export async function confirmDialog(
  title: string,
  description: string,
  confirmLabel: string,
) {
  return (
    (await feedback.dialog({
      title,
      description,
      confirmLabel,
      cancelLabel: T.cancel,
    })) === 'confirm'
  )
}

/** Helper text of the team-name input for a failed save, or undefined when the error is not about the name. */
export function teamNameError(e: unknown): string | undefined {
  if (e instanceof TeamNameTakenError) return T.nameTaken
  return 'name' in fieldErrors(e) ? T.nameRequired : undefined
}

export const partSummaryText = (parts: PartCount[]) =>
  parts
    .map((p) =>
      p.partName === null ? T.noPart(p.count) : `${p.partName} ${p.count}`,
    )
    .join(' · ')

export type PartOption = { id: string; name: string }

export type Pick = {
  membershipId: string
  name: string
  /** The member's own registered parts. */
  parts: PartOption[]
  partId: string | null
  /** Not a confirmed participant yet: joins as 참여 희망 (T-03). */
  willApply: boolean
}

/** The member's registered parts first, then the other active parts of the club. */
export function usePartOptions(clubId: string) {
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  const active = (parts.data ?? []).filter((p) => p.isActive)
  return (registered: PartOption[]): PartOption[] => [
    ...registered,
    ...active.filter((p) => !registered.some((r) => r.id === p.id)),
  ]
}

type Gated = {
  title: string
  description?: string
  actionLabel: string
  run: (reason: string | undefined) => void
}

/**
 * A change an officer makes on a LOCKED performance is recorded with a reason (X-01, COM-003 13):
 * `ask` opens the reason modal first when `required`, else runs at once.
 */
export function useReasonGate(): {
  ask: (required: boolean, spec: Gated) => void
  node: ReactNode
} {
  const [pending, setPending] = useState<Gated | null>(null)
  return {
    ask: (required, spec) =>
      required ? setPending(spec) : spec.run(undefined),
    node: pending ? (
      <ReasonModal
        open
        title={pending.title}
        description={pending.description}
        actionLabel={pending.actionLabel}
        onClose={() => setPending(null)}
        onSubmit={(reason) => {
          pending.run(reason)
          setPending(null)
        }}
      />
    ) : null,
  }
}
