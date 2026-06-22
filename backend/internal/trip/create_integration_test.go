//go:build integration

// Integration tests for trip creation (M03.1 S2). They run the real pgxTripStore
// against a migrated trip/sharing schema on a disposable database, proving the
// trip + Owner membership are written in one transaction and that a failure in
// the membership write rolls back the trip too.
//
// Gated behind the "integration" build tag so the default `go test ./...` stays
// fast and DB-free. The trip module must not import the sharing module (the
// modular-monolith boundary, enforced by internal/boundaries), so this test
// supplies its own SQL membership writer with the same INSERT as
// sharing.Memberships; the full end-to-end path through the real sharing writer
// and the HTTP endpoints is covered by the S5 CRUD suite. Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/trip/...
package trip

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/migrations"
)

// testPool is the shared pool for the integration tests, opened in TestMain
// against DATABASE_URL_TEST. It is nil when that variable is unset, in which
// case every integration test skips.
var testPool *pgxpool.Pool

// TestMain migrates the disposable database up once, opens the shared pool, runs
// the package tests, then rolls the migrations back. The unit tests in this
// package run under the integration build too; they don't touch the DB, so this
// setup is harmless to them.
func TestMain(m *testing.M) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		os.Exit(m.Run()) // no DB: unit tests run, integration tests skip
	}

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: open database: %v\n", err)
		os.Exit(1)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: set dialect: %v\n", err)
		os.Exit(1)
	}
	if err := goose.Up(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: migrate up: %v\n", err)
		os.Exit(1)
	}

	testPool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: open pool: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	testPool.Close()
	if err := goose.Reset(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "integration teardown: migrate reset: %v\n", err)
		if code == 0 {
			code = 1
		}
	}
	_ = sqlDB.Close()
	os.Exit(code)
}

// sqlOwnerMemberships writes the Owner membership with the same INSERT as
// sharing.Memberships. The trip module can't import sharing (module boundary),
// so the test re-states the one statement to exercise the store's transactional
// orchestration against a real schema.
type sqlOwnerMemberships struct{}

func (sqlOwnerMemberships) CreateOwner(ctx context.Context, tx pgx.Tx, tripID, userID string) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO sharing.trip_memberships (trip_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner')`,
		tripID, userID)
	return err
}

// failingOwnerMemberships always errors, to drive the rollback path.
type failingOwnerMemberships struct{}

var errMembershipBoom = errors.New("boom")

func (failingOwnerMemberships) CreateOwner(context.Context, pgx.Tx, string, string) error {
	return errMembershipBoom
}

// freshStore skips when no test DB is configured, truncates the trip and sharing
// tables so each test starts clean, and returns a real store bound to the pool
// with the supplied membership writer.
func freshStore(t *testing.T, m OwnerMemberships) *pgxTripStore {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping trip integration test")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
	return &pgxTripStore{pool: testPool, memberships: m, days: noopDayRegenerator{}}
}

// newTestTrip is a valid NewTrip owned by a fresh random user id.
func newTestTrip(t *testing.T) NewTrip {
	t.Helper()
	var ownerID string
	if err := testPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&ownerID); err != nil {
		t.Fatalf("generating owner id: %v", err)
	}
	return NewTrip{
		OwnerID:      ownerID,
		Name:         "Lisbon",
		Destinations: []string{"Lisbon", "Porto"},
		StartDate:    mustDate(t, "2026-07-01"),
		EndDate:      mustDate(t, "2026-07-10"),
		Cover:        "https://example.com/cover.jpg",
	}
}

// TestCreateWritesTripAndOwnerMembership asserts a create persists the trip with
// EUR/active server-side defaults and writes exactly one Owner membership row for
// the creator, in one transaction.
func TestCreateWritesTripAndOwnerMembership(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{})
	nt := newTestTrip(t)
	ctx := context.Background()

	got, err := store.Create(ctx, nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if got.ID == "" {
		t.Error("created trip has no id")
	}
	if got.OwnerID != nt.OwnerID {
		t.Errorf("owner_id = %q, want %q", got.OwnerID, nt.OwnerID)
	}
	if got.BaseCurrency != "EUR" {
		t.Errorf("base_currency = %q, want EUR (server default)", got.BaseCurrency)
	}
	if got.Status != statusActive {
		t.Errorf("status = %q, want active (server default)", got.Status)
	}
	if len(got.Destinations) != 2 || got.Destinations[0] != "Lisbon" {
		t.Errorf("destinations = %v, want [Lisbon Porto]", got.Destinations)
	}

	// Exactly one Owner membership for this trip + user.
	var count int
	var role string
	err = testPool.QueryRow(ctx,
		`SELECT count(*), coalesce(max(role), '') FROM sharing.trip_memberships WHERE trip_id = $1::uuid AND user_id = $2::uuid`,
		got.ID, nt.OwnerID).Scan(&count, &role)
	if err != nil {
		t.Fatalf("querying membership: %v", err)
	}
	if count != 1 {
		t.Fatalf("owner membership rows = %d, want 1", count)
	}
	if role != "owner" {
		t.Errorf("membership role = %q, want owner", role)
	}
}

// TestCreateRollsBackOnMembershipFailure asserts that when the owner-membership
// write fails, the trip insert is rolled back too — no orphan trip is left.
func TestCreateRollsBackOnMembershipFailure(t *testing.T) {
	store := freshStore(t, failingOwnerMemberships{})
	nt := newTestTrip(t)
	ctx := context.Background()

	if _, err := store.Create(ctx, nt); !errors.Is(err, errMembershipBoom) {
		t.Fatalf("Create error = %v, want errMembershipBoom", err)
	}

	var trips int
	if err := testPool.QueryRow(ctx, `SELECT count(*) FROM trip.trips`).Scan(&trips); err != nil {
		t.Fatalf("counting trips: %v", err)
	}
	if trips != 0 {
		t.Errorf("trip rows after rollback = %d, want 0 (transaction must roll back)", trips)
	}
}
