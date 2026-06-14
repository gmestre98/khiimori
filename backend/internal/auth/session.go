package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// A signed-in user carries an authenticated session on every request. Like the
// OAuth state cookie (state.go), the session is a stateless, HMAC-signed cookie
// rather than a server-side store: the service is a scale-to-zero modular
// monolith that may run several Cloud Run instances and is torn down when idle,
// so a signed cookie survives instance churn and needs no per-request database
// read. The payload is just the user id plus issue/expiry timestamps; the HMAC
// makes it tamper-evident. See backend/docs/sessions.md for the mechanism and
// its trade-offs (notably: sign-out is client-side; there is no server-side
// revocation list in v1).
const (
	sessionCookieName = "khiimori_session"
	// Sent on every API call (not just /auth), so the middleware can authenticate
	// any route.
	sessionCookiePath = "/"
	// Default session lifetime. Long by design: re-auth must be smooth, not a hard
	// logout mid-trip (PRD §6). The middleware slides it on activity (S4), so an
	// active user effectively never gets logged out while 30 days of inactivity
	// expires the session.
	sessionTTL = 30 * 24 * time.Hour
)

// errNoSession distinguishes "no session cookie present" from a malformed or
// tampered one, so callers (the middleware) can treat both as unauthenticated
// without conflating them in logs.
var errNoSession = errors.New("auth: no session cookie")

// sessionManager issues and validates the signed session cookie. It holds only
// the HMAC key, the Secure/SameSite policy, and the lifetime; it keeps no
// per-request or per-user state.
type sessionManager struct {
	key    []byte // HMAC-SHA256 signing key (from SESSION_SECRET, S4)
	secure bool   // production: Secure + SameSite=None (cross-site SPA→API)
	ttl    time.Duration
}

// newSessionManager builds a manager from the signing key, the Secure flag, and
// the session lifetime. A nil/empty key is allowed at construction; issue/verify
// then report the misconfiguration at call time (mirrors the OAuth call-time
// check), so the service still boots for non-auth work.
func newSessionManager(key []byte, secure bool, ttl time.Duration) *sessionManager {
	return &sessionManager{key: key, secure: secure, ttl: ttl}
}

// configured reports whether a signing key is present. Without it no session can
// be issued or validated.
func (s *sessionManager) configured() bool { return len(s.key) > 0 }

// issue writes a fresh signed session cookie for userID to w. It errors if no
// signing key is configured so the caller fails the sign-in loudly rather than
// minting an unsigned credential.
func (s *sessionManager) issue(w http.ResponseWriter, userID string) error {
	if !s.configured() {
		return errors.New("auth: session signing key not configured")
	}
	now := time.Now()
	value := s.sign(userID, now, now.Add(s.ttl))

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     sessionCookiePath,
		MaxAge:   int(s.ttl.Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: s.sameSite(),
	})
	return nil
}

// verify reads the session cookie from r, checks its HMAC and expiry, and
// returns the authenticated user id and the time the session was issued (the
// latter lets the middleware decide whether to slide the cookie, S4). It returns
// errNoSession when the cookie is absent and a distinct error when it is present
// but invalid; either way the caller treats the request as unauthenticated.
func (s *sessionManager) verify(r *http.Request) (userID string, issuedAt time.Time, err error) {
	if !s.configured() {
		return "", time.Time{}, errors.New("auth: session signing key not configured")
	}
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return "", time.Time{}, errNoSession
	}
	return s.parse(c.Value)
}

// refreshIfStale slides the session forward: once more than half its lifetime
// has elapsed it re-issues a fresh cookie, so an actively-used session never
// hits a hard expiry mid-trip (PRD §6) while an idle one still lapses after the
// full ttl. It is best-effort — on a re-issue error the existing valid session
// is left untouched — and a no-op while the session is still in its first half.
func (s *sessionManager) refreshIfStale(w http.ResponseWriter, userID string, issuedAt time.Time) {
	if time.Since(issuedAt) < s.ttl/2 {
		return
	}
	_ = s.issue(w, userID)
}

// clear expires the session cookie (sign-out). The attributes must match
// issue's (name, path, secure, sameSite) so the browser overwrites the right
// cookie. It needs no signing key and is safe to call when already signed out —
// it just (re-)deletes the cookie, making sign-out idempotent.
func (s *sessionManager) clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     sessionCookiePath,
		MaxAge:   -1, // delete now
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: s.sameSite(),
	})
}

// sameSite picks the cookie's SameSite policy from the Secure flag. In
// production the web app (Firebase Hosting) and API (Cloud Run) are
// cross-site, so the session cookie must be SameSite=None to be sent on the
// SPA's fetch calls — which the browser only honours together with Secure. In
// dev both run on localhost (same-site), so Lax works without Secure (plain
// http).
func (s *sessionManager) sameSite() http.SameSite {
	if s.secure {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}

// sign encodes "<b64(userID)>.<issued>.<expires>.<mac>", where mac authenticates
// the first three fields. userID is base64url-encoded so it can never contain
// the '.' separator, keeping the parts unambiguous.
func (s *sessionManager) sign(userID string, issued, expires time.Time) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(userID)) + "." +
		strconv.FormatInt(issued.Unix(), 10) + "." +
		strconv.FormatInt(expires.Unix(), 10)
	return payload + "." + s.mac(payload)
}

// parse validates a cookie value and returns the user id and issue time. Every
// failure mode (shape, signature, expiry) returns an error so an invalid session
// can never authenticate.
func (s *sessionManager) parse(value string) (userID string, issuedAt time.Time, err error) {
	parts := strings.Split(value, ".")
	if len(parts) != 4 {
		return "", time.Time{}, errors.New("auth: session cookie malformed")
	}
	payload := parts[0] + "." + parts[1] + "." + parts[2]

	// Integrity first: authenticate the payload before trusting any field.
	if subtle.ConstantTimeCompare([]byte(parts[3]), []byte(s.mac(payload))) != 1 {
		return "", time.Time{}, errors.New("auth: session signature invalid")
	}

	idBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", time.Time{}, errors.New("auth: session user id malformed")
	}
	issued, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return "", time.Time{}, errors.New("auth: session issued-at malformed")
	}
	expires, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return "", time.Time{}, errors.New("auth: session expiry malformed")
	}
	if time.Now().Unix() >= expires {
		return "", time.Time{}, errors.New("auth: session expired")
	}
	return string(idBytes), time.Unix(issued, 0), nil
}

// mac returns the URL-safe base64 HMAC-SHA256 of payload under the session key.
func (s *sessionManager) mac(payload string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
