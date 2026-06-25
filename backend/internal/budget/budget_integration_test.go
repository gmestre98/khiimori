//go:build integration

// Integration tests for budget line behaviour (M05.1 S3). They drive the full
// handler → store → DB path against a migrated budget.budget_lines schema.
//
// Gated behind the "integration" build tag. Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/budget/...
package budget

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

// newIntegrationServer wires a real Module and returns an httptest.Server.
// It truncates budget_lines, trip.days, trip.trips and sharing.trip_memberships
// so each test starts with a clean slate.
func newIntegrationServer(t *testing.T, ownerID string) *httptest.Server {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping budget integration test")
	}
	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`TRUNCATE budget.cost_entries, budget.budget_lines, trip.plan_items, trip.stays, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: ownerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	mod := New(testPool, requireAuth, alwaysAllowAuthz{}, noopCostReader{})
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// alwaysAllowAuthz always grants write access (tests pre-wire the correct tripID).
type alwaysAllowAuthz struct{}

func (alwaysAllowAuthz) CanRead(_ context.Context, _, _ string) (bool, error)  { return true, nil }
func (alwaysAllowAuthz) CanWrite(_ context.Context, _, _ string) (bool, error) { return true, nil }

// insertTrip inserts a minimal trip row and returns the trip id.
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
	// Insert sharing membership so the trip is visible.
	_, err = testPool.Exec(context.Background(), `
		INSERT INTO sharing.trip_memberships (trip_id, user_id, role)
		VALUES ($1::uuid, $2::uuid, 'owner')`, tripID, ownerID)
	if err != nil {
		t.Fatalf("insert membership: %v", err)
	}
	return tripID
}

// insertDay inserts a trip.days row for the given trip and returns the day id.
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

// freshOwnerID generates a random UUID to use as the owner.
// It skips the test when DATABASE_URL_TEST is unset (testPool == nil).
func freshOwnerID(t *testing.T) string {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping budget integration test")
	}
	var id string
	if err := testPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("generating owner id: %v", err)
	}
	return id
}

func putJSON(srv *httptest.Server, path string, body any) (*http.Response, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPut, srv.URL+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func TestIntegration_SetTripBudgetLine(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)

	resp, err := putJSON(srv, "/trips/"+tripID+"/budget-lines", map[string]any{
		"category":       "Food",
		"planned_amount": 300.00,
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var out budgetLineResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.TripID != tripID {
		t.Errorf("trip_id: got %q, want %q", out.TripID, tripID)
	}
	if out.DayID != "" {
		t.Errorf("expected empty day_id for trip-level, got %q", out.DayID)
	}
	if out.Category != "Food" {
		t.Errorf("category: got %q, want Food", out.Category)
	}
	if out.PlannedAmount != 300.00 {
		t.Errorf("planned_amount: got %f, want 300", out.PlannedAmount)
	}
}

func TestIntegration_SetDayBudgetLine(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	resp, err := putJSON(srv, "/trips/"+tripID+"/days/"+dayID+"/budget-lines", map[string]any{
		"category":       "Transport",
		"planned_amount": 50.00,
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var out budgetLineResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.DayID != dayID {
		t.Errorf("day_id: got %q, want %q", out.DayID, dayID)
	}
}

func TestIntegration_Upsert_UpdatesNotDuplicates(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)

	body := map[string]any{"category": "Activities", "planned_amount": 100.00}
	for range 2 {
		resp, err := putJSON(srv, "/trips/"+tripID+"/budget-lines", body)
		if err != nil {
			t.Fatalf("put: %v", err)
		}
		resp.Body.Close()
	}
	// Update with a new amount.
	body["planned_amount"] = 200.00
	resp, err := putJSON(srv, "/trips/"+tripID+"/budget-lines", body)
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	defer resp.Body.Close()

	var out budgetLineResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.PlannedAmount != 200.00 {
		t.Errorf("expected updated amount 200, got %f", out.PlannedAmount)
	}

	// Exactly one row.
	var count int
	if err := testPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM budget.budget_lines WHERE trip_id = $1::uuid AND category = 'Activities'`,
		tripID).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 budget line, got %d", count)
	}
}

func TestIntegration_InvalidCategory_Rejected(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)

	resp, err := putJSON(srv, "/trips/"+tripID+"/budget-lines", map[string]any{
		"category":       "Luxury",
		"planned_amount": 500.00,
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}
