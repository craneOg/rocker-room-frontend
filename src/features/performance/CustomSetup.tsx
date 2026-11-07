import { Button, TextField, Typography } from '@montage-ui/core'
import { useState } from 'react'
import { FORM_COPY as T } from './formCopy'
import { CUSTOM_QUESTIONS, answerLabel } from './customQuestions'
import {
  isComplete,
  policyFromAnswers,
  policySummary,
  visibleQuestions,
  type Answers,
  type QuestionId,
} from './presets'
import './form.css'

type Props = {
  answers: Answers
  onChange: (next: Answers) => void
  /** yyyy-MM-dd of the performance, for the F-06 season warning. */
  performDate: string | null
  onDone: () => void
}

const NONE = 'NONE'

/** PERF-002 step 3: questions stack top to bottom; an answered bubble can be tapped to answer again. */
export function CustomSetup({ answers, onChange, performDate, onDone }: Props) {
  const [editing, setEditing] = useState<QuestionId | null>(null)
  const visible = visibleQuestions(answers)
  const firstOpen = visible.findIndex((q) => answers[q] === undefined)
  const shown = firstOpen === -1 ? visible : visible.slice(0, firstOpen + 1)
  const answer = (q: QuestionId, value: string) => {
    onChange({ ...answers, [q]: value })
    setEditing(null)
  }
  const current = firstOpen === -1 ? visible.length : firstOpen + 1

  return (
    <div className="perf-chat" data-testid="custom-chat">
      <Typography variant="caption1" weight="bold">
        {T.questionCount(Math.min(current, visible.length), visible.length)}
      </Typography>
      {shown.map((q) => {
        const def = CUSTOM_QUESTIONS[q]
        const value = answers[q]
        const open = value === undefined || editing === q
        return (
          <div key={q} className="perf-chat-turn">
            <div className="perf-bubble perf-bubble-q">{def.text}</div>
            {open ? (
              <QuestionInput
                id={q}
                performDate={performDate}
                initial={value}
                onAnswer={(v) => answer(q, v)}
              />
            ) : (
              <button
                type="button"
                className="perf-bubble perf-bubble-a"
                onClick={() => setEditing(q)}
              >
                {answerLabel(q, value)}
              </button>
            )}
          </div>
        )
      })}
      {isComplete(answers) && editing === null ? (
        <div className="perf-chat-turn">
          <div className="perf-bubble perf-bubble-q">
            <strong>{T.summaryTitle}</strong>
            <ul className="perf-summary">
              {policySummary(policyFromAnswers(answers)).map(([k, v]) => (
                <li key={k}>{`${k}: ${v}`}</li>
              ))}
            </ul>
          </div>
          <Button size="large" onClick={onDone}>
            {T.proceed}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function QuestionInput({
  id,
  performDate,
  initial,
  onAnswer,
}: {
  id: QuestionId
  performDate: string | null
  initial: string | undefined
  onAnswer: (v: string) => void
}) {
  const def = CUSTOM_QUESTIONS[id]
  if (def.kind === 'choice')
    return (
      <div className="perf-chips">
        {def.choices.map((c) => (
          <Button
            key={c.value}
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => onAnswer(c.value)}
          >
            {c.label}
          </Button>
        ))}
      </div>
    )
  if (def.kind === 'number')
    return (
      <NumberInput
        initial={initial}
        noneLabel={answerLabel(id, 'NONE')}
        onAnswer={onAnswer}
      />
    )
  return (
    <SeasonInput
      initial={initial}
      performDate={performDate}
      onAnswer={onAnswer}
    />
  )
}

function NumberInput({
  initial,
  noneLabel,
  onAnswer,
}: {
  initial: string | undefined
  noneLabel: string
  onAnswer: (v: string) => void
}) {
  const [n, setN] = useState(
    initial !== undefined && initial !== NONE ? initial : '1',
  )
  const valid = /^[1-9]\d*$/.test(n)
  return (
    <div className="perf-chips">
      <Button
        size="small"
        variant="outlined"
        color="assistive"
        onClick={() => onAnswer(NONE)}
      >
        {noneLabel}
      </Button>
      <TextField
        type="number"
        aria-label={T.confirmAnswer}
        value={n}
        onChange={(e) => setN(e.target.value)}
        status={valid ? 'normal' : 'negative'}
      />
      <Button size="small" disabled={!valid} onClick={() => onAnswer(n)}>
        {T.confirmAnswer}
      </Button>
    </div>
  )
}

function SeasonInput({
  initial,
  performDate,
  onAnswer,
}: {
  initial: string | undefined
  performDate: string | null
  onAnswer: (v: string) => void
}) {
  const [init1, init2] = (initial ?? '').split('~')
  const [from, setFrom] = useState(init1 ?? '')
  const [to, setTo] = useState(init2 ?? '')
  const reversed = from !== '' && to !== '' && from > to
  const lateThanPerform = performDate !== null && to !== '' && to > performDate
  return (
    <div className="perf-season">
      <div className="perf-chips">
        <TextField
          type="date"
          aria-label={T.seasonStart}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          type="date"
          aria-label={T.seasonEnd}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button
          size="small"
          disabled={from === '' || to === '' || reversed}
          onClick={() => onAnswer(`${from}~${to}`)}
        >
          {T.confirmAnswer}
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={() => onAnswer('LATER')}
        >
          {T.later}
        </Button>
      </div>
      {reversed ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.negative.primary"
        >
          {`* ${T.seasonOrder}`}
        </Typography>
      ) : lateThanPerform ? (
        <Typography variant="caption1">{T.seasonAfterPerform}</Typography>
      ) : null}
    </div>
  )
}
