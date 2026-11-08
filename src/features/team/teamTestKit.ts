// Shared fixtures of the TEAM-001 ~ 005 tests.
import { fireEvent, screen, within } from '@testing-library/react'
import { json } from '../../test/harness'
import { detail, page, PERF } from '../performance/viewTestKit'

export { body, lastQuery, open, PERF } from '../performance/viewTestKit'
export const TEAMS = `${PERF}/teams`

/** Item of API-061. */
export const card = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  performanceId: '31',
  name,
  status: 'APPROVED',
  isDefault: false,
  source: 'ADMIN',
  rejectReason: null,
  leaderMembershipId: '21',
  leaderDisplayName: '정규채',
  memberCount: 2,
  partSummary: [
    { partId: '4', partName: '드럼', count: 1 },
    { partId: null, partName: null, count: 1 },
  ],
  assignedSongCount: 1,
  candidateSongCount: 0,
  isMine: false,
  version: '2',
  ...extra,
})

export const COUNTS = {
  DRAFT: 1,
  SUBMITTED: 2,
  APPROVED: 3,
  REJECTED: 0,
  WITHDRAWN: 0,
}

export const teamPage = (
  items: unknown[],
  statusCounts: Record<string, number> | null = null,
) => page(items, { statusCounts })

/** Member row of API-063. */
export const tmember = (
  id: string,
  membershipId: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  teamId: '201',
  membershipId,
  performanceMemberId: `3${id}`,
  displayName: name,
  profileImageUrl: null,
  partId: '4',
  partName: '드럼',
  isLeader: false,
  isRegisteredPart: true,
  participationStatus: 'APPROVED',
  ...extra,
})

/** Response of API-063. */
export const teamDetail = (
  team: Record<string, unknown> = {},
  members: unknown[] = [
    tmember('501', '21', '정규채', { isLeader: true }),
    tmember('502', '22', '김도윤'),
  ],
  extra: Record<string, unknown> = {},
) =>
  json({
    team: {
      id: '201',
      performanceId: '31',
      name: 'Crane Team',
      status: 'APPROVED',
      isDefault: false,
      source: 'ADMIN',
      rejectReason: null,
      leaderMembershipId: '21',
      leaderDisplayName: '정규채',
      partSummary: [
        { partId: '4', partName: '드럼', count: 2 },
        { partId: null, partName: null, count: 1 },
      ],
      version: '2',
      ...team,
    },
    members,
    songs: [],
    candidateSongs: [],
    ...extra,
  })

/** MutationResult of the team writes; `version` is what the next write must send. */
export const mutation = (
  version = '3',
  extra: Record<string, unknown> = {},
  warnings: string[] = [],
  status = 200,
) =>
  json(
    {
      resource: {
        id: '201',
        performanceId: '31',
        name: 'Crane Team',
        status: 'DRAFT',
        leaderMembershipId: '21',
        version,
        ...extra,
      },
      warnings,
      effects: {},
    },
    status,
  )

/** The performance detail with the team application window open (or not). */
export const withTeamPolicy = (
  state: 'OPEN' | 'CLOSED',
  p: Record<string, unknown> = {},
  pol: Record<string, unknown> = {},
) => json(detail(p, { teamApplicationState: state, ...pol }))

/** The last matching button: a dialog's button comes after the screen's button of the same name. */
export const clickLast = async (name: string | RegExp) => {
  const buttons = await screen.findAllByRole('button', { name })
  fireEvent.click(buttons[buttons.length - 1] as HTMLElement)
}

export const click = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole('button', { name }))

/** Opens the `…` menu of a row / the header, then picks an item. */
export const menuItem = async (summary: string, item: string) => {
  const toggle = await screen.findByLabelText(summary)
  fireEvent.click(toggle)
  fireEvent.click(
    await within(toggle.parentElement as HTMLElement).findByRole('button', {
      name: item,
    }),
  )
}

export const stubAnimations = () => {
  Element.prototype.getAnimations = () => []
}

/** Answer of API-062: the backend names the created team `team` (the other writes `resource`). */
export const created = (
  extra: Record<string, unknown> = {},
  warnings: unknown[] = [],
) =>
  json(
    {
      team: {
        id: '201',
        performanceId: '31',
        name: 'Crane Team',
        status: 'DRAFT',
        leaderMembershipId: 'm9',
        version: '1',
        ...extra,
      },
      warnings,
      effects: {},
    },
    201,
  )

/** An error answer with a reason (the backend's reasons are in `details[].reason`). */
export const reasoned = (
  code: string,
  status: number,
  reason: string,
  message = code,
) =>
  new Response(
    JSON.stringify({
      error: { code, message, details: [{ reason }] },
    }),
    { status },
  )
