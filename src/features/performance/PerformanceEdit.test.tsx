import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
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
import { FORM_COPY as T } from './formCopy'

setupDom()

Object.defineProperty(Element.prototype, 'getAnimations', {
  value: () => [],
  configurable: true,
})

const ONE = '/api/v1/clubs/10/performances/101'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = {
  id: 'm9',
  clubId: '10',
  club: {
    id: '10',
    name: 'Crane Band',
    clubType: 'BAND',
    status: 'ACTIVE',
    profileImageUrl: null,
    themeColor: null,
  },
  role: 'CLUB_ADMIN',
  status: 'ACTIVE',
  invitationExpiresAt: null,
  requestedAt: null,
}
const performance = (over: Record<string, unknown> = {}) => ({
  id: '101',
  clubId: '10',
  title: '가을 정기공연',
  performDate: '2026-11-15',
  location: '합주실 A',
  preset: 'TEAM_FIRST',
  status: 'DRAFT',
  createdByUserId: '1',
  version: '8',
  createdAt: '2026-10-02T18:00:00+09:00',
  updatedAt: '2026-10-08T21:10:00+09:00',
  ...over,
})
const detail = (over: Record<string, unknown> = {}) =>
  json({ performance: performance(over), policy: {} })

function open(get: Route, extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [membership] }),
    [`GET ${ONE}`]: get,
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/10/performances/101/edit') }
}

const titleInput = () => screen.getByPlaceholderText(T.titlePlaceholder)
const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } })
const saveButton = () => screen.getByRole('button', { name: T.save })
const patched = (fetchMock: ReturnType<typeof stubApi>) =>
  JSON.parse(
    String(
      callsTo(fetchMock, ONE).find(([, i]) => i?.method === 'PATCH')![1]!.body,
    ),
  ) as Record<string, unknown>

describe('PERF-006 PerformanceEdit', () => {
  it('loads the current values and sends the loaded version on save', async () => {
    const { fetchMock, router } = open(() => detail(), {
      [`PATCH ${ONE}`]: () =>
        json({ ...performance({ version: '9' }), warnings: [] }),
    })
    await findScreen('PERF-006')
    await waitFor(() =>
      expect((titleInput() as HTMLInputElement).value).toBe('가을 정기공연'),
    )
    expect((screen.getByLabelText(T.labelDate) as HTMLInputElement).value).toBe(
      '2026-11-15',
    )
    type(titleInput(), '겨울 공연')
    fireEvent.click(saveButton())

    await screen.findByText(COPY.saved)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10/performances/101'),
    )
    expect(patched(fetchMock)).toEqual({
      version: '8',
      title: '겨울 공연',
      performDate: '2026-11-15',
      location: '합주실 A',
    })
  })

  it('treats a null date as undecided and keeps the date input off', async () => {
    open(() => detail({ performDate: null }))
    await findScreen('PERF-006')
    await waitFor(() =>
      expect(
        (screen.getByLabelText(T.dateUndecided) as HTMLInputElement).checked,
      ).toBe(true),
    )
    expect(
      (screen.getByLabelText(T.labelDate) as HTMLInputElement).disabled,
    ).toBe(true)
  })

  it('reloads the latest values after a VERSION_CONFLICT', async () => {
    let latest = performance()
    const { router } = open(() => json({ performance: latest, policy: {} }), {
      [`PATCH ${ONE}`]: () => {
        latest = performance({ title: '다른 임원이 고친 이름', version: '9' })
        return apiError('VERSION_CONFLICT', 409)
      },
    })
    await findScreen('PERF-006')
    await waitFor(() =>
      expect((titleInput() as HTMLInputElement).value).toBe('가을 정기공연'),
    )
    type(titleInput(), '내가 고친 이름')
    fireEvent.click(saveButton())

    fireEvent.click(await screen.findByRole('button', { name: COPY.confirm }))
    await waitFor(() =>
      expect((titleInput() as HTMLInputElement).value).toBe(
        '다른 임원이 고친 이름',
      ),
    )
    expect(router.state.location.pathname).toBe(
      '/clubs/10/performances/101/edit',
    )
  })

  it('stays on the screen and shows the F-06 banner when the response warns', async () => {
    const { router } = open(() => detail(), {
      [`PATCH ${ONE}`]: () =>
        json({
          ...performance({ version: '9' }),
          warnings: [
            {
              type: 'SEASON_ENDS_AFTER_PERFORM_DATE',
              message: '합주 시즌이 공연일 이후까지예요.',
            },
          ],
        }),
    })
    await findScreen('PERF-006')
    await waitFor(() =>
      expect((titleInput() as HTMLInputElement).value).toBe('가을 정기공연'),
    )
    type(titleInput(), '겨울')
    fireEvent.click(saveButton())
    await screen.findByText('합주 시즌이 공연일 이후까지예요.')
    expect(router.state.location.pathname).toBe(
      '/clubs/10/performances/101/edit',
    )
  })

  it('asks for a reason before saving a LOCKED performance', async () => {
    const { fetchMock } = open(() => detail({ status: 'LOCKED' }), {
      [`PATCH ${ONE}`]: () =>
        json({ ...performance({ status: 'LOCKED' }), warnings: [] }),
    })
    await findScreen('PERF-006')
    await waitFor(() =>
      expect((titleInput() as HTMLInputElement).value).toBe('가을 정기공연'),
    )
    type(titleInput(), '겨울')
    fireEvent.click(saveButton())
    const reason = await screen.findByRole('textbox', {
      name: T.lockedReasonTitle,
    })
    expect(
      callsTo(fetchMock, ONE).filter(([, i]) => i?.method === 'PATCH'),
    ).toHaveLength(0)
    type(reason, '운영상 변경')
    const buttons = screen.getAllByRole('button', { name: T.save })
    fireEvent.click(buttons[buttons.length - 1]!)
    await waitFor(() => expect(patched(fetchMock).reason).toBe('운영상 변경'))
  })

  it('disables saving once the performance is finished', async () => {
    open(() => detail({ status: 'FINISHED' }))
    await screen.findByText(T.notEditable)
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('shows a retry when the load fails', async () => {
    let fail = true
    const { fetchMock } = open(() =>
      fail ? apiError('UNKNOWN', 500) : detail(),
    )
    await screen.findByRole('button', { name: COPY.retry })
    fail = false
    fireEvent.click(screen.getByRole('button', { name: COPY.retry }))
    await waitFor(() =>
      expect((titleInput() as HTMLInputElement).value).toBe('가을 정기공연'),
    )
    expect(callsTo(fetchMock, ONE).length).toBeGreaterThanOrEqual(2)
  })

  it('shows the global not-found view on 404', async () => {
    open(() => apiError('NOT_FOUND', 404))
    await screen.findByText(COPY.notFoundTitle)
  })
})
