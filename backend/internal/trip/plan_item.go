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

// planItemKinds is the set of allowed plan-item kinds (M12.1). Kind describes
// how an item behaves while planning and is independent of its budget category
// (the `type` field): 'activity' (the default — a thing to do), 'transport' (a
// leg of travel with an origin→destination and arrival time), 'food' (a meal or
// reservation), and 'note' (a time-less, place-less reminder). The same set is
// declared as a CHECK constraint on trip.plan_items.kind as a backstop.
var planItemKinds = map[string]struct{}{
	"activity":  {},
	"transport": {},
	"food":      {},
	"note":      {},
}

// defaultPlanItemKind is applied when a create/edit request omits kind, so the
// offline write queue can replay older payloads that predate the column (PRD §6).
const defaultPlanItemKind = "activity"

// normalizePlanItemKind returns the trimmed, lower-cased kind, falling back to
// defaultPlanItemKind when kind is nil or blank.
func normalizePlanItemKind(kind *string) string {
	if kind == nil {
		return defaultPlanItemKind
	}
	k := strings.ToLower(strings.TrimSpace(*kind))
	if k == "" {
		return defaultPlanItemKind
	}
	return k
}

// validatePlanItemKind returns a client-safe error when kind is not one of the
// allowed values. Membership only — there is no transition graph.
func validatePlanItemKind(kind string) error {
	if _, ok := planItemKinds[kind]; !ok {
		return errors.New("kind must be one of activity, transport, food, note")
	}
	return nil
}

// PlanItem is a single entry in a day's itinerary (trip.plan_items, PRD §9,
// §5.2). Only title is required; all other fields are optional. An item is
// untimed when StartTime is nil (start_time IS NULL) and timed when StartTime
// is set (with an optional Duration). day_id = nil means the item sits in the
// backlog rather than on a specific day.
type PlanItem struct {
	ID            string
	TripID        string
	DayID         *string // nil → backlog
	Title         string
	Kind          string   // behaviour: activity|transport|food|note (M12.1)
	Type          *string  // optional; budget category label (Transport, Food, …)
	StartTime     *string  // optional; "HH:MM" — nil means untimed
	Duration      *string  // optional; interval as ISO 8601 duration string
	Location      *string  // optional; feeds Milestone 07 map pins
	BookingStatus *string  // optional
	Cost          *float64 // optional; owned here for M05 roll-ups
	Link          *string  // optional; URL
	SortOrder     int
	Status        string // "idea"|"planned"|"done"|"skipped"|"cancelled"
}

// NewPlanItem is the validated input to create a plan item. ClientID, when
// non-empty, is a caller-supplied UUID used for upsert/idempotency so
// Epic 06's offline queue can replay the same creation without duplicating.
type NewPlanItem struct {
	ClientID      string // optional client-generated UUID
	TripID        string
	DayID         *string
	Title         string
	Kind          string
	Type          *string
	StartTime     *string
	Duration      *string
	Location      *string
	BookingStatus *string
	Cost          *float64
	Link          *string
}

// EditPlanItem is the validated input to edit a plan item. The update is a
// full replacement: every editable column is overwritten. Nil pointer fields
// map to SQL NULL (clearing the value). Setting StartTime to nil makes the
// item untimed; Duration must also be nil when StartTime is nil (enforced by
// validatePlanItemFields).
type EditPlanItem struct {
	Title         string
	Kind          string
	Type          *string
	StartTime     *string
	Duration      *string
	Location      *string
	BookingStatus *string
	Cost          *float64
	Link          *string
}

// PromotePlanItemInput is the validated input to promote a backlog item to a
// specific day. DayID is required; StartTime is optional — when set the item
// becomes timed on that day.
type PromotePlanItemInput struct {
	DayID     string
	StartTime *string // optional; "HH:MM"
}

// MovePlanItemInput is the validated input to move an item to a different day
// within the same trip. DayID is required. StartTime is optional: when non-nil
// it replaces the item's existing start_time; when nil the existing start_time
// is preserved (a timed item stays timed on the new day).
type MovePlanItemInput struct {
	DayID     string
	StartTime *string // optional; "HH:MM" — nil means keep existing
}

// planItemStatuses is the set of allowed plan-item lifecycle states (PRD §9).
// v1 deliberately permits any transition between them — there is no rigid state
// machine (PRD §7.0); only membership in this set is enforced. The same set is
// declared as a CHECK constraint on trip.plan_items.status as a backstop.
var planItemStatuses = map[string]struct{}{
	"idea":      {},
	"planned":   {},
	"done":      {},
	"skipped":   {},
	"cancelled": {},
}

// validatePlanItemStatus returns a client-safe error when status is not one of
// the allowed lifecycle states. It enforces membership only — any value in the
// set is accepted regardless of the item's current status (no transition graph).
func validatePlanItemStatus(status string) error {
	if _, ok := planItemStatuses[status]; !ok {
		return errors.New("status must be one of idea, planned, done, skipped, cancelled")
	}
	return nil
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
