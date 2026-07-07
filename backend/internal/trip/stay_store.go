package trip

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// errStayNotFound means no stay matched the id within the given trip.
var errStayNotFound = errors.New("trip: stay not found")

// errStayOverlap means the stay's [check_in, check_out) range shares a night with
// another stay in the same trip — you sleep in one place per night (M12.1 S3).
var errStayOverlap = errors.New("trip: stay overlaps an existing stay")

// nilUUID is an all-zero UUID used as the "nothing to exclude" sentinel when
// checking overlaps for a brand-new stay that has no id yet — no real stay row
// carries it, so `id <> nilUUID` is true for every existing stay.
const nilUUID = "00000000-0000-0000-0000-000000000000"

// stayStore is the persistence surface the stay handlers use. The concrete
// pgxStayStore implements it; unit tests supply a fake.
type stayStore interface {
	CreateStay(ctx context.Context, ns NewStay) (Stay, error)
	UpdateStay(ctx context.Context, tripID, stayID string, e EditStay) (Stay, error)
	DeleteStay(ctx context.Context, tripID, stayID string) error
	// StaysForDay returns every stay in tripID whose [check_in, check_out) range
	// covers date (half-open: check_in <= date < check_out). A stay with no
	// check_in or no check_out is excluded — it has no defined coverage interval.
	StaysForDay(ctx context.Context, tripID, date string) ([]Stay, error)
}

// pgxStayStore is the Postgres-backed stay store.
type pgxStayStore struct {
	pool *pgxpool.Pool
}

// stayColumns is the trip.stays column list in scan order.
const stayColumns = `id::text, trip_id::text, name, location, check_in, check_out, cost, link`

// scanStay scans a trip.stays row (in stayColumns order) into s.
func scanStay(row pgx.Row, s *Stay) error {
	return row.Scan(
		&s.ID, &s.TripID, &s.Name, &s.Location, &s.CheckIn, &s.CheckOut, &s.Cost, &s.Link,
	)
}

// stayOverlaps reports whether a stay with the given half-open [checkIn, checkOut)
// range would share any night with another stay in the trip. Two half-open
// ranges overlap iff each starts before the other ends; adjacent stays
// (check_out == the next check_in) therefore do NOT overlap — you can change
// hotels on the same day. excludeID is the id of the stay being written so an
// edit/upsert never conflicts with itself (pass nilUUID for a brand-new stay).
// A stay missing either date has no coverage interval and never conflicts.
//
// This is enforced in the application layer rather than a DB EXCLUDE constraint:
// stays created before this rule may already overlap, and an EXCLUDE constraint
// (which can't be added NOT VALID) would fail to apply against that existing
// data. Write-time enforcement keeps new/edited stays clean without a risky
// data-validating migration.
func (s *pgxStayStore) stayOverlaps(ctx context.Context, tripID string, checkIn, checkOut *time.Time, excludeID string) (bool, error) {
	if checkIn == nil || checkOut == nil {
		return false, nil
	}
	const q = `
		SELECT EXISTS (
			SELECT 1 FROM trip.stays
			WHERE trip_id   = $1::uuid
			  AND id       <> $2::uuid
			  AND check_in  IS NOT NULL
			  AND check_out IS NOT NULL
			  AND check_in  < $4::date
			  AND $3::date  < check_out
		)`
	var exists bool
	if err := s.pool.QueryRow(ctx, q, tripID, excludeID, checkIn, checkOut).Scan(&exists); err != nil {
		return false, fmt.Errorf("trip: check stay overlap: %w", err)
	}
	return exists, nil
}

