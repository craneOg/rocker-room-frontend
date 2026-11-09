import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COPY } from '../../shared/ui/copy'
import {
  callsTo,
  findScreen,
  json,
  setupDom,
  type Route,
} from '../../test/harness'
import { body, memberPage, memberRow, open } from '../performance/viewTestKit'
import {
  AUDITIONS,
  audition,
  auditionPage,
  performanceAt,
  pickerRoutes,
} from './auditionTestKit'
import { AUDITION_COPY as T } from './auditionCopy'

setupDom()

const PATH = '/clubs/10/performances/31/auditions/new'
const created = (id = '12') => json({ items: [audition(id)] }, 201)
const failWith = (
  status: number,
  code: string,
  details: { field?: string; reason?: string }[],
) =>
  new Response(JSON.stringify({ error: { code, message: code, details } }), {
    status,
  })

function show(extra: Record<string, Route> = {}, path = PATH) {
  // The global toast animates; jsdom has no Web Animations API.
  Object.defineProperty(Element.prototype, 'getAnimations', {
    value: () => [],
    configurable: true,
  })
  return open(path, 'CLUB_ADMIN', {
    ...pickerRoutes,
    [`GET ${AUDITIONS}`]: () => auditionPage([]),
    [`GET /api/v1/clubs/10/performances/31/members`]: () =>
      memberPage(
        [memberRow('88', 'm1', '박서연'), memberRow('89', 'm2', '이도윤')],
        {},
      ),
    ...extra,
  })
}
const ready = async () => {
  await findScreen('AUDI-002')
  // Songs load next to the form.
  await screen.findByRole('option', { name: 'Song A' })
}
const pickSong = (id = '41') =>
  fireEvent.change(screen.getByLabelText(T.songLabel), {
    target: { value: id },
  })
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: T.submit }))
const toSession = () =>
  fireEvent.click(screen.getByRole('radio', { name: T.typeSession }))
async function addApplicants(...names: string[]) {
  fireEvent.click(screen.getByRole('button', { name: T.addApplicant }))
  for (const n of names)
    fireEvent.click(await screen.findByRole('checkbox', { name: n }))
  fireEvent.click(screen.getByRole('button', { name: T.applicantsDone }))
}
const writes = (fetchMock: ReturnType<typeof show>['fetchMock']) =>
  callsTo(fetchMock, AUDITIONS).filter(([, init]) => init?.method === 'POST')

