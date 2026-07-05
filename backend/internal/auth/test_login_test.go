package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// testLoginModule builds a Module wired for the guarded test-login endpoint: an
// in-memory repo (so provisioning needs no DB), a test session manager, and the
// given E2E secret. An empty secret leaves the route unregistered, matching
// production.
func testLoginModule(secret string) (*Module, *fakeUserRepo) {
	repo := newFakeUserRepo()
	m := &Module{
		provisioner:    &Provisioner{repo: repo},
		sessions:       testSessions(),
		e2eLoginSecret: secret,
	}
	return m, repo
}

// testLoginRequest builds a POST /auth/test-login carrying the given secret
// header (omitted when empty).
func testLoginRequest(secret string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TestLoginPath, nil)
	if secret != "" {
		req.Header.Set(e2eLoginSecretHeader, secret)
	}
	return req
}

// TestTestLoginDisabledWhenSecretUnset: with no E2E_LOGIN_SECRET the route is not
// registered at all, so production exposes no test-auth surface (404, not 401).
func TestTestLoginDisabledWhenSecretUnset(t *testing.T) {
	t.Parallel()

	m, repo := testLoginModule("") // disabled
	rec := serve(m, testLoginRequest("anything"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 when test-login is disabled", rec.Code)
	}
	if readSessionCookie(rec) != nil {
		t.Error("disabled test-login must not issue a session cookie")
	}
	if repo.saves != 0 {
		t.Errorf("disabled test-login provisioned %d user(s), want 0", repo.saves)
	}
}

// TestTestLoginMintsSession: presenting the correct secret provisions the fixed
// test identity and issues a valid session cookie, acknowledging with the user id.
func TestTestLoginMintsSession(t *testing.T) {
	t.Parallel()

	const secret = "s3cr3t-e2e-token"
	m, repo := testLoginModule(secret)
	rec := serve(m, testLoginRequest(secret))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	// A real, verifiable session cookie must be set for the fixed test user.
	cookie := readSessionCookie(rec)
	if cookie == nil {
		t.Fatal("test-login did not set a session cookie")
	}
	userID, _, err := m.sessions.parse(cookie.Value)
	if err != nil {
		t.Fatalf("issued session cookie does not verify: %v", err)
	}

	// The body echoes the provisioned user id, and it matches the session subject.
	var body struct {
		Status string `json:"status"`
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	if body.Status != "signed_in" {
		t.Errorf("status = %q, want signed_in", body.Status)
	}
	if body.UserID != userID {
		t.Errorf("body user_id %q != session user id %q", body.UserID, userID)
	}

	// The fixed identity is provisioned exactly once and is non-admin.
	if repo.saves != 1 {
		t.Errorf("provisioned %d user(s), want 1", repo.saves)
	}
	u, ok := repo.bySub[e2eTestGoogleSub]
	if !ok {
		t.Fatalf("test user %q was not provisioned", e2eTestGoogleSub)
	}
	if u.Email != e2eTestEmail {
		t.Errorf("email = %q, want %q", u.Email, e2eTestEmail)
	}
	if u.IsAdmin {
		t.Error("the E2E test identity must never be provisioned as admin")
	}
}

// TestTestLoginRerunResolvesSameUser: a second test-login resolves the same
// deterministic user rather than creating a duplicate, so reruns are stable.
func TestTestLoginRerunResolvesSameUser(t *testing.T) {
	t.Parallel()

	const secret = "s3cr3t-e2e-token"
	m, repo := testLoginModule(secret)

	first := serve(m, testLoginRequest(secret))
	second := serve(m, testLoginRequest(secret))
	if first.Code != http.StatusOK || second.Code != http.StatusOK {
		t.Fatalf("statuses = %d/%d, want 200/200", first.Code, second.Code)
	}
	if len(repo.bySub) != 1 {
		t.Errorf("provisioned %d distinct users across reruns, want 1", len(repo.bySub))
	}
}

// TestTestLoginRejectsWrongOrMissingSecret: an incorrect or absent secret is
// rejected without provisioning or a session — the endpoint exists (secret set)
// but the caller failed the guard.
func TestTestLoginRejectsWrongOrMissingSecret(t *testing.T) {
	t.Parallel()

	const secret = "s3cr3t-e2e-token"
	for _, presented := range []string{"", "wrong-secret"} {
		m, repo := testLoginModule(secret)
		rec := serve(m, testLoginRequest(presented))

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("presented %q: status = %d, want 401", presented, rec.Code)
		}
		if readSessionCookie(rec) != nil {
			t.Errorf("presented %q: a failed guard must not issue a session", presented)
		}
		if repo.saves != 0 {
			t.Errorf("presented %q: a failed guard must not provision", presented)
		}
	}
}

// TestTestLoginRejectsNonPOST confirms the method-scoped route returns 405 for a
// non-POST request (the ServeMux method pattern enforces it).
func TestTestLoginRejectsNonPOST(t *testing.T) {
	t.Parallel()

	m, _ := testLoginModule("s3cr3t-e2e-token")
	rec := serve(m, httptest.NewRequest(http.MethodGet, TestLoginPath, nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET status = %d, want 405", rec.Code)
	}
}

// testLoginRequestIdentity builds a POST /auth/test-login carrying the secret and
// selecting a fixed identity via the ?identity= query parameter.
func testLoginRequestIdentity(secret, identity string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, TestLoginPath+"?"+e2eIdentityParam+"="+identity, nil)
	req.Header.Set(e2eLoginSecretHeader, secret)
	return req
}

// TestTestLoginSelectsIdentity: the ?identity= parameter signs in the matching
// fixed identity (M10.2), each provisioned as a distinct, non-admin user so the
// role E2E can set up an owner + editor + viewer + non-member on one trip. The
// body echoes the identity's email so the owner can invite it by that address.
func TestTestLoginSelectsIdentity(t *testing.T) {
	t.Parallel()

	const secret = "s3cr3t-e2e-token"
	for identity, want := range e2eTestIdentities {
		identity, want := identity, want
		t.Run(identity, func(t *testing.T) {
			t.Parallel()
			m, repo := testLoginModule(secret)
			rec := serve(m, testLoginRequestIdentity(secret, identity))

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			var body struct {
				Status string `json:"status"`
				UserID string `json:"user_id"`
				Email  string `json:"email"`
			}
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatalf("decoding body: %v", err)
			}
			if body.Status != "signed_in" {
				t.Errorf("status = %q, want signed_in", body.Status)
			}
			if body.Email != want.Email {
				t.Errorf("email = %q, want %q", body.Email, want.Email)
			}
			u, ok := repo.bySub[want.GoogleSub]
			if !ok {
				t.Fatalf("identity %q was not provisioned under sub %q", identity, want.GoogleSub)
			}
			if u.Email != want.Email {
				t.Errorf("email = %q, want %q", u.Email, want.Email)
			}
			if u.IsAdmin {
				t.Errorf("identity %q must never be provisioned as admin", identity)
			}
		})
	}
}

