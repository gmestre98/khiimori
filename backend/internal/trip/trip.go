package trip

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// dateLayout is the wire format for a trip's dates: a calendar date with no time
// or zone (PRD §5.1 — days map to real calendar dates). The store column is
// DATE, so the time component is always zero.
const dateLayout = "2006-01-02"

// Field bounds. Edits beyond these are rejected at the API boundary with a 400.
const (
	maxNameLen        = 200
	maxDestinations   = 50
	maxDestinationLen = 200
	maxCoverLen       = 2048
)

// statusActive and statusArchived are the trip lifecycle states (mirrors the
// DB CHECK). A new trip is active; archive (S4) flips it to archived.
const (
	statusActive   = "active"
	statusArchived = "archived"
)

// baseCurrencyEUR is the fixed base currency for v1 (PRD §5.1). It is set
// server-side and pinned by a DB CHECK — never taken from client input.
const baseCurrencyEUR = "EUR"

// Trip is a trip row (trip.trips, PRD §9, §5.1) — the structural backbone days,
// planning, budgets, journal, and maps hang off. base_currency is always EUR in
// v1 and owner_id/status are server-controlled, so none of them are editable
// from client input.
type Trip struct {
	ID           string
	OwnerID      string // the creator's auth.users id (no cross-schema FK)
	Name         string
	Destinations []string // ordered list of place names; may be empty
	StartDate    time.Time
	EndDate      time.Time
	BaseCurrency string
	Cover        string // Cloud Storage object reference or external URL; may be empty
	Status       string // active | archived
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// NewTrip is the validated input to create a trip. OwnerID is taken from the
// authenticated principal, never the client; base_currency (EUR) and status
// (active) are applied by the column defaults, so they are not fields here.
type NewTrip struct {
	OwnerID      string
	Name         string
	Destinations []string
	StartDate    time.Time
	EndDate      time.Time
	Cover        string
}

// validateTripFields checks the shared, client-supplied trip fields (name,
// destinations, dates, cover) used by both create (S2) and edit (S3). It returns
// a client-safe error describing the first problem, or nil when valid.
func validateTripFields(name string, destinations []string, start, end time.Time, cover string) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("name is required")
	}
	if len(name) > maxNameLen {
		return fmt.Errorf("name must be at most %d characters", maxNameLen)
	}
	if len(destinations) > maxDestinations {
		return fmt.Errorf("at most %d destinations are allowed", maxDestinations)
	}
	for _, d := range destinations {
		if strings.TrimSpace(d) == "" {
			return errors.New("destinations must not be blank")
		}
		if len(d) > maxDestinationLen {
			return fmt.Errorf("each destination must be at most %d characters", maxDestinationLen)
		}
	}
	if end.Before(start) {
		return errors.New("end_date must be on or after start_date")
	}
	if len(cover) > maxCoverLen {
		return fmt.Errorf("cover must be at most %d characters", maxCoverLen)
	}
	return nil
}

// parseDate parses a wire date (YYYY-MM-DD), returning a client-safe error
// naming the field when it is missing or malformed.
func parseDate(field, value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("%s is required", field)
	}
	t, err := time.Parse(dateLayout, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be a date in YYYY-MM-DD format", field)
	}
	return t, nil
}
