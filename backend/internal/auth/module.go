package auth

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the auth module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	provider IdentityProvider
}

// New constructs the auth module wired to a Google OIDC provider built from
// cfg. Callers depend only on the IdentityProvider interface; the concrete
// GoogleProvider is an internal detail (PRD §7.0).
func New(cfg config.Config) *Module {
	return &Module{
		provider: NewGoogleProvider(GoogleConfig{
			ClientID:     cfg.OAuthClientID,
			ClientSecret: cfg.OAuthClientSecret,
			RedirectURI:  cfg.OAuthRedirectURI,
		}),
	}
}

// RegisterRoutes mounts the auth module's HTTP routes onto mux.
// Sign-in endpoints (/auth/login, /auth/callback) are added in S2 and S3.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
