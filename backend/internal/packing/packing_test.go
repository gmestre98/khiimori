package packing

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// compile-time check that fakeStore satisfies packingStore.
var _ packingStore = (*fakeStore)(nil)

// --- fake store -------------------------------------------------------------

type fakeStore struct {
	items     []Item
	templates map[string]TemplateDetail // keyed by template id
	seq       int
}

func newFakeStore() *fakeStore {
	return &fakeStore{templates: map[string]TemplateDetail{}}
}

func (s *fakeStore) nextID(prefix string) string {
	s.seq++
	return prefix + "-" + strconv.Itoa(s.seq)
}

func (s *fakeStore) ListItems(_ context.Context, tripID string) ([]Item, error) {
	var out []Item
	for _, it := range s.items {
		if it.TripID == tripID {
			out = append(out, it)
		}
	}
	return out, nil
}

func (s *fakeStore) CreateItem(_ context.Context, in CreateItem) (Item, error) {
	maxPos := 0
	for _, it := range s.items {
		if it.TripID == in.TripID && it.Position > maxPos {
			maxPos = it.Position
		}
	}
	now := time.Now()
	it := Item{
		ID: s.nextID("item"), TripID: in.TripID, Category: in.Category, Label: in.Label,
		Quantity: in.Quantity, Note: in.Note, Position: maxPos + 1, CreatedAt: now, UpdatedAt: now,
	}
	s.items = append(s.items, it)
	return it, nil
}

func (s *fakeStore) UpdateItem(_ context.Context, tripID, itemID string, in UpdateItem) (Item, error) {
	for i, it := range s.items {
		if it.ID == itemID && it.TripID == tripID {
			if in.Category != nil {
				it.Category = *in.Category
			}
			if in.Label != nil {
				it.Label = *in.Label
			}
			if in.Quantity != nil {
				it.Quantity = *in.Quantity
			}
			if in.Note != nil {
				it.Note = *in.Note
			}
			if in.Packed != nil {
				it.Packed = *in.Packed
			}
			it.UpdatedAt = time.Now()
			s.items[i] = it
			return it, nil
		}
	}
	return Item{}, ErrItemNotFound
}

func (s *fakeStore) DeleteItem(_ context.Context, tripID, itemID string) error {
	for i, it := range s.items {
		if it.ID == itemID && it.TripID == tripID {
			s.items = append(s.items[:i], s.items[i+1:]...)
			return nil
		}
	}
	return ErrItemNotFound
}

func (s *fakeStore) ListTemplates(_ context.Context, ownerID string) ([]Template, error) {
	var out []Template
	for _, d := range s.templates {
		if d.OwnerID == ownerID {
			t := d.Template
			t.ItemCount = len(d.Items)
			out = append(out, t)
		}
	}
	return out, nil
}

func (s *fakeStore) CreateTemplate(_ context.Context, in CreateTemplate) (Template, error) {
	now := time.Now()
	t := Template{ID: s.nextID("tmpl"), OwnerID: in.OwnerID, Name: in.Name, CreatedAt: now, UpdatedAt: now}
	var items []TemplateItem
	if in.FromTripID != "" {
		for _, it := range s.items {
			if it.TripID == in.FromTripID {
				items = append(items, TemplateItem{
					ID: s.nextID("ti"), Category: it.Category, Label: it.Label,
					Quantity: it.Quantity, Note: it.Note, Position: it.Position,
				})
			}
		}
	}
	t.ItemCount = len(items)
	s.templates[t.ID] = TemplateDetail{Template: t, Items: items}
	return t, nil
}

func (s *fakeStore) GetTemplate(_ context.Context, ownerID, templateID string) (TemplateDetail, error) {
	d, ok := s.templates[templateID]
	if !ok || d.OwnerID != ownerID {
		return TemplateDetail{}, ErrTemplateNotFound
	}
	d.ItemCount = len(d.Items)
	return d, nil
}

func (s *fakeStore) DeleteTemplate(_ context.Context, ownerID, templateID string) error {
	d, ok := s.templates[templateID]
	if !ok || d.OwnerID != ownerID {
		return ErrTemplateNotFound
	}
	delete(s.templates, templateID)
	return nil
}

