import { FORM_COPY as T } from './formCopy'

/** API-038: the six presets. */
export const PRESETS = [
  'TEAM_FIRST',
  'SONG_FIRST',
  'SONG_FIXED',
  'SELF_TEAM',
  'BAND',
  'CUSTOM',
] as const
export type Preset = (typeof PRESETS)[number]

export type State = 'OPEN' | 'CLOSED' | 'DISABLED'
export type Scope = 'TEAM_MEMBERS' | 'ALL_PARTICIPANTS'

/** The policy fields PERF-002 decides; every other policy field keeps the server default. */
export type PolicyDraft = {
  applicationState: State
  teamApplicationState: State
  candidateState: State
  candidateScope: Scope
  candidateLimitPerMember: number | null
  playabilityState: State
  voteState: State
  voteMethod: 'APPROVAL' | 'SCORE'
  voteMaxChoices: number | null
  availabilityState: State
  practiceSeasonStart: string | null
  practiceSeasonEnd: string | null
  maxSongsPerMember: number | null
}

const base = {
  candidateLimitPerMember: null,
  voteMethod: 'APPROVAL',
  voteMaxChoices: null,
  availabilityState: 'CLOSED',
  practiceSeasonStart: null,
  practiceSeasonEnd: null,
  maxSongsPerMember: null,
} as const

/** Starting policy of each fixed preset (API-038 table); shown in the summary, the server fills it. */
export const PRESET_POLICY: Record<Exclude<Preset, 'CUSTOM'>, PolicyDraft> = {
  TEAM_FIRST: {
    ...base,
    applicationState: 'OPEN',
    teamApplicationState: 'CLOSED',
    candidateState: 'OPEN',
    candidateScope: 'TEAM_MEMBERS',
    playabilityState: 'OPEN',
    voteState: 'CLOSED',
  },
  SONG_FIRST: {
    ...base,
    applicationState: 'OPEN',
    teamApplicationState: 'CLOSED',
    candidateState: 'OPEN',
    candidateScope: 'ALL_PARTICIPANTS',
    playabilityState: 'OPEN',
    voteState: 'OPEN',
  },
  SONG_FIXED: {
    ...base,
    applicationState: 'CLOSED',
    teamApplicationState: 'DISABLED',
    candidateState: 'DISABLED',
    candidateScope: 'ALL_PARTICIPANTS',
    playabilityState: 'CLOSED',
    voteState: 'DISABLED',
  },
  SELF_TEAM: {
    ...base,
    applicationState: 'OPEN',
    teamApplicationState: 'OPEN',
    candidateState: 'OPEN',
    candidateScope: 'TEAM_MEMBERS',
    playabilityState: 'OPEN',
    voteState: 'CLOSED',
  },
  BAND: {
    ...base,
    applicationState: 'CLOSED',
    teamApplicationState: 'DISABLED',
    candidateState: 'OPEN',
    candidateScope: 'ALL_PARTICIPANTS',
    playabilityState: 'OPEN',
    voteState: 'OPEN',
  },
}

/** Presets offered for a club type: the single-band card exists only for a band club. */
export const presetsFor = (clubType: string): Preset[] =>
  clubType === 'BAND'
    ? ['BAND', 'TEAM_FIRST', 'SONG_FIRST', 'SONG_FIXED', 'SELF_TEAM', 'CUSTOM']
    : ['TEAM_FIRST', 'SONG_FIRST', 'SONG_FIXED', 'SELF_TEAM', 'CUSTOM']

export const defaultPreset = (clubType: string): Preset =>
  clubType === 'BAND' ? 'BAND' : 'TEAM_FIRST'

// ---- Step 3: the custom questions --------------------------------------------------------

export const QUESTION_IDS = [
  'participants',
  'teams',
  'candidates',
  'candidateLimit',
  'playability',
  'vote',
  'voteMax',
  'availability',
  'season',
  'maxSongs',
] as const
export type QuestionId = (typeof QUESTION_IDS)[number]

