import {
  Button,
  SectionMessage,
  Switch,
  TextField,
  Typography,
} from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useParams } from 'react-router'
import { ConfirmationDeclinedError } from '../../shared/api/errors'
import { withConfirmation } from '../../shared/api/handlers'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { RadioList, showRuleCopy } from '../club/ManageBits'
import { withRuleCopy } from '../club/manageApi'
import { getPerformance, performanceKey } from './api'
import {
  affectedVoteCount,
  changeVoteMethod,
  invalidatePerformance,
  updatePolicy,
  validateVoteMethod,
} from './policyApi'
import { POLICY_COPY as T } from './policyCopy'
import {
  buildPatch,
  formProblem,
  toForm,
  type FeatureKey,
  type PolicyForm,
} from './policyForm'
import type { PerformanceDetail } from './types'
import './policy.css'

// ponytail: the API leaves `candidateScope` as "enum"; the team value is assumed to be TEAM.
const SCOPE_ALL = 'ALL_PARTICIPANTS'
const SCOPE_TEAM = 'TEAM'

const STATE_OPTIONS = [
  { value: 'DISABLED', label: T.stateDisabled },
  { value: 'CLOSED', label: T.stateClosed },
  { value: 'OPEN', label: T.stateOpen },
]

/** "제한 없음" or a number (1 or more). */
function LimitField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  // Only the checkbox sets this: clearing the text to type a new number must not flip it.
  const [checked, setChecked] = useState(value === '')
  const unlimited = checked && value === ''
  return (
    <div className="policy-limit">
      <Typography variant="body2">{label}</Typography>
      <label className="policy-inline">
        <input
          type="checkbox"
          checked={unlimited}
          disabled={disabled}
          onChange={(e) => {
            setChecked(e.target.checked)
            onChange(e.target.checked ? '' : '1')
          }}
        />
        <span>{T.unlimited}</span>
      </label>
      <TextField
        aria-label={label}
        inputMode="numeric"
        value={value}
        disabled={disabled || unlimited}
        status={unlimited || /^[1-9]\d*$/.test(value) ? 'normal' : 'negative'}
        onChange={(e) => onChange(e.target.value.trim())}
        // An empty box that is not "제한 없음" would save as no limit: put a number back.
        onBlur={() => {
          if (!unlimited && value === '') onChange('1')
        }}
      />
    </div>
  )
}

function Card({
  feature,
  form,
  disabled,
  set,
  hint,
  children,
}: {
  feature: FeatureKey
  form: PolicyForm
  disabled: boolean
  set: <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) => void
  hint?: string
  children?: ReactNode
}) {
  const title = T.features[feature]
  return (
    <section className="policy-card" aria-label={title}>
      <Typography variant="body1" weight="bold" as="h2">
        {title}
      </Typography>
      {hint ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {hint}
        </Typography>
      ) : null}
      <fieldset className="policy-state" disabled={disabled}>
        <RadioList
          name={`${title} 사용 여부`}
          value={form[`${feature}State`]}
          options={STATE_OPTIONS}
          onChange={(v) => set(`${feature}State`, v)}
        />
      </fieldset>
      <label className="policy-field">
        <Typography variant="body2">{`${title} ${T.deadline}`}</Typography>
        <input
          type="datetime-local"
          step={1800}
          disabled={disabled}
          value={form[`${feature}Deadline`]}
          onChange={(e) => set(`${feature}Deadline`, e.target.value)}
        />
      </label>
      <Typography
        variant="caption1"
        color="semantic.foreground.neutral.secondary"
      >
        {T.deadlineHint}
      </Typography>
      {children}
    </section>
  )
}

function PublicSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="policy-switch">
      <Typography variant="body2">{label}</Typography>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}

