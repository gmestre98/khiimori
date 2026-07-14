package budget

import (
	"errors"
	"fmt"
)

// Category is one of the fixed budget categories (PRD §5.4).
type Category string

const (
	CategoryStays      Category = "Stays"
	CategoryTransport  Category = "Transport"
	CategoryFood       Category = "Food"
	CategoryActivities Category = "Activities"
	CategoryOther      Category = "Other"
)

// validCategories is the exhaustive allowed set, keyed for O(1) lookup.
var validCategories = map[Category]struct{}{
	CategoryStays:      {},
	CategoryTransport:  {},
	CategoryFood:       {},
	CategoryActivities: {},
	CategoryOther:      {},
}

// ErrInvalidCategory is returned when the supplied category is not in the fixed
// set.
var ErrInvalidCategory = errors.New("budget: invalid category")

// ErrCostEntryNotFound is returned when a cost entry lookup by id + trip_id
// finds no matching row.
var ErrCostEntryNotFound = errors.New("budget: cost entry not found")

// validateCategory returns ErrInvalidCategory when c is not in the fixed set.
func validateCategory(c Category) error {
	if _, ok := validCategories[c]; !ok {
		return fmt.Errorf("%w: %q", ErrInvalidCategory, c)
	}
	return nil
}

// Scope describes how a budget line applies (enhanced budgeting model):
//
//	ScopeTrip  — a whole-trip lump for the category (DayID == "").
//	ScopeDaily — a per-day allowance that applies to every day (DayID == "").
//	ScopeDay   — an extra on one specific day (DayID != "").
//
// The same set is a CHECK constraint on budget_lines.scope.
type Scope string

const (
	ScopeTrip  Scope = "trip"
	ScopeDaily Scope = "daily"
	ScopeDay   Scope = "day"
)

var validScopes = map[Scope]struct{}{ScopeTrip: {}, ScopeDaily: {}, ScopeDay: {}}

// BudgetLine is one row from budget.budget_lines: a planned amount per category
// scoped as a trip lump, a per-day allowance, or a single-day extra.
type BudgetLine struct {
	ID            string
	TripID        string
	DayID         string // empty string == trip-level (day_id IS NULL)
	Category      Category
	Scope         Scope
	PlannedAmount float64
	ActualAmount  float64 // maintained by Epic M05.2; read-only here
}

// SetBudgetLine is the validated input to upsert a budget line.
type SetBudgetLine struct {
	TripID        string
	DayID         string // empty == trip-level
	Category      Category
	Scope         Scope
	PlannedAmount float64
}

// validate returns a client-safe error when any field is invalid. It also
// enforces scope/day_id consistency: a 'day' extra needs a day, and 'trip'/
// 'daily' amounts are trip-level (no day).
func (s SetBudgetLine) validate() error {
	if err := validateCategory(s.Category); err != nil {
		return err
	}
	if _, ok := validScopes[s.Scope]; !ok {
		return fmt.Errorf("budget: invalid scope %q", s.Scope)
	}
	if s.Scope == ScopeDay && s.DayID == "" {
		return errors.New("budget: a day extra requires a day")
	}
	if s.Scope != ScopeDay && s.DayID != "" {
		return errors.New("budget: a trip lump or daily allowance must not have a day")
	}
	if s.PlannedAmount < 0 {
		return errors.New("budget: planned_amount must be non-negative")
	}
	return nil
}
