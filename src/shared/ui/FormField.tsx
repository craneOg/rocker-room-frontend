import {
  FormControl,
  FormControlField,
  FormControlLabel,
  FormControlMessage,
  FormControlNegativeMessage,
} from '@montage-ui/core'
import type { ReactNode } from 'react'

type Props = {
  label: string
  /** Server field error (VALIDATION_ERROR details) or local validation message. */
  error?: string
  hint?: string
  /** Exactly one Montage input (TextField, TextArea, ...). */
  children: ReactNode
}

/**
 * Input with fixed-height helper text (COM-003 #1): one line, the error replaces the hint,
 * and the reserved row keeps the layout from jumping.
 */
export function FormField({ label, error, hint, children }: Props) {
  return (
    <FormControl size="large">
      <FormControlLabel>{label}</FormControlLabel>
      <FormControlField>{children}</FormControlField>
      <div className="helper-slot">
        {error ? (
          <FormControlNegativeMessage>{`* ${error}`}</FormControlNegativeMessage>
        ) : hint ? (
          <FormControlMessage>{hint}</FormControlMessage>
        ) : null}
      </div>
    </FormControl>
  )
}
