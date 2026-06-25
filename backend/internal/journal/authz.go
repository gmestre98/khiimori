package journal

import "context"

// Authorizer answers whether a given user may read or write journal data for a trip.
// The journal module declares this interface (consumer-side) so it never imports
// the trip or sharing modules — the composition root passes a concrete adapter.
type Authorizer interface {
	// CanRead returns (true, nil) when userID may read journal entries for tripID
	// (Owner, Editor, and Viewer). Infrastructure failures return (false, non-nil error).
	CanRead(ctx context.Context, userID, tripID string) (bool, error)

	// CanWrite returns (true, nil) when userID may create, update, or delete journal
	// entries for tripID (Owner and Editor only). Infrastructure failures return
	// (false, non-nil error).
	CanWrite(ctx context.Context, userID, tripID string) (bool, error)
}
