ALTER TABLE "deployment_live_observation_manifests"
ADD CONSTRAINT "deployment_live_observation_manifests_status_payload_check"
CHECK (
  (
    "status" = 'valid'
    AND "manifest" IS NOT NULL
    AND jsonb_typeof("manifest") = 'object'
    AND "manifest"->>'schemaVersion' = '2'
    AND "invalid_reason" IS NULL
  )
  OR
  (
    "status" = 'manifest_invalid'
    AND "manifest" IS NULL
    AND "invalid_reason" IS NOT NULL
    AND length(btrim("invalid_reason")) > 0
  )
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "deployment_live_observation_manifests"
VALIDATE CONSTRAINT "deployment_live_observation_manifests_status_payload_check";
