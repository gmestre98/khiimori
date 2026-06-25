package sharing

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// Module is the sharing module's public surface. It satisfies httpx.RouteRegistrar
// so cmd/api can mount the module's routes without reaching into its internals.
type Module struct {
	memberships *Memberships
	invitations *Invitations
	// invCreate is the seam used by the invite handler; defaults to invitations.
	// Tests may supply a fake to avoid a real DB pool.
	invCreate   invitationCreator
	authz       invitationAuthorizer
	emailSender EmailSender
	// requireAuth is the auth middleware injected by the composition root.
	requireAuth httpx.Middleware
	// webAppURL is the base URL for the accept link in invitation emails.
	webAppURL string
	// tripNames and inviterNames resolve display names for the invite email;
	// nil when not wired (falls back to empty strings in the email).
	tripNames    tripNameReader
	inviterNames inviterNameReader
	// userEmails resolves the signed-in user's verified email for invitation
	// acceptance. Nil when not wired; accept handler returns 500.
	userEmails userEmailReader
	// pool is needed for the accept handler's transaction.
	pool *pgxpool.Pool
}

// Options groups optional fields for New.
type Options struct {
	Authz        invitationAuthorizer
	EmailSender  EmailSender
	RequireAuth  httpx.Middleware
	WebAppURL    string
	TripNames    tripNameReader
	InviterNames inviterNameReader
	UserEmails   userEmailReader
}

// New constructs the sharing module with its Memberships service.
func New(pool *pgxpool.Pool, opts Options) *Module {
	inv := NewInvitations(pool)
	return &Module{
		memberships:  NewMemberships(pool),
		invitations:  inv,
		invCreate:    inv,
		authz:        opts.Authz,
		emailSender:  opts.EmailSender,
		requireAuth:  opts.RequireAuth,
		webAppURL:    opts.WebAppURL,
		tripNames:    opts.TripNames,
		inviterNames: opts.InviterNames,
		userEmails:   opts.UserEmails,
		pool:         pool,
	}
}

// MembershipsService exposes the membership lifecycle for use by other modules
// (e.g. the trip module's composition root needs CreateOwner).
func (m *Module) MembershipsService() *Memberships { return m.memberships }

// InvitationsService exposes the invitation store for use by the accept handler
// and tests.
func (m *Module) InvitationsService() *Invitations { return m.invitations }

// RegisterRoutes mounts the sharing module's HTTP routes onto mux.
func (m *Module) RegisterRoutes(mux *http.ServeMux) {
	if m.requireAuth != nil {
		mux.Handle("POST "+InvitationsPath, m.requireAuth(http.HandlerFunc(m.handleCreateInvitation)))
		mux.Handle("POST "+AcceptInvitePath, m.requireAuth(http.HandlerFunc(m.handleAcceptInvitation)))
	}
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
