package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

// UpdateProfile mirrors the SQL: nil fields are left unchanged, theme is merged
// into prefs (preserving other keys), and default_currency is never touched.
func (s *fakeProfileStore) UpdateProfile(_ context.Context, id string, p profilePatch) (User, error) {
	u, ok := s.byID[id]
	if !ok {
		return User{}, errUserNotFound
	}
	if p.Name != nil {
		u.Name = *p.Name
	}
	if p.Avatar != nil {
		u.Avatar = *p.Avatar
	}
	if p.HomeBase != nil {
		u.HomeBase = *p.HomeBase
	}
	if p.Theme != nil {
		m := map[string]any{}
		if len(u.Prefs) > 0 {
			_ = json.Unmarshal(u.Prefs, &m)
		}
		m["theme"] = *p.Theme
		b, _ := json.Marshal(m)
		u.Prefs = b
	}
	s.byID[id] = u
	return u, nil
}

// patchProfile drives PATCH /me as the given user with a raw JSON body.
func patchProfile(t *testing.T, m *Module, userID, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPatch, ProfilePath, strings.NewReader(body))
	req.AddCookie(sessionCookieFor(t, m.sessions, userID))
	return serve(m, req)
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

// TestProfileEditUpdatesProvidedFields: a PATCH updates only the fields it sends
// (name + theme here), leaves others unchanged, returns the updated profile, and
// the change is visible on a subsequent read.
func TestProfileEditUpdatesProvidedFields(t *testing.T) {
	t.Parallel()

	u := User{
		ID: "user-1", Email: "ann@example.com", Name: "Ann", Avatar: "https://pic",
		HomeBase: "Lisbon", DefaultCurrency: "EUR", Prefs: json.RawMessage(`{"theme":"system"}`),
	}
	store := newFakeProfileStore(u)
	m := profileModule(store)

	rec := patchProfile(t, m, "user-1", `{"name":"Ann B.","theme":"dark"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	var got profileResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	want := profileResponse{
		Name: "Ann B.", Email: "ann@example.com", Avatar: "https://pic",
		HomeBase: "Lisbon", Theme: "dark", DefaultCurrency: "EUR",
	}
	if got != want {
		t.Errorf("updated profile = %+v, want %+v", got, want)
	}

	// Reflected immediately on a read.
	_, after := readProfile(t, m, "user-1")
	if after != want {
		t.Errorf("read-after-edit = %+v, want %+v", after, want)
	}
}

// TestProfileEditRejectsInvalid: bad theme, an over-long name, and a non-URL
// avatar are each rejected with 400 and leave the row unchanged.
func TestProfileEditRejectsInvalid(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name string
		body string
	}{
		{"bad theme", `{"theme":"neon"}`},
		{"name too long", `{"name":"` + strings.Repeat("x", maxNameLen+1) + `"}`},
		{"avatar not a url", `{"avatar":"not a url"}`},
		{"malformed json", `{"name":`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			u := User{ID: "user-1", Name: "Ann", DefaultCurrency: "EUR", Prefs: json.RawMessage(`{"theme":"light"}`)}
			m := profileModule(newFakeProfileStore(u))

			rec := patchProfile(t, m, "user-1", tc.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
			// The stored row must be untouched.
			_, after := readProfile(t, m, "user-1")
			if after.Name != "Ann" || after.Theme != "light" {
				t.Errorf("row changed by a rejected edit: %+v", after)
			}
		})
	}
}

// TestProfileEditRequiresSession: PATCH /me without a session is 401.
func TestProfileEditRequiresSession(t *testing.T) {
	t.Parallel()

	m := profileModule(newFakeProfileStore())
	req := httptest.NewRequest(http.MethodPatch, ProfilePath, strings.NewReader(`{"name":"x"}`))
	if rec := serve(m, req); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}
