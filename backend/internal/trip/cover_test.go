package trip

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
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
	putKeys []string
	putErr  error
	deleted []string
	objects map[string][]byte // gs:// url → bytes, for Get
	types   map[string]string
	gets    []string
}

func newFakeCoverMedia() *fakeCoverMedia { return &fakeCoverMedia{} }

func (f *fakeCoverMedia) Put(_ context.Context, key, contentType string, _ int64, r io.Reader) (string, error) {
	if f.putErr != nil {
		return "", f.putErr
	}
	data, _ := io.ReadAll(r)
	if f.putKey == "" {
		f.putKey = key
	}
	f.putKeys = append(f.putKeys, key)
	if f.objects == nil {
		f.objects = map[string][]byte{}
		f.types = map[string]string{}
	}
	f.objects["gs://bucket/"+key] = data
	f.types["gs://bucket/"+key] = contentType
	return "gs://bucket/" + key, nil
}

func (f *fakeCoverMedia) Delete(_ context.Context, url string) error {
	f.deleted = append(f.deleted, url)
	return nil
}

func (f *fakeCoverMedia) Get(_ context.Context, url string) (io.ReadCloser, string, error) {
	f.gets = append(f.gets, url)
	data, ok := f.objects[url]
	if !ok {
		return nil, "", fmt.Errorf("not found: %s", url)
	}
	return io.NopCloser(bytes.NewReader(data)), f.types[url], nil
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
	if !strings.HasPrefix(resp.CoverURL, "/trips/trip-1/cover/") {
		t.Errorf("response cover_url = %q, want the API cover path", resp.CoverURL)
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
	if len(media.deleted) != 2 || media.deleted[0] != "gs://bucket/trips/trip-1/cover/old" ||
		media.deleted[1] != "gs://bucket/trips/trip-1/cover/old-display.jpg" {
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
	if len(media.deleted) != 2 || media.deleted[0] != "gs://bucket/trips/trip-1/cover/cur" ||
		media.deleted[1] != "gs://bucket/trips/trip-1/cover/cur-display.jpg" {
		t.Errorf("deleted = %v, want the current cover object", media.deleted)
	}
}

// TestCoverURL covers the read-time cover→URL projection in isolation: an
// uploaded cover maps to a stable API path that changes with the cover.
func TestCoverURL(t *testing.T) {
	t.Parallel()

	m := newCoverModule(&fakeTripStore{}, newFakeCoverMedia())
	ctx := context.Background()

	if got := m.coverURL(ctx, "t", ""); got != "" {
		t.Errorf("empty cover = %q, want empty", got)
	}
	if got := m.coverURL(ctx, "t", "https://cdn.example/x.jpg"); got != "https://cdn.example/x.jpg" {
		t.Errorf("external URL = %q, want passthrough", got)
	}
	a := m.coverURL(ctx, "t", "gs://bucket/trips/t/cover/abc")
	if !strings.HasPrefix(a, "/trips/t/cover/") || len(a) != len("/trips/t/cover/")+12 {
		t.Errorf("gs:// cover = %q, want /trips/t/cover/<12-hex version>", a)
	}
	if again := m.coverURL(ctx, "t", "gs://bucket/trips/t/cover/abc"); again != a {
		t.Errorf("same cover gave a different URL: %q vs %q", again, a)
	}
	if other := m.coverURL(ctx, "t", "gs://bucket/trips/t/cover/def"); other == a {
		t.Errorf("a new cover kept the old URL %q", other)
	}
}

// testJPEG makes a w×h JPEG whose left half is red, with an optional EXIF
// orientation segment.
func testJPEG(t *testing.T, w, h, orientation int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := color.RGBA{0, 0, 255, 255}
			if x < w/2 {
				c = color.RGBA{255, 0, 0, 255}
			}
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	out := buf.Bytes()
	if orientation == 0 {
		return out
	}
	// APP1 Exif, little-endian TIFF with one IFD entry: Orientation (SHORT).
	tiff := []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, byte(orientation), 0, 0, 0, 0, 0, 0, 0}
	payload := append([]byte("Exif\x00\x00"), tiff...)
	seg := []byte{0xFF, 0xE1, byte((len(payload) + 2) >> 8), byte(len(payload) + 2)}
	seg = append(seg, payload...)
	return append(append([]byte{0xFF, 0xD8}, seg...), out[2:]...)
}

func coverGetReq(id, version string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, TripsPath+"/"+id+"/cover/"+version, nil)
	req.SetPathValue("id", id)
	req.SetPathValue("version", version)
	return withPrincipal(req, "owner-1")
}

