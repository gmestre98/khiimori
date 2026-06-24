package trip

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// errPlanItemNotFound means no plan item matched the id within the given trip.
var errPlanItemNotFound = errors.New("trip: plan item not found")

// planItemStore is the persistence surface the plan-item handlers use.
type planItemStore interface {
	ListBacklog(ctx context.Context, tripID string) ([]PlanItem, error)
	CreatePlanItem(ctx context.Context, n NewPlanItem) (PlanItem, error)
	UpdatePlanItem(ctx context.Context, tripID, itemID string, e EditPlanItem) (PlanItem, error)
	DeletePlanItem(ctx context.Context, tripID, itemID string) error
	PromotePlanItem(ctx context.Context, tripID, itemID string, p PromotePlanItemInput) (PlanItem, error)
	DemotePlanItem(ctx context.Context, tripID, itemID string) (PlanItem, error)
	// ReorderPlanItems sets sort_order = 0, 1, 2, … for the given item IDs
	// within a day, in the caller-supplied sequence. All IDs must belong to
	// tripID and dayID; any item not in the list keeps its current sort_order.
	// The scheme (explicit integer positions assigned by list index) is
	// idempotent and convergent: replaying the same list always produces the
	// same sort_order values, so offline queues converge deterministically
	// (PRD §6). Reused by move (S2) to place the moved item at the end of
	// the target day.
	ReorderPlanItems(ctx context.Context, tripID, dayID string, itemIDs []string) ([]PlanItem, error)
}

// pgxPlanItemStore is the Postgres-backed plan-item store.
type pgxPlanItemStore struct {
	pool *pgxpool.Pool
}

// planItemColumns is the trip.plan_items column list in scan order.
const planItemColumns = `
	id::text, trip_id::text, day_id::text,
	title, type, start_time::text, duration::text,
	location, booking_status, cost, link,
	sort_order, status`

// scanPlanItem scans a trip.plan_items row (in planItemColumns order) into p.
func scanPlanItem(row pgx.Row, p *PlanItem) error {
	return row.Scan(
		&p.ID, &p.TripID, &p.DayID,
		&p.Title, &p.Type, &p.StartTime, &p.Duration,
		&p.Location, &p.BookingStatus, &p.Cost, &p.Link,
		&p.SortOrder, &p.Status,
	)
}

// CreatePlanItem inserts a plan item and returns it. The default status is
// "planned" when day_id is set and "idea" when day_id is null (backlog), so
// new items get a sensible initial lifecycle state without the caller having
// to specify one. sort_order defaults to 0 (appended within the day/backlog;
// Epic 04 reorder moves it to the right position later).
//
// When n.ClientID is non-empty it is used as the row id, enabling upsert
// semantics: a replay with the same ClientID replaces the editable fields
// rather than inserting a duplicate — making creation idempotent for Epic 06.
func (s *pgxPlanItemStore) CreatePlanItem(ctx context.Context, n NewPlanItem) (PlanItem, error) {
	var q string
	var args []any

	if n.ClientID != "" {
		q = `
			INSERT INTO trip.plan_items
				(id, trip_id, day_id, title, type, start_time, duration,
				 location, booking_status, cost, link, status)
			VALUES
				($1::uuid, $2::uuid, $3::uuid,  $4, $5, $6::time, $7::interval,
				 $8, $9, $10, $11,
				 CASE WHEN $3::uuid IS NULL THEN 'idea' ELSE 'planned' END)
			ON CONFLICT (id) DO UPDATE
				SET title          = EXCLUDED.title,
				    type           = EXCLUDED.type,
				    start_time     = EXCLUDED.start_time,
				    duration       = EXCLUDED.duration,
				    location       = EXCLUDED.location,
				    booking_status = EXCLUDED.booking_status,
				    cost           = EXCLUDED.cost,
				    link           = EXCLUDED.link
			WHERE trip.plan_items.trip_id = EXCLUDED.trip_id
			RETURNING ` + planItemColumns
		args = []any{
			n.ClientID, n.TripID, n.DayID, n.Title, n.Type,
			n.StartTime, n.Duration, n.Location, n.BookingStatus, n.Cost, n.Link,
		}
	} else {
		q = `
			INSERT INTO trip.plan_items
				(trip_id, day_id, title, type, start_time, duration,
				 location, booking_status, cost, link, status)
			VALUES
				($1::uuid, $2::uuid, $3, $4, $5::time, $6::interval,
				 $7, $8, $9, $10,
				 CASE WHEN $2::uuid IS NULL THEN 'idea' ELSE 'planned' END)
			RETURNING ` + planItemColumns
		args = []any{
			n.TripID, n.DayID, n.Title, n.Type,
			n.StartTime, n.Duration, n.Location, n.BookingStatus, n.Cost, n.Link,
		}
	}

	var p PlanItem
	if err := scanPlanItem(s.pool.QueryRow(ctx, q, args...), &p); err != nil {
		return PlanItem{}, fmt.Errorf("trip: insert plan item: %w", err)
	}
	return p, nil
}

