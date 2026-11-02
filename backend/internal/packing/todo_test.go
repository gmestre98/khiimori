package packing

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"testing"
	"time"
)

// --- fake store: to-dos -----------------------------------------------------

func (s *fakeStore) ListTodos(_ context.Context, tripID string) ([]Todo, error) {
	var out []Todo
	for _, t := range s.todos {
		if t.TripID == tripID {
			out = append(out, t)
		}
	}
	// Mirror the SQL order: due date soonest first, no date last, then position.
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if (a.DueDate == "") != (b.DueDate == "") {
			return b.DueDate == ""
		}
		if a.DueDate != b.DueDate {
			return a.DueDate < b.DueDate
		}
		return a.Position < b.Position
	})
	return out, nil
}

func (s *fakeStore) CreateTodo(_ context.Context, in CreateTodo) (Todo, error) {
	maxPos := 0
	for _, t := range s.todos {
		if t.TripID == in.TripID && t.Position > maxPos {
			maxPos = t.Position
		}
	}
	now := time.Now()
	t := Todo{
		ID: s.nextID("todo"), TripID: in.TripID, Title: in.Title, Note: in.Note,
		DueDate: in.DueDate, Position: maxPos + 1, CreatedAt: now, UpdatedAt: now,
	}
	s.todos = append(s.todos, t)
	return t, nil
}

func (s *fakeStore) UpdateTodo(_ context.Context, tripID, todoID string, in UpdateTodo) (Todo, error) {
	for i, t := range s.todos {
		if t.ID == todoID && t.TripID == tripID {
			if in.Title != nil {
				t.Title = *in.Title
			}
			if in.Note != nil {
				t.Note = *in.Note
			}
			if in.ClearDueDate {
				t.DueDate = ""
			} else if in.DueDate != nil {
				t.DueDate = *in.DueDate
			}
			if in.Done != nil {
				t.Done = *in.Done
			}
			t.UpdatedAt = time.Now()
			s.todos[i] = t
			return t, nil
		}
	}
	return Todo{}, ErrTodoNotFound
}

func (s *fakeStore) DeleteTodo(_ context.Context, tripID, todoID string) error {
	for i, t := range s.todos {
		if t.ID == todoID && t.TripID == tripID {
			s.todos = append(s.todos[:i], s.todos[i+1:]...)
			return nil
		}
	}
	return ErrTodoNotFound
}

// --- validation -------------------------------------------------------------

func TestCreateTodo_Validate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		in      CreateTodo
		wantErr bool
	}{
		{"ok, no date", CreateTodo{TripID: "t", Title: "Visa"}, false},
		{"ok, with date", CreateTodo{TripID: "t", Title: "Visa", DueDate: "2026-11-18"}, false},
		{"missing trip", CreateTodo{Title: "Visa"}, true},
		{"blank title", CreateTodo{TripID: "t", Title: "  "}, true},
		{"bad date", CreateTodo{TripID: "t", Title: "Visa", DueDate: "18/11/2026"}, true},
		{"impossible date", CreateTodo{TripID: "t", Title: "Visa", DueDate: "2026-02-30"}, true},
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

func TestUpdateTodo_Validate(t *testing.T) {
	t.Parallel()
	blank, title, bad, empty := "  ", "Insurance", "tomorrow", ""
	done := true
	tests := []struct {
		name    string
		in      UpdateTodo
		wantErr bool
	}{
		{"no fields", UpdateTodo{}, true},
		{"done only", UpdateTodo{Done: &done}, false},
		{"rename", UpdateTodo{Title: &title}, false},
		{"blank title", UpdateTodo{Title: &blank}, true},
		{"bad date", UpdateTodo{DueDate: &bad}, true},
		{"empty date clears", UpdateTodo{DueDate: &empty}, false},
		{"clear flag", UpdateTodo{ClearDueDate: true}, false},
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

// --- handlers ---------------------------------------------------------------

func decodeTodo(t *testing.T, resp *http.Response) todoResponse {
	t.Helper()
	defer func() { _ = resp.Body.Close() }()
	var out todoResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode todo: %v", err)
	}
	return out
}

func TestTodos_CRUD(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	srv := newTestServer(t, store, allowAuthz{})
	base := srv.URL + "/trips/trip-1/todos"

	// Create one without and one with a deadline.
	resp := do(t, http.MethodPost, base, map[string]any{"title": "Print passport copies"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: want 201, got %d", resp.StatusCode)
	}
	undated := decodeTodo(t, resp)
	if undated.DueDate != nil || undated.Done {
		t.Fatalf("unexpected undated todo: %+v", undated)
	}
	resp = do(t, http.MethodPost, base, map[string]any{
		"title": "Apply for the Mauritanian visa", "note": "anrpts.gov.mr", "due_date": "2026-11-28",
	})
	dated := decodeTodo(t, resp)
	if dated.DueDate == nil || *dated.DueDate != "2026-11-28" || dated.Note != "anrpts.gov.mr" {
		t.Fatalf("unexpected dated todo: %+v", dated)
	}

	// List: dated first, undated last.
	resp = do(t, http.MethodGet, base, nil)
	var list []todoResponse
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()
	if len(list) != 2 || list[0].ID != dated.ID || list[1].ID != undated.ID {
		t.Fatalf("list order: %+v", list)
	}

	// Tick done: the title and deadline are preserved.
	resp = do(t, http.MethodPatch, base+"/"+dated.ID, map[string]any{"done": true})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("update: want 200, got %d", resp.StatusCode)
	}
	ticked := decodeTodo(t, resp)
	if !ticked.Done || ticked.Title != dated.Title || ticked.DueDate == nil {
		t.Fatalf("tick should preserve fields: %+v", ticked)
	}

	// An explicit null clears the deadline.
	resp = do(t, http.MethodPatch, base+"/"+dated.ID, map[string]any{"due_date": nil})
	cleared := decodeTodo(t, resp)
	if cleared.DueDate != nil || !cleared.Done {
		t.Fatalf("null due_date should clear only the date: %+v", cleared)
	}

	// Delete, then delete again → 404.
	resp = do(t, http.MethodDelete, base+"/"+dated.ID, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
	resp = do(t, http.MethodDelete, base+"/"+dated.ID, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("delete missing: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestTodos_ValidationAndAccess(t *testing.T) {
	t.Parallel()

	srv := newTestServer(t, newFakeStore(), allowAuthz{})
	resp := do(t, http.MethodPost, srv.URL+"/trips/trip-1/todos", map[string]any{"title": ""})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("blank title: want 400, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
	resp = do(t, http.MethodPost, srv.URL+"/trips/trip-1/todos",
		map[string]any{"title": "Visa", "due_date": "next week"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad date: want 400, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
	resp = do(t, http.MethodPatch, srv.URL+"/trips/trip-1/todos/nope", map[string]any{"done": true})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("missing todo: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// A viewer can read but not write.
	viewer := newTestServer(t, newFakeStore(), readOnlyAuthz{})
	resp = do(t, http.MethodGet, viewer.URL+"/trips/trip-1/todos", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("viewer read: want 200, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
	resp = do(t, http.MethodPost, viewer.URL+"/trips/trip-1/todos", map[string]any{"title": "Visa"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("viewer write: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// A non-member sees nothing.
	stranger := newTestServer(t, newFakeStore(), denyAuthz{})
	resp = do(t, http.MethodGet, stranger.URL+"/trips/trip-1/todos", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("non-member read: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}
