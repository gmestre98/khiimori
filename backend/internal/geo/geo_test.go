package geo

import (
	"net/http"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

func TestNewReturnsModule(t *testing.T) {
	t.Parallel()
	m := New()
	if m == nil {
		t.Fatal("New() returned nil")
	}
}

func TestModuleImplementsRouteRegistrar(t *testing.T) {
	t.Parallel()
	var _ httpx.RouteRegistrar = (*Module)(nil)
}

func TestRegisterRoutesMountsNoEndpoints(t *testing.T) {
	t.Parallel()
	m := New()
	mux := http.NewServeMux()
	// Should not panic; no endpoints registered yet (interface arrives in S2).
	m.RegisterRoutes(mux)
}
