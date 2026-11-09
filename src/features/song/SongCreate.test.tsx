import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import { findScreen, json, setupDom } from '../../test/harness'
import { SONG_COPY as T } from './songCopy'
import {
  body,
  callsTo,
  openSong,
  participants,
  PERF,
  SONGS,
  songPage,
  team,
  TEAMS,
} from './songTestKit'

setupDom()

beforeEach(() => {
  Element.prototype.getAnimations = () => []
})

const PATH = '/clubs/10/performances/31/songs/new'
const created = (warnings: unknown[] = []) =>
  json({ resource: { id: '90', status: 'PROPOSED', version: '1' }, warnings })
const routes = (extra = {}) => ({
  [`POST ${SONGS}`]: () => created(),
  [`GET ${SONGS}`]: () => songPage([]),
  [`GET ${TEAMS}`]: () =>
    json({
      items: [
        team('7', 'Crane Team'),
        team('8', 'Moon Team'),
        team('9', '거절 팀', 'REJECTED'),
      ],
    }),
  ...extra,
})
const submitName = (admin: boolean) => (admin ? T.submitAdmin : T.submitMember)
const type = async (label: string, value: string) =>
  fireEvent.change(await screen.findByRole('textbox', { name: label }), {
    target: { value },
  })
const submit = async (admin = false) => {
  const button = await screen.findByRole('button', { name: submitName(admin) })
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  fireEvent.click(button)
}

