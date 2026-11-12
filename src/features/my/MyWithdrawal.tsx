import { Button, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { isApiError } from '../../shared/api/errors'
import { feedback } from '../../shared/ui/feedbackBus'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { MY_COPY as T } from './copy'
import {
  getWithdrawalPreview,
  withdrawService,
  type TeamTransfer,
  type WithdrawalBody,
  type WithdrawalClub,
} from './withdrawApi'

const KEEP_DAYS = 90

/** "2027.02.08" of today + 90 days in KST. */
const recoverDate = () => {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + KEEP_DAYS * 86_400_000))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}.${get('month')}.${get('day')}`
}

const NOTICE = [
  T.noticeLeave,
  T.noticeAnonymous,
  T.noticeKeep,
  T.noticeHistory,
  T.noticePerformance,
  T.noticeKakao,
]

/** MY-004: notice -> who takes over -> type the phrase, then one request (W1). */
export function MyWithdrawal() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [checked, setChecked] = useState(false)
  const [phrase, setPhrase] = useState('')
  // clubId -> chosen officer successor (userId); teamId -> chosen new leader (membershipId).
  const [clubPicks, setClubPicks] = useState<Record<string, string>>({})
  const [teamPicks, setTeamPicks] = useState<Record<string, string>>({})
  const [doneFor, setDoneFor] = useState<string | null>(null)

  const preview = useQuery({
    queryKey: ['me', 'withdrawal-preview'],
    queryFn: getWithdrawalPreview,
    enabled: step >= 2,
    gcTime: 0,
  })

  const withdraw = useMutation({
    mutationFn: (body: WithdrawalBody) => withdrawService(body),
    onSuccess: () => setDoneFor(recoverDate()),
    onError: (e) => {
      if (
        isApiError(e, 'RULE_VIOLATION') &&
        e.details.some((d) => d.reason === 'SUCCESSOR_NOT_ELIGIBLE')
      ) {
        feedback.toast(T.successorGone, 'negative')
        void preview.refetch()
        setStep(2)
      }
    },
  })

  if (doneFor !== null)
    return (
      <div className="start" data-screen-id="MY-004">
        <Typography variant="title2" weight="bold" as="h1">
          {T.doneTitle}
        </Typography>
        <Typography variant="body1">{T.doneThanks}</Typography>
        <Typography variant="body2">{T.doneRecover(doneFor)}</Typography>
        {/* A full load: the session is gone, so the app starts clean. */}
        <Button onClick={() => window.location.assign('/')}>{T.toStart}</Button>
      </div>
    )

  const submit = () => {
    const clubs = preview.data?.clubs ?? []
    withdraw.mutate({
      successors: clubs.flatMap((c) => {
        const userId = clubPicks[c.clubId] ?? c.succession.candidateUserId
        return c.succession.type === 'DESIGNATED_OR_EARLIEST' && userId
          ? [{ clubId: c.clubId, userId }]
          : []
      }),
      teamLeaderSuccessors: clubs.flatMap((c) =>
        c.teamLeaderTransfers.flatMap((t) => {
          const membershipId =
            teamPicks[t.teamId] ??
            t.defaultMembershipId ??
            t.candidates[0]?.membershipId
          return t.teamStatus === 'APPROVED' && membershipId
            ? [{ teamId: t.teamId, membershipId }]
            : []
        }),
      ),
      confirmed: true,
    })
  }

  return (
    <div className="start" data-screen-id="MY-004">
      <Typography variant="title2" weight="bold" as="h1">
        {T.withdrawTitle}
      </Typography>
      <Typography variant="caption1">{T.stepLabel(step)}</Typography>

      {step === 1 ? (
        <>
          <ul className="perf-plain-list">
            {NOTICE.map((t) => (
              <li key={t}>
                <Typography variant="body2">{t}</Typography>
              </li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />{' '}
            {T.noticeCheck}
          </label>
          <Button disabled={!checked} onClick={() => setStep(2)}>
            {T.next}
          </Button>
        </>
      ) : null}

      {step === 2 ? (
        preview.isPending ? (
          <ListSkeleton rows={3} />
        ) : !preview.data ? (
          <ErrorState onRetry={() => void preview.refetch()} />
        ) : (
          <>
            <Succession
              clubs={preview.data.clubs}
              clubPicks={clubPicks}
              teamPicks={teamPicks}
              onClub={(clubId, userId) =>
                setClubPicks((p) => ({ ...p, [clubId]: userId }))
              }
              onTeam={(teamId, membershipId) =>
                setTeamPicks((p) => ({ ...p, [teamId]: membershipId }))
              }
            />
            <Button onClick={() => setStep(3)}>{T.next}</Button>
          </>
        )
      ) : null}

      {step === 3 ? (
        <>
          <Typography variant="body2">{T.typePrompt}</Typography>
          <TextField
            value={phrase}
            aria-label={T.typePrompt}
            onChange={(e) => setPhrase(e.target.value)}
          />
          <Button
            color="negative"
            loading={withdraw.isPending}
            disabled={phrase !== T.typePhrase}
            onClick={submit}
          >
            {T.doWithdraw}
          </Button>
        </>
      ) : null}
    </div>
  )
}

const hasStakes = (c: WithdrawalClub) =>
  c.role === 'CLUB_ADMIN' || c.teamLeaderTransfers.length > 0

function Succession(p: {
  clubs: WithdrawalClub[]
  clubPicks: Record<string, string>
  teamPicks: Record<string, string>
  onClub: (clubId: string, userId: string) => void
  onTeam: (teamId: string, membershipId: string) => void
}) {
  const cards = p.clubs.filter(hasStakes)
  if (cards.length === 0)
    return <Typography variant="body2">{T.nothingToHand}</Typography>
  return (
    <>
      {cards.map((c) => (
        <section
          key={c.clubId}
          className="perf-section"
          aria-label={c.clubName}
        >
          <Typography variant="body1" weight="bold">
            {c.clubName}
          </Typography>
          {c.role === 'CLUB_ADMIN' ? <ClubAdmin c={c} {...p} /> : null}
          {c.teamLeaderTransfers.map((t) => (
            <TeamLeader
              key={t.teamId}
              t={t}
              picks={p.teamPicks}
              onPick={p.onTeam}
            />
          ))}
        </section>
      ))}
    </>
  )
}

function ClubAdmin({
  c,
  clubPicks,
  onClub,
}: {
  c: WithdrawalClub
  clubPicks: Record<string, string>
  onClub: (clubId: string, userId: string) => void
}) {
  const s = c.succession
  if (s.type === 'NOT_REQUIRED')
    return <Typography variant="body2">{T.adminNotRequired}</Typography>
  if (s.type === 'NONE' || s.candidates.length === 0)
    return <Typography variant="body2">{T.clubDeactivated}</Typography>
  return (
    <label className="song-field">
      <Typography variant="body2">{T.adminPick}</Typography>
      <select
        aria-label={`${c.clubName} ${T.adminPick}`}
        value={clubPicks[c.clubId] ?? s.candidateUserId ?? ''}
        onChange={(e) => onClub(c.clubId, e.target.value)}
      >
        {s.candidates.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.displayName}
          </option>
        ))}
      </select>
    </label>
  )
}

function TeamLeader({
  t,
  picks,
  onPick,
}: {
  t: TeamTransfer
  picks: Record<string, string>
  onPick: (teamId: string, membershipId: string) => void
}) {
  if (t.teamStatus === 'DRAFT')
    return <Typography variant="body2">{T.teamDeleted(t.teamName)}</Typography>
  if (t.teamStatus === 'SUBMITTED') {
    const next = t.candidates.find(
      (m) => m.membershipId === t.defaultMembershipId,
    )
    return (
      <Typography variant="body2">
        {next
          ? T.teamAuto(t.teamName, next.displayName)
          : T.teamAutoNone(t.teamName)}
      </Typography>
    )
  }
  if (t.candidates.length === 0)
    return <Typography variant="body2">{T.teamAutoNone(t.teamName)}</Typography>
  return (
    <label className="song-field">
      <Typography variant="body2">{T.teamLeaderPick(t.teamName)}</Typography>
      <select
        aria-label={T.teamLeaderPick(t.teamName)}
        value={
          picks[t.teamId] ??
          t.defaultMembershipId ??
          t.candidates[0]?.membershipId ??
          ''
        }
        onChange={(e) => onPick(t.teamId, e.target.value)}
      >
        {t.candidates.map((m) => (
          <option key={m.membershipId} value={m.membershipId}>
            {m.displayName}
          </option>
        ))}
      </select>
    </label>
  )
}