func (s *fakeStore) ApplyTemplate(_ context.Context, tripID, ownerID, templateID string) ([]Item, error) {
	d, ok := s.templates[templateID]
	if !ok || d.OwnerID != ownerID {
		return nil, ErrTemplateNotFound
	}
	maxPos := 0
	for _, it := range s.items {
		if it.TripID == tripID && it.Position > maxPos {
			maxPos = it.Position
		}
	}
	var created []Item
	for i, ti := range d.Items {
		now := time.Now()
		it := Item{
			ID: s.nextID("item"), TripID: tripID, Category: ti.Category, Label: ti.Label,
			Quantity: ti.Quantity, Note: ti.Note, Position: maxPos + i + 1, CreatedAt: now, UpdatedAt: now,
		}
		s.items = append(s.items, it)
		created = append(created, it)
	}
	return created, nil
}

// --- authz fakes ------------------------------------------------------------

type allowAuthz struct{}

func (allowAuthz) CanRead(_ context.Context, _, _ string) (bool, error)  { return true, nil }
func (allowAuthz) CanWrite(_ context.Context, _, _ string) (bool, error) { return true, nil }

type denyAuthz struct{}

func (denyAuthz) CanRead(_ context.Context, _, _ string) (bool, error)  { return false, nil }
func (denyAuthz) CanWrite(_ context.Context, _, _ string) (bool, error) { return false, nil }

// readOnlyAuthz allows reads but denies writes (mirrors a Viewer membership).
type readOnlyAuthz struct{}

func (readOnlyAuthz) CanRead(_ context.Context, _, _ string) (bool, error)  { return true, nil }
func (readOnlyAuthz) CanWrite(_ context.Context, _, _ string) (bool, error) { return false, nil }

// --- test server ------------------------------------------------------------

func newTestServer(t *testing.T, store packingStore, authz Authorizer) *httptest.Server {
	t.Helper()
	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: "user-1"})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
	mod := &Module{store: store, authz: authz, requireAuth: requireAuth}
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func do(t *testing.T, method, url string, body any) *http.Response {
	t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return resp
}

// --- validation tests -------------------------------------------------------

func TestCreateItem_Validate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		in      CreateItem
		wantErr bool
	}{
		{"ok", CreateItem{TripID: "t", Label: "Gloves", Quantity: 2}, false},
		{"missing trip", CreateItem{Label: "Gloves"}, true},
		{"blank label", CreateItem{TripID: "t", Label: "   "}, true},
		{"zero quantity defaults to 1", CreateItem{TripID: "t", Label: "Gloves", Quantity: 0}, false},
		{"negative quantity", CreateItem{TripID: "t", Label: "Gloves", Quantity: -1}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.in
			in.normalize()
			err := in.validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("validate() err=%v, wantErr=%v", err, tc.wantErr)
			}
			if !tc.wantErr && in.Quantity < 1 {
				t.Fatalf("quantity should default to >=1, got %d", in.Quantity)
			}
		})
	}
}

func TestUpdateItem_Validate(t *testing.T) {
	t.Parallel()
	s := func(v string) *string { return &v }
	i := func(v int) *int { return &v }
	b := func(v bool) *bool { return &v }
	tests := []struct {
		name    string
		in      UpdateItem
		wantErr bool
	}{
		{"packed only", UpdateItem{Packed: b(true)}, false},
		{"rename", UpdateItem{Label: s("Boots")}, false},
		{"empty label rejected", UpdateItem{Label: s("  ")}, true},
		{"no fields", UpdateItem{}, true},
		{"bad quantity", UpdateItem{Quantity: i(0)}, true},
		{"category only", UpdateItem{Category: s("Safety gear")}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.in
			in.normalize()
			if err := in.validate(); (err != nil) != tc.wantErr {
				t.Fatalf("validate() err=%v, wantErr=%v", err, tc.wantErr)
			}
		})
	}
}

// --- handler tests ----------------------------------------------------------

