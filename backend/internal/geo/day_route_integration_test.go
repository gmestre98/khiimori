//go:build integration

// Integration tests for the day-route endpoint + geocode cache (M07.2 S3).
// Tests run against a real migrated DB to verify:
//   - Route waypoints come back in itinerary order.
//   - Repeated geocoding of the same location hits the cache (not upstream).
//   - Location-less / unresolvable items are excluded from the route.
package geo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// TestDayRouteOrderIntegration verifies that /geo/day-route returns waypoints
// in the same order as the submitted locations, using the DB-backed cache.
func TestDayRouteOrderIntegration(t *testing.T) {
	if integTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	t.Parallel()

	locations := []string{"Tokyo, Japan", "Kyoto, Japan", "Osaka, Japan"}
	coords := []LatLng{
		{Lat: 35.6762, Lng: 139.6503},
		{Lat: 35.0116, Lng: 135.7681},
		{Lat: 34.6937, Lng: 135.5023},
	}

	// Pre-populate cache so we don't need a real Maps key.
	for i, loc := range locations {
		_, err := integTestPool.Exec(context.Background(),
			`INSERT INTO geo.geocode_cache (location, lat, lng, cached_at, expires_at)
			 VALUES ($1, $2, $3, now(), now() + interval '30 days')
			 ON CONFLICT (location) DO UPDATE
			   SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
			       cached_at = now(), expires_at = now() + interval '30 days'`,
			loc, coords[i].Lat, coords[i].Lng,
		)
		if err != nil {
			t.Fatalf("seed cache: %v", err)
		}
	}

	upstream := &countingGeocoder{inner: &fakeGeocoder{}} // should not be called
	gc := NewCachedGeocoder(integTestPool, upstream)
	m := New(&fakeMapProvider{}, gc, noopMiddleware)

	body, _ := json.Marshal(dayRouteRequest{Locations: locations})
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route", strings.NewReader(string(body)))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp dayRouteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Waypoints) != 3 {
		t.Fatalf("expected 3 waypoints, got %d", len(resp.Waypoints))
	}
	for i, want := range coords {
		got := resp.Waypoints[i]
		if got.Lat != want.Lat || got.Lng != want.Lng {
			t.Errorf("waypoint[%d]: want %+v, got %+v", i, want, got)
		}
	}
	if upstream.calls.Load() != 0 {
		t.Errorf("expected 0 upstream calls (all from cache), got %d", upstream.calls.Load())
	}
}

// TestDayRouteCacheHitViaEndpoint verifies the geocode cache is exercised
// end-to-end: the second call for the same location must not call upstream.
func TestDayRouteCacheHitViaEndpoint(t *testing.T) {
	if integTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	t.Parallel()

	location := "day-route-cache-hit-London-unique"
	_, _ = integTestPool.Exec(context.Background(),
		"DELETE FROM geo.geocode_cache WHERE location = $1", location)

	var calls atomic.Int64
	upstream := geocoderFunc(func(_ context.Context, _ string) (LatLng, error) {
		calls.Add(1)
		return LatLng{Lat: 51.5074, Lng: -0.1278}, nil
	})
	gc := NewCachedGeocoder(integTestPool, upstream)
	m := New(&fakeMapProvider{}, gc, noopMiddleware)

	makeBody := func() *strings.Reader {
		b, _ := json.Marshal(dayRouteRequest{Locations: []string{location}})
		return strings.NewReader(string(b))
	}

	w1 := httptest.NewRecorder()
	m.handleDayRoute(w1, httptest.NewRequest(http.MethodPost, "/geo/day-route", makeBody()))
	if w1.Code != http.StatusOK {
		t.Fatalf("first request: expected 200, got %d", w1.Code)
	}
	if calls.Load() != 1 {
		t.Errorf("expected 1 upstream call on miss, got %d", calls.Load())
	}

	w2 := httptest.NewRecorder()
	m.handleDayRoute(w2, httptest.NewRequest(http.MethodPost, "/geo/day-route", makeBody()))
	if w2.Code != http.StatusOK {
		t.Fatalf("second request: expected 200, got %d", w2.Code)
	}
	if calls.Load() != 1 {
		t.Errorf("expected still 1 upstream call on cache hit, got %d", calls.Load())
	}
}

// TestDayRouteExcludesLocationlessItems verifies empty strings and ErrNotFound
// locations come back as positional null slots while valid ones keep their index.
func TestDayRouteExcludesLocationlessItems(t *testing.T) {
	if integTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	t.Parallel()

	validLoc := "day-route-excl-valid-Rome-unique"
	_, _ = integTestPool.Exec(context.Background(),
		"DELETE FROM geo.geocode_cache WHERE location = $1", validLoc)

	upstream := geocoderFunc(func(_ context.Context, loc string) (LatLng, error) {
		if loc == "xyzzy-unresolvable-location-unique" {
			return LatLng{}, ErrNotFound
		}
		return LatLng{Lat: 41.9028, Lng: 12.4964}, nil
	})
	gc := NewCachedGeocoder(integTestPool, upstream)
	m := New(&fakeMapProvider{}, gc, noopMiddleware)

	body, _ := json.Marshal(dayRouteRequest{Locations: []string{
		"",                                   // empty → excluded
		validLoc,                             // valid → included
		"xyzzy-unresolvable-location-unique", // ErrNotFound → excluded
	}})
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route", strings.NewReader(string(body)))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp dayRouteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Positional: 3 slots for 3 inputs; empty + not-found are null, valid resolves.
	if len(resp.Waypoints) != 3 {
		t.Fatalf("expected 3 positional waypoints, got %d: %+v",
			len(resp.Waypoints), resp.Waypoints)
	}
	if resp.Waypoints[0] != nil || resp.Waypoints[2] != nil {
		t.Errorf("expected empty+not-found slots to be null, got %+v", resp.Waypoints)
	}
	if resp.Waypoints[1] == nil || resp.Waypoints[1].Lat != 41.9028 || resp.Waypoints[1].Lng != 12.4964 {
		t.Errorf("unexpected middle waypoint: %+v", resp.Waypoints[1])
	}
}
