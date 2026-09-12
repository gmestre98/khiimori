//go:build integration

// Integration tests for the packing list (items + templates). They drive the
// full handler → store → DB path against the migrated packing schema.
//
// Gated behind the "integration" build tag. Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/packing/...
package packing

import (
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

// freshUUID generates a random UUID and skips when DATABASE_URL_TEST is unset.
func freshUUID(t *testing.T) string {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping packing integration test")
	}
	var id string
	if err := testPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("generating uuid: %v", err)
	}
	return id
}

// integMembershipAuthz checks sharing.trip_memberships (owner-only, mirroring the
// deployed authz for these tests).
type integMembershipAuthz struct{ pool *pgxpool.Pool }

func (a integMembershipAuthz) CanRead(ctx context.Context, userID, tripID string) (bool, error) {
	return a.member(ctx, userID, tripID)
}
func (a integMembershipAuthz) CanWrite(ctx context.Context, userID, tripID string) (bool, error) {
	return a.member(ctx, userID, tripID)
}
func (a integMembershipAuthz) member(ctx context.Context, userID, tripID string) (bool, error) {
	const q = `SELECT 1 FROM sharing.trip_memberships
	           WHERE trip_id = $1::uuid AND user_id = $2::uuid AND role = 'owner'`
	var dummy int
	if err := a.pool.QueryRow(ctx, q, tripID, userID).Scan(&dummy); err != nil {
		return false, nil //nolint:nilerr
	}
	return true, nil
}

// newIntegServer wires a real Module backed by the test pool, authenticated as
// callerID, with membership-based authz. It truncates the packing/trip tables so
// each test starts clean.
func newIntegServer(t *testing.T, callerID string) *httptest.Server {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping packing integration test")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE packing.template_items, packing.templates, packing.items, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: callerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
	mod := New(testPool, requireAuth, integMembershipAuthz{pool: testPool})
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
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

func TestIntegration_Items_CRUDAndOrdering(t *testing.T) {
	ownerID := freshUUID(t)
	srv := newIntegServer(t, ownerID)
	tripID := insertTrip(t, ownerID)

	// Create two items — they should get increasing positions.
	var ids []string
	for _, label := range []string{"Steel-toe boots", "Ear protection"} {
		resp := do(t, http.MethodPost, srv.URL+"/trips/"+tripID+"/packing", map[string]any{
			"category": "Safety gear", "label": label, "quantity": 1,
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("create %q: want 201, got %d", label, resp.StatusCode)
		}
		var it itemResponse
		_ = json.NewDecoder(resp.Body).Decode(&it)
		_ = resp.Body.Close()
		ids = append(ids, it.ID)
	}

	// List returns them in position order.
	resp := do(t, http.MethodGet, srv.URL+"/trips/"+tripID+"/packing", nil)
	var list []itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()
	if len(list) != 2 {
		t.Fatalf("list: want 2, got %d", len(list))
	}
	if list[0].Label != "Steel-toe boots" || list[1].Label != "Ear protection" {
		t.Fatalf("ordering wrong: %+v", list)
	}
	if !(list[0].Position < list[1].Position) {
		t.Fatalf("positions not increasing: %d, %d", list[0].Position, list[1].Position)
	}

	// Toggle packed on the first item; label is preserved.
	resp = do(t, http.MethodPatch, srv.URL+"/trips/"+tripID+"/packing/"+ids[0], map[string]any{"packed": true})
	var updated itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&updated)
	_ = resp.Body.Close()
	if !updated.Packed || updated.Label != "Steel-toe boots" {
		t.Fatalf("toggle packed: %+v", updated)
	}

	// Delete the second item.
	resp = do(t, http.MethodDelete, srv.URL+"/trips/"+tripID+"/packing/"+ids[1], nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	resp = do(t, http.MethodGet, srv.URL+"/trips/"+tripID+"/packing", nil)
	list = nil
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()
	if len(list) != 1 {
		t.Fatalf("after delete: want 1, got %d", len(list))
	}
}

func TestIntegration_Templates_SnapshotAndApply(t *testing.T) {
	ownerID := freshUUID(t)
	srv := newIntegServer(t, ownerID)
	tripA := insertTrip(t, ownerID)
	tripB := insertTrip(t, ownerID)

	// Seed tripA with items.
	for _, label := range []string{"Gloves", "Helmet", "Hi-vis vest"} {
		resp := do(t, http.MethodPost, srv.URL+"/trips/"+tripA+"/packing", map[string]any{
			"category": "Safety gear", "label": label,
		})
		_ = resp.Body.Close()
	}

	// Save tripA's list as a template.
	resp := do(t, http.MethodPost, srv.URL+"/packing/templates", map[string]any{
		"name": "Iron-ore train kit", "from_trip_id": tripA,
	})
	var tmpl templateResponse
	_ = json.NewDecoder(resp.Body).Decode(&tmpl)
	_ = resp.Body.Close()
	if tmpl.ItemCount != 3 {
		t.Fatalf("template item_count: want 3, got %d", tmpl.ItemCount)
	}

	// Fetch it back with items.
	resp = do(t, http.MethodGet, srv.URL+"/packing/templates/"+tmpl.ID, nil)
	var detail templateDetailResponse
	_ = json.NewDecoder(resp.Body).Decode(&detail)
	_ = resp.Body.Close()
	if len(detail.Items) != 3 {
		t.Fatalf("template detail: want 3 items, got %d", len(detail.Items))
	}

	// Apply to tripB.
	resp = do(t, http.MethodPost, srv.URL+"/trips/"+tripB+"/packing/apply-template", map[string]any{
		"template_id": tmpl.ID,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("apply: want 201, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	resp = do(t, http.MethodGet, srv.URL+"/trips/"+tripB+"/packing", nil)
	var list []itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()
	if len(list) != 3 {
		t.Fatalf("tripB after apply: want 3, got %d", len(list))
	}
}

// TestIntegration_Templates_OwnerScoped verifies a template created by one user is
// invisible to another (404 on get/apply).
func TestIntegration_Templates_OwnerScoped(t *testing.T) {
	ownerID := freshUUID(t)
	srv := newIntegServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	resp := do(t, http.MethodPost, srv.URL+"/packing/templates", map[string]any{"name": "Mine"})
	var tmpl templateResponse
	_ = json.NewDecoder(resp.Body).Decode(&tmpl)
	_ = resp.Body.Close()

	// A different caller (no membership, different id) cannot see the template.
	otherID := freshUUID(t)
	otherReq := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: otherID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
	mod := New(testPool, otherReq, integMembershipAuthz{pool: testPool})
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	otherSrv := httptest.NewServer(mux)
	t.Cleanup(otherSrv.Close)

	resp = do(t, http.MethodGet, otherSrv.URL+"/packing/templates/"+tmpl.ID, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("other user get template: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// And cannot write to a trip they're not a member of.
	resp = do(t, http.MethodPost, otherSrv.URL+"/trips/"+tripID+"/packing", map[string]any{"label": "Sneaky"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("other user write: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}
