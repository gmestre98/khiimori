package budget

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// errPackageInvalid wraps a validation failure found only after merging a
// partial update with the stored row (e.g. a new paid_amount above the stored
// total). Handlers map it to a 400.
type errPackageInvalid struct{ msg string }

func (e errPackageInvalid) Error() string { return e.msg }

const packageColumns = `id::text, trip_id::text, name, provider, link, category, total_cost::float8, paid_amount::float8,
	COALESCE(to_char(balance_due, 'YYYY-MM-DD'), ''), to_char(start_date, 'YYYY-MM-DD'),
	to_char(end_date, 'YYYY-MM-DD'), includes, created_at, updated_at`

func scanPackage(row pgx.Row) (Package, error) {
	var p Package
	err := row.Scan(&p.ID, &p.TripID, &p.Name, &p.Provider, &p.Link, &p.Category, &p.TotalCost, &p.PaidAmount,
		&p.BalanceDue, &p.StartDate, &p.EndDate, &p.Includes, &p.CreatedAt, &p.UpdatedAt)
	if p.Includes == nil {
		p.Includes = []string{}
	}
	return p, err
}

// ListPackages returns a trip's packages (by start date) with their links.
func (s *pgxBudgetStore) ListPackages(ctx context.Context, tripID string) ([]Package, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+packageColumns+`
		FROM budget.packages WHERE trip_id = $1::uuid ORDER BY start_date, created_at`, tripID)
	if err != nil {
		return nil, fmt.Errorf("budget: list packages: %w", err)
	}
	var out []Package
	index := map[string]int{}
	for rows.Next() {
		p, err := scanPackage(rows)
		if err != nil {
			rows.Close()
			return nil, fmt.Errorf("budget: scan package: %w", err)
		}
		p.StayIDs, p.PlanItemIDs = []string{}, []string{}
		index[p.ID] = len(out)
		out = append(out, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("budget: list packages rows: %w", err)
	}
	if len(out) == 0 {
		return out, nil
	}

	links, err := s.pool.Query(ctx, `
		SELECT l.package_id::text, l.item_kind, l.item_id::text
		FROM budget.package_links l JOIN budget.packages p ON p.id = l.package_id
		WHERE p.trip_id = $1::uuid ORDER BY l.item_kind, l.item_id`, tripID)
	if err != nil {
		return nil, fmt.Errorf("budget: list package links: %w", err)
	}
	defer links.Close()
	for links.Next() {
		var pid, kind, id string
		if err := links.Scan(&pid, &kind, &id); err != nil {
			return nil, fmt.Errorf("budget: scan package link: %w", err)
		}
		i, ok := index[pid]
		if !ok {
			continue
		}
		if kind == "stay" {
			out[i].StayIDs = append(out[i].StayIDs, id)
		} else {
			out[i].PlanItemIDs = append(out[i].PlanItemIDs, id)
		}
	}
	return out, links.Err()
}

