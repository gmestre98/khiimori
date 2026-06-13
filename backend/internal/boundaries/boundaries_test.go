// Package boundaries holds the architecture test that enforces the
// modular-monolith import rule (see backend/README.md):
//
//	A domain module under internal/<module> must NOT import another domain
//	module's package directly. The shared internal/platform package may be
//	imported by any module. Cross-module access happens via interfaces only.
//
// This is an architecture test rather than a runtime package: it scans the
// internal/ tree with go/parser (no external tooling) and fails the build when
// a forbidden import appears, so the rule cannot silently rot. It is itself not
// a domain module and imports nothing from internal/.
package boundaries

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// modulePrefix is the import path prefix for the backend's internal modules.
const modulePrefix = "github.com/gmestre98/khiimori/backend/internal/"

// sharedModule may be imported by any domain module; it is not a domain module.
const sharedModule = "platform"

// violation describes a single forbidden cross-module import.
type violation struct {
	file       string // file containing the import
	fromModule string // module the file belongs to
	toModule   string // module being imported
	importPath string // the offending import path
}

func (v violation) String() string {
	return v.file + ": module " + v.fromModule + " imports module " + v.toModule + " (" + v.importPath + ")"
}

// internalModuleOf returns the module name for an internal import path, or "" if
// the path is not an internal-module import.
func internalModuleOf(importPath string) string {
	if !strings.HasPrefix(importPath, modulePrefix) {
		return ""
	}
	rest := strings.TrimPrefix(importPath, modulePrefix)
	return strings.SplitN(rest, "/", 2)[0]
}

// findViolations scans internalRoot for domain modules importing other domain
// modules. The shared platform module is always an allowed import target.
func findViolations(internalRoot string) ([]violation, error) {
	var violations []violation
	fset := token.NewFileSet()

	err := filepath.WalkDir(internalRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}

		// The module a file belongs to is the first path element under internalRoot.
		rel, err := filepath.Rel(internalRoot, path)
		if err != nil {
			return err
		}
		fromModule := strings.Split(filepath.ToSlash(rel), "/")[0]

		f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imp := range f.Imports {
			importPath, err := strconv.Unquote(imp.Path.Value)
			if err != nil {
				return err
			}
			toModule := internalModuleOf(importPath)
			if toModule == "" || toModule == sharedModule || toModule == fromModule {
				continue // not internal, the shared module, or a same-module import
			}
			violations = append(violations, violation{
				file:       rel,
				fromModule: fromModule,
				toModule:   toModule,
				importPath: importPath,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(violations, func(i, j int) bool { return violations[i].String() < violations[j].String() })
	return violations, nil
}

// internalRoot returns the absolute path to backend/internal/, resolved from
// this test file's location so the test works from any working directory.
func internalRoot(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("could not resolve the boundaries test file path")
	}
	// thisFile = .../backend/internal/boundaries/boundaries_test.go
	return filepath.Dir(filepath.Dir(thisFile))
}

// TestNoCrossModuleImports is the enforced rule: the real internal/ tree must
// contain no forbidden cross-module imports.
func TestNoCrossModuleImports(t *testing.T) {
	t.Parallel()

	violations, err := findViolations(internalRoot(t))
	if err != nil {
		t.Fatalf("scanning internal modules: %v", err)
	}
	if len(violations) > 0 {
		lines := make([]string, len(violations))
		for i, v := range violations {
			lines[i] = "  - " + v.String()
		}
		t.Fatalf("forbidden cross-module imports found (use interfaces, or move shared code to internal/platform):\n%s",
			strings.Join(lines, "\n"))
	}
}

// TestCheckerDetectsViolation proves the checker actually catches a forbidden
// import: it builds a synthetic internal tree where auth imports trip and
// asserts exactly that violation is reported, while a platform import is not.
func TestCheckerDetectsViolation(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	mustWrite := func(rel, body string) {
		full := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	// auth imports trip (forbidden) and platform (allowed).
	mustWrite("auth/auth.go", "package auth\n\nimport (\n\t_ \""+modulePrefix+"trip\"\n\t_ \""+modulePrefix+"platform\"\n)\n")
	// trip imports only the standard library (fine).
	mustWrite("trip/trip.go", "package trip\n\nimport _ \"fmt\"\n")

	violations, err := findViolations(root)
	if err != nil {
		t.Fatalf("scanning synthetic tree: %v", err)
	}
	if len(violations) != 1 {
		t.Fatalf("expected exactly 1 violation, got %d: %v", len(violations), violations)
	}
	if got := violations[0]; got.fromModule != "auth" || got.toModule != "trip" {
		t.Fatalf("expected auth->trip violation, got %s", got)
	}
}
