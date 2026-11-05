import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../shared/api/assumptions'
import { api } from '../shared/api/client'
import { COPY } from '../shared/ui/copy'
import { feedback } from '../shared/ui/feedbackBus'
import { apiError, findScreen, json, setupDom, stubApi } from '../test/harness'
import App from './App'

setupDom()

describe('App', () => {
  it('returns to the login screen when the session expires', async () => {
    const me = {
      id: '1',
      name: 'a',
      handle: 'abcde',
      profileImageUrl: null,
      onboardingRequired: false,
      isSuperAdmin: false,
    }
    let expired = false
    const authed = (data: unknown) => () =>
      expired ? apiError('UNAUTHENTICATED', 401) : json(data)
    stubApi({
      [`GET ${API_PATHS.me}`]: authed(me),
      [`GET ${API_PATHS.memberships}`]: authed({ items: [] }),
      [`POST ${API_PATHS.tokenRenewal}`]: () =>
        apiError('UNAUTHENTICATED', 401),
      'GET /api/v1/anything': () => apiError('UNAUTHENTICATED', 401),
    })
    history.pushState({}, '', '/start')
    render(<App />)
    await findScreen('AUTH-003')

    expired = true
    await act(() => api.get('/api/v1/anything').catch(() => {}))

    await findScreen('AUTH-001')
    expect(location.pathname).toBe('/')
    expect(screen.queryByText(COPY.attribution)).toBeTruthy()
  })

  it('shows a different toast while another one is still open', async () => {
    stubApi({ [`GET ${API_PATHS.me}`]: () => apiError('UNAUTHENTICATED', 401) })
    render(<App />)
    await findScreen('AUTH-001')
    act(() => {
      feedback.toast('first')
      feedback.toast('second')
    })
    expect(await screen.findByText('first')).toBeTruthy()
    expect(await screen.findByText('second')).toBeTruthy()
  })
})
