import {
  Button,
  Modal,
  ModalContainer,
  ModalContent,
  ModalHeading,
  Typography,
} from '@montage-ui/core'
import type { ReactNode } from 'react'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { RuleCopyError } from './manageApi'
import { MANAGE_COPY as M } from './manageCopy'

type ModalProps = {
  open: boolean
  title: string
  actionLabel: string
  actionDisabled?: boolean
  loading?: boolean
  hideCancel?: boolean
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}

/** The shared frame of the edit sheets (web: a modal): 취소 and one action. */
export function ActionModal({
  open,
  title,
  actionLabel,
  actionDisabled,
  loading,
  hideCancel,
  onSubmit,
  onClose,
  children,
}: ModalProps) {
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContainer variant="popup">
        <ModalContent>
          <ModalHeading>{title}</ModalHeading>
          {children}
          <div className="dialog-actions">
            {hideCancel ? null : (
              <Button variant="outlined" color="assistive" onClick={onClose}>
                {M.cancel}
              </Button>
            )}
            <Button
              loading={loading}
              disabled={actionDisabled}
              onClick={onSubmit}
            >
              {actionLabel}
            </Button>
          </div>
        </ModalContent>
      </ModalContainer>
    </Modal>
  )
}

type Option = { value: string; label: string; hint?: string }

/** Native radios: labelled, keyboard friendly, and each option may carry a one-line hint. */
export function RadioList({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: Option[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="choice-list" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o.value} className="choice-row">
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>
            <Typography variant="body2">{o.label}</Typography>
            {o.hint ? (
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {o.hint}
              </Typography>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  )
}

/** A rule violation with its own copy (see withRuleCopy) is a dialog; everything else is global. */
export function showRuleCopy(e: unknown) {
  if (e instanceof RuleCopyError)
    void feedback.dialog({
      title: COPY.ruleViolationTitle,
      description: e.copy,
      confirmLabel: COPY.confirm,
    })
}
