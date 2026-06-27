ALTER TABLE "aws_connections" DROP CONSTRAINT "aws_connections_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "aws_connections_project_id_idx";--> statement-breakpoint
ALTER TABLE "aws_connections" DROP COLUMN "project_id";