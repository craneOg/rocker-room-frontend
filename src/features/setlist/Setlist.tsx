import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { feedback } from '../../shared/ui/feedbackBus'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { listParts } from '../club/api'
import { getPerformance, performanceKey } from '../performance/api'
import {
  getMyParticipation,
  invalidatePerformance,
} from '../performance/viewApi'
import { SETLIST_COPY as T } from './setlistCopy'
import {
  getSetlist,
  saveSetlistOrder,
  SetlistChangedError,
  setlistKey,
  type SetlistEntry,
} from './setlistApi'
import {
  arrange,
  moveItem,
  overlapWithPrevious,
  sameArrangement,
  toOrderItems,
  type Arrangement,
} from './setlistOrder'
import './setlist.css'

/** SET-001: the confirmed songs in performance order; officers rearrange and save in one request. */
export function Setlist() {
  const { clubId = '', performanceId = '' } = useParams()
  const session = useSession()
  const qc = useQueryClient()
  const admin = isClubAdmin(session, clubId)
  const key = performanceKey(clubId, performanceId)

  const [showPlayers, setShowPlayers] = useState(false)
  const [draft, setDraft] = useState<Arrangement | null>(null)
  const [asking, setAsking] = useState(false)

  const setlist = useQuery({
    queryKey: setlistKey(clubId, performanceId),
    queryFn: () => getSetlist(clubId, performanceId),
  })
  const detail = useQuery({
    queryKey: [...key, 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const mine = useQuery({
    queryKey: [...key, 'me'],
    queryFn: () => getMyParticipation(clubId, performanceId),
  })
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  const partName = new Map((parts.data ?? []).map((p) => [p.id, p.name]))

  const items = setlist.data?.items
  const base = arrange(items ?? [])
  const view = draft ?? base
  const status = detail.data?.performance.status
  const locked = status === 'LOCKED'
  const editable =
    admin && (status === 'DRAFT' || status === 'ACTIVE' || status === 'LOCKED')
  const dirty = draft !== null && !sameArrangement(draft, base)
  const mineId = mine.data?.id

  const save = useMutation({
    mutationFn: (reason?: string) =>
      saveSetlistOrder(clubId, performanceId, {
        version: setlist.data?.performanceVersion ?? '',
        items: toOrderItems(draft ?? base),
        ...(reason === undefined ? {} : { reason }),
      }),
    onSuccess: async () => {
      setAsking(false)
      await invalidatePerformance(qc, clubId, performanceId)
      setDraft(null)
      feedback.toast(T.saved, 'positive')
    },
    onError: async (e) => {
      setAsking(false)
      if (!(e instanceof SetlistChangedError)) return
      // 4-2: the list of confirmed songs moved on; reload it and let the officer redo the order.
      await feedback.dialog({
        title: T.changedTitle,
        description: T.changedDescription,
        confirmLabel: T.confirm,
      })
      const fresh = await qc.fetchQuery({
        queryKey: setlistKey(clubId, performanceId),
        queryFn: () => getSetlist(clubId, performanceId),
        staleTime: 0,
      })
      setDraft(arrange(fresh.items))
    },
  })

  // 4-1: leaving with an unsaved order asks first.
  const blocker = useBlocker(dirty && !save.isPending)
  const askingLeave = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked') {
      askingLeave.current = false
      return
    }
    if (askingLeave.current) return
    askingLeave.current = true
    void feedback
      .dialog({
        title: T.leaveTitle,
        cancelLabel: T.keepEditing,
        confirmLabel: T.leave,
        danger: true,
      })
      .then((c) => {
        askingLeave.current = false
        if (c === 'confirm') blocker.proceed()
        else blocker.reset()
      })
  }, [blocker])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const edit = (next: Arrangement) => setDraft(next)
  const place = (entry: SetlistEntry) =>
    edit({
      placed: [...view.placed, entry],
      unplaced: view.unplaced.filter((e) => e.song.id !== entry.song.id),
    })
  const unplace = (entry: SetlistEntry) =>
    edit({
      placed: view.placed.filter((e) => e.song.id !== entry.song.id),
      unplaced: [...view.unplaced, entry],
    })
  const move = (from: number, to: number) =>
    edit({ ...view, placed: moveItem(view.placed, from, to) })

  const path = `/clubs/${clubId}/performances/${performanceId}`
  const total = view.placed.length + view.unplaced.length

  const playersOf = (e: SetlistEntry) =>
    e.sessions.length === 0
      ? T.noPlayers
      : e.sessions
          .map((s) => {
            const part = partName.get(s.partId)
            return part ? `${part} ${s.displayName}` : s.displayName
          })
          .join(', ')

  return (
    <div className="setlist" data-screen-id="SET-001">
      {setlist.isPending ? <ListSkeleton /> : null}
      {setlist.isError ? (
        <ErrorState onRetry={() => void setlist.refetch()} />
      ) : null}
      {setlist.isSuccess ? (
        <>
          <section className="setlist-summary">
            <Typography variant="body1" weight="bold">
              {T.summary(total, view.placed.length)}
            </Typography>
            {locked || status === 'FINISHED' ? (
              <span className="perf-chip">{T.confirmedBadge}</span>
            ) : null}
            <label className="choice-row">
              <input
                type="checkbox"
                checked={showPlayers}
                onChange={(e) => setShowPlayers(e.target.checked)}
              />
              <Typography variant="body2">{T.showPlayers}</Typography>
            </label>
            {editable && draft === null && total > 0 ? (
              <Button
                size="small"
                variant="outlined"
                color="assistive"
                onClick={() => setDraft(base)}
              >
                {T.edit}
              </Button>
            ) : null}
          </section>

          {total === 0 ? <EmptyState description={T.empty} /> : null}

          <ol className="setlist-list" aria-label={T.title}>
            {view.placed.map((e, i) => {
              const prev = view.placed[i - 1]
              const streak = prev ? overlapWithPrevious(prev, e) : []
              const playing =
                mineId !== undefined &&
                e.sessions.some((s) => s.performanceMemberId === mineId)
              return (
                <li key={e.song.id}>
                  {streak.length > 0 ? (
                    <p className="setlist-streak">{T.streak(streak)}</p>
                  ) : null}
                  <div
                    className={playing ? 'setlist-row is-mine' : 'setlist-row'}
                  >
                    <span className="setlist-no">{i + 1}</span>
                    <div className="setlist-main">
                      <Link
                        to={`${path}/songs/${e.song.id}`}
                        className="setlist-song"
                      >
                        {e.song.title} – {e.song.artist}
                      </Link>
                      {e.song.assignedTeamName ? (
                        <Typography
                          variant="caption1"
                          color="semantic.foreground.neutral.secondary"
                        >
                          {e.song.assignedTeamName}
                        </Typography>
                      ) : null}
                      {playing ? (
                        <span className="setlist-mine">{T.mine}</span>
                      ) : null}
                      {showPlayers ? (
                        <Typography variant="caption1">
                          {playersOf(e)}
                        </Typography>
                      ) : null}
                    </div>
                    {draft ? (
                      <div className="setlist-tools">
                        <Button
                          size="small"
                          variant="outlined"
                          color="assistive"
                          disabled={i === 0}
                          onClick={() => move(i, i - 1)}
                        >
                          {T.moveUp}{' '}
                          <span className="setlist-sr">{e.song.title}</span>
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="assistive"
                          disabled={i === view.placed.length - 1}
                          onClick={() => move(i, i + 1)}
                        >
                          {T.moveDown}{' '}
                          <span className="setlist-sr">{e.song.title}</span>
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="assistive"
                          // X-04: taking a song out of a confirmed setlist would break L-01.
                          disabled={locked}
                          onClick={() => unplace(e)}
                        >
                          {T.remove}{' '}
                          <span className="setlist-sr">{e.song.title}</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>

          {admin && view.unplaced.length > 0 ? (
            <section className="setlist-unplaced">
              <Typography variant="body1" weight="bold">
                {status === 'DRAFT' || status === 'ACTIVE'
                  ? `${T.unplacedTitle} · ${T.unplacedNeeded(view.unplaced.length)}`
                  : T.unplacedTitle}
              </Typography>
              <ul className="setlist-list">
                {view.unplaced.map((e) => (
                  <li key={e.song.id} className="setlist-row">
                    <div className="setlist-main">
                      <Link
                        to={`${path}/songs/${e.song.id}`}
                        className="setlist-song"
                      >
                        {e.song.title} – {e.song.artist}
                      </Link>
                      {e.song.assignedTeamName ? (
                        <Typography
                          variant="caption1"
                          color="semantic.foreground.neutral.secondary"
                        >
                          {e.song.assignedTeamName}
                        </Typography>
                      ) : null}
                      {showPlayers ? (
                        <Typography variant="caption1">
                          {playersOf(e)}
                        </Typography>
                      ) : null}
                    </div>
                    {editable ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="assistive"
                        onClick={() => place(e)}
                      >
                        {T.addToSetlist}{' '}
                        <span className="setlist-sr">{e.song.title}</span>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {admin && status === 'ACTIVE' && draft === null ? (
            <section className="setlist-lock">
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {T.lockHint}
              </Typography>
              <Link to={`${path}/status`}>{T.toLock}</Link>
            </section>
          ) : null}
        </>
      ) : null}

      {draft ? (
        <div className="setlist-bar" role="group" aria-label={T.edit}>
          <Button
            variant="outlined"
            color="assistive"
            disabled={save.isPending}
            onClick={() => setDraft(null)}
          >
            {T.cancel}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!dirty}
            onClick={() => (locked ? setAsking(true) : save.mutate(undefined))}
          >
            {T.save}
          </Button>
        </div>
      ) : null}

      <ReasonModal
        open={asking}
        title={T.reasonTitle}
        description={T.reasonDescription}
        actionLabel={T.save}
        loading={save.isPending}
        onSubmit={(reason) => save.mutate(reason)}
        onClose={() => setAsking(false)}
      />
    </div>
  )
}
