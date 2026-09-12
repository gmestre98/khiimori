package packing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// writeJSON writes v as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// principalOr401 extracts the authenticated principal or writes a 401.
func principalOr401(w http.ResponseWriter, r *http.Request) (authn.Principal, bool) {
	p, ok := authn.FromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusUnauthorized, "unauthorized", "unauthorized"))
		return authn.Principal{}, false
	}
	return p, true
}

// checkReadAccess / checkWriteAccess mirror the journal module: a denial is a 404
// (don't reveal a trip the caller can't see); an infra failure is a 500.
func (m *Module) checkReadAccess(ctx context.Context, userID, tripID string) error {
	ok, err := m.authz.CanRead(ctx, userID, tripID)
	if err != nil {
		platformlog.FromContext(ctx).Error("packing: authz check failed", "err", err.Error())
		return httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error")
	}
	if !ok {
		return httpx.NewAPIError(http.StatusNotFound, "trip_not_found", "trip not found")
	}
	return nil
}

func (m *Module) checkWriteAccess(ctx context.Context, userID, tripID string) error {
	ok, err := m.authz.CanWrite(ctx, userID, tripID)
	if err != nil {
		platformlog.FromContext(ctx).Error("packing: authz check failed", "err", err.Error())
		return httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error")
	}
	if !ok {
		return httpx.NewAPIError(http.StatusNotFound, "trip_not_found", "trip not found")
	}
	return nil
}

// --- Items ------------------------------------------------------------------

// itemResponse is the wire shape for a single packing item.
type itemResponse struct {
	ID        string `json:"id"`
	TripID    string `json:"trip_id"`
	Category  string `json:"category"`
	Label     string `json:"label"`
	Quantity  int    `json:"quantity"`
	Note      string `json:"note"`
	Packed    bool   `json:"packed"`
	Position  int    `json:"position"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func itemToResponse(it Item) itemResponse {
	return itemResponse{
		ID:        it.ID,
		TripID:    it.TripID,
		Category:  it.Category,
		Label:     it.Label,
		Quantity:  it.Quantity,
		Note:      it.Note,
		Packed:    it.Packed,
		Position:  it.Position,
		CreatedAt: it.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt: it.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// createItemRequest is the wire shape for adding an item.
type createItemRequest struct {
	Category string `json:"category"`
	Label    string `json:"label"`
	Quantity int    `json:"quantity"`
	Note     string `json:"note"`
}

// updateItemRequest is the wire shape for a partial update. Pointer fields
// distinguish "absent" (leave unchanged) from an explicit value — so toggling
// `packed` alone never clears the label.
type updateItemRequest struct {
	Category *string `json:"category"`
	Label    *string `json:"label"`
	Quantity *int    `json:"quantity"`
	Note     *string `json:"note"`
	Packed   *bool   `json:"packed"`
}

// handleListItems handles GET /trips/{tripID}/packing.
func (m *Module) handleListItems(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkReadAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	items, err := m.store.ListItems(r.Context(), tripID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: list items", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	resp := make([]itemResponse, len(items))
	for i, it := range items {
		resp[i] = itemToResponse(it)
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleCreateItem handles POST /trips/{tripID}/packing.
func (m *Module) handleCreateItem(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req createItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	in := CreateItem{
		TripID:   tripID,
		Category: req.Category,
		Label:    req.Label,
		Quantity: req.Quantity,
		Note:     req.Note,
	}
	in.normalize()
	if err := in.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	it, err := m.store.CreateItem(r.Context(), in)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: create item", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	writeJSON(w, http.StatusCreated, itemToResponse(it))
}

// handleUpdateItem handles PATCH /trips/{tripID}/packing/{itemID}.
func (m *Module) handleUpdateItem(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	itemID := r.PathValue("itemID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req updateItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	// updateItemRequest and UpdateItem share the same field shape (pointers for
	// partial update), so a direct conversion is clearest.
	in := UpdateItem(req)
	in.normalize()
	if err := in.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}

	it, err := m.store.UpdateItem(r.Context(), tripID, itemID, in)
	if errors.Is(err, ErrItemNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "item_not_found", "packing item not found"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: update item", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	writeJSON(w, http.StatusOK, itemToResponse(it))
}

// handleDeleteItem handles DELETE /trips/{tripID}/packing/{itemID}.
func (m *Module) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	itemID := r.PathValue("itemID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	err := m.store.DeleteItem(r.Context(), tripID, itemID)
	if errors.Is(err, ErrItemNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "item_not_found", "packing item not found"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: delete item", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Templates --------------------------------------------------------------

type templateResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ItemCount int    `json:"item_count"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type templateItemResponse struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Label    string `json:"label"`
	Quantity int    `json:"quantity"`
	Note     string `json:"note"`
	Position int    `json:"position"`
}