// getPackage reads one package with its links (inside tx when given).
func getPackage(ctx context.Context, q pgx.Tx, tripID, id string) (Package, error) {
	p, err := scanPackage(q.QueryRow(ctx, `SELECT `+packageColumns+`
		FROM budget.packages WHERE id = $1::uuid AND trip_id = $2::uuid`, id, tripID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Package{}, ErrPackageNotFound
	}
	if err != nil {
		return Package{}, fmt.Errorf("budget: get package: %w", err)
	}
	p.StayIDs, p.PlanItemIDs = []string{}, []string{}
	rows, err := q.Query(ctx, `SELECT item_kind, item_id::text FROM budget.package_links
		WHERE package_id = $1::uuid ORDER BY item_kind, item_id`, id)
	if err != nil {
		return Package{}, fmt.Errorf("budget: get package links: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var kind, item string
		if err := rows.Scan(&kind, &item); err != nil {
			return Package{}, fmt.Errorf("budget: scan package link: %w", err)
		}
		if kind == "stay" {
			p.StayIDs = append(p.StayIDs, item)
		} else {
			p.PlanItemIDs = append(p.PlanItemIDs, item)
		}
	}
	return p, rows.Err()
}

// replaceLinks swaps the package's links of one kind for ids.
func replaceLinks(ctx context.Context, tx pgx.Tx, packageID, kind string, ids []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM budget.package_links WHERE package_id = $1::uuid AND item_kind = $2`,
		packageID, kind); err != nil {
		return fmt.Errorf("budget: clear package links: %w", err)
	}
	if len(ids) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `INSERT INTO budget.package_links (package_id, item_kind, item_id)
		SELECT $1::uuid, $2, unnest($3::uuid[]) ON CONFLICT DO NOTHING`, packageID, kind, ids); err != nil {
		return fmt.Errorf("budget: insert package links: %w", err)
	}
	return nil
}

// CreatePackage inserts a package and its links in one transaction. in must
// have passed validateCreate.
func (s *pgxBudgetStore) CreatePackage(ctx context.Context, tripID string, in PackageInput) (Package, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Package{}, fmt.Errorf("budget: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	paid := 0.0
	if in.PaidAmount != nil {
		paid = *in.PaidAmount
	}
	includes := []string{}
	if in.Includes != nil {
		includes = *in.Includes
	}
	category := string(CategoryOther)
	if in.Category != nil && *in.Category != "" {
		category = *in.Category
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO budget.packages
		(trip_id, name, provider, link, category, total_cost, paid_amount, balance_due, start_date, end_date, includes)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::date, $9::date, $10::date, $11)
		RETURNING id::text`,
		tripID, str(in.Name), str(in.Provider), str(in.Link), category, *in.TotalCost, paid,
		str(in.BalanceDue), str(in.StartDate), str(in.EndDate), includes).Scan(&id)
	if err != nil {
		return Package{}, fmt.Errorf("budget: insert package: %w", err)
	}
	if in.StayIDs != nil {
		if err := replaceLinks(ctx, tx, id, "stay", *in.StayIDs); err != nil {
			return Package{}, err
		}
	}
	if in.PlanItemIDs != nil {
		if err := replaceLinks(ctx, tx, id, "plan_item", *in.PlanItemIDs); err != nil {
			return Package{}, err
		}
	}
	p, err := getPackage(ctx, tx, tripID, id)
	if err != nil {
		return Package{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Package{}, fmt.Errorf("budget: commit package: %w", err)
	}
	return p, nil
}

// UpdatePackage merges a partial update into the stored package (locking the
// row), re-checks the cross-field rules on the merged result, then writes it.
func (s *pgxBudgetStore) UpdatePackage(ctx context.Context, tripID, id string, in PackageInput) (Package, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Package{}, fmt.Errorf("budget: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT 1 FROM budget.packages WHERE id = $1::uuid AND trip_id = $2::uuid FOR UPDATE`,
		id, tripID); err != nil {
		return Package{}, fmt.Errorf("budget: lock package: %w", err)
	}
	cur, err := getPackage(ctx, tx, tripID, id)
	if err != nil {
		return Package{}, err
	}

	merged := cur
	if in.Name != nil {
		merged.Name = *in.Name
	}
	if in.Provider != nil {
		merged.Provider = *in.Provider
	}
	if in.Link != nil {
		merged.Link = *in.Link
	}
	if in.Category != nil {
		merged.Category = Category(*in.Category)
	}
	if in.TotalCost != nil {
		merged.TotalCost = *in.TotalCost
	}
	if in.PaidAmount != nil {
		merged.PaidAmount = *in.PaidAmount
	}
	if in.ClearBalanceDue {
		merged.BalanceDue = ""
	} else if in.BalanceDue != nil {
		merged.BalanceDue = *in.BalanceDue
	}
	if in.StartDate != nil {
		merged.StartDate = *in.StartDate
	}
	if in.EndDate != nil {
		merged.EndDate = *in.EndDate
	}
	if in.Includes != nil {
		merged.Includes = *in.Includes
	}
	if merged.PaidAmount > merged.TotalCost {
		return Package{}, errPackageInvalid{"paid_amount can't be more than total_cost"}
	}
	if merged.StartDate > merged.EndDate {
		return Package{}, errPackageInvalid{"start_date must be on or before end_date"}
	}

	if _, err := tx.Exec(ctx, `UPDATE budget.packages SET
		name = $3, provider = $4, link = $5, total_cost = $6, paid_amount = $7,
		balance_due = NULLIF($8, '')::date, start_date = $9::date, end_date = $10::date,
		includes = $11, category = $12, updated_at = now()
		WHERE id = $1::uuid AND trip_id = $2::uuid`,
		id, tripID, merged.Name, merged.Provider, merged.Link, merged.TotalCost, merged.PaidAmount,
		merged.BalanceDue, merged.StartDate, merged.EndDate, merged.Includes, string(merged.Category)); err != nil {
		return Package{}, fmt.Errorf("budget: update package: %w", err)
	}
	if in.StayIDs != nil {
		if err := replaceLinks(ctx, tx, id, "stay", *in.StayIDs); err != nil {
			return Package{}, err
		}
	}
	if in.PlanItemIDs != nil {
		if err := replaceLinks(ctx, tx, id, "plan_item", *in.PlanItemIDs); err != nil {
			return Package{}, err
		}
	}
	out, err := getPackage(ctx, tx, tripID, id)
	if err != nil {
		return Package{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Package{}, fmt.Errorf("budget: commit package: %w", err)
	}
	return out, nil
}

// DeletePackage removes a package; its links go with it (ON DELETE CASCADE).
func (s *pgxBudgetStore) DeletePackage(ctx context.Context, tripID, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM budget.packages WHERE id = $1::uuid AND trip_id = $2::uuid`, id, tripID)
	if err != nil {
		return fmt.Errorf("budget: delete package: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrPackageNotFound
	}
	return nil
}
