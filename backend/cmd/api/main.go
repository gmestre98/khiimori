// Command api is the entrypoint for the Khiimori backend.
//
// It boots a single HTTP server for the whole modular monolith: it loads typed
// configuration, builds the structured logger, opens the database pool, binds
// the configured port, and serves until interrupted, draining in-flight requests
// on SIGINT/SIGTERM (important for Cloud Run). The root router is assembled here
// so the domain modules mount through their interfaces and the health probes
// (/healthz, /readyz) share the middleware chain. net/http for serving; pgx for
// the database.
package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gmestre98/khiimori/backend/internal/auth"
	"github.com/gmestre98/khiimori/backend/internal/budget"
	"github.com/gmestre98/khiimori/backend/internal/geo"
	"github.com/gmestre98/khiimori/backend/internal/journal"
	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	"github.com/gmestre98/khiimori/backend/internal/platform/db"
	"github.com/gmestre98/khiimori/backend/internal/platform/health"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	platformlog "github.com/gmestre98/khiimori/backend/internal/platform/log"
	"github.com/gmestre98/khiimori/backend/internal/sharing"
	"github.com/gmestre98/khiimori/backend/internal/trip"
)

// shutdownTimeout bounds how long a graceful shutdown waits for in-flight
// requests to drain before the process exits.
const shutdownTimeout = 15 * time.Second

// startupDBTimeout bounds the eager connectivity check at boot. It is generous
// enough to absorb a Neon cold-start wake-up but still fails fast if the
// database is genuinely unreachable.
const startupDBTimeout = 10 * time.Second

func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}

// run wires config + logger and serves HTTP with graceful shutdown. It returns a
// non-nil error (already logged) when startup or shutdown fails, so main can map
// that to a non-zero exit code.
func run() error {
	cfg, err := config.Load()
	if err != nil {
		// No configured logger yet — report the failure as JSON on stderr.
		platformlog.New(config.Config{LogLevel: config.LevelError}, os.Stderr).
			Error("loading config", "err", err.Error())
		return err
	}

	logger := platformlog.NewStdout(cfg)

	// The service can't do anything useful without its database, so connect
	// eagerly and fail fast: a missing DSN (db.Open) or an unreachable database
	// (the startup Ping) is a hard startup error, surfaced now rather than at
	// request time. The pool is closed on shutdown.
	database, err := db.Open(context.Background(), cfg)
	if err != nil {
		logger.Error("opening database", "err", err.Error())
		return err
	}
	defer database.Close()

	pingCtx, cancelPing := context.WithTimeout(context.Background(), startupDBTimeout)
	pingErr := database.Ping(pingCtx)
	cancelPing()
	if pingErr != nil {
		logger.Error("database unreachable at startup", "err", pingErr.Error())
		return pingErr
	}
	logger.Info("database connected", "pooled", cfg.DBPooled)

	addr := net.JoinHostPort("", strconv.Itoa(cfg.Port))
	// Apply the shared middleware chain once at the root so every module
	// inherits request ids, access logging, panic recovery, and CORS. RequestID
	// is outermost so the id is available to logging and recovery; CORS sits
	// above the rest so cross-origin headers land on every response (including a
	// 500) and a preflight short-circuits before the handlers; Recovery is
	// innermost so a handler panic becomes a 500 the access log can observe.
	handler := httpx.Chain(newRouter(database, database.Pool(), cfg),
		httpx.RequestIDMiddleware(),
		httpx.CORS(cfg.CORSAllowedOrigins),
		httpx.Logging(logger, cfg.GCPProject),
		httpx.Recovery(),
	)

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	logger.Info("starting", "env", string(cfg.Env), "addr", addr)

	// Bind before serving so a failed bind is reported synchronously as a
	// non-zero exit rather than racing the shutdown select below.
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		logger.Error("listen failed", "addr", addr, "err", err.Error())
		return err
	}
	logger.Info("listening", "addr", ln.Addr().String())

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			return
		}
		serveErr <- nil
	}()

	select {
	case err := <-serveErr:
		// The server stopped on its own (e.g. the listener failed); a clean
		// close from Shutdown reports nil here.
		if err != nil {
			logger.Error("serve failed", "err", err.Error())
			return err
		}
		return nil
	case <-ctx.Done():
		logger.Info("shutting down", "timeout", shutdownTimeout.String())
		// Restore default signal handling so a second signal force-quits a
		// shutdown that is taking too long.
		stop()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			logger.Error("graceful shutdown failed", "err", err.Error())
			return err
		}
		logger.Info("stopped")
		return nil
	}
}

