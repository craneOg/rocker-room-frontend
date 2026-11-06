import { Avatar, ContentBadge, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { getClub, getMember, listMembers } from './api'
import { CLUB_TYPE_LABEL, MEMBER_COPY as T } from './copy'
import { memberName } from './MemberBits'

const KEY = 'club-info'

function MenuRow({
  to,
  label,
  extra,
  danger,
}: {
  to: string
  label: string
  extra?: string
  danger?: boolean
}) {
  return (
    <Link to={to} className={`menu-row${danger ? ' menu-row-danger' : ''}`}>
      <span>{label}</span>
      {extra ? <span className="menu-row-extra">{extra}</span> : null}
    </Link>
  )
}

/** CLUB-101: club info and the sub-menu. Editing (1-1) and the pending badge are not built yet. */
export function ClubOverview() {
  const { clubId = '' } = useParams()
  const session = useSession()
  const admin = isClubAdmin(session, clubId)
  const own = session.memberships.find((m) => m.clubId === clubId)

  const club = useQuery({
    queryKey: [KEY, clubId, 'club'],
    queryFn: () => getClub(clubId),
  })
  // The member count is the list's totalElements. Officers' default filter is ACTIVE only, so
  // they ask for the same three statuses a regular member sees.
  const count = useQuery({
    queryKey: [KEY, clubId, 'count', admin],
    queryFn: () =>
      listMembers(
        clubId,
        { status: admin ? ['ACTIVE', 'ON_LEAVE', 'GRADUATED'] : undefined },
        0,
        undefined,
        1,
      ),
  })
  // Right side of "내 소속 정보": display name and own parts. Quiet when it fails.
  const mine = useQuery({
    queryKey: [KEY, clubId, 'mine', own?.id],
    queryFn: () => getMember(clubId, own?.id ?? ''),
    enabled: own !== undefined,
  })

  if (club.isPending) return <ListSkeleton rows={3} />
  if (club.isError) return <ErrorState onRetry={() => void club.refetch()} />
  const c = club.data
  const base = `/clubs/${clubId}`
  const myExtra = mine.data
    ? [memberName(mine.data), ...mine.data.parts.map((p) => p.name)].join(' · ')
    : undefined

  return (
    <div className="start" data-screen-id="CLUB-101">
      <section className="club-profile">
        <Avatar
          size="xlarge"
          variant="company"
          src={c.profileImageUrl ?? undefined}
          alt={c.name}
        />
        <div className="start-card-text">
          <div className="club-profile-badges">
            <ContentBadge size="small" color="neutral" variant="outlined">
              {CLUB_TYPE_LABEL[c.clubType] ?? c.clubType}
            </ContentBadge>
            {c.themeColor ? (
              <span
                className="club-color"
                style={{ background: c.themeColor }}
                aria-label={c.themeColor}
              />
            ) : null}
          </div>
          <Typography variant="title2" weight="bold" as="h1">
            {c.name}
          </Typography>
          <Typography
            variant="body2"
            color="semantic.foreground.neutral.secondary"
          >
            {c.description}
          </Typography>
          <Typography
            variant="caption1"
            color={
              c.status === 'INACTIVE'
                ? 'semantic.foreground.negative.primary'
                : 'semantic.foreground.neutral.tertiary'
            }
          >
            {c.status === 'INACTIVE' ? T.inactive : T.statusActive}
          </Typography>
        </div>
      </section>

      <nav className="menu-list">
        <MenuRow
          to={`${base}/members`}
          label={T.menuMembers}
          extra={count.data ? `${count.data.totalElements}` : undefined}
        />
        <MenuRow
          to="/me/membership"
          label={T.menuMyMembership}
          extra={myExtra}
        />
        {admin ? (
          <>
            <MenuRow to={`${base}/join-requests`} label={T.menuJoinRequests} />
            <MenuRow to={`${base}/members/new`} label={T.menuAddMember} />
            <MenuRow to={`${base}/join-code`} label={T.menuJoinCode} />
            <MenuRow to={`${base}/parts`} label={T.menuParts} />
          </>
        ) : null}
        <MenuRow to={`${base}/leave`} label={T.menuLeave} danger />
      </nav>
    </div>
  )
}