describe('SONG-002 as a member', () => {
  it('proposes a song and returns to the list with the toast', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', { routes: routes() })
    await findScreen('SONG-002')
    await type(T.fieldTitle, '  Creep ')
    await type(T.fieldArtist, 'Radiohead')
    await type(T.fieldLink, 'https://example.com/creep')
    await type(T.fieldMemo, '원곡 키로')
    expect(screen.getByText(T.proposeNotice)).toBeTruthy()
    await submit()

    await findScreen('SONG-001')
    await screen.findByText(T.proposed)
    expect(body(fetchMock, SONGS)).toEqual({
      title: 'Creep',
      artist: 'Radiohead',
      referenceUrl: 'https://example.com/creep',
      memo: '원곡 키로',
      candidateTeamId: null,
      status: 'PROPOSED',
    })
  })

  it('sends empty optional fields as null', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', { routes: routes() })
    await type(T.fieldTitle, 'Creep')
    await submit()
    await screen.findByText(T.proposed)
    expect(body(fetchMock, SONGS)).toMatchObject({
      artist: null,
      referenceUrl: null,
      memo: null,
    })
  })

  it('keeps the button off until there is a title', async () => {
    openSong(PATH, 'MEMBER', { routes: routes() })
    const button = await screen.findByRole('button', { name: T.submitMember })
    expect(button.hasAttribute('disabled')).toBe(true)
    await type(T.fieldTitle, '곡')
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    await type(T.fieldTitle, '   ')
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true))
    await screen.findByText(`* ${T.fieldTitleError}`)
  })

  it('accepts https links only', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', { routes: routes() })
    await type(T.fieldTitle, '곡')
    await type(T.fieldLink, 'http://example.com')
    await screen.findByText(`* ${T.linkError}`)
    expect(
      screen
        .getByRole('button', { name: T.submitMember })
        .hasAttribute('disabled'),
    ).toBe(true)
    await type(T.fieldLink, 'https://example.com')
    await waitFor(() =>
      expect(screen.queryByText(`* ${T.linkError}`)).toBeNull(),
    )
    expect(
      callsTo(fetchMock, SONGS).filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0)
  })

  it('shows the remaining proposals and blocks the form when they are used up (S-03)', async () => {
    openSong(PATH, 'MEMBER', { routes: routes() })
    await screen.findByText(T.remaining(2, 1, 3))
  })

  it('blocks the form at the limit', async () => {
    openSong(PATH, 'MEMBER', {
      routes: routes(),
      me: {
        progress: {
          candidateSongs: { used: 3, limit: 3 },
          unansweredPlayabilityCount: null,
          votes: null,
          availabilitySlotCount: null,
        },
      },
    })
    await screen.findByText(T.limitReached)
    expect(
      (await screen.findByRole('textbox', { name: T.fieldTitle })).hasAttribute(
        'disabled',
      ),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: T.submitMember })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('shows the server limit rule as a dialog', async () => {
    openSong(PATH, 'MEMBER', {
      routes: routes({
        [`POST ${SONGS}`]: () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'RULE_VIOLATION',
                message: 'x',
                details: [{ reason: 'LIMIT_EXCEEDED' }],
              },
            }),
            { status: 422 },
          ),
      }),
    })
    await type(T.fieldTitle, '곡')
    await submit()
    await screen.findByText(COPY.ruleViolationTitle)
    expect(screen.getByText('제안 가능한 곡 수를 모두 썼어요')).toBeTruthy()
  })

  it('shows a server validation error next to the field', async () => {
    openSong(PATH, 'MEMBER', {
      routes: routes({
        [`POST ${SONGS}`]: () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'x',
                details: [
                  { field: 'referenceUrl', message: '주소를 확인해 주세요' },
                ],
              },
            }),
            { status: 400 },
          ),
      }),
    })
    await type(T.fieldTitle, '곡')
    await submit()
    await screen.findByText('* 주소를 확인해 주세요')
  })

  it('drops the server error of a field once it is edited', async () => {
    openSong(PATH, 'MEMBER', {
      routes: routes({
        [`POST ${SONGS}`]: () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'x',
                details: [
                  { field: 'referenceUrl', message: '주소를 확인해 주세요' },
                ],
              },
            }),
            { status: 400 },
          ),
      }),
    })
    await type(T.fieldTitle, '곡')
    await submit()
    await screen.findByText('* 주소를 확인해 주세요')
    await type(T.fieldLink, 'https://example.com/fixed')
    await waitFor(() =>
      expect(screen.queryByText('* 주소를 확인해 주세요')).toBeNull(),
    )
  })

  it('shows the duplicate-song warning banner after saving (S-04)', async () => {
    const { router } = openSong(PATH, 'MEMBER', {
      routes: routes({
        [`POST ${SONGS}`]: () => created([{ type: 'DUPLICATE_SONG' }]),
      }),
    })
    await type(T.fieldTitle, 'Creep')
    await submit()
    await screen.findByText(T.duplicateWarning('Creep'))
    // The hand-over is read once: the history entry no longer carries it (reload / back).
    await waitFor(() => expect(router.state.location.state).toBeNull())
    expect(screen.getAllByText(T.duplicateWarning('Creep'))).toHaveLength(1)
  })

  it('shows another warning type with the shared sentence, not as a duplicate', async () => {
    openSong(PATH, 'MEMBER', {
      routes: routes({
        [`POST ${SONGS}`]: () =>
          created([
            { type: 'PART_NOT_REGISTERED', membershipId: '1', partId: '4' },
          ]),
      }),
    })
    await type(T.fieldTitle, 'Creep')
    await submit()
    await findScreen('SONG-001')
    await screen.findByText('등록하지 않은 파트로 지정돼요')
    await screen.findByText(T.proposed)
    expect(screen.queryByText(T.duplicateWarning('Creep'))).toBeNull()
  })

  it('is closed for a member when the candidate feature is disabled', async () => {
    openSong(PATH, 'MEMBER', {
      routes: routes(),
      policy: { candidateState: 'DISABLED' },
    })
    await screen.findByText(T.createClosed)
  })

  it('is closed for a non-participant, a closed feature and a late proposal', async () => {
    openSong(PATH, 'MEMBER', { routes: routes(), me: null })
    await screen.findByText(T.createClosed)
    expect(screen.queryByRole('textbox', { name: T.fieldTitle })).toBeNull()
  })

  it('is closed after the candidate deadline', async () => {
    openSong(PATH, 'MEMBER', {
      routes: routes(),
      policy: { candidateDeadline: '2020-01-01T00:00:00+09:00' },
    })
    await screen.findByText(T.createClosed)
  })

  it('is closed for a member when the performance is not active', async () => {
    openSong(PATH, 'MEMBER', { routes: routes(), perf: { status: 'LOCKED' } })
    await screen.findByText(T.createClosed)
  })
})

