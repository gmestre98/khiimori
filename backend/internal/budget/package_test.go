package budget

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

// --- fake store: packages ----------------------------------------------------

func (f *fakeBudgetStore) ListPackages(_ context.Context, tripID string) ([]Package, error) {
	var out []Package
	for _, p := range f.packages {
		if p.TripID == tripID {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakeBudgetStore) CreatePackage(_ context.Context, tripID string, in PackageInput) (Package, error) {
	f.pkgSeq++
	p := Package{ID: fmt.Sprintf("00000000-0000-0000-0000-%012d", f.pkgSeq), TripID: tripID,
		Includes: []string{}, StayIDs: []string{}, PlanItemIDs: []string{}, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	applyFake(&p, in)
	f.packages = append(f.packages, p)
	return p, nil
}

func (f *fakeBudgetStore) UpdatePackage(_ context.Context, tripID, id string, in PackageInput) (Package, error) {
	for i, p := range f.packages {
		if p.ID == id && p.TripID == tripID {
			applyFake(&p, in)
			if p.PaidAmount > p.TotalCost {
				return Package{}, errPackageInvalid{"paid_amount can't be more than total_cost"}
			}
			f.packages[i] = p
			return p, nil
		}
	}
	return Package{}, ErrPackageNotFound
}

func (f *fakeBudgetStore) DeletePackage(_ context.Context, tripID, id string) error {
	for i, p := range f.packages {
		if p.ID == id && p.TripID == tripID {
			f.packages = append(f.packages[:i], f.packages[i+1:]...)
			return nil
		}
	}
	return ErrPackageNotFound
}

func applyFake(p *Package, in PackageInput) {
	set := func(dst *string, src *string) {
		if src != nil {
			*dst = *src
		}
	}
	set(&p.Name, in.Name)
	set(&p.Provider, in.Provider)
	set(&p.Link, in.Link)
	if in.Category != nil {
		p.Category = Category(*in.Category)
	}
	set(&p.StartDate, in.StartDate)
	set(&p.EndDate, in.EndDate)
	if in.ClearBalanceDue {
		p.BalanceDue = ""
	} else {
		set(&p.BalanceDue, in.BalanceDue)
	}
	if in.TotalCost != nil {
		p.TotalCost = *in.TotalCost
	}
	if in.PaidAmount != nil {
		p.PaidAmount = *in.PaidAmount
	}
	if in.Includes != nil {
		p.Includes = *in.Includes
	}
	if in.StayIDs != nil {
		p.StayIDs = *in.StayIDs
	}
	if in.PlanItemIDs != nil {
		p.PlanItemIDs = *in.PlanItemIDs
	}
}

const stayA = "11111111-1111-1111-1111-111111111111"
const itemA = "22222222-2222-2222-2222-222222222222"

func validPackageBody() map[string]any {
	return map[string]any{
		"name": " Mauritania Round 18 ", "provider": "Against the Compass",
		"link":       "https://expeditions.againstthecompass.com/tours/mauritania-round-18/",
		"total_cost": 1200.0, "paid_amount": 300.0, "balance_due": "2026-11-15",
		"start_date": "2026-11-29", "end_date": "2026-12-06",
		"includes": []string{"Beds", "transport", "meals", "beds"},
		"stay_ids": []string{stayA}, "plan_item_ids": []string{itemA},
	}
}

// --- validation ----------------------------------------------------------------

func TestPackageInput_ValidateCreate(t *testing.T) {
	t.Parallel()
	str := func(s string) *string { return &s }
	num := func(f float64) *float64 { return &f }
	ok := func() PackageInput {
		return PackageInput{Name: str("Tour"), TotalCost: num(100), StartDate: str("2026-11-29"), EndDate: str("2026-12-06")}
	}
	cases := []struct {
		name    string
		mutate  func(*PackageInput)
		wantErr bool
	}{
		{"ok", func(*PackageInput) {}, false},
		{"no name", func(p *PackageInput) { p.Name = str("") }, true},
		{"no total", func(p *PackageInput) { p.TotalCost = nil }, true},
		{"negative total", func(p *PackageInput) { p.TotalCost = num(-1) }, true},
		{"paid over total", func(p *PackageInput) { p.PaidAmount = num(101) }, true},
		{"dates reversed", func(p *PackageInput) { p.StartDate = str("2026-12-07") }, true},
		{"bad date", func(p *PackageInput) { p.EndDate = str("6 Dec") }, true},
		{"bad link", func(p *PackageInput) { p.Link = str("javascript:alert(1)") }, true},
		{"unknown include", func(p *PackageInput) { inc := []string{"spa"}; p.Includes = &inc }, true},
		{"category ok", func(p *PackageInput) { p.Category = str("Activities") }, false},
		{"bad category", func(p *PackageInput) { p.Category = str("Tours") }, true},
		{"bad stay id", func(p *PackageInput) { ids := []string{"x"}; p.StayIDs = &ids }, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := ok()
			tc.mutate(&in)
			in.normalize()
			if err := in.validateCreate(); (err != nil) != tc.wantErr {
				t.Fatalf("validateCreate() err=%v, wantErr=%v", err, tc.wantErr)
			}
		})
	}
}

// --- handlers ------------------------------------------------------------------

func TestPackages_CreateListUpdateDelete(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{}
	_, mux := newTestModule(store, fakeAuthz{allow: true})

	rec := doRequest(t, mux, http.MethodPost, "/trips/trip-1/packages", validPackageBody())
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
	}
	var created packageResponse
	if err := decodeJSON(rec, &created); err != nil {
		t.Fatal(err)
	}
	if created.Name != "Mauritania Round 18" || created.BalanceDue == nil || *created.BalanceDue != "2026-11-15" {
		t.Fatalf("created: %+v", created)
	}
	if len(created.Includes) != 3 || created.Includes[0] != "beds" {
		t.Fatalf("includes should be lower-cased and de-duplicated: %v", created.Includes)
	}
	if len(created.StayIDs) != 1 || len(created.PlanItemIDs) != 1 {
		t.Fatalf("links: %+v", created)
	}

	// Pay the balance: paid = total, balance date cleared.
	rec = doRequest(t, mux, http.MethodPatch, "/trips/trip-1/packages/"+created.ID,
		map[string]any{"paid_amount": 1200.0, "balance_due": nil})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: %d %s", rec.Code, rec.Body.String())
	}
	var updated packageResponse
	_ = decodeJSON(rec, &updated)
	if updated.PaidAmount != 1200 || updated.BalanceDue != nil || updated.Name != "Mauritania Round 18" {
		t.Fatalf("update should only change payment: %+v", updated)
	}

	// Paying more than the total is rejected.
	rec = doRequest(t, mux, http.MethodPatch, "/trips/trip-1/packages/"+created.ID, map[string]any{"paid_amount": 5000.0})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("overpay: want 400, got %d", rec.Code)
	}

	rec = doRequest(t, mux, http.MethodGet, "/trips/trip-1/packages", nil)
	var list []packageResponse
	_ = decodeJSON(rec, &list)
	if rec.Code != http.StatusOK || len(list) != 1 {
		t.Fatalf("list: %d %v", rec.Code, list)
	}

	rec = doRequest(t, mux, http.MethodDelete, "/trips/trip-1/packages/"+created.ID, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}
	rec = doRequest(t, mux, http.MethodDelete, "/trips/trip-1/packages/"+created.ID, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete again: want 404, got %d", rec.Code)
	}
}