type templateDetailResponse struct {
	templateResponse
	Items []templateItemResponse `json:"items"`
}

func templateToResponse(t Template) templateResponse {
	return templateResponse{
		ID:        t.ID,
		Name:      t.Name,
		ItemCount: t.ItemCount,
		CreatedAt: t.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt: t.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// createTemplateRequest is the wire shape for saving a template. from_trip_id,
// when present, snapshots that trip's current items into the template.
type createTemplateRequest struct {
	Name       string `json:"name"`
	FromTripID string `json:"from_trip_id"`
}

// applyTemplateRequest is the wire shape for copying a template into a trip.
type applyTemplateRequest struct {
	TemplateID string `json:"template_id"`
}

// handleListTemplates handles GET /packing/templates — the caller's own templates.
func (m *Module) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	templates, err := m.store.ListTemplates(r.Context(), p.UserID)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: list templates", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	resp := make([]templateResponse, len(templates))
	for i, t := range templates {
		resp[i] = templateToResponse(t)
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleCreateTemplate handles POST /packing/templates. When from_trip_id is set,
// the caller must be able to read that trip (its items are snapshotted).
func (m *Module) handleCreateTemplate(w http.ResponseWriter, r *http.Request) {
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}

	var req createTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}

	in := CreateTemplate{OwnerID: p.UserID, Name: req.Name, FromTripID: req.FromTripID}
	in.normalize()
	if err := in.validate(); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", err.Error()))
		return
	}
	// Snapshotting a trip's items requires read access to that trip.
	if in.FromTripID != "" {
		if err := m.checkReadAccess(r.Context(), p.UserID, in.FromTripID); err != nil {
			httpx.WriteError(w, r, err)
			return
		}
	}

	t, err := m.store.CreateTemplate(r.Context(), in)
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: create template", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	writeJSON(w, http.StatusCreated, templateToResponse(t))
}

// handleGetTemplate handles GET /packing/templates/{templateID} — owner-scoped.
func (m *Module) handleGetTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.PathValue("templateID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	d, err := m.store.GetTemplate(r.Context(), p.UserID, templateID)
	if errors.Is(err, ErrTemplateNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "template_not_found", "template not found"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: get template", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	items := make([]templateItemResponse, len(d.Items))
	for i, ti := range d.Items {
		// TemplateItem and templateItemResponse share the same field shape.
		items[i] = templateItemResponse(ti)
	}
	writeJSON(w, http.StatusOK, templateDetailResponse{
		templateResponse: templateToResponse(d.Template),
		Items:            items,
	})
}

// handleDeleteTemplate handles DELETE /packing/templates/{templateID} — owner-scoped.
func (m *Module) handleDeleteTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.PathValue("templateID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	err := m.store.DeleteTemplate(r.Context(), p.UserID, templateID)
	if errors.Is(err, ErrTemplateNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "template_not_found", "template not found"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: delete template", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleApplyTemplate handles POST /trips/{tripID}/packing/apply-template. The
// caller needs write access to the trip and must own the template; the template's
// items are appended to the trip's list. Returns the newly created items.
func (m *Module) handleApplyTemplate(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")
	p, ok := principalOr401(w, r)
	if !ok {
		return
	}
	if err := m.checkWriteAccess(r.Context(), p.UserID, tripID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}

	var req applyTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "invalid_json", "invalid JSON"))
		return
	}
	if req.TemplateID == "" {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusBadRequest, "validation_error", "template_id is required"))
		return
	}

	items, err := m.store.ApplyTemplate(r.Context(), tripID, p.UserID, req.TemplateID)
	if errors.Is(err, ErrTemplateNotFound) {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotFound, "template_not_found", "template not found"))
		return
	}
	if err != nil {
		platformlog.FromContext(r.Context()).Error("packing: apply template", "err", err.Error())
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error"))
		return
	}

	resp := make([]itemResponse, len(items))
	for i, it := range items {
		resp[i] = itemToResponse(it)
	}
	writeJSON(w, http.StatusCreated, resp)
}
