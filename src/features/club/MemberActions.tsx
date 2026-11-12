import { Button, Typography } from '@montage-ui/core'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import { listMembers, listParts, type MemberDetail } from './api'
import { MEMBER_COPY as T } from './copy'
import {
  changeMemberStatus,
  changeMemberType,
  getWithdrawPreview,
  invalidateClub,
  setMemberParts,
  setMemberRole,
  withRuleCopy,
  withdrawMember,
  type SettableStatus,
} from './manageApi'
import {
  ADMIN_TARGET_NOT_ELIGIBLE,
  LAST_ADMIN_ROLE,
  LAST_ADMIN_STATUS,
  MANAGE_COPY as M,
  TYPE_RULE_COPY,
} from './manageCopy'
import { ActionModal, RadioList, showRuleCopy } from './ManageBits'
import { memberName } from './MemberBits'

type Dialogs = 'status' | 'parts' | 'type' | 'withdraw' | null
type Props = { clubId: string; member: MemberDetail; isSelf: boolean }

const done = async (qc: QueryClient, clubId: string, toast: string) => {
  await invalidateClub(qc, clubId)
  feedback.toast(toast, 'positive')
}

/** CLUB-103 3-1 (parts) and 5 (status, role, type, withdrawal): officers only. */
export function MemberActions({ clubId, member, isSelf }: Props) {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<Dialogs>(null)
  const close = () => setDialog(null)
  const name = memberName(member)
  const status = member.status
  // C-11: only active / on-leave regular members can become officers.
  const eligible =
    member.memberType === 'REGULAR' &&
    (status === 'ACTIVE' || status === 'ON_LEAVE')
  const isAdmin = member.role === 'CLUB_ADMIN'

  const role = useMutation({
    mutationFn: (next: 'CLUB_ADMIN' | 'MEMBER') =>
      withRuleCopy(() => setMemberRole(clubId, member.id, next), {
        LAST_ADMIN: LAST_ADMIN_ROLE,
        ADMIN_TARGET_NOT_ELIGIBLE,
      }),
    onSuccess: () => done(qc, clubId, M.changed),
    onError: showRuleCopy,
  })
  const askRole = async () => {
    const choice = await feedback.dialog({
      title: isAdmin ? M.revokeTitle(name) : M.grantTitle(name),
      confirmLabel: isAdmin ? M.revokeConfirm : M.grantConfirm,
      cancelLabel: M.cancel,
      danger: isAdmin,
    })
    if (choice === 'confirm') role.mutate(isAdmin ? 'MEMBER' : 'CLUB_ADMIN')
  }

  return (
    <section className="start-section">
      <div className="chip-row">
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={() => setDialog('parts')}
        >
          {M.editPartsTitle}
        </Button>
        {!isSelf ? (
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => setDialog('status')}
          >
            {M.manageStatus}
          </Button>
        ) : null}
        {isAdmin || !isSelf ? (
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            // Revoking is always offered; granting only to those who can be officers.
            disabled={!isAdmin && !eligible}
            loading={role.isPending}
            onClick={() => void askRole()}
          >
            {isAdmin ? M.revokeAdmin : M.grantAdmin}
          </Button>
        ) : null}
        {!isSelf ? (
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => setDialog('type')}
          >
            {M.changeType}
          </Button>
        ) : null}
        {isSelf ? (
          <Link to={`/clubs/${clubId}/leave`}>{M.leaveInstead}</Link>
        ) : (
          <Button
            size="small"
            variant="outlined"
            color="negative"
            onClick={() => setDialog('withdraw')}
          >
            {M.withdraw}
          </Button>
        )}
      </div>
      {!isAdmin && !isSelf && !eligible ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {M.adminOnlyEligible}
        </Typography>
      ) : null}

      {dialog === 'parts' ? (
        <PartsDialog clubId={clubId} member={member} onClose={close} qc={qc} />
      ) : null}
      {dialog === 'status' ? (
        <StatusDialog clubId={clubId} member={member} onClose={close} qc={qc} />
      ) : null}
      {dialog === 'type' ? (
        <TypeDialog clubId={clubId} member={member} onClose={close} qc={qc} />
      ) : null}
      {dialog === 'withdraw' ? (
        <WithdrawDialog
          clubId={clubId}
          member={member}
          onClose={close}
          qc={qc}
        />
      ) : null}
    </section>
  )
}

