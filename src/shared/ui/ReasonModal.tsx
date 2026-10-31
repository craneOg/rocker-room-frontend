import {
  Button,
  Modal,
  ModalContainer,
  ModalContent,
  ModalDescription,
  ModalHeading,
  TextArea,
} from '@montage-ui/core'
import { useState } from 'react'
import { COPY } from './copy'

type Props = {
  open: boolean
  title?: string
  description?: string
  actionLabel: string
  loading?: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
}

/** COM-003 #13: 1~500 characters; the action stays disabled while empty. */
export function ReasonModal({
  open,
  title = COPY.reasonTitle,
  description,
  actionLabel,
  loading,
  onSubmit,
  onClose,
}: Props) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContainer variant="popup">
        <ModalContent>
          <ModalHeading>{title}</ModalHeading>
          {description ? (
            <ModalDescription>{description}</ModalDescription>
          ) : null}
          <TextArea
            aria-label={title}
            value={reason}
            maxLength={COPY.reasonMax}
            minRows={3}
            onChange={(e) => setReason(e.target.value.slice(0, COPY.reasonMax))}
          />
          <p className="reason-counter">{`${reason.length} / ${COPY.reasonMax}`}</p>
          <div className="dialog-actions">
            <Button variant="outlined" color="assistive" onClick={onClose}>
              {COPY.cancel}
            </Button>
            <Button
              loading={loading}
              disabled={trimmed.length === 0}
              onClick={() => onSubmit(trimmed)}
            >
              {actionLabel}
            </Button>
          </div>
        </ModalContent>
      </ModalContainer>
    </Modal>
  )
}
