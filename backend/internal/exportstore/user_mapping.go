package exportstore

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserStore persists the single combined "export all my trips" document per user
// (trip.user_exports). It deliberately mirrors *Store's method set — Get and
// Upsert with the same signatures — so it satisfies Reconcile's mappingRepo and
// the all-trips export reuses the exact create/update-in-place logic. The tripID
// argument is ignored: the combined document is keyed by user alone.
type UserStore struct {
	pool *pgxpool.Pool
}

// NewUserStore builds a UserStore over the given pool.
func NewUserStore(pool *pgxpool.Pool) *UserStore {
	return &UserStore{pool: pool}
}

// Get returns the user's combined-export mapping, or ErrNoMapping when absent.
// tripID is ignored (there is one combined document per user).
func (s *UserStore) Get(ctx context.Context, _ /*tripID*/, userID string) (Mapping, error) {
	const q = `
		SELECT user_id, drive_file_id, folder_id, doc_url, last_exported_at
		  FROM trip.user_exports
		 WHERE user_id = $1`
	var m Mapping
	err := s.pool.QueryRow(ctx, q, userID).Scan(
		&m.UserID, &m.DriveFileID, &m.FolderID, &m.DocURL, &m.LastExportedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Mapping{}, ErrNoMapping
	}
	if err != nil {
		return Mapping{}, fmt.Errorf("exportstore: get user mapping: %w", err)
	}
	return m, nil
}

// Upsert inserts or updates the user's combined-export mapping, stamping
// last_exported_at to now. Mapping.TripID is ignored.
func (s *UserStore) Upsert(ctx context.Context, m Mapping) error {
	const q = `
		INSERT INTO trip.user_exports
			(user_id, drive_file_id, folder_id, doc_url, last_exported_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id) DO UPDATE
			SET drive_file_id    = EXCLUDED.drive_file_id,
			    folder_id        = EXCLUDED.folder_id,
			    doc_url          = EXCLUDED.doc_url,
			    last_exported_at = now()`
	if _, err := s.pool.Exec(ctx, q, m.UserID, m.DriveFileID, m.FolderID, m.DocURL); err != nil {
		return fmt.Errorf("exportstore: upsert user mapping: %w", err)
	}
	return nil
}

// Delete removes the user's combined-export mapping (idempotent).
func (s *UserStore) Delete(ctx context.Context, userID string) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM trip.user_exports WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("exportstore: delete user mapping: %w", err)
	}
	return nil
}
