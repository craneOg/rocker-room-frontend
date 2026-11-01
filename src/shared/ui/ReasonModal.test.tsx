import { ThemeProvider } from '@montage-ui/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReasonModal } from './ReasonModal'

beforeEach(() => {
  // Montage's exit animation needs this, which jsdom lacks.
  Element.prototype.getAnimations = () => []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const modal = (open: boolean) => (
  <ThemeProvider>
    <ReasonModal
      open={open}
      title="reason"
      actionLabel="submit"
      onSubmit={() => {}}
      onClose={() => {}}
    />
  </ThemeProvider>
)

describe('ReasonModal', () => {
  it('starts empty each time it opens', async () => {
    const { rerender } = render(modal(true))
    const input = await screen.findByRole('textbox', { name: 'reason' })
    fireEvent.change(input, { target: { value: 'old reason' } })
    rerender(modal(false))
    rerender(modal(true))
    const reopened = await screen.findByRole('textbox', { name: 'reason' })
    expect((reopened as HTMLTextAreaElement).value).toBe('')
  })
})
