package journal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// compile-time check that fakeStore satisfies journalStore
var _ journalStore = (*fakeStore)(nil)

// --- fakes ---

type fakeStore struct {
	entries       map[string]JournalEntry // keyed by dayID
	photos        []Photo
	usageByTripID map[string]int64
}

func newFakeStore() *fakeStore {
	return &fakeStore{entries: map[string]JournalEntry{}, usageByTripID: map[string]int64{}}
}

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
	s.photos = append(s.photos, p)
	return p, nil
}

func (s *fakeStore) ListPhotos(_ context.Context, journalEntryID string) ([]Photo, error) {
	var out []Photo
	for _, p := range s.photos {
		if p.JournalEntryID == journalEntryID {
			out = append(out, p)
		}
	}
	return out, nil
}

func (s *fakeStore) TripUsageBytes(_ context.Context, tripID string) (int64, error) {
	return s.usageByTripID[tripID], nil
}

func (s *fakeStore) UpdatePhotoThumbnail(_ context.Context, photoID, thumbnailURL string) error {
	for i, p := range s.photos {
		if p.ID == photoID {
			s.photos[i].ThumbnailURL = thumbnailURL
			return nil
		}
	}
	return nil
}

func (s *fakeStore) DeletePhotoForTrip(_ context.Context, photoID, _ string) (Photo, error) {
	for i, p := range s.photos {
		if p.ID == photoID {
			s.photos = append(s.photos[:i], s.photos[i+1:]...)
			return p, nil
		}
	}
	return Photo{}, ErrPhotoNotFound
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
	return &Module{store: store, authz: authz, requireAuth: requireAuth, media: newFakeMediaStore(), quotaCap: DefaultQuotaCap}
}

func newTestModuleWithCap(store journalStore, authz Authorizer, cap int64) *Module {
	m := newTestModule(store, authz)
	m.quotaCap = cap
	return m
}

func newTestServerWithCap(t *testing.T, store journalStore, authz Authorizer, cap int64) *httptest.Server {
	t.Helper()
	mod := newTestModuleWithCap(store, authz, cap)
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
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

// --- cap enforcement tests ---

// TestUploadPhoto_UnderCap verifies an upload is allowed when below the cap.
func TestUploadPhoto_UnderCap(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	store.usageByTripID["trip-1"] = 0
	const cap = 1024
	srv := newTestServerWithCap(t, store, allowAuthz{}, cap)

	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-A/journal", map[string]any{})
	_ = putResp.Body.Close()

	img := bytes.Repeat([]byte("X"), 512) // 512 bytes < 1024 cap
	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/day-A/journal/photos", img, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("want 201, got %d", resp.StatusCode)
	}
}

// TestUploadPhoto_AtCap verifies an upload is rejected when it would exactly hit the cap.
// "at cap" means used+size == cap, which is allowed (≤ not <).
func TestUploadPhoto_AtCap(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	const cap = 1024
	store.usageByTripID["trip-1"] = 512 // 512 already used
	srv := newTestServerWithCap(t, store, allowAuthz{}, cap)

	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-A/journal", map[string]any{})
	_ = putResp.Body.Close()

	img := bytes.Repeat([]byte("X"), 512) // 512 bytes: 512+512 == cap → allowed
	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/day-A/journal/photos", img, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("want 201 at cap boundary, got %d", resp.StatusCode)
	}
}

// TestUploadPhoto_OverCap verifies an upload is rejected without storage when it exceeds the cap.
func TestUploadPhoto_OverCap(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	const cap = 1024
	store.usageByTripID["trip-1"] = 600 // 600 already used
	srv := newTestServerWithCap(t, store, allowAuthz{}, cap)

	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-A/journal", map[string]any{})
	_ = putResp.Body.Close()

	img := bytes.Repeat([]byte("X"), 512) // 512 bytes: 600+512 > cap → rejected
	resp, err := uploadPhotoWithType(srv, "/trips/trip-1/days/day-A/journal/photos", img, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("want 413, got %d", resp.StatusCode)
	}
	// Nothing should be stored.
	if len(store.photos) != 0 {
		t.Errorf("expected no photos stored on over-cap rejection, got %d", len(store.photos))
	}
}