// UpdatePlanItem replaces the editable fields of one plan item scoped to a
// trip. Setting e.StartTime to nil clears start_time (untimed); setting
// e.Duration to nil clears duration. Returns errPlanItemNotFound when the item
// does not exist within the trip.
func (s *pgxPlanItemStore) UpdatePlanItem(ctx context.Context, tripID, itemID string, e EditPlanItem) (PlanItem, error) {
	const q = `
		UPDATE trip.plan_items
		SET title          = $3,
		    type           = $4,
		    start_time     = $5::time,
		    duration       = $6::interval,
		    location       = $7,
		    booking_status = $8,
		    cost           = $9,
		    link           = $10
		WHERE id = $1::uuid AND trip_id = $2::uuid
		RETURNING ` + planItemColumns
	var p PlanItem
	err := scanPlanItem(s.pool.QueryRow(ctx, q,
		itemID, tripID,
		e.Title, e.Type, e.StartTime, e.Duration,
		e.Location, e.BookingStatus, e.Cost, e.Link,
	), &p)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PlanItem{}, errPlanItemNotFound
		}
		return PlanItem{}, fmt.Errorf("trip: update plan item: %w", err)
	}
	return p, nil
}

// ListBacklog returns the backlog (day_id = null) plan items for a trip, ordered
// by sort_order ascending. Returns an empty slice (not an error) when the trip
// has no backlog items.
func (s *pgxPlanItemStore) ListBacklog(ctx context.Context, tripID string) ([]PlanItem, error) {
	const q = `
		SELECT ` + planItemColumns + `
		FROM trip.plan_items
		WHERE trip_id = $1::uuid AND day_id IS NULL
		ORDER BY sort_order`

	rows, err := s.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("trip: list backlog: %w", err)
	}
	defer rows.Close()

	var items []PlanItem
	for rows.Next() {
		var p PlanItem
		if err := scanPlanItem(rows, &p); err != nil {
			return nil, fmt.Errorf("trip: scan backlog item: %w", err)
		}
		items = append(items, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("trip: list backlog rows: %w", err)
	}
	return items, nil
}

// PromotePlanItem moves a backlog item (day_id = null) to a specific day by
// setting its day_id (and optionally start_time). The item is placed at the
// end of the target day's order. Status transitions from "idea" to "planned"
// if it was previously in the backlog; other statuses are left unchanged.
// Returns errPlanItemNotFound when the item does not exist within the trip.
func (s *pgxPlanItemStore) PromotePlanItem(ctx context.Context, tripID, itemID string, p PromotePlanItemInput) (PlanItem, error) {
	const q = `
		UPDATE trip.plan_items
		SET day_id     = $3::uuid,
		    start_time = $4::time,
		    sort_order = (
		        SELECT COALESCE(MAX(sort_order), -1) + 1
		        FROM trip.plan_items
		        WHERE trip_id = $2::uuid AND day_id = $3::uuid AND id != $1::uuid
		    ),
		    status     = CASE WHEN status = 'idea' THEN 'planned' ELSE status END
		WHERE id = $1::uuid AND trip_id = $2::uuid
		RETURNING ` + planItemColumns
	var item PlanItem
	err := scanPlanItem(s.pool.QueryRow(ctx, q, itemID, tripID, p.DayID, p.StartTime), &item)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PlanItem{}, errPlanItemNotFound
		}
		return PlanItem{}, fmt.Errorf("trip: promote plan item: %w", err)
	}
	return item, nil
}

