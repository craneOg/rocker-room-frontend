import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { findScreen, json, setupDom, type Route } from '../../test/harness'
import { SONG_COPY as T } from './songCopy'
import {
  body,
  callsTo,
  evaluation,
  openSong,
  participants,
  PERF,
  SONGS,
  songDetail,
  TEAMS,
} from './songTestKit'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const PATH = '/clubs/10/performances/31/songs/41/players'
const S = `${SONGS}/41`
const session = (pm: string, name: string, partId = '4') => ({
  performanceMemberId: pm,
  partId,
  displayName: name,
  isSupport: false,
  isGuest: false,
})
const saved = (
  song: Record<string, unknown> = {},
  rest: Record<string, unknown> = {},
) =>
  songDetail(
    { status: 'CONFIRMED', version: '8', ...song },
    {
      requirements: [{ partId: '4', requiredCount: 2 }],
      sessions: [session('31', '정규채')],
      ...rest,
    },
  )
const routes = (
  song: Record<string, unknown> = {},
  rest: Record<string, unknown> = {},
  extra: Record<string, Route> = {},
) => ({
  [`GET ${S}`]: () => saved(song, rest),
  [`GET ${S}/evaluations`]: () => evaluation(),
  [`GET ${PERF}/members`]: () => participants(),
  [`GET ${TEAMS}/7`]: () =>
    json({
      team: { id: '7', name: 'Crane Team' },
      members: [{ membershipId: '21', displayName: '정규채', isLeader: false }],
    }),
  [`PUT ${S}/sessions`]: () => json({ resource: { id: '41' }, warnings: [] }),
  ...extra,
})
const open = (r = routes(), o = {}, path = PATH) =>
  openSong(path, 'CLUB_ADMIN', { routes: r, ...o })

/** Picks `name` in the (only reachable) picker; `part` is set for an unfixed part. */
const pick = async (name: string, part?: string) => {
  const dialogs = await screen.findAllByRole('dialog')
  const dialog = dialogs[dialogs.length - 1] as HTMLElement
  if (part)
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: T.pickerPart }),
      {
        target: { value: part },
      },
    )
  const tab = within(dialog).queryByRole('tab', { name: T.pickerTabAll })
  if (tab) fireEvent.click(tab)
  fireEvent.click(
    await within(dialog).findByRole('button', {
      name: `${name} ${T.pickerAction}`,
    }),
  )
}
const saveButton = () => screen.getByRole('button', { name: T.save })

