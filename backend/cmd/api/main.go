// Command api is the entrypoint for the Eudaimonia backend.
//
// It is intentionally a stub for now: the modular-monolith package boundaries
// (internal/...) and the HTTP server are introduced in later stories. This binary
// exists so the build, vet, and test pipeline has a real main package to compile.
package main

import "log"

func main() {
	log.Println("eudaimonia: starting api")
	log.Println("eudaimonia: nothing to serve yet — exiting cleanly")
}
