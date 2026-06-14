package auth

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// chainWithLogger wraps the module's routes in the real middleware chain used by
// cmd/api, with a buffer-backed logger captured for assertions. The logger runs
// at debug level so every line (handler logs and the access log) is emitted and
// can be inspected — proving sensitive values never reach the output, not merely
// that they are filtered out by the default error level.
func chainWithLogger(m *Module) (http.Handler, *bytes.Buffer) {
	var buf bytes.Buffer
	logger := platformlog.New(config.Config{LogLevel: config.LevelDebug}, &buf)
	mux := http.NewServeMux()
	m.RegisterRoutes(mux)
	h := httpx.Chain(mux,
		httpx.RequestIDMiddleware(),
		httpx.Logging(logger, ""),
		httpx.Recovery(),
	)
	return h, &buf
}

// TestLoginNeverExposesClientSecret: the client secret is used only at runtime
// for the token exchange — it must never appear in the consent redirect, the
// response body, or any log line (AC2/AC4).
func TestLoginNeverExposesClientSecret(t *testing.T) {
	const secret = "super-secret-oauth-client-secret-value"

	m := New(config.Config{
		Env:               config.EnvDev,
		OAuthClientID:     "client.apps.googleusercontent.com",
		OAuthClientSecret: secret,
		OAuthRedirectURI:  "http://localhost:8080/auth/callback",
	}, nil) // /auth/login does not provision, so no pool is needed
	h, buf := chainWithLogger(m)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, LoginPath, nil))

	if strings.Contains(rec.Header().Get("Location"), secret) {
		t.Error("consent redirect URL leaked the client secret")
	}
	if strings.Contains(rec.Body.String(), secret) {
		t.Error("login response body leaked the client secret")
	}
	if strings.Contains(buf.String(), secret) {
		t.Errorf("logs leaked the client secret:\n%s", buf.String())
	}
}

// TestCallbackNeverLogsCodeOrTokenError: the authorization code (and any token
// in the query) must not reach the logs or the response body. The callback logs
// the exchange failure reason, never the code/token (AC3/AC4).
func TestCallbackNeverLogsCodeOrTokenError(t *testing.T) {
	const code = "super-secret-authorization-code"

	store := newOAuthStateStore([]byte("test-key"), false)
	m := &Module{
		provider:   &fakeProvider{err: errors.New("id-token verification failed")},
		stateStore: store,
		configured: true,
		// Exchange fails before the sign-in seam runs, so this is never invoked;
		// a no-op keeps the module valid without needing a database.
		onVerified: func(http.ResponseWriter, *http.Request, VerifiedIdentity) {},
	}
	h, buf := chainWithLogger(m)

	state, _, cookie := issueCookie(t, store)
	req := httptest.NewRequest(http.MethodGet, CallbackPath+"?state="+state+"&code="+code, nil)
	req.AddCookie(cookie)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if strings.Contains(buf.String(), code) {
		t.Errorf("logs leaked the authorization code:\n%s", buf.String())
	}
	if strings.Contains(rec.Body.String(), code) {
		t.Error("callback response body leaked the authorization code")
	}
}

// TestRedactionCoversAuthSensitiveKeys is a guard on the shared logger: the
// field keys the auth flow would use for sensitive values are redacted, so an
// accidental structured log of one never emits the value (AC4). This locks in
// the dependency on the M01.7 redaction the auth module relies on rather than
// inventing its own.
func TestRedactionCoversAuthSensitiveKeys(t *testing.T) {
	var buf bytes.Buffer
	logger := platformlog.New(config.Config{LogLevel: config.LevelError}, &buf)

	logger.Error("auth boom",
		"oauth_client_secret", "the-secret",
		"id_token", "header.payload.sig",
		"access_token", "ya29.token",
		"authorization", "Bearer abc",
	)

	out := buf.String()
	for _, leaked := range []string{"the-secret", "header.payload.sig", "ya29.token", "Bearer abc"} {
		if strings.Contains(out, leaked) {
			t.Errorf("sensitive value %q was not redacted:\n%s", leaked, out)
		}
	}
}
