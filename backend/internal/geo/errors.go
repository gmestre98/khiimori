package geo

import "errors"

// ErrNotFound is returned by Geocoder.Geocode when the location string cannot
// be resolved to coordinates (e.g. ambiguous or unknown place name).
var ErrNotFound = errors.New("geo: location not found")

func isNotFound(err error) bool { return errors.Is(err, ErrNotFound) }
