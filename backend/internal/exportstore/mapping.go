// Package exportstore records which Google Doc a user's export of a trip lives
// in and reconciles a fresh render against it — creating the Doc the first time,
// updating it in place on re-export, and recreating it if the user deleted it.
// It keeps the export feature's "one doc per trip per user" guarantee.
package exportstore

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNoMapping is returned when no export mapping exists for a (trip, user).
var ErrNoMapping = errors.New("exportstore: no mapping")

// Mapping is a user's export record for a trip: which Drive file it maps to and
// when it was last exported.
type Mapping struct {
	TripID         string
	UserID         string
	DriveFileID    string
	FolderID       string
	DocURL         string
	LastExportedAt time.Time
}

// Store persists export mappings.
type Store struct {
	pool *pgxpool.Pool
}

// New builds a Store over the given pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// Get returns the mapping for (tripID, userID) or ErrNoMapping when absent.
func (s *Store) Get(ctx context.Context, tripID, userID string) (Mapping, error) {
	const q = `
		SELECT trip_id, user_id, drive_file_id, folder_id, doc_url, last_exported_at
		  FROM trip.trip_exports
		 WHERE trip_id = $1 AND user_id = $2`
	var m Mapping
	err := s.pool.QueryRow(ctx, q, tripID, userID).Scan(
		&m.TripID, &m.UserID, &m.DriveFileID, &m.FolderID, &m.DocURL, &m.LastExportedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Mapping{}, ErrNoMapping
	}
	if err != nil {
		return Mapping{}, fmt.Errorf("exportstore: get mapping: %w", err)
	}
	return m, nil
}

// Upsert inserts or updates the mapping, stamping last_exported_at to now.
func (s *Store) Upsert(ctx context.Context, m Mapping) error {
	const q = `
		INSERT INTO trip.trip_exports
			(trip_id, user_id, drive_file_id, folder_id, doc_url, last_exported_at)
		VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (trip_id, user_id) DO UPDATE
			SET drive_file_id    = EXCLUDED.drive_file_id,
			    folder_id        = EXCLUDED.folder_id,
			    doc_url          = EXCLUDED.doc_url,
			    last_exported_at = now()`
	if _, err := s.pool.Exec(ctx, q, m.TripID, m.UserID, m.DriveFileID, m.FolderID, m.DocURL); err != nil {
		return fmt.Errorf("exportstore: upsert mapping: %w", err)
	}
	return nil
}

// Delete removes the mapping (idempotent).
func (s *Store) Delete(ctx context.Context, tripID, userID string) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM trip.trip_exports WHERE trip_id = $1 AND user_id = $2`, tripID, userID); err != nil {
		return fmt.Errorf("exportstore: delete mapping: %w", err)
	}
	return nil
}
