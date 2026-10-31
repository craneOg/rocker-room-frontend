import {
  Alert,
  AlertActionArea,
  AlertActionAreaButton,
  AlertContainer,
  AlertContent,
  AlertDescription,
  AlertHeading,
  useToast,
} from '@montage-ui/core'
import { useEffect, useRef, useState } from 'react'
import { registerFeedback, type DialogSpec } from './feedbackBus'

type Pending = { spec: DialogSpec; resolve: (v: 'confirm' | 'cancel') => void }

/**
 * Bridges the non-React feedback bus to Montage toast and alert. Dialogs queue one at a time.
 * Dangerous dialogs (those with a cancel button) autofocus 취소 per COM-003.
 */
export function FeedbackHost() {
  const toast = useToast()
  const toastRef = useRef(toast)
  const [queue, setQueue] = useState<Pending[]>([])

  useEffect(() => {
    toastRef.current = toast
  })

  useEffect(() => {
    registerFeedback({
      toast: (message, variant = 'normal') =>
        toastRef.current({ id: 'feedback', content: message, variant }),
      dialog: (spec) =>
        new Promise((resolve) => setQueue((q) => [...q, { spec, resolve }])),
    })
  }, [])

  const current = queue[0]
  const close = (result: 'confirm' | 'cancel') => {
    current?.resolve(result)
    setQueue((q) => q.slice(1))
  }

  if (!current) return null
  const { spec } = current
  return (
    <Alert open onOpenChange={(open) => !open && close('cancel')}>
      <AlertContainer
        disableOutsideClickClose={Boolean(spec.cancelLabel)}
        onDismiss={() => close('cancel')}
      >
        <AlertContent>
          <AlertHeading>{spec.title}</AlertHeading>
          {spec.description ? (
            <AlertDescription>{spec.description}</AlertDescription>
          ) : null}
          {spec.items?.length ? (
            <ul className="dialog-items">
              {spec.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </AlertContent>
        <AlertActionArea>
          {spec.cancelLabel ? (
            <AlertActionAreaButton
              variant="assistive"
              autoFocus
              onClick={() => close('cancel')}
            >
              {spec.cancelLabel}
            </AlertActionAreaButton>
          ) : null}
          <AlertActionAreaButton
            variant={spec.danger ? 'negative' : 'normal'}
            autoFocus={!spec.cancelLabel}
            onClick={() => close('confirm')}
          >
            {spec.confirmLabel}
          </AlertActionAreaButton>
        </AlertActionArea>
      </AlertContainer>
    </Alert>
  )
}
