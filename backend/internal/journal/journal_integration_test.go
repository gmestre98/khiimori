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
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
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
		`TRUNCATE journal.photos, journal.journal_entries, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: ownerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	mod := New(testPool, requireAuth, alwaysAllowIntegrationAuthz{}, newFakeMediaStore())
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
		`TRUNCATE journal.photos, journal.journal_entries, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
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
	mod := New(testPool, requireAuth, &membershipAuthz{pool: testPool, ownerID: ownerID}, newFakeMediaStore())
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

// --- photo integration tests ---

func uploadPhotoIntegration(srv *httptest.Server, tripID, dayID string, imageBytes []byte, mimeType, caption string) (*http.Response, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="photo"; filename="test.jpg"`)
	h.Set("Content-Type", mimeType)
	part, err := mw.CreatePart(h)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(imageBytes); err != nil {
		return nil, err
	}
	if caption != "" {
		if err := mw.WriteField("caption", caption); err != nil {
			return nil, err
		}
	}
	_ = mw.Close()

	req, err := http.NewRequest(http.MethodPost,
		srv.URL+fmt.Sprintf("/trips/%s/days/%s/journal/photos", tripID, dayID), &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return http.DefaultClient.Do(req)
}

func listPhotosIntegration(srv *httptest.Server, tripID, dayID string) (*http.Response, error) {
	return http.Get(srv.URL + fmt.Sprintf("/trips/%s/days/%s/journal/photos", tripID, dayID))
}

// TestIntegration_UploadPhoto_AttachesToEntry verifies a photo upload inserts a row
// in journal.photos and returns 201 with the stored URL and caption.
func TestIntegration_UploadPhoto_AttachesToEntry(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	// Create the entry first.
	putResp, err := putEntry(srv, tripID, dayID, map[string]any{
		"body": json.RawMessage(`{"text":"day one"}`),
	})
	if err != nil {
		t.Fatalf("put entry: %v", err)
	}
	_ = putResp.Body.Close()

	fakeImage := bytes.Repeat([]byte("X"), 1024) // 1 KB fake JPEG
	resp, err := uploadPhotoIntegration(srv, tripID, dayID, fakeImage, "image/jpeg", "lovely sunset")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("want 201, got %d", resp.StatusCode)
	}

	var out photoResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Caption != "lovely sunset" {
		t.Errorf("caption: got %q", out.Caption)
	}
	if out.StorageURL == "" {
		t.Error("storage_url is empty")
	}
	if out.SizeBytes != 1024 {
		t.Errorf("size_bytes: got %d, want 1024", out.SizeBytes)
	}

	// Verify a row exists in journal.photos.
	var count int
	if err := testPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM journal.photos WHERE journal_entry_id = $1::uuid`, out.JournalEntryID,
	).Scan(&count); err != nil {
		t.Fatalf("count photos: %v", err)
	}
	if count != 1 {
		t.Errorf("want 1 photo row, got %d", count)
	}
}

// TestIntegration_ListPhotos_ReturnsAttached verifies GET photos returns all
// photos attached to the entry in order.
func TestIntegration_ListPhotos_ReturnsAttached(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	putResp, _ := putEntry(srv, tripID, dayID, map[string]any{})
	_ = putResp.Body.Close()

	fakeImage := bytes.Repeat([]byte("Y"), 512)
	for _, caption := range []string{"first", "second"} {
		r, err := uploadPhotoIntegration(srv, tripID, dayID, fakeImage, "image/jpeg", caption)
		if err != nil {
			t.Fatalf("upload %q: %v", caption, err)
		}
		_ = r.Body.Close()
	}

	resp, err := listPhotosIntegration(srv, tripID, dayID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}

	var photos []photoResponse
	if err := json.NewDecoder(resp.Body).Decode(&photos); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(photos) != 2 {
		t.Fatalf("want 2 photos, got %d", len(photos))
	}
	if photos[0].Caption != "first" {
		t.Errorf("first caption: got %q", photos[0].Caption)
	}
	if photos[1].Caption != "second" {
		t.Errorf("second caption: got %q", photos[1].Caption)
	}
}