type DialogProps = {
  clubId: string
  member: MemberDetail
  onClose: () => void
  qc: QueryClient
}

/** 3-1: full replacement of the member's parts (API-032). Inactive parts can only be removed. */
function PartsDialog({ clubId, member, onClose, qc }: DialogProps) {
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  const [picked, setPicked] = useState(() => member.parts.map((p) => p.id))
  const owned = new Set(member.parts.map((p) => p.id))
  // Active parts, plus the inactive ones the member already has (shown "(사용 중지)").
  const options = (parts.data ?? []).filter(
    (p) => p.isActive || owned.has(p.id),
  )
  const save = useMutation({
    mutationFn: () => setMemberParts(clubId, member.id, picked),
    onSuccess: async () => {
      await done(qc, clubId, COPY.saved)
      onClose()
    },
  })
  return (
    <ActionModal
      open
      title={M.editPartsTitle}
      actionLabel={M.save}
      loading={save.isPending}
      actionDisabled={parts.isPending}
      onClose={onClose}
      onSubmit={() => save.mutate()}
    >
      <div className="choice-list">
        {options.map((p) => (
          <label key={p.id} className="choice-row">
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              onChange={() =>
                setPicked((ids) =>
                  ids.includes(p.id)
                    ? ids.filter((x) => x !== p.id)
                    : [...ids, p.id],
                )
              }
            />
            <Typography variant="body2">
              {p.isActive ? p.name : `${p.name} ${T.inactivePart}`}
            </Typography>
          </label>
        ))}
      </div>
    </ActionModal>
  )
}

/** 5-1: status (활동 / 휴학 / 졸업), one endpoint per target (API-160 / 161 / 162). */
function StatusDialog({ clubId, member, onClose, qc }: DialogProps) {
  const current = member.status
  const [next, setNext] = useState<string>(current ?? 'ACTIVE')
  const change = useMutation({
    mutationFn: (s: SettableStatus) =>
      withRuleCopy(() => changeMemberStatus(clubId, member.id, s), {
        LAST_ADMIN: LAST_ADMIN_STATUS,
      }),
    onSuccess: async () => {
      await done(qc, clubId, M.changed)
      onClose()
    },
    onError: (e) => {
      onClose()
      showRuleCopy(e)
    },
  })
  return (
    <ActionModal
      open
      title={M.statusTitle}
      actionLabel={M.change}
      loading={change.isPending}
      actionDisabled={next === current}
      onClose={onClose}
      onSubmit={() => change.mutate(next as SettableStatus)}
    >
      <RadioList
        name={M.statusTitle}
        value={next}
        onChange={setNext}
        options={[
          { value: 'ACTIVE', label: M.statusActive },
          {
            value: 'ON_LEAVE',
            label: M.statusOnLeave,
            hint: M.statusOnLeaveHint,
          },
          {
            value: 'GRADUATED',
            label: M.statusGraduated,
            hint: M.statusGraduatedHint,
          },
        ]}
      />
      {next === 'GRADUATED' && member.role === 'CLUB_ADMIN' ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.negative.primary"
        >
          {M.graduateDropsAdmin}
        </Typography>
      ) : null}
    </ActionModal>
  )
}

/** 5-4: member type with a required reason (API-163). */
function TypeDialog({ clubId, member, onClose, qc }: DialogProps) {
  const [next, setNext] = useState(member.memberType)
  const [asking, setAsking] = useState(false)
  const change = useMutation({
    mutationFn: (reason: string) =>
      withRuleCopy(
        () =>
          changeMemberType(
            clubId,
            member.id,
            next === 'GUEST' ? 'GUEST' : 'REGULAR',
            reason,
          ),
        TYPE_RULE_COPY,
      ),
    onSuccess: async () => {
      await done(qc, clubId, M.typeChanged)
      onClose()
    },
    onError: (e) => {
      onClose()
      showRuleCopy(e)
    },
  })
  return (
    <>
      <ActionModal
        open={!asking}
        title={M.typeTitle}
        actionLabel={M.change}
        actionDisabled={next === member.memberType}
        onClose={onClose}
        onSubmit={() => setAsking(true)}
      >
        <RadioList
          name={M.typeTitle}
          value={next}
          onChange={setNext}
          options={[
            { value: 'REGULAR', label: M.typeRegular },
            { value: 'GUEST', label: M.typeGuest },
          ]}
        />
      </ActionModal>
      <ReasonModal
        open={asking}
        title={M.typeReasonTitle}
        actionLabel={M.change}
        loading={change.isPending}
        onClose={() => setAsking(false)}
        onSubmit={(reason) => change.mutate(reason)}
      />
    </>
  )
}

