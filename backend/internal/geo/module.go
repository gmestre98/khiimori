package geo

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the geo module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	provider    MapProvider
	geocoder    Geocoder // may be a caching wrapper around provider (Epic 02 S2)
	requireAuth httpx.Middleware
}

// New constructs the geo module. provider is the server-side map proxy; it must
// be non-nil for the geocode and route-hints endpoints to function (they return
// 503 when it is nil). requireAuth gates all geo endpoints behind authentication.
//
// geocoder, when non-nil, is used for geocoding instead of provider directly —
// this allows a caching layer (Epic 02 S2) to be injected without changing the
// handler. When nil, provider is used as the geocoder.
func New(provider MapProvider, geocoder Geocoder, requireAuth httpx.Middleware) *Module {
	gc := geocoder
	if gc == nil {
		gc = provider
	}
	return &Module{
		provider:    provider,
		geocoder:    gc,
		requireAuth: requireAuth,
	}
}

// RegisterRoutes mounts the geo module's HTTP routes onto mux.
//
//	GET  /geo/geocode              — proxy: resolve location → LatLng
//	GET  /geo/autocomplete         — proxy: place predictions for a partial input
//	POST /geo/route-hints          — proxy: return ordered waypoints
//	GET  /geo/static-map           — proxy: return a PNG map image (no client key)
//	POST /geo/day-route            — geocode ordered locations + return route hints
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /geo/geocode",
		m.requireAuth(http.HandlerFunc(m.handleGeocode)))
	mux.Handle("GET /geo/autocomplete",
		m.requireAuth(http.HandlerFunc(m.handleAutocomplete)))
	mux.Handle("POST /geo/route-hints",
		m.requireAuth(http.HandlerFunc(m.handleRouteHints)))
	mux.Handle("GET /geo/static-map",
		m.requireAuth(http.HandlerFunc(m.handleStaticMap)))
	mux.Handle("POST /geo/day-route",
		m.requireAuth(http.HandlerFunc(m.handleDayRoute)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
