//go:build integration

package migrations_test

import (
	"database/sql"
	"os"
	"testing"

	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/migrations"
)

// TestBookingStatusMigration checks 00045 maps the old free-text plan item
// booking and the stays' paid flag onto the four statuses.
func TestBookingStatusMigration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		t.Skip("DATABASE_URL_TEST not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := goose.Reset(db, migrations.Dir); err != nil {
			t.Errorf("teardown reset: %v", err)
		}
	})
	if err := goose.UpTo(db, migrations.Dir, 44); err != nil {
		t.Fatalf("up to 44: %v", err)
	}

	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	var userID, tripID string
	if err := db.QueryRow(`INSERT INTO auth.users (google_sub, email, name) VALUES ('sub-bk', 'bk@example.com', 'B') RETURNING id::text`).Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if err := db.QueryRow(`INSERT INTO trip.trips (owner_id, name, start_date, end_date) VALUES ($1::uuid, 'T', '2026-11-18', '2026-12-09') RETURNING id::text`, userID).Scan(&tripID); err != nil {
		t.Fatalf("insert trip: %v", err)
	}
	items := map[string]string{
		"a": "", "b": "confirmed", "c": "Paid online", "d": "not booked yet",
		"e": "no booking needed", "f": "unpaid", "g": "reserved", "h": "booked through booking.com",
	}
	want := map[string]string{
		"a": "none", "b": "booked", "c": "paid", "d": "to_book",
		"e": "none", "f": "booked", "g": "booked", "h": "booked",
	}
	for title, bs := range items {
		var v any = bs
		if bs == "" {
			v = nil
		}
		mustExec(`INSERT INTO trip.plan_items (trip_id, title, booking_status) VALUES ($1::uuid, $2, $3)`, tripID, title, v)
	}
	mustExec(`INSERT INTO trip.stays (trip_id, name, paid) VALUES ($1::uuid, 'paid', true), ($1::uuid, 'unpaid', false)`, tripID)

	if err := goose.UpTo(db, migrations.Dir, 45); err != nil {
		t.Fatalf("up to 45: %v", err)
	}
	rows, err := db.Query(`SELECT title, booking_status FROM trip.plan_items WHERE trip_id = $1::uuid`, tripID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var title, got string
		if err := rows.Scan(&title, &got); err != nil {
			t.Fatal(err)
		}
		if got != want[title] {
			t.Errorf("plan item %q (%q) → %q, want %q", title, items[title], got, want[title])
		}
	}
	for name, w := range map[string]string{"paid": "paid", "unpaid": "booked"} {
		var got string
		if err := db.QueryRow(`SELECT booking_status FROM trip.stays WHERE trip_id = $1::uuid AND name = $2`, tripID, name).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != w {
			t.Errorf("stay %q → %q, want %q", name, got, w)
		}
	}
	if _, err := db.Exec(`INSERT INTO trip.plan_items (trip_id, title, booking_status) VALUES ($1::uuid, 'x', 'maybe')`, tripID); err == nil {
		t.Error("check constraint accepted 'maybe'")
	}
}
