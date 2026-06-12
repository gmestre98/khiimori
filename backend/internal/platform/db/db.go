// Package db opens and manages the service's Postgres connection pool.
//
// The pool is built once at startup from typed config and handed to the domain
// modules; closing it is wired into graceful shutdown. The concrete driver
// (pgx/pgxpool) sits behind the narrow types in this package so it can be
// swapped later without touching callers (PRD §7.0):
//
//   - Pinger is all the readiness check (S6) depends on.
//   - DB exposes Ping/Close plus Pool() for modules that need to run queries.
//
// Pooled vs direct is a config toggle (DB_POOLED), not a code change (PRD §8.6):
// app traffic goes through Neon's pgBouncer pooler by default, and migrations
// (S5) use the direct endpoint instead. This is plumbing only — no domain
// queries live here.
package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/eudaimonia/backend/internal/platform/config"
)

// Pool tuning. Defaults are sized for Neon's free tier and its scale-to-zero
// cold starts: keep no idle connections so the instance can sleep, but allow a
// generous connect timeout for the wake-up, and bound any single statement so a
// stuck query can't pin a connection.
const (
	maxConns         = 10
	minConns         = 0
	maxConnLifetime  = 30 * time.Minute
	maxConnIdleTime  = 5 * time.Minute
	healthCheck      = 1 * time.Minute
	connectTimeout   = 10 * time.Second
	statementTimeout = "15000" // milliseconds, as a Postgres runtime parameter
)

// Pinger reports whether the database is reachable. The readiness check (S6)
// depends on this narrow interface rather than the concrete pool, keeping the
// driver swappable.
type Pinger interface {
	Ping(ctx context.Context) error
}

// DB is the service's handle to Postgres. It wraps the underlying pgx pool and
// is safe for concurrent use by multiple goroutines.
type DB struct {
	pool *pgxpool.Pool
}

// Open builds a connection pool from config and returns a handle. The endpoint
// is chosen by the DB_POOLED toggle (pooled DATABASE_URL by default, direct
// DATABASE_URL_DIRECT when false). It does not dial the database — the first
// real connection is established lazily on use (or by Ping), so a cold/asleep
// Neon instance doesn't block startup. The caller must Close the returned DB.
func Open(ctx context.Context, cfg config.Config) (*DB, error) {
	connString, err := selectDSN(cfg)
	if err != nil {
		return nil, err
	}

	poolCfg, err := pgxpool.ParseConfig(connString)
	if err != nil {
		// ParseConfig errors are about DSN syntax, not connectivity, and may
		// echo the DSN — wrap with a fixed message so no secret is surfaced.
		return nil, errors.New("db: invalid connection string")
	}

	poolCfg.MaxConns = maxConns
	poolCfg.MinConns = minConns
	poolCfg.MaxConnLifetime = maxConnLifetime
	poolCfg.MaxConnIdleTime = maxConnIdleTime
	poolCfg.HealthCheckPeriod = healthCheck
	poolCfg.ConnConfig.ConnectTimeout = connectTimeout
	if poolCfg.ConnConfig.RuntimeParams == nil {
		poolCfg.ConnConfig.RuntimeParams = make(map[string]string)
	}
	poolCfg.ConnConfig.RuntimeParams["statement_timeout"] = statementTimeout

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("db: create pool: %w", err)
	}
	return &DB{pool: pool}, nil
}

// Ping verifies connectivity by acquiring a connection and round-tripping to the
// server. It respects ctx's deadline so the readiness probe stays bounded.
func (db *DB) Ping(ctx context.Context) error {
	return db.pool.Ping(ctx)
}

// Pool returns the underlying pgx pool for domain modules to run queries. Kept
// separate from the lifecycle methods so consumers depend on the handle, not on
// how it was constructed.
func (db *DB) Pool() *pgxpool.Pool {
	return db.pool
}

// Close releases all pooled connections. It blocks until in-use connections are
// returned, so call it from graceful shutdown after the HTTP server has drained.
func (db *DB) Close() {
	db.pool.Close()
}

// selectDSN returns the connection string the application pool should use, based
// on the pooled/direct toggle, and errors if the selected string is empty. It is
// a pure function of config so the toggle can be unit-tested without a database.
func selectDSN(cfg config.Config) (string, error) {
	if cfg.DBPooled {
		if cfg.DatabaseURL == "" {
			return "", errors.New("db: DB_POOLED=true but DATABASE_URL is empty")
		}
		return cfg.DatabaseURL, nil
	}
	if cfg.DatabaseURLDirect == "" {
		return "", errors.New("db: DB_POOLED=false but DATABASE_URL_DIRECT is empty")
	}
	return cfg.DatabaseURLDirect, nil
}
