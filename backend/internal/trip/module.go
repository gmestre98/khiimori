package trip

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the trip module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	store tripStore
	// requireAuth is the auth middleware handed in by the composition root (the
	// auth module's RequireAuth). The trip module receives it as an
	// httpx.Middleware so it never imports the auth module — every trip route is
	// authenticated, with the owner taken from the session principal.
	requireAuth httpx.Middleware
}

// New constructs the trip module wired to the database pool, the auth middleware,
// and the sharing membership writer. memberships is the consumer-side
// OwnerMemberships interface; the composition root passes the concrete
// *sharing.Memberships, so the trip module never imports the sharing module
// (modular-monolith boundary). Day generation defaults to the Epic 01 no-op seam;
// Epic 02 supplies the real generator.
func New(pool *pgxpool.Pool, requireAuth httpx.Middleware, memberships OwnerMemberships) *Module {
	return &Module{
		store: &pgxTripStore{
			pool:        pool,
			memberships: memberships,
			days:        pgxDayRegenerator{guard: noDayData{}},
		},
		requireAuth: requireAuth,
	}
}

// RegisterRoutes mounts the trip module's HTTP routes onto mux, each behind the
// auth middleware so the caller is always an authenticated user (the trip's
// owner).
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("POST "+TripsPath, m.requireAuth(http.HandlerFunc(m.handleCreate)))
	mux.Handle("PATCH "+TripsPath+"/{id}", m.requireAuth(http.HandlerFunc(m.handleUpdate)))
	mux.Handle("POST "+TripsPath+"/{id}/archive", m.requireAuth(http.HandlerFunc(m.handleArchive)))
	mux.Handle("POST "+TripsPath+"/{id}/unarchive", m.requireAuth(http.HandlerFunc(m.handleUnarchive)))
	mux.Handle("DELETE "+TripsPath+"/{id}", m.requireAuth(http.HandlerFunc(m.handleDelete)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
