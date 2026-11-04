import { ContentBadge } from '@montage-ui/core'
import {
  BADGE_DICTIONARY,
  type BadgeKind,
  type BadgeLook,
  type BadgeValue,
} from './badges'

type Props<K extends BadgeKind> = {
  kind: K
  value: BadgeValue<K>
  /** Appended to the label, e.g. "· 3번" or a deadline time. */
  suffix?: string
}

export function Badge<K extends BadgeKind>({ kind, value, suffix }: Props<K>) {
  const look = (BADGE_DICTIONARY[kind] as Record<string, BadgeLook>)[value]
  if (!look) return null
  return (
    <ContentBadge
      size="small"
      color={look.color}
      variant={look.variant}
      className={look.emphasis ? `badge-${look.emphasis}` : undefined}
    >
      {suffix ? `${look.label} ${suffix}` : look.label}
    </ContentBadge>
  )
}
