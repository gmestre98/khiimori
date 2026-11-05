package trip

import "strings"

// Booking statuses shared by stays and plan items.
const (
	BookingNone   = "none"    // nothing to reserve: walk in, pay there
	BookingToBook = "to_book" // still needs booking
	BookingBooked = "booked"  // reserved, pay there or later
	BookingPaid   = "paid"    // already paid
)

// normalizeBooking maps a client value to one of the four statuses. The four
// canonical values pass through; anything else (older clients and queued
// offline writes sent free text such as "confirmed") is mapped the same way
// migration 00045 mapped stored text: empty → none, "to book"-like → to_book,
// "paid" → paid, anything else → booked.
func normalizeBooking(s *string) string {
	if s == nil {
		return BookingNone
	}
	v := strings.ToLower(strings.TrimSpace(*s))
	switch v {
	case "", BookingNone:
		return BookingNone
	case BookingToBook, "to book", "tobook":
		return BookingToBook
	case BookingBooked:
		return BookingBooked
	case BookingPaid:
		return BookingPaid
	}
	switch {
	case containsAny(v, "no booking", "not needed", "walk"):
		return BookingNone
	case containsAny(v, "unpaid", "not paid", "to pay"):
		if containsAny(v, "not book", "to book", "unbook") {
			return BookingToBook
		}
		return BookingBooked
	case containsAny(v, "not book", "to book", "unbook", "need", "pending", "tbc", "todo", "to do"):
		return BookingToBook
	case containsAny(v, "paid", "pago"):
		return BookingPaid
	}
	return BookingBooked
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
