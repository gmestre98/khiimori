package trip

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// errTripNotFound means no trip matched the id for the requesting owner — either
// it does not exist or it belongs to another user. The two are deliberately
// indistinguishable to the caller (owner-scoped access) so a 404 never leaks the
// existence of someone else's trip.
var errTripNotFound = errors.New("trip: not found")

// OwnerMemberships is the slice of the sharing module's membership writer the
// trip store needs. The trip module declares it (consumer-side interface) and
// the composition root hands it the concrete *sharing.Memberships, so the trip
// module never imports the sharing module — the modular-monolith boundary. Each
// method runs inside the trip store's transaction so the membership write is
// atomic with the trip write.
type OwnerMemberships interface {
	// CreateOwner inserts the Owner membership for tripID's creator within tx.
	CreateOwner(ctx context.Context, tx pgx.Tx, tripID, userID string) error
}

// dayRegenerator reconciles trip.days with a trip's date range. Epic 02 S2
// implemented the insert-only path; S3 extends it with deletion and the shrink
// guard. force bypasses the guard when the caller has obtained explicit user
// confirmation (force_shrink on the edit request).
type dayRegenerator interface {
	RegenerateDays(ctx context.Context, tx pgx.Tx, tripID string, start, end time.Time, force bool) error
}

// tripColumns is the trip.trips column list returned by every read/write, in
// scan order. Centralised so the SQL and scanTrip can't drift apart.
const tripColumns = `id::text, owner_id::text, name, destinations, start_date, end_date, ` +
	`base_currency, cover, status, created_at, updated_at`

// scanTrip scans a trip.trips row (in tripColumns order) into t.
func scanTrip(row pgx.Row, t *Trip) error {
	return row.Scan(
		&t.ID, &t.OwnerID, &t.Name, &t.Destinations, &t.StartDate, &t.EndDate,
		&t.BaseCurrency, &t.Cover, &t.Status, &t.CreatedAt, &t.UpdatedAt,
	)
}

// pgxTripStore is the Postgres-backed trip store. It owns trip.trips and drives
// the sharing membership writer and the day generator through their interfaces,
// always within one transaction so a create/edit/delete is atomic across the
// trip, its owner membership, and its days.
type pgxTripStore struct {
	pool        *pgxpool.Pool
	memberships OwnerMemberships
	days        dayRegenerator
}

// Create persists a new trip and its Owner membership in one transaction: it
// inserts the trip (base_currency=EUR and status=active from the column
// defaults), writes the creator's Owner row via the sharing membership writer,
// and invokes the day-generation seam (no-op until Epic 02) — all within the same
// tx, so any failure rolls back the whole thing and a trip never exists without
// its owner membership.
func (s *pgxTripStore) Create(ctx context.Context, nt NewTrip) (Trip, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Trip{}, fmt.Errorf("trip: begin tx: %w", err)
	}
	// Rollback is a no-op once Commit has succeeded, so this safely unwinds the
	// transaction on every early return.
	defer func() { _ = tx.Rollback(ctx) }()

	const query = `
		INSERT INTO trip.trips (owner_id, name, destinations, start_date, end_date, cover)
		VALUES ($1::uuid, $2, $3, $4, $5, $6)
		RETURNING ` + tripColumns

	var t Trip
	if err := scanTrip(tx.QueryRow(ctx, query,
		nt.OwnerID, nt.Name, nt.Destinations, nt.StartDate, nt.EndDate, nt.Cover), &t); err != nil {
		return Trip{}, fmt.Errorf("trip: insert: %w", err)
	}

	if err := s.memberships.CreateOwner(ctx, tx, t.ID, t.OwnerID); err != nil {
		return Trip{}, fmt.Errorf("trip: create owner membership: %w", err)
	}

	if err := s.days.RegenerateDays(ctx, tx, t.ID, t.StartDate, t.EndDate, false); err != nil {
		return Trip{}, fmt.Errorf("trip: generate days: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Trip{}, fmt.Errorf("trip: commit: %w", err)
	}
	return t, nil
}

