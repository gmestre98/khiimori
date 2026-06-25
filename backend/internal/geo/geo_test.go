package geo

import (
	"net/http"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// noopMiddleware is a pass-through auth middleware for unit tests.
func noopMiddleware(next http.Handler) http.Handler { return next }

func TestNewReturnsModule(t *testing.T) {
	t.Parallel()
	m := New(nil, noopMiddleware)
	if m == nil {
		t.Fatal("New() returned nil")
	}
}

func TestModuleImplementsRouteRegistrar(t *testing.T) {
	t.Parallel()
	var _ httpx.RouteRegistrar = (*Module)(nil)
}

func TestRegisterRoutesMountsRoutes(t *testing.T) {
	t.Parallel()
	m := New(nil, noopMiddleware)
	mux := http.NewServeMux()
	m.RegisterRoutes(mux)
}
