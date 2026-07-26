package main

import (
	"testing"
	"time"

	"github.com/gmestre98/khiimori/backend/internal/budget"
	"github.com/gmestre98/khiimori/backend/internal/export"
)

func tPtr(s string) *time.Time {
	tm, _ := time.Parse("2006-01-02", s)
	return &tm
}

func TestCoveredDayIDs(t *testing.T) {
	dayByDate := map[string]string{
		"2026-05-12": "d12", "2026-05-13": "d13", "2026-05-14": "d14",
	}
	t.Run("multi-night covers each night up to checkout", func(t *testing.T) {
		got := coveredDayIDs(export.Stay{CheckIn: tPtr("2026-05-12"), CheckOut: tPtr("2026-05-14")}, dayByDate)
		if len(got) != 2 || got[0] != "d12" || got[1] != "d13" {
			t.Errorf("got %v, want [d12 d13] (checkout day excluded)", got)
		}
	})
	t.Run("check-in only covers that day", func(t *testing.T) {
		got := coveredDayIDs(export.Stay{CheckIn: tPtr("2026-05-13")}, dayByDate)
		if len(got) != 1 || got[0] != "d13" {
			t.Errorf("got %v, want [d13]", got)
		}
	})
	t.Run("no dates covers nothing", func(t *testing.T) {
		if got := coveredDayIDs(export.Stay{}, dayByDate); got != nil {
			t.Errorf("got %v, want nil", got)
		}
	})
	t.Run("nights outside the trip's days are skipped", func(t *testing.T) {
		got := coveredDayIDs(export.Stay{CheckIn: tPtr("2026-05-11"), CheckOut: tPtr("2026-05-13")}, dayByDate)
		// 05-11 has no day row; 05-12 does.
		if len(got) != 1 || got[0] != "d12" {
			t.Errorf("got %v, want [d12]", got)
		}
	})
}

func TestJournalText(t *testing.T) {
	if got := journalText([]byte(`{"text":"Best day so far."}`)); got != "Best day so far." {
		t.Errorf("got %q", got)
	}
	if got := journalText([]byte(`{}`)); got != "" {
		t.Errorf("empty envelope should yield empty text, got %q", got)
	}
	if got := journalText(nil); got != "" {
		t.Errorf("nil body should yield empty text, got %q", got)
	}
}

func TestCategoryLabel(t *testing.T) {
	cases := map[string]string{"stays": "Stays", "food": "Food", "": "Other"}
	for in, want := range cases {
		if got := categoryLabel(in); got != want {
			t.Errorf("categoryLabel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMapBudget_ComposesPlannedAndTotals(t *testing.T) {
	r := budget.RollupResult{
		TripTotal:           1032.5,
		ByCategory:          map[string]float64{"stays": 720, "food": 312.5},
		EstimatedTripTotal:  180,
		EstimatedByCategory: map[string]float64{"stays": 180},
		PlannedByCategory:   map[string]float64{"stays": 900}, // whole-trip lump
		DailyByCategory:     map[string]float64{"food": 50},   // per-day allowance
		PlannedByDayCategory: map[string]map[string]float64{
			"d1": {"food": 20}, // a single-day extra
		},
	}
	b := mapBudget(r, 4) // 4 days

	if b.Currency != "EUR" {
		t.Errorf("currency = %q", b.Currency)
	}
	// food planned = daily 50*4 + day extra 20 = 220; stays planned = 900.
	byName := map[string]export.BudgetCategory{}
	for _, c := range b.Categories {
		byName[c.Name] = c
	}
	if byName["Food"].Planned != 220 {
		t.Errorf("food planned = %v, want 220", byName["Food"].Planned)
	}
	if byName["Stays"].Planned != 900 || byName["Stays"].Spent != 720 || byName["Stays"].Estimated != 180 {
		t.Errorf("stays = %+v", byName["Stays"])
	}
	if b.PlannedTotal != 1120 { // 900 + 220
		t.Errorf("planned total = %v, want 1120", b.PlannedTotal)
	}
	if b.SpentTotal != 1032.5 || b.EstimatedTotal != 180 {
		t.Errorf("totals: spent=%v estimated=%v", b.SpentTotal, b.EstimatedTotal)
	}
	// Categories sorted alphabetically → Food before Stays.
	if len(b.Categories) != 2 || b.Categories[0].Name != "Food" {
		t.Errorf("categories = %+v, want sorted [Food Stays]", b.Categories)
	}
}
