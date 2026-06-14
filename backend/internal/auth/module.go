package auth

import (
	"net/http"

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
	// sessions issues and validates the authenticated session cookie (Epic 03):
	// completeSignIn mints one, and the auth middleware validates it.
	sessions *sessionManager
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
	m := &Module{
		provider:    NewGoogleProvider(gcfg),
		stateStore:  newOAuthStateStore(deriveStateKey(gcfg.ClientSecret), secure),
		configured:  gcfg.ClientID != "" && gcfg.ClientSecret != "" && gcfg.RedirectURI != "",
		provisioner: &Provisioner{repo: &pgxUserRepo{pool: pool}, adminEmail: cfg.AdminEmail},
		sessions:    newSessionManager([]byte(cfg.SessionSecret), secure, sessionTTL),
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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"signed_in"}`))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
