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
