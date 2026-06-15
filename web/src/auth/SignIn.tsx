import { useAuth } from './AuthContext'

// signInError reads the ?auth_error= marker the backend adds when a sign-in
// fails (Epic 01 callback → Epic 05 S2), so the surface can tell the user it
// didn't complete. The specific code is not shown — a single friendly message
// covers declined consent, an expired state, and exchange failures alike.
function signInError(): boolean {
  return new URLSearchParams(window.location.search).has('auth_error')
}

// SignIn is the anonymous landing: a single Google sign-in control (no custom
// credential form — Google SSO only, PRD §5.8). Clicking it starts the OAuth
// flow via the auth context; after the round trip the app remounts authenticated.
export function SignIn() {
  const { signIn } = useAuth()

  return (
    <section className="signin">
      <h2>Sign in</h2>
      {signInError() && (
        <p role="alert" className="auth-error">
          Sign-in didn’t complete. Please try again.
        </p>
      )}
      <p className="tagline">Sign in to plan and manage your trips.</p>
      <button type="button" className="btn-primary" onClick={signIn}>
        Sign in with Google
      </button>
    </section>
  )
}
