// Package log provides the service's shared structured logger.
//
// Logs are emitted as JSON lines (via log/slog) so they feed Cloud Logging
// cleanly once the service deploys (Epic M01.7). Every module and the HTTP
// middleware log through a logger built here rather than fmt/log.
//
// Cloud Logging interop (M01.7 S1): on Cloud Run, stdout JSON is ingested by
// Cloud Logging automatically, but only if entries use its conventional field
// names. The handler here renames slog's defaults to those fields — `msg` →
// `message`, `level` → `severity` (with the value mapped to a Cloud Logging
// severity string, e.g. WARN → WARNING) — so error entries are classified as
// ERROR and the message is displayed, not buried in a payload. slog's `time`
// (RFC3339) is already a recognised timestamp field and is left as-is. Request
// correlation (request id, and the Cloud Run trace where present) is attached
// by the HTTP middleware, not here.
//
// Secret redaction (M01.7 S2): the handler redacts the value of any attribute
// whose key names a secret (authorization, password, token, cookie, api_key,
// db_url, …) before it is written, so no module can accidentally log a
// credential. Redaction is a property of the shared logger, not a caller
// discipline. The corollary is the logging guideline: pass secrets as structured
// attribute *values* under a descriptive key (which redaction can see), never
// interpolated into the message string or buried inside a pre-marshalled blob
// (which it cannot).
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
	"strings"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
)

// New builds a JSON logger that writes to w and emits at or above the level in
// cfg. Pass os.Stdout in production; tests pass a buffer to inspect output.
//
// Output uses Cloud Logging's conventional field names (see the package doc) so
// the deployed service's logs are ingested as structured, severity-classified
// entries rather than opaque text.
func New(cfg config.Config, w io.Writer) *slog.Logger {
	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{
		Level:       slogLevel(cfg.LogLevel),
		ReplaceAttr: replaceAttr,
	})
	return slog.New(handler)
}

// replaceAttr is the logger's single slog ReplaceAttr hook. It first redacts any
// sensitive attribute (S2) — at every nesting level — then rewrites slog's
// built-ins to Cloud Logging's field names (S1). Redaction runs first so a
// sensitive value can never reach the output, regardless of its key's casing or
// depth.
func replaceAttr(groups []string, a slog.Attr) slog.Attr {
	a = redactSensitive(a)
	return cloudLoggingAttrs(groups, a)
}

// redactedPlaceholder replaces the value of any attribute whose key names a
// secret, so the value never appears in the logs.
const redactedPlaceholder = "[REDACTED]"

// sensitiveSubstrings are the case-insensitive fragments that mark an attribute
// key as carrying a secret. Substring (not exact) matching is deliberate and
// fail-safe: it also catches variants like access_token, refresh_token,
// set-cookie, and x-api-key. The cost is occasionally redacting a benign key
// that happens to contain one of these — an acceptable trade for never leaking a
// credential (PRD §6, §8.5).
var sensitiveSubstrings = []string{
	"authorization",
	"password",
	"passwd",
	"secret",
	"token",
	"api_key",
	"api-key",
	"apikey",
	"cookie",
	"db_url",
	"database_url",
	"dsn", // a Postgres DSN embeds the password
	"credential",
}

// redactSensitive replaces the value of any attribute whose key matches a
// sensitive fragment with the redaction placeholder, leaving its key intact (so
// it is still visible that a field was present, just not its value). It applies
// at every nesting level. Group attributes are returned untouched so the handler
// still recurses into their members, where each member is redacted in turn.
func redactSensitive(a slog.Attr) slog.Attr {
	if a.Value.Kind() == slog.KindGroup {
		return a
	}
	if isSensitiveKey(a.Key) {
		return slog.String(a.Key, redactedPlaceholder)
	}
	return a
}

// isSensitiveKey reports whether key (compared case-insensitively) contains any
// sensitive fragment.
func isSensitiveKey(key string) bool {
	lower := strings.ToLower(key)
	for _, s := range sensitiveSubstrings {
		if strings.Contains(lower, s) {
			return true
		}
	}
	return false
}

// cloudLoggingAttrs rewrites slog's built-in top-level attributes to the field
// names Cloud Logging recognises, so entries are structured and severity is
// classified. Only the root group's built-ins are touched; nested attributes
// (and everything a caller adds) pass through unchanged.
func cloudLoggingAttrs(groups []string, a slog.Attr) slog.Attr {
	if len(groups) != 0 {
		return a
	}
	switch a.Key {
	case slog.MessageKey: // "msg" → the entry's display text.
		a.Key = "message"
	case slog.LevelKey: // "level" → Cloud Logging severity enum.
		a.Key = "severity"
		if lvl, ok := a.Value.Any().(slog.Level); ok {
			a.Value = slog.StringValue(cloudLoggingSeverity(lvl))
		}
	}
	return a
}

// cloudLoggingSeverity maps an slog level to the nearest Cloud Logging severity
// string. slog's own level names mostly match (DEBUG/INFO/ERROR) except WARN,
// which Cloud Logging spells WARNING; an unrecognised in-between level rounds
// down to the next defined severity.
func cloudLoggingSeverity(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return "ERROR"
	case l >= slog.LevelWarn:
		return "WARNING"
	case l >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
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
