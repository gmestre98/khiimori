//go:build integration

// Integration tests for journal entry behaviour (M06.1 S3). They drive the full
// handler → store → DB path against a migrated journal.journal_entries schema.
//
// Gated behind the "integration" build tag. Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/journal/...
package journal

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/migrations"
)

var testPool *pgxpool.Pool

// TestMain migrates the disposable database up, runs all tests, then rolls back.
func TestMain(m *testing.M) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
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
		fmt.Fprintf(os.Stderr, "integration setup: pool: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	testPool.Close()
	if err := goose.Reset(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "integration teardown: migrate reset: %v\n", err)
	}
	_ = sqlDB.Close()
	os.Exit(code)
}

// freshOwnerID generates a random UUID and skips when DATABASE_URL_TEST is unset.
func freshOwnerID(t *testing.T) string {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping journal integration test")
	}
	var id string
	if err := testPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("generating owner id: %v", err)
	}
	return id
}

// newIntegrationServer wires a real Module backed by the test pool and returns
// an httptest.Server. It truncates all relevant tables before each test so each
// test starts with a clean slate.
func newIntegrationServer(t *testing.T, ownerID string) *httptest.Server {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping journal integration test")
	}
	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`TRUNCATE journal.journal_entries, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: ownerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	mod := New(testPool, requireAuth, alwaysAllowIntegrationAuthz{})
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// newIntegrationServerWithUser constructs a server where the authenticated user
// is callerID but only ownerID has trip access (for authz denial tests).
func newIntegrationServerWithUser(t *testing.T, callerID, ownerID string) *httptest.Server {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping journal integration test")
	}
	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`TRUNCATE journal.journal_entries, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: callerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	// Use the real trip.OwnerOnlyAuthorizer via a pool-backed authz that checks
	// sharing.trip_memberships. We stub it here with a membership-checking authz.
	mod := New(testPool, requireAuth, &membershipAuthz{pool: testPool, ownerID: ownerID})
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// alwaysAllowIntegrationAuthz grants every access check (tests pre-wire the correct tripID).
type alwaysAllowIntegrationAuthz struct{}

func (alwaysAllowIntegrationAuthz) CanAccess(_ context.Context, _, _ string) (bool, error) {
	return true, nil
}

// membershipAuthz checks sharing.trip_memberships (mirrors OwnerOnlyAuthorizer).
type membershipAuthz struct {
	pool    *pgxpool.Pool
	ownerID string
}

func (a *membershipAuthz) CanAccess(ctx context.Context, userID, tripID string) (bool, error) {
	const q = `SELECT 1 FROM sharing.trip_memberships
	           WHERE trip_id = $1::uuid AND user_id = $2::uuid AND role = 'owner'`
	var dummy int
	err := a.pool.QueryRow(ctx, q, tripID, userID).Scan(&dummy)
	if err != nil {
		return false, nil //nolint:nilerr
	}
	return true, nil
}

// insertTrip inserts a minimal trip row and owner membership, returns the trip id.
func insertTrip(t *testing.T, ownerID string) string {
	t.Helper()
	var tripID string
	err := testPool.QueryRow(context.Background(), `
		INSERT INTO trip.trips (owner_id, name, destinations, start_date, end_date)
		VALUES ($1::uuid, 'Test Trip', '{}', '2026-07-01', '2026-07-05')
		RETURNING id::text`, ownerID).Scan(&tripID)
	if err != nil {
		t.Fatalf("insert trip: %v", err)
	}
	_, err = testPool.Exec(context.Background(), `
		INSERT INTO sharing.trip_memberships (trip_id, user_id, role)
		VALUES ($1::uuid, $2::uuid, 'owner')`, tripID, ownerID)
	if err != nil {
		t.Fatalf("insert membership: %v", err)
	}
	return tripID
}

// insertDay inserts a trip.days row and returns the day id.
func insertDay(t *testing.T, tripID string) string {
	t.Helper()
	var dayID string
	err := testPool.QueryRow(context.Background(), `
		INSERT INTO trip.days (trip_id, date, index)
		VALUES ($1::uuid, '2026-07-01', 0)
		RETURNING id::text`, tripID).Scan(&dayID)
	if err != nil {
		t.Fatalf("insert day: %v", err)
	}
	return dayID
}

