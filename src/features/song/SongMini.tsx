import type { ReactNode } from 'react'

/**
 * A small native button whose accessible name is `label` (Montage's Button names itself from its
 * visible text, which is "✕" / "+" for these controls and says nothing about the target).
 */
export function MiniButton({
  label,
  onClick,
  disabled,
  title,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="song-mini"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
