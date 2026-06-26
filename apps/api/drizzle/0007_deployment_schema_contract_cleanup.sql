ALTER TYPE "public"."status" RENAME TO "deployment_status";--> statement-breakpoint
ALTER TYPE "public"."deployment_failure_stage" RENAME VALUE 'validation' TO 'validate';--> statement-breakpoint
ALTER TABLE "project_drafts" ADD COLUMN "id" varchar(36);--> statement-breakpoint
UPDATE "project_drafts" SET "id" = "project_id" WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "project_drafts" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_drafts" DROP CONSTRAINT "project_drafts_pkey";--> statement-breakpoint
ALTER TABLE "project_drafts" ADD CONSTRAINT "project_drafts_pkey" PRIMARY KEY ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_drafts_project_id_unique" ON "project_drafts" USING btree ("project_id");--> statement-breakpoint
UPDATE "project_drafts"
SET "diagram_json" = jsonb_set(
  "diagram_json",
  '{nodes}',
  coalesce(
    (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof("node") = 'object'
            AND jsonb_typeof("node" -> 'parameters') = 'object'
            AND (
              "node" ? 'resourceType'
              OR "node" ? 'resourceName'
              OR "node" ? 'terraformBlockType'
            )
            AND ("node" -> 'parameters') ? 'values'
            AND ("node" -> 'parameters') ? 'resourceType'
            AND ("node" -> 'parameters') ? 'resourceName'
          THEN "node" - 'resourceType' - 'resourceName' - 'terraformBlockType' - 'fileName'
          WHEN jsonb_typeof("node") = 'object'
            AND jsonb_typeof("node" -> 'parameters') = 'object'
            AND (
              "node" ? 'resourceType'
              OR "node" ? 'resourceName'
              OR "node" ? 'terraformBlockType'
            )
          THEN
            ("node" - 'resourceType' - 'resourceName' - 'terraformBlockType' - 'fileName')
            || jsonb_build_object(
              'parameters',
              jsonb_strip_nulls(
                jsonb_build_object(
                  'terraformBlockType',
                  coalesce("node" -> 'terraformBlockType', '"resource"'::jsonb),
                  'resourceType',
                  coalesce("node" -> 'resourceType', to_jsonb("node" ->> 'type')),
                  'resourceName',
                  coalesce(
                    "node" -> 'resourceName',
                    to_jsonb(coalesce(nullif("node" ->> 'label', ''), "node" ->> 'id'))
                  ),
                  'fileName',
                  coalesce("node" -> 'fileName', '"main"'::jsonb),
                  'values',
                  "node" -> 'parameters'
                )
              )
            )
          ELSE "node"
        END
        ORDER BY "ordinality"
      )
      FROM jsonb_array_elements("diagram_json" -> 'nodes') WITH ORDINALITY AS "nodes"("node", "ordinality")
    ),
    '[]'::jsonb
  )
)
WHERE jsonb_typeof("diagram_json" -> 'nodes') = 'array';--> statement-breakpoint
ALTER TABLE "deployments" RENAME COLUMN "approved_by" TO "approved_by_user_id";--> statement-breakpoint
UPDATE "deployments"
SET "approved_by_user_id" = NULL
WHERE "approved_by_user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "users"
    WHERE "users"."id" = "deployments"."approved_by_user_id"
  );--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "approved_by_user_id" SET DATA TYPE varchar(36);--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
WITH ordered_logs AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "deployment_id"
      ORDER BY "sequence", "created_at", "id"
    ) AS "next_sequence"
  FROM "deployment_logs"
)
UPDATE "deployment_logs"
SET "sequence" = "ordered_logs"."next_sequence"
FROM "ordered_logs"
WHERE "deployment_logs"."id" = "ordered_logs"."id";--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_logs_deployment_sequence_unique" ON "deployment_logs" USING btree ("deployment_id", "sequence");
