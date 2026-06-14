package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// fakeProfileStore is an in-memory profileStore for unit tests, keyed on user id.
type fakeProfileStore struct {
	byID map[string]User
}

func newFakeProfileStore(users ...User) *fakeProfileStore {
	s := &fakeProfileStore{byID: make(map[string]User)}
	for _, u := range users {
		s.byID[u.ID] = u
	}
	return s
}

func (s *fakeProfileStore) GetByID(_ context.Context, id string) (User, error) {
	u, ok := s.byID[id]
	if !ok {
		return User{}, errUserNotFound
	}
	return u, nil
}

// profileModule builds a Module with a test session manager and the given store,
// so profile requests go through the real RequireAuth middleware + handlers.
func profileModule(store profileStore) *Module {
	return &Module{sessions: testSessions(), users: store}
}

// readProfile drives GET /me as the given user and returns the decoded body.
func readProfile(t *testing.T, m *Module, userID string) (*httptest.ResponseRecorder, profileResponse) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, ProfilePath, nil)
	req.AddCookie(sessionCookieFor(t, m.sessions, userID))
	rec := serve(m, req)
	var body profileResponse
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode profile: %v (body %q)", err, rec.Body.String())
		}
	}
	return rec, body
}

// TestProfileReadReturnsOwnProfile: GET /me returns the session user's fields,
// with the theme pulled out of prefs and the email/currency included.
func TestProfileReadReturnsOwnProfile(t *testing.T) {
	t.Parallel()

	u := User{
		ID: "user-1", Email: "ann@example.com", Name: "Ann", Avatar: "https://pic",
		HomeBase: "Lisbon", DefaultCurrency: "EUR", Prefs: json.RawMessage(`{"theme":"dark"}`),
	}
	m := profileModule(newFakeProfileStore(u))

	rec, body := readProfile(t, m, "user-1")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	want := profileResponse{
		Name: "Ann", Email: "ann@example.com", Avatar: "https://pic",
		HomeBase: "Lisbon", Theme: "dark", DefaultCurrency: "EUR",
	}
	if body != want {
		t.Errorf("profile = %+v, want %+v", body, want)
	}
}

// TestProfileReadDefaultsTheme: a user with no theme in prefs reads back the
// default theme.
func TestProfileReadDefaultsTheme(t *testing.T) {
	t.Parallel()

	u := User{ID: "user-1", Name: "Ann", DefaultCurrency: "EUR", Prefs: json.RawMessage(`{}`)}
	m := profileModule(newFakeProfileStore(u))

	_, body := readProfile(t, m, "user-1")
	if body.Theme != defaultTheme {
		t.Errorf("Theme = %q, want the default %q", body.Theme, defaultTheme)
	}
}

// TestProfileReadRequiresSession: GET /me without a session is 401.
func TestProfileReadRequiresSession(t *testing.T) {
	t.Parallel()

	m := profileModule(newFakeProfileStore())
	rec := serve(m, httptest.NewRequest(http.MethodGet, ProfilePath, nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}
