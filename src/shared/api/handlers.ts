import type { QueryClient } from '@tanstack/react-query'
import { MutationCache, QueryCache } from '@tanstack/react-query'
import { COPY } from '../ui/copy'
import { feedback, notFoundStore, warningsStore } from '../ui/feedbackBus'
import { extractWarnings } from './assumptions'
import {
  ApiError,
  confirmationWarnings,
  ConfirmationDeclinedError,
} from './errors'

/** Global handling of failed requests (runbook B-2). */
export async function handleApiError(
  error: unknown,
  queryClient?: QueryClient,
): Promise<void> {
  if (error instanceof ConfirmationDeclinedError) return
  if (!(error instanceof ApiError)) return
  switch (error.code) {
    case 'VERSION_CONFLICT': {
      await feedback.dialog({
        title: COPY.versionConflictTitle,
        description: COPY.versionConflictDescription,
        confirmLabel: COPY.confirm,
      })
      await queryClient?.invalidateQueries()
      return
    }
    case 'STATE_CONFLICT':
      await feedback.dialog({
        title: COPY.stateConflictTitle,
        description: error.message,
        confirmLabel: COPY.confirm,
      })
      await queryClient?.invalidateQueries()
      return
    case 'RULE_VIOLATION':
      await feedback.dialog({
        title: COPY.ruleViolationTitle,
        description: error.message,
        confirmLabel: COPY.confirm,
      })
      return
    case 'FORBIDDEN':
      feedback.toast(COPY.officerOnly, 'negative')
      return
    case 'NOT_FOUND':
      notFoundStore.set(true)
      return
    case 'VALIDATION_ERROR':
      // Shown next to the inputs via fieldErrors(); nothing global.
      return
    case 'CONFIRMATION_REQUIRED':
      // Handled by withConfirmation() at the call site.
      return
    case 'UNAUTHENTICATED':
      // Token renewal failure is handled by the client (session-expired hook).
      return
    case 'NETWORK_ERROR':
      feedback.toast(COPY.networkError, 'negative')
      return
    default:
      feedback.toast(
        error.code === 'DUPLICATE' ? error.message : COPY.unknownError,
        'negative',
      )
  }
}

export function createCaches(getClient: () => QueryClient) {
  return {
    queryCache: new QueryCache({
      onError: (e) => void handleApiError(e, getClient()),
    }),
    mutationCache: new MutationCache({
      onError: (e) => void handleApiError(e, getClient()),
      onSuccess: (data) => {
        const warnings = extractWarnings(data)
        if (warnings.length > 0) warningsStore.set(warnings)
      },
    }),
  }
}

/**
 * Call-site helper for CONFIRMATION_REQUIRED: runs `run(false)`, and if the server asks
 * for confirmation shows the warnings and re-runs `run(true)` on "계속 진행".
 * `run` decides how `confirmed=true` is sent (query or body).
 */
export async function withConfirmation<T>(
  run: (confirmed: boolean) => Promise<T>,
): Promise<T> {
  try {
    return await run(false)
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'CONFIRMATION_REQUIRED') throw e
    const choice = await feedback.dialog({
      title: COPY.confirmTitle,
      items: confirmationWarnings(e),
      confirmLabel: COPY.proceed,
      cancelLabel: COPY.cancel,
      danger: true,
    })
    if (choice !== 'confirm') throw new ConfirmationDeclinedError()
    return run(true)
  }
}
