package trip

import "testing"

func TestNormalizeBooking(t *testing.T) {
	str := func(s string) *string { return &s }
	cases := []struct {
		in   *string
		want string
	}{
		{nil, BookingNone},
		{str(""), BookingNone},
		{str("none"), BookingNone},
		{str("to_book"), BookingToBook},
		{str("booked"), BookingBooked},
		{str("paid"), BookingPaid},
		{str("Confirmed"), BookingBooked},
		{str("reserved"), BookingBooked},
		{str("Paid online"), BookingPaid},
		{str("unpaid"), BookingBooked},
		{str("not booked yet"), BookingToBook},
		{str("need to book"), BookingToBook},
		{str("no booking needed"), BookingNone},
	}
	for _, c := range cases {
		in := "<nil>"
		if c.in != nil {
			in = *c.in
		}
		if got := normalizeBooking(c.in); got != c.want {
			t.Errorf("normalizeBooking(%q) = %q, want %q", in, got, c.want)
		}
	}
}
