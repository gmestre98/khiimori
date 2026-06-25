package geo

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// handleGeocode proxies a geocoding request: GET /geo/geocode?location=<address>
//
// The Maps API key is never included in the response — only the resolved LatLng
// is returned to the client.
func (m *Module) handleGeocode(w http.ResponseWriter, r *http.Request) {
	if m.geocoder == nil {
		http.Error(w, "geo proxy not configured", http.StatusServiceUnavailable)
		return
	}

	location := r.URL.Query().Get("location")
	if location == "" {
		http.Error(w, "location query parameter is required", http.StatusBadRequest)
		return
	}

	coords, err := m.geocoder.Geocode(r.Context(), location)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			http.Error(w, "location not found", http.StatusNotFound)
			return
		}
		// Return a generic error; the provider's error (which may reference
		// internal URLs) is intentionally not forwarded to the client.
		http.Error(w, "geocoding failed", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(coords)
}

// handleStaticMap proxies a Google Static Maps image: GET /geo/static-map
//
// Query parameters (all optional):
//
//	size    — "WxH" image dimensions, e.g. "600x300" (default)
//	scale   — pixel density multiplier: 1 (default) or 2
//	markers — repeated: "lat,lng" for each itinerary pin
//	path    — repeated: "lat,lng" for the indicative route waypoints
//
// Returns a PNG image. The Maps API key is embedded server-side and is never
// included in the response body or headers.
func (m *Module) handleStaticMap(w http.ResponseWriter, r *http.Request) {
	if m.provider == nil {
		http.Error(w, "geo proxy not configured", http.StatusServiceUnavailable)
		return
	}

	q := r.URL.Query()
	params := StaticMapParams{
		Size: q.Get("size"),
	}
	if s := q.Get("scale"); s == "2" {
		params.Scale = 2
	}
	for _, raw := range q["markers"] {
		if ll, ok := parseLatLng(raw); ok {
			params.Markers = append(params.Markers, ll)
		}
	}
	for _, raw := range q["path"] {
		if ll, ok := parseLatLng(raw); ok {
			params.Path = append(params.Path, ll)
		}
	}

	img, err := m.provider.StaticMap(r.Context(), params)
	if err != nil {
		http.Error(w, "static-map failed", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	_, _ = w.Write(img)
}

// parseLatLng parses a "lat,lng" string. Returns false when the string is not
// a valid coordinate pair.
func parseLatLng(s string) (LatLng, bool) {
	var ll LatLng
	_, err := fmt.Sscanf(s, "%f,%f", &ll.Lat, &ll.Lng)
	return ll, err == nil
}

// routeHintsRequest is the request body for POST /geo/route-hints.
type routeHintsRequest struct {
	Waypoints []LatLng `json:"waypoints"`
}

// handleRouteHints proxies a route-hints request: POST /geo/route-hints
//
// Accepts an ordered list of waypoints and returns the ordered sequence the
// frontend uses to draw an indicative route between itinerary pins. No Maps key
// is included in the response.
func (m *Module) handleRouteHints(w http.ResponseWriter, r *http.Request) {
	if m.provider == nil {
		http.Error(w, "geo proxy not configured", http.StatusServiceUnavailable)
		return
	}

	var req routeHintsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	hints, err := m.provider.RouteHints(r.Context(), req.Waypoints)
	if err != nil {
		http.Error(w, "route-hints failed", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(hints)
}
