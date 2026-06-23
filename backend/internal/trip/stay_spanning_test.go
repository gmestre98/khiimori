package trip

// Unit tests for the [check_in, check_out) half-open spanning convention
// (M04.1 S3). These tests exercise staysForDate — a pure in-memory helper —
// so they run without a database.

import (
	"testing"
	"time"
)

// staysForDate returns every stay in the slice whose [check_in, check_out)
// half-open interval covers date. A stay missing either date is excluded.
// This pure helper mirrors the SQL in pgxStayStore.StaysForDay; the unit
// tests here verify the spanning semantics without a database.
func staysForDate(stays []Stay, date time.Time) []Stay {
	d := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	var out []Stay
	for _, s := range stays {
		if s.CheckIn == nil || s.CheckOut == nil {
			continue
		}
		ci := time.Date(s.CheckIn.Year(), s.CheckIn.Month(), s.CheckIn.Day(), 0, 0, 0, 0, time.UTC)
		co := time.Date(s.CheckOut.Year(), s.CheckOut.Month(), s.CheckOut.Day(), 0, 0, 0, 0, time.UTC)
		if !d.Before(ci) && d.Before(co) {
			out = append(out, s)
		}
	}
	return out
}

func d(ymd string) time.Time {
	t, err := time.Parse("2006-01-02", ymd)
	if err != nil {
		panic(err)
	}
	return t
}

func tp(t time.Time) *time.Time { return &t }

func TestStaysForDate_MultiNight(t *testing.T) {
	// Stay covers 2026-08-01 through 2026-08-03 (check_out exclusive).
	stay := Stay{
		ID:       "s1",
		TripID:   "t1",
		Name:     "Grand Hotel",
		CheckIn:  tp(d("2026-08-01")),
		CheckOut: tp(d("2026-08-04")),
	}

	cases := []struct {
		date    string
		wantLen int
	}{
		{"2026-07-31", 0}, // day before — not covered
		{"2026-08-01", 1}, // check_in day — covered
		{"2026-08-02", 1}, // middle night — covered
		{"2026-08-03", 1}, // last covered night
		{"2026-08-04", 0}, // check_out day — excluded (half-open)
		{"2026-08-05", 0}, // day after — not covered
	}

	for _, tc := range cases {
		got := staysForDate([]Stay{stay}, d(tc.date))
		if len(got) != tc.wantLen {
			t.Errorf("date %s: got %d stays, want %d", tc.date, len(got), tc.wantLen)
		}
	}
}

func TestStaysForDate_SingleNight(t *testing.T) {
	// Single-night stay: check_in == check_out - 1 day.
	stay := Stay{
		ID:       "s2",
		TripID:   "t1",
		Name:     "Hostel",
		CheckIn:  tp(d("2026-08-10")),
		CheckOut: tp(d("2026-08-11")),
	}

	cases := []struct {
		date    string
		wantLen int
	}{
		{"2026-08-09", 0},
		{"2026-08-10", 1}, // the only covered night
		{"2026-08-11", 0}, // check_out is exclusive
	}

	for _, tc := range cases {
		got := staysForDate([]Stay{stay}, d(tc.date))
		if len(got) != tc.wantLen {
			t.Errorf("date %s: got %d stays, want %d", tc.date, len(got), tc.wantLen)
		}
	}
}

func TestStaysForDate_NoDates(t *testing.T) {
	// A stay without dates must not appear on any day.
	stay := Stay{ID: "s3", TripID: "t1", Name: "Dateless"}

	got := staysForDate([]Stay{stay}, d("2026-08-01"))
	if len(got) != 0 {
		t.Errorf("got %d stays for dateless entry, want 0", len(got))
	}
}

func TestStaysForDate_DateEditChangeCoverage(t *testing.T) {
	// Before edit: covers Aug 1-3. After edit: covers Aug 5-7.
	// Simulates updating check_in/check_out — coverage follows the new range.
	before := Stay{
		ID:       "s4",
		TripID:   "t1",
		Name:     "Hotel",
		CheckIn:  tp(d("2026-08-01")),
		CheckOut: tp(d("2026-08-04")),
	}
	after := Stay{
		ID:       "s4",
		TripID:   "t1",
		Name:     "Hotel",
		CheckIn:  tp(d("2026-08-05")),
		CheckOut: tp(d("2026-08-08")),
	}

	if got := staysForDate([]Stay{before}, d("2026-08-02")); len(got) != 1 {
		t.Errorf("before edit: Aug 02 wants 1 stay, got %d", len(got))
	}
	if got := staysForDate([]Stay{before}, d("2026-08-06")); len(got) != 0 {
		t.Errorf("before edit: Aug 06 wants 0 stays, got %d", len(got))
	}

	if got := staysForDate([]Stay{after}, d("2026-08-02")); len(got) != 0 {
		t.Errorf("after edit: Aug 02 wants 0 stays, got %d", len(got))
	}
	if got := staysForDate([]Stay{after}, d("2026-08-06")); len(got) != 1 {
		t.Errorf("after edit: Aug 06 wants 1 stay, got %d", len(got))
	}
}

func TestStaysForDate_MultipleStays(t *testing.T) {
	// Two overlapping stays on the same day.
	s1 := Stay{ID: "s1", TripID: "t1", Name: "A", CheckIn: tp(d("2026-08-01")), CheckOut: tp(d("2026-08-05"))}
	s2 := Stay{ID: "s2", TripID: "t1", Name: "B", CheckIn: tp(d("2026-08-03")), CheckOut: tp(d("2026-08-07"))}

	got := staysForDate([]Stay{s1, s2}, d("2026-08-03"))
	if len(got) != 2 {
		t.Errorf("Aug 03 (overlap): got %d stays, want 2", len(got))
	}
	got = staysForDate([]Stay{s1, s2}, d("2026-08-01"))
	if len(got) != 1 {
		t.Errorf("Aug 01 (only s1): got %d stays, want 1", len(got))
	}
}