function PolicyEditor({
  clubId,
  performanceId,
  detail,
}: {
  clubId: string
  performanceId: string
  detail: PerformanceDetail
}) {
  const queryClient = useQueryClient()
  const { performance, policy } = detail
  // 2.1: only DRAFT and ACTIVE can be changed.
  const editable =
    performance.status === 'DRAFT' || performance.status === 'ACTIVE'
  const [initial] = useState(() => toForm(policy))
  const [form, setForm] = useState(initial)
  const set = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const voteChanged = form.voteMethod !== initial.voteMethod
  // API-044 requires a reason for a vote-method change (1~500 characters).
  const [voteReason, setVoteReason] = useState('')
  const reasonMissing = voteChanged && voteReason.trim().length === 0
  const patch = buildPatch(initial, form)
  const dirty = voteChanged || Object.keys(patch).length > 0
  const problem = formProblem(form)

  const save = useMutation({
    mutationFn: async () => {
      let version = performance.version
      let result: unknown = {}
      if (voteChanged) {
        // 4-1: the number of votes a change deletes comes from the check (API-043).
        const check = await validateVoteMethod(
          clubId,
          performanceId,
          version,
          form.voteMethod,
        )
        const count = affectedVoteCount(check.warnings)
        if (count > 0) {
          const choice = await feedback.dialog({
            title: T.voteChangeTitle,
            description: T.voteChangeBody(count),
            cancelLabel: T.cancel,
            confirmLabel: T.voteChangeAction,
            danger: true,
          })
          if (choice !== 'confirm') throw new ConfirmationDeclinedError()
        }
        const changed = await withConfirmation((confirmed) =>
          changeVoteMethod(clubId, performanceId, {
            version,
            voteMethod: form.voteMethod,
            confirmed: confirmed || count > 0,
            reason: voteReason.trim(),
          }),
        )
        version = changed.policy.performanceVersion
        result = changed
      }
      if (Object.keys(patch).length > 0)
        result = await withRuleCopy(
          () => updatePolicy(clubId, performanceId, version, patch),
          { PRACTICE_SEASON_REQUIRED: T.seasonRequired },
        )
      return result
    },
    onSuccess: () => feedback.toast(COPY.saved, 'positive'),
    onError: showRuleCopy,
    // A vote-method change may have gone through even if the rest failed.
    onSettled: () => invalidatePerformance(queryClient, clubId, performanceId),
  })

  // 0-1: leaving with unsaved changes asks first.
  const blocker = useBlocker(dirty && !save.isPending)
  const asking = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked') {
      asking.current = false
      return
    }
    if (asking.current) return
    asking.current = true
    void feedback
      .dialog({
        title: T.leaveTitle,
        cancelLabel: T.keepEditing,
        confirmLabel: T.leave,
        danger: true,
      })
      .then((c) => {
        // Ask again at once if the user tries to leave right after "keep editing".
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

  const disabled = !editable || save.isPending
  const seasonEndsLate =
    performance.performDate !== null &&
    form.practiceSeasonEnd !== '' &&
    form.practiceSeasonEnd > performance.performDate
  const problemText =
    problem === 'limit'
      ? T.limitInvalid
      : problem === 'seasonPair'
        ? T.seasonPair
        : problem === 'seasonOrder'
          ? T.seasonOrder
          : problem === 'seasonRequired'
            ? T.seasonRequired
            : undefined
  const card = (feature: FeatureKey, hint?: string, children?: ReactNode) => (
    <Card
      key={feature}
      feature={feature}
      form={form}
      disabled={disabled}
      set={set}
      hint={hint}
    >
      {children}
    </Card>
  )

  return (
    <>
      <section className="start-section">
        <Typography
          variant="body2"
          color="semantic.foreground.neutral.secondary"
        >
          {T.presetLine(
            T.presetNames[performance.preset] ?? performance.preset,
          )}
        </Typography>
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {T.presetHint}
        </Typography>
        {editable ? null : (
          <SectionMessage variant="cautionary" description={T.lockedBanner}>
            {T.lockedBanner}
          </SectionMessage>
        )}
      </section>

      {card('application')}
      {card('teamApplication', T.teamApplicationHint)}
      {card(
        'candidate',
        T.candidateHint,
        <>
          <fieldset className="policy-state" disabled={disabled}>
            <Typography variant="body2">{T.candidateScope}</Typography>
            <RadioList
              name={T.candidateScope}
              value={form.candidateScope}
              options={[
                { value: SCOPE_ALL, label: T.scopeAll },
                {
                  value: SCOPE_TEAM,
                  label: T.scopeTeam,
                  hint: T.scopeTeamHint,
                },
              ]}
              onChange={(v) => set('candidateScope', v)}
            />
          </fieldset>
          <LimitField
            label={T.candidateLimit}
            value={form.candidateLimitPerMember}
            disabled={disabled}
            onChange={(v) => set('candidateLimitPerMember', v)}
          />
        </>,
      )}
      {card(
        'playability',
        T.playabilityHint,
        <>
          <PublicSwitch
            label={T.resultPublic}
            checked={form.playabilityResultPublic}
            disabled={disabled}
            onChange={(v) => set('playabilityResultPublic', v)}
          />
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.secondary"
          >
            {T.playabilityPublicHint}
          </Typography>
        </>,
      )}
      {card(
        'vote',
        undefined,
        <>
          <fieldset className="policy-state" disabled={disabled}>
            <Typography variant="body2">{T.voteMethod}</Typography>
            <RadioList
              name={T.voteMethod}
              value={form.voteMethod}
              options={[
                { value: 'APPROVAL', label: T.approval },
                { value: 'SCORE', label: T.score },
              ]}
              onChange={(v) => set('voteMethod', v)}
            />
          </fieldset>
          {voteChanged ? (
            <label className="policy-field">
              <Typography variant="body2">{T.voteReasonLabel}</Typography>
              <TextField
                value={voteReason}
                placeholder={T.voteReasonPlaceholder}
                maxLength={COPY.reasonMax}
                onChange={(e) =>
                  setVoteReason(e.target.value.slice(0, COPY.reasonMax))
                }
              />
            </label>
          ) : null}
          {form.voteMethod === 'APPROVAL' ? (
            <LimitField
              label={T.voteMaxChoices}
              value={form.voteMaxChoices}
              disabled={disabled}
              onChange={(v) => set('voteMaxChoices', v)}
            />
          ) : null}
          <PublicSwitch
            label={`${T.features.vote} ${T.resultPublic}`}
            checked={form.voteResultPublic}
            disabled={disabled}
            onChange={(v) => set('voteResultPublic', v)}
          />
        </>,
      )}
      {card(
        'availability',
        undefined,
        <>
          <label className="policy-field">
            <Typography variant="body2">{T.seasonStart}</Typography>
            <input
              type="date"
              disabled={disabled}
              value={form.practiceSeasonStart}
              onChange={(e) => set('practiceSeasonStart', e.target.value)}
            />
          </label>
          <label className="policy-field">
            <Typography variant="body2">{T.seasonEnd}</Typography>
            <input
              type="date"
              disabled={disabled}
              value={form.practiceSeasonEnd}
              onChange={(e) => set('practiceSeasonEnd', e.target.value)}
            />
          </label>
          {seasonEndsLate ? (
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {T.seasonAfterPerform}
            </Typography>
          ) : null}
        </>,
      )}

      <section className="policy-card" aria-label={T.maxSongs}>
        <Typography variant="body1" weight="bold" as="h2">
          {T.maxSongs}
        </Typography>
        <LimitField
          label={T.maxSongs}
          value={form.maxSongsPerMember}
          disabled={disabled}
          onChange={(v) => set('maxSongsPerMember', v)}
        />
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {T.maxSongsHint}
        </Typography>
      </section>

      {editable ? (
        <div className="policy-save">
          {problemText ? (
            <Typography
              variant="caption1"
              color="semantic.foreground.negative.primary"
            >{`* ${problemText}`}</Typography>
          ) : null}
          <Button
            size="large"
            loading={save.isPending}
            disabled={!dirty || problem !== undefined || reasonMissing}
            onClick={() => save.mutate()}
          >
            {T.save}
          </Button>
        </div>
      ) : null}
    </>
  )
}

/** PERF-004: the policy of one performance (officers only); read-only from LOCKED on. */
export function PerformancePolicy() {
  const { clubId = '', performanceId = '' } = useParams()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'detail'],
    queryFn: () => getPerformance(clubId, performanceId),
  })

  let body
  if (isError) body = <ErrorState onRetry={() => void refetch()} />
  else if (isPending) body = <ListSkeleton rows={4} />
  else
    body = (
      // A fresh version or policy (after a save or a conflict) restarts the form from the server.
      <PolicyEditor
        key={`${data.performance.version}:${data.policy.updatedAt}`}
        clubId={clubId}
        performanceId={performanceId}
        detail={data}
      />
    )
  return (
    <div className="start policy" data-screen-id="PERF-004">
      <Typography variant="title2" weight="bold" as="h1">
        {T.title}
      </Typography>
      {body}
    </div>
  )
}
