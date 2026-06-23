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

// fakeTripStore records what it was handed and returns a canned result, so the
// handler policy (owner from session, server-set EUR/status, validation,
// owner-scoping) can be tested without a database.
type fakeTripStore struct {
	gotCreate NewTrip
	createErr error

	gotUpdateID    string
	gotUpdateOwner string
	gotUpdate      EditTrip
	updateErr      error

	gotArchiveID    string
	gotArchiveOwner string
	archiveErr      error

	gotUnarchiveID    string
	gotUnarchiveOwner string
	unarchiveErr      error

	gotDeleteID    string
	gotDeleteOwner string
	deleteErr      error

	gotGetDayTripID  string
	gotGetDayOwnerID string
	gotGetDayDate    string
	getDayResult     Day
	getDayErr        error

	gotListUserID string
	listResult    []Trip
	listErr       error
}

func (f *fakeTripStore) Update(_ context.Context, id, ownerID string, e EditTrip) (Trip, error) {
	f.gotUpdateID = id
	f.gotUpdateOwner = ownerID
	f.gotUpdate = e
	if f.updateErr != nil {
		return Trip{}, f.updateErr
	}
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	return Trip{
		ID:           id,
		OwnerID:      ownerID,
		Name:         e.Name,
		Destinations: e.Destinations,
		StartDate:    e.StartDate,
		EndDate:      e.EndDate,
		BaseCurrency: baseCurrencyEUR,
		Cover:        e.Cover,
		Status:       statusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
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

func (f *fakeTripStore) Archive(_ context.Context, id, ownerID string) (Trip, error) {
	f.gotArchiveID = id
	f.gotArchiveOwner = ownerID
	if f.archiveErr != nil {
		return Trip{}, f.archiveErr
	}
	now := time.Date(2026, 6, 22, 12, 0, 0, 0, time.UTC)
	return Trip{
		ID: id, OwnerID: ownerID, Name: "trip", Destinations: []string{},
		StartDate: now, EndDate: now, BaseCurrency: baseCurrencyEUR,
		Status: "archived", CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (f *fakeTripStore) Unarchive(_ context.Context, id, ownerID string) (Trip, error) {
	f.gotUnarchiveID = id
	f.gotUnarchiveOwner = ownerID
	if f.unarchiveErr != nil {
		return Trip{}, f.unarchiveErr
	}
	now := time.Date(2026, 6, 22, 12, 0, 0, 0, time.UTC)
	return Trip{
		ID: id, OwnerID: ownerID, Name: "trip", Destinations: []string{},
		StartDate: now, EndDate: now, BaseCurrency: baseCurrencyEUR,
		Status: statusActive, CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (f *fakeTripStore) Delete(_ context.Context, id, ownerID string) error {
	f.gotDeleteID = id
	f.gotDeleteOwner = ownerID
	return f.deleteErr
}

func (f *fakeTripStore) GetDay(_ context.Context, tripID, ownerID, date string) (Day, error) {
	f.gotGetDayTripID = tripID
	f.gotGetDayOwnerID = ownerID
	f.gotGetDayDate = date
	return f.getDayResult, f.getDayErr
}

func (f *fakeTripStore) List(_ context.Context, userID string) ([]Trip, error) {
	f.gotListUserID = userID
	return f.listResult, f.listErr
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

// updateReq builds a PATCH request for trip id carrying the body and an
// authenticated principal, with the path value set (as the router would).
func updateReq(id, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPatch, TripsPath+"/"+id, strings.NewReader(body))
	req.SetPathValue("id", id)
	return withPrincipal(req, userID)
}

// TestHandleUpdateSuccess asserts a valid edit returns 200 with the id from the
// path and the owner from the session, and that EUR/owner are unchanged.
func TestHandleUpdateSuccess(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	body := `{"name":"Lisbon 2","destinations":["Sintra"],"start_date":"2026-08-01","end_date":"2026-08-05","cover":"","base_currency":"USD","owner_id":"attacker"}`
	rec := httptest.NewRecorder()
	m.handleUpdate(rec, updateReq("trip-9", "owner-123", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotUpdateID != "trip-9" {
		t.Errorf("store id = %q, want trip-9 (from path)", store.gotUpdateID)
	}
	if store.gotUpdateOwner != "owner-123" {
		t.Errorf("store owner = %q, want owner-123 (from session)", store.gotUpdateOwner)
	}
	var resp tripResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.BaseCurrency != "EUR" {
		t.Errorf("base_currency = %q, want EUR (immutable)", resp.BaseCurrency)
	}
	if resp.Name != "Lisbon 2" || resp.StartDate != "2026-08-01" {
		t.Errorf("edit not applied: name=%q start=%q", resp.Name, resp.StartDate)
	}
}

// TestHandleUpdateNotFound asserts the store's not-found maps to a 404.
func TestHandleUpdateNotFound(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{updateErr: errTripNotFound}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	body := `{"name":"X","start_date":"2026-08-01","end_date":"2026-08-05"}`
	m.handleUpdate(rec, updateReq("missing", "owner-123", body))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleUpdateRejectsInvalid asserts an invalid edit (end before start) is a
// 400 and never reaches the store.
func TestHandleUpdateRejectsInvalid(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	body := `{"name":"X","start_date":"2026-08-10","end_date":"2026-08-01"}`
	m.handleUpdate(rec, updateReq("trip-9", "owner-123", body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if store.gotUpdateID != "" {
		t.Error("store should not be called for an invalid edit")
	}
}

// TestHandleUpdateUnauthenticated asserts a request with no principal is 401 and
// never reaches the store.
func TestHandleUpdateUnauthenticated(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	req := httptest.NewRequest(http.MethodPatch, TripsPath+"/trip-9", strings.NewReader(`{"name":"X","start_date":"2026-08-01","end_date":"2026-08-05"}`))
	req.SetPathValue("id", "trip-9")
	rec := httptest.NewRecorder()
	m.handleUpdate(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.gotUpdateID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// archiveReq builds a POST request for /{id}/archive with an authenticated
// principal and the path value set (as the router would).
func archiveReq(id, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TripsPath+"/"+id+"/archive", http.NoBody)
	req.SetPathValue("id", id)
	return withPrincipal(req, userID)
}

// unarchiveReq builds a POST request for /{id}/unarchive.
func unarchiveReq(id, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TripsPath+"/"+id+"/unarchive", http.NoBody)
	req.SetPathValue("id", id)
	return withPrincipal(req, userID)
}

// deleteReq builds a DELETE request for /{id}.
func deleteReq(id, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodDelete, TripsPath+"/"+id, http.NoBody)
	req.SetPathValue("id", id)
	return withPrincipal(req, userID)
}

// TestHandleArchiveSuccess asserts a valid archive request returns 200 with
// status=archived, owner from session, and the id from the path.
func TestHandleArchiveSuccess(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleArchive(rec, archiveReq("trip-7", "owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotArchiveID != "trip-7" {
		t.Errorf("store id = %q, want trip-7 (from path)", store.gotArchiveID)
	}
	if store.gotArchiveOwner != "owner-1" {
		t.Errorf("store owner = %q, want owner-1 (from session)", store.gotArchiveOwner)
	}
	var resp tripResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Status != "archived" {
		t.Errorf("status = %q, want archived", resp.Status)
	}
}

// TestHandleArchiveNotFound asserts the store's not-found maps to 404.
func TestHandleArchiveNotFound(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{archiveErr: errTripNotFound}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleArchive(rec, archiveReq("missing", "owner-1"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleArchiveUnauthenticated asserts a request with no principal is 401.
func TestHandleArchiveUnauthenticated(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	req := httptest.NewRequest(http.MethodPost, TripsPath+"/trip-7/archive", http.NoBody)
	req.SetPathValue("id", "trip-7")
	rec := httptest.NewRecorder()
	m.handleArchive(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.gotArchiveID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// TestHandleUnarchiveSuccess asserts a valid unarchive request returns 200 with
// status=active.
func TestHandleUnarchiveSuccess(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleUnarchive(rec, unarchiveReq("trip-7", "owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotUnarchiveOwner != "owner-1" {
		t.Errorf("store owner = %q, want owner-1 (from session)", store.gotUnarchiveOwner)
	}
	var resp tripResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Status != statusActive {
		t.Errorf("status = %q, want active", resp.Status)
	}
}

// TestHandleUnarchiveNotFound asserts not-found maps to 404.
func TestHandleUnarchiveNotFound(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{unarchiveErr: errTripNotFound}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleUnarchive(rec, unarchiveReq("missing", "owner-1"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleDeleteSuccess asserts a valid delete returns 204 with no body.
func TestHandleDeleteSuccess(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleDelete(rec, deleteReq("trip-7", "owner-1"))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotDeleteID != "trip-7" {
		t.Errorf("store id = %q, want trip-7 (from path)", store.gotDeleteID)
	}
	if store.gotDeleteOwner != "owner-1" {
		t.Errorf("store owner = %q, want owner-1 (from session)", store.gotDeleteOwner)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("expected empty body on 204, got: %s", rec.Body.String())
	}
}

// TestHandleDeleteNotFound asserts the store's not-found maps to 404.
func TestHandleDeleteNotFound(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{deleteErr: errTripNotFound}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleDelete(rec, deleteReq("missing", "owner-1"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleDeleteUnauthenticated asserts a request with no principal is 401.
func TestHandleDeleteUnauthenticated(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	req := httptest.NewRequest(http.MethodDelete, TripsPath+"/trip-7", http.NoBody)
	req.SetPathValue("id", "trip-7")
	rec := httptest.NewRecorder()
	m.handleDelete(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.gotDeleteID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// getDayReq builds a GET request for /trips/{id}/days/{date} with an
// authenticated principal and path values set (as the router would).
func getDayReq(tripID, date, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, TripsPath+"/"+tripID+"/days/"+date, http.NoBody)
	req.SetPathValue("id", tripID)
	req.SetPathValue("date", date)
	return withPrincipal(req, userID)
}

// TestHandleGetDaySuccess asserts that a found day returns 200 with the correct
// JSON fields, and that the store is called with the correct tripID, ownerID,
// and date (from the path and session respectively).
func TestHandleGetDaySuccess(t *testing.T) {
	t.Parallel()

	d := mustDate(t, "2026-07-03")
	store := &fakeTripStore{getDayResult: Day{
		ID:     "day-uuid",
		TripID: "trip-uuid",
		Date:   d,
		Index:  2,
		Notes:  "",
	}}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleGetDay(rec, getDayReq("trip-uuid", "2026-07-03", "owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotGetDayTripID != "trip-uuid" {
		t.Errorf("store trip_id = %q, want trip-uuid", store.gotGetDayTripID)
	}
	if store.gotGetDayOwnerID != "owner-1" {
		t.Errorf("store owner_id = %q, want owner-1 (from session)", store.gotGetDayOwnerID)
	}
	if store.gotGetDayDate != "2026-07-03" {
		t.Errorf("store date = %q, want 2026-07-03", store.gotGetDayDate)
	}

	var resp dayResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.ID != "day-uuid" {
		t.Errorf("id = %q, want day-uuid", resp.ID)
	}
	if resp.Date != "2026-07-03" {
		t.Errorf("date = %q, want 2026-07-03", resp.Date)
	}
	if resp.Index != 2 {
		t.Errorf("index = %d, want 2", resp.Index)
	}
}

// TestHandleGetDayNotFound asserts that errDayNotFound maps to 404.
func TestHandleGetDayNotFound(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{getDayErr: errDayNotFound}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleGetDay(rec, getDayReq("trip-uuid", "2026-07-03", "owner-1"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleGetDayMalformedDate asserts that a malformed date in the path is a
// 404 (semantically "no such day") and never reaches the store.
func TestHandleGetDayMalformedDate(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleGetDay(rec, getDayReq("trip-uuid", "not-a-date", "owner-1"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for malformed date", rec.Code)
	}
	if store.gotGetDayTripID != "" {
		t.Error("store should not be called for a malformed date")
	}
}

// TestHandleGetDayUnauthenticated asserts that a request without a principal is
// 401 and never reaches the store.
func TestHandleGetDayUnauthenticated(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	req := httptest.NewRequest(http.MethodGet, TripsPath+"/trip-uuid/days/2026-07-03", http.NoBody)
	req.SetPathValue("id", "trip-uuid")
	req.SetPathValue("date", "2026-07-03")
	rec := httptest.NewRecorder()
	m.handleGetDay(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.gotGetDayTripID != "" {
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

// listReq builds a GET /trips request optionally with a principal.
func listReq(userID string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, TripsPath, http.NoBody)
	if userID != "" {
		req = withPrincipal(req, userID)
	}
	return req
}

// makeTrip builds a Trip for list handler tests. today is used as a reference
// point to construct trips in different buckets.
func makeTrip(id string, start, end time.Time) Trip {
	now := time.Date(2026, 6, 23, 12, 0, 0, 0, time.UTC)
	return Trip{
		ID:           id,
		OwnerID:      "owner-1",
		Name:         "Trip " + id,
		Destinations: []string{},
		StartDate:    start,
		EndDate:      end,
		BaseCurrency: baseCurrencyEUR,
		Status:       statusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
}

// TestHandleListUnauthenticated asserts that a missing session is a 401.
func TestHandleListUnauthenticated(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleList(rec, listReq(""))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.gotListUserID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// TestHandleListPassesUserIDToStore asserts the handler passes the session
// principal's user ID to the store.
func TestHandleListPassesUserIDToStore(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{listResult: []Trip{}}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleList(rec, listReq("user-42"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if store.gotListUserID != "user-42" {
		t.Errorf("store called with user_id %q, want user-42", store.gotListUserID)
	}
}

// TestHandleListBuckets asserts trips are distributed into the correct buckets
// and the current trip is flagged. Uses a fixed reference date (2026-06-23) via
// trips whose dates straddle that day.
func TestHandleListBuckets(t *testing.T) {
	t.Parallel()

	ref := time.Date(2026, 6, 23, 0, 0, 0, 0, time.UTC)
	current := makeTrip("current-1", ref.AddDate(0, 0, -1), ref.AddDate(0, 0, 1))
	upcoming := makeTrip("upcoming-1", ref.AddDate(0, 0, 2), ref.AddDate(0, 0, 5))
	past := makeTrip("past-1", ref.AddDate(0, 0, -10), ref.AddDate(0, 0, -2))

	store := &fakeTripStore{listResult: []Trip{current, upcoming, past}}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleList(rec, listReq("owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp listResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(resp.Current) != 1 || resp.Current[0].ID != "current-1" {
		t.Errorf("current bucket = %v, want [current-1]", resp.Current)
	}
	if !resp.Current[0].IsCurrent {
		t.Error("current trip should have is_current=true")
	}
	if len(resp.Upcoming) != 1 || resp.Upcoming[0].ID != "upcoming-1" {
		t.Errorf("upcoming bucket = %v, want [upcoming-1]", resp.Upcoming)
	}
	if resp.Upcoming[0].IsCurrent {
		t.Error("upcoming trip should have is_current=false")
	}
	if len(resp.Past) != 1 || resp.Past[0].ID != "past-1" {
		t.Errorf("past bucket = %v, want [past-1]", resp.Past)
	}
	if resp.Past[0].IsCurrent {
		t.Error("past trip should have is_current=false")
	}
}

// TestHandleListEmptyBuckets asserts that empty buckets are returned as empty
// arrays (not null) for a stable client contract.
func TestHandleListEmptyBuckets(t *testing.T) {
	t.Parallel()

	store := &fakeTripStore{listResult: []Trip{}}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleList(rec, listReq("owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&raw); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, key := range []string{"current", "upcoming", "past"} {
		if string(raw[key]) != "[]" {
			t.Errorf("%s bucket = %s, want []", key, raw[key])
		}
	}
}
