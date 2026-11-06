// HOME-001 copy (screen spec 2026.10, section 2).
export const HOME_COPY = {
  clubInactive: '이 동아리는 비활성 상태입니다. 열람만 가능합니다.',
  graduated:
    '졸업 상태에서는 공연 참여를 직접 신청할 수 없어요. 임원이 참여자로 지정할 수 있어요.',
  finishDue: (name: string) => `${name} 공연일이 지났어요. 종료 처리할까요?`,
  finish: '종료하기',
  moreBanners: (n: number) => `외 ${n}건`,
  todos: '내 할 일',
  todosEmpty: '지금 할 일이 없어요',
  deadline: (when: string) => `마감 ${when}`,
  upcoming: '다가오는 내 일정',
  upcomingEmpty: '예정된 합주가 없어요',
  viewAll: '전체 보기',
  myPerformances: '내 공연',
  myPerformancesEmpty: '참여 중인 공연이 없어요',
  viewPerformances: '공연 보기',
  teams: (names: string[]) =>
    names.length > 1 ? `${names[0]} 외 ${names.length - 1}` : (names[0] ?? ''),
  songs: (n: number) => `연주 ${n}곡`,
  adminNoticeTitle: '임원 권한을 넘겨받았어요',
  adminNoticeBody: (club: string, name: string) =>
    `${club}의 임원 권한이 ${name}님께 넘어왔어요. 멤버 관리와 공연 운영을 할 수 있어요.`,
  leaderNoticeTitle: '팀장을 넘겨받았어요',
  leaderNoticeBody: (performance: string, team: string, name: string) =>
    `${performance}의 ${team} 팀장이 ${name}님으로 바뀌었어요.`,
  noticeConfirm: '확인',
  noticeGoMembers: '멤버 관리로 이동',
} as const
