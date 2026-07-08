package budget

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the budget module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	store       budgetStore
	authz       Authorizer
	requireAuth httpx.Middleware
	costReader  TripCostReader
}

// New constructs the budget module wired to the database pool, auth middleware,
// authorizer, and trip cost reader. The Authorizer and TripCostReader are
// consumer-side interfaces; the composition root passes concrete adapters so
// the budget module never imports trip or sharing.
func New(pool *pgxpool.Pool, requireAuth httpx.Middleware, authz Authorizer, costReader TripCostReader) *Module {
	return &Module{
		store:       &pgxBudgetStore{pool: pool},
		authz:       authz,
		requireAuth: requireAuth,
		costReader:  costReader,
	}
}

// RegisterRoutes mounts the budget module's HTTP routes onto mux.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	// Trip-level budget line: PUT /trips/{tripID}/budget-lines
	mux.Handle("PUT /trips/{tripID}/budget-lines",
		m.requireAuth(http.HandlerFunc(m.handleSetTripBudgetLine)))

	// Per-day budget line: PUT /trips/{tripID}/days/{dayID}/budget-lines
	mux.Handle("PUT /trips/{tripID}/days/{dayID}/budget-lines",
		m.requireAuth(http.HandlerFunc(m.handleSetDayBudgetLine)))

	// Cost entries: GET / POST / PATCH / DELETE
	mux.Handle("GET /trips/{tripID}/cost-entries",
		m.requireAuth(http.HandlerFunc(m.handleListCostEntries)))
	mux.Handle("POST /trips/{tripID}/cost-entries",
		m.requireAuth(http.HandlerFunc(m.handleCreateCostEntry)))
	mux.Handle("PATCH /trips/{tripID}/cost-entries/{entryID}",
		m.requireAuth(http.HandlerFunc(m.handleUpdateCostEntry)))
	mux.Handle("DELETE /trips/{tripID}/cost-entries/{entryID}",
		m.requireAuth(http.HandlerFunc(m.handleDeleteCostEntry)))

	// Roll-up: GET /trips/{tripID}/budget/rollup
	mux.Handle("GET /trips/{tripID}/budget/rollup",
		m.requireAuth(http.HandlerFunc(m.handleGetRollup)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
