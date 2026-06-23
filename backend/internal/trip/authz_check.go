package trip

import (
	"context"
	"net/http"

	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
)

// checkAccess asks the Authorizer whether userID may perform action on tripID.
// It returns nil when access is granted. On denial it returns a 404 APIError so
// callers cannot distinguish "trip does not exist" from "trip exists but user
// has no access" — this deliberately avoids leaking trip existence to
// non-members (PRD §5.9, §6). Infrastructure failures (DB errors, context
// cancellations) are logged and returned as 500 APIErrors.
func (m *Module) checkAccess(ctx context.Context, userID string, action Action, tripID string) error {
	ok, err := m.authz.Can(ctx, userID, action, tripID)
	if err != nil {
		platformlog.FromContext(ctx).Error("authz check failed", "err", err.Error())
		return httpx.NewAPIError(http.StatusInternalServerError, "internal_error", "internal error")
	}
	if !ok {
		// Return 404, not 403, to avoid confirming the trip's existence to a
		// caller who has no access (presence oracle attack).
		return httpx.NewAPIError(http.StatusNotFound, "trip_not_found", "trip not found")
	}
	return nil
}
