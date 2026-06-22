package trip

import (
	"strings"
	"testing"
	"time"
)

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse(dateLayout, s)
	if err != nil {
		t.Fatalf("parsing test date %q: %v", s, err)
	}
	return d
}

// TestValidateTripFields covers the shared create/edit validation: a valid case,
// and each rejection (blank name, too-long name, too many/blank/too-long
// destinations, end before start, over-long cover).
func TestValidateTripFields(t *testing.T) {
	t.Parallel()

	start := mustDate(t, "2026-07-01")
	end := mustDate(t, "2026-07-10")

	tooMany := make([]string, maxDestinations+1)
	for i := range tooMany {
		tooMany[i] = "X"
	}

	tests := []struct {
		name         string
		tripName     string
		destinations []string
		start, end   time.Time
		cover        string
		wantErr      bool
	}{
		{"valid", "Lisbon", []string{"Lisbon", "Porto"}, start, end, "", false},
		{"valid same-day", "Day trip", nil, start, start, "", false},
		{"blank name", "   ", nil, start, end, "", true},
		{"empty name", "", nil, start, end, "", true},
		{"name too long", strings.Repeat("a", maxNameLen+1), nil, start, end, "", true},
		{"too many destinations", "Trip", tooMany, start, end, "", true},
		{"blank destination", "Trip", []string{"Lisbon", "  "}, start, end, "", true},
		{"destination too long", "Trip", []string{strings.Repeat("d", maxDestinationLen+1)}, start, end, "", true},
		{"end before start", "Trip", nil, end, start, "", true},
		{"cover too long", "Trip", nil, start, end, strings.Repeat("c", maxCoverLen+1), true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := validateTripFields(tc.tripName, tc.destinations, tc.start, tc.end, tc.cover)
			if tc.wantErr && err == nil {
				t.Fatal("expected an error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

// TestParseDate covers the wire date parsing: valid, empty (missing), and
// malformed inputs.
func TestParseDate(t *testing.T) {
	t.Parallel()

	if _, err := parseDate("start_date", "2026-07-01"); err != nil {
		t.Errorf("valid date: unexpected error %v", err)
	}
	if _, err := parseDate("start_date", ""); err == nil {
		t.Error("empty date: expected an error")
	}
	if _, err := parseDate("start_date", "01/07/2026"); err == nil {
		t.Error("malformed date: expected an error")
	}
}
