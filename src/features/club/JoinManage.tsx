import {
  Avatar,
  Button,
  Checkbox,
  ContentBadge,
  Typography,
} from '@montage-ui/core'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useSession } from '../../shared/auth/session'
import { formatKstShort } from '../../shared/lib/time'
import { Badge } from '../../shared/ui/Badge'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { EmptyState, ListSkeleton } from '../../shared/ui/StateViews'
import {
  decideJoin,
  decideJoinBulk,
  inviteMember,
  InviteTargetError,
  listMemberships,
  memberKey,
  MembershipGoneError,
  type ListedMembership,
  type ListStatus,
  type MembershipPage,
} from './joinManageApi'
import { JOIN_MANAGE_COPY as T } from './joinManageCopy'

const nameOf = (m: ListedMembership) => m.displayName ?? m.userName
const monthDay = (iso: string) => formatKstShort(iso).slice(0, 5)
const isExpired = (m: ListedMembership) =>
  m.invitationExpiresAt !== null &&
  Date.parse(m.invitationExpiresAt) <= Date.now()

const useList = (clubId: string, status: ListStatus) =>
  useQuery({
    queryKey: [...memberKey(clubId), status],
    queryFn: ({ signal }) => listMemberships(clubId, status, signal),
  })

/** Decisions on join requests; any outcome ends with a fresh list (the list is the truth). */
function useDecisions(clubId: string) {
  const queryClient = useQueryClient()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: memberKey(clubId) })
  // Other failures (409 STATE_CONFLICT, network, ...) are told by the global handler.
  const onError = (e: unknown) => {
    void refresh()
    if (e instanceof MembershipGoneError) feedback.toast(T.gone, 'negative')
  }
  const single = useMutation({
    mutationFn: (v: { id: string; decision: 'approve' | 'reject' }) =>
      decideJoin(clubId, v.id, v.decision),
    onSuccess: async (_, v) => {
      feedback.toast(
        v.decision === 'approve' ? T.approved : T.rejected,
        'positive',
      )
      await refresh()
    },
    onError,
  })
  const bulk = useMutation({
    mutationFn: (v: { ids: string[]; decision: 'APPROVE' | 'REJECT' }) =>
      decideJoinBulk(clubId, v.ids, v.decision),
    onSuccess: async (r) => {
      feedback.toast(
        T.bulkDone(r.summary.succeeded, r.summary.failed),
        r.summary.failed > 0 ? 'cautionary' : 'positive',
      )
      await refresh()
    },
    onError,
  })
  return { single, bulk }
}

/** Loading skeleton, retry on failure, empty state, else the rows. */
function ListBody({
  query,
  empty,
  children,
}: {
  query: UseQueryResult<MembershipPage>
  empty: string
  children: (items: ListedMembership[]) => ReactNode
}) {
  if (query.isPending) return <ListSkeleton />
  if (query.isError)
    return (
      <EmptyState
        description={COPY.unknownError}
        actionLabel={COPY.retry}
        onAction={() => void query.refetch()}
      />
    )
  if (query.data.items.length === 0) return <EmptyState description={empty} />
  return <>{children(query.data.items)}</>
}

function Person({ m, extra }: { m: ListedMembership; extra?: ReactNode }) {
  return (
    <div className="member-person">
      <Avatar size="medium" src={m.profileImageUrl ?? undefined} alt="" />
      <div className="start-card-text">
        <Typography variant="body1" weight="bold">
          {nameOf(m)}
        </Typography>
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {m.handle ? `@${m.handle}` : T.noHandle}
        </Typography>
        {extra}
      </div>
    </div>
  )
}

function SourceBadge({ source }: { source: string | null }) {
  if (source !== 'JOIN_CODE' && source !== 'SEARCH') return null
  return (
    <ContentBadge size="small" color="neutral" variant="outlined">
      {source === 'JOIN_CODE' ? T.sourceCode : T.sourceSearch}
    </ContentBadge>
  )
}

function Requests({ clubId }: { clubId: string }) {
  const query = useList(clubId, 'PENDING')
  const { single, bulk } = useDecisions(clubId)
  const session = useSession()
  const isBand =
    session.memberships.find((x) => x.clubId === clubId)?.club.clubType ===
    'BAND'
  const [selected, setSelected] = useState<string[]>([])
  const busy = single.isPending || bulk.isPending

  const confirmReject = async (title: string) =>
    (await feedback.dialog({
      title,
      confirmLabel: T.reject,
      cancelLabel: COPY.cancel,
      danger: true,
    })) === 'confirm'

  return (
    <ListBody query={query} empty={T.emptyRequests}>
      {(items) => {
        // Rows that were handled elsewhere drop out of the selection with the list refresh.
        const ids = selected.filter((id) => items.some((m) => m.id === id))
        const toggle = (id: string, on: boolean) =>
          setSelected(on ? [...ids, id] : ids.filter((x) => x !== id))
        return (
          <div className="start-section">
            <div className="member-bulk">
              <Checkbox
                aria-label={T.selectAll}
                checked={ids.length === items.length}
                indeterminate={ids.length > 0 && ids.length < items.length}
                onCheckedChange={(on) =>
                  setSelected(on ? items.map((m) => m.id) : [])
                }
              />
              <Typography variant="body2">
                {ids.length > 0 ? T.selectedCount(ids.length) : T.selectAll}
              </Typography>
              {ids.length > 0 ? (
                <div className="start-card-actions">
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirmReject(T.rejectBulkTitle(ids.length)))
                        bulk.mutate({ ids, decision: 'REJECT' })
                    }}
                  >
                    {T.reject}
                  </Button>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => bulk.mutate({ ids, decision: 'APPROVE' })}
                  >
                    {T.approve}
                  </Button>
                </div>
              ) : null}
            </div>
            {isBand ? (
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {T.bandNotice}
              </Typography>
            ) : null}
            {items.map((m) => (
              <article key={m.id} className="start-card">
                <Checkbox
                  aria-label={T.selectOne(nameOf(m))}
                  checked={ids.includes(m.id)}
                  onCheckedChange={(on) => toggle(m.id, on)}
                />
                <Person
                  m={m}
                  extra={
                    <div className="member-meta">
                      <SourceBadge source={m.joinSource} />
                      {m.requestedAt ? (
                        <Typography
                          variant="caption1"
                          color="semantic.foreground.neutral.tertiary"
                        >
                          {monthDay(m.requestedAt)}
                        </Typography>
                      ) : null}
                    </div>
                  }
                />
                <div className="start-card-actions">
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirmReject(T.rejectTitle(nameOf(m))))
                        single.mutate({ id: m.id, decision: 'reject' })
                    }}
                  >
                    {T.reject}
                  </Button>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      single.mutate({ id: m.id, decision: 'approve' })
                    }
                  >
                    {T.approve}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )
      }}
    </ListBody>
  )
}

