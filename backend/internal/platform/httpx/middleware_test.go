package httpx

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

func TestRequestIDGeneratesAndEchoes(t *testing.T) {
	var gotID string
	h := RequestIDMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = RequestID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if gotID == "" {
		t.Fatal("request id not propagated to handler context")
	}
	if got := rec.Header().Get(requestIDHeader); got != gotID {
		t.Errorf("response %s = %q, want %q (same as context)", requestIDHeader, got, gotID)
	}
}

func TestRequestIDHonoursInbound(t *testing.T) {
	var gotID string
	h := RequestIDMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = RequestID(r.Context())
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(requestIDHeader, "inbound-123")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if gotID != "inbound-123" {
		t.Errorf("context request id = %q, want inbound-123", gotID)
	}
	if got := rec.Header().Get(requestIDHeader); got != "inbound-123" {
		t.Errorf("response header = %q, want inbound-123", got)
	}
}

func TestLoggingErrorsOnlyByDefault(t *testing.T) {
	t.Run("failed request logs a line", func(t *testing.T) {
		var buf bytes.Buffer
		logger := platformlog.New(config.Config{LogLevel: config.LevelError}, &buf)
		h := Logging(logger, "")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))

		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/boom", nil))

		if buf.Len() == 0 {
			t.Fatal("expected an access-log line for a 500 response, got none")
		}
		if !bytes.Contains(buf.Bytes(), []byte("/boom")) {
			t.Errorf("log line missing path: %s", buf.Bytes())
		}
	})

	t.Run("successful request stays silent", func(t *testing.T) {
		var buf bytes.Buffer
		logger := platformlog.New(config.Config{LogLevel: config.LevelError}, &buf)
		h := Logging(logger, "")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/ok", nil))

		if buf.Len() != 0 {
			t.Fatalf("expected no log line for a 200 under the default error level, got: %s", buf.Bytes())
		}
	})
}

func TestLoggingOmitsSecrets(t *testing.T) {
	// The access log records method/path/status/duration only — never request
	// headers (auth, cookies) and only the URL path, not the raw query (which
	// could carry secret params). Verify a 500 line for a request laden with
	// secrets stays clean (S2 AC).
	var buf bytes.Buffer
	logger := platformlog.New(config.Config{LogLevel: config.LevelError}, &buf)
	h := Logging(logger, "")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))

	req := httptest.NewRequest(http.MethodGet, "/trips?token=leak-me&id=7", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	req.Header.Set("Cookie", "session=leak-cookie")
	h.ServeHTTP(httptest.NewRecorder(), req)

	for _, secret := range []string{"leak-me", "secret-token", "leak-cookie"} {
		if bytes.Contains(buf.Bytes(), []byte(secret)) {
			t.Errorf("access log leaked %q: %s", secret, buf.Bytes())
		}
	}
}

func TestLoggingTraceCorrelation(t *testing.T) {
	t.Run("attaches the Cloud Logging trace when project + header present", func(t *testing.T) {
		var buf bytes.Buffer
		logger := platformlog.New(config.Config{LogLevel: config.LevelError}, &buf)
		h := Logging(logger, "my-project")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))

		req := httptest.NewRequest(http.MethodGet, "/boom", nil)
		req.Header.Set(cloudTraceHeader, "abc123/456;o=1")
		h.ServeHTTP(httptest.NewRecorder(), req)

		want := `"logging.googleapis.com/trace":"projects/my-project/traces/abc123"`
		if !bytes.Contains(buf.Bytes(), []byte(want)) {
			t.Errorf("log line missing trace field %s: %s", want, buf.Bytes())
		}
		if !bytes.Contains(buf.Bytes(), []byte(`"logging.googleapis.com/spanId":"456"`)) {
			t.Errorf("log line missing span id: %s", buf.Bytes())
		}
	})

	t.Run("omits trace when no project id is configured", func(t *testing.T) {
		var buf bytes.Buffer
		logger := platformlog.New(config.Config{LogLevel: config.LevelError}, &buf)
		h := Logging(logger, "")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))

		req := httptest.NewRequest(http.MethodGet, "/boom", nil)
		req.Header.Set(cloudTraceHeader, "abc123/456;o=1")
		h.ServeHTTP(httptest.NewRecorder(), req)

		if bytes.Contains(buf.Bytes(), []byte("logging.googleapis.com/trace")) {
			t.Errorf("trace field present without a project id: %s", buf.Bytes())
		}
	})
}

func TestCloudTraceParsing(t *testing.T) {
	cases := []struct {
		name      string
		header    string
		project   string
		wantTrace string
		wantSpan  string
	}{
		{"full header", "abc/42;o=1", "p", "projects/p/traces/abc", "42"},
		{"trace only", "abc", "p", "projects/p/traces/abc", ""},
		{"trace and span no options", "abc/42", "p", "projects/p/traces/abc", "42"},
		{"span-less options suffix", "abc;o=1", "p", "projects/p/traces/abc", ""},
		{"no project", "abc/42", "", "", ""},
		{"no header", "", "p", "", ""},
		{"empty trace id", "/42", "p", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			trace, span := cloudTrace(tc.header, tc.project)
			if trace != tc.wantTrace || span != tc.wantSpan {
				t.Errorf("cloudTrace(%q, %q) = (%q, %q), want (%q, %q)",
					tc.header, tc.project, trace, span, tc.wantTrace, tc.wantSpan)
			}
		})
	}
}

func TestRecoveryReturns500AndLogs(t *testing.T) {
	var buf bytes.Buffer
	logger := platformlog.New(config.Config{LogLevel: config.LevelError}, &buf)

	// Recovery uses the request-scoped logger placed on the context by Logging,
	// so chain them as the server does.
	h := Chain(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			panic("kaboom")
		}),
		RequestIDMiddleware(),
		Logging(logger, ""),
		Recovery(),
	)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/panic", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	if !bytes.Contains(buf.Bytes(), []byte("panic recovered")) {
		t.Errorf("expected a 'panic recovered' log line, got: %s", buf.Bytes())
	}
	// The panic value must not leak into the client response body.
	if bytes.Contains(rec.Body.Bytes(), []byte("kaboom")) {
		t.Errorf("panic value leaked to client: %s", rec.Body.Bytes())
	}
}
