// Package packing implements the per-trip packing list: the set of things a
// traveller needs to bring, grouped by category and checked off as they are
// packed. It also owns reusable packing templates — named lists a user can copy
// into any trip so common kits (e.g. cold-weather safety gear) need not be
// retyped each trip.
//
// Like the other domain modules it owns its own Postgres schema (packing) and
// declares a consumer-side Authorizer so it never imports the trip or sharing
// modules; the composition root passes a concrete adapter.
package packing
