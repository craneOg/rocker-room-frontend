import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import { body, open } from '../performance/viewTestKit'
import {
  AUDITIONS,
  audition,
  auditionPage,
  done,
  performanceAt,
  pickerRoutes,
  session,
} from './auditionTestKit'
import { AUDITION_COPY as T } from './auditionCopy'

setupDom()

const LIST_PATH = '/clubs/10/performances/31/auditions'
const RESULT = (id: string) => `${AUDITIONS}/${id}/result`

/** The list serves the target (there is no single read): pending rows on PENDING, done rows on DONE. */
const listOf =
  (pending: unknown[], finished: unknown[] = []): Route =>
  (url) =>
    auditionPage(url.includes('tab=DONE') ? finished : pending)

const saved = (extra: Record<string, unknown>) =>
  json({
    id: '12',
    type: 'SONG',
    songId: '41',
    songStatus: 'PROPOSED',
    partId: null,
    partName: null,
    applicantPerformanceMemberId: null,
    applicantName: null,
    result: 'PASSED',
    comment: null,
    judgedBy: '7',
    judgedByName: '명혜성',
    judgedAt: '2026-11-05T20:00:00+09:00',
    version: '2',
    ...extra,
  })

function show(id: string, extra: Record<string, Route> = {}) {
  // The global toast animates; jsdom has no Web Animations API.
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  return open(`${LIST_PATH}/${id}/result`, 'CLUB_ADMIN', {
    ...pickerRoutes,
    ...extra,
  })
}
const ready = async () => {
  await findScreen('AUDI-003')
  await screen.findByRole('button', { name: T.save })
}
const choose = (r: 'passed' | 'failed') =>
  fireEvent.click(screen.getByRole('button', { name: T[r] }))
const save = () => fireEvent.click(screen.getByRole('button', { name: T.save }))
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))

