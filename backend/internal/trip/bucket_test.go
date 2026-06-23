package trip

import (
	"testing"
	"time"
)

func TestBucketTrip(t *testing.T) {
	t.Parallel()

	d := func(s string) time.Time {
		t.Helper()
		v, err := time.Parse(dateLayout, s)
		if err != nil {
			t.Fatalf("parse %q: %v", s, err)
		}
		return v
	}

	today := d("2026-07-10")

	tests := []struct {
		name        string
		start, end  string
		wantBucket  Bucket
		wantCurrent bool
	}{
		// Current: today within [start, end]
		{"spans today", "2026-07-05", "2026-07-15", BucketCurrent, true},
		// Boundary: starts exactly today
		{"starts today", "2026-07-10", "2026-07-20", BucketCurrent, true},
		// Boundary: ends exactly today
		{"ends today", "2026-07-01", "2026-07-10", BucketCurrent, true},
		// Single-day trip on today
		{"single day today", "2026-07-10", "2026-07-10", BucketCurrent, true},
		// Upcoming: starts after today
		{"upcoming", "2026-07-11", "2026-07-20", BucketUpcoming, false},
		// Single-day trip tomorrow
		{"upcoming single day", "2026-07-11", "2026-07-11", BucketUpcoming, false},
		// Past: ends before today
		{"past", "2026-07-01", "2026-07-09", BucketPast, false},
		// Single-day trip yesterday
		{"past single day", "2026-07-09", "2026-07-09", BucketPast, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			bucket, isCurrent := bucketTrip(d(tc.start), d(tc.end), today)
			if bucket != tc.wantBucket {
				t.Errorf("bucket: got %q, want %q", bucket, tc.wantBucket)
			}
			if isCurrent != tc.wantCurrent {
				t.Errorf("isCurrent: got %v, want %v", isCurrent, tc.wantCurrent)
			}
		})
	}
}

// TestBucketTripTruncatesTime verifies that callers passing a time.Time with a
// non-zero time component get the same result as passing midnight (boundary safety).
func TestBucketTripTruncatesTime(t *testing.T) {
	t.Parallel()

	noon, _ := time.Parse("2006-01-02 15:04", "2026-07-10 12:00")
	start, _ := time.Parse(dateLayout, "2026-07-10")
	end, _ := time.Parse(dateLayout, "2026-07-10")

	bucket, isCurrent := bucketTrip(start, end, noon)
	if bucket != BucketCurrent {
		t.Errorf("got %q, want current", bucket)
	}
	if !isCurrent {
		t.Error("expected isCurrent=true")
	}
}
