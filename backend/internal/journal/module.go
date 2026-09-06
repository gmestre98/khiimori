package journal

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// previewBackfillBatch is how many photos the backfill processes per query.
const previewBackfillBatch = 50

// Module is the journal module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	store       journalStore
	authz       Authorizer
	requireAuth httpx.Middleware
	media       MediaStore
	quotaCap    int64 // per-trip cap in bytes; defaults to DefaultQuotaCap
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
		quotaCap:    DefaultQuotaCap,
	}
}

// BackfillPreviews generates inline blur-up previews for photos uploaded before
// the preview column existed. It derives each preview from the already-small
// stored thumbnail (cheap to read), processing in batches until none remain.
// Safe to run on every startup: it only targets rows where preview IS NULL, so
// it is idempotent and self-healing. Intended to run in a background goroutine.
func (m *Module) BackfillPreviews(ctx context.Context) {
	log := platformlog.FromContext(ctx)
	total := 0
	for {
		if ctx.Err() != nil {
			return
		}
		photos, err := m.store.PhotosMissingPreview(ctx, previewBackfillBatch)
		if err != nil {
			log.Error("journal: preview backfill query", "err", err.Error())
			return
		}
		if len(photos) == 0 {
			if total > 0 {
				log.Info("journal: preview backfill complete", "count", total)
			}
			return
		}

		progressed := 0
		for _, p := range photos {
			if ctx.Err() != nil {
				return
			}
			if err := m.backfillOnePreview(ctx, p); err != nil {
				log.Error("journal: preview backfill photo", "photo_id", p.ID, "err", err.Error())
				continue
			}
			progressed++
			total++
		}

		// If a whole batch failed to make progress, stop rather than spin forever
		// on rows we cannot process (the query would keep returning them).
		if progressed == 0 {
			log.Error("journal: preview backfill stalled", "remaining_batch", len(photos), "done", total)
			return
		}
	}
}

// backfillOnePreview reads a photo's thumbnail, generates a preview, and stores it.
func (m *Module) backfillOnePreview(ctx context.Context, p Photo) error {
	rc, contentType, err := m.media.Get(ctx, p.ThumbnailURL)
	if err != nil {
		return err
	}
	defer func() { _ = rc.Close() }()

	preview, err := generatePreview(rc, contentType)
	if err != nil {
		return err
	}
	return m.store.UpdatePhotoPreview(ctx, p.ID, preview)
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

	// Delete a specific photo:
	// DELETE /trips/{tripID}/days/{dayID}/journal/photos/{photoID}
	mux.Handle("DELETE /trips/{tripID}/days/{dayID}/journal/photos/{photoID}",
		m.requireAuth(http.HandlerFunc(m.handleDeletePhoto)))

	// Per-trip storage usage:
	// GET /trips/{tripID}/usage
	mux.Handle("GET /trips/{tripID}/usage",
		m.requireAuth(http.HandlerFunc(m.handleGetUsage)))
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
