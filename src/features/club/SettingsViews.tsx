import { Button, Typography } from '@montage-ui/core'
import { COPY } from '../../shared/ui/copy'
import { SETTINGS_COPY as T } from './settingsCopy'

/** A failed load: message and a retry button (the global handler already toasted the cause). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="restore-error">
      <Typography variant="body1" color="semantic.foreground.negative.primary">
        {COPY.unknownError}
      </Typography>
      <Button size="medium" onClick={onRetry}>
        {T.retry}
      </Button>
    </div>
  )
}