// newRouter builds the service's root HTTP router: the health probes plus every
// domain module mounted through the shared httpx.RouteRegistrar contract.
// Adding or removing a module is a single edit to this list — the composition
// root — and no module reaches into another's internals.
//
// dbPinger is the database handle whose connectivity backs the readiness probe;
// it is the narrow db.Pinger seam so the router doesn't depend on the concrete
// pool. pool is the same database's connection pool, handed to the modules that
// run queries (auth provisioning); it is kept separate from dbPinger so the
// readiness seam stays narrow.
func newRouter(dbPinger db.Pinger, pool *pgxpool.Pool, cfg config.Config) http.Handler {
	mux := http.NewServeMux()

	// Health probes are mounted on the root router so they inherit the shared
	// middleware chain. Liveness is dependency-free; readiness aggregates the
	// checks registered below.
	mux.HandleFunc(health.LivenessPath, health.Healthz)

	readiness := health.NewReadiness()
	// Readiness reflects real database connectivity: the check pings through the
	// (pooled) connection real traffic uses, under the registry's bounded
	// timeout. /readyz returns 503 naming "db" when it fails.
	readiness.Register("db", dbPinger.Ping)
	mux.HandleFunc(health.ReadinessPath, readiness.Handler)

	// The auth module owns the session-validation material, so its RequireAuth is
	// the single authentication hook; other modules receive it here (as an
	// httpx.Middleware) rather than importing auth, preserving the module
	// boundary. The sharing membership writer is handed to trip the same way, so
	// trip writes the Owner membership transactionally without importing sharing.
	authModule := auth.New(cfg, pool)
	tripAuthz := trip.NewOwnerOnlyAuthorizer(pool)
	modules := []httpx.RouteRegistrar{
		authModule,
		trip.New(pool, authModule.RequireAuth, sharing.NewMemberships(), tripAuthz),
		budget.New(pool, authModule.RequireAuth, tripOwnerAuthzAdapter{tripAuthz}, tripCostReaderAdapter{pool: pool}),
		journal.New(pool, authModule.RequireAuth, tripOwnerJournalAuthzAdapter{tripAuthz}),
		sharing.New(),
		geo.New(),
	}
	for _, m := range modules {
		m.RegisterRoutes(mux)
	}

	// Guarded test-only endpoint for end-to-end alert verification (M01.7 S5).
	// Disabled by default; enabled only when DEBUG_ERROR_TRIGGER=true is set.
	// Returns 404 when disabled so the path is not publicly discoverable.
	// Remove the env var once the alert drill is complete.
	if cfg.DebugErrorTrigger {
		mux.HandleFunc("/debug/trigger-error", debugTriggerError)
	}

	return mux
}

// tripOwnerJournalAuthzAdapter adapts *trip.OwnerOnlyAuthorizer to journal.Authorizer.
type tripOwnerJournalAuthzAdapter struct {
	inner *trip.OwnerOnlyAuthorizer
}

func (a tripOwnerJournalAuthzAdapter) CanAccess(ctx context.Context, userID, tripID string) (bool, error) {
	return a.inner.Can(ctx, userID, trip.ActionRead, tripID)
}

// tripOwnerAuthzAdapter adapts *trip.OwnerOnlyAuthorizer to budget.Authorizer.
// The budget module declares its own Authorizer interface (consumer-side) so it
// never imports the trip module — this adapter lives in the composition root
// where both modules are visible.
type tripOwnerAuthzAdapter struct {
	inner *trip.OwnerOnlyAuthorizer
}

