// SET-001 copy (screen spec 2026.10).
export const SETLIST_COPY = {
  title: '세트리스트',
  summary: (selected: number, placed: number) =>
    `선정 ${selected}곡 · 배치 ${placed}곡`,
  confirmedBadge: '확정된 세트리스트',
  showPlayers: '연주자 보기',
  empty: '아직 세트리스트가 없어요',
  noPlayers: '연주자가 아직 없어요',
  streak: (names: string[]) => `${names.join(' · ')} 연속 출연`,
  mine: '내가 연주하는 곡',
  unplacedTitle: '순서 미배정 선정곡',
  unplacedNeeded: (n: number) => `확정 전 배치 필요 ${n}곡`,
  addToSetlist: '세트리스트에 넣기',
  edit: '순서 편집',
  cancel: '취소',
  save: '저장',
  remove: '빼기',
  moveUp: '위로',
  moveDown: '아래로',
  saved: '순서를 저장했어요',
  reasonTitle: '변경 사유를 입력해 주세요',
  reasonDescription: '확정된 세트리스트의 순서를 바꾸는 사유가 기록돼요.',
  leaveTitle: '순서 변경을 저장하지 않고 나갈까요?',
  keepEditing: '계속 편집',
  leave: '나가기',
  changedTitle: '선정곡 변경 알림',
  changedDescription:
    '그사이 선정곡이 바뀌었어요. 최신 목록을 불러올게요. 편집한 순서는 다시 맞춰 주세요.',
  confirm: '확인',
  // Not in the screen spec (assumed): the way on to PERF-005 for the final confirmation.
  toLock: '공연 확정하러 가기',
  lockHint: '모든 선정곡을 배치한 뒤 공연 상태 변경에서 확정해요.',
} as const
