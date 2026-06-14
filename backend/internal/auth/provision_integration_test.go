//go:build integration

// Integration tests for user provisioning (M02.2 S5). They run the real
// pgxUserRepo against a migrated auth schema on a disposable database, proving
// the create / returning-resolution / email-change-no-duplicate / unique-
// constraint / admin-bootstrap behaviour end-to-end — not just against the fake
// repo. Gated behind the "integration" build tag so the default `go test ./...`
// stays fast and DB-free; run with:
//
//	DATABASE_URL_TEST=<direct DSN of an ephemeral branch / throwaway DB> \
//	    go test -tags=integration ./internal/auth/...
//
// The target MUST be a disposable database (an ephemeral Neon branch is ideal):
// the suite migrates it up, truncates auth.users between tests, and rolls back
// on teardown. It reads the dedicated DATABASE_URL_TEST (never DATABASE_URL_*)
// so a real dev/prod DSN is never touched by accident.
package auth

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"testing"

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
		// No database: run anyway so the unit tests execute and the integration
		// tests skip themselves.
		os.Exit(m.Run())
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
	// Leave the disposable DB as we found it (empty), even if a test failed.
	if err := goose.Reset(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "integration teardown: migrate reset: %v\n", err)
		if code == 0 {
			code = 1
		}
	}
	_ = sqlDB.Close()
	os.Exit(code)
}

// freshRepo skips when no test DB is configured, truncates auth.users so each
// test starts from a known-empty table, and returns a real repo bound to it.
func freshRepo(t *testing.T) *pgxUserRepo {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; point it at an ephemeral Neon branch / throwaway DB to run this test")
	}
	if _, err := testPool.Exec(context.Background(), "TRUNCATE auth.users"); err != nil {
		t.Fatalf("truncate auth.users: %v", err)
	}
	return &pgxUserRepo{pool: testPool}
}

// countUsers returns the number of rows in auth.users.
func countUsers(t *testing.T) int {
	t.Helper()
	var n int
	if err := testPool.QueryRow(context.Background(), "SELECT count(*) FROM auth.users").Scan(&n); err != nil {
		t.Fatalf("count users: %v", err)
	}
	return n
}

