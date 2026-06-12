// Package httpx holds the shared HTTP plumbing for the modular monolith — the
// route-registration contract that lets cmd/api mount every domain module
// uniformly, plus (in later stories) the common middleware chain. It is part of
// the platform layer, so any module may import it; it imports no domain module.
package httpx

import "net/http"

// RouteRegistrar is the contract a domain module exposes so the composition root
// (cmd/api) can mount its routes without importing the module's internals. Each
// module returns a value satisfying this interface from its constructor.
type RouteRegistrar interface {
	// RegisterRoutes mounts the module's own routes onto mux. Implementations
	// register only their own paths; cmd/api owns assembly and ordering.
	RegisterRoutes(mux *http.ServeMux)
}