describe('AUDI-003 AuditionResult', () => {
  it('summarizes the target of a pending song audition', async () => {
    show('12', { [`GET ${AUDITIONS}`]: listOf([audition('12')]) })
    await ready()
    expect(screen.getByText('유형: 곡 심사')).toBeTruthy()
    expect(screen.getByText('곡: Song A')).toBeTruthy()
    expect(
      screen.getByText('등록 메모: 후렴 파트 위주로 심사합니다.'),
    ).toBeTruthy()
    expect(screen.queryByText(T.correctNotice)).toBeNull()
  })

  it('shows the applicant and part of a session audition', async () => {
    show('13', { [`GET ${AUDITIONS}`]: listOf([session('13')]) })
    await ready()
    expect(screen.getByText('지원자·파트: 박서연 · 기타')).toBeTruthy()
  })

  it('needs a result before saving', async () => {
    const { fetchMock } = show('12', {
      [`GET ${AUDITIONS}`]: listOf([audition('12')]),
      [`PUT ${RESULT('12')}`]: () => saved({}),
    })
    await ready()
    save()
    await screen.findByText(`* ${T.needResult}`)
    expect(callsTo(fetchMock, RESULT('12'))).toHaveLength(0)
  })

  it('saves result, trimmed opinion and the listed version, then goes back to the list', async () => {
    const { fetchMock, router } = show('12', {
      [`GET ${AUDITIONS}`]: listOf([audition('12', { version: '5' })]),
      [`PUT ${RESULT('12')}`]: () => saved({ songStatus: 'REJECTED' }),
    })
    await ready()
    choose('passed')
    fireEvent.change(screen.getByRole('textbox', { name: T.commentLabel }), {
      target: { value: '  좋아요  ' },
    })
    save()
    await screen.findByText(T.saved)
    expect(body(fetchMock, RESULT('12'))).toEqual({
      result: 'PASSED',
      comment: '좋아요',
      version: '5',
    })
    await waitFor(() => expect(router.state.location.pathname).toBe(LIST_PATH))
  })

  it('sends an empty opinion as null', async () => {
    const { fetchMock } = show('12', {
      [`GET ${AUDITIONS}`]: listOf([audition('12')]),
      [`PUT ${RESULT('12')}`]: () => saved({ songStatus: 'REJECTED' }),
    })
    await ready()
    choose('failed')
    save()
    await screen.findByText(T.saved)
    expect(body(fetchMock, RESULT('12'))).toMatchObject({
      result: 'FAILED',
      comment: null,
    })
  })

  describe('follow-up suggestion 4-1', () => {
    const base = '/clubs/10/performances/31'
    const cases: {
      name: string
      row: Record<string, unknown>
      pick: 'passed' | 'failed'
      response: Record<string, unknown>
      text: string
      action: string
      to: string
    }[] = [
      {
        name: 'song passed, song proposed',
        row: audition('12'),
        pick: 'passed',
        response: { result: 'PASSED' },
        text: T.followSelect,
        action: T.select,
        to: `${base}/songs/41`,
      },
      {
        name: 'song failed, song proposed',
        row: audition('12'),
        pick: 'failed',
        response: { result: 'FAILED' },
        text: T.followEliminate,
        action: T.eliminate,
        to: `${base}/songs/41`,
      },
      {
        name: 'song failed, song confirmed',
        row: audition('12', { songStatus: 'CONFIRMED' }),
        pick: 'failed',
        response: { result: 'FAILED', songStatus: 'CONFIRMED' },
        text: T.followEliminateConfirmed,
        action: T.eliminate,
        to: `${base}/songs/41`,
      },
      {
        name: 'session passed, song confirmed',
        row: session('13', { songStatus: 'CONFIRMED' }),
        pick: 'passed',
        response: {
          id: '13',
          type: 'SESSION',
          songStatus: 'CONFIRMED',
          partId: '4',
          partName: '기타',
          applicantPerformanceMemberId: '88',
          applicantName: '박서연',
        },
        text: T.followAssign('박서연', '기타'),
        action: T.assign,
        to: `${base}/songs/41/players?applicantPerformanceMemberId=88&partId=4`,
      },
    ]

    it.each(cases)(
      '$name asks, and the action opens the song screen',
      async ({ row, pick, response, text, action, to }) => {
        const { router } = show(String(row.id), {
          [`GET ${AUDITIONS}`]: listOf([row]),
          [`PUT ${RESULT(String(row.id))}`]: () => saved(response),
        })
        await ready()
        choose(pick)
        save()
        await screen.findByText(text)
        click(action)
        await waitFor(() => {
          const { pathname, search } = router.state.location
          expect(pathname + search).toBe(to)
        })
      },
    )

    it('"나중에" goes back to the list instead', async () => {
      const { router } = show('12', {
        [`GET ${AUDITIONS}`]: listOf([audition('12')]),
        [`PUT ${RESULT('12')}`]: () => saved({}),
      })
      await ready()
      choose('passed')
      save()
      await screen.findByText(T.followSelect)
      click(T.later)
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(LIST_PATH),
      )
    })

    it('session passed on a proposed song only reminds', async () => {
      const { router } = show('13', {
        [`GET ${AUDITIONS}`]: listOf([session('13')]),
        [`PUT ${RESULT('13')}`]: () =>
          saved({ id: '13', type: 'SESSION', partId: '4', partName: '기타' }),
      })
      await ready()
      choose('passed')
      save()
      await screen.findByText(T.followAssignLater)
      click(T.ok)
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(LIST_PATH),
      )
    })

    it('session failed only toasts, without a dialog', async () => {
      show('13', {
        [`GET ${AUDITIONS}`]: listOf([session('13')]),
        [`PUT ${RESULT('13')}`]: () =>
          saved({ id: '13', type: 'SESSION', result: 'FAILED' }),
      })
      await ready()
      choose('failed')
      save()
      await screen.findByText(T.saved)
      expect(screen.queryByText(T.followTitle)).toBeNull()
    })
  })

  describe('correction mode', () => {
    it('warns, prefills and sends the current version', async () => {
      const { fetchMock } = show('21', {
        [`GET ${AUDITIONS}`]: listOf([], [done('21', 'FAILED')]),
        [`PUT ${RESULT('21')}`]: () =>
          saved({ id: '21', type: 'SESSION', result: 'PASSED' }),
      })
      await ready()
      expect(screen.getByText(T.correctNotice)).toBeTruthy()
      expect(
        (
          screen.getByRole('textbox', {
            name: T.commentLabel,
          }) as HTMLTextAreaElement
        ).value,
      ).toBe('리듬이 안정적입니다.')
      expect(
        screen
          .getByRole('button', { name: T.failed })
          .getAttribute('aria-pressed'),
      ).toBe('true')
      choose('passed')
      save()
      await waitFor(() =>
        expect(body(fetchMock, RESULT('21'))).toEqual({
          result: 'PASSED',
          comment: '리듬이 안정적입니다.',
          version: '2',
        }),
      )
    })
  })

  describe('LOCKED performance (X-02)', () => {
    const locked = (extra: Record<string, Route> = {}) =>
      show('12', {
        ...performanceAt('LOCKED'),
        [`GET ${AUDITIONS}`]: listOf([audition('12')]),
        ...extra,
      })

    it('asks for a reason first and sends it with the result', async () => {
      const { fetchMock } = locked({
        [`PUT ${RESULT('12')}`]: () => saved({ songStatus: 'REJECTED' }),
      })
      await ready()
      choose('passed')
      save()
      await screen.findByText(T.reasonTitle)
      expect(callsTo(fetchMock, RESULT('12'))).toHaveLength(0)
      fireEvent.change(screen.getByRole('textbox', { name: T.reasonTitle }), {
        target: { value: '심사 결과 정정' },
      })
      fireEvent.click(
        screen.getAllByRole('button', { name: T.save }).at(-1) as HTMLElement,
      )
      await screen.findByText(T.saved)
      expect(body(fetchMock, RESULT('12'))).toMatchObject({
        result: 'PASSED',
        reason: '심사 결과 정정',
        version: '1',
      })
    })

    it('saves nothing when the reason is cancelled', async () => {
      const { fetchMock } = locked({
        [`PUT ${RESULT('12')}`]: () => saved({}),
      })
      await ready()
      choose('passed')
      save()
      await screen.findByText(T.reasonTitle)
      fireEvent.click(screen.getByRole('button', { name: COPY.cancel }))
      await waitFor(() => expect(screen.queryByText(T.reasonTitle)).toBeNull())
      expect(callsTo(fetchMock, RESULT('12'))).toHaveLength(0)
    })
  })

  it.each(['FINISHED', 'CANCELED'])(
    'cannot be saved on a %s performance',
    async (status) => {
      show('12', {
        ...performanceAt(status),
        [`GET ${AUDITIONS}`]: listOf([audition('12')]),
      })
      await findScreen('AUDI-003')
      await screen.findByText(T.closedPerformance)
      expect(screen.queryByRole('button', { name: T.save })).toBeNull()
    },
  )

  it('tells about a concurrent edit and reloads the latest version (409 VERSION_CONFLICT)', async () => {
    let version = '1'
    const { fetchMock } = show('12', {
      [`GET ${AUDITIONS}`]: (url) =>
        auditionPage(
          url.includes('tab=DONE') ? [] : [audition('12', { version })],
        ),
      [`PUT ${RESULT('12')}`]: () => {
        version = '3'
        return apiError('VERSION_CONFLICT', 409)
      },
    })
    await ready()
    choose('passed')
    save()
    await screen.findByText(COPY.versionConflictTitle)
    fireEvent.click(screen.getByRole('button', { name: COPY.confirm }))
    // The latest version is read again; the next save uses it.
    await waitFor(() =>
      expect(callsTo(fetchMock, AUDITIONS).length).toBeGreaterThan(1),
    )
    // The form starts over with the new version: the earlier pick is gone.
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: T.passed })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    )
    choose('passed')
    save()
    await waitFor(() =>
      expect(body(fetchMock, RESULT('12'))).toMatchObject({ version: '3' }),
    )
  })

  it('shows the not-found view for an unknown audition', async () => {
    show('99', {
      [`GET ${AUDITIONS}`]: listOf([audition('12')], [done('21', 'PASSED')]),
    })
    await findScreen('AUDI-003')
    await screen.findByText(COPY.notFoundTitle)
    expect(screen.queryByRole('button', { name: T.save })).toBeNull()
  })

  it('shows an error with a retry when the list fails', async () => {
    let healthy = false
    show('12', {
      [`GET ${AUDITIONS}`]: (url) =>
        healthy ? listOf([audition('12')])(url) : apiError('UNKNOWN', 500),
    })
    await findScreen('AUDI-003')
    const retry = await screen.findByRole('button', { name: COPY.retry })
    healthy = true
    fireEvent.click(retry)
    await screen.findByRole('button', { name: T.save })
  })
})