func (a tripOwnerAuthzAdapter) CanWrite(ctx context.Context, userID, tripID string) (bool, error) {
	return a.inner.Can(ctx, userID, trip.ActionWrite, tripID)
}

// tripCostReaderAdapter implements budget.TripCostReader by querying trip.stays
// and trip.plan_items directly. It lives in the composition root (not in the
// budget module) so the budget module never imports trip — the cross-module
// boundary rule is preserved.
//
// Category mapping:
//
//	stay         → Stays
//	plan item type "transport"   → Transport
//	plan item type "food"        → Food
//	plan item type "activity"    → Activities
//	plan item type "stay"/"hotel"→ Stays
//	everything else              → Other
type tripCostReaderAdapter struct {
	pool *pgxpool.Pool
}

func (a tripCostReaderAdapter) GetTripCosts(ctx context.Context, tripID string) ([]budget.ExternalCost, error) {
	var out []budget.ExternalCost

	// --- Stays → CategoryStays, trip-level (no day) ---
	stayRows, err := a.pool.Query(ctx,
		`SELECT COALESCE(cost, 0) FROM trip.stays WHERE trip_id = $1::uuid AND cost IS NOT NULL AND cost > 0`,
		tripID)
	if err != nil {
		return nil, fmt.Errorf("tripCostReader: query stays: %w", err)
	}
	defer stayRows.Close()
	for stayRows.Next() {
		var amount float64
		if err := stayRows.Scan(&amount); err != nil {
			return nil, fmt.Errorf("tripCostReader: scan stay: %w", err)
		}
		out = append(out, budget.ExternalCost{
			DayID:    "", // trip-level — stays span multiple days
			Category: budget.CategoryStays,
			Amount:   amount,
		})
	}
	if err := stayRows.Err(); err != nil {
		return nil, fmt.Errorf("tripCostReader: stays rows: %w", err)
	}

	// --- Plan items → category mapped from type field ---
	itemRows, err := a.pool.Query(ctx,
		`SELECT COALESCE(day_id::text, ''), COALESCE(type, ''), COALESCE(cost, 0)
		 FROM trip.plan_items
		 WHERE trip_id = $1::uuid AND cost IS NOT NULL AND cost > 0`,
		tripID)
	if err != nil {
		return nil, fmt.Errorf("tripCostReader: query plan items: %w", err)
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var dayID, itemType string
		var amount float64
		if err := itemRows.Scan(&dayID, &itemType, &amount); err != nil {
			return nil, fmt.Errorf("tripCostReader: scan plan item: %w", err)
		}
		out = append(out, budget.ExternalCost{
			DayID:    dayID,
			Category: planItemCategory(itemType),
			Amount:   amount,
		})
	}
	if err := itemRows.Err(); err != nil {
		return nil, fmt.Errorf("tripCostReader: plan item rows: %w", err)
	}

	return out, nil
}

// planItemCategory maps a plan item's type string to one of the five fixed
// budget categories. The mapping is intentionally permissive — any unrecognised
// type falls through to Other.
func planItemCategory(itemType string) budget.Category {
	switch itemType {
	case "transport", "flight", "train", "bus", "car", "ferry":
		return budget.CategoryTransport
	case "food", "restaurant", "cafe", "meal", "drink":
		return budget.CategoryFood
	case "activity", "tour", "sightseeing", "museum", "entertainment":
		return budget.CategoryActivities
	case "stay", "hotel", "accommodation", "hostel", "airbnb":
		return budget.CategoryStays
	default:
		return budget.CategoryOther
	}
}

// debugTriggerError deliberately returns a 500 so the error-rate metric spikes
// and the S4 alert can be verified end-to-end. It is only registered when
// DEBUG_ERROR_TRIGGER=true and must not be left enabled in normal operation.
func debugTriggerError(w http.ResponseWriter, r *http.Request) {
	httpx.WriteError(w, r, httpx.NewAPIError(
		http.StatusInternalServerError,
		"debug_error_trigger",
		"deliberate error for alert verification (M01.7 S5)",
	))
}
