package config

import (
	"os"
	"testing"
)

// clearEnv unsets every variable Load reads so a test starts from a known state.
// t.Setenv snapshots the original value and restores it when the test ends; the
// following os.Unsetenv then clears it so LookupEnv reports the variable absent.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{"PORT", "ENV", "LOG_LEVEL", "DATABASE_URL"} {
		t.Setenv(k, "")
		if err := os.Unsetenv(k); err != nil {
			t.Fatalf("unset %s: %v", k, err)
		}
	}
}

func TestLoadDefaults(t *testing.T) {
	clearEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}
	if cfg.Port != defaultPort {
		t.Errorf("Port = %d, want %d", cfg.Port, defaultPort)
	}
	if cfg.Env != EnvDev {
		t.Errorf("Env = %q, want %q", cfg.Env, EnvDev)
	}
	if cfg.LogLevel != LevelError {
		t.Errorf("LogLevel = %q, want %q (errors-only default)", cfg.LogLevel, LevelError)
	}
	if cfg.DatabaseURL != "" {
		t.Errorf("DatabaseURL = %q, want empty (wired in M01.3)", cfg.DatabaseURL)
	}
}

func TestLoadOverrides(t *testing.T) {
	clearEnv(t)
	t.Setenv("PORT", "9090")
	t.Setenv("ENV", "prod")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("DATABASE_URL", "postgres://localhost/eudaimonia")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}
	if cfg.Port != 9090 {
		t.Errorf("Port = %d, want 9090", cfg.Port)
	}
	if cfg.Env != EnvProd {
		t.Errorf("Env = %q, want %q", cfg.Env, EnvProd)
	}
	if cfg.LogLevel != LevelInfo {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, LevelInfo)
	}
	if cfg.DatabaseURL != "postgres://localhost/eudaimonia" {
		t.Errorf("DatabaseURL = %q, unexpected", cfg.DatabaseURL)
	}
}

func TestLoadInvalid(t *testing.T) {
	tests := []struct {
		name string
		key  string
		val  string
	}{
		{"non-numeric port", "PORT", "not-a-number"},
		{"port out of range", "PORT", "70000"},
		{"unknown env", "ENV", "staging"},
		{"unknown log level", "LOG_LEVEL", "verbose"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			t.Setenv(tc.key, tc.val)

			if _, err := Load(); err == nil {
				t.Fatalf("Load() with %s=%q returned nil error, want error", tc.key, tc.val)
			}
		})
	}
}