/** C-05: an invite can be sent again with the same type once it has expired or been declined. */
function InviteRow({
  clubId,
  m,
  declined,
}: {
  clubId: string
  m: ListedMembership
  declined?: boolean
}) {
  const queryClient = useQueryClient()
  const reinvite = useMutation({
    mutationFn: () =>
      inviteMember(clubId, {
        handle: m.handle ?? '',
        memberType: m.memberType === 'GUEST' ? 'GUEST' : 'REGULAR',
      }),
    onSuccess: () => feedback.toast(T.reinvited, 'positive'),
    // Whatever the outcome, the list shows the truth again; only a 409/404 needs its own words.
    onError: (e) => {
      if (e instanceof InviteTargetError)
        feedback.toast(
          e.reason === 'gone' ? T.inviteGone : T.inviteDuplicate,
          'negative',
        )
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: memberKey(clubId) }),
  })
  const expired = !declined && isExpired(m)
  const canReinvite = (declined || expired) && m.handle !== null
  return (
    <article className="start-card">
      <Person
        m={m}
        extra={
          <div className="member-meta">
            {m.memberType === 'GUEST' ? (
              <Badge kind="membership" value="GUEST" />
            ) : (
              <ContentBadge size="small" color="neutral" variant="outlined">
                {T.regular}
              </ContentBadge>
            )}
            {declined ? null : expired ? (
              <ContentBadge size="small" color="neutral" variant="solid">
                {T.expired}
              </ContentBadge>
            ) : m.invitationExpiresAt ? (
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.tertiary"
              >
                {T.until(monthDay(m.invitationExpiresAt))}
              </Typography>
            ) : null}
          </div>
        }
      />
      {canReinvite ? (
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          loading={reinvite.isPending}
          disabled={reinvite.isPending}
          onClick={() => reinvite.mutate()}
        >
          {T.reinvite}
        </Button>
      ) : null}
    </article>
  )
}

function Invites({
  clubId,
  declined,
}: {
  clubId: string
  declined: UseQueryResult<MembershipPage>
}) {
  const query = useList(clubId, 'INVITED')
  const declinedItems = declined.data?.items ?? []
  return (
    <div className="start-section">
      <ListBody query={query} empty={T.emptyInvites}>
        {(items) => (
          <>
            {items.map((m) => (
              <InviteRow key={m.id} clubId={clubId} m={m} />
            ))}
          </>
        )}
      </ListBody>
      {declinedItems.length > 0 ? (
        <details className="member-declined">
          <summary>{T.declinedInvites(declinedItems.length)}</summary>
          <div className="start-section">
            {declinedItems.map((m) => (
              <InviteRow key={m.id} clubId={clubId} m={m} declined />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}

/** CLUB-104: handle join requests and watch the invites that were sent (officers only). */
export function JoinManage() {
  const { clubId = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'invites' ? 'invites' : 'requests'
  // Same keys as the lists below, so the tab counts cost no extra requests.
  const pending = useList(clubId, 'PENDING')
  const invited = useList(clubId, 'INVITED')
  const declined = useList(clubId, 'DECLINED')
  const count = (q: UseQueryResult<MembershipPage>) =>
    q.data ? ` ${q.data.totalElements}` : ''

  const tabButton = (id: 'requests' | 'invites', label: string) => (
    <Button
      key={id}
      role="tab"
      aria-selected={tab === id}
      size="small"
      variant={tab === id ? 'solid' : 'outlined'}
      color={tab === id ? 'primary' : 'assistive'}
      onClick={() =>
        setParams(id === 'requests' ? {} : { tab: id }, { replace: true })
      }
    >
      {label}
    </Button>
  )

  return (
    <div className="start" data-screen-id="CLUB-104">
      <header className="member-header">
        <Typography variant="title2" weight="bold" as="h1">
          {T.title}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={() => navigate(`/clubs/${clubId}/members/new`)}
        >
          {T.addMember}
        </Button>
      </header>
      <div role="tablist" className="start-card-actions">
        {tabButton('requests', `${T.tabRequests}${count(pending)}`)}
        {tabButton('invites', `${T.tabInvites}${count(invited)}`)}
      </div>
      {tab === 'requests' ? (
        <Requests clubId={clubId} />
      ) : (
        <Invites clubId={clubId} declined={declined} />
      )}
    </div>
  )
}