describe('SONG-004 staffing', () => {
  it('shows the slots of the required parts and the live shortage warning', async () => {
    open()
    await findScreen('SONG-004')
    await screen.findByText('정규채')
    expect(
      screen.getAllByRole('button', { name: T.fillSlot('드럼') }),
    ).toHaveLength(1)
    expect(screen.getByText(T.warnShortage('드럼', 1))).toBeTruthy()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('fills a slot, clears the warning and saves the whole player list', async () => {
    const { fetchMock } = open()
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    await pick('김도윤')
    await screen.findByText('김도윤')
    await waitFor(() =>
      expect(screen.queryByText(T.warnShortage('드럼', 1))).toBeNull(),
    )
    fireEvent.click(saveButton())
    await screen.findByText(T.playersSaved)
    expect(body(fetchMock, `${S}/sessions`)).toEqual({
      version: '8',
      items: [
        { performanceMemberId: '31', partId: '4' },
        { performanceMemberId: '32', partId: '4' },
      ],
    })
    // Back on the song detail.
    await findScreen('SONG-003')
  })

  it('adds a player outside the requirements with a chosen part and warns about excess', async () => {
    const { fetchMock } = open(
      routes({}, { requirements: [{ partId: '4', requiredCount: 1 }] }),
    )
    await screen.findByText('정규채')
    fireEvent.click(screen.getByRole('button', { name: T.addPlayer }))
    await pick('이서연', '5')
    await screen.findByText('보컬 · 이서연')
    fireEvent.click(saveButton())
    await screen.findByText(T.playersSaved)
    expect(body(fetchMock, `${S}/sessions`)).toMatchObject({
      items: [
        { performanceMemberId: '31', partId: '4' },
        { performanceMemberId: '33', partId: '5' },
      ],
    })
  })

  it('shows the song-count warning from three songs on only', async () => {
    open()
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    await pick('김도윤')
    // 김도윤 plays 3 songs already: this one makes 4.
    await screen.findByText(T.warnSongCount('김도윤', 4))
    // 정규채 plays 2 (this song included): no warning.
    expect(screen.queryByText(/정규채 님은/)).toBeNull()
  })

  it('marks players outside the team as 지원, and never without a team (UI-26)', async () => {
    open(routes({ assignedTeamId: '7', assignedTeamName: 'Crane Team' }))
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    await pick('김도윤')
    const row = (await screen.findByText('김도윤')).closest('li') as HTMLElement
    expect(within(row).getByText(T.supportBadge)).toBeTruthy()
    const own = screen.getByText('정규채').closest('li') as HTMLElement
    expect(within(own).queryByText(T.supportBadge)).toBeNull()
  })

  it('shows no 지원 badge on a song without a team', async () => {
    open()
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    await pick('김도윤')
    await screen.findByText('김도윤')
    expect(screen.queryByText(T.supportBadge)).toBeNull()
  })

  it('removes a player and keeps save off while nothing is left', async () => {
    open(routes({}, { requirements: [] }))
    await screen.findByText('드럼 · 정규채')
    fireEvent.click(
      screen.getByRole('button', { name: T.removePlayer('정규채') }),
    )
    await waitFor(() => expect(screen.queryByText('드럼 · 정규채')).toBeNull())
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('does not offer a person twice for the same part', async () => {
    open()
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    const dialogs = await screen.findAllByRole('dialog')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement
    const taken = await within(dialog).findByRole('button', {
      name: `정규채 ${T.pickerAction}`,
    })
    expect(taken.hasAttribute('disabled')).toBe(true)
  })

  it('asks for a reason in a locked performance', async () => {
    const { fetchMock } = open(routes(), { perf: { status: 'LOCKED' } })
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    await pick('김도윤')
    await screen.findByText('김도윤')
    fireEvent.click(saveButton())
    const reason = await screen.findByRole('textbox', {
      name: T.lockedSaveTitle,
    })
    expect(
      callsTo(fetchMock, `${S}/sessions`).filter(
        ([, i]) => i?.method === 'PUT',
      ),
    ).toHaveLength(0)
    fireEvent.change(reason, { target: { value: '대타 투입' } })
    fireEvent.click(
      await screen.findByRole('button', { name: T.save, hidden: false }),
    )
    await screen.findByText(T.playersSaved)
    expect(body(fetchMock, `${S}/sessions`)).toMatchObject({
      reason: '대타 투입',
    })
  })

  it('shows the warnings of the response as a banner', async () => {
    open(
      routes(
        {},
        {},
        {
          [`PUT ${S}/sessions`]: () =>
            json({
              resource: { id: '41' },
              warnings: [
                {
                  type: 'PART_SHORTAGE',
                  partId: '4',
                  partName: '드럼',
                  requiredCount: 2,
                  assignedCount: 1,
                },
                {
                  type: 'SONG_COUNT_EXCEEDED',
                  displayName: '김도윤',
                  songCount: 4,
                },
                {
                  type: 'SONG_COUNT_EXCEEDED',
                  displayName: '이서연',
                  songCount: 2,
                },
              ],
            }),
        },
      ),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    await pick('김도윤')
    await screen.findByText('김도윤')
    fireEvent.click(saveButton())
    await screen.findByText(T.playersSaved)
    await findScreen('SONG-003')
    await screen.findByText(T.warnShortage('드럼', 1))
    expect(screen.getByText(T.warnSongCount('김도윤', 4))).toBeTruthy()
    expect(screen.queryByText(T.warnSongCount('이서연', 2))).toBeNull()
  })

  it('shows the version conflict dialog from the server', async () => {
    open(
      routes(
        {},
        {},
        {
          [`PUT ${S}/sessions`]: () =>
            new Response(
              JSON.stringify({
                error: { code: 'VERSION_CONFLICT', message: 'x' },
              }),
              { status: 409 },
            ),
        },
      ),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: T.fillSlot('드럼') }),
    )
    await pick('김도윤')
    await screen.findByText('김도윤')
    fireEvent.click(saveButton())
    await screen.findByText('다른 사람이 먼저 수정했어요')
    expect(screen.queryByText(T.playersSaved)).toBeNull()
  })

  it('refuses a song that is not selected', async () => {
    open(routes({ status: 'PROPOSED' }))
    await screen.findByText(T.playersNotConfirmed)
  })
})

describe('SONG-004 team from players', () => {
  const makeTeam = () => screen.findByRole('button', { name: T.makeTeam })

  it('is hidden for a song that has a team and for an empty song', async () => {
    open(routes({ assignedTeamId: '7' }))
    await screen.findByText('정규채')
    expect(screen.queryByRole('button', { name: T.makeTeam })).toBeNull()
  })

  it('stays off until the players are saved', async () => {
    open(routes({}, { requirements: [] }))
    const button = await makeTeam()
    expect(button.hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: T.addPlayer }))
    await pick('김도윤', '4')
    await screen.findByText('드럼 · 김도윤')
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true))
  })

  it('creates the team with the suggested name and the chosen leader', async () => {
    const { fetchMock } = open(
      routes(
        {},
        { requirements: [] },
        {
          [`GET ${TEAMS}/default-name`]: () => json({ name: '3팀' }),
          [`POST ${TEAMS}`]: () => json({ team: { id: '70', name: '3팀' } }),
        },
      ),
    )
    fireEvent.click(await makeTeam())
    const name = (await screen.findByRole('textbox', {
      name: T.teamName,
    })) as HTMLInputElement
    await waitFor(() => expect(name.value).toBe('3팀'))
    expect(screen.getByText(T.teamHint)).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: '정규채' })).toBeTruthy(),
    )
    fireEvent.change(screen.getByRole('combobox', { name: T.teamLeader }), {
      target: { value: '21' },
    })
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: T.teamCreate }))
    await screen.findByText(T.teamCreated)
    expect(body(fetchMock, TEAMS)).toEqual({
      sourceSongId: '41',
      version: '8',
      name: '3팀',
      leaderMembershipId: '21',
    })
  })

  it('shows the rule copy when the leader is not a player', async () => {
    open(
      routes(
        {},
        { requirements: [] },
        {
          [`GET ${TEAMS}/default-name`]: () => json({ name: '1팀' }),
          [`POST ${TEAMS}`]: () =>
            new Response(
              JSON.stringify({
                error: {
                  code: 'RULE_VIOLATION',
                  message: 'x',
                  details: [{ reason: 'LEADER_NOT_TEAM_MEMBER' }],
                },
              }),
              { status: 422 },
            ),
        },
      ),
    )
    fireEvent.click(await makeTeam())
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: T.teamName }) as HTMLInputElement)
          .value,
      ).toBe('1팀'),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: T.teamCreate,
      }),
    )
    await screen.findByText('팀장은 이 곡의 연주자 중에서 골라 주세요')
  })
})

