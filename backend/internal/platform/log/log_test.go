package log

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/gmestre98/eudaimonia/backend/internal/platform/config"
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

func TestEmitsJSONWithStandardFields(t *testing.T) {
	var buf bytes.Buffer
	logger := New(config.Config{LogLevel: config.LevelError}, &buf)

	logger.Error("boom")

	m := parseLine(t, buf.Bytes())
	for _, key := range []string{"level", "time", "msg"} {
		if _, ok := m[key]; !ok {
			t.Errorf("log line missing %q field: %v", key, m)
		}
	}
	if m["msg"] != "boom" {
		t.Errorf("msg = %v, want %q", m["msg"], "boom")
	}
	if m["level"] != "ERROR" {
		t.Errorf("level = %v, want ERROR", m["level"])
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
