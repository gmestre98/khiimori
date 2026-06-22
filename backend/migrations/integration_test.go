//go:build integration

// Integration test for the database migrations. It is gated behind the
// "integration" build tag so the default `go test ./...` stays fast and needs no
// database; run it with:
//
//	DATABASE_URL_TEST=<direct DSN of an ephemeral branch / throwaway DB> \
//	    go test -tags=integration ./migrations/...
//
// or `make test-integration`. The target MUST be a disposable database (an
// ephemeral Neon branch is ideal) — the test resets it. It deliberately reads a
// dedicated DATABASE_URL_TEST rather than DATABASE_URL_DIRECT so a normal dev/
// prod DSN is never wiped by accident.
package migrations_test

import (
	"database/sql"
	"os"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/migrations"
)

// moduleSchemas are the per-module schemas the migrations must create (S4).
var moduleSchemas = []string{"auth", "trip", "budget", "journal", "sharing", "geo"}

// TestMigrationsCreateModuleSchemas runs the full migration set against an
// ephemeral database and asserts the six module schemas appear, then roll back
// cleanly. It is hermetic: it starts from and returns to an empty schema set.
func TestMigrationsCreateModuleSchemas(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		t.Skip("DATABASE_URL_TEST not set; point it at an ephemeral Neon branch / throwaway DB to run this test")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	// Registered first so it runs last (t.Cleanup is LIFO): the teardown reset
	// below must run while the connection is still open.
	t.Cleanup(func() { _ = db.Close() })

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("set dialect: %v", err)
	}

	// The target is an ephemeral / throwaway database, so it starts empty. Still,
	// guarantee teardown even if an assertion fails partway through, so the
	// branch/DB is left without our schemas. Runs before the db.Close above.
	t.Cleanup(func() {
		if err := goose.Reset(db, migrations.Dir); err != nil {
			t.Errorf("teardown reset: %v", err)
		}
	})

	// Apply the full migration set (the same set the runner applies).
	if err := goose.Up(db, migrations.Dir); err != nil {
		t.Fatalf("migrate up: %v", err)
	}
	for _, schema := range moduleSchemas {
		if !schemaExists(t, db, schema) {
			t.Errorf("schema %q missing after migrate up", schema)
		}
	}

	// The auth.users table (00007) is the identity model the rest of M02 builds
	// on; assert its provisioning-critical shape applied: the table exists, the
	// google_sub idempotency key is unique, and the server-set defaults hold.
	assertAuthUsersTable(t, db)

	// The trip.days table (00011) is the Day entity all later milestones key off;
	// assert its idempotency guard and cascade FK applied.
	assertTripDaysTable(t, db)

	// Roll everything back and assert the schemas are gone.
	if err := goose.Reset(db, migrations.Dir); err != nil {
		t.Fatalf("migrate reset: %v", err)
	}
	for _, schema := range moduleSchemas {
		if schemaExists(t, db, schema) {
			t.Errorf("schema %q still present after rollback", schema)
		}
	}
}

// assertAuthUsersTable checks the auth.users migration (00007) applied with the
// shape provisioning depends on: a unique constraint on google_sub (the
// idempotency key) and the server-set EUR / is_admin=false column defaults.
func assertAuthUsersTable(t *testing.T, db *sql.DB) {
	t.Helper()

	var tableExists bool
	if err := db.QueryRow(
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'auth' AND table_name = 'users'
		)`,
	).Scan(&tableExists); err != nil {
		t.Fatalf("query auth.users existence: %v", err)
	}
	if !tableExists {
		t.Fatal("auth.users table missing after migrate up")
	}

	// A unique (or primary-key) constraint must cover exactly google_sub so two
	// concurrent first sign-ins can't create duplicate rows.
	var uniqueOnGoogleSub bool
	if err := db.QueryRow(
		`SELECT EXISTS (
			SELECT 1
			FROM pg_constraint c
			WHERE c.conrelid = 'auth.users'::regclass
			  AND c.contype IN ('u', 'p')
			  AND c.conkey = ARRAY[(
				SELECT attnum FROM pg_attribute
				WHERE attrelid = 'auth.users'::regclass AND attname = 'google_sub'
			)]
		)`,
	).Scan(&uniqueOnGoogleSub); err != nil {
		t.Fatalf("query google_sub unique constraint: %v", err)
	}
	if !uniqueOnGoogleSub {
		t.Error("auth.users.google_sub lacks a unique/primary-key constraint")
	}

	for _, tc := range []struct {
		column string
		want   string // substring expected in the column default expression
	}{
		{"default_currency", "EUR"},
		{"is_admin", "false"},
	} {
		var def string
		if err := db.QueryRow(
			`SELECT COALESCE(column_default, '')
			   FROM information_schema.columns
			  WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = $1`,
			tc.column,
		).Scan(&def); err != nil {
			t.Fatalf("query default for %s: %v", tc.column, err)
		}
		if !strings.Contains(def, tc.want) {
			t.Errorf("auth.users.%s default = %q, want it to contain %q", tc.column, def, tc.want)
		}
	}
}

// assertTripDaysTable checks the trip.days migration (00011) applied with the
// shape S2–S4 depend on: the table exists, the (trip_id, date) uniqueness guard
// is in place, and the cascading FK from trip_id to trip.trips is present.
func assertTripDaysTable(t *testing.T, db *sql.DB) {
	t.Helper()

	var tableExists bool
	if err := db.QueryRow(
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'trip' AND table_name = 'days'
		)`,
	).Scan(&tableExists); err != nil {
		t.Fatalf("query trip.days existence: %v", err)
	}
	if !tableExists {
		t.Fatal("trip.days table missing after migrate up")
	}

	// The (trip_id, date) UNIQUE constraint is the idempotency key for day
	// generation; its absence would allow duplicate days for the same date.
	var uniqueOnTripDate bool
	if err := db.QueryRow(
		`SELECT EXISTS (
			SELECT 1
			FROM pg_constraint c
			WHERE c.conrelid = 'trip.days'::regclass
			  AND c.contype = 'u'
			  AND c.conkey = ARRAY[
				(SELECT attnum FROM pg_attribute WHERE attrelid = 'trip.days'::regclass AND attname = 'trip_id'),
				(SELECT attnum FROM pg_attribute WHERE attrelid = 'trip.days'::regclass AND attname = 'date')
			  ]
		)`,
	).Scan(&uniqueOnTripDate); err != nil {
		t.Fatalf("query trip.days unique constraint: %v", err)
	}
	if !uniqueOnTripDate {
		t.Error("trip.days lacks a UNIQUE constraint on (trip_id, date)")
	}

	// The cascade FK ensures days are removed when their trip is deleted, so no
	// orphan cleanup is needed at the application layer.
	var cascadeFK bool
	if err := db.QueryRow(
		`SELECT EXISTS (
			SELECT 1
			FROM pg_constraint c
			WHERE c.conrelid  = 'trip.days'::regclass
			  AND c.contype   = 'f'
			  AND c.confrelid = 'trip.trips'::regclass
			  AND c.confdeltype = 'c'
		)`,
	).Scan(&cascadeFK); err != nil {
		t.Fatalf("query trip.days cascade FK: %v", err)
	}
	if !cascadeFK {
		t.Error("trip.days.trip_id lacks a CASCADE DELETE foreign key to trip.trips")
	}
}

func schemaExists(t *testing.T, db *sql.DB, name string) bool {
	t.Helper()
	var exists bool
	err := db.QueryRow(
		`SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1)`,
		name,
	).Scan(&exists)
	if err != nil {
		t.Fatalf("query schema %q: %v", name, err)
	}
	return exists
}
