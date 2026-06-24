package journal

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// --- fakes ---

type fakeStore struct {
	entries map[string]JournalEntry // keyed by dayID
}

func newFakeStore() *fakeStore { return &fakeStore{entries: map[string]JournalEntry{}} }

func (s *fakeStore) UpsertEntry(_ context.Context, e UpsertEntry) (JournalEntry, error) {
	existing, ok := s.entries[e.DayID]
	now := time.Now()
	var entry JournalEntry
	if ok {
		entry = existing
		entry.UpdatedAt = now
	} else {
		entry = JournalEntry{
			ID:        "test-id-" + e.DayID,
			DayID:     e.DayID,
			CreatedAt: now,
			UpdatedAt: now,
		}
	}
	entry.AuthorID = e.AuthorID
	entry.Body = e.Body
	entry.Rating = e.Rating
	entry.Weather = e.Weather
	entry.Mood = e.Mood
	s.entries[e.DayID] = entry
	return entry, nil
}

func (s *fakeStore) GetEntry(_ context.Context, dayID string) (JournalEntry, error) {
	e, ok := s.entries[dayID]
	if !ok {
		return JournalEntry{}, ErrEntryNotFound
	}
	return e, nil
}

func (s *fakeStore) InsertPhoto(_ context.Context, p Photo) (Photo, error) {
	p.ID = "photo-" + p.JournalEntryID
	return p, nil
}

func (s *fakeStore) ListPhotos(_ context.Context, journalEntryID string) ([]Photo, error) {
	return nil, nil
}

type allowAuthz struct{}

func (allowAuthz) CanAccess(_ context.Context, _, _ string) (bool, error) { return true, nil }

type denyAuthz struct{}

func (denyAuthz) CanAccess(_ context.Context, _, _ string) (bool, error) { return false, nil }

func newTestModule(store journalStore, authz Authorizer) *Module {
	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: "user-1"})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
	return &Module{store: store, authz: authz, requireAuth: requireAuth, media: newFakeMediaStore()}
}

func newTestServer(t *testing.T, store journalStore, authz Authorizer) *httptest.Server {
	t.Helper()
	mod := newTestModule(store, authz)
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func putJSON(srv *httptest.Server, path string, body any) (*http.Response, error) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPut, srv.URL+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func getJSON(srv *httptest.Server, path string) (*http.Response, error) {
	return http.Get(srv.URL + path)
}

// --- tests ---

func TestUpsertEntry_Create(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	resp, err := putJSON(srv, "/trips/trip-1/days/day-1/journal", map[string]any{
		"body": json.RawMessage(`{"text":"hello"}`),
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}

	var out journalEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.DayID != "day-1" {
		t.Errorf("day_id: got %q, want day-1", out.DayID)
	}
	if out.AuthorID != "user-1" {
		t.Errorf("author_id: got %q, want user-1", out.AuthorID)
	}
}

func TestUpsertEntry_Idempotent(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	for i := range 3 {
		_ = i
		resp, err := putJSON(srv, "/trips/trip-1/days/day-2/journal", map[string]any{
			"body": json.RawMessage(`{"text":"same"}`),
		})
		if err != nil {
			t.Fatalf("put: %v", err)
		}
		_ = resp.Body.Close()
	}
	if len(store.entries) != 1 {
		t.Errorf("expected 1 entry, got %d", len(store.entries))
	}
}

func TestUpsertEntry_Update(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	rating := 3
	resp, _ := putJSON(srv, "/trips/trip-1/days/day-3/journal", map[string]any{
		"body":   json.RawMessage(`{"text":"first"}`),
		"rating": rating,
	})
	_ = resp.Body.Close()

	rating2 := 5
	resp2, _ := putJSON(srv, "/trips/trip-1/days/day-3/journal", map[string]any{
		"body":   json.RawMessage(`{"text":"updated"}`),
		"rating": rating2,
	})
	defer func() { _ = resp2.Body.Close() }()

	var out journalEntryResponse
	if err := json.NewDecoder(resp2.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Rating == nil || *out.Rating != 5 {
		t.Errorf("rating: got %v, want 5", out.Rating)
	}
}

func TestUpsertEntry_OptionalFields(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	weather := "sunny"
	mood := "happy"
	rating := 4
	resp, _ := putJSON(srv, "/trips/trip-1/days/day-4/journal", map[string]any{
		"weather": weather,
		"mood":    mood,
		"rating":  rating,
	})
	defer func() { _ = resp.Body.Close() }()

	var out journalEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Weather != "sunny" {
		t.Errorf("weather: got %q", out.Weather)
	}
	if out.Mood != "happy" {
		t.Errorf("mood: got %q", out.Mood)
	}
	if out.Rating == nil || *out.Rating != 4 {
		t.Errorf("rating: got %v, want 4", out.Rating)
	}
}

func TestUpsertEntry_InvalidRating(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	bad := 9
	resp, _ := putJSON(srv, "/trips/trip-1/days/day-5/journal", map[string]any{
		"rating": bad,
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("want 400, got %d", resp.StatusCode)
	}
}

func TestGetEntry_Found(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-6/journal", map[string]any{
		"body": json.RawMessage(`{"text":"hello"}`),
	})
	_ = putResp.Body.Close()

	resp, _ := getJSON(srv, "/trips/trip-1/days/day-6/journal")
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}
}

func TestGetEntry_NotFound(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	resp, _ := getJSON(srv, "/trips/trip-1/days/no-entry/journal")
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("want 404, got %d", resp.StatusCode)
	}
}

