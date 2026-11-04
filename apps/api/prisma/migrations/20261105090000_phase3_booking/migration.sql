-- Booking settings per business, snapshot fields on bookings, link customer -> user.
ALTER TABLE "businesses" ADD COLUMN "min_notice_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "max_days_ahead" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "slot_step_min" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "customers" ADD COLUMN "user_id" TEXT;
CREATE INDEX "customers_user_id_idx" ON "customers"("user_id");

ALTER TABLE "bookings" ADD COLUMN "buffer_min" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ar';

-- Zero double booking: the database itself refuses two active bookings of the same employee that overlap.
-- The preparation time (buffer) after a booking counts as busy time too.
-- Dates are stored as "timestamp" in UTC, so tsrange is used (tstzrange is not immutable on this type,
-- and PostgreSQL does not allow it in an index). Cancelled bookings free the slot.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "bookings" ADD CONSTRAINT "no_overlap" EXCLUDE USING gist (
  "staff_id" WITH =,
  tsrange("starts_at", "ends_at" + ("buffer_min" * interval '1 minute')) WITH &&
) WHERE ("status" <> 'CANCELLED');
