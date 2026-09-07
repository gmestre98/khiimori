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
	CreatedAt time.Time
	UpdatedAt time.Time
}

// UpsertEntry is the validated input for creating or updating a day's entry.
// It is idempotent: repeated calls for the same DayID update the existing row.
type UpsertEntry struct {
	DayID    string
	AuthorID string
	Body     json.RawMessage
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
	return nil
}
