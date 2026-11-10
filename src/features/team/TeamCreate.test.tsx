import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  apiError,
  callsTo,
  findScreen,
  json,
  setupDom,
} from '../../test/harness'
import { memberPage, memberRow, PERF } from '../performance/viewTestKit'
import { TEAM_COPY as T } from './teamCopy'
import {
  body,
  click,
  created,
  reasoned,
  clickLast,
  mutation,
  open,
  stubAnimations,
  teamDetail,
  TEAMS,
  withTeamPolicy,
} from './teamTestKit'

setupDom()
beforeEach(stubAnimations)

const URL = '/clubs/10/performances/31/teams/new'
const openCreate = (extra: Parameters<typeof open>[2] = {}) =>
  open(URL, 'CLUB_ADMIN', {
    [`GET ${TEAMS}/default-name`]: () => json({ name: '2팀' }),
    [`GET ${PERF}/members`]: () =>
      memberPage(
        [memberRow('1', '22', '김도윤'), memberRow('2', '23', '이서연')],
        { APPROVED: 2 },
      ),
    ...extra,
  })
const nameInput = () => screen.findByRole('textbox', { name: T.nameLabel })
const pick = async (...names: string[]) => {
  fireEvent.click(await screen.findByText(`+ ${T.addMember}`))
  for (const n of names)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: new RegExp(n) }),
    )
  await clickLast(T.pickerAdd)
}

describe('TEAM-003', () => {
  it('fills the smallest free name and creates the team with members and a leader', async () => {
    const { fetchMock, router } = openCreate({
      [`POST ${TEAMS}`]: () => mutation('1', { status: 'APPROVED' }, [], 201),
      [`GET ${TEAMS}/201`]: () => teamDetail(),
    })
    await findScreen('TEAM-003')
    expect(((await nameInput()) as HTMLInputElement).value).toBe('2팀')

    await pick('김도윤', '이서연')
    // Two members are listed with a part each; the second is the leader.
    fireEvent.change(await screen.findByLabelText(T.pickerPart('이서연')), {
      target: { value: '' },
    })
    fireEvent.click(await screen.findByRole('radio', { name: '이서연' }))
    fireEvent.change(await nameInput(), { target: { value: ' Crane ' } })
    await click(T.create)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/clubs/10/performances/31/teams/201',
      ),
    )
    expect(body(fetchMock, TEAMS)).toEqual({
      name: 'Crane',
      members: [
        { membershipId: '22', partId: '4' },
        { membershipId: '23', partId: null },
      ],
      leaderMembershipId: '23',
    })
    await screen.findByText(T.created)
  })

  it('opens the team of a creation answered as `team`', async () => {
    const { router } = openCreate({
      [`POST ${TEAMS}`]: () => created({ status: 'APPROVED' }),
      [`GET ${TEAMS}/201`]: () => teamDetail(),
    })
    await nameInput()
    await click(T.create)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/clubs/10/performances/31/teams/201',
      ),
    )
  })

  it('creates without members and without a leader', async () => {
    const { fetchMock } = openCreate({
      [`POST ${TEAMS}`]: () => mutation('1', { status: 'APPROVED' }, [], 201),
      [`GET ${TEAMS}/201`]: () => teamDetail(),
    })
    await nameInput()
    await click(T.create)
    await screen.findByText(T.created)
    expect(body(fetchMock, TEAMS)).toEqual({ name: '2팀', members: [] })
  })

  it('drops the leader choice together with a removed member', async () => {
    const { fetchMock } = openCreate({
      [`POST ${TEAMS}`]: () => mutation('1', { status: 'APPROVED' }, [], 201),
      [`GET ${TEAMS}/201`]: () => teamDetail(),
    })
    await nameInput()
    await pick('김도윤')
    fireEvent.click(await screen.findByRole('radio', { name: '김도윤' }))
    const row = screen
      .getByRole('radio', { name: '김도윤' })
      .closest('.team-pick')
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: T.removeMember }),
    )
    await click(T.create)
    await screen.findByText(T.created)
    expect(body(fetchMock, TEAMS)).toEqual({ name: '2팀', members: [] })
  })

  it('disables 만들기 while the name is blank', async () => {
    const { fetchMock } = openCreate()
    fireEvent.change(await nameInput(), { target: { value: '   ' } })
    const create = screen.getByRole('button', { name: T.create })
    await waitFor(() =>
      expect((create as HTMLButtonElement).disabled).toBe(true),
    )
    expect(
      callsTo(fetchMock, TEAMS).filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0)
  })

  it('shows the server duplicate reason under the input and stays on the form', async () => {
    openCreate({
      [`POST ${TEAMS}`]: () =>
        reasoned('DUPLICATE', 409, 'DUPLICATE_TEAM_NAME'),
    })
    await nameInput()
    await click(T.create)
    await screen.findByText(`* ${T.nameTaken}`)
    expect(screen.getByRole('button', { name: T.create })).toBeTruthy()
  })

  it('shows a reasonless duplicate under the input too', async () => {
    openCreate({ [`POST ${TEAMS}`]: () => apiError('DUPLICATE', 409) })
    await nameInput()
    await click(T.create)
    await screen.findByText(`* ${T.nameTaken}`)
    expect(screen.getByRole('button', { name: T.create })).toBeTruthy()
  })

  it('shows NAME_REQUIRED next to the input', async () => {
    openCreate({
      [`POST ${TEAMS}`]: () =>
        reasoned('VALIDATION_ERROR', 400, 'NAME_REQUIRED'),
    })
    await nameInput()
    await click(T.create)
    await screen.findByText(`* ${T.nameRequired}`)
  })

  it('shows a server name error next to the input', async () => {
    openCreate({
      [`POST ${TEAMS}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'x',
              details: [{ field: 'name', reason: 'REQUIRED' }],
            },
          }),
          { status: 400 },
        ),
    })
    await nameInput()
    await click(T.create)
    await screen.findByText(`* ${T.nameRequired}`)
  })

  it('is not available on a LOCKED performance', async () => {
    openCreate({
      [`GET ${PERF}`]: () => withTeamPolicy('CLOSED', { status: 'LOCKED' }),
    })
    await screen.findByText(T.cannotCreate)
  })
})
