package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// fakeDriveProvider is a driveAuthProvider stub.
type fakeDriveProvider struct {
	authURL   string
	token     *DriveToken
	exchErr   error
	gotCode   string
	exchCalls int
}

func (f *fakeDriveProvider) AuthCodeURL(state string) string {
	if f.authURL != "" {
		return f.authURL + "?state=" + state
	}
	return "https://accounts.google.com/o/oauth2/auth?state=" + state
}

func (f *fakeDriveProvider) Exchange(_ context.Context, code string) (*DriveToken, error) {
	f.exchCalls++
	f.gotCode = code
	return f.token, f.exchErr
}

// driveConnectCapture records what the onDriveConnected seam received.
type driveConnectCapture struct {
	called bool
	userID string
	tok    *DriveToken
	err    error
}

// newDriveModule builds a configured Module for the Drive flow with a capturing
// connector. webAppURL is set so failure/success go through the redirect path.
func newDriveModule(p driveAuthProvider) (*Module, *driveStateSigner, *driveConnectCapture) {
	state := newDriveStateSigner("test-secret")
	cap := &driveConnectCapture{}
	m := &Module{
		driveConfigured: true,
		driveProvider:   p,
		driveState:      state,
		webAppURL:       "https://app.example",
		onDriveConnected: func(_ context.Context, userID string, tok *DriveToken) error {
			cap.called = true
			cap.userID = userID
			cap.tok = tok
			return cap.err
		},
	}
	return m, state, cap
}

func withPrincipal(r *http.Request, userID string) *http.Request {
	return r.WithContext(authn.WithPrincipal(r.Context(), authn.Principal{UserID: userID}))
}

func TestDriveConnect_RedirectsToConsentWithBoundState(t *testing.T) {
	p := &fakeDriveProvider{authURL: "https://consent.example/auth"}
	m, signer, _ := newDriveModule(p)

	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveConnectPath, nil), "user-7")
	m.handleDriveConnect(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if !strings.HasPrefix(loc, "https://consent.example/auth") {
		t.Fatalf("Location = %q, want consent URL", loc)
	}
	// The state carried in the redirect must verify back to the signed-in user.
	gotState := loc[strings.Index(loc, "state=")+len("state="):]
	user, err := signer.verify(gotState)
	if err != nil || user != "user-7" {
		t.Fatalf("state did not bind user-7 (user=%q err=%v)", user, err)
	}
}

func TestDriveCallback_HappyPathPersistsAndRedirects(t *testing.T) {
	p := &fakeDriveProvider{token: &DriveToken{RefreshToken: "rt", Scopes: []string{driveFileScope}}}
	m, signer, cap := newDriveModule(p)
	state, _ := signer.sign("user-7")

	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveCallbackPath+"?code=abc&state="+state, nil), "user-7")
	m.handleDriveCallback(rec, req)

	if p.exchCalls != 1 || p.gotCode != "abc" {
		t.Errorf("exchange calls=%d code=%q, want 1/abc", p.exchCalls, p.gotCode)
	}
	if !cap.called || cap.userID != "user-7" || cap.tok.RefreshToken != "rt" {
		t.Errorf("connector not called correctly: %+v", cap)
	}
	if rec.Code != http.StatusFound || !strings.Contains(rec.Header().Get("Location"), "drive=connected") {
		t.Errorf("want redirect with drive=connected, got %d %q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestDriveCallback_ConsentDenied(t *testing.T) {
	p := &fakeDriveProvider{}
	m, _, cap := newDriveModule(p)

	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveCallbackPath+"?error=access_denied", nil), "user-7")
	m.handleDriveCallback(rec, req)

	if p.exchCalls != 0 {
		t.Error("code should not be exchanged when consent was denied")
	}
	if cap.called {
		t.Error("connector must not be called on denied consent")
	}
	if !strings.Contains(rec.Header().Get("Location"), "drive_error=drive_consent_denied") {
		t.Errorf("want drive_consent_denied marker, got %q", rec.Header().Get("Location"))
	}
}

