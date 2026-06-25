package sharing

import (
	"testing"
)

func TestRoleConstants(t *testing.T) {
	t.Parallel()
	for _, r := range []Role{RoleOwner, RoleEditor, RoleViewer} {
		if r == "" {
			t.Fatalf("role constant must not be empty")
		}
	}
}

func TestIsUniqueViolation_NonPgErr(t *testing.T) {
	t.Parallel()
	// A plain error must never be mistaken for a unique violation.
	if isUniqueViolation(ErrMembershipNotFound) {
		t.Fatal("expected false for non-pg error")
	}
}
