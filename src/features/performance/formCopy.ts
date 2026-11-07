// Screen copy of PERF-002 (create) and PERF-006 (edit), verbatim from the screen specs.
export const FORM_COPY = {
  createTitle: '공연 만들기',
  editTitle: '공연 정보 수정',
  steps: ['기본 정보', '진행 방식', '직접 설정', '확인'],
  prev: '이전',
  next: '다음',
  create: '공연 만들기',
  created: '공연을 만들었어요',
  save: '저장',
  // Step 1 / edit fields
  labelTitle: '공연 이름',
  titlePlaceholder: '예: 2026 가을 정기공연',
  titleError: '공연 이름을 입력해 주세요.',
  labelDate: '공연일',
  dateUndecided: '날짜 미정',
  labelLocation: '장소',
  locationPlaceholder: '예: 학생회관 소극장',
  // Step 2
  presetHint:
    '우리 동아리의 공연 준비 흐름과 가장 비슷한 방식을 골라 주세요. 만든 뒤 운영 정책에서 항목별로 바꿀 수 있어요.',
  presetNames: {
    TEAM_FIRST: '팀 먼저',
    SONG_FIRST: '곡 먼저',
    SONG_FIXED: '곡 지정형',
    SELF_TEAM: '자율 팀 신청형',
    BAND: '단일 밴드',
    CUSTOM: '직접 설정',
  },
  presetDescriptions: {
    TEAM_FIRST: '팀을 먼저 꾸리고 팀별로 곡을 골라요(정기공연)',
    SONG_FIRST: '곡을 먼저 정하고 곡에 맞춰 팀을 꾸려요(축제·비정기)',
    SONG_FIXED: '임원이나 주최 측이 곡을 정하고 연주자를 모아요',
    SELF_TEAM: '부원이 팀과 곡을 정해 신청하고 임원이 승인해요',
    BAND: '고정 멤버 한 팀이 곡을 함께 정해요',
    CUSTOM: '질문에 답하면 우리 방식에 맞게 설정해요',
  },
  presetFlows: {
    TEAM_FIRST:
      '참여자 모집 → 팀 편성 → 팀별 후보곡 → 가불·투표 → 곡 선정 → 세트리스트 → 합주',
    SONG_FIRST:
      '참여자 모집 → 후보곡 → 가불·투표 → 곡 선정 → 연주자 배정·팀 구성 → 세트리스트 → 합주',
    SONG_FIXED:
      '곡 직접 등록 → 참여자 모집 → 가불로 세션 지원 → 연주자 배정 → 세트리스트 → 합주',
    SELF_TEAM:
      '참여 신청·팀 신청(팀원·곡) → 가불·심사·오디션 → 곡 선정 → 세트리스트 → 합주',
    BAND: '기본 팀 자동 생성 → 후보곡 → 가불·투표 → 곡 선정 → 세트리스트 → 합주',
    CUSTOM: '3단계 질문으로 결정',
  },
  // Step 3 (custom questions)
  questionCount: (n: number, total: number) => `질문 ${n}/${total}`,
  noLimit: '제한 없음',
  confirmAnswer: '확인',
  seasonStart: '시작일',
  seasonEnd: '종료일',
  seasonOrder: '시작일이 종료일보다 늦어요.',
  seasonAfterPerform: '합주 시즌이 공연일 이후까지예요',
  later: '나중에 정할게요',
  summaryTitle: '이렇게 정해졌어요',
  proceed: '이대로 진행',
  // Step 4
  confirmBasic: '기본 정보',
  confirmPreset: '진행 방식',
  confirmPolicy: '운영 정책',
  edit: '수정',
  dateUndecidedValue: '날짜 미정',
  noLocation: '장소 미정',
  bandNotice: (club: string) =>
    `기본 팀 '${club}'이 자동으로 만들어지고, 활동·휴학 정회원(객원 제외)이 참여자이자 팀원으로 등록돼요.`,
  draftNotice:
    "공연은 '준비 중'으로 만들어져 임원만 볼 수 있어요. 준비가 끝나면 '진행 중'으로 바꿔 공개하세요.",
  // 0-1 leave confirmation
  leaveTitle: '공연 만들기를 그만둘까요?',
  leaveDescription: '입력한 내용은 저장되지 않아요.',
  keepWriting: '계속 작성',
  leave: '나가기',
  // Edit
  notEditable: '끝났거나 취소된 공연은 수정할 수 없어요',
  lockedReasonTitle: '확정된 공연을 수정해요',
  lockedReasonDescription: '수정 사유를 입력해 주세요. 기록으로 남아요.',
  // Policy summary
  policyLabels: {
    application: '참여 신청',
    teamApplication: '팀 신청',
    candidate: '후보곡',
    playability: '가불',
    vote: '투표',
    availability: '가능 시간',
    maxSongs: '권장 출연 곡 수',
  },
  state: { OPEN: '열림', CLOSED: '닫힘', DISABLED: '사용 안 함' },
  scope: { TEAM_MEMBERS: '팀별', ALL_PARTICIPANTS: '공연 전체' },
  voteMethods: { APPROVAL: '찬성', SCORE: '1~5점' },
  perPerson: (n: number) => `1인 ${n}곡`,
  maxChoices: (n: number) => `최대 ${n}곡`,
  maxSongs: (n: number) => `${n}곡`,
  season: (from: string, to: string) => `합주 시즌 ${from} ~ ${to}`,
} as const
