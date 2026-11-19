//go:build integration

package trip

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

// TestSetPlanItemSpontaneousIntegration: an item can be marked spontaneous and
// back, the flag survives a full edit (which doesn't send it), and a missing
// item is 404.
func TestSetPlanItemSpontaneousIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-01")
	pi := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Street food","day_id":%q}`, dayID))
	if pi.Spontaneous {
		t.Fatal("new item should not be spontaneous")
	}

	set := func(v bool) planItemResponse {
		t.Helper()
		path := fmt.Sprintf("%s/%s/plan-items/%s/spontaneous", TripsPath, tripID, pi.ID)
		resp := postJSON(t, srv, path, json.RawMessage(fmt.Sprintf(`{"spontaneous":%t}`, v)))
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("set spontaneous %t: status %d", v, resp.StatusCode)
		}
		var got planItemResponse
		if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
			t.Fatal(err)
		}
		return got
	}

	if got := set(true); !got.Spontaneous || got.Title != "Street food" {
		t.Fatalf("after set true: %+v", got)
	}
	// A full edit (as the form sends) leaves the flag alone.
	er := patchJSON(t, srv, fmt.Sprintf("%s/%s/plan-items/%s", TripsPath, tripID, pi.ID),
		json.RawMessage(`{"title":"Street food at Sandaga"}`))
	var edited planItemResponse
	_ = json.NewDecoder(er.Body).Decode(&edited)
	_ = er.Body.Close()
	if er.StatusCode != http.StatusOK || !edited.Spontaneous || edited.Title != "Street food at Sandaga" {
		t.Errorf("full edit cleared spontaneous: %+v", edited)
	}
	// Skipping doesn't touch it either.
	if got := setPlanItemStatus(t, srv, tripID, pi.ID, "skipped"); !got.Spontaneous {
		t.Errorf("status change cleared spontaneous")
	}
	if got := set(false); got.Spontaneous {
		t.Errorf("after set false: still spontaneous")
	}

	path := fmt.Sprintf("%s/%s/plan-items/%s/spontaneous", TripsPath, tripID, "00000000-0000-0000-0000-000000000000")
	resp := postJSON(t, srv, path, json.RawMessage(`{"spontaneous":true}`))
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("missing item: status %d, want 404", resp.StatusCode)
	}
	bad := postJSON(t, srv, fmt.Sprintf("%s/%s/plan-items/%s/spontaneous", TripsPath, tripID, pi.ID), json.RawMessage(`{}`))
	_ = bad.Body.Close()
	if bad.StatusCode != http.StatusBadRequest {
		t.Errorf("empty body: status %d, want 400", bad.StatusCode)
	}
}
