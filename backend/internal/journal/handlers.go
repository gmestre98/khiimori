package journal

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

// checkReadAccess asks the Authorizer whether userID may read journal data for tripID.
// Returns 404 on denial and 500 on infrastructure error.
func (m *Module) checkReadAccess(ctx context.Context, userID, tripID string) error {
	ok, err := m.authz.CanRead(ctx, userID, tripID)
	if err != nil {
		platformlog.FromContext(ctx).Error("journal: authz check failed", "err", err.Error())
		return httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error")
	}
	if !ok {
		return httpx.NewAPIError(http.StatusNotFound, "trip_not_found", "trip not found")
	}
	return nil
}

// checkWriteAccess asks the Authorizer whether userID may write journal data for tripID.
// Returns 404 on denial and 500 on infrastructure error.
func (m *Module) checkWriteAccess(ctx context.Context, userID, tripID string) error {
	ok, err := m.authz.CanWrite(ctx, userID, tripID)
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
	if err := m.checkWriteAccess(r.Context(), principal.UserID, tripID); err != nil {
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
	if err := m.checkReadAccess(r.Context(), principal.UserID, tripID); err != nil {
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
	ThumbnailURL   string `json:"thumbnail_url,omitempty"`
	Caption        string `json:"caption,omitempty"`
	SizeBytes      int64  `json:"size_bytes"`
	CreatedAt      string `json:"created_at"`
}

func photoToResponse(p Photo) photoResponse {
	return photoResponse{
		ID:             p.ID,
		JournalEntryID: p.JournalEntryID,
		StorageURL:     p.StorageURL,
		ThumbnailURL:   p.ThumbnailURL,
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
//  3. Per-trip 1 GB cap check — rejected before any storage write
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
	if err := m.checkWriteAccess(r.Context(), principal.UserID, tripID); err != nil {
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

	// Per-trip 1 GB cap — enforced server-side before any storage write.
	used, err := m.store.TripUsageBytes(r.Context(), tripID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: quota check", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	if used+size > m.quotaCap {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusRequestEntityTooLarge,
			"quota_exceeded",
			fmt.Sprintf("trip storage quota exceeded: %d of %d bytes used", used, m.quotaCap)))
		return
	}

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

	// Inline thumbnail generation — seek to start of file to re-read for resize.
	// On failure we log and continue: the original is stored and the row exists;
	// the thumbnail_url will simply remain empty (scale-up: move to async job).
	if seeker, ok := file.(io.Seeker); ok {
		if _, err := seeker.Seek(0, io.SeekStart); err == nil {
			thumbBytes, thumbErr := generateThumbnail(file, contentType)
			if thumbErr != nil {
				platformlog.FromContext(r.Context()).Error("journal: generate thumbnail", "err", thumbErr.Error())
			} else {
				thumbKey := objectKey + "_thumb"
				thumbURL, putErr := m.media.Put(r.Context(), thumbKey, "image/jpeg", int64(len(thumbBytes)), bytes.NewReader(thumbBytes))
				if putErr != nil {
					platformlog.FromContext(r.Context()).Error("journal: store thumbnail", "err", putErr.Error())
				} else if updateErr := m.store.UpdatePhotoThumbnail(r.Context(), photo.ID, thumbURL); updateErr != nil {
					_ = m.media.Delete(r.Context(), thumbURL)
					platformlog.FromContext(r.Context()).Error("journal: update photo thumbnail", "err", updateErr.Error())
				} else {
					photo.ThumbnailURL = thumbURL
				}
			}
		}
	}

	writeJSON(w, http.StatusCreated, photoToResponse(photo))
}

// usageResponse is the wire shape for the per-trip storage usage endpoint.
type usageResponse struct {
	UsedBytes int64   `json:"used_bytes"`
	CapBytes  int64   `json:"cap_bytes"`
	NearCap   bool    `json:"near_cap"`
	UsedPct   float64 `json:"used_pct"`
}

// handleGetUsage handles GET /trips/{tripID}/usage.
// Returns the trip's current photo storage usage relative to the 1 GB cap.
func (m *Module) handleGetUsage(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkReadAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	used, err := m.store.TripUsageBytes(r.Context(), tripID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: get usage", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	usedPct := float64(used) / float64(m.quotaCap) * 100
	writeJSON(w, http.StatusOK, usageResponse{
		UsedBytes: used,
		CapBytes:  m.quotaCap,
		NearCap:   float64(used) >= nearCapFraction*float64(m.quotaCap),
		UsedPct:   usedPct,
	})
}

// handleDeletePhoto handles DELETE /trips/{tripID}/days/{dayID}/journal/photos/{photoID}.
// Deletes the photo row and its objects (original + thumbnail) from MediaStore.
func (m *Module) handleDeletePhoto(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	photoID := r.PathValue("photoID")

	principal, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkWriteAccess(r.Context(), principal.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	deleted, err := m.store.DeletePhotoForTrip(r.Context(), photoID, tripID)
	if errors.Is(err, ErrPhotoNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "photo_not_found", "photo not found"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("journal: delete photo", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	// Best-effort object cleanup: row is already deleted; log but don't fail.
	if err := m.media.Delete(r.Context(), deleted.StorageURL); err != nil {
		platformlog.FromContext(r.Context()).Error("journal: delete original object", "err", err.Error())
	}
	if deleted.ThumbnailURL != "" {
		if err := m.media.Delete(r.Context(), deleted.ThumbnailURL); err != nil {
			platformlog.FromContext(r.Context()).Error("journal: delete thumbnail object", "err", err.Error())
		}
	}

	w.WriteHeader(http.StatusNoContent)
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
	if err := m.checkReadAccess(r.Context(), principal.UserID, tripID); err != nil {
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
