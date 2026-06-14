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
	}
}

// RegisterRoutes mounts the auth module's HTTP routes onto mux. The callback
// endpoint (GET /auth/callback) is added in S3.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET "+LoginPath, m.handleLogin)
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
