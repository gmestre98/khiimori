//go:build integration

// Integration tests for the export mapping store (M13.3 S2): they run the real
// pgx Store against a migrated trip schema on a disposable database, proving the
// one-doc-per-(trip,user) upsert, read, delete, and per-user isolation. Gated
// behind the "integration" build tag; run with:
//
//	DATABASE_URL_TEST=<direct DSN of an ephemeral branch> \
//	    go test -tags=integration ./internal/exportstore/...
package exportstore

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/migrations"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		os.Exit(m.Run()) // no DB: integration tests skip themselves
	}
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: open: %v\n", err)
		os.Exit(1)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: dialect: %v\n", err)
		os.Exit(1)
	}
	if err := goose.Up(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: migrate: %v\n", err)
		os.Exit(1)
	}
	testPool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration setup: pool: %v\n", err)
		os.Exit(1)
	}
	code := m.Run()
	testPool.Close()
	if err := goose.Reset(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "integration teardown: reset: %v\n", err)
		if code == 0 {
			code = 1
		}
	}
	_ = sqlDB.Close()
	os.Exit(code)
}

// freshStore truncates the export + trips tables and returns a store plus a
// freshly-inserted trip id (to satisfy the trip_id FK).
func freshStore(t *testing.T) (*Store, string) {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; point it at an ephemeral Neon branch to run this test")
	}
	ctx := context.Background()
	if _, err := testPool.Exec(ctx, "TRUNCATE trip.trips CASCADE"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	var tripID string
	err := testPool.QueryRow(ctx,
		`INSERT INTO trip.trips (owner_id, name, start_date, end_date)
		 VALUES (gen_random_uuid(), 'T', '2026-05-01', '2026-05-03') RETURNING id`).Scan(&tripID)
	if err != nil {
		t.Fatalf("insert trip: %v", err)
	}
	return New(testPool), tripID
}

func TestIntegrationMapping_UpsertGetDelete(t *testing.T) {
	s, tripID := freshStore(t)
	ctx := context.Background()

	if _, err := s.Get(ctx, tripID, "user-1"); err != ErrNoMapping {
		t.Fatalf("Get before insert: err = %v, want ErrNoMapping", err)
	}

	m := Mapping{TripID: tripID, UserID: "user-1", DriveFileID: "file-1", FolderID: "fold-1", DocURL: "https://doc/1"}
	if err := s.Upsert(ctx, m); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	got, err := s.Get(ctx, tripID, "user-1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.DriveFileID != "file-1" || got.DocURL != "https://doc/1" {
		t.Errorf("got %+v", got)
	}
	if got.LastExportedAt.IsZero() {
		t.Error("last_exported_at not set")
	}

	// Re-export updates in place (same PK): new file id, timestamp advances.
	first := got.LastExportedAt
	m.DriveFileID = "file-2"
	if err := s.Upsert(ctx, m); err != nil {
		t.Fatalf("second Upsert: %v", err)
	}
	got2, _ := s.Get(ctx, tripID, "user-1")
	if got2.DriveFileID != "file-2" {
		t.Errorf("update in place failed: %q", got2.DriveFileID)
	}
	if !got2.LastExportedAt.After(first) && !got2.LastExportedAt.Equal(first) {
		t.Error("last_exported_at should not go backwards")
	}

	if err := s.Delete(ctx, tripID, "user-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := s.Delete(ctx, tripID, "user-1"); err != nil {
		t.Fatalf("second Delete (idempotent): %v", err)
	}
	if _, err := s.Get(ctx, tripID, "user-1"); err != ErrNoMapping {
		t.Errorf("Get after delete: err = %v, want ErrNoMapping", err)
	}
}

func TestIntegrationMapping_PerUserIsolation(t *testing.T) {
	s, tripID := freshStore(t)
	ctx := context.Background()

	if err := s.Upsert(ctx, Mapping{TripID: tripID, UserID: "u1", DriveFileID: "f-u1"}); err != nil {
		t.Fatal(err)
	}
	if err := s.Upsert(ctx, Mapping{TripID: tripID, UserID: "u2", DriveFileID: "f-u2"}); err != nil {
		t.Fatal(err)
	}
	m1, _ := s.Get(ctx, tripID, "u1")
	m2, _ := s.Get(ctx, tripID, "u2")
	if m1.DriveFileID != "f-u1" || m2.DriveFileID != "f-u2" {
		t.Errorf("two users on the same trip must map to separate docs: %q / %q", m1.DriveFileID, m2.DriveFileID)
	}
}
