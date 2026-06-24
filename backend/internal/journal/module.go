package journal

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the journal module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	store       journalStore
	authz       Authorizer
	requireAuth httpx.Middleware
}

// New constructs the journal module wired to the database pool, auth middleware,
// and authorizer. The Authorizer is a consumer-side interface; the composition
// root passes a concrete adapter so the journal module never imports trip or
// sharing.
func New(pool *pgxpool.Pool, requireAuth httpx.Middleware, authz Authorizer) *Module {
	return &Module{
		store:       &pgxJournalStore{pool: pool},
		authz:       authz,
		requireAuth: requireAuth,
	}
}

// RegisterRoutes mounts the journal module's HTTP routes onto mux.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	// Idempotent upsert (auto-save): PUT /trips/{tripID}/days/{dayID}/journal
	mux.Handle("PUT /trips/{tripID}/days/{dayID}/journal",
		m.requireAuth(http.HandlerFunc(m.handleUpsertEntry)))

	// Fetch the day's entry: GET /trips/{tripID}/days/{dayID}/journal
	mux.Handle("GET /trips/{tripID}/days/{dayID}/journal",
		m.requireAuth(http.HandlerFunc(m.handleGetEntry)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