func TestUpsertEntry_Unauthorized(t *testing.T) {
	t.Parallel()
	// denyAuthz simulates a user who is not a trip member.
	store := newFakeStore()
	srv := newTestServer(t, store, denyAuthz{})

	resp, _ := putJSON(srv, "/trips/trip-1/days/day-7/journal", map[string]any{})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("want 404 (not found to avoid leaking), got %d", resp.StatusCode)
	}
}

// TestPackageCompiles is preserved for completeness.
func TestPackageCompiles(t *testing.T) {
	t.Parallel()
	_ = httpx.RouteRegistrar((*Module)(nil))
}

// --- photo upload tests ---

func uploadPhoto(srv *httptest.Server, path string, body []byte, contentType, caption string) (*http.Response, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	part, err := mw.CreateFormFile("photo", "test.jpg")
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(body); err != nil {
		return nil, err
	}
	if caption != "" {
		if err := mw.WriteField("caption", caption); err != nil {
			return nil, err
		}
	}
	_ = mw.Close()

	req, err := http.NewRequest(http.MethodPost, srv.URL+path, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	// Override the part's Content-Type since CreateFormFile defaults to application/octet-stream.
	// In real usage the client sets the file's Content-Type; for the test we patch the multipart header.
	// Instead, we use a helper that sets the Content-Type on the form part directly.
	_ = contentType // contentType is set in the part header below via the alternate helper
	return http.DefaultClient.Do(req)
}

// uploadPhotoWithType creates a multipart form with the given MIME type on the photo part.
func uploadPhotoWithType(srv *httptest.Server, path string, body []byte, mimeType, caption string) (*http.Response, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="photo"; filename="test.jpg"`)
	h.Set("Content-Type", mimeType)
	part, err := mw.CreatePart(h)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(body); err != nil {
		return nil, err
	}
	if caption != "" {
		if err := mw.WriteField("caption", caption); err != nil {
			return nil, err
		}
	}
	_ = mw.Close()

	req, err := http.NewRequest(http.MethodPost, srv.URL+path, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return http.DefaultClient.Do(req)
}

func TestUploadPhoto_Success(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	// First create the entry.
	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-A/journal", map[string]any{
		"body": json.RawMessage(`{"text":"hello"}`),
	})
	_ = putResp.Body.Close()

	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/day-A/journal/photos",
		[]byte("fake-jpeg-bytes"), "image/jpeg", "sunset view")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("want 201, got %d", resp.StatusCode)
	}

	var out photoResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Caption != "sunset view" {
		t.Errorf("caption: got %q", out.Caption)
	}
	if out.StorageURL == "" {
		t.Error("storage_url is empty")
	}
}

func TestUploadPhoto_EntryNotFound(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/no-entry/journal/photos",
		[]byte("bytes"), "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("want 404, got %d", resp.StatusCode)
	}
}

func TestUploadPhoto_InvalidMIME(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-B/journal", map[string]any{})
	_ = putResp.Body.Close()

	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/day-B/journal/photos",
		[]byte("bytes"), "application/pdf", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("want 422, got %d", resp.StatusCode)
	}
}

func TestUploadPhoto_EmptyFile(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-C/journal", map[string]any{})
	_ = putResp.Body.Close()

	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/day-C/journal/photos",
		[]byte{}, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("want 422, got %d", resp.StatusCode)
	}
}

func TestListPhotos_Empty(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-D/journal", map[string]any{})
	_ = putResp.Body.Close()

	resp, _ := http.Get(srv.URL + "/trips/trip-1/days/day-D/journal/photos")
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}
	var photos []photoResponse
	if err := json.NewDecoder(resp.Body).Decode(&photos); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(photos) != 0 {
		t.Errorf("want 0 photos, got %d", len(photos))
	}
}

func TestUploadPhoto_Unauthorized(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, denyAuthz{})

	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/day-E/journal/photos",
		[]byte("bytes"), "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("want 404, got %d", resp.StatusCode)
	}
}
