package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// Route paths for the OAuth sign-in flow. LoginPath begins a sign-in;
// CallbackPath (handled in S3) receives Google's redirect.
const (
	LoginPath    = "/auth/login"
	CallbackPath = "/auth/callback"
)

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
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_denied", "sign-in was not completed"))
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
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_state_invalid", "invalid sign-in state"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), exchangeTimeout)
	defer cancel()
	identity, err := m.provider.Exchange(ctx, code, nonce)
	if err != nil {
		// Do not log the code or token; the provider redacts and we log only the
		// failure reason text (no sensitive values, per S5).
		platformlog.FromContext(r.Context()).Error("oauth callback exchange", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_exchange_failed", "could not complete sign-in"))
		return
	}

	// Hand off to provisioning (Epic 02) + session issuance (Epic 03).
	m.onVerified(w, r, identity)
}