// --- usage exposure & delete tests ---

// TestGetUsage_ReturnsUsedAndCap verifies the usage endpoint returns correct values.
func TestGetUsage_ReturnsUsedAndCap(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	store.usageByTripID["trip-1"] = 500
	const cap = 1024
	srv := newTestServerWithCap(t, store, allowAuthz{}, cap)

	resp, err := http.Get(srv.URL + "/trips/trip-1/usage")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}

	var out usageResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.UsedBytes != 500 {
		t.Errorf("used_bytes: got %d, want 500", out.UsedBytes)
	}
	if out.CapBytes != cap {
		t.Errorf("cap_bytes: got %d, want %d", out.CapBytes, cap)
	}
	if out.NearCap {
		t.Error("near_cap: should be false at 500/1024")
	}
}

// TestGetUsage_NearCap verifies near_cap is true when usage exceeds 80%.
func TestGetUsage_NearCap(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	store.usageByTripID["trip-1"] = 850
	const cap = 1000
	srv := newTestServerWithCap(t, store, allowAuthz{}, cap)

	resp, _ := http.Get(srv.URL + "/trips/trip-1/usage")
	defer func() { _ = resp.Body.Close() }()

	var out usageResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.NearCap {
		t.Errorf("near_cap: expected true at %d/%d", out.UsedBytes, out.CapBytes)
	}
}

// TestDeletePhoto_Success verifies a photo can be deleted and storage is cleaned up.
func TestDeletePhoto_Success(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	// Create entry and upload photo.
	putResp, _ := putJSON(srv, "/trips/trip-1/days/day-A/journal", map[string]any{})
	_ = putResp.Body.Close()

	img := bytes.Repeat([]byte("X"), 512)
	uploadResp, _ := uploadPhotoWithType(srv, "/trips/trip-1/days/day-A/journal/photos", img, "image/jpeg", "")
	defer func() { _ = uploadResp.Body.Close() }()

	var uploaded photoResponse
	if err := json.NewDecoder(uploadResp.Body).Decode(&uploaded); err != nil {
		t.Fatalf("decode upload: %v", err)
	}

	// Delete the photo.
	delReq, _ := http.NewRequest(http.MethodDelete,
		srv.URL+fmt.Sprintf("/trips/trip-1/days/day-A/journal/photos/%s", uploaded.ID), nil)
	delResp, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	_ = delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Errorf("want 204, got %d", delResp.StatusCode)
	}

	// Photo should be gone.
	if len(store.photos) != 0 {
		t.Errorf("want 0 photos, got %d", len(store.photos))
	}
}

// TestDeletePhoto_NotFound verifies 404 for a non-existent photo.
func TestDeletePhoto_NotFound(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	req, _ := http.NewRequest(http.MethodDelete,
		srv.URL+"/trips/trip-1/days/day-A/journal/photos/non-existent", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("want 404, got %d", resp.StatusCode)
	}
}

// --- usage tracking tests ---

// TestFakeStore_TripUsageBytes verifies that TripUsageBytes returns the
// pre-seeded value from the fake, giving coverage for the interface contract.
func TestFakeStore_TripUsageBytes(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	store.usageByTripID["trip-1"] = 512
	ctx := context.Background()
	got, err := store.TripUsageBytes(ctx, "trip-1")
	if err != nil {
		t.Fatalf("TripUsageBytes: %v", err)
	}
	if got != 512 {
		t.Errorf("usage: got %d, want 512", got)
	}
	// Unknown trip → zero.
	got2, err := store.TripUsageBytes(ctx, "unknown")
	if err != nil {
		t.Fatalf("TripUsageBytes unknown: %v", err)
	}
	if got2 != 0 {
		t.Errorf("unknown trip usage: got %d, want 0", got2)
	}
}
