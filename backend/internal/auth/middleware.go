package auth

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
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
		userID, issuedAt, err := m.sessions.verify(r)
		if err != nil {
			// Any failure — missing, expired, malformed, or tampered — is a 401 so
			// the client re-authenticates. The specific reason is deliberately not
			// revealed to the caller, and a client 401 is not a server error to log.
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusUnauthorized, "auth_required", "authentication required"))
			return
		}

		// Reject deactivated users — their sessions remain cryptographically valid
		// but an admin has blocked them (M08.5 S3). One SELECT on the primary key.
		if m.repo != nil {
			active, err := m.repo.IsActive(r.Context(), userID)
			if err != nil {
				platformlog.FromContext(r.Context()).Error("checking user active", "err", err.Error())
				httpx.WriteError(w, r, httpx.NewAPIError(
					http.StatusInternalServerError, "server_error", "could not verify session"))
				return
			}
			if !active {
				httpx.WriteError(w, r, httpx.NewAPIError(
					http.StatusUnauthorized, "auth_required", "authentication required"))
				return
			}
		}

		// Slide an aging-but-valid session forward so active use never hits a hard
		// expiry mid-trip (S4). Best-effort; runs before the handler so the
		// Set-Cookie lands on the response.
		m.sessions.refreshIfStale(w, userID, issuedAt)

		ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: userID})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAdmin wraps RequireAuth and additionally enforces that the signed-in
// user has is_admin=true. Non-admins receive 403; anonymous users receive 401
// from the inner RequireAuth. It is the gate for all /admin/* endpoints (M08.5).
func (m *Module) RequireAdmin(next http.Handler) http.Handler {
	return m.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := authn.FromContext(r.Context())
		if !ok {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusUnauthorized, "auth_required", "authentication required"))
			return
		}
		user, err := m.users.GetByID(r.Context(), p.UserID)
		if err != nil {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusUnauthorized, "auth_required", "authentication required"))
			return
		}
		if !user.IsAdmin {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusForbidden, "forbidden", "admin access required"))
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// Compile-time check that RequireAuth satisfies the shared middleware contract,
// so the composition root can hand it to other modules as an httpx.Middleware.
var _ httpx.Middleware = (*Module)(nil).RequireAuth
