import { Button, Typography } from '@montage-ui/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router'
import { fieldErrors } from '../../shared/api/errors'
import { useSession } from '../../shared/auth/session'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import {
  BasicFields,
  emptyBasic,
  isBasicValid,
  toBasicInfo,
  type BasicValue,
} from './BasicFields'
import { CustomSetup } from './CustomSetup'
import { createPerformance, invalidatePerformances } from './formApi'
import { FORM_COPY as T } from './formCopy'
import {
  defaultPreset,
  isComplete,
  policyFromAnswers,
  policySummary,
  PRESET_POLICY,
  presetsFor,
  type Answers,
  type Preset,
} from './presets'
import './form.css'

type Step = 'basic' | 'preset' | 'custom' | 'confirm'
const STEP_NUMBER: Record<Step, number> = {
  basic: 1,
  preset: 2,
  custom: 3,
  confirm: 4,
}

/** PERF-002: basic info -> preset -> (custom questions) -> confirm. Officers only. */
export function PerformanceCreate() {
  const { clubId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useSession()
  const club = session.memberships.find((m) => m.clubId === clubId)?.club
  const clubType = club?.clubType ?? 'CLUB'

  const [step, setStep] = useState<Step>('basic')
  const [basic, setBasic] = useState<BasicValue>(emptyBasic)
  const [preset, setPreset] = useState<Preset>(defaultPreset(clubType))
  const [answers, setAnswers] = useState<Answers>({})

  // 0-1: leaving with something typed asks first. A ref, so the successful save can navigate
  // away in the same tick without being blocked.
  const guard = useRef(true)
  const dirty =
    step !== 'basic' ||
    basic.title !== '' ||
    basic.location !== '' ||
    basic.date !== '' ||
    basic.undecided
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      guard.current &&
      dirty &&
      currentLocation.pathname !== nextLocation.pathname,
  )
  const asking = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void feedback
      .dialog({
        title: T.leaveTitle,
        description: T.leaveDescription,
        confirmLabel: T.leave,
        cancelLabel: T.keepWriting,
      })
      .then((choice) => {
        asking.current = false
        if (choice === 'confirm') blocker.proceed()
        else blocker.reset()
      })
  }, [blocker])

  const info = toBasicInfo(basic)
  const policy =
    preset === 'CUSTOM'
      ? policyFromAnswers(answers)
      : PRESET_POLICY[preset as Exclude<Preset, 'CUSTOM'>]

  // The mutation state updates a tick late, so a fast double click needs its own guard.
  const sending = useRef(false)
  const save = useMutation({
    mutationFn: () =>
      createPerformance(clubId, {
        ...info,
        preset,
        ...(preset === 'CUSTOM' ? { policy } : {}),
      }),
    onSuccess: async (created) => {
      guard.current = false
      await invalidatePerformances(queryClient, clubId)
      feedback.toast(T.created, 'positive')
      void navigate(`/clubs/${clubId}/performances/${created.id}`)
    },
    onSettled: () => {
      sending.current = false
    },
    onError: (e) => {
      // A field error of step 1 is shown by its input.
      const f = fieldErrors(e)
      if ('title' in f || 'performDate' in f || 'location' in f)
        setStep('basic')
    },
  })
  const serverErrors = fieldErrors(save.error)
  const clearSaveError = () => {
    if (save.isError) save.reset()
  }

  const goPresetNext = () => setStep(preset === 'CUSTOM' ? 'custom' : 'confirm')
  const back = () => {
    if (step === 'basic') void navigate(`/clubs/${clubId}/performances`)
    else if (step === 'preset') setStep('basic')
    else if (step === 'custom') setStep('preset')
    else setStep(preset === 'CUSTOM' ? 'custom' : 'preset')
  }
  const canNext = step !== 'basic' || isBasicValid(basic)
  const shownSteps: Step[] =
    preset === 'CUSTOM'
      ? ['basic', 'preset', 'custom', 'confirm']
      : ['basic', 'preset', 'confirm']

  return (
    <form
      className="perf-form"
      data-screen-id="PERF-002"
      onSubmit={(e) => {
        e.preventDefault()
        if (step === 'confirm') {
          if (!sending.current) {
            sending.current = true
            save.mutate()
          }
        } else if (step === 'basic' && canNext) setStep('preset')
        else if (step === 'preset') goPresetNext()
      }}
    >
      <ol className="perf-steps" aria-label={T.createTitle}>
        {shownSteps.map((id) => (
          <li key={id} aria-current={id === step ? 'step' : undefined}>
            {`${STEP_NUMBER[id]} ${T.steps[STEP_NUMBER[id] - 1]}`}
          </li>
        ))}
      </ol>

      {step === 'basic' ? (
        <BasicFields
          value={basic}
          serverErrors={serverErrors}
          onChange={(next) => {
            setBasic(next)
            clearSaveError()
          }}
        />
      ) : null}

      {step === 'preset' ? (
        <PresetStep
          clubType={clubType}
          value={preset}
          onChange={(p) => {
            setPreset(p)
            clearSaveError()
          }}
        />
      ) : null}

      {step === 'custom' ? (
        <CustomSetup
          answers={answers}
          onChange={setAnswers}
          performDate={info.performDate}
          onDone={() => setStep('confirm')}
        />
      ) : null}

      {step === 'confirm' ? (
        <ConfirmStep
          basic={info}
          preset={preset}
          policy={policy}
          band={preset === 'BAND'}
          clubName={club?.name ?? ''}
          onEdit={setStep}
          checkInput={Object.keys(serverErrors).length > 0}
        />
      ) : null}

      <div className="perf-actions">
        <Button
          type="button"
          variant="outlined"
          color="assistive"
          size="large"
          onClick={back}
        >
          {T.prev}
        </Button>
        {step === 'custom' ? null : step === 'confirm' ? (
          <Button
            type="submit"
            size="large"
            loading={save.isPending}
            disabled={preset === 'CUSTOM' && !isComplete(answers)}
          >
            {T.create}
          </Button>
        ) : (
          <Button type="submit" size="large" disabled={!canNext}>
            {T.next}
          </Button>
        )}
      </div>
    </form>
  )
}

