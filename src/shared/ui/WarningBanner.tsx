import { SectionMessage } from '@montage-ui/core'
import { COPY } from './copy'

type Props = { warnings: string[]; onClose: () => void }

/** COM-003 #4: shown with a completed result; not an error. */
export function WarningBanner({ warnings, onClose }: Props) {
  if (warnings.length === 0) return null
  const unique = [...new Set(warnings)]
  return (
    <SectionMessage
      variant="cautionary"
      closeButton
      onOpenChange={(open) => !open && onClose()}
      description={
        <>
          <span>{COPY.warningBannerDescription}</span>
          <ul className="warning-list">
            {unique.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      }
    >
      {COPY.warningBannerTitle}
    </SectionMessage>
  )
}