/** 5-3: shows the server's impact preview (API-146), then withdraws (API-030). */
function WithdrawDialog({ clubId, member, onClose, qc }: DialogProps) {
  const navigate = useNavigate()
  const preview = useQuery({
    queryKey: ['club-member', clubId, member.id, 'withdraw-preview'],
    queryFn: () => getWithdrawPreview(clubId, member.id),
    gcTime: 0,
  })
  // teamId -> chosen successor; teams not chosen here use the preview's first candidate.
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const data = preview.data
  const needsOfficer = data?.target.role === 'CLUB_ADMIN' && !!data.succession
  // Officer candidates: the preview names one person only, so the list comes from API-020.
  const officers = useQuery({
    queryKey: ['club-member', clubId, member.id, 'officer-candidates'],
    queryFn: ({ signal }) =>
      listMembers(
        clubId,
        { status: ['ACTIVE'], memberType: 'REGULAR' },
        0,
        signal,
        100,
      ),
    enabled: needsOfficer,
    gcTime: 0,
  })
  const [officerPick, setOfficerPick] = useState<string>()
  const officerCandidates = (officers.data?.items ?? []).filter(
    (c) => c.role !== 'CLUB_ADMIN' && c.id !== member.id,
  )
  const defaultOfficer = data?.succession?.candidateMembershipId
  const officerId = officerPick ?? defaultOfficer
  const pickedOfficer = officerCandidates.find((c) => c.id === officerId)
  const leaderTeams = data?.teamLeaderCandidates ?? []
  const successors = leaderTeams.flatMap((t) => {
    const id = chosen[t.teamId] ?? t.candidates[0]?.membershipId
    return id === undefined ? [] : [{ teamId: t.teamId, membershipId: id }]
  })
  const kick = useMutation({
    mutationFn: () =>
      withdrawMember(
        clubId,
        member.id,
        successors,
        // Sent only when changed: otherwise the server's own pick stands.
        officerPick && officerPick !== defaultOfficer ? officerPick : undefined,
      ),
    onSuccess: async () => {
      await done(qc, clubId, M.withdrawn)
      onClose()
      navigate(`/clubs/${clubId}/members`)
    },
  })
  const name = memberName(member)
  return (
    <ActionModal
      open
      title={M.withdrawTitle(name)}
      actionLabel={M.withdrawConfirm}
      actionDisabled={!data}
      loading={kick.isPending}
      onClose={onClose}
      onSubmit={() => kick.mutate()}
    >
      {data ? (
        <ul className="dialog-items">
          {data.performanceImpacts.length > 0 ? (
            <li>{M.withdrawPerformances(data.performanceImpacts.length)}</li>
          ) : null}
          {leaderTeams.map((t) => {
            const picked =
              t.candidates.find((c) => c.membershipId === chosen[t.teamId]) ??
              t.candidates[0]
            return (
              <li key={t.teamId}>
                {picked
                  ? M.withdrawLeader(
                      t.performanceName,
                      t.teamName,
                      picked.displayName,
                    )
                  : M.withdrawLeaderNone(t.performanceName, t.teamName)}
                {t.candidates.length > 1 ? (
                  <select
                    aria-label={`${t.teamName} ${M.changeSuccessor}`}
                    value={picked?.membershipId}
                    onChange={(e) =>
                      setChosen((c) => ({ ...c, [t.teamId]: e.target.value }))
                    }
                  >
                    {t.candidates.map((c) => (
                      <option key={c.membershipId} value={c.membershipId}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            )
          })}
          {needsOfficer && data.succession ? (
            <li>
              {M.withdrawSuccession}{' '}
              {M.withdrawSuccessionTo(
                pickedOfficer
                  ? memberName(pickedOfficer)
                  : data.succession.candidateName,
              )}
              {officerCandidates.length > 1 ? (
                <select
                  aria-label={M.changeOfficerSuccessor}
                  value={officerId}
                  onChange={(e) => setOfficerPick(e.target.value)}
                >
                  {officerCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {memberName(c)}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ) : null}
        </ul>
      ) : (
        <Typography variant="body2">{COPY.loading}</Typography>
      )}
    </ActionModal>
  )
}
