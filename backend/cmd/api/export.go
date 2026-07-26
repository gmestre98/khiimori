package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/storage"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"

	"github.com/gmestre98/khiimori/backend/internal/auth"
	"github.com/gmestre98/khiimori/backend/internal/budget"
	"github.com/gmestre98/khiimori/backend/internal/export"
	"github.com/gmestre98/khiimori/backend/internal/exportstore"
	"github.com/gmestre98/khiimori/backend/internal/gdrive"
	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
	"github.com/gmestre98/khiimori/backend/internal/sharing"
	"github.com/gmestre98/khiimori/backend/internal/trip"
)

// ExportGoogleDocPath is the trip-export endpoint (M13.3 S4).
const ExportGoogleDocPath = "/trips/{tripID}/export/google-doc"

// driveClient is the Drive operations the export handler needs; *gdrive.Client
// satisfies it, and tests inject a fake. It is a superset of
// exportstore.FolderManager, so it can be passed straight to ResolveFolder.
type driveClient interface {
	CreateDoc(ctx context.Context, ts oauth2.TokenSource, name, folderID string, html []byte) (fileID, webViewLink string, err error)
	UpdateDoc(ctx context.Context, ts oauth2.TokenSource, fileID string, html []byte) error
	CreateFolder(ctx context.Context, ts oauth2.TokenSource, name string) (string, error)
	FolderExists(ctx context.Context, ts oauth2.TokenSource, folderID string) (bool, error)
}

// driveTokenProvider yields a user's Drive token source; *auth.Module satisfies it.
type driveTokenProvider interface {
	DriveTokenSource(ctx context.Context, userID string) (oauth2.TokenSource, error)
}

// exportDeps bundles everything the export handler orchestrates. It lives in the
// composition root because it ties together modules (auth, budget, sharing) and
// infra (Drive client, GCS, the mapping store) that may not import each other.
// The Drive/token/folder pieces are interfaces so the endpoint is integration-
// testable with a fake Drive.
type exportDeps struct {
	pool         *pgxpool.Pool
	authz        *sharing.MembershipAuthorizer
	tokens       driveTokenProvider
	folders      exportstore.FolderCache
	budget       *budget.Module
	drive        driveClient
	mappings     *exportstore.Store
	imageFetcher export.ImageFetcher // nil when GCS is unconfigured (text-only)
}

// registerExportRoutes mounts the export endpoint behind requireAuth, but only
// when the Drive integration is enabled; otherwise it is not exposed at all.
func registerExportRoutes(mux *http.ServeMux, requireAuth httpx.Middleware, enabled bool, d exportDeps) {
	if !enabled {
		return
	}
	mux.Handle("POST "+ExportGoogleDocPath, requireAuth(http.HandlerFunc(d.handleExport)))
}

// exportRequest is the JSON body of an export.
type exportRequest struct {
	IncludePhotos *bool  `json:"includePhotos"`
	IncludeBudget *bool  `json:"includeBudget"`
	FolderID      string `json:"folderId"`
}

