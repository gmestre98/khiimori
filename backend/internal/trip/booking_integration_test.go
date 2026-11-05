//go:build integration

package trip

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func stayCall(t *testing.T, srv *httptest.Server, method, path, body string) stayResponse {
	t.Helper()
	req, err := http.NewRequest(method, srv.URL+path, bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		t.Fatalf("%s %s = %d", method, path, resp.StatusCode)
	}
	var st stayResponse
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		t.Fatal(err)
	}
	return st
}

// TestStayBookingStatusIntegration covers the four statuses on stays, paid
// mirroring booking_status, and older clients that only send paid.
func TestStayBookingStatusIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	srv := newModule(t)
	tripID := createTripForStayTest(t, srv)
	base := fmt.Sprintf("%s/%s/stays", TripsPath, tripID)

	// New client: status sent.
	st := stayCall(t, srv, http.MethodPost, base, `{"name":"Keur Saloum","booking_status":"to_book"}`)
	if st.BookingStatus != "to_book" || st.Paid {
		t.Fatalf("create to_book: %+v", st)
	}
	// Old client, unpaid → booked; paid → paid.
	if s := stayCall(t, srv, http.MethodPost, base, `{"name":"Old unpaid"}`); s.BookingStatus != "booked" {
		t.Errorf("old unpaid create: %q", s.BookingStatus)
	}
	if s := stayCall(t, srv, http.MethodPost, base, `{"name":"Old paid","paid":true}`); s.BookingStatus != "paid" || !s.Paid {
		t.Errorf("old paid create: %+v", s)
	}

	path := base + "/" + st.ID
	// Set paid via status: paid mirrors.
	if s := stayCall(t, srv, http.MethodPatch, path, `{"name":"Keur Saloum","booking_status":"paid"}`); s.BookingStatus != "paid" || !s.Paid {
		t.Errorf("edit to paid: %+v", s)
	}
	// Old client un-ticks paid → booked.
	if s := stayCall(t, srv, http.MethodPatch, path, `{"name":"Keur Saloum","paid":false}`); s.BookingStatus != "booked" || s.Paid {
		t.Errorf("old client unpaid edit: %+v", s)
	}
	// Set to_book, then an old client edit without paid keeps to_book.
	stayCall(t, srv, http.MethodPatch, path, `{"name":"Keur Saloum","booking_status":"to_book"}`)
	if s := stayCall(t, srv, http.MethodPatch, path, `{"name":"Keur Saloum (renamed)","paid":false}`); s.BookingStatus != "to_book" {
		t.Errorf("old client edit kept status: %+v", s)
	}
	// Free text is normalised.
	if s := stayCall(t, srv, http.MethodPatch, path, `{"name":"Keur Saloum","booking_status":"Confirmed"}`); s.BookingStatus != "booked" {
		t.Errorf("free text: %q", s.BookingStatus)
	}
}
