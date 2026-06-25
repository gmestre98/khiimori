package sharing

import (
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Module is the sharing module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	memberships *Memberships
}

// New constructs the sharing module with its Memberships service.
func New(pool *pgxpool.Pool) *Module {
	return &Module{memberships: NewMemberships(pool)}
}

// Memberships exposes the membership lifecycle for use by other modules (e.g.
// the trip module's composition root needs CreateOwner).
func (m *Module) MembershipsService() *Memberships { return m.memberships }

// RegisterRoutes mounts the sharing module's HTTP routes onto mux. The module has no
// endpoints yet; handlers arrive in later milestones.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
