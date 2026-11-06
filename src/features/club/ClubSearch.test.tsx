import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
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
import { CLUB_COPY as T } from './copy'

setupDom()

const SEARCH = '/api/v1/clubs/search'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const item = (id: string, name: string) => ({
  club: {
    id,
    name,
    description: `${name} 소개`,
    clubType: 'CLUB',
    profileImageUrl: null,
    themeColor: null,
  },
  existingMembershipStatus: null,
  canApply: true,
})
const page = (items: unknown[], pageNo: number, totalPages: number) =>
  json({
    items,
    page: pageNo,
    size: 20,
    totalElements: items.length,
    totalPages,
  })

function openSearch(extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [] }),
    [`GET ${SEARCH}`]: () => page([item('10', 'Crane Band')], 0, 1),
    ['POST /api/v1/clubs/10/join-requests']: () => json({}, 201),
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/search') }
}

const field = () => screen.getByPlaceholderText(T.searchPlaceholder)
const searchButton = () =>
  screen.getByRole('button', { name: T.searchTitle }) as HTMLButtonElement
const search = (q: string) => {
  fireEvent.change(field(), { target: { value: q } })
  fireEvent.click(searchButton())
}

describe('CLUB-003 ClubSearch', () => {
  it('asks for 2+ characters and does not call the API for 1', async () => {
    const { fetchMock } = openSearch()
    await findScreen('CLUB-003')

    fireEvent.change(field(), { target: { value: 'a' } })
    expect(screen.getByText(`* ${T.searchShort}`)).toBeTruthy()
    expect(searchButton().disabled).toBe(true)
    expect(callsTo(fetchMock, SEARCH)).toHaveLength(0)
  })

  it('limits the query to 100 characters (API-012)', async () => {
    openSearch()
    await findScreen('CLUB-003')
    expect(field().getAttribute('maxlength')).toBe('100')
  })

  it('lists results with the query, page size and sort', async () => {
    const { fetchMock } = openSearch()
    await findScreen('CLUB-003')
    search('cra')

    await screen.findByText('Crane Band')
    const url = new URL(callsTo(fetchMock, SEARCH)[0]![0], 'http://x')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'cra',
      page: '0',
      size: '20',
      sort: 'name,asc',
    })
  })

  it('shows the empty state for no results', async () => {
    openSearch({ [`GET ${SEARCH}`]: () => page([], 0, 0) })
    await findScreen('CLUB-003')
    search('zzz')

    await screen.findByText(T.searchEmpty)
  })

  it('loads the next page and appends it', async () => {
    const { fetchMock } = openSearch({
      [`GET ${SEARCH}`]: (url) =>
        url.includes('page=1')
          ? page([item('11', 'Second Club')], 1, 2)
          : page([item('10', 'Crane Band')], 0, 2),
    })
    await findScreen('CLUB-003')
    search('band')

    await screen.findByText('Crane Band')
    fireEvent.click(screen.getByRole('button', { name: T.loadMore }))
    await screen.findByText('Second Club')
    expect(screen.getByText('Crane Band')).toBeTruthy()
    expect(callsTo(fetchMock, SEARCH)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: T.loadMore })).toBeNull()
  })

  it('applies only after the confirm modal, with source SEARCH', async () => {
    const { fetchMock, router } = openSearch()
    await findScreen('CLUB-003')
    search('crane')
    const apply = () => screen.getByRole('button', { name: T.apply })
    await screen.findByText('Crane Band')

    // Cancel: nothing is sent.
    fireEvent.click(apply())
    await screen.findByText(T.applyConfirmTitle('Crane Band'))
    fireEvent.click(screen.getByRole('button', { name: COPY.cancel }))
    await waitFor(() =>
      expect(screen.queryByText(T.applyConfirmTitle('Crane Band'))).toBeNull(),
    )
    expect(callsTo(fetchMock, '/api/v1/clubs/10/join-requests')).toHaveLength(0)

    // Confirm: one request, then the completion modal.
    fireEvent.click(apply())
    await screen.findByText(T.applyConfirmTitle('Crane Band'))
    fireEvent.click(
      screen.getAllByRole('button', { name: T.apply }).at(-1) as HTMLElement,
    )
    await screen.findByText(T.applyDoneTitle)
    const calls = callsTo(fetchMock, '/api/v1/clubs/10/join-requests')
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0]![1]?.body))).toEqual({ source: 'SEARCH' })
    fireEvent.click(screen.getByRole('button', { name: T.confirm }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/start'))
  })
})