describe('SONG-004 audition applicant preset (F3 link)', () => {
  const link = (pm: string, part: string) =>
    `${PATH}?applicantPerformanceMemberId=${pm}&partId=${part}`

  it('starts with the applicant as a player of the part and saves them', async () => {
    const { fetchMock } = open(routes(), {}, link('33', '4'))
    const row = (await screen.findByText('이서연')).closest('li') as HTMLElement
    expect(row).toBeTruthy()
    // The slot is filled, so the shortage warning is gone, and save is on without any edit.
    await waitFor(() =>
      expect(screen.queryByText(T.warnShortage('드럼', 1))).toBeNull(),
    )
    expect(saveButton().hasAttribute('disabled')).toBe(false)
    fireEvent.click(saveButton())
    await screen.findByText(T.playersSaved)
    expect(body(fetchMock, `${S}/sessions`)).toMatchObject({
      items: [
        { performanceMemberId: '31', partId: '4' },
        { performanceMemberId: '33', partId: '4' },
      ],
    })
  })

  it('does not add somebody who already plays that part', async () => {
    open(routes(), {}, link('31', '4'))
    await screen.findByText('정규채')
    expect(screen.getAllByText('정규채')).toHaveLength(1)
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('ignores an unknown applicant and an inactive or unknown part', async () => {
    open(routes(), {}, link('999', '4'))
    await screen.findByText('정규채')
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('ignores an inactive part', async () => {
    open(routes(), {}, link('33', '9'))
    await screen.findByText('정규채')
    expect(screen.queryByText('이서연')).toBeNull()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('keeps later edits on top of the preset', async () => {
    const { fetchMock } = open(routes(), {}, link('33', '4'))
    await screen.findByText('이서연')
    fireEvent.click(
      screen.getByRole('button', { name: T.removePlayer('이서연') }),
    )
    await waitFor(() => expect(screen.queryByText('이서연')).toBeNull())
    expect(saveButton().hasAttribute('disabled')).toBe(false)
    fireEvent.click(saveButton())
    await screen.findByText(T.playersSaved)
    expect(body(fetchMock, `${S}/sessions`)).toMatchObject({
      items: [{ performanceMemberId: '31', partId: '4' }],
    })
  })
})
