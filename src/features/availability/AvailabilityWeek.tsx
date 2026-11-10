import { Button, Typography } from '@montage-ui/core'
import { AVAIL_COPY as T } from './availabilityCopy'
import { addDays } from './availabilityTime'

/** `‹ 10.12 ~ 10.18 ›`: never leaves the season. */
export function WeekNav({
  monday,
  prev,
  next,
}: {
  monday: string
  prev?: () => void
  next?: () => void
}) {
  return (
    <div className="avail-weeknav">
      <Button
        size="small"
        variant="outlined"
        color="assistive"
        disabled={!prev}
        onClick={prev}
      >
        ‹<span className="avail-sr">{T.prevWeek}</span>
      </Button>
      <Typography variant="body1" weight="bold">
        {T.weekLabel(monday, addDays(monday, 6))}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        color="assistive"
        disabled={!next}
        onClick={next}
      >
        ›<span className="avail-sr">{T.nextWeek}</span>
      </Button>
    </div>
  )
}