// handleExport authorizes, builds, renders, embeds photos, resolves the folder,
// delivers to Drive (create or update-in-place), and reports the result.
func (d exportDeps) handleExport(w http.ResponseWriter, r *http.Request) {
	log := platformlog.FromContext(r.Context())
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	tripID := r.PathValue("tripID")

	// Read access (owner/editor/viewer): export is read-only and lands in the
	// exporting user's OWN Drive, so any trip member may export.
	allowed, err := d.authz.Can(r.Context(), p.UserID, string(trip.ActionRead), tripID)
	if err != nil {
		log.Error("export: authz check", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "server_error", "could not authorize export"))
		return
	}
	if !allowed {
		// 404 (not 403) to avoid revealing the existence of a trip the caller
		// can't see — the project's authz convention.
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "not_found", "trip not found"))
		return
	}

	var req exportRequest
	if r.Body != nil {
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req) // body is optional
	}
	includePhotos := req.IncludePhotos == nil || *req.IncludePhotos // default on
	includeBudget := req.IncludeBudget == nil || *req.IncludeBudget // default on

	// The user's Drive token — absent means "not connected".
	ts, err := d.tokens.DriveTokenSource(r.Context(), p.UserID)
	if errors.Is(err, auth.ErrNoDriveConnection) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusConflict, "drive_not_connected", "connect Google Drive to export"))
		return
	}
	if err != nil {
		log.Error("export: drive token source", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "server_error", "could not read Drive connection"))
		return
	}

	// Build → embed photos → render.
	reader := exportReader{pool: d.pool, budget: d.budget, includeBudget: includeBudget}
	model, err := export.BuildExportModel(r.Context(), reader, tripID)
	if err != nil {
		log.Error("export: build model", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "server_error", "could not assemble the trip"))
		return
	}
	export.EmbedPhotos(r.Context(), &model, d.imageFetcher, export.EmbedOptions{Include: includePhotos})
	html, err := export.Render(model)
	if err != nil {
		log.Error("export: render", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "server_error", "could not render the document"))
		return
	}

	// Resolve the target folder (default app folder or a Picker-supplied one).
	folderID, folderURL, err := exportstore.ResolveFolder(
		r.Context(), d.drive, d.folders, ts, p.UserID, req.FolderID)
	if err != nil {
		d.writeDriveError(w, r, "resolve folder", err)
		return
	}

	// Deliver: create the Doc, or update the existing one in place.
	mapping, err := exportstore.Reconcile(r.Context(), d.mappings, driveWriter{d.drive}, ts, exportstore.ReconcileParams{
		TripID:   tripID,
		UserID:   p.UserID,
		Name:     model.TripName,
		FolderID: folderID,
		HTML:     html,
	})
	if err != nil {
		d.writeDriveError(w, r, "deliver", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"doc_url":     mapping.DocURL,
		"folder_url":  folderURL,
		"exported_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// writeDriveError maps Drive/auth failures to responses: a revoked or rejected
// grant becomes a 409 the UI turns into "reconnect"; anything else is a 502.
func (d exportDeps) writeDriveError(w http.ResponseWriter, r *http.Request, stage string, err error) {
	log := platformlog.FromContext(r.Context())
	if errors.Is(err, auth.ErrDriveDisconnected) || errors.Is(err, gdrive.ErrUnauthorized) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusConflict, "drive_reconnect_required", "reconnect Google Drive to export"))
		return
	}
	log.Error("export: "+stage, "err", err.Error())
	httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadGateway, "drive_delivery_failed", "could not reach Google Drive"))
}

// --- Drive adapters ---------------------------------------------------------

// driveWriter adapts *gdrive.Client to exportstore.DocWriter, translating the
// Drive not-found error into the store's sentinel (the store must not import
// gdrive).
type driveWriter struct{ c driveClient }

func (d driveWriter) CreateDoc(ctx context.Context, ts oauth2.TokenSource, name, folderID string, html []byte) (string, string, error) {
	return d.c.CreateDoc(ctx, ts, name, folderID, html)
}
func (d driveWriter) UpdateDoc(ctx context.Context, ts oauth2.TokenSource, fileID string, html []byte) error {
	err := d.c.UpdateDoc(ctx, ts, fileID, html)
	if errors.Is(err, gdrive.ErrDocMissing) {
		return exportstore.ErrDocMissing
	}
	return err
}

// folderCache adapts the auth module's Drive-connection folder cache to
// exportstore.FolderCache.
type folderCache struct{ m *auth.Module }

func (f folderCache) FolderID(ctx context.Context, userID string) (string, error) {
	return f.m.DriveFolderID(ctx, userID)
}
func (f folderCache) SetFolderID(ctx context.Context, userID, folderID string) error {
	return f.m.SetDriveFolderID(ctx, userID, folderID)
}

// --- GCS image fetcher ------------------------------------------------------

// maxPhotoFetchBytes bounds a single photo read from GCS.
const maxPhotoFetchBytes = 8 << 20

// gcsImageFetcher reads a photo's bytes from a gs:// object for inline embedding.
type gcsImageFetcher struct {
	client *storage.Client
	bucket string
}

func (f gcsImageFetcher) FetchImage(ctx context.Context, ref string) (string, []byte, error) {
	prefix := "gs://" + f.bucket + "/"
	if !strings.HasPrefix(ref, prefix) {
		return "", nil, fmt.Errorf("export: photo ref %q not in bucket %q", ref, f.bucket)
	}
	key := strings.TrimPrefix(ref, prefix)
	rc, err := f.client.Bucket(f.bucket).Object(key).NewReader(ctx)
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = rc.Close() }()
	data, err := io.ReadAll(io.LimitReader(rc, maxPhotoFetchBytes))
	if err != nil {
		return "", nil, err
	}
	return rc.Attrs.ContentType, data, nil
}

// --- export.Reader SQL adapter ----------------------------------------------

// exportReader implements export.Reader over the database. Authorization is the
// handler's responsibility (checked before this runs).
type exportReader struct {
	pool          *pgxpool.Pool
	budget        *budget.Module
	includeBudget bool
}

func (e exportReader) Header(ctx context.Context, tripID string) (export.Header, error) {
	const q = `SELECT name, destinations, start_date, end_date, base_currency FROM trip.trips WHERE id = $1::uuid`
	var h export.Header
	if err := e.pool.QueryRow(ctx, q, tripID).Scan(&h.Name, &h.Destinations, &h.StartDate, &h.EndDate, &h.Currency); err != nil {
		return export.Header{}, fmt.Errorf("export: header: %w", err)
	}
	return h, nil
}

