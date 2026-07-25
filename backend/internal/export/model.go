// Package export assembles a trip's full content into a single in-memory Model
// that the renderer (M13.2 S2) turns into HTML for Google Docs conversion.
//
// It owns only plain data + composition. It never imports the trip, journal, or
// budget modules: everything it needs arrives through the Reader interface,
// which the composition root satisfies with adapters over those modules' stores
// (mirroring how the budget module reads trip costs via a consumer-side
// interface). This keeps the schema-per-module boundary intact.
package export

import "time"

// Model is the whole document to render: a cover, per-day sections in date
// order, and a budget summary.
type Model struct {
	TripName     string
	Destinations []string
	StartDate    time.Time
	EndDate      time.Time
	DayCount     int
	Currency     string
	GeneratedAt  time.Time

	Days   []Day
	Budget Budget

	// PhotosOmitted is how many photos were dropped from embedding (byte budget
	// exhausted or a failed fetch), so the renderer can note it. Zero when photos
	// are excluded entirely (a deliberate text-only export) or all embedded.
	PhotosOmitted int
}

// Header is the trip-level cover data returned by Reader.Header.
type Header struct {
	Name         string
	Destinations []string
	StartDate    time.Time
	EndDate      time.Time
	Currency     string
}

// Day is one day's section: the night's stay, the planned timeline, what
// actually happened, and the diary entry. Any of these may be zero/empty and the
// renderer omits the corresponding block.
type Day struct {
	ID    string
	Date  time.Time
	Index int
	Notes string

	Stay         *Stay
	Planned      []Item // the intended plan, clock-ordered
	WhatHappened []Item // done or logged-after-the-fact, in the order they occurred
	Journal      *Journal
}

// Stay is the accommodation for a night.
type Stay struct {
	Name     string
	Location string
	CheckIn  *time.Time
	CheckOut *time.Time
	Cost     *float64
	Paid     bool
	Link     string
}

// Item is a plan entry (activity, transport, food, or note). Transport legs
// carry Origin/Destination and an ArriveTime; other kinds leave them empty.
type Item struct {
	Title         string
	Kind          string // activity | transport | food | note
	StartTime     string // "HH:MM"; empty = untimed
	ArriveTime    string // transport only
	Origin        string // transport only
	Destination   string // transport only
	Location      string
	Cost          *float64
	BookingStatus string
	Note          string
	Status        string // idea | planned | done | skipped | cancelled
}

// Journal is a day's diary entry.
type Journal struct {
	Rating  *int // 1–5; nil = unset
	Weather string
	Mood    string
	Text    string
	Photos  []Photo // populated by S3; empty here
}

// Photo is one journal photo. S3 fills Data (a data: URI) when photos are
// embedded; until then only the references are known.
type Photo struct {
	Caption      string
	ThumbnailURL string
	StorageURL   string
	Data         string // data: URI when embedded (S3); empty otherwise
}

// Budget is the trip's spend summary: planned vs. spent vs. still-estimated per
// category, plus totals. Amounts are in the trip's base currency.
type Budget struct {
	Currency       string
	Categories     []BudgetCategory
	PlannedTotal   float64
	SpentTotal     float64
	EstimatedTotal float64
}

// BudgetCategory is one category's line in the budget summary.
type BudgetCategory struct {
	Name      string
	Planned   float64
	Spent     float64
	Estimated float64
}
