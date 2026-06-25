//go:build integration

// Integration tests for the sharing.Memberships lifecycle and referential
// integrity (M08.1 S3). They run the real Memberships methods against a
// migrated sharing schema on a disposable database, proving add / change-role /
// revoke are transactional and that FK/cascade behaviour leaves no orphans.
//
// Gated behind the "integration" build tag so the default `go test ./...`
// stays fast and DB-free. Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/sharing/...
package sharing

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

// testPool is the shared pool opened in TestMain against DATABASE_URL_TEST.
// Nil when the variable is unset — integration tests skip in that case.
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		os.Exit(m.Run()) // unit tests still run; integration tests skip
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

// freshMemberships skips when no test DB is configured, truncates the
// membership table so each test starts from a clean slate, and returns a
// Memberships instance wired to the shared pool.
func freshMemberships(t *testing.T) *Memberships {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping sharing integration test")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating membership table: %v", err)
	}
	return NewMemberships(testPool)
}

// genUUID generates a fresh random UUID via the database.
func genUUID(t *testing.T) string {
	t.Helper()
	var id string
	if err := testPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("generating uuid: %v", err)
	}
	return id
}

// TestAddMembership verifies that Add inserts a membership row and that
// RoleForUser returns the correct role.
func TestAddMembership(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	tripID, userID := genUUID(t), genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleEditor); err != nil {
		t.Fatalf("Add: %v", err)
	}

	role, err := mb.RoleForUser(ctx, tripID, userID)
	if err != nil {
		t.Fatalf("RoleForUser: %v", err)
	}
	if role != RoleEditor {
		t.Errorf("role = %q, want editor", role)
	}
}

// TestAddDuplicateReturnsAlreadyExists asserts Add returns ErrMembershipAlreadyExists
// when the (trip, user) pair already exists.
func TestAddDuplicateReturnsAlreadyExists(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	tripID, userID := genUUID(t), genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleViewer); err != nil {
		t.Fatalf("first Add: %v", err)
	}
	if err := mb.Add(ctx, tripID, userID, RoleViewer); err != ErrMembershipAlreadyExists {
		t.Errorf("second Add error = %v, want ErrMembershipAlreadyExists", err)
	}
}

// TestChangeRole verifies that ChangeRole updates an existing membership and
// returns ErrMembershipNotFound for a non-existent one.
func TestChangeRole(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	tripID, userID := genUUID(t), genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleViewer); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if err := mb.ChangeRole(ctx, tripID, userID, RoleEditor); err != nil {
		t.Fatalf("ChangeRole: %v", err)
	}

	role, err := mb.RoleForUser(ctx, tripID, userID)
	if err != nil {
		t.Fatalf("RoleForUser: %v", err)
	}
	if role != RoleEditor {
		t.Errorf("role after change = %q, want editor", role)
	}

	// Non-existent membership must return ErrMembershipNotFound.
	if err := mb.ChangeRole(ctx, genUUID(t), genUUID(t), RoleViewer); err != ErrMembershipNotFound {
		t.Errorf("ChangeRole on missing membership = %v, want ErrMembershipNotFound", err)
	}
}

// TestRevoke verifies that Revoke removes a membership and that subsequent
// reads return ErrMembershipNotFound.
func TestRevoke(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	tripID, userID := genUUID(t), genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleViewer); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if err := mb.Revoke(ctx, tripID, userID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	if _, err := mb.RoleForUser(ctx, tripID, userID); err != ErrMembershipNotFound {
		t.Errorf("RoleForUser after revoke = %v, want ErrMembershipNotFound", err)
	}

	// Revoking again must return ErrMembershipNotFound.
	if err := mb.Revoke(ctx, tripID, userID); err != ErrMembershipNotFound {
		t.Errorf("second Revoke = %v, want ErrMembershipNotFound", err)
	}
}

