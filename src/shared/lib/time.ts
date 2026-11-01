const KST = 'Asia/Seoul'

/** ISO-8601 -> "MM.DD HH:mm" in KST (e.g. deadline badge). */
export function formatKstShort(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}.${get('day')} ${get('hour')}:${get('minute')}`
}

/** ISO-8601 -> "MM.DD(요일)" in KST (e.g. "10.31(토)"). */
export function formatKstDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}.${get('day')}(${get('weekday')})`
}
