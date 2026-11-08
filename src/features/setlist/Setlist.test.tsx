import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  callsTo,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import {
  body,
  detail,
  mine,
  open as openKit,
  PERF,
} from '../performance/viewTestKit'
import { SETLIST_COPY as T } from './setlistCopy'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const SETLIST = `${PERF}/setlist`
const ORDER = `${PERF}/setlist/order`
const PATH = '/clubs/10/performances/31/setlist'

const song = (id: string, order: number | null, extra = {}) => ({
  id,
  performanceId: '31',
  title: `곡${id}`,
  artist: '아티스트',
  status: 'CONFIRMED',
  assignedTeamId: '201',
  assignedTeamName: 'Crane Team',
  setlistOrder: order,
  version: `v${id}`,
  ...extra,
})
const who = (id: string, name: string) => ({
  performanceMemberId: id,
  partId: '4',
  displayName: name,
})
const entry = (s: ReturnType<typeof song>, sessions: unknown[] = []) => ({
  song: s,
  sessions,
})

// 곡1 -> 곡2 share two players; 곡3 is selected but has no place yet.
const ITEMS = [
  entry(song('1', 1), [who('pm1', '명혜성'), who('pm2', '김현주')]),
  entry(song('2', 2), [who('pm1', '명혜성'), who('pm2', '김현주')]),
  entry(song('3', null), [who('pm3', '정규채')]),
]
const list = (items = ITEMS, version = '8') =>
  json({ items, performanceVersion: version })

const open = (
  role: 'CLUB_ADMIN' | 'MEMBER',
  extra: Record<string, Route> = {},
  p = {},
) =>
  openKit(PATH, role, {
    [`GET ${SETLIST}`]: () => list(),
    [`GET ${PERF}`]: () => json(detail(p)),
    ...extra,
  })

const click = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole('button', { name }))
const dialogButton = (name: string) =>
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) as HTMLElement)
const rowsText = () =>
  screen.getAllByRole('listitem').map((li) => li.textContent ?? '')

describe('SET-001 as a member', () => {
  it('shows the order, the counts, the repeat-performer notes and my own songs', async () => {
    open('MEMBER', {
      [`GET ${PERF}/members/me`]: () => json(mine({ id: 'pm1' })),
    })
    await findScreen('SET-001')
    await screen.findByText('곡1 – 아티스트')
    expect(screen.getByText(T.summary(3, 2))).toBeTruthy()
    // Both shared players are named (L-10), only once, between the two rows.
    expect(screen.getAllByText(T.streak(['명혜성', '김현주']))).toHaveLength(1)
    await waitFor(() => expect(screen.getAllByText(T.mine)).toHaveLength(2))
    // A member sees neither the unplaced songs nor any editing control.
    expect(screen.queryByText(new RegExp(T.unplacedTitle))).toBeNull()
    expect(screen.queryByText('곡3 – 아티스트')).toBeNull()
    expect(screen.queryByRole('button', { name: T.edit })).toBeNull()
    expect(screen.queryByText(T.toLock)).toBeNull()
  })

  it('shows the players of each song only after the toggle', async () => {
    open('MEMBER')
    await screen.findByText('곡1 – 아티스트')
    expect(screen.queryByText(/드럼 명혜성/)).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: T.showPlayers }))
    expect(await screen.findAllByText('드럼 명혜성, 드럼 김현주')).toHaveLength(
      2,
    )
  })

  it('marks a confirmed performance', async () => {
    open('MEMBER', {}, { status: 'LOCKED' })
    await screen.findByText(T.confirmedBadge)
  })

  it('shows the empty state', async () => {
    open('MEMBER', { [`GET ${SETLIST}`]: () => list([]) })
    await screen.findByText(T.empty)
  })

  it('offers a retry when the list cannot be read', async () => {
    open('MEMBER', {
      [`GET ${SETLIST}`]: () => new Response('{}', { status: 500 }),
    })
    await screen.findByRole('button', { name: COPY.retry })
  })
})

