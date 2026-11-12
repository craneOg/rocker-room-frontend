import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { withConfirmation } from '../../shared/api/handlers'
import { feedback } from '../../shared/ui/feedbackBus'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { CLUB_TYPE_LABEL } from '../club/copy'
import {
  deactivateClub,
  forceLogout,
  getAdminClub,
  reactivateClub,
  replaceClubAdmin,
} from './adminApi'
import { ADMIN_COPY as T } from './adminCopy'
import { dateText } from './adminDates'
import { AdminReplaceAdmin } from './AdminReplaceAdmin'

type Dialog =
  | { kind: 'status' }
  | { kind: 'replace' }
  | { kind: 'logout'; userId: string; name: string }

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="admin-tile">
    <Typography variant="caption1">{label}</Typography>
    <Typography variant="body2">{value}</Typography>
  </div>
)

const keys = <K extends string>(o: Record<K, string>) => Object.keys(o) as K[]

/** SADM-003: one club's facts, officers, and the Super Admin actions (state change, emergency replacement). */
export function AdminClubDetail() {
  const { clubId = '' } = useParams()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const detail = useQuery({
    queryKey: ['admin', 'club', clubId],
    queryFn: ({ signal }) => getAdminClub(clubId, signal),
  })
  const done = (message: string) => {
    setDialog(null)
    feedback.toast(message, 'positive')
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }
  const changeStatus = useMutation({
    mutationFn: ({ reason, active }: { reason: string; active: boolean }) =>
      active
        ? deactivateClub(clubId, reason)
        : withConfirmation((confirmed) =>
            reactivateClub(clubId, reason, confirmed),
          ),
    onSuccess: (_, { active }) => done(active ? T.deactivated : T.reactivated),
  })
  const replace = useMutation({
    mutationFn: ({ reason, id }: { reason: string; id: string }) =>
      replaceClubAdmin(clubId, reason, id),
    onSuccess: () => done(T.replaced),
  })
  const logout = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      forceLogout(userId, reason),
    onSuccess: () => {
      setDialog(null)
      feedback.toast(T.forceLoggedOut, 'positive')
    },
  })

  const d = detail.data
  const active = d?.club.status === 'ACTIVE'
  const activeAdmins =
    d?.admins.filter((a) => a.status === 'ACTIVE').length ?? 0
  const canReplace = activeAdmins < 2

  return (
    <div data-screen-id="SADM-003" className="admin-body">
      <Link to="/admin/clubs">{T.detail.back}</Link>
      {detail.isError ? (
        <ErrorState onRetry={() => void detail.refetch()} />
      ) : !d ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          <Typography variant="title3" weight="bold" as="h2">
            {d.club.name}
          </Typography>

          <section aria-label={T.detail.basic}>
            <Typography variant="body1" weight="bold" as="h3">
              {T.detail.basic}
            </Typography>
            <div className="admin-tiles">
              <Tile label={T.detail.id} value={d.club.id} />
              <Tile
                label={T.detail.type}
                value={CLUB_TYPE_LABEL[d.club.clubType] ?? d.club.clubType}
              />
              <Tile
                label={T.detail.status}
                value={active ? T.statusActive : T.statusInactive}
              />
              <Tile
                label={T.detail.createdAt}
                value={dateText(d.club.createdAt)}
              />
              <Tile
                label={T.detail.creator}
                value={d.creator?.name ?? T.never}
              />
              <Tile
                label={T.detail.joinCode}
                value={
                  d.joinCodeEnabled ? T.detail.joinCodeOn : T.detail.joinCodeOff
                }
              />
              <Tile
                label={T.detail.searchable}
                value={d.club.isSearchable ? T.yes : T.no}
              />
            </div>
          </section>

          <section aria-label={T.detail.metrics}>
            <Typography variant="body1" weight="bold" as="h3">
              {T.detail.metrics}
            </Typography>
            <div className="admin-tiles">
              {keys(T.detail.memberStatus).map((k) => (
                <Tile
                  key={k}
                  label={T.detail.memberStatus[k]}
                  value={d.counts.memberStatus[k]}
                />
              ))}
              {keys(T.detail.performanceStatus).map((k) => (
                <Tile
                  key={k}
                  label={`공연 ${T.detail.performanceStatus[k]}`}
                  value={d.counts.performanceStatus[k]}
                />
              ))}
              <Tile
                label={T.detail.lastActive}
                value={dateText(d.lastActiveAt)}
              />
            </div>
          </section>

          <section aria-label={T.detail.admins}>
            <Typography variant="body1" weight="bold" as="h3">
              {T.detail.admins}
            </Typography>
            {d.admins.length === 0 ? (
              <Typography variant="body2">{T.detail.adminsEmpty}</Typography>
            ) : (
              <ul className="admin-list">
                {d.admins.map((a) => (
                  <li key={a.membershipId}>
                    <span>{a.displayName}</span>
                    <span>{`@${a.handle}`}</span>
                    <span>{T.detail.adminStatus[a.status] ?? a.status}</span>
                    <span>{`${T.detail.lastActive} ${dateText(a.lastActiveAt)}`}</span>
                    <details>
                      <summary aria-label={T.detail.rowMenu(a.displayName)}>
                        …
                      </summary>
                      <Button
                        color="negative"
                        variant="outlined"
                        onClick={() =>
                          setDialog({
                            kind: 'logout',
                            userId: a.userId,
                            name: a.displayName,
                          })
                        }
                      >
                        {T.forceLogout}
                      </Button>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-row">
            <Button
              color={active ? 'negative' : 'primary'}
              variant="outlined"
              onClick={() => setDialog({ kind: 'status' })}
            >
              {active ? T.deactivate : T.reactivate}
            </Button>
            <Button
              variant="outlined"
              disabled={!canReplace}
              onClick={() => setDialog({ kind: 'replace' })}
            >
              {T.replace}
            </Button>
          </section>
          <Typography variant="caption1">{T.inactiveNotice}</Typography>
          {canReplace ? null : (
            <Typography variant="caption1">{T.replaceBlocked}</Typography>
          )}

          <ReasonModal
            open={dialog?.kind === 'status'}
            title={active ? T.deactivateTitle : T.reactivateTitle}
            description={active ? T.inactiveNotice : undefined}
            actionLabel={active ? T.deactivate : T.reactivate}
            loading={changeStatus.isPending}
            onSubmit={(reason) => changeStatus.mutate({ reason, active })}
            onClose={() => setDialog(null)}
          />
          <ReasonModal
            open={dialog?.kind === 'logout'}
            title={
              dialog?.kind === 'logout'
                ? T.forceLogoutTitle(dialog.name)
                : undefined
            }
            actionLabel={T.forceLogout}
            loading={logout.isPending}
            onSubmit={(reason) =>
              dialog?.kind === 'logout' &&
              logout.mutate({ userId: dialog.userId, reason })
            }
            onClose={() => setDialog(null)}
          />
          {dialog?.kind === 'replace' ? (
            <AdminReplaceAdmin
              clubId={clubId}
              admins={d.admins}
              loading={replace.isPending}
              onSubmit={(reason, id) => replace.mutate({ reason, id })}
              onClose={() => setDialog(null)}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
