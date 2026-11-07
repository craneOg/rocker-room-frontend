import { Button, TextField, Typography } from '@montage-ui/core'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link, useParams } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { COPY } from '../../shared/ui/copy'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listMembers, listParts, type Member, type MemberFilter } from './api'
import { BulkBar } from './BulkActions'
import { MEMBER_COPY as T, STATUS_CHIPS } from './copy'
import { MANAGE_COPY as M } from './manageCopy'
import { MemberAvatar, MemberBadges, memberName } from './MemberBits'

const MAX_PART_CHIPS = 3

const toggle = <V,>(list: V[], v: V) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="small"
      variant={active ? 'solid' : 'outlined'}
      color="assistive"
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

/** CLUB-102: searchable, filterable member list; officers get select mode and bulk actions (4). */
export function MemberList() {
  const { clubId = '' } = useParams()
  const session = useSession()
  const admin = isClubAdmin(session, clubId)

  const [input, setInput] = useState('')
  const [statuses, setStatuses] = useState<string[]>(['ACTIVE'])
  const [adminOnly, setAdminOnly] = useState(false)
  const [memberType, setMemberType] = useState<string>()
  const [partIds, setPartIds] = useState<string[]>([])
  const q = useDeferredValue(input.trim())
  // Select mode (officers): id -> member, kept across filter changes and pages.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Map<string, Member>>(new Map())
  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Map())
  }
  const toggleSelected = (m: Member) =>
    setSelected((cur) => {
      const next = new Map(cur)
      if (!next.delete(m.id)) next.set(m.id, m)
      return next
    })

  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  const activeParts = (parts.data ?? []).filter((p) => p.isActive)

  const filter: MemberFilter = {
    q,
    // Only officers may send `status`; a regular member would get 403.
    status: admin ? statuses : undefined,
    role: adminOnly ? 'CLUB_ADMIN' : undefined,
    memberType,
    partIds,
  }
  const members = useInfiniteQuery({
    queryKey: ['club-members', clubId, filter],
    queryFn: ({ pageParam, signal }) =>
      listMembers(clubId, filter, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  })
  const items = members.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="start" data-screen-id="CLUB-102">
      <TextField
        value={input}
        placeholder={T.searchPlaceholder}
        aria-label={T.searchPlaceholder}
        maxLength={100}
        onChange={(e) => setInput(e.target.value)}
      />

      <div className="chip-row">
        {admin
          ? STATUS_CHIPS.map(([value, label]) => (
              <FilterChip
                key={value}
                label={label}
                active={statuses.includes(value)}
                // Keep one selected: an empty status filter would silently fall back to ACTIVE.
                onClick={() =>
                  setStatuses((s) =>
                    s.length === 1 && s[0] === value ? s : toggle(s, value),
                  )
                }
              />
            ))
          : null}
        <FilterChip
          label={T.chipAdmin}
          active={adminOnly}
          onClick={() => setAdminOnly((v) => !v)}
        />
        {(
          [
            ['REGULAR', T.chipRegular],
            ['GUEST', T.chipGuest],
          ] as const
        ).map(([value, label]) => (
          <FilterChip
            key={value}
            label={label}
            active={memberType === value}
            onClick={() =>
              setMemberType((v) => (v === value ? undefined : value))
            }
          />
        ))}
        {parts.isError ? (
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => void parts.refetch()}
          >
            {COPY.retry}
          </Button>
        ) : null}
        {activeParts.map((p) => (
          <FilterChip
            key={p.id}
            label={p.name}
            active={partIds.includes(p.id)}
            onClick={() => setPartIds((ids) => toggle(ids, p.id))}
          />
        ))}
      </div>

      {admin ? (
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          aria-pressed={selecting}
          onClick={() => (selecting ? exitSelect() : setSelecting(true))}
        >
          {selecting ? M.selectDone : M.select}
        </Button>
      ) : null}

      {members.isPending ? <ListSkeleton /> : null}
      {members.isError ? (
        <ErrorState onRetry={() => void members.refetch()} />
      ) : null}
      {members.isSuccess && items.length === 0 ? (
        <EmptyState description={T.empty} />
      ) : null}
      <ul className="member-list">
        {items.map((m) => (
          <li key={m.id} className={selecting ? 'select-row' : undefined}>
            {selecting ? (
              <input
                type="checkbox"
                aria-label={M.selectRow(memberName(m))}
                checked={selected.has(m.id)}
                onChange={() => toggleSelected(m)}
              />
            ) : null}
            <Link
              to={`/clubs/${clubId}/members/${m.id}`}
              className="member-row"
            >
              <MemberAvatar member={m} />
              <div className="start-card-text">
                <div className="member-row-name">
                  <Typography variant="body1" weight="bold">
                    {memberName(m)}
                  </Typography>
                  <MemberBadges member={m} />
                </div>
                <div className="member-row-parts">
                  {m.parts.slice(0, MAX_PART_CHIPS).map((p) => (
                    <Typography
                      key={p.id}
                      variant="caption1"
                      color="semantic.foreground.neutral.secondary"
                    >
                      {p.name}
                    </Typography>
                  ))}
                  {m.parts.length > MAX_PART_CHIPS ? (
                    <Typography
                      variant="caption1"
                      color="semantic.foreground.neutral.secondary"
                    >
                      {T.moreParts(m.parts.length - MAX_PART_CHIPS)}
                    </Typography>
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {members.hasNextPage ? (
        <Button
          variant="outlined"
          color="assistive"
          loading={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
        >
          {T.loadMore}
        </Button>
      ) : null}
      {selecting ? (
        <BulkBar
          clubId={clubId}
          selected={[...selected.values()]}
          onDone={exitSelect}
        />
      ) : null}
    </div>
  )
}
