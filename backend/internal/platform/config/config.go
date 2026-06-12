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
}

// Defaults applied by Load when the corresponding environment variable is unset.
const (
	defaultPort     = 8080
	defaultEnv      = EnvDev
	defaultLogLevel = LevelError
	defaultDBPooled = true
)

// Load reads configuration from the environment, applying defaults for unset
// variables and returning an error if any value is invalid.
//
// Recognised variables:
//
//	PORT                 TCP port to listen on        (default 8080)
//	ENV                  dev | prod                    (default dev)
//	LOG_LEVEL            debug | info | warn | error    (default error)
//	DATABASE_URL         pooled (pgBouncer) database DSN (required if DB_POOLED=true)
//	DATABASE_URL_DIRECT  direct database DSN, migrations (required if DB_POOLED=false)
//	DB_POOLED            true | false                   (default true)
//
// The active database DSN (per the DB_POOLED toggle) is mandatory: a missing
// value fails here, at config time — the earliest point — rather than later.
func Load() (Config, error) {
	cfg := Config{
		Port:              defaultPort,
		Env:               defaultEnv,
		LogLevel:          defaultLogLevel,
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		DatabaseURLDirect: os.Getenv("DATABASE_URL_DIRECT"),
		DBPooled:          defaultDBPooled,
	}

	if v, ok := os.LookupEnv("PORT"); ok {
		port, err := strconv.Atoi(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: invalid PORT %q: %w", v, err)
		}
		if port < 1 || port > 65535 {
			return Config{}, fmt.Errorf("config: PORT %d out of range 1-65535", port)
		}
		cfg.Port = port
	}

	if v, ok := os.LookupEnv("ENV"); ok {
		env := Env(v)
		if env != EnvDev && env != EnvProd {
			return Config{}, fmt.Errorf("config: invalid ENV %q (want dev or prod)", v)
		}
		cfg.Env = env
	}

	if v, ok := os.LookupEnv("LOG_LEVEL"); ok {
		level := LogLevel(v)
		if !level.valid() {
			return Config{}, fmt.Errorf("config: invalid LOG_LEVEL %q (want debug, info, warn or error)", v)
		}
		cfg.LogLevel = level
	}

	if v, ok := os.LookupEnv("DB_POOLED"); ok {
		pooled, err := strconv.ParseBool(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: invalid DB_POOLED %q (want true or false): %w", v, err)
		}
		cfg.DBPooled = pooled
	}

	// Require the DSN the service will actually use. The unused endpoint stays
	// optional so we don't force the direct secret into a pooled service.
	if cfg.DBPooled && cfg.DatabaseURL == "" {
		return Config{}, errors.New("config: DATABASE_URL is required (DB_POOLED=true)")
	}
	if !cfg.DBPooled && cfg.DatabaseURLDirect == "" {
		return Config{}, errors.New("config: DATABASE_URL_DIRECT is required (DB_POOLED=false)")
	}

	return cfg, nil
}
