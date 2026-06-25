package geo

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the geo module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	provider    MapProvider
	requireAuth httpx.Middleware
}

// New constructs the geo module. provider is the server-side map proxy; it must
// be non-nil for the geocode and route-hints endpoints to function (they return
// 503 when it is nil). requireAuth gates all geo endpoints behind authentication.
func New(provider MapProvider, requireAuth httpx.Middleware) *Module {
	return &Module{
		provider:    provider,
		requireAuth: requireAuth,
	}
}

// RegisterRoutes mounts the geo module's HTTP routes onto mux.
//
//	GET  /geo/geocode              — proxy: resolve location → LatLng
//	POST /geo/route-hints          — proxy: return ordered waypoints
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /geo/geocode",
		m.requireAuth(http.HandlerFunc(m.handleGeocode)))
	mux.Handle("POST /geo/route-hints",
		m.requireAuth(http.HandlerFunc(m.handleRouteHints)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
