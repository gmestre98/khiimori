package auth

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the auth module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	provider   IdentityProvider
	stateStore *oauthStateStore
	// configured reports whether all OAuth settings are present. When false the
	// sign-in endpoints return a clear error instead of starting a broken flow.
	configured bool
	// onVerified consumes a verified identity after a successful callback —
	// user provisioning (Epic 02) and session issuance (Epic 03) plug in here.
	// Until those land it is a placeholder ack (see defaultOnVerified).
	onVerified func(http.ResponseWriter, *http.Request, VerifiedIdentity)
}

// New constructs the auth module wired to a Google OIDC provider built from
// cfg. Callers depend only on the IdentityProvider interface; the concrete
// GoogleProvider is an internal detail (PRD §7.0). The state cookie is Secure
// in production and signed with a key derived from the OAuth client secret.
func New(cfg config.Config) *Module {
	gcfg := GoogleConfig{
		ClientID:     cfg.OAuthClientID,
		ClientSecret: cfg.OAuthClientSecret,
		RedirectURI:  cfg.OAuthRedirectURI,
	}
	return &Module{
		provider:   NewGoogleProvider(gcfg),
		stateStore: newOAuthStateStore(deriveStateKey(gcfg.ClientSecret), cfg.Env == config.EnvProd),
		configured: gcfg.ClientID != "" && gcfg.ClientSecret != "" && gcfg.RedirectURI != "",
		onVerified: defaultOnVerified,
	}
}

// RegisterRoutes mounts the auth module's HTTP routes onto mux: the sign-in
// start (/auth/login) and the OAuth callback (/auth/callback).
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET "+LoginPath, m.handleLogin)
	mux.HandleFunc("GET "+CallbackPath, m.handleCallback)
}

// defaultOnVerified is the placeholder sign-in completion used until Epics 02/03
// wire user provisioning and session issuance. It acknowledges a verified
// sign-in without exposing the identity (no PII/tokens in the body or logs).
func defaultOnVerified(w http.ResponseWriter, _ *http.Request, _ VerifiedIdentity) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"signed_in"}`))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
