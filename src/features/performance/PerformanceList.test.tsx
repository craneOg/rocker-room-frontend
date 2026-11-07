import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import { apiError, callsTo, findScreen, setupDom } from '../../test/harness'
import { BASE, lastQuery, open, page, perf } from './viewTestKit'
import { VIEW_COPY as T } from './viewCopy'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const LIST = `${BASE}/performances`
const item = (extra: Record<string, unknown> = {}) => ({
  ...perf(),
  myParticipationStatus: null,
  openFeatures: [],
  ...extra,
})

describe('PERF-001 performance list', () => {
  it('shows cards with status, date, place, preset, my status and open features', async () => {
    const { fetchMock } = open('/clubs/10/performances', 'MEMBER', {
      [`GET ${LIST}`]: () =>
        page([
          item({
            myParticipationStatus: 'APPLIED',
            openFeatures: [
              { feature: 'VOTE', deadlineAt: null },
              {
                feature: 'AVAILABILITY',
                deadlineAt: '2026-10-15T23:00:00+09:00',
              },
            ],
          }),
          item({
            id: '32',
            title: '버스킹',
            performDate: null,
            location: null,
          }),
        ]),
    })
    await findScreen('PERF-001')

    const card = (await screen.findByText('가을 정기공연')).closest('a')
    expect(card?.getAttribute('href')).toBe('/clubs/10/performances/31')
    expect(card?.textContent).toContain('학생회관')
    expect(card?.textContent).toContain('팀 먼저')
    expect(card?.textContent).toContain('참여 희망')
    expect(card?.textContent).toContain('투표 진행 중')
    expect(card?.textContent).toContain('가능 시간 ~10.15')
    expect(screen.getByText(T.dateUndecided)).toBeTruthy()
    const q = lastQuery(fetchMock, LIST)
    expect(q.get('status')).toBe('ACTIVE,LOCKED')
    expect(q.get('sort')).toBe('performDate,asc')
  })

  it('shows the empty state of the active tab', async () => {
    open('/clubs/10/performances', 'MEMBER', {
      [`GET ${LIST}`]: () => page([]),
    })
    await screen.findByText(T.emptyActive)
  })

  it('hides the draft tab and the create button from regular members', async () => {
    open('/clubs/10/performances', 'MEMBER', {
      [`GET ${LIST}`]: () => page([item()]),
    })
    await screen.findByText('가을 정기공연')
    expect(screen.queryByRole('tab', { name: T.tabDraft })).toBeNull()
    expect(screen.queryByText(`+ ${T.create}`)).toBeNull()
    expect(screen.getByRole('tab', { name: T.tabPast })).toBeTruthy()
  })

  it('lets officers switch tabs and create (draft empty state offers the button)', async () => {
    const { fetchMock, router } = open('/clubs/10/performances', 'CLUB_ADMIN', {
      [`GET ${LIST}`]: (url) => page(url.includes('DRAFT') ? [] : [item()]),
    })
    await screen.findByText('가을 정기공연')
    expect(screen.getByText(`+ ${T.create}`).getAttribute('href')).toBe(
      '/clubs/10/performances/new',
    )

    fireEvent.click(screen.getByRole('tab', { name: T.tabDraft }))
    await screen.findByText(T.emptyDraft)
    expect(lastQuery(fetchMock, LIST).get('status')).toBe('DRAFT')
    fireEvent.click(await screen.findByRole('button', { name: T.create }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/performances/new'),
    )
  })

  it('queries the past tab with FINISHED,CANCELED newest first', async () => {
    const { fetchMock } = open('/clubs/10/performances', 'MEMBER', {
      [`GET ${LIST}`]: () => page([item()]),
    })
    await screen.findByText('가을 정기공연')
    fireEvent.click(screen.getByRole('tab', { name: T.tabPast }))
    await waitFor(() =>
      expect(lastQuery(fetchMock, LIST).get('status')).toBe(
        'FINISHED,CANCELED',
      ),
    )
    expect(lastQuery(fetchMock, LIST).get('sort')).toBe('performDate,desc')
  })

  it('hides the create button while the club is inactive (G-08)', async () => {
    open(
      '/clubs/10/performances',
      'CLUB_ADMIN',
      { [`GET ${LIST}`]: () => page([item()]) },
      { clubStatus: 'INACTIVE' },
    )
    await screen.findByText('가을 정기공연')
    expect(screen.queryByText(`+ ${T.create}`)).toBeNull()
  })

  it('retries after a failure', async () => {
    let healthy = false
    const { fetchMock } = open('/clubs/10/performances', 'MEMBER', {
      [`GET ${LIST}`]: () =>
        healthy ? page([item()]) : apiError('UNKNOWN', 500),
    })
    const retry = await screen.findByRole('button', { name: COPY.retry })
    const before = callsTo(fetchMock, LIST).length
    healthy = true
    fireEvent.click(retry)
    await screen.findByText('가을 정기공연')
    expect(callsTo(fetchMock, LIST).length).toBeGreaterThan(before)
  })
})
