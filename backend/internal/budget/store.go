package budget

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// budgetStore is the persistence surface for budget lines and cost entries.
// The concrete pgxBudgetStore implements it; unit tests supply a fake.
type budgetStore interface {
	Upsert(ctx context.Context, line SetBudgetLine) (BudgetLine, error)
	ListBudgetLines(ctx context.Context, tripID string) ([]BudgetLine, error)
	CreateCostEntry(ctx context.Context, e CreateCostEntry) (CostEntry, error)
	UpdateCostEntry(ctx context.Context, e UpdateCostEntry) (CostEntry, error)
	DeleteCostEntry(ctx context.Context, entryID, tripID string) error
	ListCostEntries(ctx context.Context, tripID string) ([]CostEntry, error)
}

// pgxBudgetStore is the Postgres-backed budget store.
type pgxBudgetStore struct {
	pool *pgxpool.Pool
}

// Upsert inserts or updates the planned_amount for (trip_id, day_id, category).
// An empty DayID is stored as NULL (trip-level line); NULLS NOT DISTINCT on the
// unique constraint means the ON CONFLICT path fires for trip-level rows too.
func (s *pgxBudgetStore) Upsert(ctx context.Context, line SetBudgetLine) (BudgetLine, error) {
	// NULLIF converts the empty-string DayID sentinel to NULL so NULL goes into
	// day_id for trip-level lines.
	const q = `
		INSERT INTO budget.budget_lines (trip_id, day_id, category, scope, planned_amount)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5)
		ON CONFLICT ON CONSTRAINT budget_lines_trip_day_category_scope_unique
		DO UPDATE SET planned_amount = EXCLUDED.planned_amount
		RETURNING id::text, trip_id::text, COALESCE(day_id::text, ''), category,
		          scope, planned_amount, actual_amount`

	var bl BudgetLine
	err := s.pool.QueryRow(ctx, q,
		line.TripID, line.DayID, string(line.Category), string(line.Scope), line.PlannedAmount,
	).Scan(&bl.ID, &bl.TripID, &bl.DayID, &bl.Category, &bl.Scope, &bl.PlannedAmount, &bl.ActualAmount)
	if err != nil {
		return BudgetLine{}, fmt.Errorf("budget: upsert: %w", err)
	}
	return bl, nil
}

// CreateCostEntry inserts a new cost entry row.
func (s *pgxBudgetStore) CreateCostEntry(ctx context.Context, e CreateCostEntry) (CostEntry, error) {
	const q = `
		INSERT INTO budget.cost_entries (trip_id, day_id, plan_item_id, category, amount, note)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, $4, $5, $6)
		RETURNING id::text, trip_id::text,
		          COALESCE(day_id::text, ''), COALESCE(plan_item_id::text, ''),
		          category, amount, note, created_at`

	var out CostEntry
	err := s.pool.QueryRow(ctx, q,
		e.TripID, e.DayID, e.PlanItemID, string(e.Category), e.Amount, e.Note,
	).Scan(&out.ID, &out.TripID, &out.DayID, &out.PlanItemID,
		&out.Category, &out.Amount, &out.Note, &out.CreatedAt)
	if err != nil {
		return CostEntry{}, fmt.Errorf("budget: create cost entry: %w", err)
	}
	return out, nil
}

// UpdateCostEntry edits the mutable fields of an existing cost entry.
// Returns ErrCostEntryNotFound when no row matches (id, trip_id).
func (s *pgxBudgetStore) UpdateCostEntry(ctx context.Context, e UpdateCostEntry) (CostEntry, error) {
	const q = `
		UPDATE budget.cost_entries
		SET category = $3, amount = $4, note = $5
		WHERE id = $1::uuid AND trip_id = $2::uuid
		RETURNING id::text, trip_id::text,
		          COALESCE(day_id::text, ''), COALESCE(plan_item_id::text, ''),
		          category, amount, note, created_at`

	var out CostEntry
	err := s.pool.QueryRow(ctx, q,
		e.ID, e.TripID, string(e.Category), e.Amount, e.Note,
	).Scan(&out.ID, &out.TripID, &out.DayID, &out.PlanItemID,
		&out.Category, &out.Amount, &out.Note, &out.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return CostEntry{}, ErrCostEntryNotFound
	}
	if err != nil {
		return CostEntry{}, fmt.Errorf("budget: update cost entry: %w", err)
	}
	return out, nil
}

// DeleteCostEntry removes a cost entry by id scoped to tripID.
// Returns ErrCostEntryNotFound when no matching row exists.
func (s *pgxBudgetStore) DeleteCostEntry(ctx context.Context, entryID, tripID string) error {
	const q = `DELETE FROM budget.cost_entries WHERE id = $1::uuid AND trip_id = $2::uuid`
	tag, err := s.pool.Exec(ctx, q, entryID, tripID)
	if err != nil {
		return fmt.Errorf("budget: delete cost entry: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrCostEntryNotFound
	}
	return nil
}

// ListBudgetLines returns all budget lines for tripID (both trip-level and per-day).
func (s *pgxBudgetStore) ListBudgetLines(ctx context.Context, tripID string) ([]BudgetLine, error) {
	const q = `
		SELECT id::text, trip_id::text, COALESCE(day_id::text, ''), category,
		       scope, planned_amount, actual_amount
		FROM budget.budget_lines
		WHERE trip_id = $1::uuid
		ORDER BY COALESCE(day_id::text, ''), category, scope`

	rows, err := s.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("budget: list budget lines: %w", err)
	}
	defer rows.Close()

	var out []BudgetLine
	for rows.Next() {
		var bl BudgetLine
		if err := rows.Scan(&bl.ID, &bl.TripID, &bl.DayID, &bl.Category,
			&bl.Scope, &bl.PlannedAmount, &bl.ActualAmount); err != nil {
			return nil, fmt.Errorf("budget: scan budget line: %w", err)
		}
		out = append(out, bl)
	}
	return out, rows.Err()
}

// ListCostEntries returns all cost entries for tripID ordered by created_at.
func (s *pgxBudgetStore) ListCostEntries(ctx context.Context, tripID string) ([]CostEntry, error) {
	const q = `
		SELECT id::text, trip_id::text,
		       COALESCE(day_id::text, ''), COALESCE(plan_item_id::text, ''),
		       category, amount, note, created_at
		FROM budget.cost_entries
		WHERE trip_id = $1::uuid
		ORDER BY created_at`

	rows, err := s.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("budget: list cost entries: %w", err)
	}
	defer rows.Close()

	var out []CostEntry
	for rows.Next() {
		var e CostEntry
		if err := rows.Scan(&e.ID, &e.TripID, &e.DayID, &e.PlanItemID,
			&e.Category, &e.Amount, &e.Note, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("budget: scan cost entry: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
