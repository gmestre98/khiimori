package trip

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"
)

// fakeCoverMedia is an in-memory mediaStore for cover-handler tests. It records
// the key Put was called with and every Delete, and turns gs:// URLs into a
// deterministic "signed" https URL so signing is observable.
type fakeCoverMedia struct {
	putKey  string
	putErr  error
	deleted []string
	signErr error
}

func newFakeCoverMedia() *fakeCoverMedia { return &fakeCoverMedia{} }

func (f *fakeCoverMedia) Put(_ context.Context, key, _ string, _ int64, r io.Reader) (string, error) {
	if f.putErr != nil {
		return "", f.putErr
	}
	_, _ = io.Copy(io.Discard, r)
	f.putKey = key
	return "gs://bucket/" + key, nil
}

func (f *fakeCoverMedia) Delete(_ context.Context, url string) error {
	f.deleted = append(f.deleted, url)
	return nil
}

func (f *fakeCoverMedia) SignedURL(_ context.Context, url string) (string, error) {
	if f.signErr != nil {
		return "", f.signErr
	}
	return "https://signed.example/" + strings.TrimPrefix(url, "gs://"), nil
}

var _ mediaStore = (*fakeCoverMedia)(nil)

func newCoverModule(store tripStore, media mediaStore) *Module {
	return &Module{
		store:       store,
		requireAuth: func(h http.Handler) http.Handler { return h },
		authz:       allowAllAuthorizer{},
		media:       media,
		now:         func() time.Time { return fixedNow },
	}
}

