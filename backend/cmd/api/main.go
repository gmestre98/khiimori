// Command api is the entrypoint for the Eudaimonia backend.
//
// For local development it runs as a long-lived process: it opens a TCP
// listener on PORT (default 8080) so the dev stack has a running, reachable
// backend, and blocks until interrupted. It intentionally speaks no protocol
// yet — the real HTTP server (config, routing, middleware, health endpoints)
// arrives in Epic M01.2. The modular-monolith package boundaries live under
// internal/.
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("eudaimonia: %v", err)
	}
}

func run() error {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := net.JoinHostPort("", port)

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	defer ln.Close()

	log.Printf("eudaimonia: api listening on %s (no protocol yet — HTTP server arrives in Epic M01.2)", ln.Addr())

	// Stop accepting and shut down cleanly on Ctrl-C / SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()

	// Accept and immediately close connections: enough to be reachable for the
	// dev stack's connectivity check, without implementing any real behaviour.
	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil {
				log.Println("eudaimonia: shutting down")
				return nil
			}
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			return err
		}
		_ = conn.Close()
	}
}
