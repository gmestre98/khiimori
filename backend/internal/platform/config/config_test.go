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
	for _, k := range []string{"PORT", "ENV", "LOG_LEVEL", "DATABASE_URL", "DATABASE_URL_DIRECT", "DB_POOLED"} {
		t.Setenv(k, "")
		if err := os.Unsetenv(k); err != nil {
			t.Fatalf("unset %s: %v", k, err)
		}
	}
}

// setAllValid sets every variable Load requires to a valid value (pooled mode),
// so a test exercising one field isn't tripped by another's mandatory check.
func setAllValid(t *testing.T) {
	t.Helper()
	t.Setenv("PORT", "8080")
	t.Setenv("ENV", "dev")
	t.Setenv("LOG_LEVEL", "error")
	t.Setenv("DB_POOLED", "true")
	t.Setenv("DATABASE_URL", "postgres://localhost/eudaimonia")
	t.Setenv("DATABASE_URL_DIRECT", "postgres://localhost:5433/eudaimonia")
}

func TestLoadValid(t *testing.T) {
	clearEnv(t)
	t.Setenv("PORT", "9090")
	t.Setenv("ENV", "prod")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("DB_POOLED", "false")
	t.Setenv("DATABASE_URL", "postgres://localhost/eudaimonia")
	t.Setenv("DATABASE_URL_DIRECT", "postgres://localhost:5433/eudaimonia")

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
	if cfg.DBPooled {
		t.Error("DBPooled = true, want false")
	}
	if cfg.DatabaseURL != "postgres://localhost/eudaimonia" {
		t.Errorf("DatabaseURL = %q, unexpected", cfg.DatabaseURL)
	}
	if cfg.DatabaseURLDirect != "postgres://localhost:5433/eudaimonia" {
		t.Errorf("DatabaseURLDirect = %q, unexpected", cfg.DatabaseURLDirect)
	}
}

// TestLoadRequired asserts that every mandatory variable must be set — omitting
// any one fails Load. (DATABASE_URL_DIRECT is optional in pooled mode, so it is
// covered separately in TestLoadActiveDSN.)
func TestLoadRequired(t *testing.T) {
	for _, omit := range []string{"PORT", "ENV", "LOG_LEVEL", "DB_POOLED", "DATABASE_URL"} {
		t.Run("missing "+omit, func(t *testing.T) {
			clearEnv(t)
			setAllValid(t)
			if err := os.Unsetenv(omit); err != nil {
				t.Fatalf("unset %s: %v", omit, err)
			}
			if _, err := Load(); err == nil {
				t.Fatalf("Load() without %s returned nil error, want error", omit)
			}
		})
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
		{"non-bool DB_POOLED", "DB_POOLED", "yes"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			setAllValid(t) // isolate the failure to the field under test
			t.Setenv(tc.key, tc.val)

			if _, err := Load(); err == nil {
				t.Fatalf("Load() with %s=%q returned nil error, want error", tc.key, tc.val)
			}
		})
	}
}

// TestLoadActiveDSN asserts the active database DSN (per the DB_POOLED toggle) is
// mandatory, while the unused endpoint stays optional.
func TestLoadActiveDSN(t *testing.T) {
	tests := []struct {
		name      string
		pooled    string
		url       string
		urlDirect string
		wantErr   bool
	}{
		{name: "pooled, no DATABASE_URL", pooled: "true", urlDirect: "postgres://d", wantErr: true},
		{name: "pooled, only DATABASE_URL", pooled: "true", url: "postgres://p", wantErr: false},
		{name: "direct, no DATABASE_URL_DIRECT", pooled: "false", url: "postgres://p", wantErr: true},
		{name: "direct, only DATABASE_URL_DIRECT", pooled: "false", urlDirect: "postgres://d", wantErr: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("PORT", "8080")
			t.Setenv("ENV", "dev")
			t.Setenv("LOG_LEVEL", "error")
			t.Setenv("DB_POOLED", tc.pooled)
			if tc.url != "" {
				t.Setenv("DATABASE_URL", tc.url)
			}
			if tc.urlDirect != "" {
				t.Setenv("DATABASE_URL_DIRECT", tc.urlDirect)
			}

			_, err := Load()
			if tc.wantErr && err == nil {
				t.Fatal("Load() returned nil error, want error for missing active DSN")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("Load() returned error %v, want success", err)
			}
		})
	}
}
