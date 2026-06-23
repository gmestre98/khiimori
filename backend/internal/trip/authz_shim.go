package trip

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ownershipReader is the internal seam used by OwnerOnlyAuthorizer to check
// whether a user holds the Owner role for a trip. The production implementation
// queries sharing.trip_memberships; tests inject a fake.
type ownershipReader interface {
	isOwner(ctx context.Context, userID, tripID string) (bool, error)
}

// OwnerOnlyAuthorizer is the v1 Authorizer shim: an owner may perform any
// action on their trip; non-owners are denied. It satisfies the Authorizer
// interface and is structured so Milestone 08's membership-based Authorizer is
// a drop-in replacement — no caller changes required (PRD §7.0).
//
// Ownership is resolved by checking for an Owner TripMembership row
// (sharing.trip_memberships with role='owner'), so behaviour is already
// membership-shaped before Milestone 08 generalises it.
type OwnerOnlyAuthorizer struct {
	reader ownershipReader
}

// NewOwnerOnlyAuthorizer constructs an OwnerOnlyAuthorizer backed by the given
// database pool. It queries sharing.trip_memberships to resolve ownership, so
// the access model is membership-shaped from the start.
func NewOwnerOnlyAuthorizer(pool *pgxpool.Pool) *OwnerOnlyAuthorizer {
	return &OwnerOnlyAuthorizer{reader: &pgxOwnershipReader{pool: pool}}
}

// Can returns (true, nil) when userID holds the Owner membership for tripID —
// granting all actions — and (false, nil) when they do not. Infrastructure
// failures (DB errors, context cancellations) surface as (false, error).
func (a *OwnerOnlyAuthorizer) Can(ctx context.Context, userID string, _ Action, tripID string) (bool, error) {
	return a.reader.isOwner(ctx, userID, tripID)
}

// Compile-time check that *OwnerOnlyAuthorizer satisfies the Authorizer interface.
var _ Authorizer = (*OwnerOnlyAuthorizer)(nil)

// pgxOwnershipReader implements ownershipReader by querying sharing.trip_memberships.
type pgxOwnershipReader struct {
	pool *pgxpool.Pool
}

func (r *pgxOwnershipReader) isOwner(ctx context.Context, userID, tripID string) (bool, error) {
	const q = `
		SELECT 1
		FROM sharing.trip_memberships
		WHERE trip_id = $1::uuid
		  AND user_id = $2::uuid
		  AND role = 'owner'`
	var dummy int
	err := r.pool.QueryRow(ctx, q, tripID, userID).Scan(&dummy)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("authz: check owner membership: %w", err)
	}
	return true, nil
}