// TestTestLoginDefaultsToOwner: omitting the identity parameter preserves the
// M10.1 behaviour — the fixed owner identity is signed in.
func TestTestLoginDefaultsToOwner(t *testing.T) {
	t.Parallel()

	const secret = "s3cr3t-e2e-token"
	m, repo := testLoginModule(secret)
	rec := serve(m, testLoginRequest(secret))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if _, ok := repo.bySub[e2eTestGoogleSub]; !ok {
		t.Errorf("default identity %q was not provisioned", e2eTestGoogleSub)
	}
}

// TestTestLoginRejectsUnknownIdentity: an unrecognised identity is a client error
// (400) rather than a silent fallback, so a typo in a test surfaces clearly and
// no unintended user is provisioned.
func TestTestLoginRejectsUnknownIdentity(t *testing.T) {
	t.Parallel()

	const secret = "s3cr3t-e2e-token"
	m, repo := testLoginModule(secret)
	rec := serve(m, testLoginRequestIdentity(secret, "intruder"))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an unknown identity", rec.Code)
	}
	if readSessionCookie(rec) != nil {
		t.Error("an unknown identity must not issue a session cookie")
	}
	if repo.saves != 0 {
		t.Errorf("an unknown identity provisioned %d user(s), want 0", repo.saves)
	}
}
