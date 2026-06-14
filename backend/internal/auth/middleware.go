package auth

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// RequireAuth is the auth middleware: it authenticates a request by its session
// cookie, attaches the authenticated principal to the request context (read via
// authn.FromContext), and rejects an unauthenticated request with 401 without
// running the protected handler.
//
// It is the single authentication hook for the whole app. The auth module owns
// it because it holds the session-validation material; other modules receive it
// from the composition root (cmd/api) — e.g. as an httpx.Middleware — so they
// never import this module, preserving the modular-monolith boundary. It
// establishes authentication only (who you are); trip authorization (what you
// may touch) is layered on top by Milestone 08, which consumes the principal
// attached here.
//
// The signature matches httpx.Middleware (func(http.Handler) http.Handler), so
// m.RequireAuth can be dropped straight into a middleware chain or wrapped around
// a single route.
func (m *Module) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, _, err := m.sessions.verify(r)
		if err != nil {
			// Any failure — missing, expired, malformed, or tampered — is a 401 so
			// the client re-authenticates. The specific reason is deliberately not
			// revealed to the caller, and a client 401 is not a server error to log.
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusUnauthorized, "auth_required", "authentication required"))
			return
		}
		ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: userID})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Compile-time check that RequireAuth satisfies the shared middleware contract,
// so the composition root can hand it to other modules as an httpx.Middleware.
var _ httpx.Middleware = (*Module)(nil).RequireAuth
