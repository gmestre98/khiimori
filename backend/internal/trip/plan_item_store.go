package trip

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// planItemStore is the persistence surface the plan-item handlers use.
type planItemStore interface {
	CreatePlanItem(ctx context.Context, n NewPlanItem) (PlanItem, error)
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
