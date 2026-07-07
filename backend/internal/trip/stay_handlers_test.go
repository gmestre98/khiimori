package trip

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// fakeStayStore records calls and returns canned results so stay handler policy
// can be tested without a database.
type fakeStayStore struct {
	gotCreate    NewStay
	createResult Stay
	createErr    error

	gotUpdateTripID string
	gotUpdateStayID string
	gotUpdate       EditStay
	updateErr       error

	gotDeleteTripID string
	gotDeleteStayID string
	deleteErr       error
}

func (f *fakeStayStore) CreateStay(_ context.Context, ns NewStay) (Stay, error) {
	f.gotCreate = ns
	if f.createErr != nil {
		return Stay{}, f.createErr
	}
	if f.createResult.ID != "" {
		return f.createResult, nil
	}
	return Stay{
		ID:       "stay-1",
		TripID:   ns.TripID,
		Name:     ns.Name,
		Location: ns.Location,
		CheckIn:  ns.CheckIn,
		CheckOut: ns.CheckOut,
		Cost:     ns.Cost,
		Link:     ns.Link,
	}, nil
}

func (f *fakeStayStore) UpdateStay(_ context.Context, tripID, stayID string, e EditStay) (Stay, error) {
	f.gotUpdateTripID = tripID
	f.gotUpdateStayID = stayID
	f.gotUpdate = e
	if f.updateErr != nil {
		return Stay{}, f.updateErr
	}
	return Stay{
		ID:       stayID,
		TripID:   tripID,
		Name:     e.Name,
		Location: e.Location,
		CheckIn:  e.CheckIn,
		CheckOut: e.CheckOut,
		Cost:     e.Cost,
		Link:     e.Link,
	}, nil
}

func (f *fakeStayStore) DeleteStay(_ context.Context, tripID, stayID string) error {
	f.gotDeleteTripID = tripID
	f.gotDeleteStayID = stayID
	return f.deleteErr
}

func (f *fakeStayStore) StaysForDay(_ context.Context, _ string, _ string) ([]Stay, error) {
	return nil, nil
}

// newStayModule constructs a Module wired to both a trip store and stay store
// for stay handler tests.
func newStayModule(tripSt tripStore, staySt stayStore) *Module {
	return &Module{
		store:       tripSt,
		stays:       staySt,
		requireAuth: func(h http.Handler) http.Handler { return h },
		authz:       allowAllAuthorizer{},
		now:         func() time.Time { return fixedNow },
	}
}

// denyAllAuthorizer is a test-only Authorizer that denies every request.
type denyAllAuthorizer struct{}

func (denyAllAuthorizer) Can(_ context.Context, _ string, _ Action, _ string) (bool, error) {
	return false, nil
}

// createStayReq builds a POST /trips/{id}/stays request.
func createStayReq(tripID, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TripsPath+"/"+tripID+"/stays", strings.NewReader(body))
	req.SetPathValue("id", tripID)
	return withPrincipal(req, userID)
}

// updateStayReq builds a PATCH /trips/{id}/stays/{stayID} request.
func updateStayReq(tripID, stayID, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPatch, TripsPath+"/"+tripID+"/stays/"+stayID, strings.NewReader(body))
	req.SetPathValue("id", tripID)
	req.SetPathValue("stayID", stayID)
	return withPrincipal(req, userID)
}

// deleteStayReq builds a DELETE /trips/{id}/stays/{stayID} request.
func deleteStayReq(tripID, stayID, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodDelete, TripsPath+"/"+tripID+"/stays/"+stayID, http.NoBody)
	req.SetPathValue("id", tripID)
	req.SetPathValue("stayID", stayID)
	return withPrincipal(req, userID)
}

// TestHandleCreateStaySuccess asserts a minimal create (name only) returns 201
// with the correct body fields.
func TestHandleCreateStaySuccess(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	body := `{"name":"Lisbon Hotel"}`
	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, createStayReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if stays.gotCreate.TripID != "trip-1" {
		t.Errorf("store trip_id = %q, want trip-1 (from path)", stays.gotCreate.TripID)
	}
	if stays.gotCreate.Name != "Lisbon Hotel" {
		t.Errorf("store name = %q, want Lisbon Hotel", stays.gotCreate.Name)
	}

	var resp stayResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ID == "" {
		t.Error("response id should not be empty")
	}
	if resp.TripID != "trip-1" {
		t.Errorf("response trip_id = %q, want trip-1", resp.TripID)
	}
}

