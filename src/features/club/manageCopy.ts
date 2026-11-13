// CLUB-101 1-1, CLUB-102 4 / 4-1 / 4-2 / 4-4 and CLUB-103 3-1 / 5-1..5-4 copy (screen spec 2026.10).
export const MANAGE_COPY = {
  edit: '수정',
  save: '저장',
  change: '변경',
  apply: '적용',
  confirm: '확인',
  cancel: '취소',
  // 1-1 club edit
  editClubTitle: '동아리 정보 수정',
  labelName: '이름',
  labelDescription: '소개',
  labelClubType: '유형',
  nameTaken: '이미 사용 중인 이름이에요',
  nameRequired: '이름을 입력해 주세요',
  typeClub: '동아리',
  typeBand: '밴드',
  typeToBand:
    '앞으로 만드는 공연부터 기본 팀이 자동으로 생기고 새로 가입 승인되는 멤버가 자동으로 참여자·기본 팀원이 돼요. 이미 만든 공연과 팀은 바뀌지 않아요.',
  typeToClub:
    '앞으로 자동 등록이 일어나지 않아요. 이미 만든 기본 팀은 그대로 남아요.',
  clubTypeReasonTitle: '유형을 바꾸는 사유를 입력해 주세요',
  // 4 select mode
  select: '선택',
  selectDone: '선택 완료',
  selectedCount: (n: number) => `${n}명 선택`,
  bulkStatus: '상태 변경',
  bulkParts: '파트 변경',
  selectRow: (name: string) => `${name} 선택`,
  // statuses (4-1, 5-1)
  statusActive: '활동',
  statusOnLeave: '휴학',
  statusGraduated: '졸업',
  statusOnLeaveHint: '활동과 같은 권한',
  statusGraduatedHint: '공연 참여를 직접 신청할 수 없어요',
  graduateDropsAdmin: '졸업하면 임원 권한이 해제돼요.',
  statusTitle: '상태 변경',
  // 4-2
  partsTitle: '파트 변경',
  partsAdd: '추가',
  partsRemove: '빼기',
  noActiveParts: '선택할 수 있는 파트가 없어요',
  // 4-4
  bulkResultTitle: '일괄 처리 결과',
  bulkResult: (ok: number, failed: number) => `${ok}명 변경, ${failed}명 실패`,
  bulkDone: (n: number) => `${n}명을 변경했어요`,
  // 3-1
  editPartsTitle: '파트 수정',
  // 5 manage buttons
  manageStatus: '상태 변경',
  grantAdmin: '임원 권한 주기',
  revokeAdmin: '임원 권한 해제',
  changeType: '멤버 유형 변경',
  withdraw: '소속 해제',
  leaveInstead: '동아리 나가기',
  adminOnlyEligible: '활동·휴학 정회원만 임원이 될 수 있어요',
  // 5-2
  grantTitle: (name: string) =>
    `${name}님에게 임원 권한을 줄까요? 멤버·공연·일정을 관리할 수 있게 돼요.`,
  revokeTitle: (name: string) => `${name}님의 임원 권한을 해제할까요?`,
  grantConfirm: '권한 주기',
  revokeConfirm: '해제',
  // 5-3
  withdrawTitle: (name: string) => `${name}님을 동아리에서 내보낼까요?`,
  withdrawPerformances: (n: number) =>
    `진행 중인 공연 ${n}개에서 참여가 철회돼요. 팀원·연주자에서 빠지고 투표·가불·가능 시간은 집계에서 제외돼요.`,
  withdrawLeader: (performance: string, team: string, successor: string) =>
    `${performance} ${team}의 팀장이 ${successor}님으로 바뀌어요.`,
  withdrawLeaderNone: (performance: string, team: string) =>
    `${performance} ${team}에는 팀장을 이어받을 팀원이 없어 팀장이 비어요.`,
  changeSuccessor: '후임 바꾸기',
  withdrawSuccession:
    '이 멤버가 유일한 임원이라 다른 멤버에게 임원 권한이 넘어가요.',
  withdrawSuccessionTo: (name: string) =>
    `임원 권한을 이어받는 사람: ${name}님`,
  changeOfficerSuccessor: '임원 후임 바꾸기',
  withdrawConfirm: '내보내기',
  withdrawn: '소속을 해제했어요',
  // 5-4
  typeTitle: '멤버 유형 변경',
  typeRegular: '정회원',
  typeGuest: '객원',
  typeReasonTitle: '유형을 바꾸는 사유를 입력해 주세요',
  typeChanged: '멤버 유형을 바꿨어요',
  // saved / rule violations
  changed: '변경했어요',
} as const

/** RULE_VIOLATION reasons with screen copy (API-031/161/163, API-142 failures). */
export const LAST_ADMIN_STATUS =
  '임원은 활동·휴학 상태로 최소 1명 있어야 해요. 다른 멤버에게 권한을 먼저 주세요.'
export const LAST_ADMIN_ROLE =
  '임원은 최소 1명 있어야 해요. 다른 멤버에게 권한을 먼저 주세요.'
export const ADMIN_TARGET_NOT_ELIGIBLE = MANAGE_COPY.adminOnlyEligible
export const TYPE_RULE_COPY: Record<string, string> = {
  ADMIN_CANNOT_BE_GUEST:
    '임원이거나 진행 중인 공연에 참여 중인 멤버는 객원으로 바꿀 수 없어요.',
  PERFORMANCE_LINKED:
    '임원이거나 진행 중인 공연에 참여 중인 멤버는 객원으로 바꿀 수 없어요.',
  NOT_DIRECTLY_ADDED:
    '직접 추가한 멤버만 객원으로 바꿀 수 있어요. 객원으로 다시 초대해 주세요.',
}

/** `failed.reason` of the bulk API (API-142); unknown reasons are shown as they are. */
export const BULK_FAIL_REASON: Record<string, string> = {
  LAST_ADMIN: LAST_ADMIN_STATUS,
  INVALID_MEMBERSHIP_STATUS: '현재 상태에서는 바꿀 수 없어요',
  NOT_FOUND: '멤버를 찾을 수 없어요',
}
