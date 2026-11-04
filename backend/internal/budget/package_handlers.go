package budget

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// packageRequest is the wire shape for creating (all fields) or partially
// updating a package. balance_due is kept raw so an explicit null (clear it)
// differs from an absent key (leave it).
type packageRequest struct {
	Name        *string         `json:"name"`
	Provider    *string         `json:"provider"`
	Link        *string         `json:"link"`
	TotalCost   *float64        `json:"total_cost"`
	PaidAmount  *float64        `json:"paid_amount"`
	BalanceDue  json.RawMessage `json:"balance_due"`
	StartDate   *string         `json:"start_date"`
	EndDate     *string         `json:"end_date"`
	Includes    *[]string       `json:"includes"`
	StayIDs     *[]string       `json:"stay_ids"`
	PlanItemIDs *[]string       `json:"plan_item_ids"`
}

func (r packageRequest) toInput() (PackageInput, error) {
	in := PackageInput{
		Name: r.Name, Provider: r.Provider, Link: r.Link, TotalCost: r.TotalCost,
		PaidAmount: r.PaidAmount, StartDate: r.StartDate, EndDate: r.EndDate,
		Includes: r.Includes, StayIDs: r.StayIDs, PlanItemIDs: r.PlanItemIDs,
	}
	if len(r.BalanceDue) > 0 {
		if bytes.Equal(bytes.TrimSpace(r.BalanceDue), []byte("null")) {
			in.ClearBalanceDue = true
		} else {
			var d string
			if err := json.Unmarshal(r.BalanceDue, &d); err != nil {
				return PackageInput{}, errors.New("balance_due must be a date string or null")
			}
			in.BalanceDue = &d
		}
	}
	return in, nil
}

// packageResponse is the wire shape of a package.
type packageResponse struct {
	ID          string   `json:"id"`
	TripID      string   `json:"trip_id"`
	Name        string   `json:"name"`
	Provider    string   `json:"provider"`
	Link        string   `json:"link"`
	TotalCost   float64  `json:"total_cost"`
	PaidAmount  float64  `json:"paid_amount"`
	BalanceDue  *string  `json:"balance_due"`
	StartDate   string   `json:"start_date"`
	EndDate     string   `json:"end_date"`
	Includes    []string `json:"includes"`
	StayIDs     []string `json:"stay_ids"`
	PlanItemIDs []string `json:"plan_item_ids"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

func packageToResponse(p Package) packageResponse {
	var due *string
	if p.BalanceDue != "" {
		d := p.BalanceDue
		due = &d
	}
	nonNil := func(s []string) []string {
		if s == nil {
			return []string{}
		}
		return s
	}
	return packageResponse{
		ID: p.ID, TripID: p.TripID, Name: p.Name, Provider: p.Provider, Link: p.Link,
		TotalCost: p.TotalCost, PaidAmount: p.PaidAmount, BalanceDue: due,
		StartDate: p.StartDate, EndDate: p.EndDate, Includes: nonNil(p.Includes),
		StayIDs: nonNil(p.StayIDs), PlanItemIDs: nonNil(p.PlanItemIDs),
		CreatedAt: p.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt: p.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

func packageInternalError(w http.ResponseWriter, r *http.Request, msg string, err error) {
	platformlog.FromContext(r.Context()).Error(msg, "err", err.Error())
	httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
}

func badPackage(w http.ResponseWriter, r *http.Request, msg string) {
	httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", msg))
}

// handleListPackages handles GET /trips/{tripID}/packages.
func (m *Module) handleListPackages(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkReadAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	pkgs, err := m.store.ListPackages(r.Context(), tripID)
	if err != nil {
		packageInternalError(w, r, "budget: list packages", err)
		return
	}
	out := make([]packageResponse, len(pkgs))
	for i, pk := range pkgs {
		out[i] = packageToResponse(pk)
	}
	writeJSON(w, http.StatusOK, out)
}

// decodePackage reads, normalises and converts the request body.
func decodePackage(w http.ResponseWriter, r *http.Request) (PackageInput, bool) {
	var req packageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return PackageInput{}, false
	}
	in, err := req.toInput()
	if err != nil {
		badPackage(w, r, err.Error())
		return PackageInput{}, false
	}
	in.normalize()
	return in, true
}

// handleCreatePackage handles POST /trips/{tripID}/packages.
func (m *Module) handleCreatePackage(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	in, ok := decodePackage(w, r)
	if !ok {
		return
	}
	if err := in.validateCreate(); err != nil {
		badPackage(w, r, err.Error())
		return
	}
	pk, err := m.store.CreatePackage(r.Context(), tripID, in)
	if err != nil {
		packageInternalError(w, r, "budget: create package", err)
		return
	}
	writeJSON(w, http.StatusCreated, packageToResponse(pk))
}

// handleUpdatePackage handles PATCH /trips/{tripID}/packages/{packageID}.
func (m *Module) handleUpdatePackage(w http.ResponseWriter, r *http.Request) {
	tripID, id := r.PathValue("tripID"), r.PathValue("packageID")
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if !uuidRe.MatchString(id) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "package_not_found", "package not found"))
		return
	}
	in, ok := decodePackage(w, r)
	if !ok {
		return
	}
	if err := in.validateFields(); err != nil {
		badPackage(w, r, err.Error())
		return
	}
	pk, err := m.store.UpdatePackage(r.Context(), tripID, id, in)
	var invalid errPackageInvalid
	switch {
	case errors.Is(err, ErrPackageNotFound):
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "package_not_found", "package not found"))
		return
	case errors.As(err, &invalid):
		badPackage(w, r, invalid.Error())
		return
	case err != nil:
		packageInternalError(w, r, "budget: update package", err)
		return
	}
	writeJSON(w, http.StatusOK, packageToResponse(pk))
}

// handleDeletePackage handles DELETE /trips/{tripID}/packages/{packageID}.
func (m *Module) handleDeletePackage(w http.ResponseWriter, r *http.Request) {
	tripID, id := r.PathValue("tripID"), r.PathValue("packageID")
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if !uuidRe.MatchString(id) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "package_not_found", "package not found"))
		return
	}
	err := m.store.DeletePackage(r.Context(), tripID, id)
	if errors.Is(err, ErrPackageNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "package_not_found", "package not found"))
		return
	}
	if err != nil {
		packageInternalError(w, r, "budget: delete package", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