func TestDriveCallback_TransientGoogleErrorIsNotADecline(t *testing.T) {
	// A non-access_denied error (e.g. Google server_error) must not be reported
	// to the user as "declined" — it's a retryable failure.
	p := &fakeDriveProvider{}
	m, _, cap := newDriveModule(p)

	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveCallbackPath+"?error=server_error", nil), "user-7")
	m.handleDriveCallback(rec, req)

	if p.exchCalls != 0 || cap.called {
		t.Error("no exchange/persist on an error redirect")
	}
	loc := rec.Header().Get("Location")
	if strings.Contains(loc, "drive_consent_denied") {
		t.Errorf("transient error mislabeled as declined: %q", loc)
	}
	if !strings.Contains(loc, "drive_error=drive_connect_failed") {
		t.Errorf("want drive_connect_failed marker, got %q", loc)
	}
}

func TestDriveCallback_StateBoundToDifferentUserRejected(t *testing.T) {
	p := &fakeDriveProvider{token: &DriveToken{RefreshToken: "rt", Scopes: []string{driveFileScope}}}
	m, signer, cap := newDriveModule(p)
	// State bound to attacker, but the session principal is the victim.
	state, _ := signer.sign("attacker")

	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveCallbackPath+"?code=abc&state="+state, nil), "victim")
	m.handleDriveCallback(rec, req)

	if p.exchCalls != 0 {
		t.Error("code must not be exchanged when state user != session user (CSRF)")
	}
	if cap.called {
		t.Error("connector must not be called on state/session mismatch")
	}
	if !strings.Contains(rec.Header().Get("Location"), "drive_error=drive_state_invalid") {
		t.Errorf("want drive_state_invalid marker, got %q", rec.Header().Get("Location"))
	}
}

func TestDriveCallback_ScopeNotGrantedRejected(t *testing.T) {
	// Exchange succeeds but the user unchecked the Drive permission.
	p := &fakeDriveProvider{token: &DriveToken{RefreshToken: "rt", Scopes: []string{"openid", "email"}}}
	m, signer, cap := newDriveModule(p)
	state, _ := signer.sign("user-7")

	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveCallbackPath+"?code=abc&state="+state, nil), "user-7")
	m.handleDriveCallback(rec, req)

	if cap.called {
		t.Error("connector must not be called when drive.file was not granted")
	}
	if !strings.Contains(rec.Header().Get("Location"), "drive_error=drive_scope_missing") {
		t.Errorf("want drive_scope_missing marker, got %q", rec.Header().Get("Location"))
	}
}

func TestDriveCallback_ExchangeFailure(t *testing.T) {
	p := &fakeDriveProvider{exchErr: errors.New("boom")}
	m, signer, cap := newDriveModule(p)
	state, _ := signer.sign("user-7")

	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveCallbackPath+"?code=abc&state="+state, nil), "user-7")
	m.handleDriveCallback(rec, req)

	if cap.called {
		t.Error("connector must not be called when exchange fails")
	}
	if !strings.Contains(rec.Header().Get("Location"), "drive_error=drive_connect_failed") {
		t.Errorf("want drive_connect_failed marker, got %q", rec.Header().Get("Location"))
	}
}

func TestDriveConnect_NotConfigured(t *testing.T) {
	m := &Module{driveConfigured: false, webAppURL: "https://app.example"}
	rec := httptest.NewRecorder()
	req := withPrincipal(httptest.NewRequest("GET", DriveConnectPath, nil), "user-7")
	m.handleDriveConnect(rec, req)
	if !strings.Contains(rec.Header().Get("Location"), "drive_error=drive_not_configured") {
		t.Errorf("want drive_not_configured marker, got %d %q", rec.Code, rec.Header().Get("Location"))
	}
}
