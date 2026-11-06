import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { API_PATHS } from '../../shared/api/assumptions'
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
import { reorder } from './PartSettings'
import { SETTINGS_COPY as T } from './settingsCopy'

setupDom()

const PARTS = '/api/v1/clubs/10/parts'
const user = {
  id: '1',
  name: '송예림',
  handle: 'yerim',
  profileImageUrl: null,
  onboardingRequired: false,
  isSuperAdmin: false,
}
const membership = {
  id: '21',
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
const part = (id: string, name: string, order: number, isActive = true) => ({
  id,
  name,
  displayOrder: order,
  isActive,
  memberCount: Number(id),
})
const LIST = [
  part('1', '보컬', 1),
  part('2', '기타', 2),
  part('3', '베이스', 3),
  part('4', '드럼', 4, false),
]

function openScreen(
  extra: Record<string, Route> = {},
  items: unknown[] = LIST,
) {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  const fetchMock = stubApi({
    [`GET ${API_PATHS.me}`]: () => json(user),
    [`GET ${API_PATHS.memberships}`]: () => json({ items: [membership] }),
    [`GET ${PARTS}`]: () => json({ items }),
    ...extra,
  })
  return { fetchMock, router: renderApp('/clubs/10/parts') }
}

const body = (call: [string, RequestInit?]) => JSON.parse(String(call[1]?.body))
const writes = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))
const clickIn = (part: string, label: string) =>
  fireEvent.click(
    within(screen.getByRole('article', { name: part })).getByRole('button', {
      name: label,
    }),
  )
const names = () =>
  Array.from(
    document.querySelectorAll('[data-screen-id="CLUB-107"] article'),
  ).map((a) => a.getAttribute('aria-label'))

describe('reorder', () => {
  it('moves a part and hands out strictly increasing orders, even for equal ones', () => {
    const parts = [part('1', 'a', 0), part('2', 'b', 0), part('3', 'c', 5)]
    expect(reorder(parts, 0, 2).map((p) => [p.id, p.displayOrder])).toEqual([
      ['2', 0],
      ['3', 1],
      ['1', 5],
    ])
  })
})

