// PERF-001 / PERF-003 (4-1, 4-2) / PMEM-001 (3-1, 4-1) and CLUB-102 4-3 copy (screen spec 2026.10).
export const VIEW_COPY = {
  // PERF-001
  listTitle: '공연',
  tabActive: '진행 중',
  tabDraft: '준비 중',
  tabPast: '지난 공연',
  emptyActive: '진행 중인 공연이 없어요',
  emptyDraft: '준비 중인 공연이 없어요',
  emptyPast: '지난 공연이 없어요',
  create: '공연 만들기',
  dateUndecided: '날짜 미정',
  loadMore: '더 보기',
  featureChip: {
    APPLICATION: (deadline: string | null) =>
      withDeadline('참여 신청', deadline),
    TEAM_APPLICATION: (deadline: string | null) =>
      withDeadline('팀 신청', deadline),
    CANDIDATE: (deadline: string | null) =>
      withDeadline('후보곡 제안', deadline),
    PLAYABILITY: (deadline: string | null) => withDeadline('가불', deadline),
    VOTE: (deadline: string | null) => withDeadline('투표 진행 중', deadline),
    AVAILABILITY: (deadline: string | null) =>
      withDeadline('가능 시간', deadline),
  } as Record<string, (deadline: string | null) => string>,
  // PERF-003
  detailTitle: '공연 상세',
  tabs: {
    overview: '개요',
    songs: '곡',
    teams: '팀',
    setlist: '세트리스트',
    schedules: '일정',
    members: '참여자',
    auditions: '오디션',
  },
  menu: '더 보기',
  menuEdit: '기본 정보 수정',
  menuPolicy: '운영 정책',
  menuStatus: '상태 변경',
  banner: {
    DRAFT: () => '준비 중인 공연이에요. 부원에게는 아직 보이지 않아요.',
    LOCKED: (admin: boolean) =>
      admin
        ? '세트리스트가 확정됐어요. 곡·팀 변경은 임원만 사유를 남기고 할 수 있어요.'
        : '세트리스트가 확정됐어요.',
    FINISHED: () => '종료된 공연이에요. 기록만 볼 수 있어요.',
    CANCELED: () => '취소된 공연이에요.',
  } as Record<string, (admin: boolean) => string>,
  myCard: '내 참여',
  canApplyHint: '이 공연에 참여하고 싶다면 신청하세요',
  guestHint: '졸업·객원 멤버는 임원이 참여자로 지정해요.',
  officerPicks: '참여자는 임원이 정해요.',
  appliedHint:
    '임원 승인을 기다리고 있어요. 그동안 후보곡 제안과 가불 응답을 할 수 있어요.',
  apply: '참여 신청',
  reapply: '다시 신청',
  cancelApply: '신청 철회',
  withdraw: '참여 철회',
  withdrawAction: '철회',
  leader: '팀장',
  myTeams: '내 팀',
  myPlaying: '내가 연주하는 곡',
  noOrder: '순서 미정',
  auditionResult: '오디션 결과 보기',
  features: '진행 기능',
  featureName: {
    application: '참여 신청',
    team: '팀 신청',
    candidate: '후보곡 제안',
    playability: '가불',
    vote: '투표',
    availability: '합주 가능 시간',
  },
  progressCandidate: (used: number, limit: number | null) =>
    limit === null ? `제안 ${used}곡` : `제안 ${used}/${limit}곡`,
  progressPlayability: (n: number) => `미응답 ${n}곡`,
  progressVote: (used: number, limit: number | null) =>
    limit === null ? `선택 ${used}곡` : `선택 ${used}/${limit}곡`,
  progressAvailability: (n: number) => `입력 완료 ${n}칸`,
  summary: '공연 요약',
  tileParticipants: (n: number) => `참여자 ${n}명`,
  tileTeams: (n: number) => `팀 ${n}개`,
  tileCandidates: (n: number) => `후보곡 ${n}곡`,
  tileConfirmed: (n: number) => `선정곡 ${n}곡`,
  nextSchedule: '다음 일정',
  noSchedule: '없음',
  // 4-1
  applyTitle: (name: string) => `${name}에 참여 신청할까요?`,
  applyBody:
    '임원이 승인하면 참여가 확정돼요. 승인 전에도 후보곡 제안과 가불 응답을 할 수 있어요.',
  applyDeadline: (when: string) => `신청 마감 ${when}`,
  applied: '참여 신청했어요',
  // 4-2
  withdrawTitle: '참여를 철회할까요?',
  withdrawImpact:
    '팀원·연주자에서 빠지고, 내 투표·가불·가능 시간은 집계에서 빠져요.',
  successorLabel: (team: string) => `${team} 후임 팀장`,
  successorPick: '선택해 주세요',
  successorRequired: '*후임 팀장을 골라 주세요.',
  withdrawn: '참여를 철회했어요',
  cancel: '취소',
  confirm: '확인',
  // PMEM-001
  membersTitle: '참여자',
  tabApproved: (n: number) => `참여 확정 ${n}`,
  tabApplied: (n: number) => `참여 희망 ${n}`,
  tabRejected: (n: number) => `거절·철회 ${n}`,
  searchPlaceholder: '이름으로 찾기',
  emptyMembers: '아직 참여자가 없어요',
  playedSongs: (n: number) => `연주 ${n}곡`,
  viaApplication: '본인 신청',
  viaTeam: '팀 신청 포함',
  withTeamHint: '팀 승인 시 함께 확정돼요',
  approve: '승인',
  reject: '거절',
  rowMenu: '더 보기',
  release: '참여 해제',
  selectAll: '전체 선택',
  selectRow: (name: string) => `${name} 선택`,
  bulkApprove: '일괄 승인',
  bulkReject: '일괄 거절',
  selectedCount: (n: number) => `${n}명 선택`,
  bulkResult: (ok: number, failed: number) => `${ok}명 처리, ${failed}명 실패`,
  bulkResultTitle: '일괄 처리 결과',
  assignButton: '참여자 지정',
  approved: '승인했어요',
  rejected: '거절했어요',
  lockedReasonTitle: '사유를 입력해 주세요',
  lockedReasonHint: '확정된 공연의 참여 변경은 사유를 남겨요.',
  // 3-1
  releaseTitle: (name: string) => `${name}님을 참여자에서 뺄까요?`,
  releaseBody: '팀원·연주자에서 빠지고 투표·가불·가능 시간은 집계에서 빠져요.',
  reasonLabel: '사유',
  released: '참여를 해제했어요',
  songWithoutPlayer: (n: number) =>
    `연주자가 없어지는 곡이 ${n}개 있어요. 연주자를 먼저 바꿔 주세요.`,
  // 4-1 assign
  assignTitle: '참여자 지정',
  assignSearch: '이름으로 찾기',
  assignEmpty: '조건에 맞는 멤버가 없어요',
  assignAlready: '참여 중',
  assignSubmit: '지정',
  assignCount: (n: number) => `${n}명 선택`,
  assigned: (n: number) => `${n}명을 참여자로 지정했어요`,
  // CLUB-102 4-3
  bulkAssign: '공연에 추가',
  bulkAssignTitle: '공연에 참여자로 추가',
  bulkAssignHint:
    '선택한 멤버를 참여 확정(APPROVED) 상태로 추가해요. 이미 참여자인 멤버는 건너뛰어요.',
  bulkAssignAdd: '추가',
  noAssignable: '추가할 수 있는 공연이 없어요',
  bulkAssignDone: (n: number, skipped: number) =>
    skipped > 0
      ? `${n}명을 추가했어요 (${skipped}명은 이미 참여 중)`
      : `${n}명을 추가했어요`,
} as const

function withDeadline(label: string, deadline: string | null) {
  return deadline === null ? label : `${label} ~${deadlineShort(deadline)}`
}

/** ISO-8601 (+09:00) -> "MM.DD" as written in the spec example ("가능 시간 ~10.15"). */
function deadlineShort(iso: string) {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`
}

/** Preset names known from PERF-002; an unknown value is shown as it is. */
export const PRESET_LABEL: Record<string, string> = {
  TEAM_FIRST: '팀 먼저',
}

/** `failed.reason` of API-144. */
export const DECISION_FAIL_REASON: Record<string, string> = {
  NOT_APPLIED: '참여 희망 상태가 아니에요',
}
