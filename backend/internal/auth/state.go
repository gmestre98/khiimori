package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"time"
)

// The sign-in flow needs two unguessable values created at /auth/login and read
// back at /auth/callback: a CSRF `state` (echoed by Google, compared on
// callback) and an OIDC `nonce` (embedded in the ID token, checked in S3).
//
// They are carried in a short-lived, HMAC-signed cookie rather than a
// server-side store. This is deliberate: the service is a scale-to-zero
// modular monolith that may run several Cloud Run instances and is torn down
// when idle, so any in-process store would be lost or unshared. A signed cookie
// is stateless, survives instance churn, and the HMAC makes both values
// tamper-evident. The cookie is HttpOnly + SameSite=Lax (so it survives the
// top-level GET navigation back from Google) and Secure in production.
const (
	stateCookieName = "khiimori_oauth_state"
	stateCookieTTL  = 10 * time.Minute
	// Scoped to /auth so the cookie is sent on /auth/callback but nowhere else.
	stateCookiePath = "/auth"
	// 32 bytes = 256 bits of entropy per value.
	stateTokenBytes = 32
)

// oauthStateStore issues and (in S3) verifies the signed state cookie. It holds
// only the HMAC key and the Secure flag; it keeps no per-request state.
type oauthStateStore struct {
	key    []byte // HMAC-SHA256 signing key (see deriveStateKey)
	secure bool   // set the Secure cookie attribute (true in prod)
}

// newOAuthStateStore builds a store from a signing key and the Secure flag.
func newOAuthStateStore(signingKey []byte, secure bool) *oauthStateStore {
	return &oauthStateStore{key: signingKey, secure: secure}
}

// issue generates a fresh state and nonce, writes the signed cookie binding
// them to w, and returns the pair so the caller can pass them to AuthCodeURL.
func (s *oauthStateStore) issue(w http.ResponseWriter) (state, nonce string, err error) {
	state, err = randomToken()
	if err != nil {
		return "", "", err
	}
	nonce, err = randomToken()
	if err != nil {
		return "", "", err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    s.sign(state, nonce),
		Path:     stateCookiePath,
		MaxAge:   int(stateCookieTTL.Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
	return state, nonce, nil
}

// sign encodes "<state>.<nonce>.<mac>" where mac authenticates the first two
// fields. state and nonce are URL-safe base64 with no '.', so the three parts
// split unambiguously (read back in S3).
func (s *oauthStateStore) sign(state, nonce string) string {
	payload := state + "." + nonce
	return payload + "." + s.mac(payload)
}

// mac returns the URL-safe base64 HMAC-SHA256 of payload under the store key.
func (s *oauthStateStore) mac(payload string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// randomToken returns a URL-safe base64 string of stateTokenBytes random bytes.
func randomToken() (string, error) {
	b := make([]byte, stateTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// deriveStateKey derives the cookie-signing key from the OAuth client secret via
// a domain-separated HMAC, so no separate signing secret has to be provisioned:
// the client secret is already a high-entropy value the service holds (S5).
// Domain separation ('khiimori:oauth-state-cookie:v1') ensures this key can
// never coincide with another use of the same secret.
func deriveStateKey(clientSecret string) []byte {
	m := hmac.New(sha256.New, []byte(clientSecret))
	m.Write([]byte("khiimori:oauth-state-cookie:v1"))
	return m.Sum(nil)
}
