package trip

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
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
	Get(ctx context.Context, url string) (io.ReadCloser, string, error)
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

// coverURL turns a stored cover reference into the URL the app loads. An
// uploaded cover (gs://) is served by this API at a path that only changes
// when the cover does (…/cover/{version}), relative to the API base, so the
// browser can cache it for good and no per-request URL signing is needed. An
// external http(s) URL, or "", is returned unchanged.
func (m *Module) coverURL(_ context.Context, tripID, cover string) string {
	if cover == "" || !strings.HasPrefix(cover, "gs://") {
		return cover
	}
	return TripsPath + "/" + tripID + "/cover/" + coverVersion(cover)
}

// coverVersion is a short, stable fingerprint of a cover reference. Each
// upload gets a new random object key, so a new cover means a new version.
func coverVersion(cover string) string {
	sum := sha256.Sum256([]byte(cover))
	return hex.EncodeToString(sum[:6])
}

// displayRef is where the display-size copy of an uploaded cover lives: next
// to the original, so replacing or deleting the cover can remove both.
func displayRef(cover string) string { return cover + "-display.jpg" }

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

	// Make the display-size copy now so the first view is fast; on failure it
	// is made on first view instead.
	if _, err := m.ensureDisplayCover(r.Context(), storageURL); err != nil {
		platformlog.FromContext(r.Context()).Error("trip: cover display copy", "err", err.Error())
	}

	// Best-effort removal of the replaced object and its display copy.
	if strings.HasPrefix(prev, "gs://") && prev != storageURL {
		m.deleteCoverObjects(r.Context(), prev)
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
		m.deleteCoverObjects(r.Context(), prev)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(m.tripResp(r.Context(), t))
}

// deleteCoverObjects removes a replaced cover and its display copy, best
// effort (a missing display copy is fine).
func (m *Module) deleteCoverObjects(ctx context.Context, cover string) {
	if err := m.media.Delete(ctx, cover); err != nil {
		platformlog.FromContext(ctx).Error("trip: delete cover", "err", err.Error())
	}
	_ = m.media.Delete(ctx, displayRef(cover))
}

// ensureDisplayCover returns the display-size JPEG for an uploaded cover,
// making and storing it from the original when it doesn't exist yet (covers
// uploaded before this existed, or a failed attempt at upload time).
func (m *Module) ensureDisplayCover(ctx context.Context, cover string) ([]byte, error) {
	if rc, _, err := m.media.Get(ctx, displayRef(cover)); err == nil {
		defer func() { _ = rc.Close() }()
		return io.ReadAll(rc)
	}
	rc, contentType, err := m.media.Get(ctx, cover)
	if err != nil {
		return nil, fmt.Errorf("open original: %w", err)
	}
	defer func() { _ = rc.Close() }()
	data, err := makeDisplayCover(io.LimitReader(rc, maxCoverUploadBytes+1), contentType)
	if err != nil {
		return nil, err
	}
	key := strings.TrimPrefix(displayRef(cover), "gs://")
	if i := strings.Index(key, "/"); i >= 0 {
		key = key[i+1:] // drop the bucket name: Put takes the object key
	}
	if _, err := m.media.Put(ctx, key, "image/jpeg", int64(len(data)), bytes.NewReader(data)); err != nil {
		// Still serve it; the next view tries to store it again.
		platformlog.FromContext(ctx).Error("trip: store cover display copy", "err", err.Error())
	}
	return data, nil
}

// handleGetCover serves a trip's uploaded cover (its display-size copy) from
// this API, so the app loads it same-origin with the session cookie. The URL
// carries the cover's version, so a matching request is cached for a year;
// a stale version is served without caching.
//
// GET /trips/{id}/cover/{version}
func (m *Module) handleGetCover(w http.ResponseWriter, r *http.Request) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(
			http.StatusUnauthorized, "auth_required", "authentication required"))
		return
	}
	id := r.PathValue("id")
	if err := m.checkAccess(r.Context(), p.UserID, ActionRead, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	notFound := func() {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "cover_not_found", "no cover"))
	}
	if m.media == nil {
		notFound()
		return
	}
	cover, err := m.store.GetCover(r.Context(), id)
	if err != nil || !strings.HasPrefix(cover, "gs://") {
		notFound()
		return
	}
	version := coverVersion(cover)
	current := r.PathValue("version") == version
	if current && r.Header.Get("If-None-Match") == `"`+version+`"` {
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		w.WriteHeader(http.StatusNotModified)
		return
	}
	data, err := m.ensureDisplayCover(r.Context(), cover)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("trip: serve cover", "err", err.Error())
		notFound()
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	if current {
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		w.Header().Set("ETag", `"`+version+`"`)
	} else {
		w.Header().Set("Cache-Control", "private, no-cache")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