// coverReq builds a multipart POST /trips/{id}/cover request carrying one file
// part under the given form field, with the path value set as the router would.
func coverReq(id, userID, field, filename, contentType string, content []byte) *http.Request {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name=%q; filename=%q`, field, filename))
	h.Set("Content-Type", contentType)
	part, err := mw.CreatePart(h)
	if err != nil {
		panic(err)
	}
	_, _ = part.Write(content)
	_ = mw.Close()

	req := httptest.NewRequest(http.MethodPost, TripsPath+"/"+id+"/cover", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.SetPathValue("id", id)
	return withPrincipal(req, userID)
}

// TestHandleUploadCoverSuccess: a valid image is stored, the row is updated with
// the gs:// reference, and the response carries the raw cover plus a signed
// cover_url for display.
func TestHandleUploadCoverSuccess(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	media := newFakeCoverMedia()
	m := newCoverModule(store, media)

	rec := httptest.NewRecorder()
	m.handleUploadCover(rec, coverReq("trip-1", "owner-1", "cover", "photo.jpg", "image/jpeg", []byte("fakejpegbytes")))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if !strings.HasPrefix(media.putKey, "trips/trip-1/cover/") {
		t.Errorf("object key = %q, want prefix trips/trip-1/cover/", media.putKey)
	}
	if store.gotSetCoverID != "trip-1" || store.gotSetCoverOwner != "owner-1" {
		t.Errorf("SetCover id/owner = %q/%q, want trip-1/owner-1", store.gotSetCoverID, store.gotSetCoverOwner)
	}
	if !strings.HasPrefix(store.gotSetCover, "gs://bucket/trips/trip-1/cover/") {
		t.Errorf("stored cover = %q, want a gs:// reference", store.gotSetCover)
	}

	var resp tripResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if !strings.HasPrefix(resp.Cover, "gs://") {
		t.Errorf("response cover = %q, want the raw gs:// reference", resp.Cover)
	}
	if !strings.HasPrefix(resp.CoverURL, "https://signed.example/") {
		t.Errorf("response cover_url = %q, want a signed https URL", resp.CoverURL)
	}
}

// TestHandleUploadCoverReplacesOld: when a previous cover object exists it is
// deleted best-effort after the row points at the new one.
func TestHandleUploadCoverReplacesOld(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{prevCover: "gs://bucket/trips/trip-1/cover/old"}
	media := newFakeCoverMedia()
	m := newCoverModule(store, media)

	rec := httptest.NewRecorder()
	m.handleUploadCover(rec, coverReq("trip-1", "owner-1", "cover", "p.png", "image/png", []byte("data")))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if len(media.deleted) != 1 || media.deleted[0] != "gs://bucket/trips/trip-1/cover/old" {
		t.Errorf("deleted = %v, want the single old cover object", media.deleted)
	}
}

// TestHandleUploadCoverBadType: a non-image part is rejected 422 and never stored.
func TestHandleUploadCoverBadType(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	media := newFakeCoverMedia()
	m := newCoverModule(store, media)

	rec := httptest.NewRecorder()
	m.handleUploadCover(rec, coverReq("trip-1", "owner-1", "cover", "x.txt", "text/plain", []byte("nope")))

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body=%s", rec.Code, rec.Body.String())
	}
	if media.putKey != "" || store.gotSetCoverID != "" {
		t.Error("nothing should be stored for an unsupported content type")
	}
}

// TestHandleUploadCoverMissingField: the wrong form field yields a 400.
func TestHandleUploadCoverMissingField(t *testing.T) {
	t.Parallel()

	m := newCoverModule(&fakeTripStore{}, newFakeCoverMedia())
	rec := httptest.NewRecorder()
	m.handleUploadCover(rec, coverReq("trip-1", "owner-1", "wrongfield", "p.jpg", "image/jpeg", []byte("x")))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

// TestHandleUploadCoverUnavailable: with no media store configured, upload is 503.
func TestHandleUploadCoverUnavailable(t *testing.T) {
	t.Parallel()

	m := newCoverModule(&fakeTripStore{}, nil)
	rec := httptest.NewRecorder()
	m.handleUploadCover(rec, coverReq("trip-1", "owner-1", "cover", "p.jpg", "image/jpeg", []byte("x")))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503; body=%s", rec.Code, rec.Body.String())
	}
}

// TestHandleUploadCoverNotFoundCleansUp: if the row update fails (missing/other
// owner), the just-stored object is deleted so it doesn't orphan, and the client
// gets a 404.
func TestHandleUploadCoverNotFoundCleansUp(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{setCoverErr: errTripNotFound}
	media := newFakeCoverMedia()
	m := newCoverModule(store, media)

	rec := httptest.NewRecorder()
	m.handleUploadCover(rec, coverReq("trip-x", "owner-1", "cover", "p.jpg", "image/jpeg", []byte("x")))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
	}
	if len(media.deleted) != 1 {
		t.Errorf("deleted = %v, want the orphaned upload cleaned up", media.deleted)
	}
}

// TestHandleDeleteCover: clearing a cover updates the row to "" and removes the
// stored object.
func TestHandleDeleteCover(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{prevCover: "gs://bucket/trips/trip-1/cover/cur"}
	media := newFakeCoverMedia()
	m := newCoverModule(store, media)

	req := httptest.NewRequest(http.MethodDelete, TripsPath+"/trip-1/cover", nil)
	req.SetPathValue("id", "trip-1")
	req = withPrincipal(req, "owner-1")
	rec := httptest.NewRecorder()
	m.handleDeleteCover(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotSetCover != "" {
		t.Errorf("SetCover cover = %q, want empty (cleared)", store.gotSetCover)
	}
	if len(media.deleted) != 1 || media.deleted[0] != "gs://bucket/trips/trip-1/cover/cur" {
		t.Errorf("deleted = %v, want the current cover object", media.deleted)
	}
}

// TestSignCover covers the read-time cover→URL projection in isolation.
func TestSignCover(t *testing.T) {
	t.Parallel()

	m := newCoverModule(&fakeTripStore{}, newFakeCoverMedia())
	ctx := context.Background()

	if got := m.signCover(ctx, ""); got != "" {
		t.Errorf("empty cover = %q, want empty", got)
	}
	if got := m.signCover(ctx, "https://cdn.example/x.jpg"); got != "https://cdn.example/x.jpg" {
		t.Errorf("external URL = %q, want passthrough", got)
	}
	if got := m.signCover(ctx, "gs://bucket/trips/t/cover/abc"); !strings.HasPrefix(got, "https://signed.example/") {
		t.Errorf("gs:// cover = %q, want a signed https URL", got)
	}

	// With no media store, a gs:// reference is returned unchanged (can't sign).
	nilMedia := newCoverModule(&fakeTripStore{}, nil)
	if got := nilMedia.signCover(ctx, "gs://bucket/x"); got != "gs://bucket/x" {
		t.Errorf("gs:// with nil media = %q, want passthrough", got)
	}
}
