package trip

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

const (
	maxPlanItemTitleLen    = 500
	maxPlanItemLocationLen = 500
	maxPlanItemLinkLen     = 2048
	maxPlanItemTypeLen     = 100
)

// PlanItem is a single entry in a day's itinerary (trip.plan_items, PRD §9,
// §5.2). Only title is required; all other fields are optional. An item is
// untimed when StartTime is nil (start_time IS NULL) and timed when StartTime
// is set (with an optional Duration). day_id = nil means the item sits in the
// backlog rather than on a specific day.
type PlanItem struct {
	ID            string
	TripID        string
	DayID         *string  // nil → backlog
	Title         string
	Type          *string  // optional; activity type label
	StartTime     *string  // optional; "HH:MM" — nil means untimed
	Duration      *string  // optional; interval as ISO 8601 duration string
	Location      *string  // optional; feeds Milestone 07 map pins
	BookingStatus *string  // optional
	Cost          *float64 // optional; owned here for M05 roll-ups
	Link          *string  // optional; URL
	SortOrder     int
	Status        string   // "idea"|"planned"|"done"|"skipped"|"cancelled"
}

// NewPlanItem is the validated input to create a plan item. ClientID, when
// non-empty, is a caller-supplied UUID used for upsert/idempotency so
// Epic 06's offline queue can replay the same creation without duplicating.
type NewPlanItem struct {
	ClientID      string   // optional client-generated UUID
	TripID        string
	DayID         *string
	Title         string
	Type          *string
	StartTime     *string
	Duration      *string
	Location      *string
	BookingStatus *string
	Cost          *float64
	Link          *string
}

// validatePlanItemFields checks the client-supplied plan-item fields. It
// returns a client-safe error describing the first problem found.
func validatePlanItemFields(title string, itemType, startTime, duration, location, link *string) error {
	if strings.TrimSpace(title) == "" {
		return errors.New("title is required")
	}
	if len(title) > maxPlanItemTitleLen {
		return fmt.Errorf("title must be at most %d characters", maxPlanItemTitleLen)
	}
	if itemType != nil && len(*itemType) > maxPlanItemTypeLen {
		return fmt.Errorf("type must be at most %d characters", maxPlanItemTypeLen)
	}
	if startTime != nil {
		if _, _, err := parseTimeHHMM(*startTime); err != nil {
			return errors.New("start_time must be in HH:MM format")
		}
	}
	// duration requires start_time
	if duration != nil && startTime == nil {
		return errors.New("duration requires start_time to be set")
	}
	if location != nil && len(*location) > maxPlanItemLocationLen {
		return fmt.Errorf("location must be at most %d characters", maxPlanItemLocationLen)
	}
	if link != nil {
		if len(*link) > maxPlanItemLinkLen {
			return fmt.Errorf("link must be at most %d characters", maxPlanItemLinkLen)
		}
		if _, err := url.ParseRequestURI(*link); err != nil {
			return errors.New("link must be a valid URL")
		}
	}
	return nil
}

// parseTimeHHMM parses a "HH:MM" time string and returns (hour, minute, nil)
// or a descriptive error. It is used for start_time validation.
func parseTimeHHMM(s string) (hour, minute int, err error) {
	if len(s) != 5 || s[2] != ':' {
		return 0, 0, errors.New("not HH:MM")
	}
	for _, i := range []int{0, 1, 3, 4} {
		if s[i] < '0' || s[i] > '9' {
			return 0, 0, errors.New("not HH:MM")
		}
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	if h > 23 || m > 59 {
		return 0, 0, fmt.Errorf("time %s out of range", s)
	}
	return h, m, nil
}
