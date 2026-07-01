package geo

import "context"

// LatLng is a geographic coordinate pair.
type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Suggestion is a single place-autocomplete prediction. Description is the
// human-readable label shown to the user (e.g. "Louvre Museum, Rue de Rivoli,
// Paris, France"); PlaceID is Google's stable identifier, forwarded so future
// callers can fetch details without re-querying by text.
type Suggestion struct {
	Description string `json:"description"`
	PlaceID     string `json:"place_id"`
}

// Geocoder converts a human-readable location string into geographic coordinates.
// Implementations must be safe for concurrent use.
type Geocoder interface {
	// Geocode resolves a location string (e.g. "Paris, France") to a LatLng.
	// Returns ErrNotFound when the location cannot be resolved.
	Geocode(ctx context.Context, location string) (LatLng, error)
}

// StaticMapParams describes the content of a static map image returned by
// MapProvider.StaticMap. The image will be rendered by the client as-is (PNG).
type StaticMapParams struct {
	// Size is the image dimensions, e.g. "600x300".
	Size string
	// Markers is the ordered list of pin positions in itinerary order.
	Markers []LatLng
	// Path is the ordered list of waypoints for the indicative route polyline.
	Path []LatLng
	// Scale is the pixel density multiplier (1 or 2); defaults to 1.
	Scale int
}

// MapProvider wraps geocoding, route-hint, and static-map operations needed by
// the day-map feature (Epics 03–04). All operations are proxied server-side so
// no Maps key is ever shipped to the client.
type MapProvider interface {
	Geocoder

	// RouteHints returns an ordered sequence of waypoints suitable for drawing
	// an indicative route between itinerary pins. Waypoints with no location are
	// omitted by the caller before calling this method.
	RouteHints(ctx context.Context, waypoints []LatLng) ([]LatLng, error)

	// StaticMap returns the raw PNG bytes of a Google Static Maps image with
	// the given markers and path. The Maps API key is embedded server-side and
	// never returned to the caller alongside the image bytes.
	StaticMap(ctx context.Context, params StaticMapParams) ([]byte, error)

	// Autocomplete returns place predictions for a partial location string,
	// powering the plan form's location suggestions. An empty result (no
	// matches) is returned as an empty slice and nil error. The Maps key is
	// used server-side only.
	Autocomplete(ctx context.Context, input string) ([]Suggestion, error)
}
