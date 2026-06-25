// Package geo owns geocoding, routing, and Google Maps key protection
// (the maps proxy).
//
// # Client map-rendering approach (M07.1 S4)
//
// The chosen approach is PROXIED TILES — the client holds no Maps key of any
// kind. All map-related operations go through this package's HTTP endpoints:
//
//	GET  /geo/geocode           — resolve a location string → LatLng
//	POST /geo/route-hints       — ordered waypoints for an indicative route
//	GET  /geo/static-map        — returns a PNG map image (Static Maps API)
//
// The frontend renders the map by fetching a PNG image from /geo/static-map
// (an <img> element or lazy-loaded canvas). This approach:
//
//   - Requires zero client-side Maps key of any kind (maximum key protection)
//   - Covers the v1 feature set (pins + indicative route) with a single image
//   - Is trivially lazy-loaded (just an <img> element)
//   - Keeps billing in the Static Maps free tier at expected usage
//
// A restricted, referer-locked Maps JavaScript key (the alternative) was
// considered but rejected for v1 because it still requires shipping a key to
// the browser, even in restricted form. The Static Maps proxy achieves the
// same visual result without any client-side key. If an interactive map is
// needed in a future milestone, the proxy approach can be revisited.
//
// The Maps API key is injected from Secret Manager via the MAPS_API_KEY env
// var; it is never returned in any HTTP response.
package geo
