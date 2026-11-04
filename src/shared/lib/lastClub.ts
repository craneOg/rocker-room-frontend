const KEY = 'lastClubId'

export function readLastClubId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveLastClubId(clubId: string) {
  try {
    localStorage.setItem(KEY, clubId)
  } catch {
    // storage unavailable; the last club is only a convenience
  }
}
