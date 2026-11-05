package budget

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Package is one price that covers several days of a trip (budget.packages),
// with the stays and plan items it covers.
type Package struct {
	ID          string
	TripID      string
	Name        string
	Provider    string
	Link        string
	Category    Category
	TotalCost   float64
	PaidAmount  float64
	BalanceDue  string // YYYY-MM-DD, "" when none
	StartDate   string // YYYY-MM-DD
	EndDate     string // YYYY-MM-DD
	Includes    []string
	StayIDs     []string
	PlanItemIDs []string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// ErrPackageNotFound is returned when a package does not exist on the trip.
var ErrPackageNotFound = errors.New("budget: package not found")

// packageIncludes are the things a package can say it covers.
var packageIncludes = map[string]struct{}{
	"beds": {}, "transport": {}, "meals": {}, "guide": {}, "fees": {}, "activities": {}, "flights": {},
}

const (
	maxPackageNameLen     = 120
	maxPackageProviderLen = 120
	maxPackageLinkLen     = 1000
	maxPackageLinks       = 300
	packageDateLayout     = "2006-01-02"
)

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// PackageInput is a create (every field) or a partial update (nil = unchanged).
// For BalanceDue, ClearBalanceDue removes it. StayIDs / PlanItemIDs, when
// non-nil, replace the package's links of that kind.
type PackageInput struct {
	Name            *string
	Provider        *string
	Link            *string
	Category        *string
	TotalCost       *float64
	PaidAmount      *float64
	BalanceDue      *string
	ClearBalanceDue bool
	StartDate       *string
	EndDate         *string
	Includes        *[]string
	StayIDs         *[]string
	PlanItemIDs     *[]string
}

func (in *PackageInput) normalize() {
	for _, p := range []*string{in.Name, in.Provider, in.Link, in.Category, in.BalanceDue, in.StartDate, in.EndDate} {
		if p != nil {
			*p = strings.TrimSpace(*p)
		}
	}
	if in.BalanceDue != nil && *in.BalanceDue == "" {
		in.BalanceDue = nil
		in.ClearBalanceDue = true
	}
	if in.Includes != nil {
		seen := map[string]bool{}
		out := []string{}
		for _, s := range *in.Includes {
			s = strings.ToLower(strings.TrimSpace(s))
			if s != "" && !seen[s] {
				seen[s] = true
				out = append(out, s)
			}
		}
		in.Includes = &out
	}
}

// validateCreate requires the fields a new package needs.
func (in PackageInput) validateCreate() error {
	if in.Name == nil || *in.Name == "" {
		return errors.New("name is required")
	}
	if in.TotalCost == nil {
		return errors.New("total_cost is required")
	}
	if in.StartDate == nil || in.EndDate == nil {
		return errors.New("start_date and end_date are required")
	}
	return in.validateFields()
}

// validateFields checks every field that is present.
func (in PackageInput) validateFields() error {
	if in.Name != nil {
		if *in.Name == "" {
			return errors.New("name is required")
		}
		if utf8.RuneCountInString(*in.Name) > maxPackageNameLen {
			return fmt.Errorf("name must be at most %d characters", maxPackageNameLen)
		}
	}
	if in.Provider != nil && utf8.RuneCountInString(*in.Provider) > maxPackageProviderLen {
		return fmt.Errorf("provider must be at most %d characters", maxPackageProviderLen)
	}
	if in.Link != nil && *in.Link != "" {
		if len(*in.Link) > maxPackageLinkLen {
			return errors.New("link is too long")
		}
		u, err := url.ParseRequestURI(*in.Link)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return errors.New("link must be an http(s) URL")
		}
	}
	if in.Category != nil {
		if _, ok := validCategories[Category(*in.Category)]; !ok {
			return errors.New("category must be one of Stays, Transport, Food, Activities, Other")
		}
	}
	if in.TotalCost != nil && *in.TotalCost < 0 {
		return errors.New("total_cost must not be negative")
	}
	if in.PaidAmount != nil && *in.PaidAmount < 0 {
		return errors.New("paid_amount must not be negative")
	}
	if in.TotalCost != nil && in.PaidAmount != nil && *in.PaidAmount > *in.TotalCost {
		return errors.New("paid_amount can't be more than total_cost")
	}
	for name, p := range map[string]*string{"start_date": in.StartDate, "end_date": in.EndDate, "balance_due": in.BalanceDue} {
		if p != nil {
			if _, err := time.Parse(packageDateLayout, *p); err != nil {
				return fmt.Errorf("%s must be a date in YYYY-MM-DD format", name)
			}
		}
	}
	if in.StartDate != nil && in.EndDate != nil && *in.StartDate > *in.EndDate {
		return errors.New("start_date must be on or before end_date")
	}
	if in.Includes != nil {
		for _, s := range *in.Includes {
			if _, ok := packageIncludes[s]; !ok {
				return fmt.Errorf("includes: unknown value %q", s)
			}
		}
	}
	for name, ids := range map[string]*[]string{"stay_ids": in.StayIDs, "plan_item_ids": in.PlanItemIDs} {
		if ids == nil {
			continue
		}
		if len(*ids) > maxPackageLinks {
			return fmt.Errorf("%s: at most %d items", name, maxPackageLinks)
		}
		for _, id := range *ids {
			if !uuidRe.MatchString(id) {
				return fmt.Errorf("%s: %q is not a valid id", name, id)
			}
		}
	}
	return nil
}
