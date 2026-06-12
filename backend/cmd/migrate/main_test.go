package main

import "testing"

// TestRunArgValidation covers the argument handling that runs before any
// database connection: wrong arg count and unknown commands must error without
// needing a DB.
func TestRunArgValidation(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{"no args", nil},
		{"too many args", []string{"up", "extra"}},
		{"unknown command", []string{"sideways"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if err := run(tc.args); err == nil {
				t.Fatalf("run(%v) returned nil error, want error", tc.args)
			}
		})
	}
}
