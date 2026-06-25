package budget

import "context"

// Authorizer answers whether a given user may read or write budget data for a trip.
// The budget module declares this interface (consumer-side) so it never imports
// the trip or sharing modules — the composition root passes a concrete adapter.
type Authorizer interface {
	// CanRead returns (true, nil) when userID may read budget data for tripID
	// (Owner, Editor, and Viewer). Infrastructure failures return (false, non-nil error).
	CanRead(ctx context.Context, userID, tripID string) (bool, error)

	// CanWrite returns (true, nil) when userID may set budget lines and cost entries
	// for tripID (Owner and Editor only). Infrastructure failures return (false, non-nil error).
	CanWrite(ctx context.Context, userID, tripID string) (bool, error)
}
