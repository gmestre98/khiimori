package geo

import "context"

// LatLng is a geographic coordinate pair.
type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Geocoder converts a human-readable location string into geographic coordinates.
// Implementations must be safe for concurrent use.
type Geocoder interface {
	// Geocode resolves a location string (e.g. "Paris, France") to a LatLng.
	// Returns ErrNotFound when the location cannot be resolved.
	Geocode(ctx context.Context, location string) (LatLng, error)
}

// MapProvider wraps geocoding and route-hint operations needed by the day-map
// feature (Epics 03–04). All operations are proxied server-side so no Maps key
// is ever shipped to the client.
type MapProvider interface {
	Geocoder

	// RouteHints returns an ordered sequence of waypoints suitable for drawing
	// an indicative route between itinerary pins. Waypoints with no location are
	// omitted by the caller before calling this method.
	RouteHints(ctx context.Context, waypoints []LatLng) ([]LatLng, error)
}
