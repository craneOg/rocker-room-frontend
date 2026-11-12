import { Button, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { feedback } from '../../shared/ui/feedbackBus'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { findAdminUsers, forceLogout, type AdminUser } from './adminApi'
import { ADMIN_COPY as T } from './adminCopy'
import { dateText } from './adminDates'

/** `@handle` searches by handle; anything else is taken as a user ID. */
const searchBy = (text: string) =>
  text.startsWith('@')
    ? { handle: text.slice(1) }
    : /^\d+$/.test(text)
      ? { userId: text }
      : { handle: text }

/** SADM-004: find one user, see their state and clubs, and log them out of every device. */
export function AdminUsers() {
  const [input, setInput] = useState('')
  const [term, setTerm] = useState('')
  const [target, setTarget] = useState<AdminUser | null>(null)

  const found = useQuery({
    queryKey: ['admin', 'users', term],
    queryFn: ({ signal }) => findAdminUsers(searchBy(term), signal),
    enabled: term !== '',
  })
  const logout = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      forceLogout(id, reason),
    onSuccess: (_, { id }) => {
      setTarget((t) => (t?.id === id ? null : t))
      feedback.toast(T.forceLoggedOut, 'positive')
    },
  })

  const user = found.data?.[0]
  return (
    <div data-screen-id="SADM-004" className="admin-body">
      <form
        className="admin-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setTerm(input.trim())
        }}
      >
        <TextField
          value={input}
          placeholder={T.userSearchPlaceholder}
          aria-label={T.userSearchPlaceholder}
          maxLength={100}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit" disabled={input.trim() === ''}>
          {T.userSearch}
        </Button>
      </form>

      {found.isError ? (
        <ErrorState onRetry={() => void found.refetch()} />
      ) : found.isFetching ? (
        <ListSkeleton rows={3} />
      ) : term !== '' && !user ? (
        <Typography variant="body2">{T.userNotFound}</Typography>
      ) : user ? (
        <>
          <section className="admin-tiles" aria-label={user.name}>
            <div className="admin-tile">
              <Typography variant="body1" weight="bold">
                {user.name}
              </Typography>
              <Typography variant="caption1">{`@${user.handle}`}</Typography>
            </div>
            {(
              [
                [T.userField.id, user.id],
                [T.userField.status, T.userStatus[user.status] ?? user.status],
                [T.userField.createdAt, dateText(user.createdAt)],
                [T.userField.lastActive, dateText(user.lastActiveAt)],
                [T.userField.kakao, user.kakaoLinked ? T.yes : T.no],
                [T.userField.superAdmin, user.isSuperAdmin ? T.yes : T.no],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="admin-tile">
                <Typography variant="caption1">{label}</Typography>
                <Typography variant="body2">{value}</Typography>
              </div>
            ))}
          </section>

          <section>
            <Typography variant="body1" weight="bold" as="h2">
              {T.userClubs}
            </Typography>
            {user.clubs.length === 0 ? (
              <Typography variant="body2">{T.userNoClubs}</Typography>
            ) : (
              <ul className="admin-list">
                {user.clubs.map((c) => (
                  <li key={c.clubId}>
                    <Link to={`/admin/clubs/${c.clubId}`}>{c.name}</Link>
                    <span>{c.role}</span>
                    <span>{c.membershipStatus}</span>
                    <span>{c.joinSource ?? T.never}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Button
            color="negative"
            variant="outlined"
            onClick={() => setTarget(user)}
          >
            {T.forceLogout}
          </Button>
        </>
      ) : null}

      <ReasonModal
        open={target !== null}
        title={target ? T.forceLogoutTitle(target.name) : undefined}
        actionLabel={T.forceLogout}
        loading={logout.isPending}
        onSubmit={(reason) =>
          target && logout.mutate({ id: target.id, reason })
        }
        onClose={() => setTarget(null)}
      />
    </div>
  )
}
