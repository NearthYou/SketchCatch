CREATE TYPE "public"."project_asset_upload_status" AS ENUM('pending', 'uploaded');--> statement-breakpoint
ALTER TABLE "project_assets" ADD COLUMN "upload_status" "project_asset_upload_status" DEFAULT 'uploaded' NOT NULL;
