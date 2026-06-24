package budget

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

// fakeBudgetStore records calls and returns canned results for handler tests.
type fakeBudgetStore struct {
	gotUpsert SetBudgetLine
	upsertErr error
	upsertOut BudgetLine

	gotCreate    CreateCostEntry
	createErr    error
	createOut    CostEntry
	gotUpdate    UpdateCostEntry
	updateErr    error
	updateOut    CostEntry
	gotDeleteID  string
	gotDeleteTID string
	deleteErr    error
}

func (f *fakeBudgetStore) Upsert(_ context.Context, line SetBudgetLine) (BudgetLine, error) {
	f.gotUpsert = line
	if f.upsertErr != nil {
		return BudgetLine{}, f.upsertErr
	}
	if f.upsertOut.ID != "" {
		return f.upsertOut, nil
	}
	return BudgetLine{
		ID:            "test-id",
		TripID:        line.TripID,
		DayID:         line.DayID,
		Category:      line.Category,
		PlannedAmount: line.PlannedAmount,
	}, nil
}

func (f *fakeBudgetStore) CreateCostEntry(_ context.Context, e CreateCostEntry) (CostEntry, error) {
	f.gotCreate = e
	if f.createErr != nil {
		return CostEntry{}, f.createErr
	}
	if f.createOut.ID != "" {
		return f.createOut, nil
	}
	return CostEntry{
		ID:        "entry-1",
		TripID:    e.TripID,
		Category:  e.Category,
		Amount:    e.Amount,
		Note:      e.Note,
		CreatedAt: time.Now(),
	}, nil
}

func (f *fakeBudgetStore) UpdateCostEntry(_ context.Context, e UpdateCostEntry) (CostEntry, error) {
	f.gotUpdate = e
	if f.updateErr != nil {
		return CostEntry{}, f.updateErr
	}
	if f.updateOut.ID != "" {
		return f.updateOut, nil
	}
	return CostEntry{
		ID:        e.ID,
		TripID:    e.TripID,
		Category:  e.Category,
		Amount:    e.Amount,
		Note:      e.Note,
		CreatedAt: time.Now(),
	}, nil
}

func (f *fakeBudgetStore) DeleteCostEntry(_ context.Context, entryID, tripID string) error {
	f.gotDeleteID = entryID
	f.gotDeleteTID = tripID
	return f.deleteErr
}

// fakeAuthz allows or denies based on the allow field.
type fakeAuthz struct {
	allow bool
	err   error
}

func (f fakeAuthz) CanWrite(_ context.Context, _, _ string) (bool, error) {
	return f.allow, f.err
}

// authShim injects a fixed principal so handler tests run without a session store.
func authShim(userID string) httpx.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: userID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func newTestModule(store budgetStore, authz Authorizer) (*Module, *http.ServeMux) {
	m := &Module{
		store:       store,
		authz:       authz,
		requireAuth: authShim("user-1"),
	}
	mux := http.NewServeMux()
	m.RegisterRoutes(mux)
	return m, mux
}

func putJSONUnit(t *testing.T, mux http.Handler, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func doRequest(t *testing.T, mux http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestSetTripBudgetLine_Success(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := putJSONUnit(t, mux, "/trips/trip-1/budget-lines", map[string]any{
		"category":       "Food",
		"planned_amount": 250.00,
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if store.gotUpsert.TripID != "trip-1" {
		t.Errorf("expected trip_id=trip-1, got %q", store.gotUpsert.TripID)
	}
	if store.gotUpsert.DayID != "" {
		t.Errorf("expected empty day_id for trip-level, got %q", store.gotUpsert.DayID)
	}
	if store.gotUpsert.Category != CategoryFood {
		t.Errorf("expected category Food, got %q", store.gotUpsert.Category)
	}
	if store.gotUpsert.PlannedAmount != 250.00 {
		t.Errorf("expected planned_amount=250, got %f", store.gotUpsert.PlannedAmount)
	}
}

func TestSetDayBudgetLine_Success(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := putJSONUnit(t, mux, "/trips/trip-1/days/day-1/budget-lines", map[string]any{
		"category":       "Transport",
		"planned_amount": 80.00,
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if store.gotUpsert.DayID != "day-1" {
		t.Errorf("expected day_id=day-1, got %q", store.gotUpsert.DayID)
	}
	if store.gotUpsert.Category != CategoryTransport {
		t.Errorf("expected Transport, got %q", store.gotUpsert.Category)
	}
}

func TestSetBudgetLine_InvalidCategory(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := putJSONUnit(t, mux, "/trips/trip-1/budget-lines", map[string]any{
		"category":       "Shopping",
		"planned_amount": 100.00,
	})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSetBudgetLine_NegativeAmount(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := putJSONUnit(t, mux, "/trips/trip-1/budget-lines", map[string]any{
		"category":       "Food",
		"planned_amount": -10.00,
	})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSetBudgetLine_Unauthorized(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: false})

	rec := putJSONUnit(t, mux, "/trips/trip-1/budget-lines", map[string]any{
		"category":       "Food",
		"planned_amount": 100.00,
	})

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 (presence oracle protection), got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateCostEntry_Success(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := doRequest(t, mux, http.MethodPost, "/trips/trip-1/cost-entries", map[string]any{
		"category": "Food",
		"amount":   45.50,
		"note":     "lunch",
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if store.gotCreate.TripID != "trip-1" {
		t.Errorf("trip_id: got %q, want trip-1", store.gotCreate.TripID)
	}
	if store.gotCreate.Category != CategoryFood {
		t.Errorf("category: got %q, want Food", store.gotCreate.Category)
	}
	if store.gotCreate.Amount != 45.50 {
		t.Errorf("amount: got %f, want 45.50", store.gotCreate.Amount)
	}
}

func TestCreateCostEntry_InvalidCategory(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := doRequest(t, mux, http.MethodPost, "/trips/trip-1/cost-entries", map[string]any{
		"category": "Shopping",
		"amount":   10.0,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateCostEntry_Unauthorized(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: false})

	rec := doRequest(t, mux, http.MethodPost, "/trips/trip-1/cost-entries", map[string]any{
		"category": "Food",
		"amount":   10.0,
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestUpdateCostEntry_Success(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := doRequest(t, mux, http.MethodPatch, "/trips/trip-1/cost-entries/entry-42", map[string]any{
		"category": "Transport",
		"amount":   20.0,
		"note":     "taxi",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if store.gotUpdate.ID != "entry-42" {
		t.Errorf("entry id: got %q, want entry-42", store.gotUpdate.ID)
	}
}

func TestUpdateCostEntry_NotFound(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{updateErr: ErrCostEntryNotFound}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := doRequest(t, mux, http.MethodPatch, "/trips/trip-1/cost-entries/missing", map[string]any{
		"category": "Food",
		"amount":   5.0,
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteCostEntry_Success(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	req := httptest.NewRequest(http.MethodDelete, "/trips/trip-1/cost-entries/entry-7", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if store.gotDeleteID != "entry-7" {
		t.Errorf("entry id: got %q, want entry-7", store.gotDeleteID)
	}
}

func TestDeleteCostEntry_Unauthorized(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: false})

	req := httptest.NewRequest(http.MethodDelete, "/trips/trip-1/cost-entries/entry-7", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