// Update applies an edit to the owner's trip and returns the updated row, all in
// one transaction. It is owner-scoped: the WHERE clause pins both id and
// owner_id, so editing a trip that does not exist or belongs to another user
// yields errTripNotFound (an indistinguishable 404). base_currency and owner_id
// are never in the SET list, so EUR and ownership are immutable here (S3).
//
// When the edit changes the date range, the day-generation seam is invoked
// inside the same transaction so Epic 02 can regenerate days atomically with the
// edit. The current row is locked (FOR UPDATE) and its dates compared to the new
// ones, so days are regenerated only on a real range change — not on every edit —
// and a concurrent edit can't race the regeneration.
func (s *pgxTripStore) Update(ctx context.Context, id, ownerID string, e EditTrip) (Trip, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Trip{}, fmt.Errorf("trip: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Lock and load the current row (owner-scoped) so the date-range comparison
	// below is race-free and a missing/other-owner trip is a clean 404.
	const selectForUpdate = `SELECT ` + tripColumns +
		` FROM trip.trips WHERE id = $1::uuid AND owner_id = $2::uuid FOR UPDATE`
	var current Trip
	if err := scanTrip(tx.QueryRow(ctx, selectForUpdate, id, ownerID), &current); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Trip{}, errTripNotFound
		}
		return Trip{}, fmt.Errorf("trip: load for update: %w", err)
	}

	const update = `
		UPDATE trip.trips
		SET name = $3, destinations = $4, start_date = $5, end_date = $6, cover = $7,
		    updated_at = now()
		WHERE id = $1::uuid AND owner_id = $2::uuid
		RETURNING ` + tripColumns
	var updated Trip
	if err := scanTrip(tx.QueryRow(ctx, update,
		id, ownerID, e.Name, e.Destinations, e.StartDate, e.EndDate, e.Cover), &updated); err != nil {
		return Trip{}, fmt.Errorf("trip: update: %w", err)
	}

	// Surface a date-range change so Epic 02 regenerates the trip's days. The seam
	// is a no-op in Epic 01; running it only when the range actually changed keeps
	// the contract precise and avoids needless work.
	if !updated.StartDate.Equal(current.StartDate) || !updated.EndDate.Equal(current.EndDate) {
		if err := s.days.RegenerateDays(ctx, tx, id, updated.StartDate, updated.EndDate, e.ForceRemoveDays); err != nil {
			return Trip{}, fmt.Errorf("trip: regenerate days: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Trip{}, fmt.Errorf("trip: commit: %w", err)
	}
	return updated, nil
}

// setStatus sets a trip's status to the given value (owner-scoped, atomic).
// It is the shared primitive behind Archive and Unarchive.
func (s *pgxTripStore) setStatus(ctx context.Context, id, ownerID, status string) (Trip, error) {
	const q = `
		UPDATE trip.trips
		SET status = $3, updated_at = now()
		WHERE id = $1::uuid AND owner_id = $2::uuid
		RETURNING ` + tripColumns
	var t Trip
	if err := scanTrip(s.pool.QueryRow(ctx, q, id, ownerID, status), &t); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Trip{}, errTripNotFound
		}
		return Trip{}, fmt.Errorf("trip: set status: %w", err)
	}
	return t, nil
}

// Archive sets a trip's status to "archived" (owner-scoped). The trip is
// retained in storage but excluded from active listings (Epic 03). Reversible
// via Unarchive.
func (s *pgxTripStore) Archive(ctx context.Context, id, ownerID string) (Trip, error) {
	return s.setStatus(ctx, id, ownerID, "archived")
}

// Unarchive reverses an archive, setting the trip's status back to "active".
func (s *pgxTripStore) Unarchive(ctx context.Context, id, ownerID string) (Trip, error) {
	return s.setStatus(ctx, id, ownerID, "active")
}

// Delete removes a trip and cascades its sharing memberships transactionally.
// Both the trip row and all sharing.trip_memberships rows for the trip are
// deleted within one transaction; a failure rolls back so no orphan rows are
// left (PRD §7.7). There is no DB-level cascade across schemas (migrations
// README), so the cascade is explicit here. Only the owner may delete (the
// WHERE clause pins owner_id).
func (s *pgxTripStore) Delete(ctx context.Context, id, ownerID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("trip: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Delete memberships first (foreign-key order: dependents before parent).
	if _, err := tx.Exec(ctx,
		`DELETE FROM sharing.trip_memberships WHERE trip_id = $1::uuid`, id); err != nil {
		return fmt.Errorf("trip: delete memberships: %w", err)
	}

	// Delete the trip, owner-scoped so a missing/other-owner trip yields
	// errTripNotFound (same indistinguishable 404 as other owner-scoped ops).
	tag, err := tx.Exec(ctx,
		`DELETE FROM trip.trips WHERE id = $1::uuid AND owner_id = $2::uuid`, id, ownerID)
	if err != nil {
		return fmt.Errorf("trip: delete trip: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errTripNotFound
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("trip: commit: %w", err)
	}
	return nil
}
