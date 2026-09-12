package packing

import (
	"errors"
	"strings"
	"time"
)

const maxTemplateNameLen = 120

// Template is a saved, reusable packing list owned by a user (packing.templates).
// ItemCount is a convenience for the list view (how many items the template holds).
type Template struct {
	ID        string
	OwnerID   string
	Name      string
	ItemCount int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// TemplateItem is one entry of a template (packing.template_items). It mirrors an
// Item minus the trip-scoped packed state — a freshly copied item starts unpacked.
type TemplateItem struct {
	ID       string
	Category string
	Label    string
	Quantity int
	Note     string
	Position int
}

// TemplateDetail is a template together with its items (the GET-one payload).
type TemplateDetail struct {
	Template
	Items []TemplateItem
}

// ErrTemplateNotFound is returned when a template does not exist or is not owned
// by the requesting user.
var ErrTemplateNotFound = errors.New("packing: template not found")

// CreateTemplate is the validated input for saving a template. FromTripID, when
// set, snapshots that trip's current items into the new template; the caller is
// responsible for checking the user may read that trip first. When FromTripID is
// empty the template is created with no items.
type CreateTemplate struct {
	OwnerID    string
	Name       string
	FromTripID string
}

func (c *CreateTemplate) normalize() {
	c.Name = strings.TrimSpace(c.Name)
	c.FromTripID = strings.TrimSpace(c.FromTripID)
}

func (c CreateTemplate) validate() error {
	if c.OwnerID == "" {
		return errors.New("packing: owner_id is required")
	}
	if c.Name == "" {
		return errors.New("packing: template name is required")
	}
	if len(c.Name) > maxTemplateNameLen {
		return errors.New("packing: template name is too long")
	}
	return nil
}
