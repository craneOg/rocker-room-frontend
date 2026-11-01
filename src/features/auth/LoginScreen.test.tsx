import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
import {
  apiError,
  findScreen,
  renderApp,
  setupDom,
  stubApi,
} from '../../test/harness'
import { startKakaoLogin } from './api'
import { AUTH_COPY as T } from './copy'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  startKakaoLogin: vi.fn(),
}))

setupDom()
beforeEach(() => {
  vi.mocked(startKakaoLogin).mockClear()
  stubApi({
    [`GET ${API_PATHS.me}`]: () => apiError('UNAUTHENTICATED', 401),
  })
})

describe('AUTH-001', () => {
  it('starts Kakao login from every start button, on / and /join/:code', async () => {
    for (const path of ['/', '/join/ABC123']) {
      renderApp(path)
      await findScreen('AUTH-001')
      const buttons = [
        ...screen.getAllByRole('button', { name: T.start }),
        screen.getByRole('button', { name: T.login }),
      ]
      expect(buttons).toHaveLength(3)
      buttons.forEach((b) => fireEvent.click(b))
      expect(startKakaoLogin).toHaveBeenCalledTimes(3)
      vi.mocked(startKakaoLogin).mockClear()
      document.body.innerHTML = ''
    }
  })

  it('renders the terms sentence as plain text and opens the recovery sheet', async () => {
    renderApp('/')
    await findScreen('AUTH-001')
    expect(screen.getByText(T.terms).closest('a')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: T.accountProblem }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText(T.recoveryTitle)).toBeTruthy()
    expect(within(sheet).getByText(T.recoveryContact)).toBeTruthy()
  })
})
