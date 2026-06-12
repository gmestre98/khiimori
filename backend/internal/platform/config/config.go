// Package config loads typed service configuration from the environment.
//
// Configuration is read once at startup via Load and then passed by value to
// the components that need it. There is no global mutable state and nothing is
// read in init() — keep configuration explicit. Standard library only.
package config

import (
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
	// DatabaseURL is the connection string for the primary database. It is
	// optional for now and wired in by Epic M01.3; it stays empty until then.
	DatabaseURL string
}

// Defaults applied by Load when the corresponding environment variable is unset.
const (
	defaultPort     = 8080
	defaultEnv      = EnvDev
	defaultLogLevel = LevelError
)

// Load reads configuration from the environment, applying defaults for unset
// variables and returning an error if any value is invalid.
//
// Recognised variables:
//
//	PORT          TCP port to listen on          (default 8080)
//	ENV           dev | prod                      (default dev)
//	LOG_LEVEL     debug | info | warn | error     (default error)
//	DATABASE_URL  primary database DSN            (default empty; wired in M01.3)
func Load() (Config, error) {
	cfg := Config{
		Port:        defaultPort,
		Env:         defaultEnv,
		LogLevel:    defaultLogLevel,
		DatabaseURL: os.Getenv("DATABASE_URL"),
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

	return cfg, nil
}
