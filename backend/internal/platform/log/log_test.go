package log

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
)

// parseLine unmarshals a single JSON log line, failing the test if it is not
// valid JSON.
func parseLine(t *testing.T, b []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("log line is not valid JSON: %v\nline: %s", err, b)
	}
	return m
}

func TestEmitsJSONWithCloudLoggingFields(t *testing.T) {
	var buf bytes.Buffer
	logger := New(config.Config{LogLevel: config.LevelError}, &buf)

	logger.Error("boom")

	m := parseLine(t, buf.Bytes())
	// Cloud Logging's conventional field names, so entries are ingested as
	// structured, severity-classified logs (not opaque text). `time` is slog's
	// own field, already a recognised timestamp.
	for _, key := range []string{"severity", "time", "message"} {
		if _, ok := m[key]; !ok {
			t.Errorf("log line missing %q field: %v", key, m)
		}
	}
	if m["message"] != "boom" {
		t.Errorf("message = %v, want %q", m["message"], "boom")
	}
	if m["severity"] != "ERROR" {
		t.Errorf("severity = %v, want ERROR", m["severity"])
	}
	// The slog defaults must not also appear under their original names.
	if _, ok := m["msg"]; ok {
		t.Errorf("unexpected raw slog %q field present: %v", "msg", m)
	}
	if _, ok := m["level"]; ok {
		t.Errorf("unexpected raw slog %q field present: %v", "level", m)
	}
}

func TestSeverityMapping(t *testing.T) {
	cases := []struct {
		level config.LogLevel
		emit  func(*slog.Logger)
		want  string
	}{
		{config.LevelDebug, func(l *slog.Logger) { l.Debug("x") }, "DEBUG"},
		{config.LevelDebug, func(l *slog.Logger) { l.Info("x") }, "INFO"},
		{config.LevelDebug, func(l *slog.Logger) { l.Warn("x") }, "WARNING"},
		{config.LevelDebug, func(l *slog.Logger) { l.Error("x") }, "ERROR"},
	}
	for _, tc := range cases {
		var buf bytes.Buffer
		tc.emit(New(config.Config{LogLevel: tc.level}, &buf))
		m := parseLine(t, buf.Bytes())
		if m["severity"] != tc.want {
			t.Errorf("severity = %v, want %v", m["severity"], tc.want)
		}
	}
}

func TestRespectsConfiguredLevel(t *testing.T) {
	t.Run("default error level drops non-error logs", func(t *testing.T) {
		var buf bytes.Buffer
		logger := New(config.Config{LogLevel: config.LevelError}, &buf)

		logger.Info("ignored")
		logger.Warn("ignored")
		if buf.Len() != 0 {
			t.Fatalf("expected no output below error level, got: %s", buf.Bytes())
		}

		logger.Error("kept")
		if buf.Len() == 0 {
			t.Fatal("expected error log to be emitted, got none")
		}
	})

	t.Run("info level lets info logs through", func(t *testing.T) {
		var buf bytes.Buffer
		logger := New(config.Config{LogLevel: config.LevelInfo}, &buf)

		logger.Info("kept")
		if buf.Len() == 0 {
			t.Fatal("expected info log at info level, got none")
		}
	})
}

func TestStructuredFields(t *testing.T) {
	var buf bytes.Buffer
	logger := New(config.Config{LogLevel: config.LevelError}, &buf)

	logger.With("request_id", "abc123").Error("failed", "status", 500)

	m := parseLine(t, buf.Bytes())
	if m["request_id"] != "abc123" {
		t.Errorf("request_id = %v, want abc123", m["request_id"])
	}
	if m["status"] != float64(500) { // JSON numbers decode to float64
		t.Errorf("status = %v, want 500", m["status"])
	}
}

func TestRedactsSensitiveAttributes(t *testing.T) {
	// Each key names a secret and must never reach the output with its value;
	// the key stays so it's visible a field was present.
	sensitive := []string{
		"authorization", "Authorization", "password", "passwd", "secret",
		"client_secret", "token", "access_token", "refresh_token", "api_key",
		"apikey", "x-api-key", "cookie", "set-cookie", "db_url", "database_url",
		"dsn", "credential",
	}
	for _, key := range sensitive {
		t.Run(key, func(t *testing.T) {
			var buf bytes.Buffer
			logger := New(config.Config{LogLevel: config.LevelError}, &buf)

			logger.Error("boom", key, "super-secret-value")

			m := parseLine(t, buf.Bytes())
			if got := m[key]; got != "[REDACTED]" {
				t.Errorf("%q = %v, want [REDACTED]", key, got)
			}
			if bytes.Contains(buf.Bytes(), []byte("super-secret-value")) {
				t.Errorf("secret value leaked: %s", buf.Bytes())
			}
		})
	}
}

func TestRedactsSensitiveKeysInGroups(t *testing.T) {
	// Sensitive keys nested inside a group (e.g. a request's headers logged as a
	// struct/map) must be redacted too.
	var buf bytes.Buffer
	logger := New(config.Config{LogLevel: config.LevelError}, &buf)

	logger.Error("request",
		slog.Group("headers",
			"authorization", "Bearer abc123",
			"x-request-id", "keep-me",
		),
	)

	if bytes.Contains(buf.Bytes(), []byte("Bearer abc123")) {
		t.Errorf("nested secret leaked: %s", buf.Bytes())
	}
	m := parseLine(t, buf.Bytes())
	headers, ok := m["headers"].(map[string]any)
	if !ok {
		t.Fatalf("headers group missing or not an object: %v", m)
	}
	if headers["authorization"] != "[REDACTED]" {
		t.Errorf("nested authorization = %v, want [REDACTED]", headers["authorization"])
	}
	// Non-sensitive sibling keys are preserved.
	if headers["x-request-id"] != "keep-me" {
		t.Errorf("x-request-id = %v, want keep-me", headers["x-request-id"])
	}
}

func TestNonSensitiveAttributesPassThrough(t *testing.T) {
	var buf bytes.Buffer
	logger := New(config.Config{LogLevel: config.LevelError}, &buf)

	logger.Error("request", "method", "GET", "path", "/trips", "status", 500)

	m := parseLine(t, buf.Bytes())
	for k, want := range map[string]any{"method": "GET", "path": "/trips", "status": float64(500)} {
		if m[k] != want {
			t.Errorf("%q = %v, want %v (must not be redacted)", k, m[k], want)
		}
	}
}

func TestContextRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	logger := New(config.Config{LogLevel: config.LevelError}, &buf)

	ctx := WithContext(context.Background(), logger)
	if got := FromContext(ctx); got != logger {
		t.Errorf("FromContext returned a different logger than was stored")
	}
}

func TestFromContextFallback(t *testing.T) {
	// No logger on the context: FromContext must still return a usable logger
	// rather than nil, so callers never panic.
	if got := FromContext(context.Background()); got == nil {
		t.Fatal("FromContext returned nil for an unseeded context")
	}
}
