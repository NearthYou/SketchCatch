ALTER TABLE "reverse_engineering_scans" ALTER COLUMN "aws_connection_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "reverse_engineering_scans" DROP CONSTRAINT IF EXISTS "reverse_engineering_scans_aws_connection_id_aws_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "reverse_engineering_scans" ADD CONSTRAINT "reverse_engineering_scans_aws_connection_id_aws_connections_id_fk" FOREIGN KEY ("aws_connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE set null ON UPDATE no action;
