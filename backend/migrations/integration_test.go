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
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/eudaimonia/backend/migrations"
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
