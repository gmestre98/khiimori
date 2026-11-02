package trip

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// updateDayReq builds a PATCH /trips/{id}/days/{date} request.
func updateDayReq(tripID, date, userID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPatch, TripsPath+"/"+tripID+"/days/"+date, strings.NewReader(body))
	req.SetPathValue("id", tripID)
	req.SetPathValue("date", date)
	return withPrincipal(req, userID)
}

func TestHandleUpdateDaySetsTrimmedTitle(t *testing.T) {
	t.Parallel()
	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleUpdateDay(rec, updateDayReq("trip-uuid", "2026-11-19", "owner-1", `{"title":"  Gorée and the corniche "}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if store.gotSetTitle == nil || *store.gotSetTitle != "Gorée and the corniche" {
		t.Fatalf("stored title = %v, want trimmed title", store.gotSetTitle)
	}
	if store.gotSetTitleTripID != "trip-uuid" || store.gotSetTitleDate != "2026-11-19" {
		t.Errorf("store called with %q %q", store.gotSetTitleTripID, store.gotSetTitleDate)
	}
	var resp dayTitleResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Title != "Gorée and the corniche" || resp.Date != "2026-11-19" {
		t.Errorf("response = %+v", resp)
	}
}

func TestHandleUpdateDayClearsTitle(t *testing.T) {
	t.Parallel()
	store := &fakeTripStore{}
	m := newCreateModule(store)

	rec := httptest.NewRecorder()
	m.handleUpdateDay(rec, updateDayReq("trip-uuid", "2026-11-19", "owner-1", `{"title":"   "}`))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if store.gotSetTitle == nil || *store.gotSetTitle != "" {
		t.Fatalf("blank title should clear, stored %v", store.gotSetTitle)
	}
}

func TestHandleUpdateDayRejectsBadInput(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, date, body string
		want             int
	}{
		{"missing title", "2026-11-19", `{}`, http.StatusBadRequest},
		{"too long", "2026-11-19", `{"title":"` + strings.Repeat("é", maxDayTitleLen+1) + `"}`, http.StatusBadRequest},
		{"bad json", "2026-11-19", `{`, http.StatusBadRequest},
		{"bad date", "19-11-2026", `{"title":"x"}`, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &fakeTripStore{}
			m := newCreateModule(store)
			rec := httptest.NewRecorder()
			m.handleUpdateDay(rec, updateDayReq("trip-uuid", tc.date, "owner-1", tc.body))
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d", rec.Code, tc.want)
			}
			if store.gotSetTitle != nil {
				t.Error("store should not be called")
			}
		})
	}
}

func TestHandleUpdateDayAcceptsMaxLengthInRunes(t *testing.T) {
	t.Parallel()
	store := &fakeTripStore{}
	m := newCreateModule(store)
	rec := httptest.NewRecorder()
	body := `{"title":"` + strings.Repeat("é", maxDayTitleLen) + `"}`
	m.handleUpdateDay(rec, updateDayReq("trip-uuid", "2026-11-19", "owner-1", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 for an %d-character title", rec.Code, maxDayTitleLen)
	}
}

func TestHandleUpdateDayNotFound(t *testing.T) {
	t.Parallel()
	store := &fakeTripStore{setTitleErr: errDayNotFound}
	m := newCreateModule(store)
	rec := httptest.NewRecorder()
	m.handleUpdateDay(rec, updateDayReq("trip-uuid", "2030-01-01", "owner-1", `{"title":"x"}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestHandleUpdateDayDeniedWithoutWriteAccess(t *testing.T) {
	t.Parallel()
	store := &fakeTripStore{}
	m := newCreateModule(store)
	m.authz = denyAllAuthorizer{}
	rec := httptest.NewRecorder()
	m.handleUpdateDay(rec, updateDayReq("trip-uuid", "2026-11-19", "viewer-1", `{"title":"x"}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if store.gotSetTitle != nil {
		t.Error("store should not be called without write access")
	}
}

func TestHandleGetDayIncludesTitle(t *testing.T) {
	t.Parallel()
	store := &fakeTripStore{getDayResult: Day{
		ID: "day-uuid", TripID: "trip-uuid", Date: mustDate(t, "2026-11-19"), Title: "Gorée",
	}}
	m := newCreateModule(store)
	rec := httptest.NewRecorder()
	m.handleGetDay(rec, getDayReq("trip-uuid", "2026-11-19", "owner-1"))
	var resp dayResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Title != "Gorée" {
		t.Errorf("title = %q, want Gorée", resp.Title)
	}
}
