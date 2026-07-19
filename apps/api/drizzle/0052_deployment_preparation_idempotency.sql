ALTER TABLE "deployments" ADD COLUMN "preparation_key" varchar(64);
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_preparation_key_check" CHECK ("deployments"."preparation_key" is null or "deployments"."preparation_key" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_project_preparation_active_unique" ON "deployments" USING btree ("project_id", "preparation_key") WHERE "deployments"."preparation_key" is not null and "deployments"."status" in ('PENDING', 'RUNNING') and "deployments"."approved_at" is null;