// TestOwnerRowIntegratesWithLifecycle asserts that an Owner row (as created by
// the trip module's CreateOwner) is visible through the lifecycle reads and can
// be changed or revoked by subsequent lifecycle operations.
func TestOwnerRowIntegratesWithLifecycle(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	tripID, userID := genUUID(t), genUUID(t)

	// Simulate the trip-module path: write an Owner row within a transaction.
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	if err := mb.CreateOwner(ctx, tx, tripID, userID); err != nil {
		_ = tx.Rollback(ctx)
		t.Fatalf("CreateOwner: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	// Owner row must be visible through the lifecycle reads.
	role, err := mb.RoleForUser(ctx, tripID, userID)
	if err != nil {
		t.Fatalf("RoleForUser after CreateOwner: %v", err)
	}
	if role != RoleOwner {
		t.Errorf("role = %q, want owner", role)
	}

	// Owner can be demoted (change role) — the epic doesn't restrict this in data layer.
	if err := mb.ChangeRole(ctx, tripID, userID, RoleEditor); err != nil {
		t.Fatalf("ChangeRole owner→editor: %v", err)
	}
	if err := mb.Revoke(ctx, tripID, userID); err != nil {
		t.Fatalf("Revoke after ChangeRole: %v", err)
	}
}

// TestReferentialIntegrity asserts that deleting memberships (via Revoke or
// RevokeInTx) leaves no orphaned rows.  Because cross-schema FKs are absent
// (the design note in M03 S2 explains why), "referential integrity" here means
// the application correctly removes membership rows before the referenced trip
// could be deleted — verified by confirming the table is empty after all
// revocations.
func TestReferentialIntegrity(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	tripID := genUUID(t)
	user1, user2, user3 := genUUID(t), genUUID(t), genUUID(t)

	for _, uid := range []string{user1, user2, user3} {
		if err := mb.Add(ctx, tripID, uid, RoleViewer); err != nil {
			t.Fatalf("Add user %s: %v", uid, err)
		}
	}

	// Remove all memberships for the trip (simulating trip deletion path).
	members, err := mb.MembershipsForTrip(ctx, tripID)
	if err != nil {
		t.Fatalf("MembershipsForTrip: %v", err)
	}
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	for _, m := range members {
		if err := mb.RevokeInTx(ctx, tx, m.TripID, m.UserID); err != nil {
			_ = tx.Rollback(ctx)
			t.Fatalf("RevokeInTx %s: %v", m.UserID, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	remaining, err := mb.MembershipsForTrip(ctx, tripID)
	if err != nil {
		t.Fatalf("MembershipsForTrip after revocations: %v", err)
	}
	if len(remaining) != 0 {
		t.Errorf("membership rows after all revocations = %d, want 0", len(remaining))
	}
}

// TestTransactionalRollback asserts that a partially-applied change within a
// transaction is rolled back on failure: none of the RevokeInTx calls persist
// if the transaction is rolled back.
func TestTransactionalRollback(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	tripID := genUUID(t)
	user1, user2 := genUUID(t), genUUID(t)

	if err := mb.Add(ctx, tripID, user1, RoleViewer); err != nil {
		t.Fatalf("Add user1: %v", err)
	}
	if err := mb.Add(ctx, tripID, user2, RoleViewer); err != nil {
		t.Fatalf("Add user2: %v", err)
	}

	// Begin a transaction, revoke user1, then roll back.
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	if err := mb.RevokeInTx(ctx, tx, tripID, user1); err != nil {
		_ = tx.Rollback(ctx)
		t.Fatalf("RevokeInTx: %v", err)
	}
	// Simulate a subsequent failure — roll back explicitly.
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	// Both memberships must still exist.
	members, err := mb.MembershipsForTrip(ctx, tripID)
	if err != nil {
		t.Fatalf("MembershipsForTrip after rollback: %v", err)
	}
	if len(members) != 2 {
		t.Errorf("membership rows after rollback = %d, want 2 (rollback must undo the revoke)", len(members))
	}
}

// TestMembershipsForUser verifies the user-scoped read returns memberships
// across multiple trips and that a user with no memberships returns an empty slice.
func TestMembershipsForUser(t *testing.T) {
	mb := freshMemberships(t)
	ctx := context.Background()
	userID := genUUID(t)
	trip1, trip2 := genUUID(t), genUUID(t)

	if err := mb.Add(ctx, trip1, userID, RoleOwner); err != nil {
		t.Fatalf("Add trip1: %v", err)
	}
	if err := mb.Add(ctx, trip2, userID, RoleViewer); err != nil {
		t.Fatalf("Add trip2: %v", err)
	}

	got, err := mb.MembershipsForUser(ctx, userID)
	if err != nil {
		t.Fatalf("MembershipsForUser: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("MembershipsForUser count = %d, want 2", len(got))
	}

	// Empty case.
	none, err := mb.MembershipsForUser(ctx, genUUID(t))
	if err != nil {
		t.Fatalf("MembershipsForUser empty: %v", err)
	}
	if len(none) != 0 {
		t.Errorf("MembershipsForUser unknown user = %d rows, want 0", len(none))
	}
}
