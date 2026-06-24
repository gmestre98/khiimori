package journal

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// journalStore is the persistence surface for journal entries and photos.
// The concrete pgxJournalStore implements it; unit tests supply a fake.
type journalStore interface {
	UpsertEntry(ctx context.Context, e UpsertEntry) (JournalEntry, error)
	GetEntry(ctx context.Context, dayID string) (JournalEntry, error)
	InsertPhoto(ctx context.Context, p Photo) (Photo, error)
	ListPhotos(ctx context.Context, journalEntryID string) ([]Photo, error)
	// TripUsageBytes returns the sum of size_bytes for all original photos in
	// the trip (thumbnails are excluded from the cap — see photo.go).
	TripUsageBytes(ctx context.Context, tripID string) (int64, error)
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

// InsertPhoto writes a Photo row. The caller must have already stored the object
// via MediaStore.Put (storage_url must be non-empty).
func (s *pgxJournalStore) InsertPhoto(ctx context.Context, p Photo) (Photo, error) {
	const q = `
		INSERT INTO journal.photos (journal_entry_id, storage_url, caption, size_bytes, is_thumbnail)
		VALUES ($1::uuid, $2, NULLIF($3, ''), $4, $5)
		RETURNING id::text, journal_entry_id::text, storage_url,
		          COALESCE(caption, ''), size_bytes, is_thumbnail, created_at`

	var out Photo
	err := s.pool.QueryRow(ctx, q, p.JournalEntryID, p.StorageURL, p.Caption, p.SizeBytes, p.IsThumbnail).Scan(
		&out.ID, &out.JournalEntryID, &out.StorageURL, &out.Caption, &out.SizeBytes, &out.IsThumbnail, &out.CreatedAt,
	)
	if err != nil {
		return Photo{}, fmt.Errorf("journal: insert photo: %w", err)
	}
	return out, nil
}

// TripUsageBytes returns the total original-photo bytes stored for a trip.
// Only original photos count toward the cap; thumbnails are free (see photo.go).
func (s *pgxJournalStore) TripUsageBytes(ctx context.Context, tripID string) (int64, error) {
	const q = `
		SELECT COALESCE(SUM(p.size_bytes), 0)
		FROM journal.photos p
		JOIN journal.journal_entries je ON je.id = p.journal_entry_id
		JOIN trip.days d ON d.id = je.day_id
		WHERE d.trip_id = $1::uuid AND p.is_thumbnail = FALSE`

	var total int64
	if err := s.pool.QueryRow(ctx, q, tripID).Scan(&total); err != nil {
		return 0, fmt.Errorf("journal: trip usage bytes: %w", err)
	}
	return total, nil
}

// ListPhotos returns all photos attached to a journal entry, ordered by creation time.
func (s *pgxJournalStore) ListPhotos(ctx context.Context, journalEntryID string) ([]Photo, error) {
	const q = `
		SELECT id::text, journal_entry_id::text, storage_url,
		       COALESCE(caption, ''), size_bytes, is_thumbnail, created_at
		FROM journal.photos
		WHERE journal_entry_id = $1::uuid
		ORDER BY created_at ASC`

	rows, err := s.pool.Query(ctx, q, journalEntryID)
	if err != nil {
		return nil, fmt.Errorf("journal: list photos: %w", err)
	}
	defer rows.Close()

	var out []Photo
	for rows.Next() {
		var p Photo
		if err := rows.Scan(&p.ID, &p.JournalEntryID, &p.StorageURL, &p.Caption, &p.SizeBytes, &p.IsThumbnail, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("journal: scan photo: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("journal: list photos rows: %w", err)
	}
	return out, nil
}