// TestIntegrationProvisionCreatesUser: first sign-in persists a user with the
// identity fields and the server-set defaults (EUR, empty profile, non-admin).
func TestIntegrationProvisionCreatesUser(t *testing.T) {
	p := &Provisioner{repo: freshRepo(t)}

	u, err := p.Provision(context.Background(),
		VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", EmailVerified: true, Name: "Ann", Avatar: "https://pic"})
	if err != nil {
		t.Fatalf("Provision: %v", err)
	}

	if u.ID == "" {
		t.Error("ID is empty, want a generated uuid")
	}
	if u.GoogleSub != "sub-1" || u.Email != "a@example.com" || u.Name != "Ann" || u.Avatar != "https://pic" {
		t.Errorf("identity not persisted: %+v", u)
	}
	if u.DefaultCurrency != "EUR" {
		t.Errorf("DefaultCurrency = %q, want EUR", u.DefaultCurrency)
	}
	if u.IsAdmin {
		t.Error("IsAdmin = true, want false")
	}
	if u.HomeBase != "" {
		t.Errorf("HomeBase = %q, want empty", u.HomeBase)
	}
	if string(u.Prefs) != "{}" {
		t.Errorf("Prefs = %s, want {}", u.Prefs)
	}
	if got := countUsers(t); got != 1 {
		t.Errorf("rows = %d, want 1", got)
	}
}

// TestIntegrationReturningUserResolves: a second sign-in with the same
// google_sub resolves to the same row — no duplicate.
func TestIntegrationReturningUserResolves(t *testing.T) {
	p := &Provisioner{repo: freshRepo(t)}
	id := VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", EmailVerified: true, Name: "Ann", Avatar: "https://pic"}

	first, err := p.Provision(context.Background(), id)
	if err != nil {
		t.Fatalf("first Provision: %v", err)
	}
	second, err := p.Provision(context.Background(), id)
	if err != nil {
		t.Fatalf("second Provision: %v", err)
	}

	if second.ID != first.ID {
		t.Errorf("returning sign-in got ID %q, want the same row %q", second.ID, first.ID)
	}
	if got := countUsers(t); got != 1 {
		t.Errorf("rows = %d, want 1 (no duplicate)", got)
	}
}

// TestIntegrationEmailChangeUpdatesNotDuplicate: a returning sign-in whose
// Google email/name/avatar changed updates the existing row (keyed on
// google_sub), preserving the id and the row count.
func TestIntegrationEmailChangeUpdatesNotDuplicate(t *testing.T) {
	repo := freshRepo(t)
	p := &Provisioner{repo: repo}

	first, err := p.Provision(context.Background(),
		VerifiedIdentity{GoogleSub: "sub-1", Email: "old@example.com", EmailVerified: true, Name: "Old", Avatar: "https://old"})
	if err != nil {
		t.Fatalf("first Provision: %v", err)
	}
	updated, err := p.Provision(context.Background(),
		VerifiedIdentity{GoogleSub: "sub-1", Email: "new@example.com", EmailVerified: true, Name: "New", Avatar: "https://new"})
	if err != nil {
		t.Fatalf("second Provision: %v", err)
	}

	if updated.ID != first.ID {
		t.Errorf("email change created a new row (ID %q), want %q", updated.ID, first.ID)
	}
	if updated.Email != "new@example.com" || updated.Name != "New" || updated.Avatar != "https://new" {
		t.Errorf("identity not refreshed: %+v", updated)
	}
	if got := countUsers(t); got != 1 {
		t.Errorf("rows = %d, want 1 (email change must not duplicate)", got)
	}
}

// TestIntegrationConcurrentFirstSignInNoDuplicate: many concurrent first
// sign-ins for the same google_sub collapse to one row — the unique constraint
// turns the losing inserts into the upsert rather than erroring or duplicating.
func TestIntegrationConcurrentFirstSignInNoDuplicate(t *testing.T) {
	repo := freshRepo(t)
	p := &Provisioner{repo: repo}
	id := VerifiedIdentity{GoogleSub: "sub-1", Email: "a@example.com", EmailVerified: true, Name: "Ann", Avatar: "https://pic"}

	const n = 8
	var wg sync.WaitGroup
	ids := make([]string, n)
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			u, err := p.Provision(context.Background(), id)
			ids[i], errs[i] = u.ID, err
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Errorf("concurrent Provision %d failed: %v", i, err)
		}
	}
	for i, got := range ids {
		if got != ids[0] {
			t.Errorf("concurrent sign-in %d resolved to ID %q, want the single row %q", i, got, ids[0])
		}
	}
	if got := countUsers(t); got != 1 {
		t.Errorf("rows = %d, want 1 (unique google_sub must prevent duplicates)", got)
	}
}

// TestIntegrationAdminBootstrap: with ADMIN_EMAIL configured, the matching
// verified user is provisioned admin and others are not; the flag is
// promote-only across an email change.
func TestIntegrationAdminBootstrap(t *testing.T) {
	repo := freshRepo(t)
	p := &Provisioner{repo: repo, adminEmail: "Owner@example.com"}
	ctx := context.Background()

	admin, err := p.Provision(ctx,
		VerifiedIdentity{GoogleSub: "sub-admin", Email: "owner@example.com", EmailVerified: true, Name: "Owner"})
	if err != nil {
		t.Fatalf("provision admin: %v", err)
	}
	if !admin.IsAdmin {
		t.Error("designated user (case-insensitive match) was not marked admin")
	}

	other, err := p.Provision(ctx,
		VerifiedIdentity{GoogleSub: "sub-other", Email: "someone@example.com", EmailVerified: true, Name: "Someone"})
	if err != nil {
		t.Fatalf("provision other: %v", err)
	}
	if other.IsAdmin {
		t.Error("non-designated user was marked admin")
	}

	// Unverified email matching ADMIN_EMAIL must not be promoted.
	imposter, err := p.Provision(ctx,
		VerifiedIdentity{GoogleSub: "sub-imp", Email: "owner@example.com", EmailVerified: false, Name: "Imposter"})
	if err != nil {
		t.Fatalf("provision imposter: %v", err)
	}
	if imposter.IsAdmin {
		t.Error("user with an unverified matching email was marked admin")
	}

	// Promote-only: the admin's email later changes away from ADMIN_EMAIL; the
	// flag survives the identity refresh.
	moved, err := p.Provision(ctx,
		VerifiedIdentity{GoogleSub: "sub-admin", Email: "elsewhere@example.com", EmailVerified: true, Name: "Owner"})
	if err != nil {
		t.Fatalf("re-provision admin: %v", err)
	}
	if !moved.IsAdmin {
		t.Error("admin flag was revoked on an email change (must be promote-only)")
	}
}
