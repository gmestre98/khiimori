package trip

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// mediaStore is the subset of the shared media-storage seam the trip module needs
// to store, sign, and remove a trip's cover image. It is a consumer-side interface
// (the same pattern as OwnerMemberships / Authorizer): the composition root passes
// the same concrete GCS-backed store it hands the journal module, so the trip
// module never imports journal and no shared media package has to be introduced.
type mediaStore interface {
	Put(ctx context.Context, key, contentType string, size int64, r io.Reader) (url string, err error)
	Delete(ctx context.Context, url string) error
	SignedURL(ctx context.Context, url string) (string, error)
}

// maxCoverUploadBytes caps a single cover upload. Mirrors the journal photo limit
// (kept independent so the two packages never import one another).
const maxCoverUploadBytes = 10 << 20 // 10 MB

// coverContentTypes lists the MIME types accepted for a cover upload.
var coverContentTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

// signCover turns a stored cover reference into a browser-loadable URL. A gs://
// object (an uploaded cover) becomes a short-lived signed URL; anything else — an
// external http(s) URL, or empty — is returned unchanged. When no media store is
// configured (nil: unit tests, or MEDIA_BUCKET_NAME unset) the raw value is
// returned so the server still boots and responds.
func (m *Module) signCover(ctx context.Context, cover string) string {
	if cover == "" || m.media == nil || !strings.HasPrefix(cover, "gs://") {
		return cover
	}
	signed, err := m.media.SignedURL(ctx, cover)
	if err != nil {
		platformlog.FromContext(ctx).Error("trip: sign cover url", "err", err.Error())
		return ""
	}
	return signed
}

// newCoverKey returns a unique GCS object key for a trip's cover, namespaced per
// trip (matching the journal photo layout: "trips/{tripID}/...").
func newCoverKey(tripID string) string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("trip: rand.Read: %v", err))
	}
	return fmt.Sprintf("trips/%s/cover/%s", tripID, hex.EncodeToString(b))
}

// handleUploadCover stores an uploaded image as the trip's cover and returns the
// updated trip (with a freshly signed cover_url). Owner/editor only. The previous
// cover object, if any, is deleted best-effort once the row points at the new one.
//
// POST /trips/{id}/cover  (multipart/form-data, field "cover")
func (m *Module) handleUploadCover(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	id := r.PathValue("id")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	if m.media == nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusServiceUnavailable, "uploads_unavailable", "photo uploads are not configured"))
		return
	}

	// Limit the parse to just above the cap so an oversize upload surfaces as a
	// clean 413 rather than a truncation error.
	if err := r.ParseMultipartForm(maxCoverUploadBytes + 1<<10); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "invalid_multipart", "failed to parse multipart form"))
		return
	}

	file, header, err := r.FormFile("cover")
	if err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusBadRequest, "missing_cover", "field 'cover' is required"))
		return
	}
	defer func() { _ = file.Close() }()

	contentType := header.Header.Get("Content-Type")
	size := header.Size
	if !coverContentTypes[contentType] {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnprocessableEntity, "validation_error",
			fmt.Sprintf("unsupported content type %q (want image/jpeg, image/png, image/webp, or image/gif)", contentType)))
		return
	}
	if size <= 0 {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnprocessableEntity, "validation_error", "file is empty"))
		return
	}
	if size > maxCoverUploadBytes {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusRequestEntityTooLarge, "file_too_large",
			fmt.Sprintf("file too large (%d bytes, max %d)", size, maxCoverUploadBytes)))
		return
	}

	key := newCoverKey(id)
	storageURL, err := m.media.Put(r.Context(), key, contentType, size, file)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("trip: cover put", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	t, prev, err := m.store.SetCover(r.Context(), id, p.UserID, storageURL)
	if err != nil {
		// The row was not updated — remove the just-stored object so it doesn't orphan.
		_ = m.media.Delete(r.Context(), storageURL)
		if errors.Is(err, errTripNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "trip_not_found", "trip not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("trip: set cover", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	// Best-effort removal of the replaced object (never blocks the response).
	if strings.HasPrefix(prev, "gs://") && prev != storageURL {
		if delErr := m.media.Delete(r.Context(), prev); delErr != nil {
			platformlog.FromContext(r.Context()).Error("trip: delete replaced cover", "err", delErr.Error())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(m.tripResp(r.Context(), t))
}

// handleDeleteCover clears the trip's cover and removes the stored object.
//
// DELETE /trips/{id}/cover
func (m *Module) handleDeleteCover(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	id := r.PathValue("id")

	if err := m.checkAccess(r.Context(), p.UserID, ActionWrite, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	t, prev, err := m.store.SetCover(r.Context(), id, p.UserID, "")
	if err != nil {
		if errors.Is(err, errTripNotFound) {
			httpx.WriteError(w, r, httpx.NewAPIError(
				http.StatusNotFound, "trip_not_found", "trip not found"))
			return
		}
		platformlog.FromContext(r.Context()).Error("trip: clear cover", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	if m.media != nil && strings.HasPrefix(prev, "gs://") {
		if delErr := m.media.Delete(r.Context(), prev); delErr != nil {
			platformlog.FromContext(r.Context()).Error("trip: delete cover", "err", delErr.Error())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(m.tripResp(r.Context(), t))
}
