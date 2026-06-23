package trip

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// DayDataGuard is the seam that later milestones use to prevent silently
// destroying data when a trip's date range shrinks. Milestone 04 (planning) and
// Milestone 06 (journal) each register checks through this interface; v1 ships
// with noDayData, which is a no-op because no data tables exist yet.
//
// The interface is declared in the trip module (consumer-side) so Milestones
// 04/06 can satisfy it without the trip module importing them — consistent with
// the modular-monolith boundary enforced by internal/boundaries.
type DayDataGuard interface {
	// AnyDayHasData returns true when at least one of the given day UUIDs
	// has attached data in the database (plan items, journal entries, etc.)
	// within the supplied transaction.
	AnyDayHasData(ctx context.Context, tx pgx.Tx, dayIDs []string) (bool, error)
}

// noDayData is the default v1 DayDataGuard: no plan-items or journal tables
// exist yet, so no removed day can hold data.
type noDayData struct{}

func (noDayData) AnyDayHasData(_ context.Context, _ pgx.Tx, _ []string) (bool, error) {
	return false, nil
}

// ErrDaysHaveData is returned when shrinking a trip's date range would destroy
// days that hold attached data and the caller has not set ForceRemoveDays. The
// client should surface a confirmation dialog and re-send the edit with
// force_shrink: true once the user accepts.
type ErrDaysHaveData struct {
	// Count is the number of days that would be destroyed.
	Count int
}

func (e *ErrDaysHaveData) Error() string {
	return fmt.Sprintf("trip: %d day(s) hold data; set force_shrink to confirm", e.Count)
}

// pgxDayRegenerator reconciles trip.days with a trip's date range. On every
// call it adds days for dates newly inside [start, end] and removes days for
// dates now outside it, with a guard that blocks silent data loss on shrink.
// Reindexing after each reconciliation keeps indexes a clean 0-based sequence.
type pgxDayRegenerator struct {
	guard DayDataGuard
}

// RegenerateDays reconciles the trip.days rows for tripID with the range
// [start, end] inside the supplied transaction. Behaviour:
//
//   - Dates in [start, end] not yet in the DB → inserted (ON CONFLICT DO
//     NOTHING keeps the call idempotent).
//   - Dates outside [start, end] that exist in the DB → deleted, unless any
//     of them hold attached data and force is false, in which case
//     *ErrDaysHaveData is returned and the transaction is left clean for the
//     caller to roll back.
//   - All remaining days are reindexed (0-based, ascending by date) so the
//     index column stays consistent regardless of which end was extended or
//     shrunk.
//
// All reads and writes run inside tx so the entire reconciliation is atomic
// with the surrounding trip update.
func (r pgxDayRegenerator) RegenerateDays(ctx context.Context, tx pgx.Tx, tripID string, start, end time.Time, force bool) error {
	// Load existing days, locked for update so a concurrent reconciliation
	// on the same trip cannot race this one.
	rows, err := tx.Query(ctx,
		`SELECT id::text, date FROM trip.days WHERE trip_id = $1::uuid ORDER BY date FOR UPDATE`,
		tripID)
	if err != nil {
		return fmt.Errorf("trip: load days: %w", err)
	}

	type existingDay struct {
		id   string
		date time.Time
	}
	var existing []existingDay
	for rows.Next() {
		var d existingDay
		if err := rows.Scan(&d.id, &d.date); err != nil {
			rows.Close()
			return fmt.Errorf("trip: scan day: %w", err)
		}
		existing = append(existing, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("trip: iterate days: %w", err)
	}

	// Build the desired date set from the new range.
	desired := datesInRange(start, end)
	desiredSet := make(map[string]struct{}, len(desired))
	for _, d := range desired {
		desiredSet[d.Format("2006-01-02")] = struct{}{}
	}

	// Partition existing days into those to keep and those to remove.
	existingSet := make(map[string]struct{}, len(existing))
	var toRemoveIDs []string
	for _, d := range existing {
		key := d.date.Format("2006-01-02")
		existingSet[key] = struct{}{}
		if _, keep := desiredSet[key]; !keep {
			toRemoveIDs = append(toRemoveIDs, d.id)
		}
	}

	// Guard: block shrink when removed days hold data and force is not set.
	if len(toRemoveIDs) > 0 && !force {
		hasData, err := r.guard.AnyDayHasData(ctx, tx, toRemoveIDs)
		if err != nil {
			return fmt.Errorf("trip: check day data: %w", err)
		}
		if hasData {
			return &ErrDaysHaveData{Count: len(toRemoveIDs)}
		}
	}

	// Delete out-of-range days (safe: guard above cleared or force=true).
	if len(toRemoveIDs) > 0 {
		if _, err := tx.Exec(ctx,
			`DELETE FROM trip.days WHERE id = ANY($1::uuid[])`, toRemoveIDs); err != nil {
			return fmt.Errorf("trip: delete days: %w", err)
		}
	}

	// Insert days for dates newly inside the range.
	var toAdd []time.Time
	for _, d := range desired {
		if _, ok := existingSet[d.Format("2006-01-02")]; !ok {
			toAdd = append(toAdd, d)
		}
	}
	if len(toAdd) > 0 {
		const q = `
			INSERT INTO trip.days (trip_id, date, index)
			VALUES ($1::uuid, $2::date, 0)
			ON CONFLICT (trip_id, date) DO NOTHING`

		batch := &pgx.Batch{}
		for _, d := range toAdd {
			batch.Queue(q, tripID, d)
		}
		results := tx.SendBatch(ctx, batch)
		for _, d := range toAdd {
			if _, err := results.Exec(); err != nil {
				_ = results.Close()
				return fmt.Errorf("trip: insert day %s: %w", d.Format("2006-01-02"), err)
			}
		}
		if err := results.Close(); err != nil {
			return fmt.Errorf("trip: insert days batch close: %w", err)
		}
	}

	// Reindex only when the set of days actually changed — skips a no-op UPDATE
	// on idempotent calls with the same range.
	if len(toAdd) == 0 && len(toRemoveIDs) == 0 {
		return nil
	}

	// Reindex all remaining days for this trip in ascending date order (0-based)
	// so the index column stays a clean sequence regardless of which end changed.
	if _, err := tx.Exec(ctx, `
		UPDATE trip.days AS d
		SET index = sub.rn
		FROM (
			SELECT id,
			       (ROW_NUMBER() OVER (ORDER BY date) - 1) AS rn
			FROM trip.days
			WHERE trip_id = $1::uuid
		) sub
		WHERE d.id = sub.id`, tripID); err != nil {
		return fmt.Errorf("trip: reindex days: %w", err)
	}

	return nil
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
