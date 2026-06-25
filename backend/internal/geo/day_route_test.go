package geo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleDayRouteNoProvider(t *testing.T) {
	t.Parallel()
	m := New(nil, nil, noopMiddleware)
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route",
		strings.NewReader(`{"locations":["Paris"]}`))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}

func TestHandleDayRouteInvalidBody(t *testing.T) {
	t.Parallel()
	m := New(&fakeMapProvider{}, nil, noopMiddleware)
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route",
		strings.NewReader(`not-json`))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleDayRouteEmptyLocations(t *testing.T) {
	t.Parallel()
	m := New(&fakeMapProvider{}, nil, noopMiddleware)
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route",
		strings.NewReader(`{"locations":[]}`))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp dayRouteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Waypoints) != 0 {
		t.Errorf("expected empty waypoints, got %v", resp.Waypoints)
	}
}

func TestHandleDayRouteSkipsEmptyLocationStrings(t *testing.T) {
	t.Parallel()
	p := &fakeMapProvider{fakeGeocoder: fakeGeocoder{result: LatLng{Lat: 1, Lng: 2}}}
	m := New(p, nil, noopMiddleware)
	body := `{"locations":["", "Paris", ""]}`
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route", strings.NewReader(body))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp dayRouteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Waypoints) != 1 {
		t.Errorf("expected 1 waypoint (empty strings excluded), got %d", len(resp.Waypoints))
	}
}

func TestHandleDayRouteSkipsNotFoundLocations(t *testing.T) {
	t.Parallel()

	gc := unitGeocoder(func(_ context.Context, loc string) (LatLng, error) {
		if loc == "nowhere" {
			return LatLng{}, ErrNotFound
		}
		return LatLng{Lat: 48.8566, Lng: 2.3522}, nil
	})
	m := New(&fakeMapProvider{}, gc, noopMiddleware)

	body := `{"locations":["Paris", "nowhere", "Lyon"]}`
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route", strings.NewReader(body))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp dayRouteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Waypoints) != 2 {
		t.Errorf("expected 2 waypoints (ErrNotFound excluded), got %d", len(resp.Waypoints))
	}
}

func TestHandleDayRouteOrderPreserved(t *testing.T) {
	t.Parallel()

	gc := &orderedGeocoder{coords: []LatLng{
		{Lat: 1, Lng: 10},
		{Lat: 2, Lng: 20},
		{Lat: 3, Lng: 30},
	}}
	m := New(&fakeMapProvider{}, gc, noopMiddleware)

	body := `{"locations":["A","B","C"]}`
	req := httptest.NewRequest(http.MethodPost, "/geo/day-route", strings.NewReader(body))
	w := httptest.NewRecorder()
	m.handleDayRoute(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp dayRouteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Waypoints) != 3 {
		t.Fatalf("expected 3 waypoints, got %d", len(resp.Waypoints))
	}
	if resp.Waypoints[0].Lat != 1 || resp.Waypoints[1].Lat != 2 || resp.Waypoints[2].Lat != 3 {
		t.Errorf("waypoints not in itinerary order: %+v", resp.Waypoints)
	}
}

// unitGeocoder lets a plain function implement Geocoder in unit tests.
type unitGeocoder func(context.Context, string) (LatLng, error)

func (f unitGeocoder) Geocode(ctx context.Context, location string) (LatLng, error) {
	return f(ctx, location)
}

// orderedGeocoder returns coords in sequence regardless of location string.
type orderedGeocoder struct {
	coords []LatLng
	idx    int
}

func (o *orderedGeocoder) Geocode(_ context.Context, _ string) (LatLng, error) {
	ll := o.coords[o.idx]
	o.idx++
	return ll, nil
}