// CreateStay inserts a stay and returns it. When ns.ClientID is non-empty it is
// used as the row id, enabling upsert semantics: a replay with the same
// ClientID replaces the row's editable fields rather than inserting a duplicate.
// This makes the create mutation idempotent for Epic 06's offline replay layer.
func (s *pgxStayStore) CreateStay(ctx context.Context, ns NewStay) (Stay, error) {
	// One accommodation per night: reject a stay whose nights are already
	// covered. An upsert replay (same ClientID) must not conflict with itself,
	// so exclude that id; a brand-new stay excludes nothing (nilUUID).
	excludeID := ns.ClientID
	if excludeID == "" {
		excludeID = nilUUID
	}
	if over, err := s.stayOverlaps(ctx, ns.TripID, ns.CheckIn, ns.CheckOut, excludeID); err != nil {
		return Stay{}, err
	} else if over {
		return Stay{}, errStayOverlap
	}

	var q string
	var args []any

	if ns.ClientID != "" {
		q = `
			INSERT INTO trip.stays (id, trip_id, name, location, check_in, check_out, cost, link)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5::date, $6::date, $7, $8)
			ON CONFLICT (id) DO UPDATE
				SET name = EXCLUDED.name,
				    location = EXCLUDED.location,
				    check_in = EXCLUDED.check_in,
				    check_out = EXCLUDED.check_out,
				    cost = EXCLUDED.cost,
				    link = EXCLUDED.link
			WHERE trip.stays.trip_id = EXCLUDED.trip_id
			RETURNING ` + stayColumns
		args = []any{ns.ClientID, ns.TripID, ns.Name, ns.Location, ns.CheckIn, ns.CheckOut, ns.Cost, ns.Link}
	} else {
		q = `
			INSERT INTO trip.stays (trip_id, name, location, check_in, check_out, cost, link)
			VALUES ($1::uuid, $2, $3, $4::date, $5::date, $6, $7)
			RETURNING ` + stayColumns
		args = []any{ns.TripID, ns.Name, ns.Location, ns.CheckIn, ns.CheckOut, ns.Cost, ns.Link}
	}

	var st Stay
	if err := scanStay(s.pool.QueryRow(ctx, q, args...), &st); err != nil {
		return Stay{}, fmt.Errorf("trip: insert stay: %w", err)
	}
	return st, nil
}

// UpdateStay edits the editable fields of one stay scoped to a trip. Returns
// errStayNotFound when the id does not exist within the trip.
func (s *pgxStayStore) UpdateStay(ctx context.Context, tripID, stayID string, e EditStay) (Stay, error) {
	// One accommodation per night — reject an edit that moves this stay onto
	// nights another stay already covers (excluding itself).
	if over, err := s.stayOverlaps(ctx, tripID, e.CheckIn, e.CheckOut, stayID); err != nil {
		return Stay{}, err
	} else if over {
		return Stay{}, errStayOverlap
	}

	const q = `
		UPDATE trip.stays
		SET name = $3, location = $4, check_in = $5::date, check_out = $6::date,
		    cost = $7, link = $8
		WHERE id = $1::uuid AND trip_id = $2::uuid
		RETURNING ` + stayColumns
	var st Stay
	err := scanStay(s.pool.QueryRow(ctx, q,
		stayID, tripID, e.Name, e.Location, e.CheckIn, e.CheckOut, e.Cost, e.Link), &st)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Stay{}, errStayNotFound
		}
		return Stay{}, fmt.Errorf("trip: update stay: %w", err)
	}
	return st, nil
}

// StaysForDay returns all stays in tripID whose [check_in, check_out) half-open
// range covers date. Stays without both dates set are excluded — they have no
// defined coverage interval.
func (s *pgxStayStore) StaysForDay(ctx context.Context, tripID, date string) ([]Stay, error) {
	const q = `
		SELECT ` + stayColumns + `
		FROM trip.stays
		WHERE trip_id = $1::uuid
		  AND check_in  IS NOT NULL
		  AND check_out IS NOT NULL
		  AND check_in  <= $2::date
		  AND check_out >  $2::date
		ORDER BY check_in, id`

	rows, err := s.pool.Query(ctx, q, tripID, date)
	if err != nil {
		return nil, fmt.Errorf("trip: query stays for day: %w", err)
	}
	defer rows.Close()

	var stays []Stay
	for rows.Next() {
		var st Stay
		if err := scanStay(rows, &st); err != nil {
			return nil, fmt.Errorf("trip: scan stay for day: %w", err)
		}
		stays = append(stays, st)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("trip: iterate stays for day: %w", err)
	}
	return stays, nil
}

// DeleteStay removes a stay scoped to a trip. Replaying a delete of a
// non-existent stay is a no-op (idempotent), which Epic 06 relies on.
func (s *pgxStayStore) DeleteStay(ctx context.Context, tripID, stayID string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM trip.stays WHERE id = $1::uuid AND trip_id = $2::uuid`,
		stayID, tripID)
	if err != nil {
		return fmt.Errorf("trip: delete stay: %w", err)
	}
	return nil
}
