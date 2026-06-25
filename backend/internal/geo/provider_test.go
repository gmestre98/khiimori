package geo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// fakeGeocoder is a test double that satisfies Geocoder.
type fakeGeocoder struct {
	result LatLng
	err    error
}

func (f *fakeGeocoder) Geocode(_ context.Context, _ string) (LatLng, error) {
	return f.result, f.err
}

// fakeMapProvider satisfies MapProvider for interface tests.
type fakeMapProvider struct {
	fakeGeocoder
}

func (f *fakeMapProvider) RouteHints(_ context.Context, waypoints []LatLng) ([]LatLng, error) {
	return waypoints, nil
}

func (f *fakeMapProvider) StaticMap(_ context.Context, _ StaticMapParams) ([]byte, error) {
	return []byte("fake-png"), nil
}

func TestInterfacesSatisfied(t *testing.T) {
	t.Parallel()
	var _ Geocoder = (*fakeGeocoder)(nil)
	var _ MapProvider = (*fakeMapProvider)(nil)
}

func TestNewGoogleProviderRejectsEmptyKey(t *testing.T) {
	t.Parallel()
	_, err := newGoogleProvider("", nil)
	if err == nil {
		t.Fatal("expected error for empty API key, got nil")
	}
}

func TestNewGoogleProviderAcceptsKey(t *testing.T) {
	t.Parallel()
	p, err := newGoogleProvider("test-key", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
}

func TestGoogleProviderGeocode(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Assert key is present in query, not exposed in response.
		if r.URL.Query().Get("key") == "" {
			http.Error(w, "missing key", http.StatusBadRequest)
			return
		}
		resp := map[string]any{
			"status": "OK",
			"results": []map[string]any{
				{"geometry": map[string]any{"location": map[string]any{"lat": 48.8566, "lng": 2.3522}}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	p, _ := newGoogleProvider("test-key", srv.Client())
	p.baseURL = srv.URL

	got, err := p.Geocode(context.Background(), "Paris, France")
	if err != nil {
		t.Fatalf("Geocode error: %v", err)
	}
	if got.Lat != 48.8566 || got.Lng != 2.3522 {
		t.Errorf("unexpected coords: %+v", got)
	}
}

func TestGoogleProviderGeocodeZeroResults(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := map[string]any{"status": "ZERO_RESULTS", "results": []any{}}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	p, _ := newGoogleProvider("test-key", srv.Client())
	p.baseURL = srv.URL

	_, err := p.Geocode(context.Background(), "xyzzy-nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestGoogleProviderRouteHints(t *testing.T) {
	t.Parallel()

	p, _ := newGoogleProvider("test-key", nil)
	waypoints := []LatLng{{Lat: 1, Lng: 2}, {Lat: 3, Lng: 4}}
	got, err := p.RouteHints(context.Background(), waypoints)
	if err != nil {
		t.Fatalf("RouteHints error: %v", err)
	}
	if len(got) != 2 || got[0] != waypoints[0] || got[1] != waypoints[1] {
		t.Errorf("unexpected route hints: %+v", got)
	}
}

func TestGoogleProviderStaticMap(t *testing.T) {
	t.Parallel()

	pngBytes := []byte("\x89PNG\r\n\x1a\n") // minimal PNG header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Key must be in query; must not appear in response.
		if r.URL.Query().Get("key") == "" {
			http.Error(w, "missing key", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(pngBytes)
	}))
	defer srv.Close()

	p, _ := newGoogleProvider("test-key", srv.Client())
	p.baseURL = srv.URL

	got, err := p.StaticMap(context.Background(), StaticMapParams{
		Size:    "600x300",
		Markers: []LatLng{{Lat: 48.8566, Lng: 2.3522}},
	})
	if err != nil {
		t.Fatalf("StaticMap error: %v", err)
	}
	if string(got) != string(pngBytes) {
		t.Errorf("unexpected image bytes")
	}
}
