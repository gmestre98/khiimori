package trip

import "context"

// Action names the operations the Authorizer reasons about for a trip.
type Action string

const (
	// ActionRead allows reading a trip's data: fetching details, listing, and
	// accessing day entries (GET paths).
	ActionRead Action = "read"

	// ActionWrite allows modifying a trip's editable fields (PATCH /trips/{id}).
	ActionWrite Action = "write"

	// ActionManage allows lifecycle operations: archive, unarchive, and delete.
	// These are separated from ActionWrite because they require owner-level
	// authority even in future sharing scenarios (PRD §7.0).
	ActionManage Action = "manage"
)

// Authorizer answers whether a given user may perform an action on a trip.
// It is the seam between the Trip module (consumer) and the Sharing module
// (Milestone 08 implementor): callers import this interface, not an
// implementation, so swapping the owner-only shim (S2) for the full
// membership-based check (Milestone 08) requires no caller changes (PRD §7.0,
// §7.1).
//
// Can returns (true, nil) when the user is authorized, (false, nil) when they
// are not, and (false, non-nil error) only on infrastructure failures (database
// errors, context cancellations). Handlers treat a false result as 403 or 404
// per PRD §5.9 and §6.
type Authorizer interface {
	Can(ctx context.Context, userID string, action Action, tripID string) (bool, error)
}
