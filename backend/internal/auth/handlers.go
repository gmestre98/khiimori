package auth

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// Route paths for the OAuth sign-in flow. LoginPath begins a sign-in;
// CallbackPath (handled in S3) receives Google's redirect.
const (
	LoginPath    = "/auth/login"
	CallbackPath = "/auth/callback"
	// SessionPath is the authenticated session-check ("who am I") endpoint, behind
	// RequireAuth; the web app (Epic 05) calls it to learn whether a session is
	// live and for which user.
	SessionPath = "/auth/session"
	// LogoutPath signs the user out by clearing the session cookie. POST (a
	// state-changing action) and public, so it can clear a stale/expired cookie
	// too.
	LogoutPath = "/auth/logout"
	// TestLoginPath is the guarded E2E test-login endpoint (M10.1). It is only
	// registered when E2E_LOGIN_SECRET is configured, and the caller must present
	// that secret; it then mints a session for a fixed non-admin test identity so
	// the end-to-end harness can authenticate against a deployed environment
	// without the interactive Google flow.
	TestLoginPath = "/auth/test-login"
)

// The default identity the test-login endpoint signs in. It is deterministic (so
// reruns resolve to the same provisioned user) and non-admin (its email never
// matches ADMIN_EMAIL), keeping the E2E account inside ordinary trip-scoped
// authorization. The .test TLD (RFC 6761) is reserved and can never be a real
// Google account.
const (
	e2eTestGoogleSub = "e2e-test-user"
	e2eTestEmail     = "e2e@khiimori.test"
	e2eTestName      = "E2E Test User"
	// e2eLoginSecretHeader carries the shared secret the harness presents.
	e2eLoginSecretHeader = "X-E2E-Login-Secret"
	// e2eIdentityParam names the optional query parameter selecting which fixed
	// identity to sign in (defaults to "owner"). See e2eTestIdentities.
	e2eIdentityParam = "identity"
	// defaultTestIdentity is used when no identity parameter is supplied, so the
	// M10.1 single-identity behaviour (sign in the fixed owner) is preserved.
	defaultTestIdentity = "owner"
)

// e2eTestIdentity is one of the fixed, non-admin identities the guarded
// test-login endpoint can sign in. Each is deterministic (reruns resolve to the
// same provisioned user) and uses the reserved .test TLD so it can never match a
// real Google account or ADMIN_EMAIL.
type e2eTestIdentity struct {
	GoogleSub string
	Email     string
	Name      string
}

// e2eTestIdentities is the allowlist the test-login endpoint selects from via the
// optional `identity` query parameter. "owner" preserves the M10.1 behaviour; the
// others let the E2E harness set up a multi-role trip (M10.2): an owner invites an
// Editor and a Viewer, while the non-member is never invited — proving role-based
// enforcement (Editor edits, Viewer read-only, non-member denied) end to end.
var e2eTestIdentities = map[string]e2eTestIdentity{
	defaultTestIdentity: {GoogleSub: e2eTestGoogleSub, Email: e2eTestEmail, Name: e2eTestName},
	"editor":            {GoogleSub: "e2e-test-editor", Email: "e2e-editor@khiimori.test", Name: "E2E Editor"},
	"viewer":            {GoogleSub: "e2e-test-viewer", Email: "e2e-viewer@khiimori.test", Name: "E2E Viewer"},
	"nonmember":         {GoogleSub: "e2e-test-nonmember", Email: "e2e-nonmember@khiimori.test", Name: "E2E Non-Member"},
}

// exchangeTimeout bounds the callback's outbound calls to Google (token
// exchange plus, on first sign-in, OIDC discovery + JWKS) so a slow or hanging
// endpoint can't tie up the handler — the default HTTP client has no timeout.
const exchangeTimeout = 15 * time.Second

// handleLogin begins the authorization-code flow: it mints a fresh state +
// nonce (persisted in the signed cookie), then redirects the browser to
// Google's consent screen. A GET, since it is a top-level browser navigation.
func (m *Module) handleLogin(w http.ResponseWriter, r *http.Request) {
	// Fail clearly when OAuth is not configured rather than redirecting to a
	// malformed consent URL (the call-time check promised by config).
	if !m.configured {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusServiceUnavailable, "auth_unconfigured", "sign-in is not configured"))
		return
	}

	state, nonce, err := m.stateStore.issue(w)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("issuing oauth state", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "auth_state_error", "could not start sign-in"))
		return
	}

	// This response carries the signed state cookie; keep it out of any cache so
	// the cookie + redirect can't be replayed from a browser or intermediary.
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, m.provider.AuthCodeURL(state, nonce), http.StatusFound)
}

