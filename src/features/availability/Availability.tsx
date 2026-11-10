import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useParams } from 'react-router'
import { isApiError } from '../../shared/api/errors'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { formatKstDay, formatKstTime } from '../../shared/lib/time'
import { getPerformance, performanceKey } from '../performance/api'
import {
  getMyParticipation,
  invalidatePerformance,
  listPerformanceMembers,
} from '../performance/viewApi'
import {
  availabilityKey,
  getMemberAvailability,
  getMyAvailability,
  saveMyAvailability,
} from './availabilityApi'
import { AVAIL_COPY as T } from './availabilityCopy'
import {
  applyRepeat,
  clearWeek,
  copyPreviousWeek,
  type Repeat,
} from './availabilityEdit'
import { AvailabilityGrid } from './AvailabilityGrid'
import { AvailabilityRepeat } from './AvailabilityRepeat'
import { WeekNav } from './AvailabilityWeek'
import { useSeasonWeek } from './useSeasonWeek'
import {
  addDays,
  dayOfSlot,
  dayStart,
  hhmm,
  inSeason,
  itemsFromSlots,
  minutesOfSlot,
  mmddWeekday,
  sameSet,
  slotsFromItems,
  toIso,
} from './availabilityTime'
import './availability.css'

const ME = 'me'

