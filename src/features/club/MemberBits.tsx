import { Avatar } from '@montage-ui/core'
import { Badge } from '../../shared/ui/Badge'
import type { Member } from './api'

export const memberName = (m: Pick<Member, 'displayName' | 'userName'>) =>
  m.displayName || m.userName

export function MemberAvatar({ member }: { member: Member }) {
  return (
    <Avatar
      size="medium"
      src={member.profileImageUrl ?? undefined}
      alt={memberName(member)}
    />
  )
}

/** 임원 / 객원 for everyone; 휴학·졸업·탈퇴 only when the server sent `status` (officers). */
export function MemberBadges({ member }: { member: Member }) {
  const { status } = member
  return (
    <>
      {member.role === 'CLUB_ADMIN' ? (
        <Badge kind="membership" value="CLUB_ADMIN" />
      ) : null}
      {member.memberType === 'GUEST' ? (
        <Badge kind="membership" value="GUEST" />
      ) : null}
      {status === 'ON_LEAVE' ||
      status === 'GRADUATED' ||
      status === 'WITHDRAWN' ? (
        <Badge kind="membership" value={status} />
      ) : null}
    </>
  )
}
