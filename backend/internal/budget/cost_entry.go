package budget

import (
	"errors"
	"fmt"
	"time"
)

// CostEntry is a manual cost row in budget.cost_entries.
type CostEntry struct {
	ID         string
	TripID     string
	DayID      string // empty == not linked to a day
	PlanItemID string // empty == not linked to a plan item
	Category   Category
	Amount     float64
	Note       string
	CreatedAt  time.Time
}

// CreateCostEntry is the validated input for creating a cost entry.
type CreateCostEntry struct {
	TripID     string
	DayID      string // empty == no day link
	PlanItemID string // empty == no plan-item link
	Category   Category
	Amount     float64
	Note       string
}

func (c CreateCostEntry) validate() error {
	if err := validateCategory(c.Category); err != nil {
		return err
	}
	if c.Amount < 0 {
		return errors.New("budget: amount must be non-negative")
	}
	return nil
}

// UpdateCostEntry is the validated input for editing a cost entry.
type UpdateCostEntry struct {
	ID       string
	TripID   string // for authz scope check
	Category Category
	Amount   float64
	Note     string
}

func (u UpdateCostEntry) validate() error {
	if err := validateCategory(u.Category); err != nil {
		return err
	}
	if u.Amount < 0 {
		return fmt.Errorf("budget: amount must be non-negative")
	}
	return nil
}