func TestPackages_ValidationAndAccess(t *testing.T) {
	t.Parallel()
	_, mux := newTestModule(&fakeBudgetStore{}, fakeAuthz{allow: true})
	body := validPackageBody()
	body["paid_amount"] = 2000.0
	if rec := doRequest(t, mux, http.MethodPost, "/trips/trip-1/packages", body); rec.Code != http.StatusBadRequest {
		t.Fatalf("paid over total: want 400, got %d", rec.Code)
	}
	if rec := doRequest(t, mux, http.MethodPatch, "/trips/trip-1/packages/not-a-uuid", map[string]any{"name": "x"}); rec.Code != http.StatusNotFound {
		t.Fatalf("bad id: want 404, got %d", rec.Code)
	}

	_, denied := newTestModule(&fakeBudgetStore{}, fakeAuthz{allow: false})
	if rec := doRequest(t, denied, http.MethodGet, "/trips/trip-1/packages", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("no access read: want 404, got %d", rec.Code)
	}
	if rec := doRequest(t, denied, http.MethodPost, "/trips/trip-1/packages", validPackageBody()); rec.Code != http.StatusNotFound {
		t.Fatalf("no access write: want 404, got %d", rec.Code)
	}
}

// --- rollup ----------------------------------------------------------------------

func TestComputeRollup_PackagesCountOnce(t *testing.T) {
	t.Parallel()
	external := []ExternalCost{
		{DayID: "d1", Category: CategoryFood, Amount: 10, Happened: true},
	}
	packages := []Package{
		{TotalCost: 1200, PaidAmount: 300},
		{TotalCost: 50, PaidAmount: 50},
	}
	r := computeRollup(external, nil, nil, packages)
	if r.TripTotal != 360 {
		t.Errorf("spent = %v, want 10 + 300 + 50", r.TripTotal)
	}
	if r.EstimatedTripTotal != 900 {
		t.Errorf("estimated = %v, want the unpaid 900", r.EstimatedTripTotal)
	}
	if r.PackageSpent != 350 || r.PackageEstimated != 900 {
		t.Errorf("package fields = %v / %v", r.PackageSpent, r.PackageEstimated)
	}
	// Packages count in their category (Other when unset), never on a day.
	if r.ByCategory[string(CategoryFood)] != 10 || r.ByCategory[string(CategoryOther)] != 350 ||
		r.EstimatedByCategory[string(CategoryOther)] != 900 || len(r.ByDay) != 1 {
		t.Errorf("categories/days: %v %v %v", r.ByCategory, r.EstimatedByCategory, r.ByDay)
	}
	r2 := computeRollup(nil, nil, nil, []Package{{Category: CategoryActivities, TotalCost: 100, PaidAmount: 40}})
	if r2.ByCategory[string(CategoryActivities)] != 40 || r2.EstimatedByCategory[string(CategoryActivities)] != 60 {
		t.Errorf("chosen category: %v %v", r2.ByCategory, r2.EstimatedByCategory)
	}
}

func TestGetRollup_IncludesPackages(t *testing.T) {
	t.Parallel()
	store := &fakeBudgetStore{packages: []Package{{TripID: "trip-1", TotalCost: 800, PaidAmount: 800}}}
	_, mux := newTestModule(store, fakeAuthz{allow: true})
	rec := doRequest(t, mux, http.MethodGet, "/trips/trip-1/budget/rollup", nil)
	var out RollupResult
	_ = decodeJSON(rec, &out)
	if rec.Code != http.StatusOK || out.TripTotal != 800 || out.PackageSpent != 800 {
		t.Fatalf("rollup: %d %+v", rec.Code, out)
	}
}