describe('AUDI-002 AuditionCreate', () => {
  it('registers a song audition without part or applicants and returns to the list', async () => {
    const { fetchMock, router } = show({
      [`POST ${AUDITIONS}`]: () => created(),
    })
    await ready()
    pickSong()
    await screen.findByRole('option', { name: /오디션 1차/ })
    fireEvent.change(screen.getByLabelText(T.scheduleLabel), {
      target: { value: '305' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: T.memoLabel }), {
      target: { value: '  후렴 위주  ' },
    })
    submit()
    await screen.findByText(T.created)
    expect(body(fetchMock, AUDITIONS)).toEqual({
      type: 'SONG',
      songId: '41',
      linkedScheduleId: '305',
      memo: '후렴 위주',
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/clubs/10/performances/31/auditions',
      ),
    )
  })

  it('does not offer a canceled schedule and links to the schedule form', async () => {
    show()
    await ready()
    await screen.findByRole('option', { name: /오디션 1차/ })
    expect(screen.queryByRole('option', { name: /취소된 오디션/ })).toBeNull()
    expect(
      screen.getByRole('link', { name: T.createSchedule }).getAttribute('href'),
    ).toBe('/clubs/10/performances/31/schedules/new?eventType=AUDITION')
  })

  it('asks for a song before sending anything', async () => {
    const { fetchMock } = show({ [`POST ${AUDITIONS}`]: () => created() })
    await ready()
    submit()
    await screen.findByText(`* ${T.needSong}`)
    expect(writes(fetchMock)).toHaveLength(0)
  })

  it('registers a session audition with one part for every applicant', async () => {
    const { fetchMock } = show({ [`POST ${AUDITIONS}`]: () => created() })
    await ready()
    toSession()
    pickSong('42')
    await addApplicants('박서연', '이도윤')
    await screen.findByText('박서연')
    fireEvent.change(screen.getByLabelText(T.partLabel), {
      target: { value: '4' },
    })
    submit()
    await screen.findByText(T.created)
    expect(body(fetchMock, AUDITIONS)).toEqual({
      type: 'SESSION',
      songId: '42',
      partId: '4',
      applicantPerformanceMemberIds: ['88', '89'],
    })
  })

  it('offers only active parts and asks for applicants and a part', async () => {
    const { fetchMock } = show({ [`POST ${AUDITIONS}`]: () => created() })
    await ready()
    toSession()
    pickSong()
    await screen.findByRole('option', { name: '드럼' })
    expect(screen.queryByRole('option', { name: '건반' })).toBeNull()
    submit()
    await screen.findByText(`* ${T.needApplicants}`)
    expect(screen.getByText(`* ${T.needPart}`)).toBeTruthy()
    expect(writes(fetchMock)).toHaveLength(0)
  })

  it('removes a picked applicant', async () => {
    show()
    await ready()
    toSession()
    await addApplicants('박서연')
    fireEvent.click(
      await screen.findByRole('button', { name: T.removeApplicant('박서연') }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: T.removeApplicant('박서연') }),
      ).toBeNull(),
    )
  })

  const DUP_MESSAGE = '이미 심사 대기 중인 대상이에요'
  const duplicate = () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'DUPLICATE',
          message: DUP_MESSAGE,
          details: [{ reason: 'AUDITION_ALREADY_PENDING' }],
        },
      }),
      { status: 409 },
    )

  it('shows the server message once for a duplicate song (A-06, no field)', async () => {
    const { router } = show({ [`POST ${AUDITIONS}`]: duplicate })
    await ready()
    pickSong()
    submit()
    await screen.findByText(DUP_MESSAGE)
    expect(screen.getAllByText(DUP_MESSAGE)).toHaveLength(1)
    // The form stays for another try; nothing was registered.
    expect(screen.queryByText(T.created)).toBeNull()
    expect(router.state.location.pathname).toBe(PATH)
    expect(screen.getByRole('button', { name: T.submit })).toBeTruthy()
  })

  it('keeps the picked applicants when the whole request is a duplicate', async () => {
    show({ [`POST ${AUDITIONS}`]: duplicate })
    await ready()
    toSession()
    pickSong()
    await addApplicants('박서연', '이도윤')
    fireEvent.change(screen.getByLabelText(T.partLabel), {
      target: { value: '4' },
    })
    submit()
    await screen.findByText(DUP_MESSAGE)
    expect(screen.getAllByText(DUP_MESSAGE)).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: T.removeApplicant('이도윤') }),
    ).toBeTruthy()
  })

  it.each(Object.keys(T.ruleCopy))(
    'explains the 422 reason %s',
    async (reason) => {
      show({
        [`POST ${AUDITIONS}`]: () =>
          failWith(422, 'RULE_VIOLATION', [{ field: 'request', reason }]),
      })
      await ready()
      pickSong()
      submit()
      await screen.findByText(T.ruleCopy[reason] as string)
      expect(screen.getByText(COPY.ruleViolationTitle)).toBeTruthy()
    },
  )

  it('tells that the song can no longer be auditioned (409 STATE_CONFLICT)', async () => {
    show({
      [`POST ${AUDITIONS}`]: () =>
        failWith(409, 'STATE_CONFLICT', [{ reason: 'SONG_NOT_AUDITIONABLE' }]),
    })
    await ready()
    pickSong()
    submit()
    await screen.findByText(COPY.stateConflictTitle)
  })

  it('fixes the song and type when opened for a re-audition', async () => {
    const { fetchMock } = show(
      { [`POST ${AUDITIONS}`]: () => created() },
      `${PATH}?type=SESSION&songId=41&partId=4&applicantId=88`,
    )
    await ready()
    expect(
      (screen.getByLabelText(T.songLabel) as HTMLSelectElement).disabled,
    ).toBe(true)
    // The applicant of the earlier audition is picked once the roster is known.
    await screen.findByRole('button', { name: T.removeApplicant('박서연') })
    expect(
      screen
        .getByRole('radio', { name: T.typeSession })
        .getAttribute('aria-checked'),
    ).toBe('true')
    await screen.findByRole('option', { name: '드럼' })
    submit()
    await screen.findByText(T.created)
    expect(body(fetchMock, AUDITIONS)).toEqual({
      type: 'SESSION',
      songId: '41',
      partId: '4',
      applicantPerformanceMemberIds: ['88'],
    })
  })

  it('works on a LOCKED performance without a reason', async () => {
    const { fetchMock } = show({
      ...performanceAt('LOCKED'),
      [`POST ${AUDITIONS}`]: () => created(),
    })
    await ready()
    pickSong()
    submit()
    await screen.findByText(T.created)
    expect(body(fetchMock, AUDITIONS)).not.toHaveProperty('reason')
  })

  it.each(['FINISHED', 'CANCELED'])(
    'shows a notice instead of the form on a %s performance',
    async (status) => {
      show(performanceAt(status))
      await findScreen('AUDI-002')
      await screen.findByText(T.closedPerformance)
      expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
    },
  )

  it('keeps the memo within 500 characters', async () => {
    show()
    await ready()
    const memo = screen.getByRole('textbox', { name: T.memoLabel })
    fireEvent.change(memo, { target: { value: 'a'.repeat(600) } })
    expect((memo as HTMLTextAreaElement).value).toHaveLength(500)
  })
})
