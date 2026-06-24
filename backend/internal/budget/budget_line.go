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

// BudgetLine is one row from budget.budget_lines: a planned amount per category
// at trip level (DayID == "") or per day (DayID != "").
type BudgetLine struct {
	ID            string
	TripID        string
	DayID         string // empty string == trip-level (day_id IS NULL)
	Category      Category
	PlannedAmount float64
	ActualAmount  float64 // maintained by Epic M05.2; read-only here
}

// SetBudgetLine is the validated input to upsert a budget line.
type SetBudgetLine struct {
	TripID        string
	DayID         string // empty == trip-level
	Category      Category
	PlannedAmount float64
}

// validate returns a client-safe error when any field is invalid.
func (s SetBudgetLine) validate() error {
	if err := validateCategory(s.Category); err != nil {
		return err
	}
	if s.PlannedAmount < 0 {
		return errors.New("budget: planned_amount must be non-negative")
	}
	return nil
}
