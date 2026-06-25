package sharing

import (
	"testing"
)

func TestInvitationStatusConstants(t *testing.T) {
	t.Parallel()
	for _, s := range []InvitationStatus{StatusSent, StatusAccepted, StatusRevoked} {
		if s == "" {
			t.Fatal("invitation status constant must not be empty")
		}
	}
}

func TestEmailsEqual(t *testing.T) {
	t.Parallel()
	cases := []struct {
		a, b string
		want bool
	}{
		{"user@example.com", "user@example.com", true},
		{"User@Example.COM", "user@example.com", true},
		{"user@example.com", "other@example.com", false},
		{"", "", true},
		{"a@b.com", "a@b.co", false},
	}
	for _, tc := range cases {
		got := emailsEqual(tc.a, tc.b)
		if got != tc.want {
			t.Errorf("emailsEqual(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}
