import { ThemeProvider } from '@montage-ui/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback } from './feedbackBus'
import { FeedbackHost } from './FeedbackHost'

beforeEach(() => {
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

describe('FeedbackHost', () => {
  it('closing a dialog removes only that dialog from the queue', async () => {
    render(
      <ThemeProvider>
        <FeedbackHost />
      </ThemeProvider>,
    )
    let first: Promise<string> = Promise.resolve('')
    act(() => {
      first = feedback.dialog({ title: 'first', confirmLabel: 'ok-1' })
      void feedback.dialog({ title: 'second', confirmLabel: 'ok-2' })
    })
    fireEvent.click(await screen.findByText('ok-1'))
    await expect(first).resolves.toBe('confirm')
    expect(await screen.findByText('second')).toBeTruthy()
  })
})
