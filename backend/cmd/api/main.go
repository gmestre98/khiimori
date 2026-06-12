// Command api is the entrypoint for the Eudaimonia backend.
//
// It boots a single HTTP server for the whole modular monolith: it loads typed
// configuration, builds the structured logger, binds the configured port, and
// serves until interrupted, draining in-flight requests on SIGINT/SIGTERM
// (important for Cloud Run). The root router is assembled here so the domain
// modules can be mounted through their interfaces (S4) and the health endpoints
// added (S7/S8); for now it serves no routes. Standard library net/http only.
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

	"github.com/gmestre98/eudaimonia/backend/internal/platform/config"
	platformlog "github.com/gmestre98/eudaimonia/backend/internal/platform/log"
)

// shutdownTimeout bounds how long a graceful shutdown waits for in-flight
// requests to drain before the process exits.
const shutdownTimeout = 15 * time.Second

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

	addr := net.JoinHostPort("", strconv.Itoa(cfg.Port))
	srv := &http.Server{
		Addr:              addr,
		Handler:           newRouter(),
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

// newRouter builds the service's root HTTP router. The domain modules are
// mounted through their interfaces in S4 and the health endpoints added in
// S7/S8; for now it serves no routes.
func newRouter() http.Handler {
	return http.NewServeMux()
}