// handleCallback completes the authorization-code flow: it verifies the state
// against the signed cookie, exchanges the code, validates the ID token, and
// hands the resulting verified identity to the sign-in seam (provisioning +
// session, Epics 02/03). Any verification failure rejects the request without
// creating a session or user.
func (m *Module) handleCallback(w http.ResponseWriter, r *http.Request) {
	if !m.configured {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusServiceUnavailable, "auth_unconfigured", "sign-in is not configured"))
		return
	}

	// Responses here may carry a session; never cache them.
	w.Header().Set("Cache-Control", "no-store")

	q := r.URL.Query()

	// Google reports a declined/!errored consent via the `error` parameter.
	if e := q.Get("error"); e != "" {
		m.failSignIn(w, r, http.StatusUnauthorized, "auth_denied", "sign-in was not completed")
		return
	}

	state, code := q.Get("state"), q.Get("code")
	if state == "" || code == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "auth_invalid_callback", "missing code or state"))
		return
	}

	// Verify the state and recover the bound nonce, then clear the single-use
	// cookie regardless of outcome.
	nonce, err := m.stateStore.verify(r, state)
	m.stateStore.clear(w)
	if err != nil {
		// A state failure is a CSRF/replay signal — reject without exchanging.
		m.failSignIn(w, r, http.StatusUnauthorized, "auth_state_invalid", "invalid sign-in state")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), exchangeTimeout)
	defer cancel()
	identity, err := m.provider.Exchange(ctx, code, nonce)
	if err != nil {
		// Log only the failure reason, never the code or tokens. Exchange errors
		// are wrapped oauth2/oidc failures (Google's error responses) that don't
		// carry the code, tokens, or client secret, so they are safe to log (S5).
		platformlog.FromContext(r.Context()).Error("oauth callback exchange", "err", err.Error())
		m.failSignIn(w, r, http.StatusUnauthorized, "auth_exchange_failed", "could not complete sign-in")
		return
	}

	// Hand off to provisioning (Epic 02) + session issuance (Epic 03).
	m.onVerified(w, r, identity)
}

// handleSession answers the authenticated session-check: it returns the current
// user's id. It runs behind RequireAuth, so reaching it means the session is
// valid and a principal is attached; the !ok branch is defensive only.
func (m *Module) handleSession(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	// A session check must never be cached — the answer is per-request identity.
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"user_id": p.UserID})
}

// handleLogout signs the user out by clearing the session cookie. The session is
// stateless (a signed cookie, no server-side store), so sign-out is client-side:
// expiring the cookie means the browser stops sending it, and the auth
// middleware then rejects the request as unauthenticated. It is public and
// idempotent — clearing an already-absent cookie is harmless — so a stale or
// expired session can always be cleared. (A captured cookie would remain valid
// until expiry; v1 has no server-side revocation list — see docs/sessions.md.)
func (m *Module) handleLogout(w http.ResponseWriter, r *http.Request) {
	m.sessions.clear(w)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"signed_out"}`))
}

// handleTestLogin mints a session for the fixed E2E test identity (M10.1). It is
// only reachable when E2E_LOGIN_SECRET is configured (the route is otherwise
// unregistered), and the caller must present that exact secret in the
// X-E2E-Login-Secret header — compared in constant time so a wrong secret leaks
// no timing signal. On success it provisions (or resolves) the deterministic test
// user and issues the same signed session cookie the real OAuth flow does, then
// acknowledges as JSON (never a redirect) so the harness can capture the cookie
// directly. Unlike the Google callback, this never touches an external provider.
func (m *Module) handleTestLogin(w http.ResponseWriter, r *http.Request) {
	// Defence in depth: the route is registered only when the secret is set, but
	// re-check here so the handler can never mint a session with an empty secret.
	if m.e2eLoginSecret == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusNotFound, "not_found", "not found"))
		return
	}

	// Constant-time compare so the secret can't be guessed by timing. A mismatch
	// (or missing header) is rejected without provisioning or a session; the
	// presented value is never logged.
	presented := r.Header.Get(e2eLoginSecretHeader)
	if subtle.ConstantTimeCompare([]byte(presented), []byte(m.e2eLoginSecret)) != 1 {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "invalid test-login secret"))
		return
	}

	// Select the fixed identity to sign in. The default ("owner") preserves the
	// M10.1 single-identity behaviour; the harness passes ?identity=editor|viewer|
	// nonmember to set up the multi-role trip (M10.2). An unknown value is a client
	// error rather than a silent fallback, so a typo in a test surfaces clearly.
	identityKey := r.URL.Query().Get(e2eIdentityParam)
	if identityKey == "" {
		identityKey = defaultTestIdentity
	}
	identity, ok := e2eTestIdentities[identityKey]
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "bad_request", "unknown test identity"))
		return
	}

	// A session may be issued on this response; never cache it.
	w.Header().Set("Cache-Control", "no-store")

	// Provision (or resolve on rerun) the selected test user, exactly as the real
	// callback does via completeSignIn — same code path, minus the Google
	// exchange. EmailVerified is true so provisioning is well-formed, but the
	// email never matches ADMIN_EMAIL, so the account stays non-admin.
	user, err := m.provisioner.Provision(r.Context(), VerifiedIdentity{
		GoogleSub:     identity.GoogleSub,
		Email:         identity.Email,
		EmailVerified: true,
		Name:          identity.Name,
	})
	if err != nil {
		platformlog.FromContext(r.Context()).Error("test-login provisioning", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "auth_provision_failed", "could not complete test sign-in"))
		return
	}

	if err := m.sessions.issue(w, user.ID); err != nil {
		platformlog.FromContext(r.Context()).Error("test-login session", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "auth_session_failed", "could not complete test sign-in"))
		return
	}

	// Acknowledge as JSON (not a redirect) so the harness reads the cookie off
	// this response. The user id lets the harness scope/clean up its test data;
	// the email lets the owner invite this identity by the address it will accept
	// invitations under (M10.2 role setup).
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status": "signed_in", "user_id": user.ID, "email": identity.Email,
	})
}
