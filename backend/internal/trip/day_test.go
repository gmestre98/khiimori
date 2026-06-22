package trip

import (
	"testing"
	"time"
)

// TestDatesInRange covers the pure date-range generator: a multi-day trip, a
// single-day trip, and the edge case where end equals start (same day → one day).
func TestDatesInRange(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		start     string
		end       string
		wantCount int
		wantFirst string
		wantLast  string
	}{
		{
			name:      "multi-day",
			start:     "2026-07-01",
			end:       "2026-07-10",
			wantCount: 10,
			wantFirst: "2026-07-01",
			wantLast:  "2026-07-10",
		},
		{
			name:      "single day",
			start:     "2026-07-01",
			end:       "2026-07-01",
			wantCount: 1,
			wantFirst: "2026-07-01",
			wantLast:  "2026-07-01",
		},
		{
			name:      "two days",
			start:     "2026-12-31",
			end:       "2027-01-01",
			wantCount: 2,
			wantFirst: "2026-12-31",
			wantLast:  "2027-01-01",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			start := mustDate(t, tc.start)
			end := mustDate(t, tc.end)
			dates := datesInRange(start, end)

			if len(dates) != tc.wantCount {
				t.Errorf("len = %d, want %d", len(dates), tc.wantCount)
			}
			if len(dates) == 0 {
				return
			}
			gotFirst := dates[0].Format("2006-01-02")
			gotLast := dates[len(dates)-1].Format("2006-01-02")
			if gotFirst != tc.wantFirst {
				t.Errorf("first = %s, want %s", gotFirst, tc.wantFirst)
			}
			if gotLast != tc.wantLast {
				t.Errorf("last = %s, want %s", gotLast, tc.wantLast)
			}
			// Verify strictly ascending by one calendar day.
			for i := 1; i < len(dates); i++ {
				diff := dates[i].Sub(dates[i-1])
				if diff != 24*time.Hour {
					t.Errorf("gap between index %d and %d = %v, want 24h", i-1, i, diff)
				}
			}
		})
	}
}
