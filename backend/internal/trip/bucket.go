package trip

import "time"

// Bucket classifies a trip relative to today.
type Bucket string

const (
	BucketCurrent  Bucket = "current"
	BucketUpcoming Bucket = "upcoming"
	BucketPast     Bucket = "past"
)

// bucketTrip classifies a trip into Current/Upcoming/Past given a server-supplied
// today (midnight, no time component). Boundary rule: a trip whose start_date or
// end_date equals today is Current (PRD §5.1).
//
// Returns the bucket and whether this trip spans today (i.e. is the current trip).
// isCurrent is true only for BucketCurrent trips; it is a named return so callers
// can distinguish "is this THE current trip" from the bucket label without
// re-implementing the boundary logic.
func bucketTrip(start, end, today time.Time) (bucket Bucket, isCurrent bool) {
	// Truncate to date precision so callers who pass a time.Time with a time
	// component still get the right answer.
	today = today.Truncate(24 * time.Hour)
	start = start.Truncate(24 * time.Hour)
	end = end.Truncate(24 * time.Hour)

	switch {
	case !today.Before(start) && !today.After(end):
		// today in [start, end] — inclusive on both boundaries.
		return BucketCurrent, true
	case start.After(today):
		return BucketUpcoming, false
	default:
		return BucketPast, false
	}
}
