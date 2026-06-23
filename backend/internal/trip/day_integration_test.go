//go:build integration

// Integration tests for day generation (M03.2 S2) and day reconciliation on
// range edits (M03.2 S3). They run pgxDayRegenerator against a real migrated
// trip.days table, proving that:
//   - exactly one day per date is written in [start_date, end_date] on create
//   - indexes are 0-based and match date order
//   - generation is idempotent (re-running does not duplicate rows)
//   - a single-day trip produces exactly one day
//   - extending the range adds new days without touching existing ones
//   - shrinking the range removes out-of-range days and reindexes
//   - shrinking when removed days hold data returns ErrDaysHaveData (S3 guard)
//   - shrink with force=true bypasses the guard
//
// Gated behind the "integration" build tag. Run with:
//
//	DATABASE_URL_TEST=<dsn> go test -tags=integration ./internal/trip/...
package trip

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

// alwaysHasData is a DayDataGuard stub that reports every day as having data,
// used to verify the shrink guard without needing real plan-item rows.
type alwaysHasData struct{}

func (alwaysHasData) AnyDayHasData(_ context.Context, _ pgx.Tx, _ []string) (bool, error) {
	return true, nil
}

// queryDayRows returns the day rows for a trip, ordered by index.
func queryDayRows(t *testing.T, tripID string) []struct {
	date  string
	index int
} {
	t.Helper()
	rows, err := testPool.Query(context.Background(),
		`SELECT date::text, index FROM trip.days WHERE trip_id = $1::uuid ORDER BY index`, tripID)
	if err != nil {
		t.Fatalf("querying days: %v", err)
	}
	defer rows.Close()
	var out []struct {
		date  string
		index int
	}
	for rows.Next() {
		var r struct {
			date  string
			index int
		}
		if err := rows.Scan(&r.date, &r.index); err != nil {
			t.Fatalf("scanning day: %v", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating day rows: %v", err)
	}
	return out
}

// TestCreateGeneratesDaysMultiDay asserts that creating a multi-day trip writes
// exactly one trip.days row per calendar date in [start, end], with correct 0-based
// indexes and real calendar dates.
func TestCreateGeneratesDaysMultiDay(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	nt := newTestTrip(t) // 2026-07-01 → 2026-07-10 (10 days)
	ctx := context.Background()

	got, err := store.Create(ctx, nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	days := queryDayRows(t, got.ID)

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
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
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
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	nt := newTestTrip(t)
	ctx := context.Background()
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

	gen := pgxDayRegenerator{guard: noDayData{}}
	if err := gen.RegenerateDays(ctx, tx, got.ID, got.StartDate, got.EndDate, false); err != nil {
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

// TestUpdateExtendRangeAddsDays asserts that extending a trip's date range
// (both start and end) adds exactly the new days and leaves the existing days
// (and their indexes) correct.
func TestUpdateExtendRangeAddsDays(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	// Create: 2026-07-05 → 2026-07-10 (6 days, indexes 0–5)
	nt := newTestTrip(t)
	nt.StartDate = mustDate(t, "2026-07-05")
	nt.EndDate = mustDate(t, "2026-07-10")
	created, err := store.Create(context.Background(), nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Extend both ends: 2026-07-01 → 2026-07-15 (15 days, indexes 0–14)
	edit := EditTrip{
		Name:         created.Name,
		Destinations: created.Destinations,
		StartDate:    mustDate(t, "2026-07-01"),
		EndDate:      mustDate(t, "2026-07-15"),
		Cover:        created.Cover,
	}
	if _, err := store.Update(context.Background(), created.ID, created.OwnerID, edit); err != nil {
		t.Fatalf("Update: %v", err)
	}

	days := queryDayRows(t, created.ID)
	if len(days) != 15 {
		t.Fatalf("day count = %d, want 15", len(days))
	}
	if days[0].date != "2026-07-01" {
		t.Errorf("first date = %s, want 2026-07-01", days[0].date)
	}
	if days[14].date != "2026-07-15" {
		t.Errorf("last date = %s, want 2026-07-15", days[14].date)
	}
	// Indexes must be a clean 0-based sequence.
	for i, d := range days {
		if d.index != i {
			t.Errorf("day[%d].index = %d, want %d", i, d.index, i)
		}
	}
}

// TestUpdateShrinkRangeRemovesDays asserts that shrinking a trip's date range
// removes exactly the out-of-range days and reindexes the remaining ones.
func TestUpdateShrinkRangeRemovesDays(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	// Create: 2026-07-01 → 2026-07-10 (10 days)
	nt := newTestTrip(t) // uses 2026-07-01 → 2026-07-10
	created, err := store.Create(context.Background(), nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Shrink: 2026-07-03 → 2026-07-08 (6 days)
	edit := EditTrip{
		Name:         created.Name,
		Destinations: created.Destinations,
		StartDate:    mustDate(t, "2026-07-03"),
		EndDate:      mustDate(t, "2026-07-08"),
		Cover:        created.Cover,
	}
	if _, err := store.Update(context.Background(), created.ID, created.OwnerID, edit); err != nil {
		t.Fatalf("Update: %v", err)
	}

	days := queryDayRows(t, created.ID)
	if len(days) != 6 {
		t.Fatalf("day count = %d, want 6", len(days))
	}
	if days[0].date != "2026-07-03" {
		t.Errorf("first date = %s, want 2026-07-03", days[0].date)
	}
	if days[5].date != "2026-07-08" {
		t.Errorf("last date = %s, want 2026-07-08", days[5].date)
	}
	for i, d := range days {
		if d.index != i {
			t.Errorf("day[%d].index = %d, want %d", i, d.index, i)
		}
	}
}

// TestUpdateShrinkWithDataIsGuarded asserts that shrinking removes are blocked
// when the data-guard reports attached data, returning ErrDaysHaveData with the
// correct count.
func TestUpdateShrinkWithDataIsGuarded(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: alwaysHasData{}})
	nt := newTestTrip(t) // 2026-07-01 → 2026-07-10 (10 days)
	created, err := store.Create(context.Background(), nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Shrink: 2026-07-05 → 2026-07-10 removes 4 days (01–04)
	edit := EditTrip{
		Name:         created.Name,
		Destinations: created.Destinations,
		StartDate:    mustDate(t, "2026-07-05"),
		EndDate:      mustDate(t, "2026-07-10"),
		Cover:        created.Cover,
	}
	_, err = store.Update(context.Background(), created.ID, created.OwnerID, edit)
	var daysErr *ErrDaysHaveData
	if !errors.As(err, &daysErr) {
		t.Fatalf("Update error = %v, want *ErrDaysHaveData", err)
	}
	if daysErr.Count != 4 {
		t.Errorf("ErrDaysHaveData.Count = %d, want 4", daysErr.Count)
	}

	// Days must be unchanged (transaction rolled back).
	days := queryDayRows(t, created.ID)
	if len(days) != 10 {
		t.Fatalf("day count after guarded shrink = %d, want 10 (unchanged)", len(days))
	}
}

// TestUpdateShrinkWithForceBypassesGuard asserts that force_shrink: true
// removes out-of-range days even when the guard would normally block.
func TestUpdateShrinkWithForceBypassesGuard(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: alwaysHasData{}})
	nt := newTestTrip(t) // 2026-07-01 → 2026-07-10
	created, err := store.Create(context.Background(), nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	edit := EditTrip{
		Name:            created.Name,
		Destinations:    created.Destinations,
		StartDate:       mustDate(t, "2026-07-05"),
		EndDate:         mustDate(t, "2026-07-10"),
		Cover:           created.Cover,
		ForceRemoveDays: true, // bypass the guard
	}
	if _, err := store.Update(context.Background(), created.ID, created.OwnerID, edit); err != nil {
		t.Fatalf("Update with force: %v", err)
	}

	days := queryDayRows(t, created.ID)
	if len(days) != 6 {
		t.Fatalf("day count = %d, want 6 after force shrink", len(days))
	}
	if days[0].date != "2026-07-05" {
		t.Errorf("first date = %s, want 2026-07-05", days[0].date)
	}
}
