import type { PolicyPatch } from './policyApi'
import type { PerformancePolicy } from './types'

export const FEATURES = [
  'application',
  'teamApplication',
  'candidate',
  'playability',
  'vote',
  'availability',
] as const
export type FeatureKey = (typeof FEATURES)[number]

type LimitKey =
  'candidateLimitPerMember' | 'voteMaxChoices' | 'maxSongsPerMember'

/**
 * The form as text: a deadline is `yyyy-MM-ddTHH:mm` (KST) and a limit is a number string,
 * `''` meaning none ("제한 없음"). Dates are `yyyy-MM-dd`, `''` meaning none.
 */
export type PolicyForm = {
  [K in `${FeatureKey}State` | `${FeatureKey}Deadline`]: string
} & {
  candidateScope: string
  voteMethod: string
  playabilityResultPublic: boolean
  voteResultPublic: boolean
  practiceSeasonStart: string
  practiceSeasonEnd: string
} & { [K in LimitKey]: string }

// ponytail: the API always answers +09:00 times; a different offset would shift the shown time.
const KST = ':00+09:00'
const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : '')
const toIso = (local: string) => (local ? `${local}${KST}` : null)
const toText = (n: number | null) => (n === null ? '' : String(n))
const toNumber = (s: string) => (s === '' ? null : Number(s))

export function toForm(p: PerformancePolicy): PolicyForm {
  const form: Record<string, string | boolean> = {
    candidateScope: p.candidateScope,
    voteMethod: p.voteMethod,
    playabilityResultPublic: p.playabilityResultPublic,
    voteResultPublic: p.voteResultPublic,
    practiceSeasonStart: p.practiceSeasonStart ?? '',
    practiceSeasonEnd: p.practiceSeasonEnd ?? '',
    candidateLimitPerMember: toText(p.candidateLimitPerMember),
    voteMaxChoices: toText(p.voteMaxChoices),
    maxSongsPerMember: toText(p.maxSongsPerMember),
  }
  for (const f of FEATURES) {
    form[`${f}State`] = p[`${f}State`]
    form[`${f}Deadline`] = toLocal(p[`${f}Deadline`])
  }
  return form as PolicyForm
}

const isDeadline = (k: string) => k.endsWith('Deadline')
const isLimit = (k: string): k is LimitKey =>
  k === 'candidateLimitPerMember' ||
  k === 'voteMaxChoices' ||
  k === 'maxSongsPerMember'

/** The API-042 body of what changed (vote method excluded: it goes through API-043 / 044). */
export function buildPatch(initial: PolicyForm, current: PolicyForm) {
  const patch: Record<string, string | number | boolean | null> = {}
  for (const key of Object.keys(current) as (keyof PolicyForm)[]) {
    if (key === 'voteMethod' || current[key] === initial[key]) continue
    const value = current[key]
    patch[key] =
      typeof value === 'boolean'
        ? value
        : isDeadline(key)
          ? toIso(value)
          : isLimit(key)
            ? toNumber(value)
            : key.startsWith('practiceSeason')
              ? value || null
              : value
  }
  return patch as PolicyPatch
}

export const isPositiveInt = (s: string) => /^[1-9]\d*$/.test(s)

/** The first problem that blocks saving, as a key of the copy; `undefined` when the form is fine. */
export type FormProblem =
  'limit' | 'seasonPair' | 'seasonOrder' | 'seasonRequired'

export function formProblem(f: PolicyForm): FormProblem | undefined {
  const limits: LimitKey[] = [
    'candidateLimitPerMember',
    'voteMaxChoices',
    'maxSongsPerMember',
  ]
  if (limits.some((k) => f[k] !== '' && !isPositiveInt(f[k]))) return 'limit'
  const start = f.practiceSeasonStart
  const end = f.practiceSeasonEnd
  if ((start === '') !== (end === '')) return 'seasonPair'
  if (start !== '' && end < start) return 'seasonOrder'
  // F-04: availability can only be OPEN with a season.
  if (f.availabilityState === 'OPEN' && start === '') return 'seasonRequired'
  return undefined
}