// TestHandleCreateStayWithAllFields asserts optional fields (dates, cost, link,
// location) are passed through to the store.
func TestHandleCreateStayWithAllFields(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	cost := 199.99
	body := `{"name":"Airbnb","location":"Porto","check_in":"2026-07-01","check_out":"2026-07-05","cost":199.99,"link":"https://airbnb.com/rooms/1"}`
	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, createStayReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	ns := stays.gotCreate
	if ns.Location == nil || *ns.Location != "Porto" {
		t.Errorf("location = %v, want Porto", ns.Location)
	}
	if ns.CheckIn == nil || ns.CheckIn.Format(dateLayout) != "2026-07-01" {
		t.Errorf("check_in = %v, want 2026-07-01", ns.CheckIn)
	}
	if ns.CheckOut == nil || ns.CheckOut.Format(dateLayout) != "2026-07-05" {
		t.Errorf("check_out = %v, want 2026-07-05", ns.CheckOut)
	}
	if ns.Cost == nil || *ns.Cost != cost {
		t.Errorf("cost = %v, want %v", ns.Cost, cost)
	}
	if ns.Link == nil || *ns.Link != "https://airbnb.com/rooms/1" {
		t.Errorf("link = %v, want https://airbnb.com/rooms/1", ns.Link)
	}
}

// TestHandleCreateStayClientID asserts a client-supplied id is forwarded as
// ClientID to the store (upsert path for Epic 06 replay).
func TestHandleCreateStayClientID(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	body := `{"id":"client-uuid-123","name":"Hostel"}`
	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, createStayReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if stays.gotCreate.ClientID != "client-uuid-123" {
		t.Errorf("ClientID = %q, want client-uuid-123", stays.gotCreate.ClientID)
	}
}

