package packing

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// packingStore is the persistence surface for packing items and templates.
// The concrete pgxPackingStore implements it; unit tests supply a fake.
type packingStore interface {
	// Items — trip-scoped.
	ListItems(ctx context.Context, tripID string) ([]Item, error)
	CreateItem(ctx context.Context, in CreateItem) (Item, error)
	UpdateItem(ctx context.Context, tripID, itemID string, in UpdateItem) (Item, error)
	DeleteItem(ctx context.Context, tripID, itemID string) error

	// Templates — user-scoped.
	ListTemplates(ctx context.Context, ownerID string) ([]Template, error)
	CreateTemplate(ctx context.Context, in CreateTemplate) (Template, error)
	GetTemplate(ctx context.Context, ownerID, templateID string) (TemplateDetail, error)
	DeleteTemplate(ctx context.Context, ownerID, templateID string) error
	// ApplyTemplate copies the owner's template items into the trip's list,
	// appended after any existing items, and returns the newly created items.
	ApplyTemplate(ctx context.Context, tripID, ownerID, templateID string) ([]Item, error)
}

// pgxPackingStore is the Postgres-backed packing store.
type pgxPackingStore struct {
	pool *pgxpool.Pool
}

// itemColumns is the shared RETURNING/SELECT projection for a packing item.
const itemColumns = `id::text, trip_id::text, category, label, quantity, note, packed, position, created_at, updated_at`

func scanItem(row pgx.Row) (Item, error) {
	var it Item
	err := row.Scan(&it.ID, &it.TripID, &it.Category, &it.Label, &it.Quantity,
		&it.Note, &it.Packed, &it.Position, &it.CreatedAt, &it.UpdatedAt)
	return it, err
}

// ListItems returns all packing items for a trip, ordered by position then
// creation so the list is stable across reloads.
func (s *pgxPackingStore) ListItems(ctx context.Context, tripID string) ([]Item, error) {
	q := `SELECT ` + itemColumns + `
		FROM packing.items
		WHERE trip_id = $1::uuid
		ORDER BY position ASC, created_at ASC`

	rows, err := s.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("packing: list items: %w", err)
	}
	defer rows.Close()

	var out []Item
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			return nil, fmt.Errorf("packing: scan item: %w", err)
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("packing: list items rows: %w", err)
	}
	return out, nil
}

// CreateItem inserts a new item, appending it to the end of the trip's list
// (position = current max + 1).
func (s *pgxPackingStore) CreateItem(ctx context.Context, in CreateItem) (Item, error) {
	q := `INSERT INTO packing.items (trip_id, category, label, quantity, note, position)
		VALUES ($1::uuid, $2, $3, $4, $5,
		        (SELECT COALESCE(MAX(position), 0) + 1 FROM packing.items WHERE trip_id = $1::uuid))
		RETURNING ` + itemColumns

	it, err := scanItem(s.pool.QueryRow(ctx, q, in.TripID, in.Category, in.Label, in.Quantity, in.Note))
	if err != nil {
		return Item{}, fmt.Errorf("packing: create item: %w", err)
	}
	return it, nil
}

// UpdateItem applies a partial update: each nil field in UpdateItem leaves the
// stored value unchanged (COALESCE against the typed NULL pgx encodes for a nil
// pointer). Scoped by trip_id so an item from another trip yields ErrItemNotFound.
func (s *pgxPackingStore) UpdateItem(ctx context.Context, tripID, itemID string, in UpdateItem) (Item, error) {
	q := `UPDATE packing.items
		SET category   = COALESCE($3, category),
		    label      = COALESCE($4, label),
		    quantity   = COALESCE($5, quantity),
		    note       = COALESCE($6, note),
		    packed     = COALESCE($7, packed),
		    updated_at = now()
		WHERE id = $1::uuid AND trip_id = $2::uuid
		RETURNING ` + itemColumns

	it, err := scanItem(s.pool.QueryRow(ctx, q, itemID, tripID,
		in.Category, in.Label, in.Quantity, in.Note, in.Packed))
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, ErrItemNotFound
	}
	if err != nil {
		return Item{}, fmt.Errorf("packing: update item: %w", err)
	}
	return it, nil
}

