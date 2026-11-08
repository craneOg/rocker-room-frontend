import {
  Button,
  RadioGroup,
  RadioGroupItem,
  TextArea,
  Typography,
} from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { isApiError } from '../../shared/api/errors'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { listParts } from '../club/api'
import { withRuleCopy } from '../club/manageApi'
import { showRuleCopy } from '../club/ManageBits'
import { getPerformance, performanceKey } from '../performance/api'
import {
  invalidatePerformance,
  listPerformanceMembers,
} from '../performance/viewApi'
import { createAuditions, type AuditionType } from './auditionApi'
import {
  typeLabel,
  useScheduleOptions,
  useSongOptions,
  whenText,
} from './auditionBits'
import { AUDITION_COPY as T } from './auditionCopy'
import './audition.css'

const MEMO_MAX = 500
const APPLICANT_MAX = 50

type Applicant = { id: string; name: string }

/** `applicantPerformanceMemberIds[1]` -> 1; other fields -> null. */
const applicantIndex = (field: string | undefined) => {
  const m = /^applicantPerformanceMemberIds\[(\d+)\]$/.exec(field ?? '')
  return m ? Number(m[1]) : null
}

/** AUDI-002: register a song audition, or a session audition for one or more applicants. */
export function AuditionCreate() {
  const { clubId = '', performanceId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const base = `/clubs/${clubId}/performances/${performanceId}`

  // A song detail or "재심 등록" opens the form with the target filled; the song then stays fixed.
  const fixedSong = params.get('songId') ?? ''
  const [type, setType] = useState<AuditionType>(
    params.get('type') === 'SESSION' ? 'SESSION' : 'SONG',
  )
  const [songId, setSongId] = useState(fixedSong)
  const [partId, setPartId] = useState(params.get('partId') ?? '')
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const preApplicant = params.get('applicantId')
  const [picking, setPicking] = useState(false)
  const [scheduleId, setScheduleId] = useState('')
  const [memo, setMemo] = useState('')
  const [tried, setTried] = useState(false)
  // Duplicate targets of the last submit (A-06): 'song' or an applicant id.
  const [pendingDup, setPendingDup] = useState<string[]>([])

  const detail = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })
  const songs = useSongOptions(clubId, performanceId)
  const schedules = useScheduleOptions(clubId, performanceId)
  const parts = useQuery({
    queryKey: ['club-parts', clubId],
    queryFn: () => listParts(clubId),
  })
  // ponytail: first 100 applied / approved participants; add search paging if rosters grow.
  const candidates = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'audition-candidates'],
    queryFn: () =>
      listPerformanceMembers(
        clubId,
        performanceId,
        { status: ['APPLIED', 'APPROVED'] },
        0,
        100,
      ),
    enabled: type === 'SESSION',
  })
  const candidateRows = candidates.data?.items ?? []

  // "재심 등록" of a session audition preselects its applicant once the roster is known.
  const [prefilled, setPrefilled] = useState(false)
  if (!prefilled && preApplicant && candidates.data) {
    setPrefilled(true)
    const row = candidateRows.find((r) => r.id === preApplicant)
    if (row) setApplicants([{ id: row.id, name: row.displayName }])
  }

  const status = detail.data?.performance.status
  const closed = status === 'FINISHED' || status === 'CANCELED'

  const errors = {
    song: songId ? undefined : T.needSong,
    part: type === 'SESSION' && !partId ? T.needPart : undefined,
    applicants:
      type === 'SESSION' && applicants.length === 0
        ? T.needApplicants
        : undefined,
  }
  const invalid = Boolean(errors.song ?? errors.part ?? errors.applicants)

  const create = useMutation({
    mutationFn: () =>
      withRuleCopy(
        () =>
          createAuditions(clubId, performanceId, {
            type,
            songId,
            ...(type === 'SESSION'
              ? {
                  partId,
                  applicantPerformanceMemberIds: applicants.map((a) => a.id),
                }
              : {}),
            linkedScheduleId: scheduleId || undefined,
            memo: memo.trim() || undefined,
          }),
        T.ruleCopy,
      ),
    onSuccess: async () => {
      await invalidatePerformance(qc, clubId, performanceId)
      feedback.toast(T.created, 'positive')
      void navigate(`${base}/auditions`)
    },
    onError: (e) => {
      showRuleCopy(e)
      if (isApiError(e, 'DUPLICATE')) {
        const dups = e.details
          .filter((d) => d.reason === 'AUDITION_ALREADY_PENDING')
          .flatMap((d) => {
            const i = applicantIndex(d.field)
            if (i === null) return d.field === 'songId' ? ['song'] : []
            const id = applicants[i]?.id
            return id ? [id] : []
          })
        setPendingDup(dups)
      }
    },
  })

  const submit = () => {
    setTried(true)
    if (invalid) return
    setPendingDup([])
    create.mutate()
  }

  const toggleApplicant = (a: Applicant) =>
    setApplicants((list) =>
      list.some((x) => x.id === a.id)
        ? list.filter((x) => x.id !== a.id)
        : list.length >= APPLICANT_MAX
          ? list
          : [...list, a],
    )

  let body
  if (detail.isError)
    body = <ErrorState onRetry={() => void detail.refetch()} />
  else if (detail.isPending) body = <ListSkeleton rows={3} />
  else if (closed)
    body = <Typography variant="body2">{T.closedPerformance}</Typography>
  else
    body = (
      <div className="audition-form">
        <section className="start-section">
          <Typography variant="body2" weight="bold">
            {T.typeLabel}
          </Typography>
          <RadioGroup
            value={type}
            onValueChange={(v) => setType(v === 'SESSION' ? 'SESSION' : 'SONG')}
          >
            <div className="audition-radio">
              <RadioGroupItem value="SONG" aria-label={typeLabel('SONG')} />
              <div className="start-card-text">
                <Typography variant="body1">{typeLabel('SONG')}</Typography>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {T.typeSongHint}
                </Typography>
              </div>
            </div>
            <div className="audition-radio">
              <RadioGroupItem
                value="SESSION"
                aria-label={typeLabel('SESSION')}
              />
              <div className="start-card-text">
                <Typography variant="body1">{typeLabel('SESSION')}</Typography>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {T.typeSessionHint}
                </Typography>
              </div>
            </div>
          </RadioGroup>
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.secondary"
          >
            {T.teamNotice}
          </Typography>
        </section>

        <section className="start-section">
          <label>
            <Typography variant="body2" weight="bold">
              {T.songLabel}
            </Typography>
            <select
              aria-label={T.songLabel}
              value={songId}
              disabled={fixedSong !== ''}
              onChange={(e) => setSongId(e.target.value)}
            >
              <option value="">{T.songPlaceholder}</option>
              {(songs.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          {songs.isSuccess && songs.data.length === 0 ? (
            <Typography variant="caption1">{T.noSongs}</Typography>
          ) : null}
          {tried && errors.song ? (
            <span className="audition-error">{`* ${errors.song}`}</span>
          ) : null}
          {pendingDup.includes('song') ? (
            <span className="audition-error">{`* ${T.pendingSong}`}</span>
          ) : null}
        </section>

        {type === 'SESSION' ? (
          <section className="start-section">
            <Typography variant="body2" weight="bold">
              {T.applicantsLabel}
            </Typography>
            <ul className="audition-applicants">
              {applicants.map((a) => (
                <li key={a.id}>
                  <div className="start-card-text">
                    <Typography variant="body2">{a.name}</Typography>
                    {pendingDup.includes(a.id) ? (
                      <span className="audition-error">{`* ${T.pendingApplicant}`}</span>
                    ) : null}
                  </div>
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    aria-label={T.removeApplicant(a.name)}
                    onClick={() => toggleApplicant(a)}
                  >
                    {T.removeApplicant(a.name)}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              size="small"
              variant="outlined"
              color="assistive"
              onClick={() => setPicking((p) => !p)}
            >
              {picking ? T.applicantsDone : T.addApplicant}
            </Button>
            {picking ? (
              <div className="choice-list">
                {candidates.isPending ? <ListSkeleton rows={2} /> : null}
                {candidates.isError ? (
                  <ErrorState onRetry={() => void candidates.refetch()} />
                ) : null}
                {candidates.isSuccess && candidateRows.length === 0 ? (
                  <Typography variant="body2">{T.applicantsEmpty}</Typography>
                ) : null}
                {candidateRows.map((r) => (
                  <label key={r.id} className="choice-row">
                    <input
                      type="checkbox"
                      checked={applicants.some((a) => a.id === r.id)}
                      onChange={() =>
                        toggleApplicant({ id: r.id, name: r.displayName })
                      }
                    />
                    <Typography variant="body2">{r.displayName}</Typography>
                  </label>
                ))}
              </div>
            ) : null}
            {tried && errors.applicants ? (
              <span className="audition-error">{`* ${errors.applicants}`}</span>
            ) : null}
            {applicants.length >= APPLICANT_MAX ? (
              <Typography variant="caption1">{T.maxApplicants}</Typography>
            ) : null}
            <label>
              <Typography variant="body2" weight="bold">
                {T.partLabel}
              </Typography>
              <select
                aria-label={T.partLabel}
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
              >
                <option value="">{T.partPlaceholder}</option>
                {(parts.data ?? [])
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            {tried && errors.part ? (
              <span className="audition-error">{`* ${errors.part}`}</span>
            ) : null}
          </section>
        ) : null}

        <section className="start-section">
          <label>
            <Typography variant="body2" weight="bold">
              {T.scheduleLabel}
            </Typography>
            <select
              aria-label={T.scheduleLabel}
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
            >
              <option value="">{T.schedulePlaceholder}</option>
              {(schedules.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {`${s.title} ${whenText(s.startAt)}`}
                </option>
              ))}
            </select>
          </label>
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.secondary"
          >
            {T.scheduleHint}
          </Typography>
          <Link to={`${base}/schedules/new?eventType=AUDITION`}>
            {T.createSchedule}
          </Link>
        </section>

        <FormField label={T.memoLabel}>
          <TextArea
            aria-label={T.memoLabel}
            value={memo}
            placeholder={T.memoPlaceholder}
            maxLength={MEMO_MAX}
            minRows={3}
            onChange={(e) => setMemo(e.target.value.slice(0, MEMO_MAX))}
          />
        </FormField>

        <Button size="large" loading={create.isPending} onClick={submit}>
          {T.submit}
        </Button>
      </div>
    )

  return (
    <div className="start" data-screen-id="AUDI-002">
      <Typography variant="title2" weight="bold" as="h1">
        {T.createTitle}
      </Typography>
      {body}
    </div>
  )
}
