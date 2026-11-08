import { Typography } from '@montage-ui/core'
import { useState } from 'react'
import { ActionModal, RadioList } from '../club/ManageBits'
import { AVAIL_COPY as T } from './availabilityCopy'
import type { Repeat } from './availabilityEdit'
import { hhmm, WEEKDAYS } from './availabilityTime'

const times = (from: number, to: number) => {
  const out: number[] = []
  for (let m = from; m <= to; m += 30) out.push(m)
  return out
}

/** AVAIL-001 4-1: paints weekdays and times on the grid (saving stays with the save bar). */
export function AvailabilityRepeat({
  onApply,
  onClose,
}: {
  onApply: (repeat: Repeat) => void
  onClose: () => void
}) {
  const [weekdays, setWeekdays] = useState<number[]>([])
  // ponytail: 18:00-22:00 is a guess at a typical rehearsal window; the spec has no default.
  const [startMin, setStartMin] = useState(18 * 60)
  const [endMin, setEndMin] = useState(22 * 60)
  const [scope, setScope] = useState<Repeat['scope']>('week')

  return (
    <ActionModal
      open
      title={T.repeatTitle}
      actionLabel={T.apply}
      actionDisabled={weekdays.length === 0 || endMin <= startMin}
      onClose={onClose}
      onSubmit={() => onApply({ weekdays, startMin, endMin, scope })}
    >
      <fieldset className="avail-days">
        <legend>
          <Typography variant="body2" weight="bold">
            {T.repeatDays}
          </Typography>
        </legend>
        {WEEKDAYS.map((w, i) => (
          <label key={w} className="choice-row">
            <input
              type="checkbox"
              checked={weekdays.includes(i)}
              onChange={() =>
                setWeekdays((cur) =>
                  cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i],
                )
              }
            />
            {w}
          </label>
        ))}
      </fieldset>
      <label className="avail-field">
        {T.repeatStart}
        <select
          value={startMin}
          onChange={(e) => setStartMin(Number(e.target.value))}
        >
          {times(0, 23 * 60 + 30).map((m) => (
            <option key={m} value={m}>
              {hhmm(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="avail-field">
        {T.repeatEnd}
        <select
          value={endMin}
          onChange={(e) => setEndMin(Number(e.target.value))}
        >
          {times(30, 24 * 60).map((m) => (
            <option key={m} value={m}>
              {hhmm(m)}
            </option>
          ))}
        </select>
      </label>
      <RadioList
        name={T.repeatScope}
        value={scope}
        onChange={(v) => setScope(v === 'season' ? 'season' : 'week')}
        options={[
          { value: 'week', label: T.scopeWeek },
          { value: 'season', label: T.scopeSeason },
        ]}
      />
    </ActionModal>
  )
}
