ALTER TABLE "notification_outbox"
ADD COLUMN "provider_status_code" integer;
--> statement-breakpoint
ALTER TABLE "notification_outbox"
ADD CONSTRAINT "notification_outbox_provider_status_code_check"
CHECK ("provider_status_code" IS NULL OR "provider_status_code" BETWEEN 100 AND 599);
