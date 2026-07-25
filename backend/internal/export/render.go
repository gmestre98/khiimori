package export

import (
	"bytes"
	_ "embed"
	"fmt"
	"html/template"
	"strconv"
	"strings"
	"time"
)

//go:embed template.gohtml
var docTemplateSource string

// docTemplate is parsed once at startup. html/template auto-escapes every
// interpolation, so user text (titles, diary, captions) can never inject markup.
var docTemplate = template.Must(
	template.New("doc").Funcs(templateFuncs()).Parse(docTemplateSource),
)

// Render turns a Model into a self-contained HTML document for Google Drive to
// convert into a native Google Doc. The output uses semantic headings, tables,
// and per-day page breaks; it references no external CSS, fonts, or scripts.
func Render(m Model) ([]byte, error) {
	var buf bytes.Buffer
	if err := docTemplate.Execute(&buf, m); err != nil {
		return nil, fmt.Errorf("export: render: %w", err)
	}
	return buf.Bytes(), nil
}

// templateFuncs are the formatting helpers the template calls. Keeping
// formatting here keeps the template declarative.
func templateFuncs() template.FuncMap {
	return template.FuncMap{
		"weekdayDate": func(t time.Time) string { return t.Format("Monday, 2 January 2006") },
		"dayHeading":  dayHeading,
		"dateRange":   dateRange,
		"money":       money, // template auto-dereferences a *float64 cost for this
		"stars":       stars,
		"nonEmpty":    func(s string) bool { return strings.TrimSpace(s) != "" },
		"join":        func(sep string, xs []string) string { return strings.Join(xs, sep) },
	}
}

// dayHeading renders "Day 3 — Thursday, 14 May".
func dayHeading(d Day) string {
	return fmt.Sprintf("Day %d — %s", d.Index, d.Date.Format("Monday, 2 January"))
}

// dateRange renders "12–18 May 2026", collapsing shared month/year.
func dateRange(start, end time.Time) string {
	if start.IsZero() || end.IsZero() {
		return ""
	}
	if start.Year() == end.Year() && start.Month() == end.Month() {
		return fmt.Sprintf("%d–%d %s %d", start.Day(), end.Day(), start.Format("January"), start.Year())
	}
	if start.Year() == end.Year() {
		return fmt.Sprintf("%d %s – %d %s %d",
			start.Day(), start.Format("January"), end.Day(), end.Format("January"), start.Year())
	}
	return fmt.Sprintf("%s – %s", start.Format("2 January 2006"), end.Format("2 January 2006"))
}

// money formats an amount in the trip's currency: a symbol for the common ones,
// otherwise the ISO code, with thousands separators and cents dropped when whole.
func money(cur string, amt float64) string {
	sym := map[string]string{"EUR": "€", "USD": "$", "GBP": "£"}[cur]
	n := formatAmount(amt)
	if sym != "" {
		return sym + n
	}
	if cur == "" {
		return n
	}
	return cur + " " + n
}

// formatAmount formats a number with thousands separators, showing cents only
// when the amount isn't whole (e.g. "1,840" and "48.50").
func formatAmount(amt float64) string {
	neg := amt < 0
	if neg {
		amt = -amt
	}
	whole := int64(amt)
	cents := int64((amt-float64(whole))*100 + 0.5)
	if cents == 100 { // rounding carried over
		whole++
		cents = 0
	}
	s := groupThousands(strconv.FormatInt(whole, 10))
	if cents != 0 {
		s += "." + fmt.Sprintf("%02d", cents)
	}
	if neg {
		s = "-" + s
	}
	return s
}

// groupThousands inserts commas into a non-negative integer string.
func groupThousands(digits string) string {
	n := len(digits)
	if n <= 3 {
		return digits
	}
	var b strings.Builder
	pre := n % 3
	if pre > 0 {
		b.WriteString(digits[:pre])
		if n > pre {
			b.WriteByte(',')
		}
	}
	for i := pre; i < n; i += 3 {
		b.WriteString(digits[i : i+3])
		if i+3 < n {
			b.WriteByte(',')
		}
	}
	return b.String()
}

// stars renders a 1–5 rating as filled/empty stars; nil returns "".
func stars(r *int) string {
	if r == nil {
		return ""
	}
	n := *r
	if n < 0 {
		n = 0
	}
	if n > 5 {
		n = 5
	}
	return strings.Repeat("★", n) + strings.Repeat("☆", 5-n)
}
