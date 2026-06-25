package sharing

import (
	"errors"
	"testing"
)

// mockRows is a minimal stub for scanMemberships that drives its interface
// without a real database connection.
type mockRows struct {
	data []Membership
	pos  int
	err  error
}

func (r *mockRows) Next() bool { r.pos++; return r.pos <= len(r.data) }
func (r *mockRows) Scan(dest ...any) error {
	mb := r.data[r.pos-1]
	*dest[0].(*string) = mb.ID
	*dest[1].(*string) = mb.TripID
	*dest[2].(*string) = mb.UserID
	*dest[3].(*Role) = mb.Role
	return nil
}
func (r *mockRows) Err() error { return r.err }

func TestScanMemberships_Empty(t *testing.T) {
	t.Parallel()
	rows := &mockRows{}
	out, err := scanMemberships(rows)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("expected empty slice, got %d", len(out))
	}
}

func TestScanMemberships_Multiple(t *testing.T) {
	t.Parallel()
	want := []Membership{
		{ID: "a", TripID: "t1", UserID: "u1", Role: RoleOwner},
		{ID: "b", TripID: "t1", UserID: "u2", Role: RoleEditor},
	}
	rows := &mockRows{data: want}
	got, err := scanMemberships(rows)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != len(want) {
		t.Fatalf("expected %d rows, got %d", len(want), len(got))
	}
	for i, w := range want {
		if got[i] != w {
			t.Errorf("row %d: got %+v, want %+v", i, got[i], w)
		}
	}
}

func TestScanMemberships_RowErr(t *testing.T) {
	t.Parallel()
	sentinel := errors.New("db error")
	rows := &mockRows{err: sentinel}
	_, err := scanMemberships(rows)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}
