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

// fakePlanItemStore records calls and returns canned results so plan-item
// handler policy can be tested without a database.
type fakePlanItemStore struct {
	gotCreate    NewPlanItem
	createResult PlanItem
	createErr    error
}

func (f *fakePlanItemStore) CreatePlanItem(_ context.Context, n NewPlanItem) (PlanItem, error) {
	f.gotCreate = n
	if f.createErr != nil {
		return PlanItem{}, f.createErr
	}
	if f.createResult.ID != "" {
		return f.createResult, nil
	}
	status := "planned"
	if n.DayID == nil {
		status = "idea"
	}
	return PlanItem{
		ID:            "item-1",
		TripID:        n.TripID,
		DayID:         n.DayID,
		Title:         n.Title,
		Type:          n.Type,
		StartTime:     n.StartTime,
		Duration:      n.Duration,
		Location:      n.Location,
		BookingStatus: n.BookingStatus,
		Cost:          n.Cost,
		Link:          n.Link,
		SortOrder:     0,
		Status:        status,
	}, nil
}

// newPlanItemModule constructs a Module wired to a trip store and plan-item store.
func newPlanItemModule(tripSt tripStore, piSt planItemStore) *Module {
	return &Module{
		store:       tripSt,
		stays:       &fakeStayStore{},
		planItems:   piSt,
		requireAuth: func(h http.Handler) http.Handler { return h },
		authz:       allowAllAuthorizer{},
		now:         func() time.Time { return fixedNow },
	}
}

// createPlanItemReq builds a POST /trips/{id}/plan-items request.
func createPlanItemReq(tripID, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TripsPath+"/"+tripID+"/plan-items", strings.NewReader(body))
	req.SetPathValue("id", tripID)
	return withPrincipal(req, userID)
}

// TestHandleCreatePlanItemTitleOnly asserts a title-only create returns 201
// with an untimed item (no start_time, status = "planned" when day_id is set).
func TestHandleCreatePlanItemTitleOnly(t *testing.T) {
	t.Parallel()

	dayID := "day-abc"
	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"title":"Visit the castle","day_id":"day-abc"}`
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotCreate.TripID != "trip-1" {
		t.Errorf("store trip_id = %q, want trip-1", pi.gotCreate.TripID)
	}
	if pi.gotCreate.Title != "Visit the castle" {
		t.Errorf("store title = %q, want Visit the castle", pi.gotCreate.Title)
	}
	if pi.gotCreate.DayID == nil || *pi.gotCreate.DayID != dayID {
		t.Errorf("store day_id = %v, want %q", pi.gotCreate.DayID, dayID)
	}
	if pi.gotCreate.StartTime != nil {
		t.Errorf("store start_time = %v, want nil (untimed)", pi.gotCreate.StartTime)
	}

	var resp planItemResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ID == "" {
		t.Error("response id should not be empty")
	}
	if resp.Status != "planned" {
		t.Errorf("status = %q, want planned", resp.Status)
	}
	if resp.StartTime != nil {
		t.Errorf("start_time = %v, want omitted (untimed)", resp.StartTime)
	}
}

// TestHandleCreatePlanItemBacklog asserts a title-only item with no day_id
// lands in the backlog with status "idea".
func TestHandleCreatePlanItemBacklog(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"title":"Maybe a cooking class"}`
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotCreate.DayID != nil {
		t.Errorf("store day_id = %v, want nil (backlog)", pi.gotCreate.DayID)
	}

	var resp planItemResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Status != "idea" {
		t.Errorf("status = %q, want idea (backlog default)", resp.Status)
	}
	if resp.DayID != nil {
		t.Errorf("day_id = %v, want omitted", resp.DayID)
	}
}

