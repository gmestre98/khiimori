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
}

// New constructs the budget module wired to the database pool, auth middleware,
// and authorizer. The Authorizer is a consumer-side interface; the composition
// root passes trip.NewOwnerOnlyAuthorizer (adapted) so the budget module never
// imports the trip module.
func New(pool *pgxpool.Pool, requireAuth httpx.Middleware, authz Authorizer) *Module {
	return &Module{
		store:       &pgxBudgetStore{pool: pool},
		authz:       authz,
		requireAuth: requireAuth,
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

	// Cost entries: POST / PATCH / DELETE
	mux.Handle("POST /trips/{tripID}/cost-entries",
		m.requireAuth(http.HandlerFunc(m.handleCreateCostEntry)))
	mux.Handle("PATCH /trips/{tripID}/cost-entries/{entryID}",
		m.requireAuth(http.HandlerFunc(m.handleUpdateCostEntry)))
	mux.Handle("DELETE /trips/{tripID}/cost-entries/{entryID}",
		m.requireAuth(http.HandlerFunc(m.handleDeleteCostEntry)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
