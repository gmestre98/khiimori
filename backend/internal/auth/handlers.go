package auth

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// Route paths for the OAuth sign-in flow. LoginPath begins a sign-in;
// CallbackPath (handled in S3) receives Google's redirect.
const (
	LoginPath    = "/auth/login"
	CallbackPath = "/auth/callback"
)

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

	http.Redirect(w, r, m.provider.AuthCodeURL(state, nonce), http.StatusFound)
}
