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
	media       MediaStore
}

// New constructs the journal module wired to the database pool, auth middleware,
// authorizer, and media store. The Authorizer is a consumer-side interface; the
// composition root passes a concrete adapter so the journal module never imports
// trip or sharing.
func New(pool *pgxpool.Pool, requireAuth httpx.Middleware, authz Authorizer, media MediaStore) *Module {
	return &Module{
		store:       &pgxJournalStore{pool: pool},
		authz:       authz,
		requireAuth: requireAuth,
		media:       media,
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

	// Upload a photo and attach it to the day's journal entry:
	// POST /trips/{tripID}/days/{dayID}/journal/photos
	mux.Handle("POST /trips/{tripID}/days/{dayID}/journal/photos",
		m.requireAuth(http.HandlerFunc(m.handleUploadPhoto)))

	// List photos attached to the day's journal entry:
	// GET /trips/{tripID}/days/{dayID}/journal/photos
	mux.Handle("GET /trips/{tripID}/days/{dayID}/journal/photos",
		m.requireAuth(http.HandlerFunc(m.handleListPhotos)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
