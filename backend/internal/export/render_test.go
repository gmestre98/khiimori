package export

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func ptrF(f float64) *float64 { return &f }
func ptrI(i int) *int         { return &i }

// sampleModel is a fixed, deterministic Model (a stable GeneratedAt) used by the
// golden and substring tests.
func sampleModel() Model {
	checkOut := date("2026-05-15")
	return Model{
		TripName:     "Northern Portugal",
		Destinations: []string{"Porto", "Douro Valley"},
		StartDate:    date("2026-05-12"),
		EndDate:      date("2026-05-18"),
		DayCount:     7,
		Currency:     "EUR",
		GeneratedAt:  time.Date(2026, 7, 24, 9, 30, 0, 0, time.UTC),
		Budget: Budget{
			Currency: "EUR",
			Categories: []BudgetCategory{
				{Name: "Stays", Planned: 900, Spent: 720},
				{Name: "Food", Planned: 400, Spent: 312.5},
			},
			PlannedTotal: 1300, SpentTotal: 1032.5, EstimatedTotal: 180,
		},
		Days: []Day{
			{
				ID: "d3", Index: 3, Date: date("2026-05-14"),
				Stay: &Stay{Name: "The Yeatman", Location: "Vila Nova de Gaia", CheckOut: &checkOut, Cost: ptrF(180), Paid: true},
				Planned: []Item{
					{Title: "Livraria Lello", Kind: "activity", StartTime: "09:30", Location: "Rua das Carmelitas", Cost: ptrF(5)},
					{Title: "Train to Pinhão", Kind: "transport", StartTime: "15:30", Origin: "São Bento", Destination: "Pinhão", ArriveTime: "17:40", Cost: ptrF(18)},
				},
				WhatHappened: []Item{
					{Title: "Sunset by the river", Status: "done"},
				},
				Journal: &Journal{Rating: ptrI(5), Weather: "sunny", Mood: "content", Text: "Best day so far."},
			},
		},
	}
}

func TestRender_ContainsKeySections(t *testing.T) {
	out, err := Render(sampleModel())
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	html := string(out)
	for _, want := range []string{
		"Northern Portugal",
		"Porto · Douro Valley",
		"12–18 May 2026 · 7 days · EUR",
		"<h2>Budget</h2>",
		"€1,032.50", // spent total, thousands + cents
		"Day 3 — Thursday, 14 May",
		"The Yeatman",
		"Livraria Lello",
		"São Bento → Pinhão",
		"arrives 17:40",
		"What happened",
		"★★★★★", // rating 5 → 5 filled stars
		"Best day so far.",
		`class="day"`, // page-break wrapper
	} {
		if !strings.Contains(html, want) {
			t.Errorf("rendered HTML missing %q", want)
		}
	}
}

func TestRender_EscapesUserText(t *testing.T) {
	m := sampleModel()
	m.Days[0].Planned[0].Title = `<script>alert('x')</script>`
	m.Days[0].Journal.Text = "5 > 3 & <b>bold</b>"
	out, err := Render(m)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	html := string(out)
	if strings.Contains(html, "<script>alert") {
		t.Error("script tag not escaped — injection risk")
	}
	if !strings.Contains(html, "&lt;script&gt;") {
		t.Error("expected escaped script tag")
	}
	if !strings.Contains(html, "5 &gt; 3 &amp; &lt;b&gt;bold&lt;/b&gt;") {
		t.Error("diary text not escaped")
	}
}

func TestRender_EmptyDayOmitsSections(t *testing.T) {
	m := Model{
		TripName: "Bare trip", Currency: "EUR",
		StartDate: date("2026-01-01"), EndDate: date("2026-01-01"), DayCount: 1,
		Days: []Day{{ID: "d1", Index: 1, Date: date("2026-01-01")}},
	}
	out, err := Render(m)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	html := string(out)
	if strings.Contains(html, "class=\"stay\"") || strings.Contains(html, "<h3>Plan</h3>") ||
		strings.Contains(html, "What happened") || strings.Contains(html, "<h3>Diary</h3>") {
		t.Error("empty day should omit stay/plan/what-happened/diary blocks")
	}
	if strings.Contains(html, "<h2>Budget</h2>") {
		t.Error("no budget categories → no budget table")
	}
}

// TestRender_Golden compares the render of the fixed sample against a checked-in
// snapshot. Regenerate with EXPORT_GOLDEN_UPDATE=1 go test ./internal/export/.
func TestRender_Golden(t *testing.T) {
	out, err := Render(sampleModel())
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	golden := filepath.Join("testdata", "render_golden.html")
	if os.Getenv("EXPORT_GOLDEN_UPDATE") == "1" {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(golden, out, 0o644); err != nil {
			t.Fatal(err)
		}
		t.Log("golden updated")
		return
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("read golden (run with EXPORT_GOLDEN_UPDATE=1 to create): %v", err)
	}
	if string(out) != string(want) {
		t.Errorf("render output drifted from golden; re-run with EXPORT_GOLDEN_UPDATE=1 to inspect/update")
	}
}
