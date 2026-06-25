//go:build integration

// Integration tests for the geocode cache (M07.2 S2). They run against a real
// migrated database (geo.geocode_cache table) to verify cache hit/miss semantics:
// a repeated geocode request must not call the upstream provider a second time.
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/geo/...
package geo

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/migrations"
)

// integTestPool is shared across all geo integration tests.
var integTestPool *pgxpool.Pool

func TestMain(m *testing.M) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		os.Exit(m.Run()) // no DB: unit tests still run, integration tests skip
	}

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "geo integration setup: open database: %v\n", err)
		os.Exit(1)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		fmt.Fprintf(os.Stderr, "geo integration setup: set dialect: %v\n", err)
		os.Exit(1)
	}
	if err := goose.Up(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "geo integration setup: migrate up: %v\n", err)
		os.Exit(1)
	}

	integTestPool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "geo integration setup: open pool: %v\n", err)
		os.Exit(1)
	}
	defer integTestPool.Close()

	code := m.Run()

	if err := goose.Down(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "geo integration teardown: migrate down: %v\n", err)
	}
	os.Exit(code)
}

// countingGeocoder wraps a fakeGeocoder and counts upstream calls.
type countingGeocoder struct {
	inner Geocoder
	calls atomic.Int64
}

func (c *countingGeocoder) Geocode(ctx context.Context, location string) (LatLng, error) {
	c.calls.Add(1)
	return c.inner.Geocode(ctx, location)
}

// TestGeocacheMiss verifies that a fresh location reaches the upstream provider.
func TestGeocacheMiss(t *testing.T) {
	if integTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	t.Parallel()

	upstream := &countingGeocoder{inner: &fakeGeocoder{result: LatLng{Lat: 48.8566, Lng: 2.3522}}}
	gc := NewCachedGeocoder(integTestPool, upstream)

	// Clean slate for this test.
	location := "geo-cache-miss-test-Paris"
	_, _ = integTestPool.Exec(context.Background(),
		"DELETE FROM geo.geocode_cache WHERE location = $1", location)

	got, err := gc.Geocode(context.Background(), location)
	if err != nil {
		t.Fatalf("Geocode error: %v", err)
	}
	if got.Lat != 48.8566 || got.Lng != 2.3522 {
		t.Errorf("unexpected coords: %+v", got)
	}
	if upstream.calls.Load() != 1 {
		t.Errorf("expected 1 upstream call on miss, got %d", upstream.calls.Load())
	}
}

// TestGeocacheHit verifies that a repeated location does not call upstream again.
func TestGeocacheHit(t *testing.T) {
	if integTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	t.Parallel()

	upstream := &countingGeocoder{inner: &fakeGeocoder{result: LatLng{Lat: 48.8566, Lng: 2.3522}}}
	gc := NewCachedGeocoder(integTestPool, upstream)

	location := "geo-cache-hit-test-Paris"
	// Clean slate.
	_, _ = integTestPool.Exec(context.Background(),
		"DELETE FROM geo.geocode_cache WHERE location = $1", location)

	// First call: miss — stores in cache.
	_, err := gc.Geocode(context.Background(), location)
	if err != nil {
		t.Fatalf("first Geocode error: %v", err)
	}
	if upstream.calls.Load() != 1 {
		t.Errorf("expected 1 upstream call after first geocode, got %d", upstream.calls.Load())
	}

	// Second call: must be a cache hit — upstream NOT called again.
	got, err := gc.Geocode(context.Background(), location)
	if err != nil {
		t.Fatalf("second Geocode error: %v", err)
	}
	if got.Lat != 48.8566 || got.Lng != 2.3522 {
		t.Errorf("cached coords wrong: %+v", got)
	}
	if upstream.calls.Load() != 1 {
		t.Errorf("expected still 1 upstream call on cache hit, got %d", upstream.calls.Load())
	}
}

// TestGeocacheNotFoundNotCached verifies that ErrNotFound is not cached so a
// corrected location can succeed on a subsequent call.
func TestGeocacheNotFoundNotCached(t *testing.T) {
	if integTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	t.Parallel()

	location := "geo-cache-notfound-test-xyzzy"
	_, _ = integTestPool.Exec(context.Background(),
		"DELETE FROM geo.geocode_cache WHERE location = $1", location)

	calls := &atomic.Int64{}
	callNum := 0
	upstream := geocoderFunc(func(_ context.Context, _ string) (LatLng, error) {
		calls.Add(1)
		callNum++
		if callNum == 1 {
			return LatLng{}, ErrNotFound
		}
		return LatLng{Lat: 1, Lng: 2}, nil
	})
	gc := NewCachedGeocoder(integTestPool, upstream)

	// First call: upstream returns ErrNotFound — must NOT be cached.
	_, err := gc.Geocode(context.Background(), location)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}

	// Second call: upstream now succeeds — must not be blocked by a cached error.
	got, err := gc.Geocode(context.Background(), location)
	if err != nil {
		t.Fatalf("second Geocode error: %v", err)
	}
	if got.Lat != 1 || got.Lng != 2 {
		t.Errorf("unexpected coords: %+v", got)
	}
	if calls.Load() != 2 {
		t.Errorf("expected 2 upstream calls (ErrNotFound not cached), got %d", calls.Load())
	}
}

// geocoderFunc lets a plain function implement Geocoder in tests.
type geocoderFunc func(context.Context, string) (LatLng, error)

func (f geocoderFunc) Geocode(ctx context.Context, location string) (LatLng, error) {
	return f(ctx, location)
}
