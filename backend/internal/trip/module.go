package trip

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the trip module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	store     tripStore
	stays     stayStore
	planItems planItemStore
	// requireAuth is the auth middleware handed in by the composition root (the
	// auth module's RequireAuth). The trip module receives it as an
	// httpx.Middleware so it never imports the auth module — every trip route is
	// authenticated, with the owner taken from the session principal.
	requireAuth httpx.Middleware
	// authz enforces per-trip access decisions. The composition root injects
	// OwnerOnlyAuthorizer for v1; Milestone 08 swaps in the membership-based
	// implementation with no caller changes (PRD §7.0).
	authz Authorizer
	// now returns the current time. Defaults to time.Now; tests inject a fixed
	// clock so bucketing assertions are not date-dependent.
	now func() time.Time
}

// New constructs the trip module wired to the database pool, the auth middleware,
// the sharing membership writer, and the authorizer. memberships is the
// consumer-side OwnerMemberships interface; the composition root passes the
// concrete *sharing.Memberships, so the trip module never imports the sharing
// module (modular-monolith boundary). authz is the Authorizer that guards every
// trip-scoped endpoint; v1 uses OwnerOnlyAuthorizer, Milestone 08 swaps in the
// membership-based implementation (PRD §7.0). Day generation defaults to the
// Epic 01 no-op seam; Epic 02 supplies the real generator.
func New(pool *pgxpool.Pool, requireAuth httpx.Middleware, memberships OwnerMemberships, authz Authorizer) *Module {
	return &Module{
		store: &pgxTripStore{
			pool:        pool,
			memberships: memberships,
			days:        pgxDayRegenerator{guard: noDayData{}},
		},
		stays:       &pgxStayStore{pool: pool},
		planItems:   &pgxPlanItemStore{pool: pool},
		requireAuth: requireAuth,
		authz:       authz,
		now:         time.Now,
	}
}

// RegisterRoutes mounts the trip module's HTTP routes onto mux, each behind the
// auth middleware so the caller is always an authenticated user (the trip's
// owner).
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET "+TripsPath, m.requireAuth(http.HandlerFunc(m.handleList)))
	mux.Handle("POST "+TripsPath, m.requireAuth(http.HandlerFunc(m.handleCreate)))
	mux.Handle("PATCH "+TripsPath+"/{id}", m.requireAuth(http.HandlerFunc(m.handleUpdate)))
	mux.Handle("POST "+TripsPath+"/{id}/archive", m.requireAuth(http.HandlerFunc(m.handleArchive)))
	mux.Handle("POST "+TripsPath+"/{id}/unarchive", m.requireAuth(http.HandlerFunc(m.handleUnarchive)))
	mux.Handle("DELETE "+TripsPath+"/{id}", m.requireAuth(http.HandlerFunc(m.handleDelete)))
	mux.Handle("GET "+TripsPath+"/{id}/days/{date}", m.requireAuth(http.HandlerFunc(m.handleGetDay)))
	mux.Handle("GET "+TripsPath+"/{id}/plan-items/backlog", m.requireAuth(http.HandlerFunc(m.handleListBacklog)))
	mux.Handle("POST "+TripsPath+"/{id}/plan-items/reorder", m.requireAuth(http.HandlerFunc(m.handleReorderPlanItems)))
	mux.Handle("POST "+TripsPath+"/{id}/plan-items", m.requireAuth(http.HandlerFunc(m.handleCreatePlanItem)))
	mux.Handle("PATCH "+TripsPath+"/{id}/plan-items/{itemID}", m.requireAuth(http.HandlerFunc(m.handleUpdatePlanItem)))
	mux.Handle("DELETE "+TripsPath+"/{id}/plan-items/{itemID}", m.requireAuth(http.HandlerFunc(m.handleDeletePlanItem)))
	mux.Handle("POST "+TripsPath+"/{id}/plan-items/{itemID}/promote", m.requireAuth(http.HandlerFunc(m.handlePromotePlanItem)))
	mux.Handle("POST "+TripsPath+"/{id}/plan-items/{itemID}/demote", m.requireAuth(http.HandlerFunc(m.handleDemotePlanItem)))
	mux.Handle("POST "+TripsPath+"/{id}/plan-items/{itemID}/move", m.requireAuth(http.HandlerFunc(m.handleMovePlanItem)))
	mux.Handle("POST "+TripsPath+"/{id}/stays", m.requireAuth(http.HandlerFunc(m.handleCreateStay)))
	mux.Handle("PATCH "+TripsPath+"/{id}/stays/{stayID}", m.requireAuth(http.HandlerFunc(m.handleUpdateStay)))
	mux.Handle("DELETE "+TripsPath+"/{id}/stays/{stayID}", m.requireAuth(http.HandlerFunc(m.handleDeleteStay)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
