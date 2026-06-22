package trip

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// pgxDayRegenerator implements dayRegenerator: it inserts exactly one trip.days
// row per calendar date in [start, end], idempotently.
type pgxDayRegenerator struct{}

// RegenerateDays inserts one day row per calendar date in [start, end] within
// the supplied transaction. ON CONFLICT DO NOTHING makes repeated calls safe
// (idempotency key: the (trip_id, date) UNIQUE constraint on trip.days). The
// 0-based index mirrors date order within the trip.
//
// All inserts are pipelined in a single pgx Batch so the round-trip cost is
// O(1) regardless of trip length.
func (pgxDayRegenerator) RegenerateDays(ctx context.Context, tx pgx.Tx, tripID string, start, end time.Time) error {
	dates := datesInRange(start, end)
	if len(dates) == 0 {
		return nil
	}

	const q = `
		INSERT INTO trip.days (trip_id, date, index)
		VALUES ($1::uuid, $2::date, $3)
		ON CONFLICT (trip_id, date) DO NOTHING`

	batch := &pgx.Batch{}
	for i, d := range dates {
		batch.Queue(q, tripID, d, i)
	}

	results := tx.SendBatch(ctx, batch)
	defer results.Close()

	for _, d := range dates {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("trip: insert day %s: %w", d.Format("2006-01-02"), err)
		}
	}
	return results.Close()
}

// datesInRange returns one time.Time per calendar date in [start, end], in
// ascending order. It is a pure function over the range so S3 can reuse it for
// regeneration without touching the DB. Both start and end are inclusive.
func datesInRange(start, end time.Time) []time.Time {
	// Normalise to midnight UTC so date arithmetic is day-exact.
	s := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	e := time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC)

	var dates []time.Time
	for d := s; !d.After(e); d = d.AddDate(0, 0, 1) {
		dates = append(dates, d)
	}
	return dates
}