// TestHandleCreatePlanItemTimed asserts an item with start_time is timed, and
// optional duration is forwarded correctly.
func TestHandleCreatePlanItemTimed(t *testing.T) {
	t.Parallel()

	dayID := "day-xyz"
	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"title":"Morning tour","day_id":"day-xyz","start_time":"09:30","duration":"PT2H"}`
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	n := pi.gotCreate
	if n.StartTime == nil || *n.StartTime != "09:30" {
		t.Errorf("start_time = %v, want 09:30", n.StartTime)
	}
	if n.Duration == nil || *n.Duration != "PT2H" {
		t.Errorf("duration = %v, want PT2H", n.Duration)
	}
	if n.DayID == nil || *n.DayID != dayID {
		t.Errorf("day_id = %v, want %q", n.DayID, dayID)
	}
}

// TestHandleCreatePlanItemAllFields asserts all optional fields are forwarded
// to the store when supplied.
func TestHandleCreatePlanItemAllFields(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{
		"title":"Boat trip","day_id":"day-1",
		"type":"activity","start_time":"14:00","duration":"PT3H",
		"location":"Marina","booking_status":"confirmed",
		"cost":49.99,"link":"https://example.com/booking"
	}`
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	n := pi.gotCreate
	if n.Type == nil || *n.Type != "activity" {
		t.Errorf("type = %v, want activity", n.Type)
	}
	if n.Location == nil || *n.Location != "Marina" {
		t.Errorf("location = %v, want Marina", n.Location)
	}
	if n.BookingStatus == nil || *n.BookingStatus != "confirmed" {
		t.Errorf("booking_status = %v, want confirmed", n.BookingStatus)
	}
	if n.Cost == nil || *n.Cost != 49.99 {
		t.Errorf("cost = %v, want 49.99", n.Cost)
	}
	if n.Link == nil || *n.Link != "https://example.com/booking" {
		t.Errorf("link = %v, want https://example.com/booking", n.Link)
	}
}

// TestHandleCreatePlanItemClientID asserts a client-supplied id is forwarded
// as ClientID to the store for upsert/idempotency (Epic 06).
func TestHandleCreatePlanItemClientID(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"id":"client-uuid-42","title":"Dinner"}`
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotCreate.ClientID != "client-uuid-42" {
		t.Errorf("ClientID = %q, want client-uuid-42", pi.gotCreate.ClientID)
	}
}

// TestHandleCreatePlanItemRejectsMissingTitle asserts a missing title is 400
// and the store is not called.
func TestHandleCreatePlanItemRejectsMissingTitle(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", `{"type":"activity"}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if pi.gotCreate.TripID != "" {
		t.Error("store should not be called for an invalid request")
	}
}

// TestHandleCreatePlanItemRejectsDurationWithoutStartTime asserts that
// supplying duration without start_time is 400.
func TestHandleCreatePlanItemRejectsDurationWithoutStartTime(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"title":"Walk","duration":"PT1H"}`
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

// TestHandleCreatePlanItemRejectsBadStartTime asserts a malformed start_time
// is 400.
func TestHandleCreatePlanItemRejectsBadStartTime(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"title":"Walk","start_time":"9am"}`
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "owner-1", body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

// TestHandleCreatePlanItemUnauthenticated asserts a missing session is 401 and
// the store is not called.
func TestHandleCreatePlanItemUnauthenticated(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	req := httptest.NewRequest(http.MethodPost, TripsPath+"/trip-1/plan-items", strings.NewReader(`{"title":"x"}`))
	req.SetPathValue("id", "trip-1")
	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if pi.gotCreate.TripID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// TestHandleCreatePlanItemUnauthorized asserts a denied Authorizer results in
// 404 (presence oracle protection) and the store is not called.
func TestHandleCreatePlanItemUnauthorized(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := &Module{
		store:       &fakeTripStore{},
		stays:       &fakeStayStore{},
		planItems:   pi,
		requireAuth: func(h http.Handler) http.Handler { return h },
		authz:       denyAllAuthorizer{},
		now:         func() time.Time { return fixedNow },
	}

	rec := httptest.NewRecorder()
	m.handleCreatePlanItem(rec, createPlanItemReq("trip-1", "other-user", `{"title":"x"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if pi.gotCreate.TripID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}
