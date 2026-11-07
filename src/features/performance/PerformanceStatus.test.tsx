import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
  type Route,
} from '../../test/harness'
import { STATUS_COPY as T } from './policyCopy'
import { bodyOf, detail, PERF_URL, sessionRoutes } from './policyFixtures'
import type { ChecklistItem } from './policyApi'
import type { PerformanceStatus } from './types'

setupDom()

function open(status: PerformanceStatus, extra: Record<string, Route> = {}) {
  // The global toast animates; jsdom has no Web Animations API.
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  const fetchMock = stubApi({
    ...sessionRoutes,
    [`GET ${PERF_URL}`]: () => json(detail(status)),
    ...extra,
  })
  const router = renderApp('/clubs/10/performances/31/status')
  return { fetchMock, router }
}

/** The screen is lazy and loads its data: wait for the title before acting. */
const ready = async () => {
  await findScreen('PERF-005')
  await screen.findByText('가을 정기공연')
}
const buttons = () =>
  screen.getAllByRole('button').map((b) => b.textContent ?? '')
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))
const inDialog = (name: string) =>
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) as HTMLElement)
const perf = (status: PerformanceStatus) => json(detail(status).performance)

const item = (
  checkId: string,
  result: ChecklistItem['result'],
  message: string,
): ChecklistItem => ({ checkId, result, message, targetId: '1' })

