//go:build integration

// Integration tests for the S4 re-planning test suite (M04.4 S4). These tests
// cover cross-operation idempotency: replaying the same reorder, move, or status
// mutation twice must not produce duplication or data corruption. They run
// against the migrated schema (M01.3 harness) via testPool.
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN> go test -tags=integration ./internal/trip/...
package trip

import (
	"fmt"
	"testing"
)

// TestReplayReorderConvergesIntegration replays the same reorder request twice
// and asserts that all items have the same sort_order on both passes —
// demonstrating convergence for offline replay (PRD §6).
func TestReplayReorderConvergesIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping replay-reorder integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-10-01")

	a := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Alpha","day_id":%q}`, dayID))
	b := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Beta","day_id":%q}`, dayID))
	c := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Gamma","day_id":%q}`, dayID))

	reorderBody := fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q,%q]}`, dayID, c.ID, a.ID, b.ID)

	first := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)
	second := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)

	if len(first) != len(second) {
		t.Fatalf("replay produced different item counts: %d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i].ID != second[i].ID {
			t.Errorf("replay index %d: id %q vs %q, want same", i, first[i].ID, second[i].ID)
		}
		if first[i].SortOrder != second[i].SortOrder {
			t.Errorf("replay index %d: sort_order %d vs %d, want same",
				i, first[i].SortOrder, second[i].SortOrder)
		}
	}
	// Order must match the requested sequence: C, A, B.
	wantOrder := []string{c.ID, a.ID, b.ID}
	for i, item := range second {
		if item.ID != wantOrder[i] {
			t.Errorf("after replay index %d: id=%q, want %q", i, item.ID, wantOrder[i])
		}
	}
}

// TestReplayMoveConvergesIntegration replays the same move request twice and
// asserts that day_id stays on the target day without duplication.
func TestReplayMoveConvergesIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping replay-move integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	srcDayID := getDayID(t, srv, tripID, "2026-10-02")
	dstDayID := getDayID(t, srv, tripID, "2026-10-03")

	pi := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Walk","day_id":%q}`, srcDayID))
	moveBody := fmt.Sprintf(`{"day_id":%q}`, dstDayID)

	first := movePlanItem(t, srv, tripID, pi.ID, moveBody)
	second := movePlanItem(t, srv, tripID, pi.ID, moveBody)

	if first.ID != second.ID {
		t.Errorf("replay move: id changed from %q to %q (same row expected)", first.ID, second.ID)
	}
	if first.DayID == nil || second.DayID == nil || *first.DayID != *second.DayID {
		t.Errorf("replay move: day_id %v vs %v, want same", first.DayID, second.DayID)
	}
	if *second.DayID != dstDayID {
		t.Errorf("replay move: day_id = %q, want %q", *second.DayID, dstDayID)
	}
}

// TestReplayStatusConvergesIntegration replays the same status mutation twice
// and asserts the item converges to the target status without corruption.
func TestReplayStatusConvergesIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping replay-status integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-10-04")

	pi := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Dinner","day_id":%q}`, dayID))

	first := setPlanItemStatus(t, srv, tripID, pi.ID, "done")
	second := setPlanItemStatus(t, srv, tripID, pi.ID, "done")

	if first.Status != "done" || second.Status != "done" {
		t.Errorf("replay status: first=%q second=%q, want both done", first.Status, second.Status)
	}
	if first.ID != second.ID {
		t.Errorf("replay status: id changed from %q to %q (same row expected)", first.ID, second.ID)
	}
}

// TestReplayAllThreeOperationsIntegration sequences a reorder, move, and status
// change on the same set of items, then replays each mutation and verifies the
// final state is identical — no duplication or corruption across operations.
func TestReplayAllThreeOperationsIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping combined replay integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	day1ID := getDayID(t, srv, tripID, "2026-10-05")
	day2ID := getDayID(t, srv, tripID, "2026-10-06")

	// Create two items on day1 and one on day2.
	piA := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Activity A","day_id":%q}`, day1ID))
	piB := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Activity B","day_id":%q}`, day1ID))

	// 1. Reorder day1: B before A. Replay twice.
	reorderBody := fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q]}`, day1ID, piB.ID, piA.ID)
	r1a := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)
	r1b := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)
	if len(r1a) != len(r1b) {
		t.Fatalf("reorder replay: item count %d vs %d", len(r1a), len(r1b))
	}
	for i := range r1a {
		if r1a[i].SortOrder != r1b[i].SortOrder {
			t.Errorf("reorder replay index %d: sort_order %d vs %d", i, r1a[i].SortOrder, r1b[i].SortOrder)
		}
	}

	// 2. Move A from day1 to day2. Replay twice.
	moveBody := fmt.Sprintf(`{"day_id":%q}`, day2ID)
	m1a := movePlanItem(t, srv, tripID, piA.ID, moveBody)
	m1b := movePlanItem(t, srv, tripID, piA.ID, moveBody)
	if m1a.ID != m1b.ID || m1a.DayID == nil || m1b.DayID == nil || *m1a.DayID != *m1b.DayID {
		t.Errorf("move replay: id %q/%q day_id %v/%v, want same", m1a.ID, m1b.ID, m1a.DayID, m1b.DayID)
	}
	if *m1b.DayID != day2ID {
		t.Errorf("move replay: final day_id = %q, want %q", *m1b.DayID, day2ID)
	}

	// 3. Mark B as "skipped". Replay twice.
	s1a := setPlanItemStatus(t, srv, tripID, piB.ID, "skipped")
	s1b := setPlanItemStatus(t, srv, tripID, piB.ID, "skipped")
	if s1a.Status != "skipped" || s1b.Status != "skipped" {
		t.Errorf("status replay: %q/%q, want both skipped", s1a.Status, s1b.Status)
	}
	if s1a.ID != s1b.ID {
		t.Errorf("status replay: id changed from %q to %q", s1a.ID, s1b.ID)
	}
}
