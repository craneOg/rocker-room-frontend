import { Button, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isClubMember, useSession } from '../../shared/auth/session'
import { readLastClubId } from '../../shared/lib/lastClub'
import { Badge } from '../../shared/ui/Badge'
import type { BadgeValue } from '../../shared/ui/badges'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { getMember, listParts, type Member } from '../club/api'
import {
  invalidateClub,
  setMemberParts,
  setMyDisplayName,
} from '../club/manageApi'
import { MY_COPY as T } from './copy'

const NAME_MAX = 50

/** MY-003: the display name and the parts of the signed-in user in the current club. */
export function MyMembership() {
  const session = useSession()
  const clubs = session.memberships.filter((m) =>
    isClubMember(session, m.clubId),
  )
  const last = readLastClubId()
  const current = clubs.find((m) => m.clubId === last) ?? clubs[0]
  const clubId = current?.clubId ?? ''
  const membershipId = current?.id ?? ''

  const member = useQuery({
    queryKey: ['club-member', clubId, membershipId],
    queryFn: () => getMember(clubId, membershipId),
    enabled: current !== undefined,
  })
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
    enabled: current !== undefined,
  })

  if (!current)
    return (
      <div className="start" data-screen-id="MY-003">
        <EmptyState description={T.noClub} />
      </div>
    )
  if (member.isPending || parts.isPending)
    return (
      <div className="start" data-screen-id="MY-003">
        <ListSkeleton rows={3} />
      </div>
    )
  if (!member.data || !parts.data)
    return (
      <div className="start" data-screen-id="MY-003">
        <ErrorState
          onRetry={() => {
            void member.refetch()
            void parts.refetch()
          }}
        />
      </div>
    )
  return (
    <MembershipForm
      // A reload after a save starts from the saved values.
      key={`${member.data.displayName ?? ''}|${member.data.parts.map((p) => p.id).join(',')}`}
      clubId={clubId}
      membershipId={membershipId}
      member={member.data}
      allParts={parts.data}
      status={current.status}
      role={current.role}
    />
  )
}

function MembershipForm({
  clubId,
  membershipId,
  member,
  allParts,
  status,
  role,
}: {
  clubId: string
  membershipId: string
  member: Member
  allParts: { id: string; name: string; isActive: boolean }[]
  status: string
  role: 'CLUB_ADMIN' | 'MEMBER'
}) {
  const qc = useQueryClient()
  const savedName = member.displayName ?? ''
  const savedParts = member.parts.map((p) => p.id)
  const [name, setName] = useState(savedName)
  const [picked, setPicked] = useState<string[]>(savedParts)

  const mine = new Set(savedParts)
  // Active parts, plus a deactivated one the member still holds (it can only be taken off).
  const shown = allParts.filter((p) => p.isActive || mine.has(p.id))
  const nameChanged = name.trim() !== savedName
  const partsChanged =
    picked.length !== savedParts.length || picked.some((id) => !mine.has(id))
  const tooLong = name.trim().length > NAME_MAX

  const save = useMutation({
    mutationFn: async () => {
      if (nameChanged)
        await setMyDisplayName(clubId, membershipId, name.trim() || null)
      if (partsChanged) await setMemberParts(clubId, membershipId, picked)
    },
    onSuccess: async () => {
      await invalidateClub(qc, clubId)
      feedback.toast(COPY.saved, 'positive')
    },
    // A write can stop half way (the name saved, the parts not): show what the server has.
    onError: () => void invalidateClub(qc, clubId),
  })

  const toggle = (id: string) =>
    setPicked((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    )

  return (
    <div className="start" data-screen-id="MY-003">
      <Typography variant="title2" weight="bold" as="h1">
        {T.membershipTitle}
      </Typography>

      <FormField
        label={T.displayNameLabel}
        hint={T.displayNameHint}
        error={tooLong ? T.displayNameHint : undefined}
      >
        <TextField
          value={name}
          maxLength={NAME_MAX}
          placeholder={member.userName}
          aria-label={T.displayNameLabel}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>

      <div role="group" aria-label={T.myParts}>
        <Typography variant="body1" weight="bold">
          {T.myParts}
        </Typography>
        <Typography variant="caption1">{T.partsHint}</Typography>
        <div className="chip-row">
          {shown.map((p) => {
            const on = picked.includes(p.id)
            return (
              <Button
                key={p.id}
                size="small"
                variant={on ? 'solid' : 'outlined'}
                color="assistive"
                aria-pressed={on}
                // A deactivated part can be taken off, never added back.
                disabled={!p.isActive && !on}
                onClick={() => toggle(p.id)}
              >
                {p.isActive ? p.name : T.partInactive(p.name)}
              </Button>
            )
          })}
        </div>
      </div>

      <div>
        <Typography variant="body1" weight="bold">
          {T.membershipStatus}
        </Typography>
        <div className="chip-row">
          {role === 'CLUB_ADMIN' ? (
            <Badge kind="membership" value="CLUB_ADMIN" />
          ) : null}
          <Badge kind="membership" value={status as BadgeValue<'membership'>} />
        </div>
        <Typography variant="caption1">{T.statusHint}</Typography>
      </div>

      <Button
        loading={save.isPending}
        disabled={(!nameChanged && !partsChanged) || tooLong}
        onClick={() => save.mutate()}
      >
        {T.save}
      </Button>
    </div>
  )
}
