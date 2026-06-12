// Package migrations holds the database schema migrations and embeds them into
// the binary so the service and the migrate command are self-contained — there
// are no SQL files to ship or mount alongside them (important for Cloud Run,
// M01.5).
//
// Migrations are plain SQL in the sql/ subdirectory, applied by cmd/migrate via
// goose. See README.md for the naming and authoring conventions. This package
// (S3) sets up the mechanism only; the per-module schemas arrive in S4.
package migrations

import "embed"

// FS is the embedded set of SQL migration files (the sql/ subtree). The
// "all:sql" pattern keeps the build working while sql/ holds only .gitkeep, and
// picks up real migrations as they are added.
//
//go:embed all:sql
var FS embed.FS

// Dir is the directory within FS that goose scans for migration files.
const Dir = "sql"
