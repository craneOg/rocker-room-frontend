import { Typography } from '@montage-ui/core'
import { useLocation } from 'react-router'

/** Stand-in for every screen that is not built yet: shows only the screen ID. */
export function Placeholder({ screenId }: { screenId: string }) {
  const { pathname } = useLocation()
  return (
    <section className="placeholder" data-screen-id={screenId}>
      <Typography variant="title2" weight="bold">
        {screenId}
      </Typography>
      <Typography variant="body2" color="semantic.foreground.neutral.tertiary">
        {pathname}
      </Typography>
    </section>
  )
}
