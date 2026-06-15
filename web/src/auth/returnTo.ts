// Where to send the user after sign-in. Sign-in is a full-page OAuth redirect
// that leaves the SPA, so the intended destination can't live in React state or
// router history — it is stashed in sessionStorage (survives the round trip in
// the same tab) and consumed once when the app comes back authenticated.

const RETURN_TO_KEY = 'khiimori:returnTo'

// setReturnTo records the path an anonymous user was trying to reach, so the app
// can return them there after they sign in. Best-effort: a disabled/again-full
// sessionStorage simply means we fall back to the default landing.
export function setReturnTo(path: string): void {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path)
  } catch {
    // ignore — return-to is a convenience, not load-bearing
  }
}

// takeReturnTo reads and clears the stored destination. Returns null when none
// was set (the normal sign-in-from-scratch case).
export function takeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
    return path
  } catch {
    return null
  }
}
