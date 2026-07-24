package export

import (
	"context"
	"errors"
	"testing"
	"time"
)

// fakeReader is a Reader stub; each field backs one method, and errX injects a
// failure into that method.
type fakeReader struct {
	header   Header
	days     []Day
	items    []DayItem
	stays    []DayStay
	journals []DayJournal
	budget   Budget

	errHeader, errDays, errItems, errStays, errJournals, errBudget error

	gotDayCount int
}

func (f *fakeReader) Header(context.Context, string) (Header, error) {
	return f.header, f.errHeader
}
func (f *fakeReader) Days(context.Context, string) ([]Day, error) { return f.days, f.errDays }
func (f *fakeReader) PlanItems(context.Context, string) ([]DayItem, error) {
	return f.items, f.errItems
}
func (f *fakeReader) Stays(context.Context, string) ([]DayStay, error) { return f.stays, f.errStays }
func (f *fakeReader) Journals(context.Context, string) ([]DayJournal, error) {
	return f.journals, f.errJournals
}
func (f *fakeReader) Budget(_ context.Context, _ string, dayCount int) (Budget, error) {
	f.gotDayCount = dayCount
	return f.budget, f.errBudget
}

func date(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func build(t *testing.T, r Reader) Model {
	t.Helper()
	m, err := BuildExportModel(context.Background(), r, "trip-1")
	if err != nil {
		t.Fatalf("BuildExportModel: %v", err)
	}
	return m
}

func TestBuildExportModel_ComposesHeaderDaysAndBudget(t *testing.T) {
	r := &fakeReader{
		header: Header{
			Name:         "Northern Portugal",
			Destinations: []string{"Porto", "Douro"},
			StartDate:    date("2026-05-12"),
			EndDate:      date("2026-05-14"),
			Currency:     "EUR",
		},
		days: []Day{
			{ID: "d1", Date: date("2026-05-12"), Index: 1},
			{ID: "d2", Date: date("2026-05-13"), Index: 2},
		},
		budget: Budget{Currency: "EUR", PlannedTotal: 100, SpentTotal: 60},
	}
	m := build(t, r)

	if m.TripName != "Northern Portugal" || m.Currency != "EUR" {
		t.Errorf("header not carried: %+v", m)
	}
	if m.DayCount != 2 || len(m.Days) != 2 {
		t.Errorf("day count = %d, want 2", m.DayCount)
	}
	if r.gotDayCount != 2 {
		t.Errorf("Budget got dayCount %d, want 2", r.gotDayCount)
	}
	if m.Budget.SpentTotal != 60 {
		t.Errorf("budget not carried: %+v", m.Budget)
	}
	if m.GeneratedAt.IsZero() {
		t.Error("GeneratedAt not set")
	}
}

func TestBuildExportModel_AttachesStayAndJournalToTheirDay(t *testing.T) {
	r := &fakeReader{
		days: []Day{{ID: "d1", Date: date("2026-05-12")}, {ID: "d2", Date: date("2026-05-13")}},
		stays: []DayStay{
			{DayID: "d2", Stay: Stay{Name: "The Yeatman"}},
			// A duplicate for the same day must not overwrite the first.
			{DayID: "d2", Stay: Stay{Name: "Should be ignored"}},
		},
		journals: []DayJournal{{DayID: "d1", Journal: Journal{Text: "Great day", Mood: "content"}}},
	}
	m := build(t, r)

	if m.Days[0].Stay != nil {
		t.Error("d1 should have no stay")
	}
	if m.Days[1].Stay == nil || m.Days[1].Stay.Name != "The Yeatman" {
		t.Errorf("d2 stay = %+v, want The Yeatman (first wins)", m.Days[1].Stay)
	}
	if m.Days[0].Journal == nil || m.Days[0].Journal.Text != "Great day" {
		t.Errorf("d1 journal not attached: %+v", m.Days[0].Journal)
	}
	if m.Days[1].Journal != nil {
		t.Error("d2 should have no journal")
	}
}

func TestBuildExportModel_SplitsPlannedAndWhatHappened(t *testing.T) {
	r := &fakeReader{
		days: []Day{{ID: "d1", Date: date("2026-05-12")}},
		items: []DayItem{
			// planned, timed
			{DayID: "d1", SortOrder: 0, Item: Item{Title: "Lello", StartTime: "09:30", Status: "planned"}},
			// planned, done → appears in BOTH lists
			{DayID: "d1", SortOrder: 1, ActualOrder: 1, Item: Item{Title: "Lunch", StartTime: "12:00", Status: "done"}},
			// unplanned (logged after) → only what-happened
			{DayID: "d1", Unplanned: true, ActualOrder: 0, Item: Item{Title: "Sunset", Status: "done"}},
			// orphan (no such day) → skipped entirely
			{DayID: "nope", Item: Item{Title: "Ghost"}},
		},
	}
	m := build(t, r)
	d := m.Days[0]

	if got := titles(d.Planned); !equal(got, []string{"Lello", "Lunch"}) {
		t.Errorf("planned = %v, want [Lello Lunch]", got)
	}
	// what-happened ordered by ActualOrder: Sunset(0) before Lunch(1).
	if got := titles(d.WhatHappened); !equal(got, []string{"Sunset", "Lunch"}) {
		t.Errorf("whatHappened = %v, want [Sunset Lunch]", got)
	}
}

func TestBuildExportModel_PlannedOrdersTimedBeforeUntimed(t *testing.T) {
	r := &fakeReader{
		days: []Day{{ID: "d1"}},
		items: []DayItem{
			{DayID: "d1", SortOrder: 5, Item: Item{Title: "untimed-a", Status: "planned"}},
			{DayID: "d1", SortOrder: 2, Item: Item{Title: "untimed-b", Status: "planned"}},
			{DayID: "d1", Item: Item{Title: "15:30", StartTime: "15:30", Status: "planned"}},
			{DayID: "d1", Item: Item{Title: "09:00", StartTime: "09:00", Status: "planned"}},
		},
	}
	m := build(t, r)
	// timed in clock order first, then untimed by SortOrder.
	if got := titles(m.Days[0].Planned); !equal(got, []string{"09:00", "15:30", "untimed-b", "untimed-a"}) {
		t.Errorf("planned order = %v", got)
	}
}

func TestBuildExportModel_SortsDaysChronologically(t *testing.T) {
	// Adapter returns days out of order; the model must be chronological.
	r := &fakeReader{days: []Day{
		{ID: "d3", Date: date("2026-05-14")},
		{ID: "d1", Date: date("2026-05-12")},
		{ID: "d2", Date: date("2026-05-13")},
	}}
	m := build(t, r)
	got := []string{m.Days[0].ID, m.Days[1].ID, m.Days[2].ID}
	if !equal(got, []string{"d1", "d2", "d3"}) {
		t.Errorf("day order = %v, want [d1 d2 d3]", got)
	}
}

func TestBuildExportModel_EmptyDegradesCleanly(t *testing.T) {
	// A trip with days but no stays/items/journals must not error and must leave
	// those sections empty.
	r := &fakeReader{days: []Day{{ID: "d1", Date: date("2026-05-12")}}}
	m := build(t, r)
	d := m.Days[0]
	if d.Stay != nil || d.Journal != nil || len(d.Planned) != 0 || len(d.WhatHappened) != 0 {
		t.Errorf("empty day not clean: %+v", d)
	}
}

func TestBuildExportModel_PropagatesReaderErrors(t *testing.T) {
	sentinel := errors.New("boom")
	cases := map[string]*fakeReader{
		"header":   {errHeader: sentinel},
		"days":     {errDays: sentinel},
		"items":    {errItems: sentinel},
		"stays":    {errStays: sentinel},
		"journals": {errJournals: sentinel},
		"budget":   {errBudget: sentinel},
	}
	for name, r := range cases {
		if _, err := BuildExportModel(context.Background(), r, "t"); !errors.Is(err, sentinel) {
			t.Errorf("%s: err = %v, want sentinel", name, err)
		}
	}
}

// helpers
func titles(items []Item) []string {
	out := make([]string, len(items))
	for i, it := range items {
		out[i] = it.Title
	}
	return out
}
func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