func putEntry(srv *httptest.Server, tripID, dayID string, body map[string]any) (*http.Response, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPut,
		srv.URL+fmt.Sprintf("/trips/%s/days/%s/journal", tripID, dayID),
		bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func getEntry(srv *httptest.Server, tripID, dayID string) (*http.Response, error) {
	return http.Get(srv.URL + fmt.Sprintf("/trips/%s/days/%s/journal", tripID, dayID))
}

// TestIntegration_UpsertEntry_Create verifies a new entry is created with author_id.
func TestIntegration_UpsertEntry_Create(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	resp, err := putEntry(srv, tripID, dayID, map[string]any{
		"body": json.RawMessage(`{"text":"Day one!"}`),
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}

	var out journalEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.DayID != dayID {
		t.Errorf("day_id: got %q, want %q", out.DayID, dayID)
	}
	if out.AuthorID != ownerID {
		t.Errorf("author_id: got %q, want %q", out.AuthorID, ownerID)
	}
}

// TestIntegration_UpsertEntry_OnePerDay verifies the UNIQUE day_id guard: a
// second PUT for the same day updates, not duplicates.
func TestIntegration_UpsertEntry_OnePerDay(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	for range 3 {
		resp, err := putEntry(srv, tripID, dayID, map[string]any{
			"body": json.RawMessage(`{"text":"same"}`),
		})
		if err != nil {
			t.Fatalf("put: %v", err)
		}
		_ = resp.Body.Close()
	}

	var count int
	err := testPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM journal.journal_entries WHERE day_id = $1::uuid`, dayID).Scan(&count)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 entry, got %d", count)
	}
}

// TestIntegration_UpsertEntry_UpdatedFields verifies body+optional fields are
// persisted and returned after update.
func TestIntegration_UpsertEntry_UpdatedFields(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	rating := 4
	resp, err := putEntry(srv, tripID, dayID, map[string]any{
		"body":    json.RawMessage(`{"text":"nice day"}`),
		"rating":  rating,
		"weather": "sunny",
		"mood":    "great",
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	var out journalEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Rating == nil || *out.Rating != 4 {
		t.Errorf("rating: got %v, want 4", out.Rating)
	}
	if out.Weather != "sunny" {
		t.Errorf("weather: got %q, want sunny", out.Weather)
	}
	if out.Mood != "great" {
		t.Errorf("mood: got %q, want great", out.Mood)
	}
}

// TestIntegration_UpsertEntry_OptionalFieldsAbsent verifies nil/empty optional
// fields are stored without errors.
func TestIntegration_UpsertEntry_OptionalFieldsAbsent(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	resp, err := putEntry(srv, tripID, dayID, map[string]any{
		"body": json.RawMessage(`{"text":"plain"}`),
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	var out journalEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Rating != nil {
		t.Errorf("rating: expected nil, got %v", out.Rating)
	}
	if out.Weather != "" {
		t.Errorf("weather: expected empty, got %q", out.Weather)
	}
	if out.Mood != "" {
		t.Errorf("mood: expected empty, got %q", out.Mood)
	}
}

// TestIntegration_GetEntry_ReturnsExisting verifies GET after PUT returns the
// same entry.
func TestIntegration_GetEntry_ReturnsExisting(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	putResp, err := putEntry(srv, tripID, dayID, map[string]any{
		"body": json.RawMessage(`{"text":"hello"}`),
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	_ = putResp.Body.Close()

	resp, err := getEntry(srv, tripID, dayID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}
	var out journalEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.DayID != dayID {
		t.Errorf("day_id: got %q, want %q", out.DayID, dayID)
	}
	if out.AuthorID != ownerID {
		t.Errorf("author_id: got %q, want %q", out.AuthorID, ownerID)
	}
}

// TestIntegration_GetEntry_NotFound verifies GET for a day with no entry returns
// 404.
func TestIntegration_GetEntry_NotFound(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	resp, err := getEntry(srv, tripID, dayID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("want 404, got %d", resp.StatusCode)
	}
}

// TestIntegration_AuthorCapture verifies that author_id is set to the session
// user, not hard-coded.
func TestIntegration_AuthorCapture(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	resp, err := putEntry(srv, tripID, dayID, map[string]any{})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	var out journalEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.AuthorID != ownerID {
		t.Errorf("author_id: got %q, want session user %q", out.AuthorID, ownerID)
	}
}

// TestIntegration_UnauthorizedUser_Denied verifies that a non-member is denied
// read and write access (→ 404 to avoid leaking trip existence).
func TestIntegration_UnauthorizedUser_Denied(t *testing.T) {
	ownerID := freshOwnerID(t)
	strangerID := freshOwnerID(t)

	// Build server authenticated as stranger, but authz only allows owner.
	srv := newIntegrationServerWithUser(t, strangerID, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	// PUT should be denied.
	putResp, err := putEntry(srv, tripID, dayID, map[string]any{})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	_ = putResp.Body.Close()
	if putResp.StatusCode != http.StatusNotFound {
		t.Errorf("put: want 404, got %d", putResp.StatusCode)
	}

	// GET should also be denied.
	getResp, err := getEntry(srv, tripID, dayID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	_ = getResp.Body.Close()
	if getResp.StatusCode != http.StatusNotFound {
		t.Errorf("get: want 404, got %d", getResp.StatusCode)
	}
}
