import { describe, expect, it } from 'vitest'
import {
  isComplete,
  policyFromAnswers,
  presetsFor,
  visibleQuestions,
  type Answers,
} from './presets'

describe('custom questions', () => {
  it('asks 7 questions at the least and 10 at the most', () => {
    expect(
      visibleQuestions({
        candidates: 'NONE',
        vote: 'NONE',
        availability: 'NO',
      }),
    ).toHaveLength(7)
    expect(
      visibleQuestions({
        candidates: 'ALL',
        vote: 'APPROVAL',
        availability: 'YES',
      }),
    ).toHaveLength(10)
  })

  it('maps answers to the policy (used OPEN, availability CLOSED, unused DISABLED)', () => {
    const answers: Answers = {
      participants: 'APPLY',
      teams: 'SONG_BASED',
      candidates: 'TEAM',
      candidateLimit: '3',
      playability: 'YES',
      vote: 'APPROVAL',
      voteMax: 'NONE',
      availability: 'YES',
      season: '2026-10-01~2026-11-01',
      maxSongs: '2',
    }
    expect(isComplete(answers)).toBe(true)
    expect(policyFromAnswers(answers)).toEqual({
      applicationState: 'OPEN',
      teamApplicationState: 'DISABLED',
      candidateState: 'OPEN',
      candidateScope: 'TEAM_MEMBERS',
      candidateLimitPerMember: 3,
      playabilityState: 'OPEN',
      voteState: 'OPEN',
      voteMethod: 'APPROVAL',
      voteMaxChoices: null,
      availabilityState: 'CLOSED',
      practiceSeasonStart: '2026-10-01',
      practiceSeasonEnd: '2026-11-01',
      maxSongsPerMember: 2,
    })
  })

  it('leaves the season empty when decided later', () => {
    const p = policyFromAnswers({ availability: 'YES', season: 'LATER' })
    expect(p.practiceSeasonStart).toBeNull()
    expect(p.practiceSeasonEnd).toBeNull()
  })
})

describe('presetsFor', () => {
  it('puts the single band first for a band club and drops it otherwise', () => {
    expect(presetsFor('BAND')[0]).toBe('BAND')
    expect(presetsFor('CLUB')).not.toContain('BAND')
  })
})
