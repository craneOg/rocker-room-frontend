import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  apiError,
  callsTo,
  findScreen,
  setupDom,
  type Route,
} from '../../test/harness'
import { lastQuery, open } from '../performance/viewTestKit'
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

const PATH = '/clubs/10/performances/31/auditions'

function show(extra: Record<string, Route> = {}) {
  return open(PATH, 'CLUB_ADMIN', { ...pickerRoutes, ...extra })
}
const ready = async () => {
  await findScreen('AUDI-001')
}
const names = () =>
  screen.getAllByRole('button').map((b) => b.textContent ?? '')

describe('AUDI-001 AuditionList', () => {
  it('lists pending cards grouped under one song title line', async () => {
    show({
      [`GET ${AUDITIONS}`]: () =>
        auditionPage(
          [
            audition('12'),
            session('13'),
            session('14', { songId: '42', songTitle: 'Song B' }),
          ],
          { pendingCount: 3 },
        ),
    })
    await ready()
    expect(await screen.findAllByText('박서연 · 기타')).toHaveLength(2)
    // Two cards of song 41 share one heading.
    expect(screen.getAllByRole('heading', { name: 'Song A' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { name: 'Song B' })).toHaveLength(1)
    expect(screen.getByText('곡 전체 · 은하수')).toBeTruthy()
    expect(screen.getByText('후렴 파트 위주로 심사합니다.')).toBeTruthy()
    expect(screen.getAllByText('심사 대기').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: T.tabPending(3) })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: T.enterResult })).toHaveLength(
      3,
    )
    expect(names()).not.toContain(T.correct)
  })

  it('asks the pending tab first and the done tab on click, showing result, opinion and judge', async () => {
    const { fetchMock } = show({
      [`GET ${AUDITIONS}`]: (url) =>
        url.includes('tab=DONE')
          ? auditionPage([done('21', 'PASSED')], { pendingCount: 2 })
          : auditionPage([audition('12')], { pendingCount: 2 }),
    })
    await ready()
    await screen.findByText('후렴 파트 위주로 심사합니다.')
    expect(lastQuery(fetchMock, AUDITIONS).get('tab')).toBe('PENDING')
    fireEvent.click(screen.getByRole('tab', { name: T.tabDone }))
    await screen.findByText('리듬이 안정적입니다.')
    expect(lastQuery(fetchMock, AUDITIONS).get('tab')).toBe('DONE')
    expect(screen.getByText('합격')).toBeTruthy()
    expect(screen.getByText(/명혜성 · 2026\.11\.05/)).toBeTruthy()
    expect(screen.getByRole('button', { name: T.correct })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.reRegister })).toBeTruthy()
    expect(names()).not.toContain(T.enterResult)
    // The pending count stays on the tab while the done tab is open.
    expect(screen.getByRole('tab', { name: T.tabPending(2) })).toBeTruthy()
  })

  it('sends the type, song and schedule filters', async () => {
    const { fetchMock } = show({
      [`GET ${AUDITIONS}`]: () => auditionPage([audition('12')]),
    })
    await ready()
    await screen.findByText('후렴 파트 위주로 심사합니다.')
    fireEvent.click(screen.getByRole('button', { name: T.typeSession }))
    await waitFor(() =>
      expect(lastQuery(fetchMock, AUDITIONS).get('type')).toBe('SESSION'),
    )
    // The pickers load on their own: wait for their options.
    await screen.findByRole('option', { name: 'Song B' })
    fireEvent.change(screen.getByLabelText(T.filterSong), {
      target: { value: '42' },
    })
    await screen.findByRole('option', { name: /오디션 1차/ })
    fireEvent.change(screen.getByLabelText(T.filterSchedule), {
      target: { value: '305' },
    })
    await waitFor(() => {
      const q = lastQuery(fetchMock, AUDITIONS)
      expect(q.get('songId')).toBe('42')
      expect(q.get('scheduleId')).toBe('305')
      expect(q.get('type')).toBe('SESSION')
    })
    // Canceled schedules are not offered.
    expect(screen.queryByRole('option', { name: /취소된 오디션/ })).toBeNull()
  })

  it('shows the empty state', async () => {
    show({ [`GET ${AUDITIONS}`]: () => auditionPage([]) })
    await ready()
    await screen.findByText(T.empty)
  })

  it('offers a retry when the list fails', async () => {
    let healthy = false
    show({
      [`GET ${AUDITIONS}`]: () =>
        healthy ? auditionPage([audition('12')]) : apiError('UNKNOWN', 500),
    })
    await ready()
    const retry = await screen.findByRole('button', { name: '다시 시도' })
    healthy = true
    fireEvent.click(retry)
    await screen.findByText('후렴 파트 위주로 심사합니다.')
  })

  it('opens the result screen from a card and the form from the register button', async () => {
    const { router } = show({
      [`GET ${AUDITIONS}`]: () => auditionPage([audition('12')]),
    })
    await ready()
    fireEvent.click(await screen.findByRole('button', { name: T.enterResult }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${PATH}/12/result`),
    )
  })

  it('links the register button to AUDI-002', async () => {
    show({ [`GET ${AUDITIONS}`]: () => auditionPage([audition('12')]) })
    await ready()
    const link = await screen.findByRole('link', { name: `+ ${T.register}` })
    expect(link.getAttribute('href')).toBe(`${PATH}/new`)
  })

  it('re-registers a done session audition with the same target', async () => {
    const { router } = show({
      [`GET ${AUDITIONS}`]: (url) =>
        url.includes('tab=DONE')
          ? auditionPage([done('21', 'FAILED')])
          : auditionPage([]),
    })
    await ready()
    fireEvent.click(screen.getByRole('tab', { name: T.tabDone }))
    fireEvent.click(await screen.findByRole('button', { name: T.reRegister }))
    await waitFor(() => {
      const { pathname, search } = router.state.location
      expect(pathname).toBe(`${PATH}/new`)
      const q = new URLSearchParams(search)
      expect(q.get('type')).toBe('SESSION')
      expect(q.get('songId')).toBe('41')
      expect(q.get('partId')).toBe('4')
      expect(q.get('applicantId')).toBe('88')
    })
  })

  it.each(['FINISHED', 'CANCELED'])(
    'hides every write entry on a %s performance',
    async (status) => {
      show({
        ...performanceAt(status),
        [`GET ${AUDITIONS}`]: () => auditionPage([audition('12')]),
      })
      await ready()
      await screen.findByText('후렴 파트 위주로 심사합니다.')
      // The detail loads next to the list: wait for the register link to be gone, then assert.
      await waitFor(() =>
        expect(
          screen.queryByRole('link', { name: `+ ${T.register}` }),
        ).toBeNull(),
      )
      expect(names()).not.toContain(T.enterResult)
    },
  )

  it('loads the next page', async () => {
    const { fetchMock } = show({
      [`GET ${AUDITIONS}`]: (url) =>
        url.includes('page=1')
          ? auditionPage(
              [audition('13', { songId: '43', songTitle: 'Song C' })],
              {
                page: 1,
                totalPages: 2,
              },
            )
          : auditionPage([audition('12')], { page: 0, totalPages: 2 }),
    })
    await ready()
    fireEvent.click(await screen.findByRole('button', { name: T.loadMore }))
    await screen.findByRole('heading', { name: 'Song C' })
    expect(lastQuery(fetchMock, AUDITIONS).get('page')).toBe('1')
    expect(callsTo(fetchMock, AUDITIONS).length).toBeGreaterThan(1)
  })

  it('sends a regular member back to the club home', async () => {
    const { router } = open(PATH, 'MEMBER', pickerRoutes)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10'),
    )
    expect(document.querySelector('[data-screen-id="AUDI-001"]')).toBeNull()
  })

  it('shows the card of the whole list inside its group', async () => {
    show({
      [`GET ${AUDITIONS}`]: () => auditionPage([audition('12')]),
    })
    await ready()
    const heading = await screen.findByRole('heading', { name: 'Song A' })
    const group = heading.closest('section') as HTMLElement
    expect(within(group).getByText('곡 전체 · 은하수')).toBeTruthy()
  })
})
