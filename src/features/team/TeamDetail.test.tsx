import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
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
  card,
  click,
  clickLast,
  menuItem,
  mutation,
  open,
  stubAnimations,
  teamDetail,
  teamPage,
  TEAMS,
  tmember,
  withTeamPolicy,
} from './teamTestKit'

setupDom()
beforeEach(stubAnimations)

const URL = '/clubs/10/performances/31/teams/201'
const T201 = `${TEAMS}/201`
const openAdmin = (
  extra: Parameters<typeof open>[2] = {},
  m: Parameters<typeof open>[3] = {},
) =>
  open(
    URL,
    'CLUB_ADMIN',
    {
      [`GET ${T201}`]: () => teamDetail(),
      [`GET ${TEAMS}`]: () =>
        teamPage([
          card('201', 'Crane Team'),
          card('202', '2팀', { isDefault: true }),
        ]),
      ...extra,
    },
    m,
  )

describe('TEAM-002 view', () => {
  it('shows the header, members with their badges, part bars, songs and candidates', async () => {
    open(URL, 'MEMBER', {
      [`GET ${T201}`]: () =>
        teamDetail(
          { rejectReason: 'x', status: 'REJECTED' },
          [
            tmember('501', '21', '정규채', { isLeader: true }),
            tmember('502', '22', '김도윤', {
              participationStatus: 'APPLIED',
              partId: '9',
              partName: '건반',
              isRegisteredPart: false,
            }),
            tmember('503', '23', '이서연', { partId: null, partName: null }),
          ],
          {
            songs: [
              {
                id: '301',
                performanceId: '31',
                title: '곡 제목',
                artist: '아티스트',
                status: 'CONFIRMED',
                assignedTeamId: '201',
                setlistOrder: 1,
                sessionCount: 4,
                requirementsSatisfied: true,
                version: '2',
              },
            ],
            candidateSongs: [
              {
                id: '302',
                performanceId: '31',
                title: '후보 곡',
                artist: '아티스트',
                status: 'PROPOSED',
                assignedTeamId: null,
                setlistOrder: null,
                evaluation: {
                  playability: {},
                  voteCount: 3,
                  scoreAverage: null,
                },
                version: '1',
              },
            ],
          },
        ),
    })
    await findScreen('TEAM-002')
    await screen.findByText('정규채')
    expect(screen.getByText(T.leaderBadge)).toBeTruthy()
    expect(screen.getByText('참여 희망')).toBeTruthy()
    expect(screen.getByText(T.notRegisteredPart)).toBeTruthy()
    expect(screen.getByText(T.sourceLabel.ADMIN!)).toBeTruthy()
    expect(screen.getByText(T.rejectReason('x'))).toBeTruthy()
    expect(screen.getByText('곡 제목').closest('a')?.getAttribute('href')).toBe(
      '/clubs/10/performances/31/songs/301',
    )
    expect(screen.getByText(T.sessions(4))).toBeTruthy()
    expect(screen.getByText(T.satisfied)).toBeTruthy()
    expect(screen.getByText('후보 곡')).toBeTruthy()
    expect(screen.getByText(T.voteSummary(3))).toBeTruthy()
    expect(screen.getByRole('img', { name: '드럼 2' })).toBeTruthy()
  })

  it('gives a plain member no edit controls', async () => {
    open(URL, 'MEMBER', { [`GET ${T201}`]: () => teamDetail() })
    await screen.findByText('정규채')
    expect(screen.queryByLabelText(T.teamMenu)).toBeNull()
    expect(screen.queryByText(`+ ${T.addMember}`)).toBeNull()
    expect(screen.queryByLabelText(`정규채 ${T.rowMenu}`)).toBeNull()
  })

  it('shows the empty song sections', async () => {
    open(URL, 'MEMBER', { [`GET ${T201}`]: () => teamDetail() })
    await screen.findByText(T.emptySongs)
    expect(screen.getByText(T.emptyCandidates)).toBeTruthy()
  })

  it('opens the 404 view for a team the requester may not see', async () => {
    open(URL, 'MEMBER', { [`GET ${T201}`]: () => apiError('NOT_FOUND', 404) })
    await screen.findByText(COPY.notFoundTitle)
  })
})

