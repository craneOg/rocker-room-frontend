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
import { membership } from '../performance/viewTestKit'
import { MY_COPY as T } from './copy'

setupDom()
Object.defineProperty(Element.prototype, 'getAnimations', {
  value: () => [],
  configurable: true,
})

const ME = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  profileImagePublic: true,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const MEMBER = '/api/v1/clubs/10/memberships/m9'
const PARTS = '/api/v1/clubs/10/parts'
const part = (id: string, name: string, isActive = true) => ({
  id,
  name,
  displayOrder: Number(id),
  isActive,
  memberCount: 1,
})
const detail = (over = {}) => ({
  id: 'm9',
  displayName: '예림',
  userName: '송예림',
  memberType: 'REGULAR',
  role: 'MEMBER',
  profileImageUrl: null,
  parts: [{ id: '1', name: '보컬', displayOrder: 1, isActive: true }],
  performances: [],
  ...over,
})

function open(member = detail(), extra: Record<string, Route> = {}) {
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(ME),
    [`GET ${API_PATHS.memberships}`]: () =>
      json({ items: [membership('MEMBER')] }),
    [`GET ${MEMBER}`]: () => json(member),
    [`GET ${PARTS}`]: () =>
      json({
        items: [part('1', '보컬'), part('2', '기타'), part('3', '건반', false)],
      }),
    [`PATCH ${MEMBER}`]: () => json({}),
    [`PUT ${MEMBER}/parts`]: () => json({}),
    ...extra,
  })
  renderApp('/me/membership')
  return fetchMock
}

const chip = (name: string | RegExp) =>
  screen.getByRole('button', { name }) as HTMLButtonElement
const nameInput = () => screen.getByLabelText(T.displayNameLabel)
const saveButton = () => screen.getByRole('button', { name: T.save })
const bodyOf = (
  fetchMock: ReturnType<typeof stubApi>,
  method: string,
  path: string,
) =>
  JSON.parse(
    String(
      callsTo(fetchMock, path).find(([, i]) => i?.method === method)![1]!.body,
    ),
  ) as Record<string, unknown>

describe('MY-003 MyMembership', () => {
  it('shows the saved name and parts, with save off until something changes', async () => {
    open()
    await findScreen('MY-003')
    await waitFor(() =>
      expect((nameInput() as HTMLInputElement).value).toBe('예림'),
    )
    expect(chip('보컬').getAttribute('aria-pressed')).toBe('true')
    expect(chip('기타').getAttribute('aria-pressed')).toBe('false')
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('saves the display name and the parts with one 저장', async () => {
    const fetchMock = open()
    await findScreen('MY-003')
    await waitFor(() => expect(nameInput()).toBeTruthy())
    fireEvent.change(nameInput(), { target: { value: ' 새 이름 ' } })
    fireEvent.click(chip('기타'))
    fireEvent.click(chip('보컬'))
    fireEvent.click(saveButton())
    await screen.findByText(COPY.saved)
    expect(bodyOf(fetchMock, 'PATCH', MEMBER)).toEqual({
      displayName: '새 이름',
    })
    expect(bodyOf(fetchMock, 'PUT', `${MEMBER}/parts`)).toEqual({
      partIds: ['2'],
    })
  })

  it('sends null when the name is cleared, and does not touch the parts', async () => {
    const fetchMock = open()
    await findScreen('MY-003')
    await waitFor(() => expect(nameInput()).toBeTruthy())
    fireEvent.change(nameInput(), { target: { value: '' } })
    fireEvent.click(saveButton())
    await screen.findByText(COPY.saved)
    expect(bodyOf(fetchMock, 'PATCH', MEMBER)).toEqual({ displayName: null })
    expect(
      callsTo(fetchMock, `${MEMBER}/parts`).filter(
        ([, i]) => i?.method === 'PUT',
      ),
    ).toHaveLength(0)
  })

  it('lets a held deactivated part be taken off but never added', async () => {
    const fetchMock = open(
      detail({
        parts: [
          { id: '1', name: '보컬', displayOrder: 1, isActive: true },
          { id: '3', name: '건반', displayOrder: 3, isActive: false },
        ],
      }),
    )
    await findScreen('MY-003')
    await waitFor(() => expect(nameInput()).toBeTruthy())
    expect(chip(T.partInactive('건반')).getAttribute('aria-pressed')).toBe(
      'true',
    )
    fireEvent.click(chip(T.partInactive('건반')))
    // Off now, and a deactivated part that is not held cannot come back.
    expect(chip(T.partInactive('건반')).disabled).toBe(true)
    fireEvent.click(saveButton())
    await screen.findByText(COPY.saved)
    expect(bodyOf(fetchMock, 'PUT', `${MEMBER}/parts`)).toEqual({
      partIds: ['1'],
    })
  })
})
