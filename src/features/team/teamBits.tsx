import { Button, TextField, Typography } from '@montage-ui/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listMembers } from '../club/api'
import { ActionModal } from '../club/ManageBits'
import { memberName } from '../club/MemberBits'
import { performanceKey } from '../performance/api'
import { listPerformanceMembers } from '../performance/viewApi'
import type { TeamCard } from './teamApi'
import { TEAM_COPY as T } from './teamCopy'
import {
  partSummaryText,
  usePartOptions,
  type PartOption,
  type Pick,
  type TeamContext,
} from './teamHooks'
import './team.css'

export function TeamBadges({
  team,
}: {
  team: { status: TeamCard['status']; isDefault: boolean }
}) {
  return (
    <>
      <Badge kind="team" value={team.status} />
      {team.isDefault ? <Badge kind="team" value="DEFAULT" /> : null}
    </>
  )
}

/** TEAM-001 card. A draft of mine links on to the application form (이어서 작성). */
export function TeamCardLink({ team, base }: { team: TeamCard; base: string }) {
  const draft = team.isMine && team.status === 'DRAFT'
  return (
    <li>
      <Link
        className="perf-card team-card"
        to={
          draft
            ? `${base}/teams/apply?teamId=${team.id}`
            : `${base}/teams/${team.id}`
        }
      >
        <div className="perf-card-head">
          <Typography variant="body1" weight="bold">
            {team.name}
          </Typography>
          <TeamBadges team={team} />
          {draft ? <span className="perf-chip">{T.continueEdit}</span> : null}
        </div>
        <Typography variant="caption1">
          {[T.leader(team.leaderDisplayName), T.members(team.memberCount)].join(
            ' · ',
          )}
        </Typography>
        {team.partSummary.length > 0 ? (
          <Typography variant="caption1">
            {partSummaryText(team.partSummary)}
          </Typography>
        ) : null}
        <Typography variant="caption1">
          {[
            T.assignedSongs(team.assignedSongCount),
            team.candidateSongCount === null
              ? null
              : T.candidateSongs(team.candidateSongCount),
          ]
            .filter((s) => s !== null)
            .join(' · ')}
        </Typography>
        {team.status === 'REJECTED' && team.rejectReason ? (
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.secondary"
          >
            {T.rejectReason(team.rejectReason)}
          </Typography>
        ) : null}
      </Link>
    </li>
  )
}

export function PartSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: PartOption[]
  onChange: (partId: string | null) => void
}) {
  return (
    <select
      className="team-select"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{T.partNone}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}

type Candidate = { membershipId: string; name: string; parts: PartOption[] }

/**
 * 2-1 / 3-1: pick people and their representative parts.
 * `participants`: confirmed participants (officers, P-05). `club`: active / on-leave regular members.
 */
export function MemberPicker({
  c,
  source,
  excluded,
  loading,
  onClose,
  onConfirm,
}: {
  c: TeamContext
  source: 'participants' | 'club'
  /** membershipIds that cannot be picked (already in the team). */
  excluded: string[]
  loading?: boolean
  onClose: () => void
  onConfirm: (picks: Pick[]) => void
}) {
  const [input, setInput] = useState('')
  const q = useDeferredValue(input.trim())
  const [picked, setPicked] = useState<Pick[]>([])
  const optionsFor = usePartOptions(c.clubId)

  const people = useInfiniteQuery({
    queryKey: [
      ...performanceKey(c.clubId, c.performanceId),
      'team-picker',
      source,
      q,
      c.admin,
    ],
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<{
      items: Candidate[]
      next: number | undefined
    }> => {
      if (source === 'participants') {
        const r = await listPerformanceMembers(
          c.clubId,
          c.performanceId,
          { status: ['APPROVED'], q },
          pageParam,
          undefined,
          signal,
        )
        return {
          items: r.items.map((m) => ({
            membershipId: m.membershipId,
            name: m.displayName,
            parts: m.parts,
          })),
          next: r.page + 1 < r.totalPages ? r.page + 1 : undefined,
        }
      }
      const r = await listMembers(
        c.clubId,
        {
          q,
          memberType: 'REGULAR',
          // A regular member must not send `status` (officers only); the server then lists who it may.
          status: c.admin ? ['ACTIVE', 'ON_LEAVE'] : undefined,
        },
        pageParam,
        signal,
      )
      return {
        items: r.items.map((m) => ({
          membershipId: m.id,
          name: memberName(m),
          parts: m.parts.map((p) => ({ id: p.id, name: p.name })),
        })),
        next: r.page + 1 < r.totalPages ? r.page + 1 : undefined,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next,
  })
  const items = people.data?.pages.flatMap((p) => p.items) ?? []

  const toggle = (m: Candidate) =>
    setPicked((list) =>
      list.some((p) => p.membershipId === m.membershipId)
        ? list.filter((p) => p.membershipId !== m.membershipId)
        : [...list, { ...m, partId: m.parts[0]?.id ?? null }],
    )

  return (
    <ActionModal
      open
      title={T.pickerTitle}
      actionLabel={T.pickerAdd}
      loading={loading}
      actionDisabled={picked.length === 0}
      onClose={onClose}
      onSubmit={() => onConfirm(picked)}
    >
      <TextField
        value={input}
        placeholder={T.pickerSearch}
        aria-label={T.pickerSearch}
        maxLength={100}
        onChange={(e) => setInput(e.target.value)}
      />
      {people.isPending ? <ListSkeleton rows={3} /> : null}
      {people.isError ? (
        <ErrorState onRetry={() => void people.refetch()} />
      ) : null}
      {people.isSuccess && items.length === 0 ? (
        <EmptyState description={T.pickerEmpty} />
      ) : null}
      <div className="choice-list assign-list">
        {items.map((m) => {
          const already = excluded.includes(m.membershipId)
          const pick = picked.find((p) => p.membershipId === m.membershipId)
          return (
            <div key={m.membershipId} className="team-pick">
              <label className="choice-row">
                <input
                  type="checkbox"
                  checked={already || pick !== undefined}
                  disabled={already}
                  onChange={() => toggle(m)}
                />
                <Typography variant="body2">{m.name}</Typography>
                {already ? (
                  <Typography variant="caption1">{T.pickerAlready}</Typography>
                ) : null}
              </label>
              {pick ? (
                <>
                  <PartSelect
                    label={T.pickerPart(m.name)}
                    value={pick.partId}
                    options={optionsFor(m.parts)}
                    onChange={(partId) =>
                      setPicked((list) =>
                        list.map((p) =>
                          p.membershipId === m.membershipId
                            ? { ...p, partId }
                            : p,
                        ),
                      )
                    }
                  />
                </>
              ) : null}
            </div>
          )
        })}
      </div>
      {people.hasNextPage ? (
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          loading={people.isFetchingNextPage}
          onClick={() => void people.fetchNextPage()}
        >
          {T.loadMore}
        </Button>
      ) : null}
      <Typography variant="body2" weight="bold">
        {T.pickerCount(picked.length)}
      </Typography>
    </ActionModal>
  )
}
