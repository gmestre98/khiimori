package auth

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestDriveAuthCodeURL_ScopeAndOfflineParams(t *testing.T) {
	p := NewDriveOAuthProvider("client-id", "secret", "https://app.example/api/integrations/google-drive/callback")
	raw := p.AuthCodeURL("the-state")

	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse auth url: %v", err)
	}
	q := u.Query()
	if got := q.Get("scope"); got != driveFileScope {
		t.Errorf("scope = %q, want %q", got, driveFileScope)
	}
	if got := q.Get("access_type"); got != "offline" {
		t.Errorf("access_type = %q, want offline", got)
	}
	if got := q.Get("prompt"); got != "consent" {
		t.Errorf("prompt = %q, want consent (needed to always return a refresh token)", got)
	}
	if got := q.Get("state"); got != "the-state" {
		t.Errorf("state = %q, want the-state", got)
	}
	if got := q.Get("client_id"); got != "client-id" {
		t.Errorf("client_id = %q, want client-id", got)
	}
}

func TestDriveExchange_ParsesTokenAndScopes(t *testing.T) {
	// A stub token endpoint returning a refresh token + granted scope.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"at-123","refresh_token":"rt-456",` +
			`"token_type":"Bearer","expires_in":3600,` +
			`"scope":"https://www.googleapis.com/auth/drive.file"}`))
	}))
	defer srv.Close()

	p := NewDriveOAuthProvider("client-id", "secret", "https://app.example/cb")
	p.cfg.Endpoint.TokenURL = srv.URL // point the exchange at the stub
	p.httpClient = srv.Client()

	tok, err := p.Exchange(context.Background(), "auth-code")
	if err != nil {
		t.Fatalf("Exchange: %v", err)
	}
	if tok.AccessToken != "at-123" {
		t.Errorf("access token = %q, want at-123", tok.AccessToken)
	}
	if tok.RefreshToken != "rt-456" {
		t.Errorf("refresh token = %q, want rt-456", tok.RefreshToken)
	}
	if !hasScope(tok.Scopes, driveFileScope) {
		t.Errorf("scopes = %v, want to contain %q", tok.Scopes, driveFileScope)
	}
	if tok.Expiry.Before(time.Now()) {
		t.Errorf("expiry = %v, want in the future", tok.Expiry)
	}
}

func TestDriveStateSigner_RoundTrip(t *testing.T) {
	s := newDriveStateSigner("secret")
	state, err := s.sign("user-42")
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	got, err := s.verify(state)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got != "user-42" {
		t.Errorf("verified user = %q, want user-42", got)
	}
}

func TestDriveStateSigner_RejectsTamperedAndExpired(t *testing.T) {
	s := newDriveStateSigner("secret")

	t.Run("tampered signature", func(t *testing.T) {
		state, _ := s.sign("user-1")
		if _, err := s.verify(state + "x"); err == nil {
			t.Error("expected error for tampered state")
		}
	})

	t.Run("different key can't verify", func(t *testing.T) {
		state, _ := s.sign("user-1")
		other := newDriveStateSigner("different-secret")
		if _, err := other.verify(state); err == nil {
			t.Error("expected error verifying under a different key")
		}
	})

	t.Run("malformed", func(t *testing.T) {
		if _, err := s.verify("not.a.valid"); err == nil {
			t.Error("expected error for malformed state")
		}
	})

	t.Run("expired", func(t *testing.T) {
		// Build a state whose expiry is in the past but signed correctly.
		payload := base64.RawURLEncoding.EncodeToString([]byte("user-1")) +
			".nonce." + strconv.FormatInt(time.Now().Add(-time.Minute).Unix(), 10)
		expired := payload + "." + s.mac(payload)
		if _, err := s.verify(expired); err == nil {
			t.Error("expected error for expired state")
		}
	})
}

func TestParseScopeField(t *testing.T) {
	cases := map[string][]string{
		"a b c": {"a", "b", "c"},
		"  a  ": {"a"},
		"":      nil,
	}
	for in, want := range cases {
		got := parseScopeField(in)
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("parseScopeField(%q) = %v, want %v", in, got, want)
		}
	}
	if got := parseScopeField(123); got != nil {
		t.Errorf("parseScopeField(non-string) = %v, want nil", got)
	}
}