describe('PERF-005 PerformanceStatus', () => {
  it.each([
    ['DRAFT', [T.activate.label, T.cancelPerf.label]],
    [
      'ACTIVE',
      [
        T.lock.label,
        T.finish.label,
        T['revert-to-draft'].label,
        T.cancelPerf.label,
      ],
    ],
    ['LOCKED', [T.finish.label, T.reopen.label, T.cancelPerf.label]],
    ['FINISHED', [T['revert-to-locked'].label]],
    ['CANCELED', [T.restore.label]],
  ] as const)('%s offers only its own moves', async (status, labels) => {
    open(status)
    await ready()
    expect(buttons()).toEqual(expect.arrayContaining([...labels]))
    const all = [
      T.activate,
      T.lock,
      T['revert-to-draft'],
      T.finish,
      T.reopen,
      T.cancelPerf,
      T['revert-to-locked'],
      T.restore,
    ].map((c) => c.label)
    for (const label of all.filter((l) => !labels.some((x) => x === l)))
      expect(buttons()).not.toContain(label)
  })

  it('marks the current step of the flow', async () => {
    open('LOCKED')
    await ready()
    const current = await screen.findByText(T.statusLabel.LOCKED, {
      selector: 'li',
    })
    expect(current.getAttribute('aria-current')).toBe('step')
  })

  it('publishes after the 2-1 confirmation, sending the version', async () => {
    const { fetchMock } = open('DRAFT', {
      [`POST ${PERF_URL}/activate`]: () => perf('ACTIVE'),
    })
    await ready()
    click(T.activate.label)
    await screen.findByText(T.activate.title)
    expect(callsTo(fetchMock, `${PERF_URL}/activate`)).toHaveLength(0)
    inDialog(T.activate.action)
    await screen.findByText(T.changed)
    expect(bodyOf(callsTo(fetchMock, `${PERF_URL}/activate`)[0])).toEqual({
      version: '8',
    })
  })

  it('finishes straight from ACTIVE after the 2-1 confirmation (API-047)', async () => {
    const { fetchMock } = open('ACTIVE', {
      [`POST ${PERF_URL}/finish`]: () => perf('FINISHED'),
    })
    await ready()
    click(T.finish.label)
    await screen.findByText(T.finish.title)
    expect(callsTo(fetchMock, `${PERF_URL}/finish`)).toHaveLength(0)
    inDialog(T.finish.action)
    await screen.findByText(T.changed)
    expect(bodyOf(callsTo(fetchMock, `${PERF_URL}/finish`)[0])).toEqual({
      version: '8',
    })
  })

  it('does nothing when 2-1 is cancelled', async () => {
    const { fetchMock } = open('LOCKED')
    await ready()
    click(T.finish.label)
    await screen.findByText(T.finish.title)
    inDialog(COPY.cancel)
    await waitFor(() => expect(screen.queryByText(T.finish.title)).toBeNull())
    expect(callsTo(fetchMock, `${PERF_URL}/finish`)).toHaveLength(0)
  })

  it('asks a reason (2-3) before cancelling and sends it', async () => {
    const { fetchMock } = open('ACTIVE', {
      [`POST ${PERF_URL}/cancel`]: () => perf('CANCELED'),
    })
    await ready()
    click(T.cancelPerf.label)
    await screen.findByText(T.cancelPerf.description)
    const action = screen
      .getAllByRole('button', { name: T.cancelPerf.action })
      .at(-1)
    expect((action as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  사정이 생겼어요  ' },
    })
    fireEvent.click(action as HTMLElement)
    await screen.findByText(T.changed)
    expect(bodyOf(callsTo(fetchMock, `${PERF_URL}/cancel`)[0])).toEqual({
      version: '8',
      reason: '사정이 생겼어요',
    })
  })

  it('sends the reason of 152 without a version', async () => {
    const { fetchMock } = open('FINISHED', {
      [`POST ${PERF_URL}/revert-to-locked`]: () =>
        json({ id: '31', status: 'LOCKED', version: '9' }),
    })
    await ready()
    click(T['revert-to-locked'].label)
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: '잘못 종료함' },
    })
    fireEvent.click(
      screen
        .getAllByRole('button', { name: T['revert-to-locked'].action })
        .at(-1) as HTMLElement,
    )
    await screen.findByText(T.changed)
    expect(
      bodyOf(callsTo(fetchMock, `${PERF_URL}/revert-to-locked`)[0]),
    ).toEqual({
      reason: '잘못 종료함',
    })
  })

  it('reverts to draft after 2-2, and explains a 422 (member input exists)', async () => {
    const { fetchMock } = open('ACTIVE', {
      [`POST ${PERF_URL}/revert-to-draft`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'RULE_VIOLATION',
              message: 'RULE_VIOLATION',
              details: [{ reason: 'MEMBER_INPUT_EXISTS', message: '투표 4건' }],
            },
          }),
          { status: 422 },
        ),
    })
    await ready()
    click(T['revert-to-draft'].label)
    await screen.findByText(T['revert-to-draft'].title)
    inDialog(T['revert-to-draft'].action)
    await screen.findByText(T.memberInputTitle)
    expect(screen.getByText('투표 4건')).toBeTruthy()
    expect(callsTo(fetchMock, `${PERF_URL}/revert-to-draft`)).toHaveLength(1)
  })

  it('checks before locking: an unmet condition keeps 확정 disabled and links to the fix', async () => {
    open('ACTIVE', {
      [`GET ${PERF_URL}/warnings`]: () =>
        json({
          items: [
            item('L-05', 'UNMET', '이서연 참여 승인 대기'),
            item('L-09', 'WARNING', '한소희 권장 곡 수 초과'),
          ],
        }),
    })
    await ready()
    click(T.lock.label)
    const region = within(
      await screen.findByRole('region', { name: T.checkTitle }),
    )
    await region.findByText('이서연 참여 승인 대기')
    expect(region.getByText('한소희 권장 곡 수 초과')).toBeTruthy()
    expect(region.getAllByLabelText(T.checkMarkOk)).toHaveLength(5)
    expect(
      region.getByRole('link', { name: T.resolve }).getAttribute('href'),
    ).toBe('/clubs/10/performances/31/members')
    const lock = screen.getAllByRole('button', { name: T.lockAction }).at(-1)
    expect((lock as HTMLButtonElement).disabled).toBe(true)
  })

  it('locks after 3-1, which lists the warnings, and shows them again as a banner', async () => {
    const { fetchMock } = open('ACTIVE', {
      [`GET ${PERF_URL}/warnings`]: () =>
        json({ items: [item('L-09', 'WARNING', '한소희 권장 곡 수 초과')] }),
      [`POST ${PERF_URL}/lock`]: () =>
        json({
          resource: detail('LOCKED').performance,
          warnings: [{ message: '한소희 권장 곡 수 초과' }],
          effects: {},
        }),
    })
    await ready()
    click(T.lock.label)
    await screen.findByText('한소희 권장 곡 수 초과')
    const lock = screen
      .getAllByRole('button', { name: T.lockAction })
      .at(-1) as HTMLButtonElement
    await waitFor(() => expect(lock.disabled).toBe(false))
    fireEvent.click(lock)

    await screen.findByText(T.lockTitle)
    expect(screen.getByText(T.lockWarnings(1), { exact: false })).toBeTruthy()
    // The checklist row plus the dialog's own list.
    expect(screen.getAllByText('한소희 권장 곡 수 초과')).toHaveLength(2)
    expect(callsTo(fetchMock, `${PERF_URL}/lock`)).toHaveLength(0)
    inDialog(T.confirm)

    await screen.findByText(T.locked)
    expect(bodyOf(callsTo(fetchMock, `${PERF_URL}/lock`)[0])).toEqual({
      version: '8',
      confirmed: true,
    })
    // The response's warnings come back as the global banner.
    await screen.findByText(COPY.warningBannerTitle)
  })

  it('explains a failed lock condition and rechecks', async () => {
    const { fetchMock } = open('ACTIVE', {
      [`GET ${PERF_URL}/warnings`]: () => json({ items: [] }),
      [`POST ${PERF_URL}/lock`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'RULE_VIOLATION',
              message: 'RULE_VIOLATION',
              details: [{ reason: 'LOCK_REQUIREMENTS_FAILED' }],
            },
          }),
          { status: 422 },
        ),
    })
    await ready()
    click(T.lock.label)
    const lock = (
      await screen.findAllByRole('button', { name: T.lockAction })
    ).at(-1) as HTMLButtonElement
    await waitFor(() => expect(lock.disabled).toBe(false))
    fireEvent.click(lock)
    await screen.findByText(T.lockTitle)
    inDialog(T.confirm)
    await screen.findByText(T.lockRuleFailed)
    await waitFor(() =>
      expect(callsTo(fetchMock, `${PERF_URL}/warnings`).length).toBeGreaterThan(
        1,
      ),
    )
  })
})
