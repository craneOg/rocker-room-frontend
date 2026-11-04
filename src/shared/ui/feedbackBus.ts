import { useSyncExternalStore } from 'react'

export type ToastVariant = 'normal' | 'positive' | 'cautionary' | 'negative'

export type DialogSpec = {
  title: string
  description?: string
  items?: string[]
  confirmLabel: string
  /** Omit for a single-button (notice) dialog. */
  cancelLabel?: string
  danger?: boolean
}

type Handlers = {
  toast: (message: string, variant?: ToastVariant) => void
  dialog: (spec: DialogSpec) => Promise<'confirm' | 'cancel'>
  navigate: (path: string) => void
}

const noop: Handlers = {
  toast: () => {},
  dialog: () => Promise.resolve('cancel'),
  navigate: () => {},
}

let handlers: Handlers = noop

/** Registered by <FeedbackHost/> and the router so non-React code (QueryClient) can reach the UI. */
export function registerFeedback(next: Partial<Handlers>) {
  handlers = { ...handlers, ...next }
}

export const feedback = {
  toast: (message: string, variant?: ToastVariant) =>
    handlers.toast(message, variant),
  dialog: (spec: DialogSpec) => handlers.dialog(spec),
  navigate: (path: string) => handlers.navigate(path),
}

function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      listeners.forEach((l) => l())
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          listeners.add(l)
          return () => listeners.delete(l)
        },
        () => value,
      ),
  }
}

/** Warnings from a successful response, shown as the post-action banner. */
export const warningsStore = createStore<string[]>([])
/** True when a 404 should replace the current screen with the not-found view. */
export const notFoundStore = createStore(false)
