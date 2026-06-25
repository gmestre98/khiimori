package sharing

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Role is a trip-membership role.
type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

// ErrMembershipNotFound is returned when a membership row does not exist.
var ErrMembershipNotFound = errors.New("sharing: membership not found")

// ErrMembershipAlreadyExists is returned when inserting a duplicate (trip, user) pair.
var ErrMembershipAlreadyExists = errors.New("sharing: membership already exists")

// Memberships writes and reads trip-membership rows in the sharing.* schema. The
// trip module (which owns trip creation/deletion) drives the owner-creation
// writes through a small interface it defines; this type is also the lifecycle
// service consumed directly by the invitation and sharing-UI modules.
//
// It holds no state for writes that arrive within a caller-supplied transaction;
// the pool is used only for standalone read/write operations.
type Memberships struct {
	pool *pgxpool.Pool
}

// NewMemberships constructs the sharing membership writer.
func NewMemberships(pool *pgxpool.Pool) *Memberships { return &Memberships{pool: pool} }

// CreateOwner inserts the Owner membership for a trip's creator within tx. It is
// called from the trip-create transaction so the trip and its owner row commit
// together (or roll back together on any failure). role is fixed to RoleOwner
// server-side — never client input.
func (m *Memberships) CreateOwner(ctx context.Context, tx pgx.Tx, tripID, userID string) error {
	const query = `
		INSERT INTO sharing.trip_memberships (trip_id, user_id, role)
		VALUES ($1::uuid, $2::uuid, $3)`
	if _, err := tx.Exec(ctx, query, tripID, userID, RoleOwner); err != nil {
		return fmt.Errorf("sharing: create owner membership: %w", err)
	}
	return nil
}

// Add inserts a new membership for (tripID, userID) with the given role. Returns
// ErrMembershipAlreadyExists if the pair already has a membership.
func (m *Memberships) Add(ctx context.Context, tripID, userID string, role Role) error {
	const query = `
		INSERT INTO sharing.trip_memberships (trip_id, user_id, role)
		VALUES ($1::uuid, $2::uuid, $3)`
	_, err := m.pool.Exec(ctx, query, tripID, userID, string(role))
	if err != nil {
		if isUniqueViolation(err) {
			return ErrMembershipAlreadyExists
		}
		return fmt.Errorf("sharing: add membership: %w", err)
	}
	return nil
}

// ChangeRole updates the role for an existing (tripID, userID) membership.
// Returns ErrMembershipNotFound if the membership does not exist.
func (m *Memberships) ChangeRole(ctx context.Context, tripID, userID string, role Role) error {
	const query = `
		UPDATE sharing.trip_memberships
		SET    role = $3
		WHERE  trip_id = $1::uuid AND user_id = $2::uuid`
	tag, err := m.pool.Exec(ctx, query, tripID, userID, string(role))
	if err != nil {
		return fmt.Errorf("sharing: change role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrMembershipNotFound
	}
	return nil
}

// Revoke removes the membership for (tripID, userID). Returns
// ErrMembershipNotFound if the membership does not exist.
func (m *Memberships) Revoke(ctx context.Context, tripID, userID string) error {
	const query = `
		DELETE FROM sharing.trip_memberships
		WHERE trip_id = $1::uuid AND user_id = $2::uuid`
	tag, err := m.pool.Exec(ctx, query, tripID, userID)
	if err != nil {
		return fmt.Errorf("sharing: revoke membership: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrMembershipNotFound
	}
	return nil
}

// RevokeInTx removes the membership for (tripID, userID) within a caller-supplied
// transaction. Used by the trip-delete path so the membership removal is atomic
// with the trip deletion.
func (m *Memberships) RevokeInTx(ctx context.Context, tx pgx.Tx, tripID, userID string) error {
	const query = `
		DELETE FROM sharing.trip_memberships
		WHERE trip_id = $1::uuid AND user_id = $2::uuid`
	if _, err := tx.Exec(ctx, query, tripID, userID); err != nil {
		return fmt.Errorf("sharing: revoke membership in tx: %w", err)
	}
	return nil
}

// isUniqueViolation reports whether err is a PostgreSQL unique-violation (23505).
func isUniqueViolation(err error) bool {
	// pgx wraps constraint violations as *pgconn.PgError with Code "23505".
	type pgErr interface{ SQLState() string }
	var pe pgErr
	if errors.As(err, &pe) {
		return pe.SQLState() == "23505"
	}
	return false
}
