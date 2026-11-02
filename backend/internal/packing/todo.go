package packing

import (
	"errors"
	"strings"
	"time"
)

// Field limits for a to-do; generous for real tasks, bounded against abuse.
const (
	maxTodoTitleLen = 200
	maxTodoNoteLen  = 1000
)

// dateLayout is the wire and storage format of a to-do's due date.
const dateLayout = "2006-01-02"

// Todo is a single trip to-do in packing.todos. DueDate is "" when the to-do has
// no deadline, otherwise YYYY-MM-DD.
type Todo struct {
	ID        string
	TripID    string
	Title     string
	Note      string
	DueDate   string
	Done      bool
	Position  int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ErrTodoNotFound is returned when an update/delete targets a to-do that does
// not exist or does not belong to the trip.
var ErrTodoNotFound = errors.New("packing: to-do not found")

// CreateTodo is the validated input for adding a to-do to a trip.
type CreateTodo struct {
	TripID  string
	Title   string
	Note    string
	DueDate string // "" for no deadline
}

func (c *CreateTodo) normalize() {
	c.Title = strings.TrimSpace(c.Title)
	c.Note = strings.TrimSpace(c.Note)
	c.DueDate = strings.TrimSpace(c.DueDate)
}

func (c CreateTodo) validate() error {
	if c.TripID == "" {
		return errors.New("packing: trip_id is required")
	}
	if err := validateTodoTitle(c.Title); err != nil {
		return err
	}
	if len(c.Note) > maxTodoNoteLen {
		return errors.New("packing: note is too long")
	}
	return validateDueDate(c.DueDate)
}

// UpdateTodo is a partial update: nil means "leave unchanged". ClearDueDate
// removes the deadline (a JSON null for due_date); it wins over DueDate.
type UpdateTodo struct {
	Title        *string
	Note         *string
	DueDate      *string
	ClearDueDate bool
	Done         *bool
}

func (u *UpdateTodo) normalize() {
	if u.Title != nil {
		*u.Title = strings.TrimSpace(*u.Title)
	}
	if u.Note != nil {
		*u.Note = strings.TrimSpace(*u.Note)
	}
	if u.DueDate != nil {
		*u.DueDate = strings.TrimSpace(*u.DueDate)
		// An empty string is the same as clearing the deadline.
		if *u.DueDate == "" {
			u.DueDate = nil
			u.ClearDueDate = true
		}
	}
}

func (u UpdateTodo) validate() error {
	if u.Title == nil && u.Note == nil && u.DueDate == nil && !u.ClearDueDate && u.Done == nil {
		return errors.New("packing: no fields to update")
	}
	if u.Title != nil {
		if err := validateTodoTitle(*u.Title); err != nil {
			return err
		}
	}
	if u.Note != nil && len(*u.Note) > maxTodoNoteLen {
		return errors.New("packing: note is too long")
	}
	if u.DueDate != nil {
		return validateDueDate(*u.DueDate)
	}
	return nil
}

func validateTodoTitle(title string) error {
	if strings.TrimSpace(title) == "" {
		return errors.New("packing: title is required")
	}
	if len(title) > maxTodoTitleLen {
		return errors.New("packing: title is too long")
	}
	return nil
}

// validateDueDate accepts "" (no deadline) or a real YYYY-MM-DD calendar date.
func validateDueDate(d string) error {
	if d == "" {
		return nil
	}
	if _, err := time.Parse(dateLayout, d); err != nil {
		return errors.New("packing: due_date must be a date in YYYY-MM-DD format")
	}
	return nil
}
