package sharing

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MembershipAuthorizer implements trip authorization using TripMembership roles.
// It resolves capabilities per PRD §3:
//   - Owner: full control (read, write, manage)
//   - Editor: edit plan/budget/journal (read, write)
//   - Viewer: read-only
//   - Non-member: denied
//
// The Authorizer reads current membership state on every request — there is no
// long-lived cache — so revocation and role downgrades take effect immediately
// on the next request (PRD §5.9).
//
// The interface is intentionally string-based for the action parameter so this
// type can be adapted (in the composition root) to any consumer-side Authorizer
// interface without creating import cycles.
type MembershipAuthorizer struct {
	memberships *Memberships
}

// NewMembershipAuthorizer constructs a MembershipAuthorizer backed by pool.
func NewMembershipAuthorizer(pool *pgxpool.Pool) *MembershipAuthorizer {
	return &MembershipAuthorizer{memberships: NewMemberships(pool)}
}

// Can returns (true, nil) when userID holds a membership on tripID whose role
// grants the given action. Returns (false, nil) when the user is not a member
// or the role does not grant the action. Returns (false, non-nil) on
// infrastructure failures.
//
// Supported action values: "read", "write", "manage".
func (a *MembershipAuthorizer) Can(ctx context.Context, userID, action, tripID string) (bool, error) {
	role, err := a.memberships.RoleForUser(ctx, tripID, userID)
	if errors.Is(err, ErrMembershipNotFound) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("sharing: authorizer: %w", err)
	}
	return roleAllows(role, action), nil
}

// roleAllows reports whether role grants action. Deny-by-default: any role or
// action combination not explicitly listed returns false.
func roleAllows(role Role, action string) bool {
	switch role {
	case RoleOwner:
		return true // owner has full control: read, write, manage
	case RoleEditor:
		return action == "read" || action == "write"
	case RoleViewer:
		return action == "read"
	default:
		return false
	}
}