// newIntegrationServerWithCap constructs an integration server with a custom quota cap.
func newIntegrationServerWithCap(t *testing.T, ownerID string, cap int64) (*httptest.Server, *fakeMediaStore) {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping journal integration test")
	}
	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`TRUNCATE journal.photos, journal.journal_entries, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: ownerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	ms := newFakeMediaStore()
	mod := New(testPool, requireAuth, alwaysAllowIntegrationAuthz{}, ms)
	mod.quotaCap = cap
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, ms
}

// getUsageIntegration calls GET /trips/{tripID}/usage and returns the response.
func getUsageIntegration(srv *httptest.Server, tripID string) (*http.Response, error) {
	return http.Get(srv.URL + fmt.Sprintf("/trips/%s/usage", tripID))
}

// deletePhotoIntegration calls DELETE /trips/{tripID}/days/{dayID}/journal/photos/{photoID}.
func deletePhotoIntegration(srv *httptest.Server, tripID, dayID, photoID string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodDelete,
		srv.URL+fmt.Sprintf("/trips/%s/days/%s/journal/photos/%s", tripID, dayID, photoID), nil)
	if err != nil {
		return nil, err
	}
	return http.DefaultClient.Do(req)
}

// TestIntegration_UploadPhoto_NoEntry verifies 404 when entry doesn't exist.
func TestIntegration_UploadPhoto_NoEntry(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newIntegrationServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	fakeImage := bytes.Repeat([]byte("Z"), 512)
	resp, err := uploadPhotoIntegration(srv, tripID, dayID, fakeImage, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("want 404, got %d", resp.StatusCode)
	}
}

// --- M06.3 quota and thumbnail integration tests ---

// TestIntegration_Cap_UnderCap_Allowed verifies upload succeeds when below the cap.
func TestIntegration_Cap_UnderCap_Allowed(t *testing.T) {
	ownerID := freshOwnerID(t)
	const cap = 10 << 10 // 10 KB cap for this test
	srv, _ := newIntegrationServerWithCap(t, ownerID, cap)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	putResp, _ := putEntry(srv, tripID, dayID, map[string]any{})
	_ = putResp.Body.Close()

	img := bytes.Repeat([]byte("X"), 512) // 512 bytes < 10 KB cap
	resp, err := uploadPhotoIntegration(srv, tripID, dayID, img, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("want 201, got %d", resp.StatusCode)
	}
}

// TestIntegration_Cap_OverCap_Rejected verifies an over-cap upload is rejected with 413
// and nothing is stored (no row, no usage change).
func TestIntegration_Cap_OverCap_Rejected(t *testing.T) {
	ownerID := freshOwnerID(t)
	const cap = 512 // 512-byte cap
	srv, ms := newIntegrationServerWithCap(t, ownerID, cap)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	putResp, _ := putEntry(srv, tripID, dayID, map[string]any{})
	_ = putResp.Body.Close()

	img := bytes.Repeat([]byte("X"), 600) // 600 bytes > 512-byte cap
	resp, err := uploadPhotoIntegration(srv, tripID, dayID, img, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("want 413, got %d", resp.StatusCode)
	}

	// No object stored.
	if len(ms.objects) != 0 {
		t.Errorf("expected 0 objects stored on over-cap rejection, got %d", len(ms.objects))
	}

	// No row in DB.
	var count int
	if err := testPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM journal.photos`).Scan(&count); err != nil {
		t.Fatalf("count photos: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 photo rows on over-cap rejection, got %d", count)
	}

	// Usage unchanged at 0.
	usageResp, err := getUsageIntegration(srv, tripID)
	if err != nil {
		t.Fatalf("get usage: %v", err)
	}
	defer func() { _ = usageResp.Body.Close() }()
	var usage usageResponse
	if err := json.NewDecoder(usageResp.Body).Decode(&usage); err != nil {
		t.Fatalf("decode usage: %v", err)
	}
	if usage.UsedBytes != 0 {
		t.Errorf("usage: got %d, want 0 after rejected upload", usage.UsedBytes)
	}
}

