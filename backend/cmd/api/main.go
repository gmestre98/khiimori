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
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

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
	handler := httpx.Chain(newRouter(database, cfg),
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
// pool.
func newRouter(dbPinger db.Pinger, cfg config.Config) http.Handler {
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

	modules := []httpx.RouteRegistrar{
		auth.New(cfg),
		trip.New(),
		budget.New(),
		journal.New(),
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