describe('TEAM-002 officer edits', () => {
  it('renames with the team version and reports a taken name', async () => {
    let taken = true
    const { fetchMock } = openAdmin({
      [`PATCH ${T201}`]: () =>
        taken
          ? apiError('DUPLICATE', 409)
          : json({
              id: '201',
              performanceId: '31',
              name: '새 이름',
              status: 'APPROVED',
              leaderMembershipId: '21',
              version: '3',
            }),
    })
    await menuItem(T.teamMenu, T.menuRename)
    const input = await screen.findByRole('textbox', { name: T.nameLabel })
    fireEvent.change(input, { target: { value: ' 새 이름 ' } })
    await click(T.save)
    await screen.findByText(T.nameTaken)
    expect(body(fetchMock, T201)).toEqual({ version: '2', name: '새 이름' })

    taken = false
    await click(T.save)
    await screen.findByText(T.renamed)
  })

  it('sets the default team after a confirmation that names the current one', async () => {
    const { fetchMock } = openAdmin({
      [`PUT ${TEAMS}/default`]: () =>
        json({ id: '201', isDefault: true, version: '3' }),
    })
    await screen.findByText('정규채')
    await menuItem(T.teamMenu, T.menuSetDefault)
    await screen.findByText(T.setDefaultBody('Crane Team', '2팀'))
    expect(callsTo(fetchMock, `${TEAMS}/default`)).toHaveLength(0)
    await clickLast(T.setDefaultAction)
    await screen.findByText(T.defaultSet)
    expect(body(fetchMock, `${TEAMS}/default`)).toEqual({ teamId: '201' })
  })

  it('does not offer 기본 팀으로 지정 on a team that is the default already', async () => {
    openAdmin({ [`GET ${T201}`]: () => teamDetail({ isDefault: true }) })
    await screen.findByText(T.defaultBadge)
    fireEvent.click(await screen.findByLabelText(T.teamMenu))
    await screen.findByRole('button', { name: T.menuRename })
    expect(screen.queryByRole('button', { name: T.menuSetDefault })).toBeNull()
  })

  it('makes another member the leader, clears the leader, and changes a part', async () => {
    const { fetchMock } = openAdmin({
      [`PUT ${T201}/leader`]: () => json({ id: '201', version: '3' }),
      [`PATCH ${T201}/members/502`]: () => mutation('3'),
    })
    await menuItem(`김도윤 ${T.rowMenu}`, T.makeLeader)
    await screen.findByText(T.leaderChanged)
    expect(body(fetchMock, `${T201}/leader`)).toEqual({
      version: '2',
      leaderMembershipId: '22',
    })

    await menuItem(`정규채 ${T.rowMenu}`, T.clearLeader)
    await waitFor(() =>
      expect(body(fetchMock, `${T201}/leader`)).toEqual({
        version: '2',
        leaderMembershipId: null,
      }),
    )

    await menuItem(`김도윤 ${T.rowMenu}`, T.changePart)
    const select = await screen.findByLabelText(T.pickerPart('김도윤'))
    fireEvent.change(select, { target: { value: '4' } })
    await click(T.save)
    await screen.findByText(T.partChanged)
    expect(body(fetchMock, `${T201}/members/502`)).toEqual({
      version: '2',
      partId: '4',
    })
  })

  it('refuses to remove the leader, and removes another member with removeSessions', async () => {
    const { fetchMock } = openAdmin({
      [`DELETE ${T201}/members/502`]: () => mutation('3'),
    })
    await menuItem(`정규채 ${T.rowMenu}`, T.removeMember)
    await screen.findByText(T.leaderFirst)
    expect(callsTo(fetchMock, `${T201}/members/501`)).toHaveLength(0)
    await clickLast(T.confirm)

    await menuItem(`김도윤 ${T.rowMenu}`, T.removeMember)
    fireEvent.click(await screen.findByLabelText(T.removeSessions))
    await clickLast(T.removeAction)
    await screen.findByText(T.removed)
    expect(body(fetchMock, `${T201}/members/502`)).toEqual({
      version: '2',
      removeSessions: true,
    })
  })

  it('adds the picked participants one by one, each with the version the last write answered', async () => {
    const versions: string[] = []
    const { fetchMock } = openAdmin({
      [`GET ${PERF}/members`]: () =>
        memberPage(
          [
            memberRow('1', '22', '김도윤'),
            memberRow('2', '23', '이서연'),
            memberRow('3', '24', '박지호'),
          ],
          { APPROVED: 3 },
        ),
      [`POST ${T201}/members`]: (_, init) => {
        const sent = JSON.parse(String(init?.body)) as { version: string }
        versions.push(sent.version)
        return mutation(String(Number(sent.version) + 1), {}, [], 201)
      },
    })
    fireEvent.click(await screen.findByText(`+ ${T.addMember}`))
    // 김도윤 is in the team already.
    const already = await screen.findByRole('checkbox', { name: /김도윤/ })
    expect((already as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(await screen.findByRole('checkbox', { name: /이서연/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /박지호/ }))
    await clickLast(T.pickerAdd)
    await screen.findByText(T.memberAdded(2))
    expect(versions).toEqual(['2', '3'])
    expect(
      callsTo(fetchMock, `${T201}/members`).map(([, init]) =>
        JSON.parse(String(init?.body)),
      ),
    ).toEqual([
      { version: '2', membershipId: '23', partId: '4' },
      { version: '3', membershipId: '24', partId: '4' },
    ])
  })

  it('refetches the team when adding members stops half way', async () => {
    let posts = 0
    const { fetchMock } = openAdmin({
      [`GET ${PERF}/members`]: () =>
        memberPage(
          [memberRow('2', '23', '이서연'), memberRow('3', '24', '박지호')],
          { APPROVED: 2 },
        ),
      [`POST ${T201}/members`]: () =>
        ++posts === 1 ? mutation('3', {}, [], 201) : apiError('DUPLICATE', 409),
    })
    fireEvent.click(await screen.findByText(`+ ${T.addMember}`))
    fireEvent.click(await screen.findByRole('checkbox', { name: /이서연/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /박지호/ }))
    const before = callsTo(fetchMock, T201).filter(
      ([, i]) => !i?.method || i.method === 'GET',
    ).length
    await clickLast(T.pickerAdd)
    await waitFor(() =>
      expect(
        callsTo(fetchMock, T201).filter(
          ([, i]) => !i?.method || i.method === 'GET',
        ).length,
      ).toBeGreaterThan(before),
    )
  })

  it('disbands an approved team with a reason', async () => {
    const { fetchMock } = openAdmin({
      [`POST ${T201}/withdraw`]: () => mutation('3', { status: 'WITHDRAWN' }),
    })
    await menuItem(T.teamMenu, T.menuDisband)
    fireEvent.change(
      await screen.findByRole('textbox', { name: T.disbandTitle }),
      {
        target: { value: '해체합니다' },
      },
    )
    await clickLast(T.disbandAction)
    await screen.findByText(T.disbanded)
    expect(body(fetchMock, `${T201}/withdraw`)).toEqual({
      version: '2',
      reason: '해체합니다',
    })
  })

  it('links to the review for a submitted member application', async () => {
    openAdmin({
      [`GET ${T201}`]: () =>
        teamDetail({ status: 'SUBMITTED', source: 'SELF' }),
    })
    fireEvent.click(await screen.findByLabelText(T.teamMenu))
    const link = await screen.findByRole('link', { name: T.menuReview })
    expect(link.getAttribute('href')).toBe(
      '/clubs/10/performances/31/teams/review',
    )
  })

  it('shows the version-conflict dialog when someone edited first', async () => {
    openAdmin({
      [`PUT ${T201}/leader`]: () => apiError('VERSION_CONFLICT', 409),
    })
    await menuItem(`김도윤 ${T.rowMenu}`, T.makeLeader)
    await screen.findByText(COPY.versionConflictTitle)
  })
})

describe('TEAM-002 on a LOCKED performance', () => {
  it('asks an officer for a reason before an edit and sends it', async () => {
    const { fetchMock } = openAdmin({
      [`GET ${PERF}`]: () => withTeamPolicy('CLOSED', { status: 'LOCKED' }),
      [`PUT ${T201}/leader`]: () => json({ id: '201', version: '3' }),
    })
    await menuItem(`김도윤 ${T.rowMenu}`, T.makeLeader)
    const reason = await screen.findByRole('textbox', { name: T.lockedTitle })
    expect(callsTo(fetchMock, `${T201}/leader`)).toHaveLength(0)
    fireEvent.change(reason, { target: { value: '긴급 변경' } })
    await clickLast(T.lockedAction)
    await screen.findByText(T.leaderChanged)
    expect(body(fetchMock, `${T201}/leader`)).toEqual({
      version: '2',
      leaderMembershipId: '22',
      reason: '긴급 변경',
    })
  })
})

describe('TEAM-002 for the leader of a draft', () => {
  const draft = () =>
    teamDetail({ status: 'DRAFT', source: 'SELF', leaderMembershipId: 'm9' }, [
      tmember('501', 'm9', '송예림', { isLeader: true }),
      tmember('502', '22', '김도윤'),
    ])

  it('can edit while the performance is ACTIVE', async () => {
    open(URL, 'MEMBER', { [`GET ${T201}`]: draft })
    await screen.findByText('송예림')
    expect(await screen.findByLabelText(T.teamMenu)).toBeTruthy()
    expect(screen.getByText(`+ ${T.addMember}`)).toBeTruthy()
  })

  it('cannot edit once the team is submitted', async () => {
    open(URL, 'MEMBER', {
      [`GET ${T201}`]: () =>
        teamDetail(
          { status: 'SUBMITTED', source: 'SELF', leaderMembershipId: 'm9' },
          [tmember('501', 'm9', '송예림', { isLeader: true })],
        ),
    })
    await screen.findByText('송예림')
    expect(screen.queryByLabelText(T.teamMenu)).toBeNull()
  })

  it('reopens a rejected team', async () => {
    const { fetchMock } = open(URL, 'MEMBER', {
      [`GET ${T201}`]: () =>
        teamDetail(
          { status: 'REJECTED', source: 'SELF', leaderMembershipId: 'm9' },
          [tmember('501', 'm9', '송예림', { isLeader: true })],
        ),
      [`POST ${T201}/reopen`]: () => mutation('3'),
    })
    await menuItem(T.teamMenu, T.menuReopen)
    await screen.findByText(T.reopened)
    expect(body(fetchMock, `${T201}/reopen`)).toEqual({ version: '2' })
  })
})
