// Package config loads typed service configuration from the environment.
//
// Configuration is read once at startup via Load and then passed by value to
// the components that need it. There is no global mutable state and nothing is
// read in init() — keep configuration explicit. Standard library only.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Env is the deployment environment the service runs in.
type Env string

const (
	EnvDev  Env = "dev"
	EnvProd Env = "prod"
)

// LogLevel is the minimum severity the logger emits. The project-wide v1 policy
// is to emit error-level logs only, so the default is LevelError (the logger in
// story S2 reads this value).
type LogLevel string

const (
	LevelDebug LogLevel = "debug"
	LevelInfo  LogLevel = "info"
	LevelWarn  LogLevel = "warn"
	LevelError LogLevel = "error"
)

// valid reports whether l is one of the recognised log levels.
func (l LogLevel) valid() bool {
	switch l {
	case LevelDebug, LevelInfo, LevelWarn, LevelError:
		return true
	default:
		return false
	}
}

// Config is the typed service configuration. It is constructed once by Load and
// is read-only thereafter.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port int
	// Env is the deployment environment (dev or prod).
	Env Env
	// LogLevel is the minimum log severity emitted.
	LogLevel LogLevel
	// DatabaseURL is the pooled (pgBouncer) connection string for the primary
	// database — the endpoint app traffic and the readiness check use. It is
	// required when DBPooled is true (the default).
	DatabaseURL string
	// DatabaseURLDirect is the direct (un-pooled) connection string, used by
	// migrations and admin tasks that must bypass the pooler. It is required
	// when DBPooled is false; otherwise it is optional (e.g. only migrations
	// need it), so the running service isn't forced to carry the direct secret.
	DatabaseURLDirect string
	// DBPooled selects which endpoint the application connection pool uses:
	// true → DatabaseURL (pooled, the default), false → DatabaseURLDirect.
	// Flipping it is a config change, not a code change (PRD §8.6).
	DBPooled bool
	// CORSAllowedOrigins is the exact list of browser origins permitted to make
	// cross-origin requests to the API (the web app's local dev origin and the
	// Firebase Hosting origin). Matched exactly — never a wildcard (PRD §6).
	// Optional: when empty no cross-origin request is allowed (same-origin and
	// non-browser callers are unaffected). Set CORS_ALLOWED_ORIGINS to a
	// comma-separated list to populate it.
	CORSAllowedOrigins []string
}

// Load reads configuration from the environment and returns an error if any
// variable is missing or invalid. There are no defaults: every value must be set
// explicitly so a misconfiguration fails here, at startup — the earliest point —
// rather than surprising the operator at runtime.
//
// Required variables:
//
//	PORT                 TCP port to listen on          (1-65535)
//	ENV                  dev | prod
//	LOG_LEVEL            debug | info | warn | error
//	DB_POOLED            true | false
//	DATABASE_URL         pooled (pgBouncer) database DSN (required if DB_POOLED=true)
//	DATABASE_URL_DIRECT  direct database DSN, migrations (required if DB_POOLED=false)
//
// Optional variables:
//
//	CORS_ALLOWED_ORIGINS  comma-separated browser origins allowed cross-origin
//
// Of the two DSNs, only the active one (per DB_POOLED) is required; the unused
// endpoint stays optional so a pooled service isn't forced to carry the direct
// secret it never uses.
func Load() (Config, error) {
	var cfg Config

	portStr, err := required("PORT")
	if err != nil {
		return Config{}, err
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return Config{}, fmt.Errorf("config: invalid PORT %q: %w", portStr, err)
	}
	if port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("config: PORT %d out of range 1-65535", port)
	}
	cfg.Port = port

	envStr, err := required("ENV")
	if err != nil {
		return Config{}, err
	}
	cfg.Env = Env(envStr)
	if cfg.Env != EnvDev && cfg.Env != EnvProd {
		return Config{}, fmt.Errorf("config: invalid ENV %q (want dev or prod)", envStr)
	}

	levelStr, err := required("LOG_LEVEL")
	if err != nil {
		return Config{}, err
	}
	cfg.LogLevel = LogLevel(levelStr)
	if !cfg.LogLevel.valid() {
		return Config{}, fmt.Errorf("config: invalid LOG_LEVEL %q (want debug, info, warn or error)", levelStr)
	}

	pooledStr, err := required("DB_POOLED")
	if err != nil {
		return Config{}, err
	}
	cfg.DBPooled, err = strconv.ParseBool(pooledStr)
	if err != nil {
		return Config{}, fmt.Errorf("config: invalid DB_POOLED %q (want true or false): %w", pooledStr, err)
	}

	// Only the active DSN (per the DB_POOLED toggle) is required.
	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	cfg.DatabaseURLDirect = os.Getenv("DATABASE_URL_DIRECT")
	if cfg.DBPooled && cfg.DatabaseURL == "" {
		return Config{}, errors.New("config: DATABASE_URL is required (DB_POOLED=true)")
	}
	if !cfg.DBPooled && cfg.DatabaseURLDirect == "" {
		return Config{}, errors.New("config: DATABASE_URL_DIRECT is required (DB_POOLED=false)")
	}

	// Optional: the cross-origin allowlist. Empty (unset) means no cross-origin
	// request is allowed, which is the safe default for a same-origin or
	// non-browser deployment.
	cfg.CORSAllowedOrigins = parseOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))

	return cfg, nil
}

// parseOrigins splits a comma-separated origin list, trimming surrounding
// whitespace and dropping empty entries, so " https://a.app , " yields
// ["https://a.app"]. A blank input yields a nil slice (no allowed origins).
func parseOrigins(raw string) []string {
	var origins []string
	for _, part := range strings.Split(raw, ",") {
		if o := strings.TrimSpace(part); o != "" {
			origins = append(origins, o)
		}
	}
	return origins
}

// LoadMigrationDSN returns the direct (un-pooled) database DSN used for
// migrations, which must bypass the connection pooler. It is read from the
// required DATABASE_URL_DIRECT and is needed regardless of the DB_POOLED toggle
// (migrations always use the direct endpoint). Unlike Load, it reads only this
// one variable, so the migrate command isn't burdened with the full service
// config.
func LoadMigrationDSN() (string, error) {
	return required("DATABASE_URL_DIRECT")
}

// required reads a mandatory environment variable, returning an error if it is
// unset or empty.
func required(key string) (string, error) {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return "", fmt.Errorf("config: %s is required", key)
	}
	return v, nil
}
