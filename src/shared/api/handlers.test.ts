import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY } from '../ui/copy'
import {
  notFoundStore,
  registerFeedback,
  warningsStore,
} from '../ui/feedbackBus'
import { extractWarnings } from './assumptions'
import { ApiError, fieldErrors } from './errors'
import { createCaches, handleApiError, withConfirmation } from './handlers'

const toast = vi.fn()
const dialog = vi.fn()

beforeEach(() => {
  toast.mockReset()
  dialog.mockReset().mockResolvedValue('confirm')
  notFoundStore.set(false)
  warningsStore.set([])
  registerFeedback({ toast, dialog })
})

const err = (
  code: ApiError['code'],
  status = 409,
  extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {},
) => new ApiError({ status, code, message: `${code} message`, ...extra })

describe('handleApiError', () => {
  it('shows the concurrent-edit dialog for VERSION_CONFLICT and refetches', async () => {
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await handleApiError(err('VERSION_CONFLICT'), qc)
    expect(dialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: COPY.versionConflictTitle }),
    )
    expect(spy).toHaveBeenCalled()
  })

  it('shows the state-conflict dialog with the server message', async () => {
    await handleApiError(err('STATE_CONFLICT'))
    expect(dialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: COPY.stateConflictTitle,
        description: 'STATE_CONFLICT message',
      }),
    )
  })

  it('shows the rule-violation dialog', async () => {
    await handleApiError(err('RULE_VIOLATION', 422))
    expect(dialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: COPY.ruleViolationTitle }),
    )
  })

  it('toasts "임원만 할 수 있어요" on FORBIDDEN', async () => {
    await handleApiError(err('FORBIDDEN', 403))
    expect(toast).toHaveBeenCalledWith(COPY.officerOnly, 'negative')
  })

  it('flags the not-found screen on NOT_FOUND', async () => {
    await handleApiError(err('NOT_FOUND', 404))
    expect(notFoundStore.get()).toBe(true)
  })

  it('leaves VALIDATION_ERROR, CONFIRMATION_REQUIRED and UNAUTHENTICATED to their owners', async () => {
    await handleApiError(err('VALIDATION_ERROR', 400))
    await handleApiError(err('CONFIRMATION_REQUIRED'))
    await handleApiError(err('UNAUTHENTICATED', 401))
    expect(toast).not.toHaveBeenCalled()
    expect(dialog).not.toHaveBeenCalled()
  })

  it('is wired into the QueryClient caches', async () => {
    const qc: QueryClient = new QueryClient(createCaches(() => qc))
    await qc
      .fetchQuery({
        queryKey: ['x'],
        queryFn: () => Promise.reject(err('FORBIDDEN', 403)),
        retry: false,
      })
      .catch(() => {})
    expect(toast).toHaveBeenCalledWith(COPY.officerOnly, 'negative')

    await qc
      .getMutationCache()
      .build(qc, { mutationFn: () => Promise.reject(err('NOT_FOUND', 404)) })
      .execute(undefined)
      .catch(() => {})
    expect(notFoundStore.get()).toBe(true)
  })

  it('puts success warnings into the banner store via the mutation cache', async () => {
    const qc: QueryClient = new QueryClient(createCaches(() => qc))
    await qc
      .getMutationCache()
      .build(qc, {
        mutationFn: () =>
          Promise.resolve({ warnings: ['w1', { message: 'w2' }] }),
      })
      .execute(undefined)
    expect(warningsStore.get()).toEqual(['w1', 'w2'])
  })
})

describe('helpers', () => {
  it('maps VALIDATION_ERROR details to field helper text', () => {
    const e = err('VALIDATION_ERROR', 400, {
      details: [
        { field: 'name', message: '필수' },
        { field: 'name', message: 'dup' },
        { message: 'no field' },
      ],
    })
    expect(fieldErrors(e)).toEqual({ name: '필수' })
    expect(fieldErrors(new Error('x'))).toEqual({})
  })

  it('extracts warnings from data.warnings only', () => {
    expect(extractWarnings({ warnings: ['a'] })).toEqual(['a'])
    expect(extractWarnings({ other: 1 })).toEqual([])
    expect(extractWarnings(null)).toEqual([])
  })
})

describe('withConfirmation', () => {
  const needsConfirm = err('CONFIRMATION_REQUIRED', 409, {
    details: [{ message: 'W1' }, { message: 'W2' }],
  })

  it('re-runs with confirmed=true after the user continues', async () => {
    const run = vi.fn((confirmed: boolean) =>
      confirmed ? Promise.resolve('done') : Promise.reject(needsConfirm),
    )
    await expect(withConfirmation(run)).resolves.toBe('done')
    expect(run.mock.calls.map(([c]) => c)).toEqual([false, true])
    expect(dialog).toHaveBeenCalledWith(
      expect.objectContaining({
        items: ['W1', 'W2'],
        cancelLabel: COPY.cancel,
        confirmLabel: COPY.proceed,
      }),
    )
  })

  it('does not re-run when the user cancels', async () => {
    dialog.mockResolvedValue('cancel')
    const run = vi.fn(() => Promise.reject(needsConfirm))
    await expect(withConfirmation(run)).rejects.toMatchObject({
      name: 'ConfirmationDeclinedError',
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('passes other errors through and skips the dialog', async () => {
    await expect(
      withConfirmation(() => Promise.reject(err('RULE_VIOLATION', 422))),
    ).rejects.toMatchObject({ code: 'RULE_VIOLATION' })
    expect(dialog).not.toHaveBeenCalled()
  })
})