func (e exportReader) Days(ctx context.Context, tripID string) ([]export.Day, error) {
	const q = `SELECT id::text, date, index, notes FROM trip.days WHERE trip_id = $1::uuid ORDER BY date`
	rows, err := e.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("export: days: %w", err)
	}
	defer rows.Close()
	var out []export.Day
	for rows.Next() {
		var d export.Day
		if err := rows.Scan(&d.ID, &d.Date, &d.Index, &d.Notes); err != nil {
			return nil, fmt.Errorf("export: scan day: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (e exportReader) PlanItems(ctx context.Context, tripID string) ([]export.DayItem, error) {
	const q = `
		SELECT day_id::text, title, kind,
		       COALESCE(start_time::text, ''), COALESCE(location, ''),
		       COALESCE(booking_status, ''), cost,
		       COALESCE(origin, ''), COALESCE(destination, ''), COALESCE(arrive_time::text, ''),
		       COALESCE(note, ''), unplanned, sort_order, actual_order, status
		FROM trip.plan_items
		WHERE trip_id = $1::uuid AND day_id IS NOT NULL`
	rows, err := e.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("export: plan items: %w", err)
	}
	defer rows.Close()
	var out []export.DayItem
	for rows.Next() {
		var di export.DayItem
		var it export.Item
		var cost *float64
		if err := rows.Scan(&di.DayID, &it.Title, &it.Kind, &it.StartTime, &it.Location,
			&it.BookingStatus, &cost, &it.Origin, &it.Destination, &it.ArriveTime,
			&it.Note, &di.Unplanned, &di.SortOrder, &di.ActualOrder, &it.Status); err != nil {
			return nil, fmt.Errorf("export: scan plan item: %w", err)
		}
		it.Cost = cost
		di.Item = it
		out = append(out, di)
	}
	return out, rows.Err()
}

func (e exportReader) Stays(ctx context.Context, tripID string) ([]export.DayStay, error) {
	// Map each day's date → id so a stay's nights can be assigned to days.
	dayByDate, err := e.dayIDsByDate(ctx, tripID)
	if err != nil {
		return nil, err
	}
	const q = `SELECT name, COALESCE(location, ''), check_in, check_out, cost, paid, COALESCE(link, '')
	           FROM trip.stays WHERE trip_id = $1::uuid`
	rows, err := e.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("export: stays: %w", err)
	}
	defer rows.Close()
	var out []export.DayStay
	for rows.Next() {
		var s export.Stay
		if err := rows.Scan(&s.Name, &s.Location, &s.CheckIn, &s.CheckOut, &s.Cost, &s.Paid, &s.Link); err != nil {
			return nil, fmt.Errorf("export: scan stay: %w", err)
		}
		for _, dayID := range coveredDayIDs(s, dayByDate) {
			out = append(out, export.DayStay{DayID: dayID, Stay: s})
		}
	}
	return out, rows.Err()
}

func (e exportReader) Journals(ctx context.Context, tripID string) ([]export.DayJournal, error) {
	const q = `
		SELECT je.id::text, je.day_id::text, je.body, je.rating,
		       COALESCE(je.weather, ''), COALESCE(je.mood, '')
		FROM journal.journal_entries je
		JOIN trip.days d ON d.id = je.day_id
		WHERE d.trip_id = $1::uuid`
	rows, err := e.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("export: journals: %w", err)
	}
	defer rows.Close()

	type entry struct {
		id, dayID string
		j         export.Journal
	}
	var entries []entry
	for rows.Next() {
		var en entry
		var body []byte
		if err := rows.Scan(&en.id, &en.dayID, &body, &en.j.Rating, &en.j.Weather, &en.j.Mood); err != nil {
			return nil, fmt.Errorf("export: scan journal: %w", err)
		}
		en.j.Text = journalText(body)
		entries = append(entries, en)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Load every entry's photos in one query (avoids an N+1 over the diary days).
	photosByEntry, err := e.photosByEntry(ctx, tripID)
	if err != nil {
		return nil, err
	}

	out := make([]export.DayJournal, 0, len(entries))
	for _, en := range entries {
		en.j.Photos = photosByEntry[en.id]
		out = append(out, export.DayJournal{DayID: en.dayID, Journal: en.j})
	}
	return out, nil
}

func (e exportReader) Budget(ctx context.Context, tripID string, dayCount int) (export.Budget, error) {
	if !e.includeBudget {
		return export.Budget{}, nil
	}
	rollup, err := e.budget.TripRollup(ctx, tripID)
	if err != nil {
		return export.Budget{}, err
	}
	return mapBudget(rollup, dayCount), nil
}

