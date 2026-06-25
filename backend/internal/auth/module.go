package auth

import (
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// Module is the auth module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	provider   IdentityProvider
	stateStore *oauthStateStore
	// configured reports whether all OAuth settings are present. When false the
	// sign-in endpoints return a clear error instead of starting a broken flow.
	configured bool
	// provisioner turns a verified identity into a persisted user (Epic 02). It
	// is invoked by the callback via onVerified.
	provisioner *Provisioner
	// users reads/updates the profile row for the profile endpoints (Epic 04). It
	// is the same store the provisioner writes through.
	users profileStore
	// repo is the full user repo (superset of profileStore). Used by RequireAuth
	// to check the active flag (M08.5) and by the admin handlers to list/deactivate
	// users. nil in tests that only stub profileStore.
	repo userRepo
	// sessions issues and validates the authenticated session cookie (Epic 03):
	// completeSignIn mints one, and the auth middleware validates it.
	sessions *sessionManager
	// webAppURL, when set, is where the OAuth callback redirects the browser back
	// to after sign-in (Epic 05): success → the app, failure → ?auth_error=. Empty
	// falls back to a JSON acknowledgement (a backend running without the web app).
	webAppURL string
	// onVerified consumes a verified identity after a successful callback. The
	// default is completeSignIn (provision the user); session issuance (Epic 03)
	// extends it. Kept as a field so tests can substitute a capturing stub.
	onVerified func(http.ResponseWriter, *http.Request, VerifiedIdentity)
}

// New constructs the auth module wired to a Google OIDC provider built from
// cfg, provisioning users into the given database pool. Callers depend only on
// the IdentityProvider interface; the concrete GoogleProvider is an internal
// detail (PRD §7.0). The state cookie is Secure in production and signed with a
// key derived from the OAuth client secret.
func New(cfg config.Config, pool *pgxpool.Pool) *Module {
	gcfg := GoogleConfig{
		ClientID:     cfg.OAuthClientID,
		ClientSecret: cfg.OAuthClientSecret,
		RedirectURI:  cfg.OAuthRedirectURI,
	}
	secure := cfg.Env == config.EnvProd
	repo := &pgxUserRepo{pool: pool}
	m := &Module{
		provider:    NewGoogleProvider(gcfg),
		stateStore:  newOAuthStateStore(deriveStateKey(gcfg.ClientSecret), secure),
		configured:  gcfg.ClientID != "" && gcfg.ClientSecret != "" && gcfg.RedirectURI != "",
		provisioner: &Provisioner{repo: repo, adminEmail: cfg.AdminEmail},
		users:       repo,
		repo:        repo,
		sessions:    newSessionManager([]byte(cfg.SessionSecret), secure, sessionTTL),
		webAppURL:   cfg.WebAppURL,
	}
	m.onVerified = m.completeSignIn
	return m
}

// RegisterRoutes mounts the auth module's HTTP routes onto mux: the sign-in
// start (/auth/login) and the OAuth callback (/auth/callback).
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET "+LoginPath, m.handleLogin)
	mux.HandleFunc("GET "+CallbackPath, m.handleCallback)
	// The session-check is the first route behind the auth middleware; protected
	// routes in later modules wrap with RequireAuth the same way.
	mux.Handle("GET "+SessionPath, m.RequireAuth(http.HandlerFunc(m.handleSession)))
	// Sign-out is public so it can clear a stale/expired cookie too.
	mux.HandleFunc("POST "+LogoutPath, m.handleLogout)
	// Profile read + edit (Epic 04), behind the auth middleware — always the
	// session user's own row.
	mux.Handle("GET "+ProfilePath, m.RequireAuth(http.HandlerFunc(m.handleProfileRead)))
	mux.Handle("PATCH "+ProfilePath, m.RequireAuth(http.HandlerFunc(m.handleProfileUpdate)))

	// Admin backoffice (M08.5) — gated by RequireAdmin (is_admin, server-side).
	m.mountAdminRoutes(mux, m.RequireAdmin)
}

