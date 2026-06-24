package journal

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// writeJSON writes v as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// upsertEntryRequest is the wire shape for the idempotent save endpoint.
type upsertEntryRequest struct {
	Body    json.RawMessage `json:"body"`
	Rating  *int            `json:"rating,omitempty"`
	Weather string          `json:"weather,omitempty"`
	Mood    string          `json:"mood,omitempty"`
}

// journalEntryResponse is the wire shape returned after a successful operation.
type journalEntryResponse struct {
	ID        string          `json:"id"`
	DayID     string          `json:"day_id"`
	AuthorID  string          `json:"author_id"`
	Body      json.RawMessage `json:"body"`
	Rating    *int            `json:"rating,omitempty"`
	Weather   string          `json:"weather,omitempty"`
	Mood      string          `json:"mood,omitempty"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

func entryToResponse(e JournalEntry) journalEntryResponse {
	return journalEntryResponse{
		ID:        e.ID,
		DayID:     e.DayID,
		AuthorID:  e.AuthorID,
		Body:      e.Body,
		Rating:    e.Rating,
		Weather:   e.Weather,
		Mood:      e.Mood,
		CreatedAt: e.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt: e.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// checkAccess asks the Authorizer whether userID may access journal data for tripID.
// Returns 404 on denial and 500 on infrastructure error.
func (m *Module) checkAccess(ctx context.Context, userID, tripID string) error {
	ok, err := m.authz.CanAccess(ctx, userID, tripID)
	if err != nil {
		platformlog.FromContext(ctx).Error("journal: authz check failed", "err", err.Error())
		return httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error")
	}
	if !ok {
		return httpx.NewAPIError(http.StatusNotFound, "trip_not_found", "trip not found")
	}
	return nil
}

// handleUpsertEntry handles PUT /trips/{tripID}/days/{dayID}/journal
// It idempotently creates or updates the day's single journal entry.
func (m *Module) handleUpsertEntry(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	dayID := r.PathValue("dayID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req upsertEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	// Default to empty JSON object when no body supplied.
	body := req.Body
	if len(body) == 0 {
		body = json.RawMessage(`{}`)
	}

	input := UpsertEntry{
		DayID:    dayID,
		AuthorID: principal.UserID,
		Body:     body,
		Rating:   req.Rating,
		Weather:  req.Weather,
		Mood:     req.Mood,
	}
	if err := input.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	entry, err := m.store.UpsertEntry(r.Context(), input)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: upsert entry", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusOK, entryToResponse(entry))
}

// handleGetEntry handles GET /trips/{tripID}/days/{dayID}/journal
// Returns the day's journal entry, or 404 if none exists yet.
func (m *Module) handleGetEntry(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	dayID := r.PathValue("dayID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	entry, err := m.store.GetEntry(r.Context(), dayID)
	if errors.Is(err, ErrEntryNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "entry_not_found", "no journal entry for this day"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: get entry", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusOK, entryToResponse(entry))
}

// photoResponse is the wire shape for a single photo.
type photoResponse struct {
	ID             string `json:"id"`
	JournalEntryID string `json:"journal_entry_id"`
	StorageURL     string `json:"storage_url"`
	Caption        string `json:"caption,omitempty"`
	SizeBytes      int64  `json:"size_bytes"`
	CreatedAt      string `json:"created_at"`
}

func photoToResponse(p Photo) photoResponse {
	return photoResponse{
		ID:             p.ID,
		JournalEntryID: p.JournalEntryID,
		StorageURL:     p.StorageURL,
		Caption:        p.Caption,
		SizeBytes:      p.SizeBytes,
		CreatedAt:      p.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// newRandomID returns a random hex string suitable for use as a unique object
// key component. It uses 16 bytes (128 bits) of randomness.
func newRandomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("journal: rand.Read: %v", err))
	}
	return hex.EncodeToString(b)
}

// handleUploadPhoto handles POST /trips/{tripID}/days/{dayID}/journal/photos.
//
// Upload pipeline:
//  1. Auth check (trip membership)
//  2. Parse multipart form and validate file (type, size)
//  3. [QUOTA CHECK SEAM] — Epic 03 inserts its per-trip 1 GB cap check here,
//     before MediaStore.Put, so no rework is needed in this handler.
//  4. MediaStore.Put → storage URL
//  5. InsertPhoto row (on failure, Delete the stored object to avoid orphans)
func (m *Module) handleUploadPhoto(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	dayID := r.PathValue("dayID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	// Resolve the entry for this day — it must exist before attaching a photo.
	entry, err := m.store.GetEntry(r.Context(), dayID)
	if errors.Is(err, ErrEntryNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "entry_not_found", "no journal entry for this day"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: get entry for photo", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	// Limit parse to slightly above maxUploadBytes so we can return a clean
	// 413 rather than a truncation error.
	if err := r.ParseMultipartForm(maxUploadBytes + 1<<10); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_multipart", "failed to parse multipart form"))
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "missing_photo", "field 'photo' is required"))
		return
	}
	defer func() { _ = file.Close() }()

	contentType := header.Header.Get("Content-Type")
	size := header.Size

	if err := validateUpload(contentType, size); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnprocessableEntity, "validation_error", err.Error()))
		return
	}

	caption := r.FormValue("caption")

	// [QUOTA CHECK SEAM] — Epic 03 will add:
	//   if err := m.quota.Check(ctx, tripID, size); err != nil { ... }
	// immediately before MediaStore.Put, without changing the rest of this handler.

	objectKey := fmt.Sprintf("trips/%s/%s", tripID, newRandomID())
	storageURL, err := m.media.Put(r.Context(), objectKey, contentType, size, file)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: media put", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	photo, err := m.store.InsertPhoto(r.Context(), Photo{
		JournalEntryID: entry.ID,
		StorageURL:     storageURL,
		Caption:        caption,
		SizeBytes:      size,
	})
	if err != nil {
		// Best-effort cleanup: avoid orphaned objects in GCS.
		_ = m.media.Delete(r.Context(), storageURL)
		platformlog.FromContext(r.Context()).Error("journal: insert photo", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	writeJSON(w, http.StatusCreated, photoToResponse(photo))
}

// handleListPhotos handles GET /trips/{tripID}/days/{dayID}/journal/photos.
func (m *Module) handleListPhotos(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	dayID := r.PathValue("dayID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	entry, err := m.store.GetEntry(r.Context(), dayID)
	if errors.Is(err, ErrEntryNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "entry_not_found", "no journal entry for this day"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: get entry for list photos", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	photos, err := m.store.ListPhotos(r.Context(), entry.ID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: list photos", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	resp := make([]photoResponse, len(photos))
	for i, p := range photos {
		resp[i] = photoToResponse(p)
	}
	writeJSON(w, http.StatusOK, resp)
}
