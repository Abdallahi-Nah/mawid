ALTER TABLE "notifications" ADD COLUMN "error" TEXT;
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");
