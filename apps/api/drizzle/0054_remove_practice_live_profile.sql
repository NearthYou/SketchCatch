-- sketchcatch:contract-migration-after: v0.1.0
ALTER TABLE "deployments" ALTER COLUMN "live_profile" DROP DEFAULT;--> statement-breakpoint
UPDATE "deployments" SET "live_profile" = 'demo_web_service' WHERE "live_profile" = 'practice';--> statement-breakpoint
CREATE TYPE "public"."deployment_live_profile_next" AS ENUM('demo_web_service', 'demo_web_service_with_rds');--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "live_profile" SET DATA TYPE "public"."deployment_live_profile_next" USING ("live_profile"::text::"public"."deployment_live_profile_next");--> statement-breakpoint
DROP TYPE "public"."deployment_live_profile";--> statement-breakpoint
ALTER TYPE "public"."deployment_live_profile_next" RENAME TO "deployment_live_profile";--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "live_profile" SET DEFAULT 'demo_web_service';
