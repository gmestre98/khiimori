package geo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// sentinel is the recognisable Maps API key used in key-leak tests. Any
// occurrence of this string in a client-visible response is a test failure.
const sentinel = "SENTINEL_MAPS_API_KEY_MUST_NOT_LEAK"

// assertNoKeyInBody fails the test if the sentinel appears anywhere in body.
func assertNoKeyInBody(t *testing.T, body string) {
	t.Helper()
	if strings.Contains(body, sentinel) {
		t.Errorf("Maps API key leaked into response body: %q", body)
	}
}

// newSentinelProvider returns a googleProvider backed by a fake HTTP server
// that records whether the key was present in the incoming request URL. The
// server returns valid-looking responses so the handlers reach their happy
// path. Callers must call srv.Close().
func newSentinelProvider(t *testing.T) (*googleProvider, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The key must be in the query (proves the provider sends it to Google)
		// but it is the server's job not to echo it back.
		if r.URL.Query().Get("key") != sentinel {
			http.Error(w, "test: key missing from upstream request", http.StatusBadRequest)
			return
		}
		// Return a response that looks like a Google API but contains only safe
		// data — never the key.
		switch {
		case strings.Contains(r.URL.Path, "geocode"):
			resp := map[string]any{
				"status": "OK",
				"results": []map[string]any{
					{"geometry": map[string]any{"location": map[string]any{"lat": 1.0, "lng": 2.0}}},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
		case strings.Contains(r.URL.Path, "staticmap"):
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("PNG"))
		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	}))
	p, err := newGoogleProvider(sentinel, srv.Client())
	if err != nil {
		t.Fatalf("newGoogleProvider: %v", err)
	}
	p.baseURL = srv.URL
	return p, srv
}

// TestKeyNeverLeaksInGeocodeResponse asserts the Maps API key does not appear
// in the /geo/geocode response body on both success and error paths.
func TestKeyNeverLeaksInGeocodeResponse(t *testing.T) {
	t.Parallel()

	t.Run("success path", func(t *testing.T) {
		t.Parallel()
		p, srv := newSentinelProvider(t)
		defer srv.Close()
		m := New(p, nil, noopMiddleware)

		req := httptest.NewRequest(http.MethodGet, "/geo/geocode?location=Paris", nil)
		w := httptest.NewRecorder()
		m.handleGeocode(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		assertNoKeyInBody(t, w.Body.String())
	})

	t.Run("error path — upstream failure", func(t *testing.T) {
		t.Parallel()
		// Use a provider that always returns an error containing the sentinel
		// to verify the handler strips it before writing the response.
		badProvider := &errorMapProvider{msg: "upstream error: key=" + sentinel}
		m := New(badProvider, nil, noopMiddleware)

		req := httptest.NewRequest(http.MethodGet, "/geo/geocode?location=Paris", nil)
		w := httptest.NewRecorder()
		m.handleGeocode(w, req)

		if w.Code != http.StatusBadGateway {
			t.Fatalf("expected 502, got %d", w.Code)
		}
		assertNoKeyInBody(t, w.Body.String())
	})
}

// TestKeyNeverLeaksInStaticMapResponse asserts the Maps API key does not appear
// in the /geo/static-map response (which is image bytes, not JSON).
func TestKeyNeverLeaksInStaticMapResponse(t *testing.T) {
	t.Parallel()

	p, srv := newSentinelProvider(t)
	defer srv.Close()
	m := New(p, nil, noopMiddleware)

	req := httptest.NewRequest(http.MethodGet,
		"/geo/static-map?size=300x150&markers=1.0,2.0", nil)
	w := httptest.NewRecorder()
	m.handleStaticMap(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	assertNoKeyInBody(t, w.Body.String())
}

// TestKeyNeverLeaksInRouteHintsResponse asserts the Maps API key does not
// appear in the /geo/route-hints response.
func TestKeyNeverLeaksInRouteHintsResponse(t *testing.T) {
	t.Parallel()

	p, srv := newSentinelProvider(t)
	defer srv.Close()
	m := New(p, nil, noopMiddleware)

	body := `{"waypoints":[{"lat":1,"lng":2}]}`
	req := httptest.NewRequest(http.MethodPost, "/geo/route-hints",
		strings.NewReader(body))
	w := httptest.NewRecorder()
	m.handleRouteHints(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	assertNoKeyInBody(t, w.Body.String())
}

// TestProviderInterfaceCannotReturnKey asserts that a provider (faked) cannot
// be made to echo the key back through the handler.
func TestProviderInterfaceCannotReturnKey(t *testing.T) {
	t.Parallel()

	// A provider whose responses embed the sentinel — representing a worst-case
	// buggy provider. The proxy boundary (handler) must not forward raw provider
	// output to the client verbatim when it includes the key.
	//
	// Note: RouteHints returns raw waypoints (LatLng structs) — there is no
	// string field for the key to appear in. Geocode and StaticMap similarly
	// only expose typed structs / binary bytes, so the key cannot appear by
	// construction unless the handler erroneously logs it. This test confirms the
	// handler's generic error message path strips provider error strings.
	badProvider := &errorMapProvider{msg: "geocode failed: url contains key=" + sentinel}
	m := New(badProvider, nil, noopMiddleware)

	req := httptest.NewRequest(http.MethodGet, "/geo/geocode?location=Paris", nil)
	w := httptest.NewRecorder()
	m.handleGeocode(w, req)

	assertNoKeyInBody(t, w.Body.String())
	if strings.Contains(w.Body.String(), sentinel) {
		t.Errorf("provider error string leaked into response")
	}
}

// TestGoogleProviderKeyNotInResponse verifies the googleProvider sends the key
// to Google but the returned bytes contain no key string.
func TestGoogleProviderKeyNotInResponse(t *testing.T) {
	t.Parallel()

	p, srv := newSentinelProvider(t)
	defer srv.Close()

	coords, err := p.Geocode(context.Background(), "Paris")
	if err != nil {
		t.Fatalf("Geocode: %v", err)
	}
	// The LatLng struct has no string fields — it cannot contain the key.
	if coords.Lat == 0 && coords.Lng == 0 {
		t.Error("got zero coords from fake server")
	}

	imgBytes, err := p.StaticMap(context.Background(), StaticMapParams{Size: "1x1"})
	if err != nil {
		t.Fatalf("StaticMap: %v", err)
	}
	if strings.Contains(string(imgBytes), sentinel) {
		t.Error("sentinel key found in StaticMap image bytes")
	}
}

// errorMapProvider is a MapProvider that always returns errors whose message
// may contain the sentinel key — used to test the proxy boundary.
type errorMapProvider struct {
	msg string
}

func (e *errorMapProvider) Geocode(_ context.Context, _ string) (LatLng, error) {
	return LatLng{}, &proxyError{msg: e.msg}
}

func (e *errorMapProvider) RouteHints(_ context.Context, waypoints []LatLng) ([]LatLng, error) {
	return waypoints, nil
}

func (e *errorMapProvider) StaticMap(_ context.Context, _ StaticMapParams) ([]byte, error) {
	return nil, &proxyError{msg: e.msg}
}

// proxyError is a test error type whose message may contain a sensitive string.
type proxyError struct{ msg string }

func (e *proxyError) Error() string { return e.msg }
