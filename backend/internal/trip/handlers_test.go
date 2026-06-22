package trip

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// fakeTripStore records the NewTrip it was handed and returns a canned result,
// so the handler policy (owner from session, server-set EUR/status, validation)
// can be tested without a database.
type fakeTripStore struct {
	gotCreate NewTrip
	createErr error
}

func (f *fakeTripStore) Create(_ context.Context, nt NewTrip) (Trip, error) {
	f.gotCreate = nt
	if f.createErr != nil {
		return Trip{}, f.createErr
	}
	// Echo the input back as a persisted row, applying the server-side defaults
	// the real store/DB would (id, EUR, active, timestamps) so the response shape
	// can be asserted.
	now := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)
	return Trip{
		ID:           "trip-1",
		OwnerID:      nt.OwnerID,
		Name:         nt.Name,
		Destinations: nt.Destinations,
		StartDate:    nt.StartDate,
		EndDate:      nt.EndDate,
		BaseCurrency: baseCurrencyEUR,
		Cover:        nt.Cover,
		Status:       statusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

// withPrincipal returns r carrying an authenticated principal, simulating a
// request that has passed RequireAuth.
func withPrincipal(r *http.Request, userID string) *http.Request {
	return r.WithContext(authn.WithPrincipal(r.Context(), authn.Principal{UserID: userID}))
}

func newCreateModule(store tripStore) *Module {
	return &Module{store: store, requireAuth: func(h http.Handler) http.Handler { return h }}
}

// TestHandleCreateSuccess asserts a valid create returns 201, the owner is taken
// from the session (not the body), EUR/active are server-set, and the body is
// echoed correctly.
func TestHandleCreateSuccess(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	// The body deliberately includes owner_id/base_currency/status to prove they
	// are ignored — unknown fields, never honoured.
	body := `{"name":"Lisbon","destinations":["Lisbon","Porto"],"start_date":"2026-07-01","end_date":"2026-07-10","cover":"https://x/c.jpg","owner_id":"attacker","base_currency":"USD","status":"archived"}`
	req := withPrincipal(httptest.NewRequest(http.MethodPost, TripsPath, strings.NewReader(body)), "owner-123")
	rec := httptest.NewRecorder()

	m.handleCreate(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotCreate.OwnerID != "owner-123" {
		t.Errorf("store owner_id = %q, want owner-123 (from session)", store.gotCreate.OwnerID)
	}

	var resp tripResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.BaseCurrency != "EUR" {
		t.Errorf("base_currency = %q, want EUR (server-set, body ignored)", resp.BaseCurrency)
	}
	if resp.Status != statusActive {
		t.Errorf("status = %q, want active (server-set, body ignored)", resp.Status)
	}
	if resp.OwnerID != "owner-123" {
		t.Errorf("response owner_id = %q, want owner-123", resp.OwnerID)
	}
	if resp.StartDate != "2026-07-01" || resp.EndDate != "2026-07-10" {
		t.Errorf("dates = %s..%s, want 2026-07-01..2026-07-10", resp.StartDate, resp.EndDate)
	}
}

// TestHandleCreateUnauthenticated asserts a request with no principal is 401 and
// never reaches the store.
func TestHandleCreateUnauthenticated(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	req := httptest.NewRequest(http.MethodPost, TripsPath, strings.NewReader(`{"name":"X","start_date":"2026-07-01","end_date":"2026-07-02"}`))
	rec := httptest.NewRecorder()
	m.handleCreate(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.gotCreate.OwnerID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// TestHandleCreateRejectsInvalid covers the 400 paths: malformed JSON, missing
// name, and end before start.
func TestHandleCreateRejectsInvalid(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
	}{
		{"invalid json", `{not json`},
		{"missing name", `{"start_date":"2026-07-01","end_date":"2026-07-02"}`},
		{"end before start", `{"name":"X","start_date":"2026-07-10","end_date":"2026-07-01"}`},
		{"missing dates", `{"name":"X"}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &fakeTripStore{}
			m := newCreateModule(store)
			req := withPrincipal(httptest.NewRequest(http.MethodPost, TripsPath, strings.NewReader(tc.body)), "owner-123")
			rec := httptest.NewRecorder()
			m.handleCreate(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
			if store.gotCreate.OwnerID != "" {
				t.Error("store should not be called when the request is invalid")
			}
		})
	}
}
