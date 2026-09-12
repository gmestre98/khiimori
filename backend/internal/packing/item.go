package packing

import (
	"errors"
	"strings"
	"time"
)

// Field limits keep a single item bounded so the list stays cheap to store and
// render. They are generous for real packing items but reject pathological input.
const (
	maxLabelLen    = 200
	maxCategoryLen = 80
	maxNoteLen     = 500
	maxQuantity    = 9999
)

// Item is a single packing-list entry in packing.items.
type Item struct {
	ID        string
	TripID    string
	Category  string
	Label     string
	Quantity  int
	Note      string
	Packed    bool
	Position  int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ErrItemNotFound is returned when an update/delete targets an item that does
// not exist or does not belong to the trip.
var ErrItemNotFound = errors.New("packing: item not found")

// CreateItem is the validated input for adding an item to a trip's list.
type CreateItem struct {
	TripID   string
	Category string
	Label    string
	Quantity int
	Note     string
}

// normalize trims surrounding whitespace and defaults quantity to 1 (a single
// item) when the caller omits it (zero value).
func (c *CreateItem) normalize() {
	c.Category = strings.TrimSpace(c.Category)
	c.Label = strings.TrimSpace(c.Label)
	c.Note = strings.TrimSpace(c.Note)
	if c.Quantity == 0 {
		c.Quantity = 1
	}
}

func (c CreateItem) validate() error {
	if c.TripID == "" {
		return errors.New("packing: trip_id is required")
	}
	return validateFields(c.Label, c.Category, c.Note, c.Quantity)
}

// UpdateItem is a partial update: every field is a pointer, so nil means "leave
// unchanged". This lets the UI toggle `packed` without resending label/quantity,
// and rename an item without touching its packed state.
type UpdateItem struct {
	Category *string
	Label    *string
	Quantity *int
	Note     *string
	Packed   *bool
}

// normalize trims the string fields that are present.
func (u *UpdateItem) normalize() {
	if u.Category != nil {
		*u.Category = strings.TrimSpace(*u.Category)
	}
	if u.Label != nil {
		*u.Label = strings.TrimSpace(*u.Label)
	}
	if u.Note != nil {
		*u.Note = strings.TrimSpace(*u.Note)
	}
}

func (u UpdateItem) validate() error {
	if u.Category == nil && u.Label == nil && u.Quantity == nil && u.Note == nil && u.Packed == nil {
		return errors.New("packing: no fields to update")
	}
	// Validate only the fields that are present; a nil field keeps its stored value.
	label, category, note := "", "", ""
	quantity := 1
	if u.Label != nil {
		label = *u.Label
	} else {
		label = "x" // placeholder so the empty-label check below only fires when Label is being set
	}
	if u.Category != nil {
		category = *u.Category
	}
	if u.Note != nil {
		note = *u.Note
	}
	if u.Quantity != nil {
		quantity = *u.Quantity
	}
	return validateFields(label, category, note, quantity)
}

// validateFields applies the shared per-field rules used by both create and
// update. label is required and length-bounded; category/note are length-bounded;
// quantity must be within [1, maxQuantity].
func validateFields(label, category, note string, quantity int) error {
	if strings.TrimSpace(label) == "" {
		return errors.New("packing: label is required")
	}
	if len(label) > maxLabelLen {
		return errors.New("packing: label is too long")
	}
	if len(category) > maxCategoryLen {
		return errors.New("packing: category is too long")
	}
	if len(note) > maxNoteLen {
		return errors.New("packing: note is too long")
	}
	if quantity < 1 {
		return errors.New("packing: quantity must be at least 1")
	}
	if quantity > maxQuantity {
		return errors.New("packing: quantity is too large")
	}
	return nil
}
