package auth

import "encoding/json"

// User is the provisioned identity row (auth.users, PRD §9). It is created on
// first sign-in from a VerifiedIdentity and resolved on every returning sign-in.
// The profile fields (HomeBase, Prefs) live on this single row — the row is the
// user's editable profile — so a user never exists without one.
type User struct {
	ID        string // uuid, as text
	GoogleSub string // stable Google account id; the provisioning idempotency key
	Email     string
	Name      string
	Avatar    string // picture URL

	// User-editable profile fields. Empty on provisioning; edited in Epic 04 and
	// never overwritten by an identity refresh.
	HomeBase        string
	DefaultCurrency string          // fixed to EUR for v1 (PRD §5.8)
	Prefs           json.RawMessage // theme preference + future toggles (PRD §9)

	// IsAdmin gates Milestone 08's backoffice. Set only by the non-public
	// bootstrap path (S4); false for everyone else.
	IsAdmin bool
	// Active is false when an admin has deactivated the user (M08.5 S3). A
	// deactivated user cannot sign in or use an existing session.
	Active bool
}
