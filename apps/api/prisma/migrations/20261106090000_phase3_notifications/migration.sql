-- In-app alerts for the business and creation date of every notification.
ALTER TYPE "NotificationChannel" ADD VALUE 'IN_APP';
ALTER TABLE "notifications" ADD COLUMN "read_at" TIMESTAMP(3),
ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "notifications_business_id_channel_created_at_idx" ON "notifications"("business_id", "channel", "created_at");
