package geo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const geocodeCacheTTL = 30 * 24 * time.Hour

// cachedGeocoder wraps a Geocoder and caches results in geo.geocode_cache.
// A cache hit skips the upstream provider call (the Maps cost mitigation).
// TTL is 30 days; stale rows are overwritten on the next miss.
type cachedGeocoder struct {
	pool     *pgxpool.Pool
	upstream Geocoder
}

// NewCachedGeocoder returns a Geocoder that checks geo.geocode_cache before
// calling upstream. Results are stored with a 30-day TTL (PRD §8.4 #2).
func NewCachedGeocoder(pool *pgxpool.Pool, upstream Geocoder) Geocoder {
	return &cachedGeocoder{pool: pool, upstream: upstream}
}

// Geocode returns a cached LatLng when available and not expired; otherwise it
// calls upstream and stores the result. ErrNotFound from upstream is not cached
// (transient: the location may be retried later after a typo fix).
func (c *cachedGeocoder) Geocode(ctx context.Context, location string) (LatLng, error) {
	// Cache lookup.
	if ll, ok, err := c.lookup(ctx, location); err != nil {
		return LatLng{}, err
	} else if ok {
		return ll, nil
	}

	// Cache miss — call upstream.
	ll, err := c.upstream.Geocode(ctx, location)
	if err != nil {
		return LatLng{}, err
	}

	// Store result; ignore write errors (cache is best-effort).
	_ = c.store(ctx, location, ll)
	return ll, nil
}

func (c *cachedGeocoder) lookup(ctx context.Context, location string) (LatLng, bool, error) {
	var ll LatLng
	err := c.pool.QueryRow(ctx,
		`SELECT lat, lng FROM geo.geocode_cache
		 WHERE location = $1 AND expires_at > now()`,
		location,
	).Scan(&ll.Lat, &ll.Lng)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LatLng{}, false, nil
		}
		return LatLng{}, false, fmt.Errorf("geo cache lookup: %w", err)
	}
	return ll, true, nil
}

func (c *cachedGeocoder) store(ctx context.Context, location string, ll LatLng) error {
	_, err := c.pool.Exec(ctx,
		`INSERT INTO geo.geocode_cache (location, lat, lng, cached_at, expires_at)
		 VALUES ($1, $2, $3, now(), now() + ($4 * interval '1 second'))
		 ON CONFLICT (location) DO UPDATE
		   SET lat = EXCLUDED.lat,
		       lng = EXCLUDED.lng,
		       cached_at = now(),
		       expires_at = now() + ($4 * interval '1 second')`,
		location, ll.Lat, ll.Lng, geocodeCacheTTL.Seconds(),
	)
	return err
}

// BuildGeocoder returns a cachedGeocoder when pool is non-nil, or upstream
// directly when pool is nil (useful in tests or when the DB is unavailable).
func BuildGeocoder(pool *pgxpool.Pool, upstream Geocoder) Geocoder {
	if pool == nil || upstream == nil {
		return upstream
	}
	return NewCachedGeocoder(pool, upstream)
}

// Compile-time check.
var _ Geocoder = (*cachedGeocoder)(nil)
