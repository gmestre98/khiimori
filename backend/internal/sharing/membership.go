package sharing

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// RoleOwner is the membership role recorded for a trip's creator. It is the only
// role in v1; Milestone 08 introduces the rest of the membership lifecycle
// (editor/viewer, invitations) and owns this table from then on.
const RoleOwner = "owner"

// Memberships writes trip-membership rows in the sharing.* schema. The trip
// module (which owns trip creation/deletion) drives these writes through a small
// interface it defines, and the composition root hands it this concrete value —
// so the trip module never imports the sharing module, preserving the
// modular-monolith boundary. Every method operates on a caller-supplied
// transaction so the membership write is atomic with the trip write.
//
// It holds no state: the connection comes from the transaction the trip store
// opens, so the same tx commits or rolls back trip and membership together.
type Memberships struct{}

// NewMemberships constructs the sharing membership writer.
func NewMemberships() *Memberships { return &Memberships{} }

// CreateOwner inserts the Owner membership for a trip's creator within tx. It is
// called from the trip-create transaction so the trip and its owner row commit
// together (or roll back together on any failure). role is fixed to RoleOwner
// server-side — never client input.
func (Memberships) CreateOwner(ctx context.Context, tx pgx.Tx, tripID, userID string) error {
	const query = `
		INSERT INTO sharing.trip_memberships (trip_id, user_id, role)
		VALUES ($1::uuid, $2::uuid, $3)`
	if _, err := tx.Exec(ctx, query, tripID, userID, RoleOwner); err != nil {
		return fmt.Errorf("sharing: create owner membership: %w", err)
	}
	return nil
}
