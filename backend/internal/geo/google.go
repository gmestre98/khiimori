package geo

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

// googleProvider implements MapProvider by calling the Google Maps REST APIs
// server-side. The Maps API key is held in memory only and never returned to
// callers — it is the caller's responsibility to ensure responses are not
// forwarded raw to browser clients.
//
// Uses net/http (stdlib) — no third-party Google Maps client library.
type googleProvider struct {
	apiKey     string
	httpClient *http.Client
	baseURL    string // overridable in tests to point at a fake server
}

// newGoogleProvider constructs a googleProvider. apiKey must be non-empty; it
// is the server-side restricted Maps API key from Secret Manager. An empty key
// is rejected here so callers get an early, clear error rather than a cryptic
// 403 from Google.
func newGoogleProvider(apiKey string, httpClient *http.Client) (*googleProvider, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("geo: Maps API key must not be empty")
	}
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	return &googleProvider{
		apiKey:     apiKey,
		httpClient: httpClient,
		baseURL:    "https://maps.googleapis.com",
	}, nil
}

// Geocode resolves location to coordinates via the Google Geocoding REST API.
func (g *googleProvider) Geocode(ctx context.Context, location string) (LatLng, error) {
	u := g.baseURL + "/maps/api/geocode/json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return LatLng{}, fmt.Errorf("geo: building geocode request: %w", err)
	}
	q := url.Values{}
	q.Set("address", location)
	q.Set("key", g.apiKey)
	req.URL.RawQuery = q.Encode()

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return LatLng{}, fmt.Errorf("geo: geocode request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return LatLng{}, fmt.Errorf("geo: geocode API status %d", resp.StatusCode)
	}

	var body struct {
		Status  string `json:"status"`
		Results []struct {
			Geometry struct {
				Location LatLng `json:"location"`
			} `json:"geometry"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return LatLng{}, fmt.Errorf("geo: decoding geocode response: %w", err)
	}
	if body.Status == "ZERO_RESULTS" || len(body.Results) == 0 {
		return LatLng{}, ErrNotFound
	}
	if body.Status != "OK" {
		return LatLng{}, fmt.Errorf("geo: geocode API status %q", body.Status)
	}
	return body.Results[0].Geometry.Location, nil
}

// RouteHints returns waypoints as-is for v1 (no reordering). The indicative
// route is drawn in itinerary order, so the caller already provides ordered
// waypoints. Future milestones may call the Directions API to snap points to
// roads.
func (g *googleProvider) RouteHints(_ context.Context, waypoints []LatLng) ([]LatLng, error) {
	out := make([]LatLng, len(waypoints))
	copy(out, waypoints)
	return out, nil
}

// Compile-time checks that *googleProvider satisfies both interfaces.
var _ Geocoder = (*googleProvider)(nil)
var _ MapProvider = (*googleProvider)(nil)