// TestHandleCreateStayRejectsMissingName asserts a missing name is 400.
func TestHandleCreateStayRejectsMissingName(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, createStayReq("trip-1", "owner-1", `{"location":"Porto"}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if stays.gotCreate.TripID != "" {
		t.Error("store should not be called for an invalid request")
	}
}

// TestHandleCreateStayRejectsCheckOutBeforeCheckIn asserts that check_out
// before check_in is 400.
func TestHandleCreateStayRejectsCheckOutBeforeCheckIn(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	body := `{"name":"Hotel","check_in":"2026-07-10","check_out":"2026-07-01"}`
	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, createStayReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

// TestHandleCreateStayUnauthenticated asserts a missing session is 401 and
// the store is not called.
func TestHandleCreateStayUnauthenticated(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	req := httptest.NewRequest(http.MethodPost, TripsPath+"/trip-1/stays", strings.NewReader(`{"name":"Hotel"}`))
	req.SetPathValue("id", "trip-1")
	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if stays.gotCreate.TripID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// TestHandleCreateStayUnauthorized asserts that a denied Authorizer results in
// 404 (presence oracle protection) and the stay store is not called.
func TestHandleCreateStayUnauthorized(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := &Module{
		store:       &fakeTripStore{},
		stays:       stays,
		requireAuth: func(h http.Handler) http.Handler { return h },
		authz:       denyAllAuthorizer{},
		now:         func() time.Time { return fixedNow },
	}

	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, createStayReq("trip-1", "other-user", `{"name":"Hotel"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if stays.gotCreate.TripID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}

// TestHandleUpdateStaySuccess asserts a valid edit returns 200 with the
// correct body, and the store is called with the correct trip/stay IDs.
func TestHandleUpdateStaySuccess(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	body := `{"name":"Grand Hostel","location":"Lisbon","check_in":"2026-08-01","check_out":"2026-08-03"}`
	rec := httptest.NewRecorder()
	m.handleUpdateStay(rec, updateStayReq("trip-9", "stay-7", "owner-1", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if stays.gotUpdateTripID != "trip-9" {
		t.Errorf("store trip_id = %q, want trip-9", stays.gotUpdateTripID)
	}
	if stays.gotUpdateStayID != "stay-7" {
		t.Errorf("store stay_id = %q, want stay-7", stays.gotUpdateStayID)
	}

	var resp stayResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Name != "Grand Hostel" {
		t.Errorf("name = %q, want Grand Hostel", resp.Name)
	}
	if resp.CheckIn != "2026-08-01" {
		t.Errorf("check_in = %q, want 2026-08-01", resp.CheckIn)
	}
}

// TestHandleUpdateStayNotFound asserts errStayNotFound maps to 404.
func TestHandleUpdateStayNotFound(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{updateErr: errStayNotFound}
	m := newStayModule(&fakeTripStore{}, stays)

	body := `{"name":"X"}`
	rec := httptest.NewRecorder()
	m.handleUpdateStay(rec, updateStayReq("trip-9", "missing", "owner-1", body))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleUpdateStayUnauthenticated asserts a missing session is 401.
func TestHandleUpdateStayUnauthenticated(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	req := httptest.NewRequest(http.MethodPatch, TripsPath+"/trip-9/stays/stay-7", strings.NewReader(`{"name":"X"}`))
	req.SetPathValue("id", "trip-9")
	req.SetPathValue("stayID", "stay-7")
	rec := httptest.NewRecorder()
	m.handleUpdateStay(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

// TestHandleUpdateStayUnauthorized asserts a denied Authorizer is 404 (presence oracle protection).
func TestHandleUpdateStayUnauthorized(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := &Module{
		store:       &fakeTripStore{},
		stays:       stays,
		requireAuth: func(h http.Handler) http.Handler { return h },
		authz:       denyAllAuthorizer{},
		now:         func() time.Time { return fixedNow },
	}

	rec := httptest.NewRecorder()
	m.handleUpdateStay(rec, updateStayReq("trip-9", "stay-7", "other-user", `{"name":"X"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if stays.gotUpdateTripID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}

// TestHandleDeleteStaySuccess asserts a valid delete returns 204 with no body.
func TestHandleDeleteStaySuccess(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	rec := httptest.NewRecorder()
	m.handleDeleteStay(rec, deleteStayReq("trip-9", "stay-7", "owner-1"))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body=%s", rec.Code, rec.Body.String())
	}
	if stays.gotDeleteTripID != "trip-9" {
		t.Errorf("store trip_id = %q, want trip-9", stays.gotDeleteTripID)
	}
	if stays.gotDeleteStayID != "stay-7" {
		t.Errorf("store stay_id = %q, want stay-7", stays.gotDeleteStayID)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("expected empty body on 204, got: %s", rec.Body.String())
	}
}

// TestHandleDeleteStayUnauthenticated asserts a missing session is 401.
func TestHandleDeleteStayUnauthenticated(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := newStayModule(&fakeTripStore{}, stays)

	req := httptest.NewRequest(http.MethodDelete, TripsPath+"/trip-9/stays/stay-7", http.NoBody)
	req.SetPathValue("id", "trip-9")
	req.SetPathValue("stayID", "stay-7")
	rec := httptest.NewRecorder()
	m.handleDeleteStay(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if stays.gotDeleteTripID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// TestHandleDeleteStayUnauthorized asserts a denied Authorizer is 404 (presence
// oracle protection) and the store is not called.
func TestHandleDeleteStayUnauthorized(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{}
	m := &Module{
		store:       &fakeTripStore{},
		stays:       stays,
		requireAuth: func(h http.Handler) http.Handler { return h },
		authz:       denyAllAuthorizer{},
		now:         func() time.Time { return fixedNow },
	}

	rec := httptest.NewRecorder()
	m.handleDeleteStay(rec, deleteStayReq("trip-9", "stay-7", "other-user"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if stays.gotDeleteTripID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}

// --- One stay per night (M12.1 S3) ---------------------------------------

// TestHandleCreateStayOverlapReturns409 asserts that when the store reports an
// overlapping stay, the create handler responds 409 with the stay_overlap code.
func TestHandleCreateStayOverlapReturns409(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{createErr: errStayOverlap}
	m := newStayModule(&fakeTripStore{}, stays)

	body := `{"name":"Second Hotel","check_in":"2026-08-02","check_out":"2026-08-05"}`
	rec := httptest.NewRecorder()
	m.handleCreateStay(rec, createStayReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "stay_overlap") {
		t.Errorf("body = %s, want stay_overlap error code", rec.Body.String())
	}
}

// TestHandleUpdateStayOverlapReturns409 asserts an edit that the store reports as
// overlapping responds 409.
func TestHandleUpdateStayOverlapReturns409(t *testing.T) {
	t.Parallel()

	stays := &fakeStayStore{updateErr: errStayOverlap}
	m := newStayModule(&fakeTripStore{}, stays)

	body := `{"name":"Moved Hotel","check_in":"2026-08-02","check_out":"2026-08-05"}`
	rec := httptest.NewRecorder()
	m.handleUpdateStay(rec, updateStayReq("trip-1", "stay-1", "owner-1", body))

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "stay_overlap") {
		t.Errorf("body = %s, want stay_overlap error code", rec.Body.String())
	}
}
