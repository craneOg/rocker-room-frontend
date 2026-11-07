import { TextField } from '@montage-ui/core'
import { FormField } from '../../shared/ui/FormField'
import type { BasicInfo } from './formApi'
import { FORM_COPY as T } from './formCopy'
import './form.css'

const MAX = 200

export type BasicValue = {
  title: string
  /** yyyy-MM-dd or ''. */
  date: string
  undecided: boolean
  location: string
}

export const emptyBasic: BasicValue = {
  title: '',
  date: '',
  undecided: false,
  location: '',
}

/** PERF-002 step 1 and PERF-006: the name is required (1 to 200), the place at most 200. */
export const isBasicValid = (v: BasicValue) =>
  v.title.trim().length >= 1 &&
  v.title.trim().length <= MAX &&
  v.location.trim().length <= MAX

export const toBasicInfo = (v: BasicValue): BasicInfo => ({
  title: v.title.trim(),
  performDate: v.undecided || v.date === '' ? null : v.date,
  location: v.location.trim() === '' ? null : v.location.trim(),
})

type Props = {
  value: BasicValue
  onChange: (next: BasicValue) => void
  /** VALIDATION_ERROR messages by field (title, performDate, location). */
  serverErrors?: Record<string, string>
}

/** Name, date and place with the rules shared by the create wizard and the edit screen. */
export function BasicFields({ value, onChange, serverErrors = {} }: Props) {
  const set = (patch: Partial<BasicValue>) => onChange({ ...value, ...patch })
  const titleBlank = value.title.length > 0 && value.title.trim() === ''
  return (
    <div className="perf-form-fields">
      <FormField
        label={T.labelTitle}
        error={titleBlank ? T.titleError : serverErrors.title}
        hint={`* ${T.titleError}`}
      >
        <TextField
          value={value.title}
          maxLength={MAX}
          placeholder={T.titlePlaceholder}
          status={titleBlank || serverErrors.title ? 'negative' : 'normal'}
          onChange={(e) => set({ title: e.target.value })}
        />
      </FormField>
      <FormField label={T.labelDate} error={serverErrors.performDate}>
        <TextField
          type="date"
          aria-label={T.labelDate}
          value={value.undecided ? '' : value.date}
          disabled={value.undecided}
          status={serverErrors.performDate ? 'negative' : 'normal'}
          onChange={(e) => set({ date: e.target.value })}
        />
      </FormField>
      <label className="perf-undecided">
        <input
          type="checkbox"
          checked={value.undecided}
          onChange={(e) => set({ undecided: e.target.checked })}
        />
        <span>{T.dateUndecided}</span>
      </label>
      <FormField label={T.labelLocation} error={serverErrors.location}>
        <TextField
          value={value.location}
          maxLength={MAX}
          placeholder={T.locationPlaceholder}
          status={serverErrors.location ? 'negative' : 'normal'}
          onChange={(e) => set({ location: e.target.value })}
        />
      </FormField>
    </div>
  )
}