function PresetStep({
  clubType,
  value,
  onChange,
}: {
  clubType: string
  value: Preset
  onChange: (p: Preset) => void
}) {
  return (
    <div className="perf-form-fields">
      <Typography variant="body2" color="semantic.foreground.neutral.secondary">
        {T.presetHint}
      </Typography>
      <div className="choice-list" role="radiogroup" aria-label={T.steps[1]}>
        {presetsFor(clubType).map((p) => (
          <label
            key={p}
            className={`perf-preset${value === p ? ' perf-preset-on' : ''}`}
          >
            <input
              type="radio"
              name="preset"
              checked={value === p}
              onChange={() => onChange(p)}
            />
            <span className="perf-preset-text">
              <Typography variant="body2" weight="bold">
                {T.presetNames[p]}
              </Typography>
              <Typography variant="caption1">
                {T.presetDescriptions[p]}
              </Typography>
              <Typography
                variant="caption2"
                color="semantic.foreground.neutral.tertiary"
              >
                {T.presetFlows[p]}
              </Typography>
              {p === 'CUSTOM' ? null : (
                <span className="perf-chips-line">
                  {policySummary(PRESET_POLICY[p])
                    .filter(([, v]) => !v.startsWith(T.state.DISABLED))
                    .map(([k]) => k)
                    .join(' · ')}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function ConfirmStep({
  basic,
  preset,
  policy,
  band,
  clubName,
  onEdit,
  checkInput,
}: {
  basic: ReturnType<typeof toBasicInfo>
  preset: Preset
  policy: Parameters<typeof policySummary>[0]
  band: boolean
  clubName: string
  onEdit: (s: Step) => void
  checkInput: boolean
}) {
  return (
    <div className="perf-form-fields">
      <section className="perf-confirm-block">
        <div className="perf-confirm-head">
          <Typography variant="body2" weight="bold">
            {T.confirmBasic}
          </Typography>
          <Button
            type="button"
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => onEdit('basic')}
          >
            {T.edit}
          </Button>
        </div>
        <Typography variant="body2">{basic.title}</Typography>
        <Typography variant="body2">
          {basic.performDate ?? T.dateUndecidedValue}
        </Typography>
        <Typography variant="body2">
          {basic.location ?? T.noLocation}
        </Typography>
      </section>
      <section className="perf-confirm-block">
        <div className="perf-confirm-head">
          <Typography variant="body2" weight="bold">
            {T.confirmPreset}
          </Typography>
          <Button
            type="button"
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => onEdit(preset === 'CUSTOM' ? 'custom' : 'preset')}
          >
            {T.edit}
          </Button>
        </div>
        <Typography variant="body2">{T.presetNames[preset]}</Typography>
        <Typography variant="caption1" weight="bold">
          {T.confirmPolicy}
        </Typography>
        <ul className="perf-summary">
          {policySummary(policy).map(([k, v]) => (
            <li key={k}>{`${k}: ${v}`}</li>
          ))}
        </ul>
      </section>
      {band ? (
        <Typography variant="body2">{T.bandNotice(clubName)}</Typography>
      ) : null}
      <Typography
        variant="caption1"
        color="semantic.foreground.neutral.secondary"
      >
        {T.draftNotice}
      </Typography>
      {checkInput ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.negative.primary"
        >
          {COPY.checkInput}
        </Typography>
      ) : null}
    </div>
  )
}
