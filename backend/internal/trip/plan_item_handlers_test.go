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
	gotListBacklogTripID string
	listBacklogResult    []PlanItem
	listBacklogErr       error

	gotCreate    NewPlanItem
	createResult PlanItem
	createErr    error

	gotUpdateTripID string
	gotUpdateItemID string
	gotUpdate       EditPlanItem
	updateResult    PlanItem
	updateErr       error

	gotDeleteTripID string
	gotDeleteItemID string
	deleteErr       error

	gotPromoteTripID string
	gotPromoteItemID string
	gotPromote       PromotePlanItemInput
	promoteResult    PlanItem
	promoteErr       error

	gotDemoteTripID string
	gotDemoteItemID string
	demoteResult    PlanItem
	demoteErr       error
}

func (f *fakePlanItemStore) ListBacklog(_ context.Context, tripID string) ([]PlanItem, error) {
	f.gotListBacklogTripID = tripID
	if f.listBacklogErr != nil {
		return nil, f.listBacklogErr
	}
	return f.listBacklogResult, nil
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

func (f *fakePlanItemStore) UpdatePlanItem(_ context.Context, tripID, itemID string, e EditPlanItem) (PlanItem, error) {
	f.gotUpdateTripID = tripID
	f.gotUpdateItemID = itemID
	f.gotUpdate = e
	if f.updateErr != nil {
		return PlanItem{}, f.updateErr
	}
	if f.updateResult.ID != "" {
		return f.updateResult, nil
	}
	return PlanItem{
		ID:            itemID,
		TripID:        tripID,
		Title:         e.Title,
		Type:          e.Type,
		StartTime:     e.StartTime,
		Duration:      e.Duration,
		Location:      e.Location,
		BookingStatus: e.BookingStatus,
		Cost:          e.Cost,
		Link:          e.Link,
		Status:        "planned",
	}, nil
}

func (f *fakePlanItemStore) DeletePlanItem(_ context.Context, tripID, itemID string) error {
	f.gotDeleteTripID = tripID
	f.gotDeleteItemID = itemID
	return f.deleteErr
}

func (f *fakePlanItemStore) PromotePlanItem(_ context.Context, tripID, itemID string, p PromotePlanItemInput) (PlanItem, error) {
	f.gotPromoteTripID = tripID
	f.gotPromoteItemID = itemID
	f.gotPromote = p
	if f.promoteErr != nil {
		return PlanItem{}, f.promoteErr
	}
	if f.promoteResult.ID != "" {
		return f.promoteResult, nil
	}
	return PlanItem{
		ID:        itemID,
		TripID:    tripID,
		DayID:     &p.DayID,
		Title:     "Promoted item",
		StartTime: p.StartTime,
		SortOrder: 0,
		Status:    "planned",
	}, nil
}

func (f *fakePlanItemStore) DemotePlanItem(_ context.Context, tripID, itemID string) (PlanItem, error) {
	f.gotDemoteTripID = tripID
	f.gotDemoteItemID = itemID
	if f.demoteErr != nil {
		return PlanItem{}, f.demoteErr
	}
	if f.demoteResult.ID != "" {
		return f.demoteResult, nil
	}
	return PlanItem{
		ID:        itemID,
		TripID:    tripID,
		DayID:     nil,
		Title:     "Demoted item",
		SortOrder: 0,
		Status:    "idea",
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

// updatePlanItemReq builds a PATCH /trips/{id}/plan-items/{itemID} request.
func updatePlanItemReq(tripID, itemID, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPatch, TripsPath+"/"+tripID+"/plan-items/"+itemID, strings.NewReader(body))
	req.SetPathValue("id", tripID)
	req.SetPathValue("itemID", itemID)
	return withPrincipal(req, userID)
}

// deletePlanItemReq builds a DELETE /trips/{id}/plan-items/{itemID} request.
func deletePlanItemReq(tripID, itemID, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodDelete, TripsPath+"/"+tripID+"/plan-items/"+itemID, nil)
	req.SetPathValue("id", tripID)
	req.SetPathValue("itemID", itemID)
	return withPrincipal(req, userID)
}

// TestHandleUpdatePlanItemPartialFields asserts a partial edit updates only
// the supplied fields and returns 200 with the item.
func TestHandleUpdatePlanItemPartialFields(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"title":"Updated title","location":"New place"}`
	rec := httptest.NewRecorder()
	m.handleUpdatePlanItem(rec, updatePlanItemReq("trip-1", "item-42", "owner-1", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotUpdateTripID != "trip-1" {
		t.Errorf("tripID = %q, want trip-1", pi.gotUpdateTripID)
	}
	if pi.gotUpdateItemID != "item-42" {
		t.Errorf("itemID = %q, want item-42", pi.gotUpdateItemID)
	}
	if pi.gotUpdate.Title != "Updated title" {
		t.Errorf("title = %q, want Updated title", pi.gotUpdate.Title)
	}
	if pi.gotUpdate.Location == nil || *pi.gotUpdate.Location != "New place" {
		t.Errorf("location = %v, want New place", pi.gotUpdate.Location)
	}

	var resp planItemResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ID != "item-42" {
		t.Errorf("response id = %q, want item-42", resp.ID)
	}
}

// TestHandleUpdatePlanItemTimedToUntimed asserts setting start_time to null
// makes the item untimed (clears start_time and duration).
func TestHandleUpdatePlanItemTimedToUntimed(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	// null start_time → untimed; duration must also be absent/null
	body := `{"title":"Walk"}`
	rec := httptest.NewRecorder()
	m.handleUpdatePlanItem(rec, updatePlanItemReq("trip-1", "item-99", "owner-1", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotUpdate.StartTime != nil {
		t.Errorf("start_time = %v, want nil (untimed)", pi.gotUpdate.StartTime)
	}
	if pi.gotUpdate.Duration != nil {
		t.Errorf("duration = %v, want nil when untimed", pi.gotUpdate.Duration)
	}

	var resp planItemResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.StartTime != nil {
		t.Errorf("response start_time = %v, want omitted", resp.StartTime)
	}
}

// TestHandleUpdatePlanItemUntimedToTimed asserts providing a valid start_time
// makes the item timed.
func TestHandleUpdatePlanItemUntimedToTimed(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"title":"Morning hike","start_time":"08:00","duration":"PT3H"}`
	rec := httptest.NewRecorder()
	m.handleUpdatePlanItem(rec, updatePlanItemReq("trip-1", "item-7", "owner-1", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotUpdate.StartTime == nil || *pi.gotUpdate.StartTime != "08:00" {
		t.Errorf("start_time = %v, want 08:00", pi.gotUpdate.StartTime)
	}
	if pi.gotUpdate.Duration == nil || *pi.gotUpdate.Duration != "PT3H" {
		t.Errorf("duration = %v, want PT3H", pi.gotUpdate.Duration)
	}
}

// TestHandleUpdatePlanItemNotFound asserts the store returning errPlanItemNotFound
// is surfaced as 404.
func TestHandleUpdatePlanItemNotFound(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{updateErr: errPlanItemNotFound}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleUpdatePlanItem(rec, updatePlanItemReq("trip-1", "gone", "owner-1", `{"title":"x"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleUpdatePlanItemRejectsMissingTitle asserts a missing title is 400.
func TestHandleUpdatePlanItemRejectsMissingTitle(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleUpdatePlanItem(rec, updatePlanItemReq("trip-1", "item-1", "owner-1", `{"type":"activity"}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if pi.gotUpdateItemID != "" {
		t.Error("store should not be called for invalid request")
	}
}

// TestHandleUpdatePlanItemUnauthenticated asserts a missing session is 401.
func TestHandleUpdatePlanItemUnauthenticated(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	req := httptest.NewRequest(http.MethodPatch, TripsPath+"/trip-1/plan-items/item-1", strings.NewReader(`{"title":"x"}`))
	req.SetPathValue("id", "trip-1")
	req.SetPathValue("itemID", "item-1")
	rec := httptest.NewRecorder()
	m.handleUpdatePlanItem(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

// TestHandleDeletePlanItemOK asserts a delete returns 204 and forwards the
// correct ids to the store.
func TestHandleDeletePlanItemOK(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleDeletePlanItem(rec, deletePlanItemReq("trip-1", "item-88", "owner-1"))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotDeleteTripID != "trip-1" {
		t.Errorf("tripID = %q, want trip-1", pi.gotDeleteTripID)
	}
	if pi.gotDeleteItemID != "item-88" {
		t.Errorf("itemID = %q, want item-88", pi.gotDeleteItemID)
	}
}

// TestHandleDeletePlanItemIdempotent asserts that replaying a delete of a
// non-existent item still returns 204 (idempotent for Epic 06 offline replay).
func TestHandleDeletePlanItemIdempotent(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	// Two consecutive deletes of the same item both return 204.
	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		m.handleDeletePlanItem(rec, deletePlanItemReq("trip-1", "item-gone", "owner-1"))
		if rec.Code != http.StatusNoContent {
			t.Fatalf("replay %d: status = %d, want 204", i+1, rec.Code)
		}
	}
}

// TestHandleDeletePlanItemUnauthenticated asserts a missing session is 401.
func TestHandleDeletePlanItemUnauthenticated(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	req := httptest.NewRequest(http.MethodDelete, TripsPath+"/trip-1/plan-items/item-1", nil)
	req.SetPathValue("id", "trip-1")
	req.SetPathValue("itemID", "item-1")
	rec := httptest.NewRecorder()
	m.handleDeletePlanItem(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

// listBacklogReq builds a GET /trips/{id}/plan-items/backlog request.
func listBacklogReq(tripID, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, TripsPath+"/"+tripID+"/plan-items/backlog", nil)
	req.SetPathValue("id", tripID)
	return withPrincipal(req, userID)
}

// TestHandleListBacklogEmpty asserts an empty backlog returns 200 with an empty items array.
func TestHandleListBacklogEmpty(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{listBacklogResult: nil}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleListBacklog(rec, listBacklogReq("trip-1", "owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotListBacklogTripID != "trip-1" {
		t.Errorf("store trip_id = %q, want trip-1", pi.gotListBacklogTripID)
	}
	var resp backlogResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Items) != 0 {
		t.Errorf("items len = %d, want 0", len(resp.Items))
	}
}

// TestHandleListBacklogReturnsItems asserts the backlog items are returned in order.
func TestHandleListBacklogReturnsItems(t *testing.T) {
	t.Parallel()

	title1, title2 := "Museum visit", "Cooking class"
	pi := &fakePlanItemStore{
		listBacklogResult: []PlanItem{
			{ID: "item-1", TripID: "trip-1", Title: title1, SortOrder: 0, Status: "idea"},
			{ID: "item-2", TripID: "trip-1", Title: title2, SortOrder: 1, Status: "idea"},
		},
	}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleListBacklog(rec, listBacklogReq("trip-1", "owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var resp backlogResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Items) != 2 {
		t.Fatalf("items len = %d, want 2", len(resp.Items))
	}
	if resp.Items[0].Title != title1 {
		t.Errorf("items[0].title = %q, want %q", resp.Items[0].Title, title1)
	}
	if resp.Items[1].Title != title2 {
		t.Errorf("items[1].title = %q, want %q", resp.Items[1].Title, title2)
	}
	if resp.Items[0].DayID != nil {
		t.Errorf("items[0].day_id = %v, want nil (backlog item)", resp.Items[0].DayID)
	}
	if resp.Items[0].Status != "idea" {
		t.Errorf("items[0].status = %q, want idea", resp.Items[0].Status)
	}
}

// TestHandleListBacklogUnauthenticated asserts a missing session is 401.
func TestHandleListBacklogUnauthenticated(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	req := httptest.NewRequest(http.MethodGet, TripsPath+"/trip-1/plan-items/backlog", nil)
	req.SetPathValue("id", "trip-1")
	rec := httptest.NewRecorder()
	m.handleListBacklog(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if pi.gotListBacklogTripID != "" {
		t.Error("store should not be called for an unauthenticated request")
	}
}

// TestHandleListBacklogUnauthorized asserts a denied Authorizer results in 404.
func TestHandleListBacklogUnauthorized(t *testing.T) {
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
	m.handleListBacklog(rec, listBacklogReq("trip-1", "other-user"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if pi.gotListBacklogTripID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}

// promotePlanItemReq builds a POST /trips/{id}/plan-items/{itemID}/promote request.
func promotePlanItemReq(tripID, itemID, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TripsPath+"/"+tripID+"/plan-items/"+itemID+"/promote", strings.NewReader(body))
	req.SetPathValue("id", tripID)
	req.SetPathValue("itemID", itemID)
	return withPrincipal(req, userID)
}

// demotePlanItemReq builds a POST /trips/{id}/plan-items/{itemID}/demote request.
func demotePlanItemReq(tripID, itemID, userID string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TripsPath+"/"+tripID+"/plan-items/"+itemID+"/demote", nil)
	req.SetPathValue("id", tripID)
	req.SetPathValue("itemID", itemID)
	return withPrincipal(req, userID)
}

// TestHandlePromotePlanItemOK asserts a promote with day_id sets day_id and
// transitions status to "planned".
func TestHandlePromotePlanItemOK(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"day_id":"day-1"}`
	rec := httptest.NewRecorder()
	m.handlePromotePlanItem(rec, promotePlanItemReq("trip-1", "item-5", "owner-1", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotPromoteTripID != "trip-1" {
		t.Errorf("tripID = %q, want trip-1", pi.gotPromoteTripID)
	}
	if pi.gotPromoteItemID != "item-5" {
		t.Errorf("itemID = %q, want item-5", pi.gotPromoteItemID)
	}
	if pi.gotPromote.DayID != "day-1" {
		t.Errorf("day_id = %q, want day-1", pi.gotPromote.DayID)
	}
	if pi.gotPromote.StartTime != nil {
		t.Errorf("start_time = %v, want nil (untimed promote)", pi.gotPromote.StartTime)
	}

	var resp planItemResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.DayID == nil || *resp.DayID != "day-1" {
		t.Errorf("response day_id = %v, want day-1", resp.DayID)
	}
	if resp.Status != "planned" {
		t.Errorf("response status = %q, want planned", resp.Status)
	}
}

// TestHandlePromotePlanItemWithStartTime asserts a promote with start_time
// forwards it to the store.
func TestHandlePromotePlanItemWithStartTime(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"day_id":"day-2","start_time":"10:00"}`
	rec := httptest.NewRecorder()
	m.handlePromotePlanItem(rec, promotePlanItemReq("trip-1", "item-7", "owner-1", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotPromote.StartTime == nil || *pi.gotPromote.StartTime != "10:00" {
		t.Errorf("start_time = %v, want 10:00", pi.gotPromote.StartTime)
	}
}

// TestHandlePromotePlanItemMissingDayID asserts a missing day_id is 400.
func TestHandlePromotePlanItemMissingDayID(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handlePromotePlanItem(rec, promotePlanItemReq("trip-1", "item-1", "owner-1", `{}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if pi.gotPromoteItemID != "" {
		t.Error("store should not be called for an invalid request")
	}
}

// TestHandlePromotePlanItemBadStartTime asserts a malformed start_time is 400.
func TestHandlePromotePlanItemBadStartTime(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	body := `{"day_id":"day-1","start_time":"bad"}`
	rec := httptest.NewRecorder()
	m.handlePromotePlanItem(rec, promotePlanItemReq("trip-1", "item-1", "owner-1", body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if pi.gotPromoteItemID != "" {
		t.Error("store should not be called for an invalid request")
	}
}

// TestHandlePromotePlanItemNotFound asserts a store errPlanItemNotFound is 404.
func TestHandlePromotePlanItemNotFound(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{promoteErr: errPlanItemNotFound}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handlePromotePlanItem(rec, promotePlanItemReq("trip-1", "gone", "owner-1", `{"day_id":"day-1"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandlePromotePlanItemUnauthenticated asserts a missing session is 401.
func TestHandlePromotePlanItemUnauthenticated(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	req := httptest.NewRequest(http.MethodPost, TripsPath+"/trip-1/plan-items/item-1/promote", strings.NewReader(`{"day_id":"day-1"}`))
	req.SetPathValue("id", "trip-1")
	req.SetPathValue("itemID", "item-1")
	rec := httptest.NewRecorder()
	m.handlePromotePlanItem(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

// TestHandlePromotePlanItemUnauthorized asserts a denied Authorizer is 404.
func TestHandlePromotePlanItemUnauthorized(t *testing.T) {
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
	m.handlePromotePlanItem(rec, promotePlanItemReq("trip-1", "item-1", "other-user", `{"day_id":"day-1"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if pi.gotPromoteItemID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}

// TestHandleDemotePlanItemOK asserts a demote clears day_id and sets status to "idea".
func TestHandleDemotePlanItemOK(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleDemotePlanItem(rec, demotePlanItemReq("trip-1", "item-3", "owner-1"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if pi.gotDemoteTripID != "trip-1" {
		t.Errorf("tripID = %q, want trip-1", pi.gotDemoteTripID)
	}
	if pi.gotDemoteItemID != "item-3" {
		t.Errorf("itemID = %q, want item-3", pi.gotDemoteItemID)
	}

	var resp planItemResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.DayID != nil {
		t.Errorf("response day_id = %v, want nil (backlog)", resp.DayID)
	}
	if resp.Status != "idea" {
		t.Errorf("response status = %q, want idea", resp.Status)
	}
}

// TestHandleDemotePlanItemRoundTrip asserts promote then demote round-trip via
// the fake store (idempotency of the no-re-entry guarantee).
func TestHandleDemotePlanItemRoundTrip(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	// Promote
	rec := httptest.NewRecorder()
	m.handlePromotePlanItem(rec, promotePlanItemReq("trip-1", "item-9", "owner-1", `{"day_id":"day-42"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("promote status = %d, want 200", rec.Code)
	}

	// Demote
	rec2 := httptest.NewRecorder()
	m.handleDemotePlanItem(rec2, demotePlanItemReq("trip-1", "item-9", "owner-1"))
	if rec2.Code != http.StatusOK {
		t.Fatalf("demote status = %d, want 200", rec2.Code)
	}

	var resp planItemResponse
	if err := json.Unmarshal(rec2.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode demote response: %v", err)
	}
	if resp.DayID != nil {
		t.Errorf("after demote day_id = %v, want nil", resp.DayID)
	}
	if resp.Status != "idea" {
		t.Errorf("after demote status = %q, want idea", resp.Status)
	}
}

// TestHandleDemotePlanItemNotFound asserts errPlanItemNotFound is surfaced as 404.
func TestHandleDemotePlanItemNotFound(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{demoteErr: errPlanItemNotFound}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleDemotePlanItem(rec, demotePlanItemReq("trip-1", "gone", "owner-1"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleDemotePlanItemUnauthenticated asserts a missing session is 401.
func TestHandleDemotePlanItemUnauthenticated(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	req := httptest.NewRequest(http.MethodPost, TripsPath+"/trip-1/plan-items/item-1/demote", nil)
	req.SetPathValue("id", "trip-1")
	req.SetPathValue("itemID", "item-1")
	rec := httptest.NewRecorder()
	m.handleDemotePlanItem(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

// TestHandleDemotePlanItemUnauthorized asserts a denied Authorizer is 404.
func TestHandleDemotePlanItemUnauthorized(t *testing.T) {
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
	m.handleDemotePlanItem(rec, demotePlanItemReq("trip-1", "item-1", "other-user"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if pi.gotDemoteItemID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}

// TestHandleDeletePlanItemUnauthorized asserts a denied Authorizer results in
// 404 and the store is not called.
func TestHandleDeletePlanItemUnauthorized(t *testing.T) {
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
	m.handleDeletePlanItem(rec, deletePlanItemReq("trip-1", "item-1", "other-user"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle protection)", rec.Code)
	}
	if pi.gotDeleteItemID != "" {
		t.Error("store should not be called for an unauthorized request")
	}
}
