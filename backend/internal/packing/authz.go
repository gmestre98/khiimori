package packing

import "context"

// Authorizer answers whether a given user may read or write packing data for a
// trip. The packing module declares this interface (consumer-side) so it never
// imports the trip or sharing modules — the composition root passes a concrete
// adapter.
type Authorizer interface {
	// CanRead returns (true, nil) when userID may read the trip's packing list
	// (Owner, Editor, and Viewer). Infrastructure failures return (false, non-nil error).
	CanRead(ctx context.Context, userID, tripID string) (bool, error)

	// CanWrite returns (true, nil) when userID may add, edit, or remove packing
	// items for tripID (Owner and Editor only). Infrastructure failures return
	// (false, non-nil error).
	CanWrite(ctx context.Context, userID, tripID string) (bool, error)
}
