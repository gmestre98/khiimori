package budget

import "context"

// Authorizer answers whether a given user may write budget data for a trip.
// The budget module declares this interface (consumer-side) so it never imports
// the trip module — the composition root hands in trip.NewOwnerOnlyAuthorizer.
// Milestone 08's membership-based implementation is a drop-in replacement with
// no caller changes required.
type Authorizer interface {
	// CanWrite returns (true, nil) when userID may set budget lines for tripID,
	// and (false, nil) when they may not. Infrastructure failures return
	// (false, non-nil error).
	CanWrite(ctx context.Context, userID, tripID string) (bool, error)
}
