//go:build integration

package budget

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
)

// doHTTP sends a JSON request (no body when body is nil) and returns the response.
func doHTTP(t *testing.T, method, url string, body any) *http.Response {
	t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return resp
}

// TestIntegration_Packages_RoundTripLinksAndRollup creates a package with links
// against the migrated budget schema, updates its payment and links, checks it
// is counted once in the rollup, and deletes it (links cascade).
func TestIntegration_Packages_RoundTripLinksAndRollup(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	base := srv.URL + "/trips/" + tripID + "/packages"

	stay1 := freshOwnerID(t) // any uuid: links are application-level refs
	stay2 := freshOwnerID(t)
	item1 := freshOwnerID(t)

	do := func(method, url string, body any) *http.Response {
		t.Helper()
		return doHTTP(t, method, url, body)
	}
	decode := func(resp *http.Response, v any) {
		t.Helper()
		defer func() { _ = resp.Body.Close() }()
		if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
			t.Fatalf("decode: %v", err)
		}
	}

	resp := do(http.MethodPost, base, map[string]any{
		"name": "Mauritania Round 18", "provider": "Against the Compass",
		"total_cost": 1200, "paid_amount": 300, "balance_due": "2026-11-15",
		"start_date": "2026-11-29", "end_date": "2026-12-06",
		"includes": []string{"beds", "transport", "meals"},
		"stay_ids": []string{stay1, stay2}, "plan_item_ids": []string{item1},
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d", resp.StatusCode)
	}
	var p packageResponse
	decode(resp, &p)
	if p.TotalCost != 1200 || p.PaidAmount != 300 || p.BalanceDue == nil || len(p.StayIDs) != 2 || len(p.PlanItemIDs) != 1 {
		t.Fatalf("created: %+v", p)
	}
	if p.StartDate != "2026-11-29" || p.EndDate != "2026-12-06" || len(p.Includes) != 3 || p.Category != "Other" {
		t.Fatalf("created fields: %+v", p)
	}

	// Rollup: 300 spent, 900 still to pay.
	resp = do(http.MethodGet, srv.URL+"/trips/"+tripID+"/budget/rollup", nil)
	var r RollupResult
	decode(resp, &r)
	if r.TripTotal != 300 || r.EstimatedTripTotal != 900 || r.PackageSpent != 300 ||
		r.ByCategory["Other"] != 300 || r.EstimatedByCategory["Other"] != 900 {
		t.Fatalf("rollup before paying: %+v", r)
	}

	// Move it to Activities: the category totals follow.
	resp = do(http.MethodPatch, base+"/"+p.ID, map[string]any{"category": "Activities"})
	var moved packageResponse
	decode(resp, &moved)
	if moved.Category != "Activities" {
		t.Fatalf("category update: %+v", moved)
	}
	resp = do(http.MethodGet, srv.URL+"/trips/"+tripID+"/budget/rollup", nil)
	var rm RollupResult
	decode(resp, &rm)
	if rm.ByCategory["Activities"] != 300 || rm.ByCategory["Other"] != 0 {
		t.Fatalf("rollup after moving category: %+v", rm.ByCategory)
	}

	// Pay the rest, clear the due date, drop one stay link; name untouched.
	resp = do(http.MethodPatch, base+"/"+p.ID, map[string]any{
		"paid_amount": 1200, "balance_due": nil, "stay_ids": []string{stay1},
	})
	var u packageResponse
	decode(resp, &u)
	if u.PaidAmount != 1200 || u.BalanceDue != nil || len(u.StayIDs) != 1 || u.StayIDs[0] != stay1 ||
		len(u.PlanItemIDs) != 1 || u.Name != "Mauritania Round 18" {
		t.Fatalf("updated: %+v", u)
	}

	// Lowering the total under what's paid is refused by the merge check.
	resp = do(http.MethodPatch, base+"/"+p.ID, map[string]any{"total_cost": 100})
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("total below paid: want 400, got %d", resp.StatusCode)
	}

	resp = do(http.MethodGet, srv.URL+"/trips/"+tripID+"/budget/rollup", nil)
	decode(resp, &r)
	if r.TripTotal != 1200 || r.EstimatedTripTotal != 0 {
		t.Fatalf("rollup after paying: %+v", r)
	}

	// Another trip can't see or delete it.
	other := insertTrip(t, ownerID)
	resp = do(http.MethodDelete, srv.URL+"/trips/"+other+"/packages/"+p.ID, nil)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("cross-trip delete: want 404, got %d", resp.StatusCode)
	}

	resp = do(http.MethodDelete, base+"/"+p.ID, nil)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: %d", resp.StatusCode)
	}
	var links int
	if err := testPool.QueryRow(t.Context(), `SELECT count(*) FROM budget.package_links WHERE package_id = $1::uuid`, p.ID).Scan(&links); err != nil {
		t.Fatal(err)
	}
	if links != 0 {
		t.Fatalf("links should cascade on delete, %d left", links)
	}
}