// TestIntegration_Usage_IncrementOnAdd verifies TripUsageBytes increases after upload.
func TestIntegration_Usage_IncrementOnAdd(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv, _ := newIntegrationServerWithCap(t, ownerID, DefaultQuotaCap)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	putResp, _ := putEntry(srv, tripID, dayID, map[string]any{})
	_ = putResp.Body.Close()

	imgSize := 1024
	img := bytes.Repeat([]byte("X"), imgSize)
	uploadResp, err := uploadPhotoIntegration(srv, tripID, dayID, img, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	_ = uploadResp.Body.Close()
	if uploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("want 201, got %d", uploadResp.StatusCode)
	}

	usageResp, err := getUsageIntegration(srv, tripID)
	if err != nil {
		t.Fatalf("get usage: %v", err)
	}
	defer func() { _ = usageResp.Body.Close() }()
	var usage usageResponse
	if err := json.NewDecoder(usageResp.Body).Decode(&usage); err != nil {
		t.Fatalf("decode usage: %v", err)
	}
	if usage.UsedBytes != int64(imgSize) {
		t.Errorf("usage: got %d, want %d", usage.UsedBytes, imgSize)
	}
}

// TestIntegration_Usage_DecrementOnDelete verifies usage decrements after photo deletion.
func TestIntegration_Usage_DecrementOnDelete(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv, _ := newIntegrationServerWithCap(t, ownerID, DefaultQuotaCap)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	putResp, _ := putEntry(srv, tripID, dayID, map[string]any{})
	_ = putResp.Body.Close()

	img := bytes.Repeat([]byte("X"), 1024)
	uploadResp, err := uploadPhotoIntegration(srv, tripID, dayID, img, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	var uploaded photoResponse
	if err := json.NewDecoder(uploadResp.Body).Decode(&uploaded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	_ = uploadResp.Body.Close()

	// Usage should be 1024.
	usageResp1, _ := getUsageIntegration(srv, tripID)
	var usage1 usageResponse
	if err := json.NewDecoder(usageResp1.Body).Decode(&usage1); err != nil {
		t.Fatalf("decode usage before delete: %v", err)
	}
	_ = usageResp1.Body.Close()
	if usage1.UsedBytes != 1024 {
		t.Fatalf("before delete usage: got %d, want 1024", usage1.UsedBytes)
	}

	// Delete the photo.
	delResp, err := deletePhotoIntegration(srv, tripID, dayID, uploaded.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	_ = delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Fatalf("want 204, got %d", delResp.StatusCode)
	}

	// Usage should now be 0.
	usageResp2, _ := getUsageIntegration(srv, tripID)
	var usage2 usageResponse
	if err := json.NewDecoder(usageResp2.Body).Decode(&usage2); err != nil {
		t.Fatalf("decode usage after delete: %v", err)
	}
	_ = usageResp2.Body.Close()
	if usage2.UsedBytes != 0 {
		t.Errorf("after delete usage: got %d, want 0", usage2.UsedBytes)
	}
}

// TestIntegration_Thumbnail_Generated verifies a real JPEG upload produces a thumbnail_url.
func TestIntegration_Thumbnail_Generated(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv, ms := newIntegrationServerWithCap(t, ownerID, DefaultQuotaCap)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	putResp, _ := putEntry(srv, tripID, dayID, map[string]any{})
	_ = putResp.Body.Close()

	// Use a real JPEG so thumbnail generation can decode it.
	realJPEG := makeTestJPEG(t, 640, 480)
	uploadResp, err := uploadPhotoIntegration(srv, tripID, dayID, realJPEG, "image/jpeg", "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	var uploaded photoResponse
	if err := json.NewDecoder(uploadResp.Body).Decode(&uploaded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	_ = uploadResp.Body.Close()
	if uploadResp.StatusCode != http.StatusCreated {
		t.Fatalf("want 201, got %d", uploadResp.StatusCode)
	}

	// thumbnail_url should be populated.
	if uploaded.ThumbnailURL == "" {
		t.Error("thumbnail_url is empty: expected thumbnail to be generated")
	}

	// Two objects should exist: original + thumbnail.
	if len(ms.objects) != 2 {
		t.Errorf("expected 2 objects (original + thumbnail), got %d", len(ms.objects))
	}

	// thumbnail_url should be stored in DB.
	var thumbURL string
	err = testPool.QueryRow(context.Background(),
		`SELECT COALESCE(thumbnail_url, '') FROM journal.photos WHERE id = $1::uuid`,
		uploaded.ID).Scan(&thumbURL)
	if err != nil {
		t.Fatalf("query thumbnail_url: %v", err)
	}
	if thumbURL == "" {
		t.Error("thumbnail_url not persisted in DB")
	}
}
