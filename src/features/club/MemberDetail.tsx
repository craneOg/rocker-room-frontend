import { Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { formatKstYmd } from '../../shared/lib/time'
import { Badge } from '../../shared/ui/Badge'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { getMember } from './api'
import { JOIN_SOURCE_LABEL, MEMBER_COPY as T, MEMBER_TYPE_LABEL } from './copy'
import { MemberAvatar, MemberBadges, memberName } from './MemberBits'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <Typography variant="body2" color="semantic.foreground.neutral.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </div>
  )
}

/**
 * CLUB-103: one member's club membership, read-only. The officer actions (3-1, 5-1..5-4) are not
 * built yet. A 404 (e.g. a withdrawn membership seen by a regular member) is the global 404 view.
 */
export function MemberDetail() {
  const { clubId = '', membershipId = '' } = useParams()
  const admin = isClubAdmin(useSession(), clubId)
  const query = useQuery({
    queryKey: ['club-member', clubId, membershipId],
    queryFn: () => getMember(clubId, membershipId),
  })

  if (query.isPending) return <ListSkeleton rows={3} />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  const m = query.data

  return (
    <div className="start" data-screen-id="CLUB-103">
      <section className="member-profile">
        <MemberAvatar member={m} />
        <div className="start-card-text">
          <div className="member-row-name">
            <Typography variant="title3" weight="bold" as="h1">
              {memberName(m)}
            </Typography>
            <MemberBadges member={m} />
          </div>
          {m.displayName ? (
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {m.userName}
            </Typography>
          ) : null}
          {admin && m.handle ? (
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {`@${m.handle}`}
            </Typography>
          ) : null}
        </div>
      </section>

      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.sectionInfo}
        </Typography>
        <InfoRow
          label={T.labelType}
          value={MEMBER_TYPE_LABEL[m.memberType] ?? m.memberType}
        />
        {/* Officers only: the server omits these for regular members (privacy). */}
        {admin && m.status ? (
          <InfoRow
            label={T.labelStatus}
            value={
              {
                ACTIVE: T.chipActive,
                ON_LEAVE: T.chipOnLeave,
                GRADUATED: T.chipGraduated,
                WITHDRAWN: T.chipWithdrawn,
              }[m.status] ?? m.status
            }
          />
        ) : null}
        {admin && m.joinSource ? (
          <InfoRow
            label={T.labelJoinSource}
            value={JOIN_SOURCE_LABEL[m.joinSource] ?? m.joinSource}
          />
        ) : null}
        {admin && m.approvedAt ? (
          <InfoRow
            label={T.labelApprovedAt}
            value={formatKstYmd(m.approvedAt)}
          />
        ) : null}
      </section>

      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.sectionParts}
        </Typography>
        {m.parts.length === 0 ? (
          <Typography
            variant="body2"
            color="semantic.foreground.neutral.secondary"
          >
            {T.noParts}
          </Typography>
        ) : (
          <div className="chip-row">
            {m.parts.map((p) => (
              <Typography
                key={p.id}
                variant="body2"
                color={
                  p.isActive
                    ? undefined
                    : 'semantic.foreground.neutral.tertiary'
                }
              >
                {p.isActive ? p.name : `${p.name} ${T.inactivePart}`}
              </Typography>
            ))}
          </div>
        )}
      </section>

      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.sectionPerformances}
        </Typography>
        {m.performances.length === 0 ? (
          <Typography
            variant="body2"
            color="semantic.foreground.neutral.secondary"
          >
            {T.noPerformances}
          </Typography>
        ) : (
          <ul className="member-list">
            {m.performances.map((p) => (
              <li key={p.id} className="info-row">
                <Typography variant="body2">{p.title}</Typography>
                <div className="member-row-name">
                  <Badge kind="performance" value={p.status} />
                  <Badge kind="participation" value={p.participationStatus} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
