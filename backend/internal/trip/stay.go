package trip

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	maxStayNameLen     = 200
	maxStayLocationLen = 500
	maxStayLinkLen     = 2048
)

// Stay is a single accommodation entry (trip.stays, PRD §9, §5.2). A stay is
// entered once and may span multiple calendar nights via its check_in/check_out
// range; S3 surfaces it on every covered day at read time.
//
// cost is owned here; Milestone 05 reads it for budget roll-ups. link is a raw
// URL (hotel booking, Airbnb listing, etc.).
type Stay struct {
	ID       string
	TripID   string
	Name     string
	Location string     // optional
	CheckIn  *time.Time // optional; date only
	CheckOut *time.Time // optional; date only
	Cost     *float64   // optional
	Link     string     // optional; URL
}

// NewStay is the validated input to create a stay. ClientID, if non-empty, is a
// caller-supplied UUID used for upsert semantics — Epic 06's offline queue
// generates a stable id before going offline and replays the same id on
// reconnect. When empty the DB generates the id.
type NewStay struct {
	ClientID string  // optional client-generated UUID for upsert idempotency
	TripID   string
	Name     string
	Location string
	CheckIn  *time.Time
	CheckOut *time.Time
	Cost     *float64
	Link     string
}

// EditStay is the validated input to edit a stay. All fields replace the
// existing values; callers supply all editable fields.
type EditStay struct {
	Name     string
	Location string
	CheckIn  *time.Time
	CheckOut *time.Time
	Cost     *float64
	Link     string
}

// validateStayFields checks the client-supplied stay fields used by both create
// and edit. It returns a client-safe error describing the first problem.
func validateStayFields(name, location string, checkIn, checkOut *time.Time, link string) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("name is required")
	}
	if len(name) > maxStayNameLen {
		return fmt.Errorf("name must be at most %d characters", maxStayNameLen)
	}
	if len(location) > maxStayLocationLen {
		return fmt.Errorf("location must be at most %d characters", maxStayLocationLen)
	}
	if len(link) > maxStayLinkLen {
		return fmt.Errorf("link must be at most %d characters", maxStayLinkLen)
	}
	if link != "" {
		if _, err := url.ParseRequestURI(link); err != nil {
			return errors.New("link must be a valid URL")
		}
	}
	if checkIn != nil && checkOut != nil && checkOut.Before(*checkIn) {
		return errors.New("check_out must be on or after check_in")
	}
	return nil
}
