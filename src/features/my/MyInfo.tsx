import { Button, Typography } from '@montage-ui/core'
import { IconChevronRight } from '@montage-ui/icon'
import { Link, useNavigate } from 'react-router'
import { isClubMember, useSession } from '../../shared/auth/session'
import { readLastClubId, saveLastClubId } from '../../shared/lib/lastClub'
import { Badge } from '../../shared/ui/Badge'
import type { BadgeValue } from '../../shared/ui/badges'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import type { Membership } from '../auth/api'
import { useLogout } from '../auth/useLogout'
import { MY_COPY as T } from './copy'

function ClubBadges({ m }: { m: Membership }) {
  return (
    <>
      {m.role === 'CLUB_ADMIN' ? (
        <Badge kind="membership" value="CLUB_ADMIN" />
      ) : null}
      <Badge kind="membership" value={m.status as BadgeValue<'membership'>} />
    </>
  )
}

function MenuLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="start-card start-way">
      <Typography variant="body1" weight="bold">
        {label}
      </Typography>
      <IconChevronRight aria-hidden />
    </Link>
  )
}

/** MY-001: profile, current club, my clubs, settings. */
export function MyInfo() {
  const session = useSession()
  const { me, memberships } = session
  const navigate = useNavigate()
  const logout = useLogout()

  const clubs = memberships.filter((m) => isClubMember(session, m.clubId))
  const lastClubId = readLastClubId()
  const current = clubs.find((m) => m.clubId === lastClubId) ?? clubs[0]

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(me?.handle ?? '')
      feedback.toast(T.idCopied)
    } catch {
      feedback.toast(COPY.unknownError, 'negative')
    }
  }

  const switchTo = (clubId: string) => {
    saveLastClubId(clubId)
    navigate(`/clubs/${clubId}`)
  }

  const confirmLogout = async () => {
    const choice = await feedback.dialog({
      title: T.logoutTitle,
      cancelLabel: COPY.cancel,
      confirmLabel: T.logout,
    })
    if (choice === 'confirm') logout.mutate()
  }

  return (
    <div className="start" data-screen-id="MY-001">
      <section className="start-card">
        <div className="restore-profile">
          <div className="profile-photo" role="img" aria-label={T.profilePhoto}>
            {me?.profileImageUrl ? (
              <img src={me.profileImageUrl} alt="" />
            ) : (
              <span>{me?.name.charAt(0)}</span>
            )}
          </div>
          <div className="start-card-text">
            <Typography variant="body1" weight="bold">
              {me?.name}
            </Typography>
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {`@${me?.handle ?? ''}`}
            </Typography>
          </div>
        </div>
        <div className="start-card-actions">
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => void copyId()}
          >
            {T.copyId}
          </Button>
          <Button size="small" onClick={() => navigate('/me/profile')}>
            {T.editProfile}
          </Button>
        </div>
      </section>

      {current ? (
        <section className="start-section">
          <Typography variant="body1" weight="bold" as="h2">
            {T.currentClub}
          </Typography>
          <div className="start-card">
            <div className="start-card-text">
              <Typography variant="body1" weight="bold">
                {current.club.name}
              </Typography>
              <div className="start-card-actions">
                <ClubBadges m={current} />
              </div>
            </div>
          </div>
          <MenuLink to={`/clubs/${current.clubId}/info`} label={T.clubInfo} />
          <MenuLink to="/me/membership" label={T.myMembership} />
        </section>
      ) : null}

      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.myClubs}
        </Typography>
        {clubs.map((m) => (
          <button
            key={m.id}
            type="button"
            className="start-card start-way"
            aria-current={m.clubId === current?.clubId}
            onClick={() => switchTo(m.clubId)}
          >
            <Typography variant="body1" weight="bold">
              {m.club.name}
            </Typography>
            <div className="start-card-actions">
              <ClubBadges m={m} />
            </div>
          </button>
        ))}
        <MenuLink to="/start" label={T.addClub} />
      </section>

      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.settings}
        </Typography>
        {/* Terms links have no target yet: plain text (same as AUTH-001). */}
        <Typography variant="body2">{T.terms}</Typography>
        <Typography variant="body2">{T.privacy}</Typography>
        <Button
          variant="outlined"
          color="assistive"
          loading={logout.isPending}
          onClick={() => void confirmLogout()}
        >
          {T.logout}
        </Button>
        <Link to="/me/withdrawal">
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.tertiary"
          >
            {T.withdraw}
          </Typography>
        </Link>
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.tertiary"
        >
          {T.version(__APP_VERSION__)}
        </Typography>
      </section>

      {me?.isSuperAdmin ? (
        <section className="start-section">
          <MenuLink to="/admin" label={T.admin} />
        </section>
      ) : null}
    </div>
  )
}
