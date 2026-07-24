package export

import (
	"context"
	"sort"
	"time"
)

// Reader is the export module's view of everything it needs about a trip. The
// composition root satisfies it with adapters over the trip, journal, and budget
// stores. Every list is keyed by day id (where applicable) so BuildExportModel
// is pure grouping + ordering — the date arithmetic (which night a stay covers,
// which day a journal belongs to) lives in the adapter, which knows the dates.
type Reader interface {
	// Header returns the trip cover data.
	Header(ctx context.Context, tripID string) (Header, error)
	// Days returns the trip's days in date order (ID, Date, Index, Notes).
	Days(ctx context.Context, tripID string) ([]Day, error)
	// PlanItems returns every dated plan item, each tagged with its day and the
	// ordering keys needed to split planned vs. what-happened.
	PlanItems(ctx context.Context, tripID string) ([]DayItem, error)
	// Stays returns one entry per (day a stay covers) so a multi-night stay maps
	// onto each of its nights.
	Stays(ctx context.Context, tripID string) ([]DayStay, error)
	// Journals returns each day's diary entry (at most one per day).
	Journals(ctx context.Context, tripID string) ([]DayJournal, error)
	// Budget returns the trip's spend summary; dayCount lets the adapter compose
	// per-day allowances into a trip total.
	Budget(ctx context.Context, tripID string, dayCount int) (Budget, error)
}

// DayItem is a plan item tagged with its day and the ordering keys used to place
// it. Unplanned marks an item logged after the fact; Status distinguishes done
// from planned/idea/skipped/cancelled.
type DayItem struct {
	DayID       string
	Unplanned   bool
	SortOrder   int
	ActualOrder int
	Item        Item
}

// DayStay ties a stay to one day it covers.
type DayStay struct {
	DayID string
	Stay  Stay
}

// DayJournal ties a diary entry to its day.
type DayJournal struct {
	DayID   string
	Journal Journal
}

// BuildExportModel assembles the full Model for a trip by reading through r and
// composing the pieces onto the trip's days. It assumes the caller has already
// authorized access to tripID. Sections with no data stay empty (the renderer
// omits them) rather than erroring.
func BuildExportModel(ctx context.Context, r Reader, tripID string) (Model, error) {
	header, err := r.Header(ctx, tripID)
	if err != nil {
		return Model{}, err
	}
	days, err := r.Days(ctx, tripID)
	if err != nil {
		return Model{}, err
	}
	items, err := r.PlanItems(ctx, tripID)
	if err != nil {
		return Model{}, err
	}
	stays, err := r.Stays(ctx, tripID)
	if err != nil {
		return Model{}, err
	}
	journals, err := r.Journals(ctx, tripID)
	if err != nil {
		return Model{}, err
	}
	budget, err := r.Budget(ctx, tripID, len(days))
	if err != nil {
		return Model{}, err
	}

	// Index days by id so the flat, day-keyed lists can be attached in one pass.
	byID := make(map[string]*Day, len(days))
	for i := range days {
		byID[days[i].ID] = &days[i]
	}

	// First stay/journal wins per day (there is at most one of each).
	for _, ds := range stays {
		if d := byID[ds.DayID]; d != nil && d.Stay == nil {
			s := ds.Stay
			d.Stay = &s
		}
	}
	for _, dj := range journals {
		if d := byID[dj.DayID]; d != nil && d.Journal == nil {
			j := dj.Journal
			d.Journal = &j
		}
	}

	// Split each day's items into the intended plan and what actually happened.
	// An item is "what happened" when it was done or logged unplanned; the plan
	// is everything that was intended (not logged after the fact). Orphan items
	// (no matching day) are skipped.
	plannedByDay := map[string][]DayItem{}
	happenedByDay := map[string][]DayItem{}
	for _, di := range items {
		if byID[di.DayID] == nil {
			continue
		}
		if !di.Unplanned {
			plannedByDay[di.DayID] = append(plannedByDay[di.DayID], di)
		}
		if di.Unplanned || di.Item.Status == "done" {
			happenedByDay[di.DayID] = append(happenedByDay[di.DayID], di)
		}
	}

	for i := range days {
		d := &days[i]
		planned := plannedByDay[d.ID]
		sort.SliceStable(planned, func(a, b int) bool { return plannedLess(planned[a], planned[b]) })
		d.Planned = projectItems(planned)

		happened := happenedByDay[d.ID]
		sort.SliceStable(happened, func(a, b int) bool { return happenedLess(happened[a], happened[b]) })
		d.WhatHappened = projectItems(happened)
	}

	return Model{
		TripName:     header.Name,
		Destinations: header.Destinations,
		StartDate:    header.StartDate,
		EndDate:      header.EndDate,
		DayCount:     len(days),
		Currency:     header.Currency,
		GeneratedAt:  time.Now().UTC(),
		Days:         days,
		Budget:       budget,
	}, nil
}

// projectItems extracts the plain Item from an ordered slice of DayItems.
func projectItems(dis []DayItem) []Item {
	if len(dis) == 0 {
		return nil
	}
	out := make([]Item, len(dis))
	for i, di := range dis {
		out[i] = di.Item
	}
	return out
}

// plannedLess orders the intended plan: timed items first in clock order, then
// untimed items by their manual SortOrder. Ties break on SortOrder so the order
// is stable and deterministic.
func plannedLess(a, b DayItem) bool {
	at, bt := a.Item.StartTime, b.Item.StartTime
	if (at == "") != (bt == "") {
		return at != "" // a timed item sorts before an untimed one
	}
	if at != bt {
		return at < bt // both timed: clock order ("HH:MM" sorts lexically)
	}
	return a.SortOrder < b.SortOrder
}

// happenedLess orders the "what happened" list by its independent ActualOrder,
// then by clock time, then title — a stable, deterministic order.
func happenedLess(a, b DayItem) bool {
	if a.ActualOrder != b.ActualOrder {
		return a.ActualOrder < b.ActualOrder
	}
	if a.Item.StartTime != b.Item.StartTime {
		return a.Item.StartTime < b.Item.StartTime
	}
	return a.Item.Title < b.Item.Title
}
