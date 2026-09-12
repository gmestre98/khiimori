package packing

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the packing module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	store       packingStore
	authz       Authorizer
	requireAuth httpx.Middleware
}

// New constructs the packing module wired to the database pool, auth middleware,
// and authorizer. The Authorizer is a consumer-side interface; the composition
// root passes a concrete adapter so the packing module never imports trip or
// sharing.
func New(pool *pgxpool.Pool, requireAuth httpx.Middleware, authz Authorizer) *Module {
	return &Module{
		store:       &pgxPackingStore{pool: pool},
		authz:       authz,
		requireAuth: requireAuth,
	}
}

// RegisterRoutes mounts the packing module's HTTP routes onto mux.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	// Trip-scoped packing list.
	mux.Handle("GET /trips/{tripID}/packing",
		m.requireAuth(http.HandlerFunc(m.handleListItems)))
	mux.Handle("POST /trips/{tripID}/packing",
		m.requireAuth(http.HandlerFunc(m.handleCreateItem)))
	mux.Handle("PATCH /trips/{tripID}/packing/{itemID}",
		m.requireAuth(http.HandlerFunc(m.handleUpdateItem)))
	mux.Handle("DELETE /trips/{tripID}/packing/{itemID}",
		m.requireAuth(http.HandlerFunc(m.handleDeleteItem)))

	// Copy a saved template into the trip's list.
	mux.Handle("POST /trips/{tripID}/packing/apply-template",
		m.requireAuth(http.HandlerFunc(m.handleApplyTemplate)))

	// User-scoped reusable templates.
	mux.Handle("GET /packing/templates",
		m.requireAuth(http.HandlerFunc(m.handleListTemplates)))
	mux.Handle("POST /packing/templates",
		m.requireAuth(http.HandlerFunc(m.handleCreateTemplate)))
	mux.Handle("GET /packing/templates/{templateID}",
		m.requireAuth(http.HandlerFunc(m.handleGetTemplate)))
	mux.Handle("DELETE /packing/templates/{templateID}",
		m.requireAuth(http.HandlerFunc(m.handleDeleteTemplate)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