// dayIDsByDate returns a map of YYYY-MM-DD → day id for the trip.
func (e exportReader) dayIDsByDate(ctx context.Context, tripID string) (map[string]string, error) {
	rows, err := e.pool.Query(ctx, `SELECT id::text, date FROM trip.days WHERE trip_id = $1::uuid`, tripID)
	if err != nil {
		return nil, fmt.Errorf("export: day dates: %w", err)
	}
	defer rows.Close()
	m := map[string]string{}
	for rows.Next() {
		var id string
		var date time.Time
		if err := rows.Scan(&id, &date); err != nil {
			return nil, fmt.Errorf("export: scan day date: %w", err)
		}
		m[date.Format("2006-01-02")] = id
	}
	return m, rows.Err()
}

// photosByEntry loads all of a trip's journal photos (the full images, each
// carrying a thumbnail reference; standalone thumbnail rows are skipped) in one
// query, grouped by journal entry id.
func (e exportReader) photosByEntry(ctx context.Context, tripID string) (map[string][]export.Photo, error) {
	const q = `
		SELECT p.journal_entry_id::text, p.storage_url, COALESCE(p.thumbnail_url, ''), COALESCE(p.caption, '')
		FROM journal.photos p
		JOIN journal.journal_entries je ON je.id = p.journal_entry_id
		JOIN trip.days d ON d.id = je.day_id
		WHERE d.trip_id = $1::uuid AND p.is_thumbnail = false
		ORDER BY p.created_at ASC`
	rows, err := e.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("export: photos: %w", err)
	}
	defer rows.Close()
	byEntry := map[string][]export.Photo{}
	for rows.Next() {
		var entryID string
		var ph export.Photo
		if err := rows.Scan(&entryID, &ph.StorageURL, &ph.ThumbnailURL, &ph.Caption); err != nil {
			return nil, fmt.Errorf("export: scan photo: %w", err)
		}
		byEntry[entryID] = append(byEntry[entryID], ph)
	}
	return byEntry, rows.Err()
}

// coveredDayIDs returns the ids of the days a stay covers: each night from
// check-in up to (not including) check-out; when only a check-in is set, just
// that day. A stay with no dates covers nothing.
func coveredDayIDs(s export.Stay, dayByDate map[string]string) []string {
	if s.CheckIn == nil {
		return nil
	}
	end := s.CheckIn.AddDate(0, 0, 1)
	if s.CheckOut != nil && s.CheckOut.After(*s.CheckIn) {
		end = *s.CheckOut
	}
	var ids []string
	for day := *s.CheckIn; day.Before(end); day = day.AddDate(0, 0, 1) {
		if id, ok := dayByDate[day.Format("2006-01-02")]; ok {
			ids = append(ids, id)
		}
	}
	return ids
}

// journalText extracts the plain text from the journal body JSONB envelope
// ({"text":"..."}), tolerating an empty/legacy shape.
func journalText(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var env struct {
		Text string `json:"text"`
	}
	_ = json.Unmarshal(body, &env)
	return env.Text
}

// mapBudget composes a RollupResult into the export budget summary. Planned per
// category is the effective trip budget the app shows: the whole-trip lump, plus
// the per-day allowance times the day count, plus any single-day extras. Spent
// and Estimated come straight from the rollup.
func mapBudget(r budget.RollupResult, dayCount int) export.Budget {
	planned := map[string]float64{}
	for cat, v := range r.PlannedByCategory {
		planned[cat] += v
	}
	for cat, v := range r.DailyByCategory {
		planned[cat] += v * float64(dayCount)
	}
	for _, byCat := range r.PlannedByDayCategory {
		for cat, v := range byCat {
			planned[cat] += v
		}
	}

	names := map[string]bool{}
	for cat := range planned {
		names[cat] = true
	}
	for cat := range r.ByCategory {
		names[cat] = true
	}
	for cat := range r.EstimatedByCategory {
		names[cat] = true
	}
	cats := make([]string, 0, len(names))
	for cat := range names {
		cats = append(cats, cat)
	}
	sort.Strings(cats)

	out := export.Budget{Currency: "EUR"}
	var plannedTotal float64
	for _, cat := range cats {
		out.Categories = append(out.Categories, export.BudgetCategory{
			Name:      categoryLabel(cat),
			Planned:   planned[cat],
			Spent:     r.ByCategory[cat],
			Estimated: r.EstimatedByCategory[cat],
		})
		plannedTotal += planned[cat]
	}
	out.PlannedTotal = plannedTotal
	out.SpentTotal = r.TripTotal
	out.EstimatedTotal = r.EstimatedTripTotal
	return out
}

// categoryLabel title-cases a budget category key for display.
func categoryLabel(cat string) string {
	if cat == "" {
		return "Other"
	}
	return strings.ToUpper(cat[:1]) + cat[1:]
}
