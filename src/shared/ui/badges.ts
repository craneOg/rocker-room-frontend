// COM-002: one dictionary of {backend value -> label, look}. Status is never color-only:
// label text is always shown, plus border / strike-through / bold where the spec asks.
export type BadgeLook = {
  label: string
  color: 'neutral' | 'accent'
  variant: 'solid' | 'outlined'
  emphasis?: 'strike' | 'bold' | 'border'
}

const n = (label: string, emphasis?: BadgeLook['emphasis']): BadgeLook => ({
  label,
  color: 'neutral',
  variant: 'outlined',
  emphasis,
})
const a = (label: string, emphasis?: BadgeLook['emphasis']): BadgeLook => ({
  label,
  color: 'accent',
  variant: 'solid',
  emphasis,
})

export const BADGE_DICTIONARY = {
  // 1. performance (ERD performance.status)
  performance: {
    DRAFT: n('준비 중'),
    ACTIVE: a('진행 중'),
    LOCKED: { ...n('확정', 'border'), color: 'accent' },
    FINISHED: n('종료'),
    CANCELED: n('취소', 'strike'),
  },
  // 2. feature state (DISABLED / CLOSED / OPEN plus deadline-derived values)
  feature: {
    DISABLED: n('사용 안 함'),
    CLOSED: n('닫힘'),
    OPEN: a('진행 중'),
    DEADLINE_SOON: { ...a('마감 임박'), variant: 'outlined' },
    DEADLINE_PASSED: n('마감됨'),
  },
  // 3. song (ERD song.status)
  song: {
    PROPOSED: n('후보'),
    CONFIRMED: a('선정'),
    REJECTED: n('탈락', 'strike'),
    WITHDRAWN: n('철회', 'strike'),
  },
  // 4. team (ERD team.status) + is_default attribute
  team: {
    DRAFT: n('작성 중'),
    SUBMITTED: n('심사 대기'),
    APPROVED: a('승인', 'bold'),
    REJECTED: n('거절', 'strike'),
    WITHDRAWN: n('철회', 'strike'),
    DEFAULT: n('기본 팀'),
  },
  // 5. performance participation (ERD participant.status)
  participation: {
    APPLIED: n('참여 희망'),
    APPROVED: a('참여 확정', 'bold'),
    REJECTED: n('거절', 'strike'),
    WITHDRAWN: n('철회', 'strike'),
  },
  // 6. club membership (ERD membership.status / member_type / role)
  membership: {
    PENDING: n('가입 승인 대기'),
    INVITED: n('초대 수락 대기'),
    REJECTED: n('가입 거절', 'strike'),
    DECLINED: n('초대 거절', 'strike'),
    ACTIVE: n('활동'),
    ON_LEAVE: n('휴학'),
    GRADUATED: n('졸업'),
    WITHDRAWN: n('탈퇴', 'strike'),
    GUEST: n('객원'),
    CLUB_ADMIN: a('임원'),
  },
  // 7. schedule status + type
  schedule: {
    TENTATIVE: n('임시(임원만)'),
    CONFIRMED: a('확정'),
    CANCELED: n('취소', 'strike'),
  },
  scheduleType: {
    PRACTICE: n('합주'),
    REHEARSAL: n('리허설'),
    AUDITION: n('오디션'),
    ETC: n('기타'),
  },
  // 8. playability response (no badge when unanswered)
  playability: {
    POSSIBLE: a('가능'),
    IMPOSSIBLE: n('불가'),
    HOLD: n('보류'),
  },
  // 9. audition result (null = 심사 대기)
  audition: {
    PENDING: n('심사 대기'),
    PASSED: a('합격'),
    FAILED: n('불합격', 'strike'),
  },
  // 10. display-name rules
  identity: {
    WITHDRAWN_USER: n('탈퇴한 사용자'),
    NON_TEAM_PLAYER: n('지원'),
    GUEST: n('객원'),
  },
} as const satisfies Record<string, Record<string, BadgeLook>>

export type BadgeKind = keyof typeof BADGE_DICTIONARY
export type BadgeValue<K extends BadgeKind> =
  keyof (typeof BADGE_DICTIONARY)[K] & string
