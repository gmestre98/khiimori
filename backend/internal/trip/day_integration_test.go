//go:build integration

// Integration tests for day generation on trip create (M03.2 S2). They run
// pgxDayRegenerator against a real migrated trip.days table, proving that:
//   - exactly one day per date is written in [start_date, end_date]
//   - indexes are 0-based and match date order
//   - generation is idempotent (re-running does not duplicate rows)
//   - a single-day trip produces exactly one day
//
// Gated behind the "integration" build tag. Run with:
//
//	DATABASE_URL_TEST=<dsn> go test -tags=integration ./internal/trip/...
package trip

import (
	"context"
	"testing"
)

// TestCreateGeneratesDaysMultiDay asserts that creating a multi-day trip writes
// exactly one trip.days row per calendar date in [start, end], with correct 0-based
// indexes and real calendar dates.
func TestCreateGeneratesDaysMultiDay(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	nt := newTestTrip(t) // 2026-07-01 → 2026-07-10 (10 days)
	ctx := context.Background()

	got, err := store.Create(ctx, nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	type dayRow struct {
		date  string
		index int
	}
	rows, err := testPool.Query(ctx,
		`SELECT date::text, index FROM trip.days WHERE trip_id = $1::uuid ORDER BY index`, got.ID)
	if err != nil {
		t.Fatalf("querying days: %v", err)
	}
	defer rows.Close()

	var days []dayRow
	for rows.Next() {
		var r dayRow
		if err := rows.Scan(&r.date, &r.index); err != nil {
			t.Fatalf("scanning day: %v", err)
		}
		days = append(days, r)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating day rows: %v", err)
	}

	if len(days) != 10 {
		t.Fatalf("day count = %d, want 10", len(days))
	}
	if days[0].date != "2026-07-01" {
		t.Errorf("first day date = %s, want 2026-07-01", days[0].date)
	}
	if days[9].date != "2026-07-10" {
		t.Errorf("last day date = %s, want 2026-07-10", days[9].date)
	}
	for i, d := range days {
		if d.index != i {
			t.Errorf("day[%d].index = %d, want %d", i, d.index, i)
		}
	}
}

// TestCreateGeneratesDaysSingleDay asserts that a single-day trip produces
// exactly one day row.
func TestCreateGeneratesDaysSingleDay(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	nt := newTestTrip(t)
	nt.StartDate = mustDate(t, "2026-08-01")
	nt.EndDate = mustDate(t, "2026-08-01")
	ctx := context.Background()

	got, err := store.Create(ctx, nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	var count int
	var date string
	var idx int
	if err := testPool.QueryRow(ctx,
		`SELECT count(*), min(date::text), min(index) FROM trip.days WHERE trip_id = $1::uuid`,
		got.ID).Scan(&count, &date, &idx); err != nil {
		t.Fatalf("querying days: %v", err)
	}
	if count != 1 {
		t.Fatalf("day count = %d, want 1", count)
	}
	if date != "2026-08-01" {
		t.Errorf("day date = %s, want 2026-08-01", date)
	}
	if idx != 0 {
		t.Errorf("day index = %d, want 0", idx)
	}
}

// TestCreateDayGenerationIdempotent asserts that calling RegenerateDays twice
// for the same trip + range does not duplicate rows (ON CONFLICT DO NOTHING).
func TestCreateDayGenerationIdempotent(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	nt := newTestTrip(t)
	got, err := store.Create(ctx, nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Call RegenerateDays a second time in a fresh transaction to prove idempotency.
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	gen := pgxDayRegenerator{}
	if err := gen.RegenerateDays(ctx, tx, got.ID, got.StartDate, got.EndDate); err != nil {
		t.Fatalf("second RegenerateDays: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	var count int
	if err := testPool.QueryRow(ctx,
		`SELECT count(*) FROM trip.days WHERE trip_id = $1::uuid`, got.ID).Scan(&count); err != nil {
		t.Fatalf("querying days: %v", err)
	}
	if count != 10 {
		t.Fatalf("day count after second generate = %d, want 10 (no duplicates)", count)
	}
}
