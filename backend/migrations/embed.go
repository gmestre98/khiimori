// Package migrations holds the database schema migrations and embeds them into
// the binary so the service and the migrate command are self-contained — there
// are no SQL files to ship or mount alongside them (important for Cloud Run,
// M01.5).
//
// Migrations are plain SQL in the sql/ subdirectory, applied by cmd/migrate via
// goose. See README.md for the naming and authoring conventions. The initial
// migrations create one schema per domain module (auth, trip, budget, journal,
// sharing, geo).
package migrations

import "embed"

// FS is the embedded set of SQL migration files (the sql/ subtree). The
// "all:sql" pattern embeds every file under sql/, so new migrations are included
// automatically without touching this file.
//
//go:embed all:sql
var FS embed.FS

// Dir is the directory within FS that goose scans for migration files.
const Dir = "sql"