describe('CLUB-107 PartSettings', () => {
  it('lists active parts with member counts and folds the inactive ones', async () => {
    openScreen()
    await findScreen('CLUB-107')
    await screen.findByText('보컬')
    expect(screen.getByText(T.members(2))).toBeTruthy()
    const folded = document.querySelector('details') as HTMLDetailsElement
    expect(folded.open).toBe(false)
    expect(within(folded).getByText('드럼')).toBeTruthy()
    expect(
      within(folded).getByRole('button', { name: T.reactivate }),
    ).toBeTruthy()
  })

  it('shows the empty state when nothing is in use', async () => {
    openScreen({}, [])
    await screen.findByText(T.partsEmpty)
    expect(screen.getByRole('button', { name: T.addPart })).toBeTruthy()
  })

  it('adds a part after the last order and shows it', async () => {
    const { fetchMock } = openScreen({
      [`POST ${PARTS}`]: () =>
        json({ id: '9', name: '신디', displayOrder: 5, isActive: true }, 201),
    })
    await screen.findByText('보컬')
    click(T.addPart)
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: ' 신디 ' },
    })
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)

    await screen.findByText('신디')
    expect(body(writes(fetchMock, 'POST')[0]!)).toEqual({
      name: '신디',
      displayOrder: 5,
    })
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows a duplicate name as helper text, without a global toast', async () => {
    openScreen({ [`POST ${PARTS}`]: () => apiError('DUPLICATE', 409) })
    await screen.findByText('보컬')
    click(T.addPart)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '기타' } })
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)

    await screen.findByText(`* ${T.partNameTaken}`)
    expect(screen.getByRole('textbox')).toBeTruthy() // the input stays for another try
  })

  it('refuses an empty name without calling the server', async () => {
    const { fetchMock } = openScreen()
    await screen.findByText('보컬')
    click(T.addPart)
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)

    await screen.findByText(`* ${T.partNameInvalid}`)
    expect(writes(fetchMock, 'POST')).toHaveLength(0)
  })

  it('renames a part', async () => {
    const { fetchMock } = openScreen({
      [`PATCH ${PARTS}/1`]: () =>
        json({ id: '1', name: '리드 보컬', displayOrder: 1, isActive: true }),
    })
    await screen.findByText('보컬')
    clickIn('보컬', T.rename)
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '리드 보컬' },
    })
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)

    await screen.findByText('리드 보컬')
    expect(body(writes(fetchMock, 'PATCH')[0]!)).toEqual({ name: '리드 보컬' })
    // The list-only member count survives the PATCH response, which has none.
    expect(screen.getByText(T.members(1))).toBeTruthy()
  })

  it('deactivates only after the confirm modal', async () => {
    const { fetchMock } = openScreen({
      [`PATCH ${PARTS}/2`]: () =>
        json({ id: '2', name: '기타', displayOrder: 2, isActive: false }),
    })
    await screen.findByText('기타')

    clickIn('기타', T.deactivate)
    await screen.findByText(T.deactivateTitle('기타'))
    fireEvent.click(screen.getByRole('button', { name: T.cancel }))
    await waitFor(() =>
      expect(screen.queryByText(T.deactivateTitle('기타'))).toBeNull(),
    )
    expect(writes(fetchMock, 'PATCH')).toHaveLength(0)

    clickIn('기타', T.deactivate)
    await screen.findByText(T.deactivateTitle('기타'))
    fireEvent.click(
      screen.getAllByRole('button', { name: T.deactivate }).at(-1)!,
    )
    await screen.findByText(T.partsInactive(2))
    expect(body(writes(fetchMock, 'PATCH')[0]!)).toEqual({ isActive: false })
  })

  it('reactivates an inactive part at once', async () => {
    const { fetchMock } = openScreen({
      [`PATCH ${PARTS}/4`]: () =>
        json({ id: '4', name: '드럼', displayOrder: 4, isActive: true }),
    })
    await screen.findByText(T.partsInactive(1))
    clickIn('드럼', T.reactivate)

    await waitFor(() =>
      expect(screen.queryByText(T.partsInactive(1))).toBeNull(),
    )
    expect(body(writes(fetchMock, 'PATCH')[0]!)).toEqual({ isActive: true })
    expect(names()).toContain('드럼')
  })

  it('saves a move as one PATCH per changed part', async () => {
    const patch =
      (id: string, order: number): Route =>
      () =>
        json({ id, name: 'x', displayOrder: order, isActive: true })
    const { fetchMock } = openScreen({
      [`PATCH ${PARTS}/1`]: patch('1', 2),
      [`PATCH ${PARTS}/2`]: patch('2', 1),
    })
    await screen.findByText('보컬')
    clickIn('보컬', T.moveDown)

    await waitFor(() => expect(writes(fetchMock, 'PATCH')).toHaveLength(2))
    expect(
      writes(fetchMock, 'PATCH')
        .map((c) => [c[0], body(c)])
        .sort(),
    ).toEqual([
      [PARTS + '/1', { displayOrder: 2 }],
      [PARTS + '/2', { displayOrder: 1 }],
    ])
    expect(names().slice(0, 3)).toEqual(['기타', '보컬', '베이스'])
  })

  it('moves a part by dragging its handle onto another row', async () => {
    const { fetchMock } = openScreen({
      [`PATCH ${PARTS}/1`]: () => json({ id: '1' }),
      [`PATCH ${PARTS}/2`]: () => json({ id: '2' }),
      [`PATCH ${PARTS}/3`]: () => json({ id: '3' }),
    })
    await screen.findByText('보컬')
    fireEvent.dragStart(screen.getByLabelText(T.dragHandle('베이스')))
    fireEvent.drop(
      screen.getByLabelText(T.dragHandle('보컬')).closest('article')!,
    )

    await waitFor(() => expect(writes(fetchMock, 'PATCH')).toHaveLength(3))
    expect(names().slice(0, 3)).toEqual(['베이스', '보컬', '기타'])
  })

  it('reloads the list when saving the order fails midway', async () => {
    const { fetchMock } = openScreen({
      [`PATCH ${PARTS}/1`]: () => json({ id: '1' }),
      [`PATCH ${PARTS}/2`]: () => apiError('UNKNOWN', 500),
    })
    await screen.findByText('보컬')
    clickIn('보컬', T.moveDown)

    await waitFor(() =>
      expect(
        callsTo(fetchMock, PARTS).filter(
          ([, i]) => !i?.method || i.method === 'GET',
        ),
      ).toHaveLength(2),
    )
    // Back to what the server says.
    await waitFor(() =>
      expect(names().slice(0, 3)).toEqual(['보컬', '기타', '베이스']),
    )
  })

  it('offers a retry when loading fails', async () => {
    let failing = true
    openScreen({
      [`GET ${PARTS}`]: () =>
        failing ? apiError('UNKNOWN', 500) : json({ items: LIST }),
    })
    await screen.findByRole('button', { name: T.retry })
    failing = false
    click(T.retry)
    await screen.findByText('보컬')
  })
})
