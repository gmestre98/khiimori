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
	// invitations is the concrete store; invCreate is the seam used by the handler
	// (tests may supply a fake without a real pool).
	invitations *Invitations
	invCreate   invitationCreator
	// invList is the read seam used by the list handler; defaults to invitations.
	invList invitationLister
	// pendingList is the read seam for the in-app inbox; defaults to invitations.
	pendingList pendingInvitationLister
	authz       invitationAuthorizer
	emailSender EmailSender
	// requireAuth is the auth middleware injected by the composition root.
	requireAuth httpx.Middleware
	// requireAdmin is the admin middleware injected by the composition root.
	// When set, admin trip-membership endpoints are mounted.
	requireAdmin httpx.Middleware
	// webAppURL is the base URL for the accept link in invitation emails.
	webAppURL string
	// tripNames and inviterNames resolve display names for the invite email;
	// nil when not wired (falls back to empty strings in the email).
	tripNames    tripNameReader
	inviterNames inviterNameReader
	// userEmails resolves the signed-in user's verified email for invitation
	// acceptance. Nil when not wired; accept handler returns 500.
	userEmails userEmailReader
	// memberProfiles batch-resolves member display identities (email/name/avatar)
	// for the members list. Nil when not wired: the list falls back to user ids.
	memberProfiles memberProfileReader
	// exposeInviteTokens, when true, includes each invitation's opaque accept
	// token in the owner-only invitations list response. It is enabled ONLY on an
	// E2E-targeted environment (gated on the same E2E_LOGIN_SECRET as test-login,
	// M10.2): the harness has no email inbox, so it reads the token from the list
	// to drive the real invite→accept flow. Off by default (production), the token
	// stays email-only as designed.
	exposeInviteTokens bool
	// pool is needed for the accept handler's transaction.
	pool *pgxpool.Pool
}

// Options groups optional fields for New.
type Options struct {
	Authz       invitationAuthorizer
	EmailSender EmailSender
	RequireAuth httpx.Middleware
	// RequireAdmin gates the admin trip-membership endpoints.
	RequireAdmin httpx.Middleware
	WebAppURL    string
	TripNames    tripNameReader
	InviterNames inviterNameReader
	UserEmails   userEmailReader
	// MemberProfiles batch-resolves member display identities for the members list.
	MemberProfiles memberProfileReader
	// ExposeInviteTokens enables returning invitation accept tokens in the
	// owner-only list response. Set only on an E2E-targeted environment so the
	// harness can accept invites without an email inbox (M10.2).
	ExposeInviteTokens bool
}

// New constructs the sharing module with its Memberships service.
func New(pool *pgxpool.Pool, opts Options) *Module {
	inv := NewInvitations(pool)
	return &Module{
		memberships:        NewMemberships(pool),
		invitations:        inv,
		invCreate:          inv,
		invList:            inv,
		pendingList:        inv,
		authz:              opts.Authz,
		emailSender:        opts.EmailSender,
		requireAuth:        opts.RequireAuth,
		requireAdmin:       opts.RequireAdmin,
		webAppURL:          opts.WebAppURL,
		tripNames:          opts.TripNames,
		inviterNames:       opts.InviterNames,
		userEmails:         opts.UserEmails,
		memberProfiles:     opts.MemberProfiles,
		exposeInviteTokens: opts.ExposeInviteTokens,
		pool:               pool,
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
		mux.Handle("GET "+MembershipsListPath, m.requireAuth(http.HandlerFunc(m.handleListMemberships)))
		mux.Handle("GET "+InvitationsListPath, m.requireAuth(http.HandlerFunc(m.handleListInvitations)))
		mux.Handle("POST "+InvitationsPath, m.requireAuth(http.HandlerFunc(m.handleCreateInvitation)))
		mux.Handle("DELETE "+InvitationItemPath, m.requireAuth(http.HandlerFunc(m.handleRevokeInvitation)))
		mux.Handle("POST "+AcceptInvitePath, m.requireAuth(http.HandlerFunc(m.handleAcceptInvitation)))
		// User-scoped invitation inbox: discover and accept invites in-app, no
		// email required (the invite email is best-effort).
		mux.Handle("GET "+MyInvitationsPath, m.requireAuth(http.HandlerFunc(m.handleListMyInvitations)))
		mux.Handle("POST "+MyInvitationAcceptPath, m.requireAuth(http.HandlerFunc(m.handleAcceptMyInvitation)))
		mux.Handle("PATCH "+MembershipPath, m.requireAuth(http.HandlerFunc(m.handleChangeRole)))
		mux.Handle("DELETE "+MembershipPath, m.requireAuth(http.HandlerFunc(m.handleRevokeMembership)))
	}
	if m.requireAdmin != nil {
		mux.Handle("POST "+AdminTripMembersPath, m.requireAdmin(http.HandlerFunc(m.handleAdminGrantAccess)))
		mux.Handle("PATCH "+AdminTripMemberPath, m.requireAdmin(http.HandlerFunc(m.handleAdminChangeRole)))
		mux.Handle("DELETE "+AdminTripMemberPath, m.requireAdmin(http.HandlerFunc(m.handleAdminRevokeAccess)))
	}
}

// Compile-time check that *Module implements the route-mounting contract.
var _ httpx.RouteRegistrar = (*Module)(nil)
