package packing

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// todoColumns is the shared RETURNING/SELECT projection for a to-do. The due
// date is rendered as YYYY-MM-DD text (NULL when there is no deadline).
const todoColumns = `id::text, trip_id::text, title, note, to_char(due_date, 'YYYY-MM-DD'),
	done, position, created_at, updated_at`

func scanTodo(row pgx.Row) (Todo, error) {
	var t Todo
	var due *string
	err := row.Scan(&t.ID, &t.TripID, &t.Title, &t.Note, &due,
		&t.Done, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if due != nil {
		t.DueDate = *due
	}
	return t, err
}

// ListTodos returns a trip's to-dos ordered by deadline (soonest first, no
// deadline last), then by position and creation so the list is stable.
func (s *pgxPackingStore) ListTodos(ctx context.Context, tripID string) ([]Todo, error) {
	q := `SELECT ` + todoColumns + `
		FROM packing.todos
		WHERE trip_id = $1::uuid
		ORDER BY due_date ASC NULLS LAST, position ASC, created_at ASC`

	rows, err := s.pool.Query(ctx, q, tripID)
	if err != nil {
		return nil, fmt.Errorf("packing: list todos: %w", err)
	}
	defer rows.Close()

	var out []Todo
	for rows.Next() {
		t, err := scanTodo(rows)
		if err != nil {
			return nil, fmt.Errorf("packing: scan todo: %w", err)
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("packing: list todos rows: %w", err)
	}
	return out, nil
}

// CreateTodo inserts a to-do at the end of the trip's list.
func (s *pgxPackingStore) CreateTodo(ctx context.Context, in CreateTodo) (Todo, error) {
	q := `INSERT INTO packing.todos (trip_id, title, note, due_date, position)
		VALUES ($1::uuid, $2, $3, NULLIF($4, '')::date,
		        (SELECT COALESCE(MAX(position), 0) + 1 FROM packing.todos WHERE trip_id = $1::uuid))
		RETURNING ` + todoColumns

	t, err := scanTodo(s.pool.QueryRow(ctx, q, in.TripID, in.Title, in.Note, in.DueDate))
	if err != nil {
		return Todo{}, fmt.Errorf("packing: create todo: %w", err)
	}
	return t, nil
}

// UpdateTodo applies a partial update scoped by trip_id. A nil field keeps the
// stored value; ClearDueDate removes the deadline.
func (s *pgxPackingStore) UpdateTodo(ctx context.Context, tripID, todoID string, in UpdateTodo) (Todo, error) {
	q := `UPDATE packing.todos
		SET title      = COALESCE($3, title),
		    note       = COALESCE($4, note),
		    due_date   = CASE WHEN $6::boolean THEN NULL
		                      ELSE COALESCE($5::date, due_date) END,
		    done       = COALESCE($7, done),
		    updated_at = now()
		WHERE id = $1::uuid AND trip_id = $2::uuid
		RETURNING ` + todoColumns

	t, err := scanTodo(s.pool.QueryRow(ctx, q, todoID, tripID,
		in.Title, in.Note, in.DueDate, in.ClearDueDate, in.Done))
	if errors.Is(err, pgx.ErrNoRows) {
		return Todo{}, ErrTodoNotFound
	}
	if err != nil {
		return Todo{}, fmt.Errorf("packing: update todo: %w", err)
	}
	return t, nil
}

// DeleteTodo removes a to-do, scoped by trip_id.
func (s *pgxPackingStore) DeleteTodo(ctx context.Context, tripID, todoID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM packing.todos WHERE id = $1::uuid AND trip_id = $2::uuid`, todoID, tripID)
	if err != nil {
		return fmt.Errorf("packing: delete todo: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrTodoNotFound
	}
	return nil
}