/** Answers by question. Numeric questions hold 'NONE' (no limit) or the number as a string; the
 * season holds 'LATER' or 'yyyy-MM-dd~yyyy-MM-dd'. */
export type Answers = Partial<Record<QuestionId, string>>

/** The questions to ask now: 7 to 10 depending on the answers (PERF-002 step 3). */
export function visibleQuestions(a: Answers): QuestionId[] {
  return QUESTION_IDS.filter((q) => {
    if (q === 'candidateLimit') return a.candidates !== 'NONE'
    if (q === 'voteMax') return a.vote === 'APPROVAL'
    if (q === 'season') return a.availability === 'YES'
    return true
  })
}

export const isComplete = (a: Answers) =>
  visibleQuestions(a).every((q) => a[q] !== undefined)

const limit = (v: string | undefined) =>
  v === undefined || v === 'NONE' ? null : Number(v)

/** Turns the answers into the full policy (API-038: used feature OPEN, availability CLOSED,
 * unused feature DISABLED). */
export function policyFromAnswers(a: Answers): PolicyDraft {
  const [from, to] = (a.season ?? '').split('~')
  const hasSeason = a.availability === 'YES' && !!from && !!to
  const used = (yes: boolean): State => (yes ? 'OPEN' : 'DISABLED')
  return {
    applicationState: used(a.participants === 'APPLY'),
    teamApplicationState: used(a.teams === 'APPLY'),
    candidateState: used(a.candidates !== 'NONE'),
    candidateScope:
      a.candidates === 'TEAM' ? 'TEAM_MEMBERS' : 'ALL_PARTICIPANTS',
    candidateLimitPerMember:
      a.candidates === 'NONE' ? null : limit(a.candidateLimit),
    playabilityState: used(a.playability === 'YES'),
    voteState: used(a.vote !== 'NONE'),
    voteMethod: a.vote === 'SCORE' ? 'SCORE' : 'APPROVAL',
    voteMaxChoices: a.vote === 'APPROVAL' ? limit(a.voteMax) : null,
    availabilityState: a.availability === 'YES' ? 'CLOSED' : 'DISABLED',
    practiceSeasonStart: hasSeason ? (from ?? null) : null,
    practiceSeasonEnd: hasSeason ? (to ?? null) : null,
    maxSongsPerMember: limit(a.maxSongs),
  }
}

/** One line per feature for the summary bubble and the confirm step. */
export function policySummary(
  p: PolicyDraft,
): [label: string, value: string][] {
  const L = T.policyLabels
  const state = (s: State) => T.state[s]
  const parts = (...xs: (string | false)[]) => xs.filter(Boolean).join(' · ')
  const on = (s: State) => s !== 'DISABLED'
  return [
    [L.application, state(p.applicationState)],
    [L.teamApplication, state(p.teamApplicationState)],
    [
      L.candidate,
      parts(
        state(p.candidateState),
        on(p.candidateState) && T.scope[p.candidateScope],
        on(p.candidateState) &&
          p.candidateLimitPerMember !== null &&
          T.perPerson(p.candidateLimitPerMember),
      ),
    ],
    [L.playability, state(p.playabilityState)],
    [
      L.vote,
      parts(
        state(p.voteState),
        on(p.voteState) && T.voteMethods[p.voteMethod],
        on(p.voteState) &&
          p.voteMaxChoices !== null &&
          T.maxChoices(p.voteMaxChoices),
      ),
    ],
    [
      L.availability,
      parts(
        state(p.availabilityState),
        p.practiceSeasonStart !== null &&
          p.practiceSeasonEnd !== null &&
          T.season(p.practiceSeasonStart, p.practiceSeasonEnd),
      ),
    ],
    [
      L.maxSongs,
      p.maxSongsPerMember === null
        ? T.noLimit
        : T.maxSongs(p.maxSongsPerMember),
    ],
  ]
}
