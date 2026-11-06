// CLUB-002 / CLUB-003 copy (screen spec 2026.10, section 3).
export const CLUB_COPY = {
  codeTitle: '가입 코드 입력',
  codeLabel: '가입 코드',
  codePlaceholder: '코드를 입력해 주세요',
  codeConfirm: '확인',
  codeInvalid: '코드가 올바르지 않아요. 임원에게 최신 코드를 확인해 주세요.',
  apply: '가입 신청',
  applyGone:
    '가입 신청할 수 없어요. 코드나 동아리 상태가 바뀌었는지 확인해 주세요.',
  applyDoneTitle: '가입 신청 완료',
  applyDone: (club: string) => `임원이 승인하면 ${club}를 이용할 수 있어요.`,
  confirm: '확인',
  alreadyMember: '이미 가입한 동아리예요',
  goClub: '이동하기',
  alreadyPending: '이미 가입 신청했어요',
  hasInvite: '이 동아리에서 받은 초대가 있어요',
  viewInvite: '초대 보기',
  searchTitle: '동아리 찾기',
  searchPlaceholder: '동아리 이름으로 찾기',
  searchShort: '2자 이상 입력해 주세요.',
  searchEmpty:
    '검색 결과가 없어요. 비공개 동아리는 가입 코드로 가입할 수 있어요.',
  loadMore: '더 보기',
  applyConfirmTitle: (club: string) => `${club}에 가입 신청할까요?`,
  noDescription: '소개가 없어요',
} as const

// CLUB-101 / 102 / 103 copy (screen spec 2026.10, section 3).
export const MEMBER_COPY = {
  infoTitle: '동아리',
  membersTitle: '멤버',
  detailTitle: '멤버 상세',
  statusActive: '활성',
  inactive: '비활성 · 변경 기능이 제한돼요',
  menuMembers: '멤버',
  menuMyMembership: '내 소속 정보',
  menuJoinRequests: '가입 관리',
  menuAddMember: '멤버 직접 추가',
  menuJoinCode: '가입 코드·공개 설정',
  menuParts: '파트 관리',
  menuLeave: '동아리 나가기',
  searchPlaceholder: '이름으로 찾기',
  empty: '조건에 맞는 멤버가 없어요',
  loadMore: '더 보기',
  chipActive: '활동',
  chipOnLeave: '휴학',
  chipGraduated: '졸업',
  chipWithdrawn: '탈퇴',
  chipAdmin: '임원',
  chipRegular: '정회원',
  chipGuest: '객원',
  moreParts: (n: number) => `+${n}`,
  inactivePart: '(사용 중지)',
  noParts: '등록된 파트가 없어요',
  sectionInfo: '소속 정보',
  sectionParts: '파트',
  sectionPerformances: '참여 공연',
  noPerformances: '참여한 공연이 없어요',
  labelType: '유형',
  labelStatus: '상태',
  labelJoinSource: '가입 경로',
  labelApprovedAt: '가입 확정일',
} as const

/** Filter chips of the status row (officers only). */
export const STATUS_CHIPS = [
  ['ACTIVE', MEMBER_COPY.chipActive],
  ['ON_LEAVE', MEMBER_COPY.chipOnLeave],
  ['GRADUATED', MEMBER_COPY.chipGraduated],
  ['WITHDRAWN', MEMBER_COPY.chipWithdrawn],
] as const

export const MEMBER_TYPE_LABEL: Record<string, string> = {
  REGULAR: '정회원',
  GUEST: '객원',
}

/** `joinSource`: JOIN_CODE and SEARCH are confirmed (API-014); the others are assumed. */
export const JOIN_SOURCE_LABEL: Record<string, string> = {
  CLUB_CREATE: '동아리 생성',
  JOIN_CODE: '가입 코드',
  SEARCH: '동아리 찾기',
  DIRECT_ADD: '직접 추가',
}

/** Shown in the type badge; unknown values fall back to the raw value. */
export const CLUB_TYPE_LABEL: Record<string, string> = {
  CLUB: '동아리',
  BAND: '밴드',
}