// DeleteItem removes an item, scoped by trip_id. Returns ErrItemNotFound when no
// row matched (unknown id, or an item belonging to a different trip).
func (s *pgxPackingStore) DeleteItem(ctx context.Context, tripID, itemID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM packing.items WHERE id = $1::uuid AND trip_id = $2::uuid`, itemID, tripID)
	if err != nil {
		return fmt.Errorf("packing: delete item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrItemNotFound
	}
	return nil
}

// ListTemplates returns the user's templates with each one's item count,
// most-recently-updated first.
func (s *pgxPackingStore) ListTemplates(ctx context.Context, ownerID string) ([]Template, error) {
	const q = `
		SELECT t.id::text, t.owner_id::text, t.name,
		       (SELECT COUNT(*) FROM packing.template_items ti WHERE ti.template_id = t.id),
		       t.created_at, t.updated_at
		FROM packing.templates t
		WHERE t.owner_id = $1::uuid
		ORDER BY t.updated_at DESC`

	rows, err := s.pool.Query(ctx, q, ownerID)
	if err != nil {
		return nil, fmt.Errorf("packing: list templates: %w", err)
	}
	defer rows.Close()

	var out []Template
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.OwnerID, &t.Name, &t.ItemCount, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("packing: scan template: %w", err)
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("packing: list templates rows: %w", err)
	}
	return out, nil
}

// CreateTemplate inserts a template and, when in.FromTripID is set, snapshots that
// trip's current items into the template — all in one transaction so a partial
// copy never persists.
func (s *pgxPackingStore) CreateTemplate(ctx context.Context, in CreateTemplate) (Template, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Template{}, fmt.Errorf("packing: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var t Template
	err = tx.QueryRow(ctx,
		`INSERT INTO packing.templates (owner_id, name) VALUES ($1::uuid, $2)
		 RETURNING id::text, owner_id::text, name, created_at, updated_at`,
		in.OwnerID, in.Name,
	).Scan(&t.ID, &t.OwnerID, &t.Name, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return Template{}, fmt.Errorf("packing: insert template: %w", err)
	}

	if in.FromTripID != "" {
		tag, err := tx.Exec(ctx,
			`INSERT INTO packing.template_items (template_id, category, label, quantity, note, position)
			 SELECT $1::uuid, category, label, quantity, note, position
			 FROM packing.items
			 WHERE trip_id = $2::uuid`,
			t.ID, in.FromTripID)
		if err != nil {
			return Template{}, fmt.Errorf("packing: snapshot trip items: %w", err)
		}
		t.ItemCount = int(tag.RowsAffected())
	}

	if err := tx.Commit(ctx); err != nil {
		return Template{}, fmt.Errorf("packing: commit template: %w", err)
	}
	return t, nil
}

// GetTemplate returns a template and its items, owner-scoped. Returns
// ErrTemplateNotFound when the template does not exist or belongs to another user.
func (s *pgxPackingStore) GetTemplate(ctx context.Context, ownerID, templateID string) (TemplateDetail, error) {
	var d TemplateDetail
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, owner_id::text, name, created_at, updated_at
		 FROM packing.templates
		 WHERE id = $1::uuid AND owner_id = $2::uuid`,
		templateID, ownerID,
	).Scan(&d.ID, &d.OwnerID, &d.Name, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return TemplateDetail{}, ErrTemplateNotFound
	}
	if err != nil {
		return TemplateDetail{}, fmt.Errorf("packing: get template: %w", err)
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id::text, category, label, quantity, note, position
		 FROM packing.template_items
		 WHERE template_id = $1::uuid
		 ORDER BY position ASC, id ASC`,
		templateID)
	if err != nil {
		return TemplateDetail{}, fmt.Errorf("packing: get template items: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var ti TemplateItem
		if err := rows.Scan(&ti.ID, &ti.Category, &ti.Label, &ti.Quantity, &ti.Note, &ti.Position); err != nil {
			return TemplateDetail{}, fmt.Errorf("packing: scan template item: %w", err)
		}
		d.Items = append(d.Items, ti)
	}
	if err := rows.Err(); err != nil {
		return TemplateDetail{}, fmt.Errorf("packing: get template items rows: %w", err)
	}
	d.ItemCount = len(d.Items)
	return d, nil
}

// DeleteTemplate removes a template (its items cascade via FK), owner-scoped.
// Returns ErrTemplateNotFound when nothing matched.
func (s *pgxPackingStore) DeleteTemplate(ctx context.Context, ownerID, templateID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM packing.templates WHERE id = $1::uuid AND owner_id = $2::uuid`, templateID, ownerID)
	if err != nil {
		return fmt.Errorf("packing: delete template: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrTemplateNotFound
	}
	return nil
}

// ApplyTemplate appends the owner's template items to the trip's packing list in
// one transaction, preserving relative order after any items already there, and
// returns the newly created items. Returns ErrTemplateNotFound when the template
// does not exist or belongs to another user.
func (s *pgxPackingStore) ApplyTemplate(ctx context.Context, tripID, ownerID, templateID string) ([]Item, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("packing: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Verify ownership (and existence) before copying anything.
	var exists bool
	err = tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM packing.templates WHERE id = $1::uuid AND owner_id = $2::uuid)`,
		templateID, ownerID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("packing: check template owner: %w", err)
	}
	if !exists {
		return nil, ErrTemplateNotFound
	}

	// Append after the current max position; ROW_NUMBER preserves template order.
	q := `WITH base AS (
		SELECT COALESCE(MAX(position), 0) AS maxpos FROM packing.items WHERE trip_id = $1::uuid
	)
	INSERT INTO packing.items (trip_id, category, label, quantity, note, position)
	SELECT $1::uuid, ti.category, ti.label, ti.quantity, ti.note,
	       base.maxpos + ROW_NUMBER() OVER (ORDER BY ti.position ASC, ti.id ASC)
	FROM packing.template_items ti CROSS JOIN base
	WHERE ti.template_id = $2::uuid
	RETURNING ` + itemColumns

	rows, err := tx.Query(ctx, q, tripID, templateID)
	if err != nil {
		return nil, fmt.Errorf("packing: apply template: %w", err)
	}
	var out []Item
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			rows.Close()
			return nil, fmt.Errorf("packing: scan applied item: %w", err)
		}
		out = append(out, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("packing: apply template rows: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("packing: commit apply template: %w", err)
	}
	return out, nil
}
