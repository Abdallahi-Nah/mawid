-- Phase 5: default buffer, deposit settings, suspension, review token and reply date, payment provider.
ALTER TABLE "businesses" ADD COLUMN "buffer_min" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "payment_instructions" TEXT,
ADD COLUMN "suspended_at" TIMESTAMP(3);

ALTER TABLE "services" ADD COLUMN "deposit_amount" DECIMAL(10,2);

ALTER TABLE "bookings" ADD COLUMN "review_token" TEXT;
UPDATE "bookings" SET "review_token" = gen_random_uuid()::text WHERE "review_token" IS NULL;
ALTER TABLE "bookings" ALTER COLUMN "review_token" SET NOT NULL;
CREATE UNIQUE INDEX "bookings_review_token_key" ON "bookings"("review_token");

ALTER TABLE "reviews" ADD COLUMN "replied_at" TIMESTAMP(3);

ALTER TABLE "payments" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "decided_at" TIMESTAMP(3);

-- Reports and the monthly plan count filter by business, status and date.
CREATE INDEX "bookings_business_id_status_starts_at_idx" ON "bookings"("business_id", "status", "starts_at");
CREATE INDEX "bookings_business_id_created_at_idx" ON "bookings"("business_id", "created_at");
CREATE INDEX "reviews_business_id_created_at_idx" ON "reviews"("business_id", "created_at");
