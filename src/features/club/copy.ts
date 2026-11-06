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

/** Shown in the type badge; unknown values fall back to the raw value. */
export const CLUB_TYPE_LABEL: Record<string, string> = {
  CLUB: '동아리',
  BAND: '밴드',
}
