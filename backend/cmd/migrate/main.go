// Command migrate applies and rolls back database schema migrations.
//
// It is the single entrypoint for migrations in local dev, CI, and the deploy
// step (M01.5). Migrations run against the DIRECT (un-pooled) Neon connection —
// schema changes must bypass the pgBouncer pooler — read from the required
// DATABASE_URL_DIRECT, never hardcoded. The migration files are embedded (see
// the migrations package), so the binary is self-contained.
//
// Usage:
//
//	migrate up        apply all pending migrations
//	migrate down      roll back the most recent migration
//	migrate reset     roll back all migrations
//	migrate status    show applied/pending migrations
//
// The destructive commands (down, reset) refuse to run against the production
// database: they roll back migrations, whose Down sections DROP tables/schemas
// and so destroy data. Iterate on schema changes against a Neon dev branch, not
// production. Set MIGRATE_FORCE=true to override the guard for a deliberate
// production rollback. See config.IsProtectedMigrationTarget.
//
// Any failure exits non-zero with a message on stderr, so CI can gate on it.
// The make migrate-* targets wrap these and load backend/.env for local dev.
package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strconv"

	// pgx's database/sql driver, registered as "pgx" — the direct path goose
	// uses for migrations (the app pool uses pgxpool separately).
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	"github.com/gmestre98/khiimori/backend/migrations"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: migrate <up|down|reset|status>")
	}
	command := args[0]
	// Validate the command before touching config or the database, so a typo
	// fails fast without needing a connection.
	switch command {
	case "up", "down", "reset", "status":
	default:
		return fmt.Errorf("unknown command %q (want up, down, reset or status)", command)
	}

	dsn, err := config.LoadMigrationDSN()
	if err != nil {
		return err
	}

	// Guard the destructive commands: down/reset roll back migrations, whose
	// Down sections DROP tables/schemas, so against production they erase real
	// data. Fail closed if the target can't be classified. MIGRATE_FORCE=true is
	// the deliberate-rollback escape hatch.
	if command == "down" || command == "reset" {
		protected, host, err := config.IsProtectedMigrationTarget(dsn)
		if err != nil {
			return err
		}
		if protected {
			force, _ := strconv.ParseBool(os.Getenv("MIGRATE_FORCE"))
			if !force {
				return fmt.Errorf("refusing to run %q against protected host %q: "+
					"this would roll back migrations and DROP tables, destroying data. "+
					"Use a Neon dev branch for schema iteration, or set MIGRATE_FORCE=true to override", command, host)
			}
			fmt.Fprintf(os.Stderr, "migrate: WARNING — MIGRATE_FORCE set; running destructive %q against protected host %q\n", command, host)
		}
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close() //nolint:errcheck // Close on a cleanup path; error is unactionable

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set dialect: %w", err)
	}

	var cmdErr error
	switch command {
	case "up":
		cmdErr = goose.Up(db, migrations.Dir)
	case "down":
		cmdErr = goose.Down(db, migrations.Dir)
	case "reset":
		cmdErr = goose.Reset(db, migrations.Dir)
	case "status":
		cmdErr = goose.Status(db, migrations.Dir)
	}

	// An empty migration set is a no-op, not a failure — e.g. before S4 adds the
	// first migration. Report it and exit zero so callers (and CI) don't trip.
	if errors.Is(cmdErr, goose.ErrNoMigrationFiles) {
		fmt.Println("migrate: no migrations to apply")
		return nil
	}
	return cmdErr
}
