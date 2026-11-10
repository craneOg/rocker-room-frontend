import { mmdd, mmddWeekday } from './availabilityTime'

// AVAIL-001 / AVAIL-002 copy (screen spec 2026.10). Lines marked "assumed" are not in the spec.
export const AVAIL_COPY = {
  // AVAIL-001
  title: '합주 가능 시간',
  season: (start: string, end: string) =>
    `합주 시즌 ${mmddWeekday(start)} ~ ${mmddWeekday(end)}`,
  deadline: (text: string) => `마감 ${text}`,
  guide: "합주할 수 있는 시간을 칠해 주세요. 칠하지 않은 칸은 '불가'로 봐요.",
  total: (slots: number) => `총 ${slots}칸(${slots / 2}시간)`,
  weekLabel: (monday: string, sunday: string) =>
    `${mmdd(monday)} ~ ${mmdd(sunday)}`,
  prevWeek: '이전 주',
  nextWeek: '다음 주',
  fullRange: '시간 범위',
  fullRangeOn: '00:00~24:00',
  fullRangeOff: '08:00~24:00',
  clearWeek: '이번 주 모두 지우기',
  copyPrevious: '지난주와 같게',
  repeat: '요일 반복',
  dirtyBar: '저장하지 않은 변경이 있어요',
  revert: '되돌리기',
  save: '저장',
  saved: '가능 시간을 저장했어요',
  leaveTitle: '변경을 버리고 나갈까요?',
  leaveDescription:
    '저장하려면 계속 편집한 뒤 아래 저장 버튼을 눌러 주세요. 나가면 변경한 칸이 사라져요.',
  keepEditing: '계속 편집',
  leaveDiscard: '버리고 나가기',
  repeatTitle: '요일 반복 입력',
  repeatDays: '요일',
  repeatStart: '시작 시각',
  repeatEnd: '종료 시각',
  repeatScope: '적용 범위',
  scopeWeek: '이번 주만',
  scopeSeason: '시즌 전체',
  apply: '적용',
  cancel: '취소',
  gridLabel: '가능 시간 입력판',
  // assumed (not in the spec)
  noSeason: '합주 시즌이 아직 정해지지 않았어요',
  notParticipant: '참여가 확정된 분만 입력할 수 있어요',
  readOnlyClosed: '입력이 마감되어 볼 수만 있어요',
  readOnlyState: '지금은 입력할 수 없는 공연이에요',
  viewTarget: '멤버 보기',
  mineOption: '내 가능 시간',
  memberReadOnly: (name: string) => `${name}님의 가능 시간이에요 (보기 전용)`,
  outsideSeason: '합주 시즌 밖의 날짜는 입력할 수 없어요',
  checkInput: '* 입력한 내용을 확인해 주세요',

  // AVAIL-002
  commonTitle: '공통 가능 시간',
  target: '대상',
  teamGroup: '팀',
  songGroup: '곡 연주자',
  allOption: '전체 참여자',
  responded: (total: number, done: number) =>
    `대상 ${total}명 중 ${done}명 입력`,
  missingNames: '미입력자',
  minCount: 'n명 이상만 보기',
  allOnly: '모두 가능한 칸만',
  legend: '가능 인원 비율',
  tooltip: (n: number) => `${n}명 가능`,
  detailTitle: (day: string, from: string, to: string) =>
    `${mmddWeekday(day)} ${from}~${to}`,
  available: '가능',
  unavailable: '불가·미입력',
  makeSchedule: '이 시간으로 일정 만들기',
  noOne: '없음',
  // assumed
  noTarget: '볼 수 있는 대상이 없어요',
  targetNotAllowed: '이 대상은 볼 수 없어요',
  noParticipants: '대상 인원이 없어요',
  close: '닫기',
  cellLabel: (day: string, time: string, n: number, m: number) =>
    `${day} ${time} ${n}/${m}`,
} as const
