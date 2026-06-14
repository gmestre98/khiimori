package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestStore builds a store with a fixed key so the test can recompute the MAC.
func newTestStore(secure bool) *oauthStateStore {
	return newOAuthStateStore([]byte("test-signing-key"), secure)
}

// readStateCookie returns the state cookie set on the recorder, failing if absent.
func readStateCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == stateCookieName {
			return c
		}
	}
	t.Fatalf("no %q cookie was set", stateCookieName)
	return nil
}

// TestIssueSetsSignedCookie checks the issued cookie binds state+nonce with a
// valid MAC and carries the security attributes the flow relies on.
func TestIssueSetsSignedCookie(t *testing.T) {
	t.Parallel()

	store := newTestStore(true)
	rec := httptest.NewRecorder()

	state, nonce, err := store.issue(rec)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if state == "" || nonce == "" {
		t.Fatal("issue returned an empty state or nonce")
	}
	if state == nonce {
		t.Fatal("state and nonce must be distinct random values")
	}

	c := readStateCookie(t, rec)
	parts := strings.Split(c.Value, ".")
	if len(parts) != 3 {
		t.Fatalf("cookie value = %q, want three dot-separated parts", c.Value)
	}
	if parts[0] != state || parts[1] != nonce {
		t.Errorf("cookie carries state=%q nonce=%q, want %q / %q", parts[0], parts[1], state, nonce)
	}

	// The MAC must authenticate the state+nonce payload under the store key.
	m := hmac.New(sha256.New, []byte("test-signing-key"))
	m.Write([]byte(state + "." + nonce))
	wantMAC := base64.RawURLEncoding.EncodeToString(m.Sum(nil))
	if parts[2] != wantMAC {
		t.Errorf("cookie MAC = %q, want %q", parts[2], wantMAC)
	}

	// Security attributes: HttpOnly, Secure (prod), SameSite=Lax, scoped to /auth.
	if !c.HttpOnly {
		t.Error("state cookie must be HttpOnly")
	}
	if !c.Secure {
		t.Error("state cookie must be Secure when secure=true")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %v, want Lax (cookie must survive the callback navigation)", c.SameSite)
	}
	if c.Path != stateCookiePath {
		t.Errorf("cookie Path = %q, want %q", c.Path, stateCookiePath)
	}
	if c.MaxAge <= 0 {
		t.Errorf("cookie MaxAge = %d, want a positive short-lived TTL", c.MaxAge)
	}
}

// TestIssueIsRandomPerCall asserts a fresh state and nonce are minted each call
// (no reuse), which is the CSRF/replay guarantee the flow depends on.
func TestIssueIsRandomPerCall(t *testing.T) {
	t.Parallel()

	store := newTestStore(false)

	s1, n1, err := store.issue(httptest.NewRecorder())
	if err != nil {
		t.Fatalf("issue 1: %v", err)
	}
	s2, n2, err := store.issue(httptest.NewRecorder())
	if err != nil {
		t.Fatalf("issue 2: %v", err)
	}
	if s1 == s2 {
		t.Error("state was reused across calls")
	}
	if n1 == n2 {
		t.Error("nonce was reused across calls")
	}
}

// TestIssueNotSecureInDev confirms the Secure attribute follows the flag, so the
// cookie is sent over plain http on localhost during development.
func TestIssueNotSecureInDev(t *testing.T) {
	t.Parallel()

	store := newTestStore(false)
	rec := httptest.NewRecorder()
	if _, _, err := store.issue(rec); err != nil {
		t.Fatalf("issue: %v", err)
	}
	if readStateCookie(t, rec).Secure {
		t.Error("state cookie must not be Secure when secure=false (dev over http)")
	}
}

// TestDeriveStateKeyIsDeterministicAndDomainSeparated checks the derived key is
// stable for a secret but differs from the raw secret and across secrets.
func TestDeriveStateKeyIsDeterministicAndDomainSeparated(t *testing.T) {
	t.Parallel()

	k1 := deriveStateKey("secret-a")
	k2 := deriveStateKey("secret-a")
	k3 := deriveStateKey("secret-b")

	if !hmac.Equal(k1, k2) {
		t.Error("deriveStateKey must be deterministic for the same secret")
	}
	if hmac.Equal(k1, k3) {
		t.Error("deriveStateKey must differ for different secrets")
	}
	if string(k1) == "secret-a" {
		t.Error("derived key must not equal the raw client secret")
	}
}
