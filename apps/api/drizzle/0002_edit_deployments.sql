CREATE TYPE "public"."status" AS ENUM('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."status";--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "status" SET DATA TYPE "public"."status" USING "status"::"public"."status";