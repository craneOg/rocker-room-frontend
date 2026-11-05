// The invite link (/join/{code}) is opened before login. sessionStorage keeps the code through
// the Kakao round trip and onboarding; the screens after login send the user back to the link.
const KEY = 'pendingInviteCode'

export function readPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function savePendingInvite(code: string) {
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    // storage unavailable: the user can still type the code on CLUB-002
  }
}

export function clearPendingInvite() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

/** `/join/{code}` for a saved invite, else `fallback`. */
export const inviteOr = (fallback: string) => {
  const code = readPendingInvite()
  return code ? `/join/${encodeURIComponent(code)}` : fallback
}
