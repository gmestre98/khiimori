-- +goose Up
-- One booking status for stays and plan items: none | to_book | booked | paid.
-- Plan items had free text; it's mapped to the closest value. Stays only had
-- a paid flag: paid → 'paid', unpaid → 'booked'. stays.paid stays in sync
-- (paid = booking_status = 'paid') for readers that still use it.
UPDATE trip.plan_items SET booking_status = CASE
    WHEN booking_status IS NULL OR btrim(booking_status) = '' THEN 'none'
    WHEN lower(booking_status) ~ 'no booking|not needed|walk' THEN 'none'
    WHEN lower(booking_status) ~ '\m(not|to|need|pending)\M.*(book|reserv)|unbooked|\mtbc\M|todo|to do' THEN 'to_book'
    WHEN lower(booking_status) ~ 'paid|pago' AND lower(booking_status) !~ 'unpaid|not paid|to pay' THEN 'paid'
    ELSE 'booked'
END;
ALTER TABLE trip.plan_items
    ALTER COLUMN booking_status SET DEFAULT 'none',
    ALTER COLUMN booking_status SET NOT NULL,
    ADD CONSTRAINT plan_items_booking_status_check
        CHECK (booking_status IN ('none', 'to_book', 'booked', 'paid'));

ALTER TABLE trip.stays ADD COLUMN booking_status text NOT NULL DEFAULT 'booked';
UPDATE trip.stays SET booking_status = CASE WHEN paid THEN 'paid' ELSE 'booked' END;
ALTER TABLE trip.stays
    ADD CONSTRAINT stays_booking_status_check
        CHECK (booking_status IN ('none', 'to_book', 'booked', 'paid'));

-- +goose Down
ALTER TABLE trip.stays DROP CONSTRAINT stays_booking_status_check, DROP COLUMN booking_status;
ALTER TABLE trip.plan_items
    DROP CONSTRAINT plan_items_booking_status_check,
    ALTER COLUMN booking_status DROP NOT NULL,
    ALTER COLUMN booking_status DROP DEFAULT;
UPDATE trip.plan_items SET booking_status = NULL WHERE booking_status = 'none';
