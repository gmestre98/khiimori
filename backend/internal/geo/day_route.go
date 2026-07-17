package geo

import (
	"encoding/json"
	"net/http"
)

// dayRouteRequest is the body for POST /geo/day-route.
// Locations are in itinerary order. Empty strings and items whose location can't
// be geocoded have no map pin, but their slot is preserved in the response so the
// waypoints line up positionally with the input (waypoints[i] ↔ locations[i]).
type dayRouteRequest struct {
	Locations []string `json:"locations"`
}

// dayRouteResponse is the body returned by POST /geo/day-route. Waypoints is the
// same length as the request's locations and in the same order; an entry is null
// when its location was empty or couldn't be geocoded (positional nulls, so the
// client never mis-pairs a coordinate with a shifted stop).
type dayRouteResponse struct {
	Waypoints []*LatLng `json:"waypoints"`
}

// handleDayRoute geocodes an ordered list of location strings and returns route
// hints in the same itinerary order, one entry per input location. Items with
// empty or unresolvable locations come back as null (they have no map pin) rather
// than being dropped, so the client's positional pairing stays aligned even when
// a middle stop can't be placed. The Maps key is never forwarded to the client.
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

	// Geocode each location in order, keeping the resolvable coords together with
	// their original index. Empty strings and ErrNotFound leave a null slot at
	// their index; a hard failure aborts the whole request.
	coords := make([]LatLng, 0, len(req.Locations))
	slots := make([]int, 0, len(req.Locations))
	for i, loc := range req.Locations {
		if loc == "" {
			continue // no location → null slot at index i
		}
		ll, err := m.geocoder.Geocode(r.Context(), loc)
		if isNotFound(err) {
			continue // unresolvable → null slot at index i
		}
		if err != nil {
			http.Error(w, "geocoding failed", http.StatusBadGateway)
			return
		}
		coords = append(coords, ll)
		slots = append(slots, i)
	}

	hints, err := m.provider.RouteHints(r.Context(), coords)
	if err != nil {
		http.Error(w, "route-hints failed", http.StatusBadGateway)
		return
	}

	// Scatter the routed hints back into their original positions; every other
	// slot stays null. RouteHints preserves order and count (v1 does no
	// reordering), so hints[j] belongs to the location at slots[j].
	waypoints := make([]*LatLng, len(req.Locations))
	for j := range hints {
		if j >= len(slots) {
			break // defensive: never index slots past what we routed
		}
		ll := hints[j]
		waypoints[slots[j]] = &ll
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(dayRouteResponse{Waypoints: waypoints})
}
