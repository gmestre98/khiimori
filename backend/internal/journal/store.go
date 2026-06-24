package journal

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// journalStore is the persistence surface for journal entries.
// The concrete pgxJournalStore implements it; unit tests supply a fake.
type journalStore interface {
	UpsertEntry(ctx context.Context, e UpsertEntry) (JournalEntry, error)
	GetEntry(ctx context.Context, dayID string) (JournalEntry, error)
}

// pgxJournalStore is the Postgres-backed journal store.
type pgxJournalStore struct {
	pool *pgxpool.Pool
}

// UpsertEntry inserts or updates the day's single journal entry (idempotent).
// author_id is set on insert and updated on subsequent saves so the last writer
// is always recorded (supports shared-trip companions journaling).
func (s *pgxJournalStore) UpsertEntry(ctx context.Context, e UpsertEntry) (JournalEntry, error) {
	const q = `
		INSERT INTO journal.journal_entries (day_id, author_id, body, rating, weather, mood)
		VALUES ($1::uuid, $2::uuid, $3, $4, NULLIF($5, ''), NULLIF($6, ''))
		ON CONFLICT (day_id) DO UPDATE
		SET author_id  = EXCLUDED.author_id,
		    body       = EXCLUDED.body,
		    rating     = EXCLUDED.rating,
		    weather    = EXCLUDED.weather,
		    mood       = EXCLUDED.mood,
		    updated_at = now()
		RETURNING id::text, day_id::text, author_id::text, body,
		          rating, COALESCE(weather, ''), COALESCE(mood, ''),
		          created_at, updated_at`

	var out JournalEntry
	err := s.pool.QueryRow(ctx, q,
		e.DayID, e.AuthorID, e.Body, e.Rating, e.Weather, e.Mood,
	).Scan(
		&out.ID, &out.DayID, &out.AuthorID, &out.Body,
		&out.Rating, &out.Weather, &out.Mood,
		&out.CreatedAt, &out.UpdatedAt,
	)
	if err != nil {
		return JournalEntry{}, fmt.Errorf("journal: upsert entry: %w", err)
	}
	return out, nil
}

// GetEntry returns the journal entry for dayID, or ErrEntryNotFound.
func (s *pgxJournalStore) GetEntry(ctx context.Context, dayID string) (JournalEntry, error) {
	const q = `
		SELECT id::text, day_id::text, author_id::text, body,
		       rating, COALESCE(weather, ''), COALESCE(mood, ''),
		       created_at, updated_at
		FROM journal.journal_entries
		WHERE day_id = $1::uuid`

	var out JournalEntry
	err := s.pool.QueryRow(ctx, q, dayID).Scan(
		&out.ID, &out.DayID, &out.AuthorID, &out.Body,
		&out.Rating, &out.Weather, &out.Mood,
		&out.CreatedAt, &out.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return JournalEntry{}, ErrEntryNotFound
	}
	if err != nil {
		return JournalEntry{}, fmt.Errorf("journal: get entry: %w", err)
	}
	return out, nil
}