// TestHandleGetCover serves a resized display copy, made once and then reused,
// cached for a year for the current version and not cached for a stale one.
func TestHandleGetCover(t *testing.T) {
	t.Parallel()

	cover := "gs://bucket/trips/trip-1/cover/abc"
	media := newFakeCoverMedia()
	media.objects = map[string][]byte{cover: testJPEG(t, 4000, 2000, 0)}
	media.types = map[string]string{cover: "image/jpeg"}
	m := newCoverModule(&fakeTripStore{cover: cover}, media)
	version := coverVersion(cover)

	rec := httptest.NewRecorder()
	m.handleGetCover(rec, coverGetReq("trip-1", version))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("content type = %q", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("cache-control = %q, want long-lived", cc)
	}
	got, err := jpeg.Decode(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if b := got.Bounds(); b.Dx() != displayMaxDim || b.Dy() != displayMaxDim/2 {
		t.Errorf("display size = %dx%d, want %dx%d", b.Dx(), b.Dy(), displayMaxDim, displayMaxDim/2)
	}
	if len(media.putKeys) != 1 || media.putKeys[0] != "trips/trip-1/cover/abc-display.jpg" {
		t.Errorf("display copy stored as %v", media.putKeys)
	}

	// Second view reuses the stored copy (no new Put).
	rec = httptest.NewRecorder()
	m.handleGetCover(rec, coverGetReq("trip-1", version))
	if rec.Code != http.StatusOK || len(media.putKeys) != 1 {
		t.Errorf("second view: status %d, puts %v", rec.Code, media.putKeys)
	}

	// Revalidation with the ETag.
	req := coverGetReq("trip-1", version)
	req.Header.Set("If-None-Match", `"`+version+`"`)
	rec = httptest.NewRecorder()
	m.handleGetCover(rec, req)
	if rec.Code != http.StatusNotModified {
		t.Errorf("if-none-match: status %d, want 304", rec.Code)
	}

	// A stale version still shows the current cover, uncached.
	rec = httptest.NewRecorder()
	m.handleGetCover(rec, coverGetReq("trip-1", "000000000000"))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Header().Get("Cache-Control"), "no-cache") {
		t.Errorf("stale version: status %d, cache %q", rec.Code, rec.Header().Get("Cache-Control"))
	}
}

func TestHandleGetCoverNoCover(t *testing.T) {
	t.Parallel()
	m := newCoverModule(&fakeTripStore{cover: "https://cdn.example/x.jpg"}, newFakeCoverMedia())
	rec := httptest.NewRecorder()
	m.handleGetCover(rec, coverGetReq("trip-1", "x"))
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

// TestMakeDisplayCoverOrientation: a sideways phone photo (EXIF 6) comes out
// upright: portrait, with the original left (red) half on top.
func TestMakeDisplayCoverOrientation(t *testing.T) {
	t.Parallel()
	out, err := makeDisplayCover(bytes.NewReader(testJPEG(t, 400, 200, 6)), "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatal(err)
	}
	if b := img.Bounds(); b.Dx() != 200 || b.Dy() != 400 {
		t.Fatalf("size = %dx%d, want 200x400 (rotated)", b.Dx(), b.Dy())
	}
	r, _, bl, _ := img.At(100, 50).RGBA()
	if r < bl {
		t.Errorf("top should be red after rotating 90° clockwise")
	}
	if jpegOrientation(testJPEG(t, 10, 10, 0)) != 1 {
		t.Errorf("no EXIF should read as 1")
	}
}
