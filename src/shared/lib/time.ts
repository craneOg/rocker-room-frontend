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

/** ISO-8601 -> "YYYY.MM.DD" in KST (e.g. "2026.09.01"). */
export function formatKstYmd(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}.${get('month')}.${get('day')}`
}

/** ISO-8601 -> "HH:mm" in KST. */
export function formatKstTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('hour')}:${get('minute')}`
}

/** "D-3" / "D-Day" / "D+2" for a KST calendar date ("YYYY-MM-DD") counted from `now`. */
export function formatDDay(date: string, now: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: KST }).format(now)
  const days = Math.round(
    (Date.parse(`${date}T00:00:00+09:00`) -
      Date.parse(`${today}T00:00:00+09:00`)) /
      86_400_000,
  )
  return days === 0 ? 'D-Day' : days > 0 ? `D-${days}` : `D+${-days}`
}
