package geo

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleGeocodeNoProvider(t *testing.T) {
	t.Parallel()
	m := New(nil, noopMiddleware)
	req := httptest.NewRequest(http.MethodGet, "/geo/geocode?location=Paris", nil)
	w := httptest.NewRecorder()
	m.handleGeocode(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}

func TestHandleGeocodeMissingLocation(t *testing.T) {
	t.Parallel()
	m := New(&fakeMapProvider{}, noopMiddleware)
	req := httptest.NewRequest(http.MethodGet, "/geo/geocode", nil)
	w := httptest.NewRecorder()
	m.handleGeocode(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandleGeocodeNotFound(t *testing.T) {
	t.Parallel()
	p := &fakeMapProvider{fakeGeocoder: fakeGeocoder{err: ErrNotFound}}
	m := New(p, noopMiddleware)
	req := httptest.NewRequest(http.MethodGet, "/geo/geocode?location=nowhere", nil)
	w := httptest.NewRecorder()
	m.handleGeocode(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestHandleGeocodeSuccess(t *testing.T) {
	t.Parallel()
	p := &fakeMapProvider{fakeGeocoder: fakeGeocoder{result: LatLng{Lat: 48.8566, Lng: 2.3522}}}
	m := New(p, noopMiddleware)
	req := httptest.NewRequest(http.MethodGet, "/geo/geocode?location=Paris", nil)
	w := httptest.NewRecorder()
	m.handleGeocode(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "48.8566") {
		t.Errorf("expected lat in body, got: %s", body)
	}
}

func TestHandleRouteHintsNoProvider(t *testing.T) {
	t.Parallel()
	m := New(nil, noopMiddleware)
	req := httptest.NewRequest(http.MethodPost, "/geo/route-hints",
		strings.NewReader(`{"waypoints":[]}`))
	w := httptest.NewRecorder()
	m.handleRouteHints(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}

func TestHandleRouteHintsSuccess(t *testing.T) {
	t.Parallel()
	m := New(&fakeMapProvider{}, noopMiddleware)
	body := `{"waypoints":[{"lat":1,"lng":2},{"lat":3,"lng":4}]}`
	req := httptest.NewRequest(http.MethodPost, "/geo/route-hints", strings.NewReader(body))
	w := httptest.NewRecorder()
	m.handleRouteHints(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	resp, _ := io.ReadAll(w.Body)
	if !strings.Contains(string(resp), `"lat":1`) {
		t.Errorf("unexpected body: %s", resp)
	}
}

// Ensure fakeMapProvider.RouteHints returns waypoints unchanged.
func TestFakeMapProviderRouteHints(t *testing.T) {
	t.Parallel()
	p := &fakeMapProvider{}
	wps := []LatLng{{Lat: 5, Lng: 6}}
	got, err := p.RouteHints(context.Background(), wps)
	if err != nil || len(got) != 1 || got[0] != wps[0] {
		t.Errorf("unexpected: %v %v", got, err)
	}
}
