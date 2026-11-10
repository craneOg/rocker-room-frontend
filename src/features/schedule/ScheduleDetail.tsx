import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { withConfirmation } from '../../shared/api/handlers'
import { isClubAdmin, useSession } from '../../shared/auth/session'
import { Badge } from '../../shared/ui/Badge'
import { feedback, warningsStore } from '../../shared/ui/feedbackBus'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { WarningBanner } from '../../shared/ui/WarningBanner'
import { withRuleCopy } from '../club/manageApi'
import { showRuleCopy } from '../club/ManageBits'
import { getPerformance, performanceKey } from '../performance/api'
import {
  cancelSchedule,
  choicesKey,
  confirmSchedule,
  getConflicts,
  getSchedule,
  invalidateSchedules,
  listSongChoices,
  listTeamChoices,
  scheduleKey,
  unconfirmSchedule,
  type ScheduleDetail as Detail,
  type ScheduleWarning,
} from './scheduleApi'
import { rangeLabel, warningTexts } from './scheduleBits'
import { SCHEDULE_COPY as T } from './scheduleCopy'
import './schedule.css'

function Attendees({ data, userId }: { data: Detail; userId?: string }) {
  // The requester comes first, labeled "나".
  const rows = [...data.participants].sort(
    (a, b) => Number(b.userId === userId) - Number(a.userId === userId),
  )
  return (
    <section className="schd-section" aria-label={T.attendees(rows.length)}>
      <Typography variant="body1" weight="bold" as="h2">
        {T.attendees(rows.length)}
      </Typography>
      <ul className="schd-people">
        {rows.map((p) => (
          <li key={p.performanceMemberId} className="schd-person">
            <span>{p.userId === userId ? T.me : p.displayName}</span>
            {p.parts.length ? (
              <span className="schd-part">
                {p.parts.map((x) => x.name).join(', ')}
              </span>
            ) : null}
            {p.memberType === 'GUEST' ? (
              <Badge kind="identity" value="GUEST" />
            ) : null}
            {p.isSupportPlayer ? (
              <Badge kind="identity" value="NON_TEAM_PLAYER" />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** SCHD-002: time, place, target and attendees; officers confirm, edit, revert or cancel. */
export function ScheduleDetail() {
  const { clubId = '', performanceId = '', scheduleId = '' } = useParams()
  const session = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const admin = isClubAdmin(session, clubId)
  // The form hands over the warnings of a save it just made (COM-003 #4).
  const { state } = useLocation() as { state: { warnings?: string[] } | null }
  const [saved, setSaved] = useState(state?.warnings ?? [])
  const base = `/clubs/${clubId}/performances/${performanceId}`

  const detail = useQuery({
    queryKey: [...scheduleKey(clubId, performanceId), scheduleId, 'detail'],
    queryFn: () => getSchedule(clubId, performanceId, scheduleId),
  })
  const perf = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const conflicts = useQuery({
    queryKey: [...scheduleKey(clubId, performanceId), scheduleId, 'conflicts'],
    queryFn: () => getConflicts(clubId, performanceId, scheduleId),
    enabled: detail.isSuccess,
  })
  const teams = useQuery({
    queryKey: [...choicesKey(clubId, performanceId), 'teams'],
    queryFn: () => listTeamChoices(clubId, performanceId),
  })
  const songs = useQuery({
    queryKey: [...choicesKey(clubId, performanceId), 'songs'],
    queryFn: () => listSongChoices(clubId, performanceId),
  })

  const s = detail.data?.schedule
  const done = async (warnings: ScheduleWarning[], toast: string) => {
    await invalidateSchedules(qc, clubId, performanceId)
    const texts = warningTexts(warnings)
    if (texts.length) warningsStore.set(texts)
    feedback.toast(toast, 'positive')
  }

  const confirm = useMutation({
    mutationFn: async () => {
      const choice = await feedback.dialog({
        title: T.confirmDialogTitle,
        description: T.confirmDialogBody,
        cancelLabel: T.dialogCancel,
        confirmLabel: T.confirmDialogAction,
      })
      if (choice !== 'confirm' || !s) return null
      return withRuleCopy(
        () =>
          withConfirmation((confirmed) =>
            confirmSchedule(clubId, performanceId, scheduleId, {
              version: s.version,
              confirmed,
            }),
          ),
        { SCHEDULE_TARGET_EMPTY: T.targetEmptyRule },
      )
    },
    onSuccess: (r) => (r ? done(r.warnings, T.confirmedToast) : undefined),
    onError: showRuleCopy,
  })
  const unconfirm = useMutation({
    mutationFn: async () => {
      const choice = await feedback.dialog({
        title: T.unconfirmDialogTitle,
        description: T.unconfirmDialogBody,
        cancelLabel: T.dialogCancel,
        confirmLabel: T.unconfirmDialogAction,
      })
      if (choice !== 'confirm' || !s) return null
      return unconfirmSchedule(clubId, performanceId, scheduleId, s.version)
    },
    onSuccess: (r) => (r ? done([], T.unconfirmedToast) : undefined),
  })
  const cancel = useMutation({
    mutationFn: async () => {
      const choice = await feedback.dialog({
        title: T.cancelDialogTitle,
        description: T.cancelDialogBody,
        cancelLabel: T.cancelDialogClose,
        confirmLabel: T.cancelDialogAction,
        danger: true,
      })
      if (choice !== 'confirm' || !s) return null
      return cancelSchedule(clubId, performanceId, scheduleId, s.version)
    },
    onSuccess: (r) => (r ? done(r.warnings, T.canceledToast) : undefined),
  })
  const busy = confirm.isPending || unconfirm.isPending || cancel.isPending

  if (detail.isError)
    return <ErrorState onRetry={() => void detail.refetch()} />
  if (!detail.data || !s)
    return (
      <div className="schd" data-screen-id="SCHD-002">
        <ListSkeleton rows={4} />
      </div>
    )

  const ended =
    perf.data?.performance.status === 'FINISHED' ||
    perf.data?.performance.status === 'CANCELED'
  const nameOf = (list: typeof teams.data, id: string, kind: string) =>
    list?.find((c) => c.id === id)?.label ?? `${kind} ${id}`
  const checks = warningTexts(conflicts.data ?? [])

  return (
    <div className="schd" data-screen-id="SCHD-002">
      <WarningBanner warnings={saved} onClose={() => setSaved([])} />
      <header className="schd-section">
        <Typography variant="title2" weight="bold" as="h1">
          {s.title}
        </Typography>
        <div className="schd-badges">
          <Badge kind="scheduleType" value={s.eventType} />
          <Badge kind="schedule" value={s.status} />
        </div>
        <Link to={base}>{s.performanceTitle}</Link>
      </header>

      <section className="schd-section">
        <Typography variant="body1">
          {rangeLabel(s.startAt, s.endAt)}
        </Typography>
        <Typography variant="body2">{s.location ?? T.locationNone}</Typography>
      </section>

      <section className="schd-section" aria-label={T.targetTitle}>
        <Typography variant="body1" weight="bold" as="h2">
          {T.targetTitle}
        </Typography>
        {s.forAllParticipants ? (
          <span className="schd-person">{T.targetAll}</span>
        ) : (
          <ul className="schd-people">
            {s.teamIds.map((id) => (
              <li key={`t${id}`}>
                <Link className="schd-person" to={`${base}/teams/${id}`}>
                  {nameOf(teams.data, id, '팀')}
                </Link>
              </li>
            ))}
            {s.songIds.map((id) => (
              <li key={`s${id}`}>
                <Link className="schd-person" to={`${base}/songs/${id}`}>
                  {nameOf(songs.data, id, '곡')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Attendees data={detail.data} userId={session.me?.id} />

      {s.memo ? (
        <section className="schd-section" aria-label={T.memoTitle}>
          <Typography variant="body1" weight="bold" as="h2">
            {T.memoTitle}
          </Typography>
          <Typography variant="body2" className="schd-memo">
            {s.memo}
          </Typography>
        </section>
      ) : null}

      {checks.length ? (
        <section className="schd-section" aria-label={T.conflictsTitle}>
          <Typography variant="body1" weight="bold" as="h2">
            {T.conflictsTitle}
          </Typography>
          <ul className="warning-list">
            {checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {admin && s.status !== 'CANCELED' ? (
        <div className="schd-actions">
          {s.status === 'TENTATIVE' ? (
            <Button
              loading={confirm.isPending}
              disabled={busy}
              onClick={() => confirm.mutate()}
            >
              {T.confirmButton}
            </Button>
          ) : (
            <Button
              variant="outlined"
              loading={unconfirm.isPending}
              disabled={busy}
              onClick={() => unconfirm.mutate()}
            >
              {T.unconfirmButton}
            </Button>
          )}
          {ended ? null : (
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => void navigate(`${base}/schedules/${s.id}/edit`)}
            >
              {T.editButton}
            </Button>
          )}
          <Button
            variant="outlined"
            loading={cancel.isPending}
            disabled={busy}
            onClick={() => cancel.mutate()}
          >
            {T.cancelButton}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