// DemotePlanItem moves a plan item back to the backlog by clearing its day_id
// (and start_time, so the item becomes untimed). Status is set to "idea".
// Returns errPlanItemNotFound when the item does not exist within the trip.
func (s *pgxPlanItemStore) DemotePlanItem(ctx context.Context, tripID, itemID string) (PlanItem, error) {
	const q = `
		UPDATE trip.plan_items
		SET day_id     = NULL,
		    start_time = NULL,
		    duration   = NULL,
		    status     = 'idea'
		WHERE id = $1::uuid AND trip_id = $2::uuid
		RETURNING ` + planItemColumns
	var item PlanItem
	err := scanPlanItem(s.pool.QueryRow(ctx, q, itemID, tripID), &item)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PlanItem{}, errPlanItemNotFound
		}
		return PlanItem{}, fmt.Errorf("trip: demote plan item: %w", err)
	}
	return item, nil
}

// DeletePlanItem removes a plan item scoped to a trip. Replaying a delete of a
// non-existent item is a no-op (idempotent) for Epic 06 offline replay.
func (s *pgxPlanItemStore) DeletePlanItem(ctx context.Context, tripID, itemID string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM trip.plan_items WHERE id = $1::uuid AND trip_id = $2::uuid`,
		itemID, tripID)
	if err != nil {
		return fmt.Errorf("trip: delete plan item: %w", err)
	}
	return nil
}

// ReorderPlanItems assigns sort_order = 0, 1, 2, … to the items in itemIDs
// order, then returns all items for the day ordered by sort_order. Items not
// present in itemIDs are unaffected. The UPDATE uses a single unnest CTE so
// it is one round-trip and safe under concurrent writes: the last writer
// wins, which is the desired convergence behaviour for offline replay (PRD §6).
func (s *pgxPlanItemStore) ReorderPlanItems(ctx context.Context, tripID, dayID string, itemIDs []string) ([]PlanItem, error) {
	const q = `
		WITH positions(id, pos) AS (
		    SELECT id, (ord - 1)::int
		    FROM unnest($3::uuid[]) WITH ORDINALITY AS t(id, ord)
		)
		UPDATE trip.plan_items pi
		SET sort_order = p.pos
		FROM positions p
		WHERE pi.id = p.id
		  AND pi.trip_id = $1::uuid
		  AND pi.day_id  = $2::uuid`

	if _, err := s.pool.Exec(ctx, q, tripID, dayID, itemIDs); err != nil {
		return nil, fmt.Errorf("trip: reorder plan items: %w", err)
	}

	const listQ = `
		SELECT ` + planItemColumns + `
		FROM trip.plan_items
		WHERE trip_id = $1::uuid AND day_id = $2::uuid
		ORDER BY sort_order`

	rows, err := s.pool.Query(ctx, listQ, tripID, dayID)
	if err != nil {
		return nil, fmt.Errorf("trip: list day items after reorder: %w", err)
	}
	defer rows.Close()

	var items []PlanItem
	for rows.Next() {
		var p PlanItem
		if err := scanPlanItem(rows, &p); err != nil {
			return nil, fmt.Errorf("trip: scan day item: %w", err)
		}
		items = append(items, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("trip: list day items rows: %w", err)
	}
	return items, nil
}
