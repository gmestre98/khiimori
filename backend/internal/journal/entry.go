package journal

import (
	"encoding/json"
	"errors"
	"time"
)

// JournalEntry is a day's journal entry in journal.journal_entries.
type JournalEntry struct {
	ID        string
	DayID     string
	AuthorID  string
	Body      json.RawMessage // JSONB envelope; plain {"text":"..."} for now
	Rating    *int            // nil == not set; 1–5 when set
	Weather   string          // empty == not set
	Mood      string          // empty == not set
	CreatedAt time.Time
	UpdatedAt time.Time
}

// UpsertEntry is the validated input for creating or updating a day's entry.
// It is idempotent: repeated calls for the same DayID update the existing row.
type UpsertEntry struct {
	DayID    string
	AuthorID string
	Body     json.RawMessage
	Rating   *int   // nil == clear/leave unset
	Weather  string // empty == clear
	Mood     string // empty == clear
}

// ErrEntryNotFound is returned when a get/update targets a non-existent entry.
var ErrEntryNotFound = errors.New("journal: entry not found")

func (u UpsertEntry) validate() error {
	if u.DayID == "" {
		return errors.New("journal: day_id is required")
	}
	if u.AuthorID == "" {
		return errors.New("journal: author_id is required")
	}
	if u.Rating != nil && (*u.Rating < 1 || *u.Rating > 5) {
		return errors.New("journal: rating must be between 1 and 5")
	}
	return nil
}
