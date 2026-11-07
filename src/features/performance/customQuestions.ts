import { FORM_COPY as T } from './formCopy'
import type { QuestionId } from './presets'

type Choice = { value: string; label: string }
type Question = { text: string } & (
  | { kind: 'choice'; choices: Choice[] }
  | { kind: 'number' }
  | { kind: 'season' }
)

const yesNo = (yes: string, no: string): Choice[] => [
  { value: 'YES', label: yes },
  { value: 'NO', label: no },
]

/** The custom questions of PERF-002 step 3, verbatim. */
export const CUSTOM_QUESTIONS: Record<QuestionId, Question> = {
  participants: {
    text: '공연 참여자는 어떻게 정하나요?',
    kind: 'choice',
    choices: [
      { value: 'APPLY', label: '부원이 신청하고 임원이 승인해요' },
      { value: 'MANUAL', label: '임원이 직접 정해요' },
    ],
  },
  teams: {
    text: '팀은 어떻게 만드나요?',
    kind: 'choice',
    choices: [
      { value: 'ADMIN', label: '임원이 만들어요' },
      { value: 'APPLY', label: '부원이 팀을 꾸려 신청해요' },
      { value: 'SONG_BASED', label: '곡을 정한 뒤 연주자로 팀을 만들어요' },
    ],
  },
  candidates: {
    text: '곡 후보를 부원에게 받나요?',
    kind: 'choice',
    choices: [
      { value: 'ALL', label: '공연 전체에서 받아요' },
      { value: 'TEAM', label: '팀별로 받아요' },
      { value: 'NONE', label: '임원이 직접 정해요' },
    ],
  },
  candidateLimit: {
    text: '한 사람이 몇 곡까지 제안할 수 있나요?',
    kind: 'number',
  },
  playability: {
    text: '곡마다 연주할 수 있는지(가불) 물어볼까요?',
    kind: 'choice',
    choices: yesNo('물어봐요', '안 물어봐요'),
  },
  vote: {
    text: '곡 선호 투표를 하나요?',
    kind: 'choice',
    choices: [
      { value: 'APPROVAL', label: '찬성 투표' },
      { value: 'SCORE', label: '1~5점 투표' },
      { value: 'NONE', label: '안 해요' },
    ],
  },
  voteMax: { text: '한 사람이 몇 곡까지 찬성할 수 있나요?', kind: 'number' },
  availability: {
    text: '합주 가능 시간을 받을까요?',
    kind: 'choice',
    choices: yesNo('받아요', '안 받아요'),
  },
  season: { text: '합주 시즌은 언제인가요?', kind: 'season' },
  maxSongs: {
    text: '한 사람이 출연할 곡 수에 권장 기준이 있나요? 넘으면 경고만 보여 줘요.',
    kind: 'number',
  },
}

/** The text of an answered bubble. */
export function answerLabel(id: QuestionId, value: string): string {
  const q = CUSTOM_QUESTIONS[id]
  if (q.kind === 'choice')
    return q.choices.find((c) => c.value === value)?.label ?? value
  if (q.kind === 'season')
    return value === 'LATER' ? T.later : value.replace('~', ' ~ ')
  if (value === 'NONE') return id === 'maxSongs' ? '없어요' : T.noLimit
  return `${value}곡`
}
