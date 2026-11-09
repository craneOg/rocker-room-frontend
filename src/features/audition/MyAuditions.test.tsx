import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  apiError,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import { lastQuery, open } from '../performance/viewTestKit'
import { AUDITION_COPY as T } from './auditionCopy'

setupDom()

const PATH = '/clubs/10/performances/31/auditions/mine'
const ME = '/api/v1/me/auditions'

const mine = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  clubId: '10',
  performanceId: '31',
  type: 'SESSION',
  songId: '41',
  songTitle: 'Song A',
  partId: '4',
  partName: '기타',
  scheduledAt: '2026-11-12T19:00:00+09:00',
  result: 'PASSED',
  comment: '리듬이 안정적입니다.',
  judgedAt: '2026-11-12T20:00:00+09:00',
  isLatest: true,
  ...extra,
})

function show(
  items: unknown[] | Route,
  role: 'CLUB_ADMIN' | 'MEMBER' = 'MEMBER',
) {
  return open(PATH, role, {
    [`GET ${ME}`]: typeof items === 'function' ? items : () => json({ items }),
  })
}

describe('AUDI-004 MyAuditions', () => {
  it('shows my result with song, part, date, judging day and opinion', async () => {
    const { fetchMock } = show([mine('14')])
    await findScreen('AUDI-004')
    await screen.findByText('Song A')
    expect(screen.getByText('기타')).toBeTruthy()
    expect(screen.getByText('합격')).toBeTruthy()
    expect(screen.getByText('11.12(목) 19:00')).toBeTruthy()
    expect(screen.getByText('2026.11.12')).toBeTruthy()
    expect(screen.getByText('리듬이 안정적입니다.')).toBeTruthy()
    // API-150 is not under a performance: the screen's club and performance are filters.
    const q = lastQuery(fetchMock, ME)
    expect(q.get('clubId')).toBe('10')
    expect(q.get('performanceId')).toBe('31')
  })

  it('shows a waiting audition as pending, without opinion or judging day', async () => {
    show([
      mine('15', {
        result: null,
        comment: null,
        judgedAt: null,
        scheduledAt: null,
      }),
    ])
    await screen.findByText('심사 대기')
    expect(screen.getByText(T.noSchedule)).toBeTruthy()
    expect(screen.queryByText('리듬이 안정적입니다.')).toBeNull()
  })

  it('shows the latest result first and folds the earlier ones', async () => {
    show([
      mine('14'),
      mine('12', {
        result: 'FAILED',
        comment: '박자 보완이 필요합니다.',
        isLatest: false,
      }),
      mine('20', { songId: '42', songTitle: 'Song B', isLatest: true }),
    ])
    await screen.findByText('Song B')
    const folded = screen
      .getByText(T.earlier(1))
      .closest('details') as HTMLElement
    expect(within(folded).getByText('박자 보완이 필요합니다.')).toBeTruthy()
    // Not open by default; the latest cards stay outside.
    expect(folded.hasAttribute('open')).toBe(false)
    expect(within(folded).queryByText('Song B')).toBeNull()
    expect(screen.getAllByText('Song A')).toHaveLength(2)
    expect(screen.queryAllByText(T.earlier(1))).toHaveLength(1)
  })

  it('shows the empty state', async () => {
    show([])
    await screen.findByText(T.empty)
  })

  it('retries after a failure', async () => {
    let healthy = false
    show(() =>
      healthy ? json({ items: [mine('14')] }) : apiError('UNKNOWN', 500),
    )
    const retry = await screen.findByRole('button', { name: '다시 시도' })
    healthy = true
    fireEvent.click(retry)
    await screen.findByText('Song A')
  })

  it('is open to officers as well (it is their own result)', async () => {
    show([mine('14')], 'CLUB_ADMIN')
    await screen.findByText('Song A')
  })
})
