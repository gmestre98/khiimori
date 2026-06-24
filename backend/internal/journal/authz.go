package journal

import "context"

// Authorizer answers whether a given user may access journal data for a trip.
// The journal module declares this interface (consumer-side) so it never imports
// the trip or sharing modules — the composition root passes a concrete adapter.
// Milestone 08's membership-based implementation is a drop-in replacement.
type Authorizer interface {
	// CanAccess returns (true, nil) when userID may read or write journal entries
	// for tripID, and (false, nil) when they may not. Infrastructure failures
	// return (false, non-nil error).
	CanAccess(ctx context.Context, userID, tripID string) (bool, error)
}
