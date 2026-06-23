package trip

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// errStayNotFound means no stay matched the id within the given trip.
var errStayNotFound = errors.New("trip: stay not found")

// stayStore is the persistence surface the stay handlers use. The concrete
// pgxStayStore implements it; unit tests supply a fake.
type stayStore interface {
	CreateStay(ctx context.Context, ns NewStay) (Stay, error)
	UpdateStay(ctx context.Context, tripID, stayID string, e EditStay) (Stay, error)
	DeleteStay(ctx context.Context, tripID, stayID string) error
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

// CreateStay inserts a stay and returns it. When ns.ClientID is non-empty it is
// used as the row id, enabling upsert semantics: a replay with the same
// ClientID replaces the row's editable fields rather than inserting a duplicate.
// This makes the create mutation idempotent for Epic 06's offline replay layer.
func (s *pgxStayStore) CreateStay(ctx context.Context, ns NewStay) (Stay, error) {
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