describe('SONG-002 scope team', () => {
  const mine = (...teams: [string, string][]) => ({
    myTeams: teams.map(([teamId, name]) => ({ teamId, name, isLeader: false })),
  })

  it('makes a member pick one of the own teams when the scope is per team', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      policy: { candidateScope: 'TEAM_MEMBERS' },
      me: mine(['7', 'Crane Team'], ['8', 'Moon Team']),
      routes: routes(),
    })
    const select = await screen.findByRole('combobox', { name: T.fieldScope })
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([T.scopePlaceholder, 'Crane Team', 'Moon Team'])
    await type(T.fieldTitle, '곡')
    expect(
      screen
        .getByRole('button', { name: T.submitMember })
        .hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.change(select, { target: { value: '8' } })
    await submit()
    await screen.findByText(T.proposed)
    expect(body(fetchMock, SONGS)).toMatchObject({ candidateTeamId: '8' })
  })

  it('picks the only team on its own', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      policy: { candidateScope: 'TEAM_MEMBERS' },
      me: mine(['7', 'Crane Team']),
      routes: routes(),
    })
    const select = (await screen.findByRole('combobox', {
      name: T.fieldScope,
    })) as HTMLSelectElement
    expect(select.value).toBe('7')
    await type(T.fieldTitle, '곡')
    await submit()
    await screen.findByText(T.proposed)
    expect(body(fetchMock, SONGS)).toMatchObject({ candidateTeamId: '7' })
  })

  it('cannot propose without a team in a per-team performance', async () => {
    openSong(PATH, 'MEMBER', {
      policy: { candidateScope: 'TEAM_MEMBERS' },
      me: mine(),
      routes: routes(),
    })
    await screen.findByText(T.noTeamToPropose)
    await type(T.fieldTitle, '곡')
    expect(
      screen
        .getByRole('button', { name: T.submitMember })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('hides the scope for a performance-wide scope even when the member has a team', async () => {
    const { fetchMock } = openSong(PATH, 'MEMBER', {
      me: mine(['7', 'Crane Team']),
      routes: routes(),
    })
    await type(T.fieldTitle, '곡')
    expect(screen.queryByRole('combobox', { name: T.fieldScope })).toBeNull()
    await submit()
    await screen.findByText(T.proposed)
    expect(body(fetchMock, SONGS)).toMatchObject({ candidateTeamId: null })
  })

  it('fixes the team when opened from a team application', async () => {
    const { fetchMock } = openSong(`${PATH}?teamId=8`, 'MEMBER', {
      policy: { candidateScope: 'TEAM_MEMBERS' },
      me: mine(['7', 'Crane Team'], ['8', 'Moon Team']),
      routes: routes(),
    })
    const select = (await screen.findByRole('combobox', {
      name: T.fieldScope,
    })) as HTMLSelectElement
    expect(select.value).toBe('8')
    expect(select.hasAttribute('disabled')).toBe(true)
    await type(T.fieldTitle, '곡')
    await submit()
    await screen.findByText(T.proposed)
    expect(body(fetchMock, SONGS)).toMatchObject({ candidateTeamId: '8' })
  })
})

describe('SONG-002 as an officer', () => {
  it('registers a candidate for the whole performance without limit text', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', { routes: routes() })
    await screen.findByRole('combobox', { name: T.fieldScope })
    expect(screen.queryByText(T.proposeNotice)).toBeNull()
    expect(screen.queryByText(/더 제안할 수 있어요/)).toBeNull()
    expect(
      screen.queryByRole('combobox', { name: T.fieldAssignedTeam }),
    ).toBeNull()
    await type(T.fieldTitle, '곡')
    await submit(true)
    await screen.findByText(T.registered)
    expect(body(fetchMock, SONGS)).toMatchObject({
      status: 'PROPOSED',
      candidateTeamId: null,
    })
  })

  it('offers the live teams as scope, without rejected ones', async () => {
    openSong(PATH, 'CLUB_ADMIN', { routes: routes() })
    const select = await screen.findByRole('combobox', { name: T.fieldScope })
    await within(select).findByRole('option', { name: 'Crane Team' })
    expect(
      within(select).getByRole('option', { name: T.scopeAll }),
    ).toBeTruthy()
    expect(within(select).queryByRole('option', { name: '거절 팀' })).toBeNull()
  })

  it('requires a team in a per-team performance', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      policy: { candidateScope: 'TEAM_MEMBERS' },
      routes: routes(),
    })
    await type(T.fieldTitle, '곡')
    expect(
      screen
        .getByRole('button', { name: T.submitAdmin })
        .hasAttribute('disabled'),
    ).toBe(true)
    const select = await screen.findByRole('combobox', { name: T.fieldScope })
    await within(select).findByRole('option', { name: 'Moon Team' })
    fireEvent.change(select, { target: { value: '8' } })
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: T.submitAdmin })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
  })

  it('selects at once with an approved team, or later without one', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', { routes: routes() })
    await type(T.fieldTitle, '곡')
    fireEvent.click(await screen.findByRole('radio', { name: T.asConfirmed }))
    const select = await screen.findByRole('combobox', {
      name: T.fieldAssignedTeam,
    })
    await within(select).findByRole('option', { name: 'Crane Team' })
    fireEvent.change(select, { target: { value: '7' } })
    await submit(true)
    await screen.findByText(T.registered)
    expect(body(fetchMock, SONGS)).toMatchObject({
      status: 'CONFIRMED',
      assignedTeamId: '7',
    })
  })

  it('sends a null team when 나중에 정하기 is kept', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', { routes: routes() })
    await type(T.fieldTitle, '곡')
    fireEvent.click(await screen.findByRole('radio', { name: T.asConfirmed }))
    await screen.findByRole('option', { name: T.assignedLater })
    await submit(true)
    await screen.findByText(T.registered)
    expect(body(fetchMock, SONGS)).toMatchObject({
      status: 'CONFIRMED',
      assignedTeamId: null,
    })
  })

  it('lets an officer register while the candidate feature is disabled', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      routes: routes(),
      policy: { candidateState: 'DISABLED' },
    })
    await screen.findByRole('textbox', { name: T.fieldTitle })
  })

  it('can register in a draft performance but not in a finished one', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'DRAFT' },
      routes: routes(),
    })
    await screen.findByRole('textbox', { name: T.fieldTitle })
  })

  it('is closed for an officer once the performance is finished', async () => {
    openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'FINISHED' },
      routes: routes(),
    })
    await screen.findByText(T.createClosed)
  })

  it('needs order, team, players and a reason in a locked performance (X-05)', async () => {
    const { fetchMock } = openSong(PATH, 'CLUB_ADMIN', {
      perf: { status: 'LOCKED' },
      routes: routes({ [`GET ${PERF}/members`]: () => participants() }),
    })
    await screen.findByText(T.lockedHint)
    // No choice between candidate and selected: only the selecting flow exists.
    expect(screen.queryByRole('radio', { name: T.asCandidate })).toBeNull()
    await type(T.fieldTitle, '긴급곡')
    const submitButton = screen.getByRole('button', { name: T.submitAdmin })
    expect(submitButton.hasAttribute('disabled')).toBe(true)

    const team = await screen.findByRole('combobox', {
      name: T.fieldAssignedTeam,
    })
    await within(team).findByRole('option', { name: 'Crane Team' })
    fireEvent.change(team, { target: { value: '7' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: T.fieldOrder }), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: T.addPlayer }))
    const part = await screen.findByRole('combobox', { name: T.pickerPart })
    const picker = within(part.closest('[role=dialog]') as HTMLElement)
    fireEvent.change(part, { target: { value: '4' } })
    fireEvent.click(picker.getByRole('tab', { name: T.pickerTabAll }))
    fireEvent.click(
      await picker.findByRole('button', { name: `김도윤 ${T.pickerAction}` }),
    )
    await screen.findByText('드럼 · 김도윤')
    await waitFor(() =>
      expect(submitButton.hasAttribute('disabled')).toBe(false),
    )
    fireEvent.click(submitButton)

    // The reason comes last, in the reason dialog.
    const reason = await screen.findByRole('textbox', {
      name: T.lockedReasonTitle,
    })
    expect(
      callsTo(fetchMock, SONGS).filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0)
    fireEvent.change(reason, { target: { value: '리허설 직전 추가' } })
    fireEvent.click(
      await screen.findByRole('button', { name: T.submitAdmin, hidden: false }),
    )
    await screen.findByText(T.registered)
    expect(body(fetchMock, SONGS)).toEqual({
      title: '긴급곡',
      artist: null,
      referenceUrl: null,
      memo: null,
      candidateTeamId: null,
      status: 'CONFIRMED',
      assignedTeamId: '7',
      setlistOrder: 3,
      sessions: [{ performanceMemberId: '32', partId: '4' }],
      reason: '리허설 직전 추가',
    })
  })
})
