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
	m := &Module{
		provider:    NewGoogleProvider(gcfg),
		stateStore:  newOAuthStateStore(deriveStateKey(gcfg.ClientSecret), cfg.Env == config.EnvProd),
		configured:  gcfg.ClientID != "" && gcfg.ClientSecret != "" && gcfg.RedirectURI != "",
		provisioner: &Provisioner{repo: &pgxUserRepo{pool: pool}},
	}
	m.onVerified = m.completeSignIn
	return m
}

// RegisterRoutes mounts the auth module's HTTP routes onto mux: the sign-in
// start (/auth/login) and the OAuth callback (/auth/callback).
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET "+LoginPath, m.handleLogin)
	mux.HandleFunc("GET "+CallbackPath, m.handleCallback)
}

// completeSignIn finishes a verified sign-in by provisioning the user (Epic 02):
// first sign-in creates the user + empty profile, a returning sign-in resolves
// to the same row (S3). It then acknowledges success without exposing the
// identity (no PII/tokens in the body or logs). Epic 03 replaces the ack with a
// real session for the provisioned user.
func (m *Module) completeSignIn(w http.ResponseWriter, r *http.Request, id VerifiedIdentity) {
	if _, err := m.provisioner.Provision(r.Context(), id); err != nil {
		// Log a fixed reason only — the error does not carry tokens, the code, or
		// the client secret (S5 no-logging guarantee).
		platformlog.FromContext(r.Context()).Error("provisioning user", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "auth_provision_failed", "could not complete sign-in"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"signed_in"}`))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
