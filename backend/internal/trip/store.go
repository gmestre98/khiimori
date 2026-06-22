package trip

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

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

// dayRegenerator regenerates a trip's days when its date range is established or
// changes (PRD §5.1). Epic 02 implements the real generator; Epic 01 wires the
// no-op default so the create/edit transactions already call the seam at the
// right point (inside the trip's transaction, so days commit atomically with the
// trip). Keeping it an interface lets Epic 02 drop in its generator without
// touching the create/edit flow.
type dayRegenerator interface {
	RegenerateDays(ctx context.Context, tx pgx.Tx, tripID string, start, end time.Time) error
}

// noopDayRegenerator is the Epic 01 default: day generation is Epic 02's, so the
// seam is present but does nothing yet.
type noopDayRegenerator struct{}

func (noopDayRegenerator) RegenerateDays(context.Context, pgx.Tx, string, time.Time, time.Time) error {
	return nil
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

	if err := s.days.RegenerateDays(ctx, tx, t.ID, t.StartDate, t.EndDate); err != nil {
		return Trip{}, fmt.Errorf("trip: generate days: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Trip{}, fmt.Errorf("trip: commit: %w", err)
	}
	return t, nil
}
