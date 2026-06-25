package geo

import (
	"encoding/json"
	"errors"
	"net/http"
)

// handleGeocode proxies a geocoding request: GET /geo/geocode?location=<address>
//
// The Maps API key is never included in the response — only the resolved LatLng
// is returned to the client.
func (m *Module) handleGeocode(w http.ResponseWriter, r *http.Request) {
	if m.provider == nil {
		http.Error(w, "geo proxy not configured", http.StatusServiceUnavailable)
		return
	}

	location := r.URL.Query().Get("location")
	if location == "" {
		http.Error(w, "location query parameter is required", http.StatusBadRequest)
		return
	}

	coords, err := m.provider.Geocode(r.Context(), location)
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