describe('SET-001 as an officer', () => {
  it('lists the songs without a place with how many must be placed, and links to the confirmation', async () => {
    open('CLUB_ADMIN')
    await screen.findByText(`${T.unplacedTitle} · ${T.unplacedNeeded(1)}`)
    expect(
      screen.getByRole('link', { name: T.toLock }).getAttribute('href'),
    ).toBe('/clubs/10/performances/31/status')
  })

  it('saves the whole order in one request with the performance version', async () => {
    const { fetchMock } = open('CLUB_ADMIN', {
      [`PUT ${ORDER}`]: () => json({ performanceVersion: '9', items: [] }),
    })
    await click(T.edit)
    await click('위로 곡2')
    expect(rowsText()[0]).toContain('곡2')
    await click(T.save)

    await screen.findByText(T.saved)
    expect(body(fetchMock, ORDER)).toEqual({
      version: '8',
      items: [
        { songId: '2', order: 1, version: 'v2' },
        { songId: '1', order: 2, version: 'v1' },
        { songId: '3', order: null, version: 'v3' },
      ],
    })
    // The bar closes after the save.
    await waitFor(() => expect(screen.queryByText(T.cancel)).toBeNull())
  })

  it('puts an unplaced song at the end and takes one out, renumbering at once', async () => {
    const { fetchMock } = open('CLUB_ADMIN', {
      [`PUT ${ORDER}`]: () => json({ performanceVersion: '9', items: [] }),
    })
    await click(T.addToSetlist + ' 곡3')
    expect(screen.getByText(T.summary(3, 3))).toBeTruthy()
    await click(T.remove + ' 곡1')
    expect(screen.getByText(T.summary(3, 2))).toBeTruthy()
    await click(T.save)

    await screen.findByText(T.saved)
    expect(body(fetchMock, ORDER)).toEqual({
      version: '8',
      items: [
        { songId: '2', order: 1, version: 'v2' },
        { songId: '3', order: 2, version: 'v3' },
        { songId: '1', order: null, version: 'v1' },
      ],
    })
  })

  it('keeps 저장 disabled until the order changes and cancel throws the edit away', async () => {
    const { fetchMock } = open('CLUB_ADMIN')
    await click(T.edit)
    expect(
      (screen.getByRole('button', { name: T.save }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    await click('아래로 곡1')
    expect(
      (screen.getByRole('button', { name: T.save }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    await click(T.cancel)
    // Cancel needs no confirmation and nothing is sent.
    await waitFor(() => expect(screen.queryByText(T.cancel)).toBeNull())
    expect(screen.queryByText(T.leaveTitle)).toBeNull()
    expect(callsTo(fetchMock, ORDER)).toHaveLength(0)
    expect(rowsText()[0]).toContain('곡1')
  })

  it('cannot take a song out of a confirmed setlist and asks for a reason to save', async () => {
    const { fetchMock } = open(
      'CLUB_ADMIN',
      { [`PUT ${ORDER}`]: () => json({ performanceVersion: '9', items: [] }) },
      { status: 'LOCKED' },
    )
    await click(T.edit)
    expect(
      (
        screen.getByRole('button', {
          name: T.remove + ' 곡1',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    await click('위로 곡2')
    await click(T.save)
    const reason = await screen.findByRole('textbox', { name: T.reasonTitle })
    expect(callsTo(fetchMock, ORDER)).toHaveLength(0)
    fireEvent.change(reason, { target: { value: '운영상 변경' } })
    dialogButton(T.save)

    await screen.findByText(T.saved)
    expect(body(fetchMock, ORDER)).toMatchObject({
      version: '8',
      reason: '운영상 변경',
    })
  })

  it('has no edit control once the performance is over', async () => {
    open('CLUB_ADMIN', {}, { status: 'FINISHED' })
    await screen.findByText('곡1 – 아티스트')
    await waitFor(() => expect(screen.getByText(T.confirmedBadge)).toBeTruthy())
    expect(screen.queryByRole('button', { name: T.edit })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /세트리스트에 넣기/ }),
    ).toBeNull()
  })

  it('tells the officer when the confirmed songs changed meanwhile (4-2) and reloads the list', async () => {
    let reads = 0
    const { fetchMock } = open('CLUB_ADMIN', {
      [`GET ${SETLIST}`]: () => {
        reads += 1
        return list(
          reads > 1
            ? [entry(song('2', 1)), entry(song('1', 2)), entry(song('4', null))]
            : ITEMS,
        )
      },
      [`PUT ${ORDER}`]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'STATE_CONFLICT',
              message: 'conflict',
              details: [{ reason: 'SETLIST_CHANGED' }],
            },
          }),
          { status: 409 },
        ),
    })
    await click(T.edit)
    await click('위로 곡2')
    await click(T.save)

    await screen.findByText(T.changedTitle)
    expect(screen.getByText(T.changedDescription)).toBeTruthy()
    // The global state-conflict dialog stays out.
    expect(screen.queryByText(COPY.stateConflictTitle)).toBeNull()
    dialogButton(T.confirm)
    await waitFor(() =>
      expect(callsTo(fetchMock, SETLIST).length).toBeGreaterThan(1),
    )
    // Still editing, on the fresh list (곡2 first, 곡4 new) with a clean slate.
    await waitFor(() => expect(rowsText()[0]).toContain('곡2'))
    expect(screen.getByRole('button', { name: T.cancel })).toBeTruthy()
    expect(screen.getByText('곡4 – 아티스트')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: T.save }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('leaves a version conflict to the global dialog', async () => {
    open('CLUB_ADMIN', {
      [`PUT ${ORDER}`]: () =>
        new Response(
          JSON.stringify({
            error: { code: 'VERSION_CONFLICT', message: 'v', details: [] },
          }),
          { status: 409 },
        ),
    })
    await click(T.edit)
    await click('위로 곡2')
    await click(T.save)
    await screen.findByText(COPY.versionConflictTitle)
    expect(screen.queryByText(T.changedTitle)).toBeNull()
  })

  it('asks before leaving with an unsaved order (4-1): 계속 편집 stays, 나가기 leaves', async () => {
    const { router } = open('CLUB_ADMIN')
    await click(T.edit)
    await click('위로 곡2')

    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await screen.findByText(T.leaveTitle)
    dialogButton(T.keepEditing)
    await waitFor(() => expect(screen.queryByText(T.leaveTitle)).toBeNull())
    expect(router.state.location.pathname).toBe(PATH)

    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await screen.findByText(T.leaveTitle)
    dialogButton(T.leave)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10'),
    )
  })

  it('Esc on the leave dialog stays and keeps the edited order', async () => {
    const { router } = open('CLUB_ADMIN')
    await click(T.edit)
    await click('위로 곡2')
    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await screen.findByText(T.leaveTitle)
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    })
    await waitFor(() => expect(screen.queryByText(T.leaveTitle)).toBeNull())
    expect(router.state.location.pathname).toBe(PATH)
    expect(rowsText()[0]).toContain('곡2')
  })

  it('leaves without asking when nothing changed', async () => {
    const { router } = open('CLUB_ADMIN')
    await click(T.edit)
    await act(async () => {
      void router.navigate('/clubs/10')
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/clubs/10'),
    )
    expect(screen.queryByText(T.leaveTitle)).toBeNull()
  })
})
