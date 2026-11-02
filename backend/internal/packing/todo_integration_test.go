//go:build integration

package packing

import (
	"encoding/json"
	"net/http"
	"testing"
)

// TestIntegration_Todos_CRUDOrderingAndDates drives the to-do endpoints against
// the migrated packing.todos table: deadline ordering, partial updates that keep
// other fields, clearing a deadline with an explicit null, and trip scoping.
func TestIntegration_Todos_CRUDOrderingAndDates(t *testing.T) {
	ownerID := freshUUID(t)
	srv := newIntegServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	base := srv.URL + "/trips/" + tripID + "/todos"

	create := func(body map[string]any) todoResponse {
		t.Helper()
		resp := do(t, http.MethodPost, base, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("create %v: want 201, got %d", body, resp.StatusCode)
		}
		return decodeTodo(t, resp)
	}
	undated := create(map[string]any{"title": "Print passport copies"})
	late := create(map[string]any{"title": "Mauritanian visa", "due_date": "2026-11-28"})
	early := create(map[string]any{"title": "Travel insurance", "due_date": "2026-11-17", "note": "covers the ore train"})

	if early.DueDate == nil || *early.DueDate != "2026-11-17" || early.Note != "covers the ore train" {
		t.Fatalf("dated create round-trip: %+v", early)
	}

	// Soonest deadline first, no deadline last.
	resp := do(t, http.MethodGet, base, nil)
	var list []todoResponse
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()
	if len(list) != 3 || list[0].ID != early.ID || list[1].ID != late.ID || list[2].ID != undated.ID {
		t.Fatalf("ordering wrong: %+v", list)
	}

	// Tick done keeps title and date; then move the deadline.
	resp = do(t, http.MethodPatch, base+"/"+late.ID, map[string]any{"done": true})
	ticked := decodeTodo(t, resp)
	if !ticked.Done || ticked.Title != "Mauritanian visa" || ticked.DueDate == nil || *ticked.DueDate != "2026-11-28" {
		t.Fatalf("tick: %+v", ticked)
	}
	resp = do(t, http.MethodPatch, base+"/"+late.ID, map[string]any{"due_date": "2026-11-25"})
	moved := decodeTodo(t, resp)
	if moved.DueDate == nil || *moved.DueDate != "2026-11-25" || !moved.Done {
		t.Fatalf("move date: %+v", moved)
	}

	// An explicit null clears the deadline.
	resp = do(t, http.MethodPatch, base+"/"+late.ID, map[string]any{"due_date": nil})
	cleared := decodeTodo(t, resp)
	if cleared.DueDate != nil {
		t.Fatalf("clear date: %+v", cleared)
	}

	// Another trip's id cannot touch this to-do.
	otherTrip := insertTrip(t, ownerID)
	resp = do(t, http.MethodDelete, srv.URL+"/trips/"+otherTrip+"/todos/"+late.ID, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("cross-trip delete: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	resp = do(t, http.MethodDelete, base+"/"+late.ID, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

// TestIntegration_Todos_NonMemberDenied: a user with no membership gets 404 on
// read and write, so the trip's existence is not revealed.
func TestIntegration_Todos_NonMemberDenied(t *testing.T) {
	ownerID := freshUUID(t)
	strangerID := freshUUID(t)
	srv := newIntegServer(t, strangerID)
	tripID := insertTrip(t, ownerID)

	resp := do(t, http.MethodGet, srv.URL+"/trips/"+tripID+"/todos", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("read: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
	resp = do(t, http.MethodPost, srv.URL+"/trips/"+tripID+"/todos", map[string]any{"title": "x"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("write: want 404, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()
}
