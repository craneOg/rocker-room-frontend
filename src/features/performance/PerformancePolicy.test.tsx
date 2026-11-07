import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  renderApp,
  setupDom,
  stubApi,
  type Route,
} from '../../test/harness'
import { POLICY_COPY as T } from './policyCopy'
import { bodyOf, detail, PERF_URL, sessionRoutes } from './policyFixtures'
import type { PerformanceStatus } from './types'

setupDom()

function open(
  status: PerformanceStatus = 'ACTIVE',
  extra: Record<string, Route> = {},
  policy: Parameters<typeof detail>[1] = {},
) {
  // The global toast animates; jsdom has no Web Animations API.
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  const fetchMock = stubApi({
    ...sessionRoutes,
    [`GET ${PERF_URL}`]: () => json(detail(status, policy)),
    ...extra,
  })
  const router = renderApp('/clubs/10/performances/31/policy')
  return { fetchMock, router }
}

const card = (title: string) =>
  within(screen.getByRole('region', { name: title }))
const save = () => screen.getByRole('button', { name: T.save })
const inDialog = (name: string) =>
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) as HTMLElement)

describe('PERF-004 PerformancePolicy', () => {
  it('shows the policy, enables 저장 only after a change and sends just what changed', async () => {
    const saved = detail('ACTIVE', { applicationState: 'CLOSED' })
    const { fetchMock } = open('ACTIVE', {
      [`PATCH ${PERF_URL}/policy`]: () =>
        json({ policy: saved.policy, warnings: [] }),
    })
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    expect((save() as HTMLButtonElement).disabled).toBe(true)
    expect(
      (
        card(T.features.application).getByRole('radio', {
          name: T.stateOpen,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)

    fireEvent.click(
      card(T.features.application).getByRole('radio', { name: T.stateClosed }),
    )
    await waitFor(() =>
      expect((save() as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(save())

    await screen.findByText(COPY.saved)
    expect(bodyOf(callsTo(fetchMock, `${PERF_URL}/policy`)[0])).toEqual({
      version: '8',
      applicationState: 'CLOSED',
    })
  })

  it('sends a deadline as +09:00 and a limit as a number or null', async () => {
    const { fetchMock } = open('DRAFT', {
      [`PATCH ${PERF_URL}/policy`]: () =>
        json({ policy: detail('DRAFT').policy, warnings: [] }),
    })
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    fireEvent.change(
      screen.getByLabelText(`${T.features.vote} ${T.deadline}`),
      {
        target: { value: '2026-11-07T21:30' },
      },
    )
    fireEvent.click(
      card(T.features.candidate).getByRole('checkbox', { name: T.unlimited }),
    )
    fireEvent.click(save())
    await screen.findByText(COPY.saved)
    expect(bodyOf(callsTo(fetchMock, `${PERF_URL}/policy`)[0])).toEqual({
      version: '8',
      voteDeadline: '2026-11-07T21:30:00+09:00',
      candidateLimitPerMember: null,
    })
  })

  it('keeps a limit editable when its text is cleared to type a new number', async () => {
    open('DRAFT')
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    const field = screen.getByLabelText(T.candidateLimit) as HTMLInputElement
    const box = card(T.features.candidate).getByRole('checkbox', {
      name: T.unlimited,
    }) as HTMLInputElement
    fireEvent.change(field, { target: { value: '' } })
    expect(box.checked).toBe(false)
    expect(field.disabled).toBe(false)
    fireEvent.change(field, { target: { value: '5' } })
    expect(field.value).toBe('5')
    // Leaving it empty puts a number back instead of silently saving "no limit".
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(field.value).toBe('1')
    await act(async () => {})
  })

  it('checks a vote-method change, asks 4-1 with the vote count, then changes it with confirmed', async () => {
    const changed = detail('ACTIVE', {
      voteMethod: 'SCORE',
      performanceVersion: '9',
    })
    const { fetchMock } = open('ACTIVE', {
      [`POST ${PERF_URL}/policy/vote-method/validate`]: () =>
        json({
          hardErrors: [],
          warnings: [{ message: '투표 4건이 삭제돼요.', affectedCount: 4 }],
        }),
      [`PUT ${PERF_URL}/policy/vote-method`]: () =>
        json({ policy: changed.policy, removedVoteCount: 4 }),
    })
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    fireEvent.click(card(T.features.vote).getByRole('radio', { name: T.score }))
    fireEvent.change(screen.getByLabelText(T.voteReasonLabel), {
      target: { value: '점수제로 바꿔요' },
    })
    fireEvent.click(save())

    await screen.findByText(T.voteChangeTitle)
    expect(screen.getByText(T.voteChangeBody(4))).toBeTruthy()
    expect(callsTo(fetchMock, `${PERF_URL}/policy/vote-method`)).toHaveLength(0)
    inDialog(T.voteChangeAction)

    await screen.findByText(COPY.saved)
    expect(
      bodyOf(callsTo(fetchMock, `${PERF_URL}/policy/vote-method`)[0]),
    ).toEqual({
      version: '8',
      voteMethod: 'SCORE',
      confirmed: true,
      reason: '점수제로 바꿔요',
    })
    // Only the method changed: no policy PATCH.
    expect(callsTo(fetchMock, `${PERF_URL}/policy`)).toHaveLength(0)
  })

  it('asks a reason for a vote-method change and blocks saving without one', async () => {
    open('ACTIVE')
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    expect(screen.queryByLabelText(T.voteReasonLabel)).toBeNull()
    fireEvent.click(card(T.features.vote).getByRole('radio', { name: T.score }))
    expect((save() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(T.voteReasonLabel), {
      target: { value: '   ' },
    })
    expect((save() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(T.voteReasonLabel), {
      target: { value: '점수제로 바꿔요' },
    })
    expect((save() as HTMLButtonElement).disabled).toBe(false)
    // Let the effects of the changes settle before the test ends.
    await act(async () => {})
  })

  it('does not change the vote method when 4-1 is cancelled', async () => {
    const { fetchMock } = open('ACTIVE', {
      [`POST ${PERF_URL}/policy/vote-method/validate`]: () =>
        json({
          hardErrors: [],
          warnings: [{ message: 'x', affectedCount: 2 }],
        }),
    })
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    fireEvent.click(card(T.features.vote).getByRole('radio', { name: T.score }))
    fireEvent.change(screen.getByLabelText(T.voteReasonLabel), {
      target: { value: '점수제로 바꿔요' },
    })
    fireEvent.click(save())
    await screen.findByText(T.voteChangeTitle)
    inDialog(T.cancel)
    await waitFor(() =>
      expect(screen.queryByText(T.voteChangeTitle)).toBeNull(),
    )
    expect(callsTo(fetchMock, `${PERF_URL}/policy/vote-method`)).toHaveLength(0)
    expect((save() as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks saving availability OPEN without a practice season (F-04)', async () => {
    open('ACTIVE')
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    fireEvent.click(
      card(T.features.availability).getByRole('radio', { name: T.stateOpen }),
    )
    await screen.findByText(`* ${T.seasonRequired}`)
    expect((save() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(T.seasonStart), {
      target: { value: '2026-10-15' },
    })
    fireEvent.change(screen.getByLabelText(T.seasonEnd), {
      target: { value: '2026-11-20' },
    })
    await waitFor(() =>
      expect((save() as HTMLButtonElement).disabled).toBe(false),
    )
    // F-06: the season ends after the performance date.
    expect(screen.getByText(T.seasonAfterPerform)).toBeTruthy()
  })

  it('shows a server rule violation (season required) as a dialog', async () => {
    open('ACTIVE', {
      [`PATCH ${PERF_URL}/policy`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'RULE_VIOLATION',
              message: 'RULE_VIOLATION',
              details: [{ reason: 'PRACTICE_SEASON_REQUIRED' }],
            },
          }),
          { status: 422 },
        ),
    })
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    fireEvent.click(
      card(T.features.application).getByRole('radio', { name: T.stateClosed }),
    )
    fireEvent.click(save())
    await screen.findByText(COPY.ruleViolationTitle)
    expect(screen.getByText(T.seasonRequired)).toBeTruthy()
  })

  it('asks before leaving with unsaved changes (0-1): 계속 수정 stays, 나가기 leaves', async () => {
    const { router } = open('ACTIVE')
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    fireEvent.click(
      card(T.features.application).getByRole('radio', { name: T.stateClosed }),
    )

    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await screen.findByText(T.leaveTitle)
    inDialog(T.keepEditing)
    await waitFor(() => expect(screen.queryByText(T.leaveTitle)).toBeNull())
    expect(router.state.location.pathname).toBe(
      '/clubs/10/performances/31/policy',
    )

    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await screen.findByText(T.leaveTitle)
    inDialog(T.leave)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10'),
    )
  })

  it('leaves without asking when nothing changed', async () => {
    const { router } = open('ACTIVE')
    await findScreen('PERF-004')
    await screen.findByText(T.presetLine('팀 먼저'))
    await act(async () => {
      void router.navigate('/clubs/10/performances')
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/performances'),
    )
    expect(screen.queryByText(T.leaveTitle)).toBeNull()
  })

  it('is read-only from LOCKED on', async () => {
    open('LOCKED')
    await findScreen('PERF-004')
    await screen.findAllByText(T.lockedBanner)
    expect(screen.queryByRole('button', { name: T.save })).toBeNull()
    expect(
      (
        card(T.features.application).getByRole('radio', {
          name: T.stateClosed,
        }) as HTMLInputElement
      ).matches(':disabled'),
    ).toBe(true)
  })

  it('retries a failed load', async () => {
    let calls = 0
    open('ACTIVE', {
      [`GET ${PERF_URL}`]: () =>
        ++calls === 1 ? apiError('UNKNOWN', 500) : json(detail('ACTIVE')),
    })
    await findScreen('PERF-004')
    fireEvent.click(await screen.findByRole('button', { name: COPY.retry }))
    await screen.findByText(T.presetLine('팀 먼저'))
  })
})