/** AVAIL-001: a participant paints the 30-minute cells they can rehearse in; officers can read anyone's. */
export function Availability() {
  const { clubId = '', performanceId = '' } = useParams()
  const session = useSession()
  const qc = useQueryClient()
  const admin = isClubAdmin(session, clubId)
  const key = performanceKey(clubId, performanceId)

  const [fullRange, setFullRange] = useState(false)
  const [target, setTarget] = useState(ME)
  const [edit, setEdit] = useState<Set<number> | null>(null)
  const [repeating, setRepeating] = useState(false)
  const paintMode = useRef<'paint' | 'erase'>('paint')

  const detail = useQuery({
    queryKey: [...key, 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const mine = useQuery({
    queryKey: [...key, 'me'],
    queryFn: () => getMyParticipation(clubId, performanceId),
  })
  const policy = detail.data?.policy
  const status = detail.data?.performance.status
  const season =
    policy?.practiceSeasonStart && policy.practiceSeasonEnd
      ? { start: policy.practiceSeasonStart, end: policy.practiceSeasonEnd }
      : null
  const week = useSeasonWeek(season)

  // ponytail: the first 100 confirmed participants; an officer with more picks them by search later.
  const members = useQuery({
    queryKey: [...key, 'members', 'approved-picker'],
    queryFn: () =>
      listPerformanceMembers(
        clubId,
        performanceId,
        { status: ['APPROVED'] },
        0,
        100,
      ),
    enabled: admin,
  })
  const viewingOther = target !== ME
  const hasOwn = mine.data != null
  const slotsKey = [
    ...availabilityKey(clubId, performanceId),
    target,
    season?.start,
    season?.end,
  ]
  const slotsQuery = useQuery({
    queryKey: slotsKey,
    queryFn: async () => {
      if (!season) return { items: [] }
      const from = toIso(dayStart(season.start))
      const to = toIso(dayStart(addDays(season.end, 1)))
      return viewingOther
        ? getMemberAvailability(clubId, performanceId, target, from, to)
        : getMyAvailability(clubId, performanceId, from, to)
    },
    enabled: season !== null && (viewingOther || hasOwn),
  })
  const server = slotsFromItems(slotsQuery.data?.items ?? [])
  const working = !viewingOther && edit ? edit : server
  // Own edits only: while another member is shown, `server` is theirs and nothing may be saved.
  const dirty = !viewingOther && edit !== null && !sameSet(edit, server)

  // 3 / AV-01: who may paint now.
  const deadline = policy?.availabilityDeadline
  const [now] = useState(() => Date.now())
  const passed = deadline ? now > Date.parse(deadline) : false
  const blockedBy =
    !hasOwn || mine.data?.status !== 'APPROVED'
      ? T.notParticipant
      : status !== 'ACTIVE' && status !== 'LOCKED'
        ? T.readOnlyState
        : policy?.availabilityState !== 'OPEN' || passed
          ? T.readOnlyClosed
          : null
  // Painting before the server slots arrive would build the edit on an empty set, and saving
  // replaces the whole season: the stored slots would be deleted.
  const canEdit = !viewingOther && blockedBy === null && slotsQuery.isSuccess

  const save = useMutation({
    mutationFn: () => {
      if (!season) throw new Error('no season')
      // ponytail: the server replaces only the requested [from, to) — this screen sends the whole
      // season at once; saving per week is a follow-up.
      return saveMyAvailability(clubId, performanceId, {
        from: toIso(dayStart(season.start)),
        to: toIso(dayStart(addDays(season.end, 1))),
        slots: itemsFromSlots(
          [...working].filter((t) =>
            inSeason(dayOfSlot(t), season.start, season.end),
          ),
        ),
      })
    },
    onSuccess: async (saved) => {
      // Keep the saved slots in the cache even if the refetch below fails.
      qc.setQueryData(slotsKey, saved)
      await invalidatePerformance(qc, clubId, performanceId)
      setEdit(null)
      feedback.toast(T.saved, 'positive')
    },
    onError: (e) => {
      // A 400 is shown next to the input in other screens; here there is no field, so a toast.
      // OUTSIDE_RANGE / SLOT_NOT_ALIGNED would be a bug of this screen: the generic text is enough.
      if (isApiError(e, 'VALIDATION_ERROR'))
        feedback.toast(
          e.details.some((d) => d.reason === 'OUTSIDE_PRACTICE_SEASON')
            ? T.outsideSeason
            : COPY.checkInput,
          'negative',
        )
    },
  })

  // 5-1: leaving with unsaved cells asks first.
  const blocker = useBlocker(dirty && !save.isPending)
  const asking = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked') {
      asking.current = false
      return
    }
    if (asking.current) return
    asking.current = true
    // Closing the dialog (Esc, cancel) keeps editing; only the explicit button discards.
    void feedback
      .dialog({
        title: T.leaveTitle,
        description: T.leaveDescription,
        cancelLabel: T.keepEditing,
        confirmLabel: T.leaveDiscard,
        danger: true,
      })
      .then((c) => {
        asking.current = false
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

  const set = (next: Set<number>) => setEdit(next)
  const paint = (ms: number, mode: 'paint' | 'erase') => {
    if (!season || !inSeason(dayOfSlot(ms), season.start, season.end)) return
    setEdit((cur) => {
      const next = new Set(cur ?? server)
      if (mode === 'paint') next.add(ms)
      else next.delete(ms)
      return next
    })
  }

  const names = new Map(
    (members.data?.items ?? []).map((m) => [m.id, m.displayName]),
  )
  const header = season ? (
    <>
      <Typography variant="body2">
        {[
          T.season(season.start, season.end),
          deadline
            ? T.deadline(`${formatKstDay(deadline)} ${formatKstTime(deadline)}`)
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Typography>
      <Typography
        variant="caption1"
        color="semantic.foreground.neutral.secondary"
      >
        {T.guide}
      </Typography>
      <Typography variant="body2" weight="bold">
        {T.total(working.size)}
      </Typography>
    </>
  ) : null

  return (
    <div className="avail" data-screen-id="AVAIL-001">
      {detail.isPending || mine.isPending ? <ListSkeleton /> : null}
      {detail.isError || mine.isError ? (
        <ErrorState
          onRetry={() => {
            void detail.refetch()
            void mine.refetch()
          }}
        />
      ) : null}
      {detail.isSuccess && mine.isSuccess ? (
        <>
          {header}
          {admin ? (
            <label className="avail-field">
              {T.viewTarget}
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value={ME}>{T.mineOption}</option>
                {(members.data?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {viewingOther ? (
            <Typography variant="body2">
              {T.memberReadOnly(names.get(target) ?? '')}
            </Typography>
          ) : blockedBy ? (
            <Typography variant="body2">{blockedBy}</Typography>
          ) : null}

          {season === null ? (
            <Typography variant="body2">{T.noSeason}</Typography>
          ) : (
            <>
              <WeekNav monday={week.monday} prev={week.prev} next={week.next} />
              <div className="avail-tools">
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  aria-pressed={fullRange}
                  onClick={() => setFullRange((v) => !v)}
                >
                  {`${T.fullRange} ${fullRange ? T.fullRangeOn : T.fullRangeOff}`}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  disabled={!canEdit}
                  onClick={() => set(clearWeek(working, week.monday))}
                >
                  {T.clearWeek}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  disabled={!canEdit || week.index === 0}
                  onClick={() =>
                    set(copyPreviousWeek(working, week.monday, season))
                  }
                >
                  {T.copyPrevious}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  disabled={!canEdit}
                  onClick={() => setRepeating(true)}
                >
                  {T.repeat}
                </Button>
              </div>

              {slotsQuery.isError ? (
                <ErrorState onRetry={() => void slotsQuery.refetch()} />
              ) : (
                <AvailabilityGrid
                  days={week.days}
                  fullRange={fullRange}
                  ariaLabel={T.gridLabel}
                  cell={(ms, day) => ({
                    label: `${mmddWeekday(day)} ${hhmm(minutesOfSlot(ms))}`,
                    selected: working.has(ms),
                    disabled:
                      !canEdit || !inSeason(day, season.start, season.end),
                  })}
                  onStart={
                    canEdit
                      ? (ms) => {
                          paintMode.current = working.has(ms)
                            ? 'erase'
                            : 'paint'
                          paint(ms, paintMode.current)
                        }
                      : undefined
                  }
                  onOver={(ms) => paint(ms, paintMode.current)}
                />
              )}
            </>
          )}
        </>
      ) : null}

      {dirty ? (
        <div className="avail-bar" role="group" aria-label={T.dirtyBar}>
          <Typography variant="body2">{T.dirtyBar}</Typography>
          <Button
            variant="outlined"
            color="assistive"
            disabled={save.isPending}
            onClick={() => setEdit(null)}
          >
            {T.revert}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {T.save}
          </Button>
        </div>
      ) : null}

      {repeating && season ? (
        <AvailabilityRepeat
          onClose={() => setRepeating(false)}
          onApply={(r: Repeat) => {
            set(applyRepeat(working, r, week.monday, season))
            setRepeating(false)
          }}
        />
      ) : null}
    </div>
  )
}
