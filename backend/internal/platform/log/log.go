// Package log provides the service's shared structured logger.
//
// Logs are emitted as JSON lines (via log/slog) so they feed Cloud Logging
// cleanly once the service deploys (Epic M01.7). Every module and the HTTP
// middleware log through a logger built here rather than fmt/log.
//
// Logging policy (project-wide, v1): the logger supports every level, but the
// service only emits error-level logs for now. The default level comes from
// config (LevelError), so non-error calls are dropped until the level is raised
// deliberately later.
//
// There is no global default logger: New constructs one at startup and it is
// passed where needed (or carried on a request context.Context). Standard
// library only.
package log

import (
	"context"
	"io"
	"log/slog"
	"os"

	"github.com/gmestre98/eudaimonia/backend/internal/platform/config"
)

// New builds a JSON logger that writes to w and emits at or above the level in
// cfg. Pass os.Stdout in production; tests pass a buffer to inspect output.
func New(cfg config.Config, w io.Writer) *slog.Logger {
	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: slogLevel(cfg.LogLevel)})
	return slog.New(handler)
}

// NewStdout builds the standard service logger writing JSON to stdout.
func NewStdout(cfg config.Config) *slog.Logger {
	return New(cfg, os.Stdout)
}

// slogLevel maps a config.LogLevel to its slog equivalent. Unknown values fall
// back to error, matching config's errors-only default.
func slogLevel(l config.LogLevel) slog.Level {
	switch l {
	case config.LevelDebug:
		return slog.LevelDebug
	case config.LevelInfo:
		return slog.LevelInfo
	case config.LevelWarn:
		return slog.LevelWarn
	case config.LevelError:
		return slog.LevelError
	default:
		return slog.LevelError
	}
}

// ctxKey is the unexported key under which a logger is stored on a context, so
// only this package can set or read it.
type ctxKey struct{}

// WithContext returns a copy of ctx carrying logger, so request-scoped fields
// (request id, etc. — added by the middleware in S5) flow through call chains.
func WithContext(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, logger)
}

// FromContext returns the logger stored on ctx by WithContext. If none is
// present it returns a freshly-built error-level stderr logger so error logs
// are never silently dropped — this is a fallback, not a shared global.
func FromContext(ctx context.Context) *slog.Logger {
	if logger, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok && logger != nil {
		return logger
	}
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}
