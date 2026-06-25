package geo

import (
	"encoding/json"
	"net/http"
)

// dayRouteRequest is the body for POST /geo/day-route.
// Locations are in itinerary order; empty strings and items with no location
// are excluded from the output (location-less items have no pin to route to).
type dayRouteRequest struct {
	Locations []string `json:"locations"`
}

// dayRouteResponse is the body returned by POST /geo/day-route.
type dayRouteResponse struct {
	Waypoints []LatLng `json:"waypoints"`
}

// handleDayRoute geocodes an ordered list of location strings and returns
// route hints in the same itinerary order. Items with empty or unresolvable
// locations are silently excluded (they have no map pin). The Maps key is
// never forwarded to the client.
//
// POST /geo/day-route
func (m *Module) handleDayRoute(w http.ResponseWriter, r *http.Request) {
	if m.geocoder == nil || m.provider == nil {
		http.Error(w, "geo proxy not configured", http.StatusServiceUnavailable)
		return
	}

	var req dayRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Geocode each location in order; skip empty strings and ErrNotFound.
	var coords []LatLng
	for _, loc := range req.Locations {
		if loc == "" {
			continue
		}
		ll, err := m.geocoder.Geocode(r.Context(), loc)
		if isNotFound(err) {
			continue // location-less / unresolvable items excluded
		}
		if err != nil {
			http.Error(w, "geocoding failed", http.StatusBadGateway)
			return
		}
		coords = append(coords, ll)
	}

	// Return empty waypoints slice (not null) when no locations resolved.
	if coords == nil {
		coords = []LatLng{}
	}

	hints, err := m.provider.RouteHints(r.Context(), coords)
	if err != nil {
		http.Error(w, "route-hints failed", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(dayRouteResponse{Waypoints: hints})
}
