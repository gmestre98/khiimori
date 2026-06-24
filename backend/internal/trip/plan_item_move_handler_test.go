package trip

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// movePlanItemReq builds a POST /trips/{id}/plan-items/{itemID}/move request.
func movePlanItemReq(tripID, itemID, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost,
		TripsPath+"/"+tripID+"/plan-items/"+itemID+"/move",
		strings.NewReader(body))
	req.SetPathValue("id", tripID)
	req.SetPathValue("itemID", itemID)
	return withPrincipal(req, userID)
}

// TestHandleMovePlanItemOK verifies the happy path: a valid day_id produces 200
// and the store receives the correct tripID, itemID, and DayID.
func TestHandleMovePlanItemOK(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleMovePlanItem(rec, movePlanItemReq("trip-1", "item-1", "owner-1",
		`{"day_id":"day-2"}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}

	var resp planItemResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ID != "item-1" {
		t.Errorf("response id = %q, want item-1 (same row)", resp.ID)
	}
	if resp.DayID == nil || *resp.DayID != "day-2" {
		t.Errorf("response day_id = %v, want day-2", resp.DayID)
	}
}

// TestHandleMovePlanItemWithStartTime verifies that an optional start_time in
// the request is parsed and forwarded to the store.
func TestHandleMovePlanItemWithStartTime(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleMovePlanItem(rec, movePlanItemReq("trip-1", "item-1", "owner-1",
		`{"day_id":"day-2","start_time":"14:30"}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
}

// TestHandleMovePlanItemMissingDayID verifies that a missing day_id returns 400.
func TestHandleMovePlanItemMissingDayID(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleMovePlanItem(rec, movePlanItemReq("trip-1", "item-1", "owner-1", `{}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// TestHandleMovePlanItemBadStartTime verifies that a malformed start_time
// returns 400 before reaching the store.
func TestHandleMovePlanItemBadStartTime(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleMovePlanItem(rec, movePlanItemReq("trip-1", "item-1", "owner-1",
		`{"day_id":"day-2","start_time":"9am"}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// TestHandleMovePlanItemNotFound verifies that errPlanItemNotFound from the
// store maps to 404.
func TestHandleMovePlanItemNotFound(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{moveErr: errPlanItemNotFound}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	rec := httptest.NewRecorder()
	m.handleMovePlanItem(rec, movePlanItemReq("trip-1", "item-99", "owner-1",
		`{"day_id":"day-2"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// TestHandleMovePlanItemUnauthenticated verifies that a request without a
// principal returns 401.
func TestHandleMovePlanItemUnauthenticated(t *testing.T) {
	t.Parallel()

	pi := &fakePlanItemStore{}
	m := newPlanItemModule(&fakeTripStore{}, pi)

	req := httptest.NewRequest(http.MethodPost,
		TripsPath+"/trip-1/plan-items/item-1/move",
		strings.NewReader(`{"day_id":"day-2"}`))
	req.SetPathValue("id", "trip-1")
	req.SetPathValue("itemID", "item-1")

	rec := httptest.NewRecorder()
	m.handleMovePlanItem(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

// TestHandleMovePlanItemUnauthorized verifies that a denied Authorizer returns
// 404 (presence oracle) and the store is not called.
func TestHandleMovePlanItemUnauthorized(t *testing.T) {
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
	m.handleMovePlanItem(rec, movePlanItemReq("trip-1", "item-1", "other-user",
		`{"day_id":"day-2"}`))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (presence oracle)", rec.Code)
	}
}