// completeSignIn finishes a verified sign-in: it provisions the user (Epic 02) —
// first sign-in creates the user + empty profile, a returning sign-in resolves
// to the same row — then issues an authenticated session cookie for that user
// (Epic 03) and acknowledges. The identity is never exposed in the body or logs.
func (m *Module) completeSignIn(w http.ResponseWriter, r *http.Request, id VerifiedIdentity) {
	user, err := m.provisioner.Provision(r.Context(), id)
	if err != nil {
		// Log a fixed reason only — the error does not carry tokens, the code, or
		// the client secret (S5 no-logging guarantee).
		platformlog.FromContext(r.Context()).Error("provisioning user", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "auth_provision_failed", "could not complete sign-in"))
		return
	}

	// Issue the session before writing the body so the Set-Cookie header lands on
	// the response. A missing signing key is a server misconfiguration, not a
	// client error.
	if err := m.sessions.issue(w, user.ID); err != nil {
		platformlog.FromContext(r.Context()).Error("issuing session", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "auth_session_failed", "could not complete sign-in"))
		return
	}

	// With a web app configured, the browser-driven OAuth flow lands back on the
	// app (the session cookie is already set). Without one, ack as JSON so a
	// frontend-less backend still works (and existing API callers/tests do too).
	if m.webAppURL != "" {
		http.Redirect(w, r, m.webAppURL+"/", http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"signed_in"}`))
}

// failSignIn ends a failed sign-in. In the browser flow (web app configured) it
// redirects back to the app's sign-in with an ?auth_error= marker so the user
// lands on a real page rather than a JSON error; otherwise it renders the JSON
// API error. Either way no session is created.
func (m *Module) failSignIn(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	if m.webAppURL != "" {
		http.Redirect(w, r, m.webAppURL+"/?auth_error="+url.QueryEscape(code), http.StatusFound)
		return
	}
	httpx.WriteError(w, r, httpx.NewAPIError(status, code, message))
}

// mountAdminRoutes registers the admin HTTP handlers onto mux, gated by the
// supplied middleware. The default (called by RegisterRoutes) uses RequireAdmin;
// tests may supply a shim for integration testing without a real HMAC session.
func (m *Module) mountAdminRoutes(mux *http.ServeMux, gate httpx.Middleware) {
	mux.Handle("GET "+AdminPath, gate(http.HandlerFunc(m.handleAdminInfo)))
	mux.Handle("GET "+AdminUsersPath, gate(http.HandlerFunc(m.handleAdminListUsers)))
	mux.Handle("GET "+AdminTripsPath, gate(http.HandlerFunc(m.handleAdminListTrips)))
	mux.Handle("POST "+DeactivateUserPath, gate(http.HandlerFunc(m.handleAdminDeactivateUser)))
}

// RegisterAdminRoutes mounts the admin backoffice routes with a caller-supplied
// gate middleware. Intended for integration tests that need to substitute a test
// shim for the full HMAC-session RequireAdmin.
func (m *Module) RegisterAdminRoutes(mux *http.ServeMux, gate httpx.Middleware) {
	m.mountAdminRoutes(mux, gate)
}

// IssueSessionCookie mints a valid session cookie for userID and returns it.
// Intended for integration tests that need to authenticate without the OAuth flow.
func (m *Module) IssueSessionCookie(userID string) (*http.Cookie, error) {
	if !m.sessions.configured() {
		return nil, errors.New("auth: session signing key not configured")
	}
	now := time.Now()
	value := m.sessions.sign(userID, now, now.Add(m.sessions.ttl))
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     sessionCookiePath,
		MaxAge:   int(m.sessions.ttl.Seconds()),
		HttpOnly: true,
		Secure:   m.sessions.secure,
		SameSite: m.sessions.sameSite(),
	}, nil
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