func TestItems_CRUD(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	// Create
	resp := do(t, http.MethodPost, srv.URL+"/trips/trip-1/packing", map[string]any{
		"category": "Safety gear", "label": "Steel-toe boots", "quantity": 1, "note": "for the iron ore train",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: want 201, got %d", resp.StatusCode)
	}
	var created itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&created)
	_ = resp.Body.Close()
	if created.Label != "Steel-toe boots" || created.Category != "Safety gear" || created.Packed {
		t.Fatalf("unexpected created item: %+v", created)
	}

	// List
	resp = do(t, http.MethodGet, srv.URL+"/trips/trip-1/packing", nil)
	var list []itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()
	if len(list) != 1 {
		t.Fatalf("list: want 1 item, got %d", len(list))
	}

	// Toggle packed (partial update leaves label intact)
	resp = do(t, http.MethodPatch, srv.URL+"/trips/trip-1/packing/"+created.ID, map[string]any{"packed": true})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("update: want 200, got %d", resp.StatusCode)
	}
	var updated itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&updated)
	_ = resp.Body.Close()
	if !updated.Packed || updated.Label != "Steel-toe boots" {
		t.Fatalf("toggle packed should preserve label: %+v", updated)
	}

	// Delete
	resp = do(t, http.MethodDelete, srv.URL+"/trips/trip-1/packing/"+created.ID, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// Delete again → 404
	resp = do(t, http.MethodDelete, srv.URL+"/trips/trip-1/packing/"+created.ID, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("delete missing: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestCreateItem_ValidationError(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), allowAuthz{})
	resp := do(t, http.MethodPost, srv.URL+"/trips/trip-1/packing", map[string]any{"label": ""})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestWrite_DeniedForViewer(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), readOnlyAuthz{})

	// Read is allowed.
	resp := do(t, http.MethodGet, srv.URL+"/trips/trip-1/packing", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("viewer read: want 200, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// Write is denied → 404 (don't reveal the trip).
	resp = do(t, http.MethodPost, srv.URL+"/trips/trip-1/packing", map[string]any{"label": "Gloves"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("viewer write: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestRead_DeniedForNonMember(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), denyAuthz{})
	resp := do(t, http.MethodGet, srv.URL+"/trips/trip-1/packing", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("non-member read: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestUpdateItem_NotFound(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), allowAuthz{})
	resp := do(t, http.MethodPatch, srv.URL+"/trips/trip-1/packing/nope", map[string]any{"packed": true})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

// --- template tests ---------------------------------------------------------

func TestTemplates_SaveListApply(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})

	// Seed a trip with two items.
	for _, label := range []string{"Gloves", "Helmet"} {
		resp := do(t, http.MethodPost, srv.URL+"/trips/trip-1/packing", map[string]any{
			"category": "Safety gear", "label": label,
		})
		_ = resp.Body.Close()
	}

	// Save the trip's list as a template.
	resp := do(t, http.MethodPost, srv.URL+"/packing/templates", map[string]any{
		"name": "Iron-ore train kit", "from_trip_id": "trip-1",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create template: want 201, got %d", resp.StatusCode)
	}
	var tmpl templateResponse
	_ = json.NewDecoder(resp.Body).Decode(&tmpl)
	_ = resp.Body.Close()
	if tmpl.ItemCount != 2 {
		t.Fatalf("template item_count: want 2, got %d", tmpl.ItemCount)
	}

	// List templates.
	resp = do(t, http.MethodGet, srv.URL+"/packing/templates", nil)
	var templates []templateResponse
	_ = json.NewDecoder(resp.Body).Decode(&templates)
	_ = resp.Body.Close()
	if len(templates) != 1 {
		t.Fatalf("list templates: want 1, got %d", len(templates))
	}

	// Apply the template to a different, empty trip.
	resp = do(t, http.MethodPost, srv.URL+"/trips/trip-2/packing/apply-template", map[string]any{
		"template_id": tmpl.ID,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("apply template: want 201, got %d", resp.StatusCode)
	}
	var applied []itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&applied)
	_ = resp.Body.Close()
	if len(applied) != 2 {
		t.Fatalf("apply template: want 2 items, got %d", len(applied))
	}

	// trip-2 now has the two items.
	resp = do(t, http.MethodGet, srv.URL+"/trips/trip-2/packing", nil)
	var list []itemResponse
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()
	if len(list) != 2 {
		t.Fatalf("trip-2 list: want 2, got %d", len(list))
	}
}

func TestApplyTemplate_MissingTemplate(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), allowAuthz{})
	resp := do(t, http.MethodPost, srv.URL+"/trips/trip-1/packing/apply-template", map[string]any{
		"template_id": "does-not-exist",
	})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestApplyTemplate_MissingTemplateID(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), allowAuthz{})
	resp := do(t, http.MethodPost, srv.URL+"/trips/trip-1/packing/apply-template", map[string]any{})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestCreateTemplate_ValidationError(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), allowAuthz{})
	resp := do(t, http.MethodPost, srv.URL+"/packing/templates", map[string]any{"name": ""})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestGetTemplate_NotFound(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t, newFakeStore(), allowAuthz{})
	resp := do(t, http.MethodGet, srv.URL+"/packing/templates/nope", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}
