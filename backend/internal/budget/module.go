package budget

import (
	"net/http"

	"github.com/gmestre98/eudaimonia/backend/internal/platform/httpx"
)

// Module is the budget module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct{}

// New constructs the budget module.
func New() *Module { return &Module{} }

// RegisterRoutes mounts the budget module's HTTP routes onto mux. The module has no
// endpoints yet; handlers arrive in later milestones.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
