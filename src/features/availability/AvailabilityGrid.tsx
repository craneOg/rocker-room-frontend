import { Fragment, useEffect, useRef } from 'react'
import { hhmm, mmddWeekday, slotAt } from './availabilityTime'

export type CellInfo = {
  label: string
  disabled?: boolean
  /** AVAIL-001: painted or not. Left out for the heat map. */
  selected?: boolean
  /** AVAIL-002: the text inside the cell and its shade (0..4). */
  text?: string
  level?: number
  strong?: boolean
  dim?: boolean
}

type Props = {
  days: string[]
  fullRange: boolean
  ariaLabel: string
  cell: (ms: number, day: string) => CellInfo
  onStart?: (ms: number) => void
  onOver?: (ms: number) => void
  onEnd?: () => void
}

const ROW_START_SHORT = 8 * 60
const ROW_END = 24 * 60

/**
 * Columns = days, rows = 30-minute cells. Pressing a cell starts a drag that continues over the
 * cells entered while the pointer is down; a keyboard click is a one-cell drag.
 */
export function AvailabilityGrid({
  days,
  fullRange,
  ariaLabel,
  cell,
  onStart,
  onOver,
  onEnd,
}: Props) {
  const dragging = useRef(false)
  const end = useRef(onEnd)
  useEffect(() => {
    end.current = onEnd
  })
  useEffect(() => {
    const stop = () => {
      if (!dragging.current) return
      dragging.current = false
      end.current?.()
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const first = fullRange ? 0 : ROW_START_SHORT
  const rows: number[] = []
  for (let m = first; m < ROW_END; m += 30) rows.push(m)

  return (
    <div className="avail-scroll">
      <div
        className="avail-grid"
        role="group"
        aria-label={ariaLabel}
        style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}
      >
        <span />
        {days.map((d) => (
          <span key={d} className="avail-head">
            {mmddWeekday(d)}
          </span>
        ))}
        {rows.map((m) => (
          <Fragment key={m}>
            <span className="avail-time">{m % 60 === 0 ? hhmm(m) : ''}</span>
            {days.map((d) => {
              const ms = slotAt(d, m)
              const c = cell(ms, d)
              return (
                <button
                  key={d}
                  type="button"
                  className="avail-cell"
                  aria-label={c.label}
                  aria-pressed={c.selected}
                  disabled={c.disabled}
                  data-on={c.selected ? '' : undefined}
                  data-level={c.level}
                  data-strong={c.strong ? '' : undefined}
                  data-dim={c.dim ? '' : undefined}
                  onPointerDown={(e) => {
                    if (!onStart) return
                    // A touch pointer is captured by the pressed cell: release it so the
                    // cells it moves over receive pointerenter.
                    const t = e.target as Element
                    if (t.hasPointerCapture?.(e.pointerId))
                      t.releasePointerCapture(e.pointerId)
                    dragging.current = true
                    onStart(ms)
                  }}
                  onPointerEnter={() => {
                    if (dragging.current) onOver?.(ms)
                  }}
                  onClick={(e) => {
                    // Mouse and touch were handled on pointerdown; this is the keyboard.
                    if (e.detail !== 0 || !onStart) return
                    onStart(ms)
                    onEnd?.()
                  }}
                >
                  {c.text}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
