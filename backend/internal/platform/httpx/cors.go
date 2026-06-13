package httpx

import "net/http"

// corsAllowMethods is the fixed set of methods advertised on a preflight
// response. It covers the verbs the API will use; it is not a per-route
// allowlist (authorization, not CORS, gates what a caller may actually do).
const corsAllowMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

// corsPreflightMaxAge caps how long (seconds) a browser may cache a preflight
// result, so an origin change isn't masked by a stale cached preflight for long.
const corsPreflightMaxAge = "600"

// CORS returns middleware that grants cross-origin access to browser requests
// whose Origin is in allowedOrigins, and answers CORS preflight (OPTIONS)
// requests. Origins are matched exactly (scheme + host + port) — never a
// wildcard — so only the configured web origins (local dev + Firebase Hosting)
// are allowed (PRD §6). The allowed origin is echoed back rather than "*", and
// a Vary: Origin header keeps caches from serving one origin's response to
// another.
//
// When allowedOrigins is empty the middleware is effectively a no-op: no Origin
// matches, so the browser blocks cross-origin reads. Same-origin and non-browser
// callers (which send no Origin) are never affected.
//
// Credentialed requests are not enabled yet (no Access-Control-Allow-Credentials)
// because v1 has no cookie-based session; when sessions land (M02) that header is
// added here alongside the origin echo.
func CORS(allowedOrigins []string) Middleware {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			_, isAllowed := allowed[origin]

			if origin != "" {
				// The response depends on the request Origin whether or not it
				// is allowed, so always advertise that to caches.
				w.Header().Add("Vary", "Origin")
			}
			if origin != "" && isAllowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}

			// A CORS preflight is an OPTIONS carrying Access-Control-Request-Method.
			// Answer it here without reaching domain handlers. The Allow-* headers
			// are only added for an allowed origin, so a disallowed origin gets a
			// 204 with no CORS grant and the browser blocks the real request.
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				if origin != "" && isAllowed {
					h := w.Header()
					h.Set("Access-Control-Allow-Methods", corsAllowMethods)
					// Echo the requested headers so the preflight passes for
					// whatever headers the client intends to send.
					if reqHeaders := r.Header.Get("Access-Control-Request-Headers"); reqHeaders != "" {
						h.Set("Access-Control-Allow-Headers", reqHeaders)
						h.Add("Vary", "Access-Control-Request-Headers")
					}
					h.Set("Access-Control-Max-Age", corsPreflightMaxAge)
				}
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
