package journal

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	return &Module{store: store, authz: authz, requireAuth: requireAuth}
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
