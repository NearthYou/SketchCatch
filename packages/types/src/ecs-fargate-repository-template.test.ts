import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTemplateDiagramJson } from "./template-definitions.js";

test("repository ECS template includes full-stack delivery resources and runtime contract", () => {
  const diagram = buildTemplateDiagramJson("ecs-fargate-container-app", {
    projectSlug: "audience-live-check",
    shortId: "repository",
    includeFrontend: true,
    containerPort: 8080,
    healthCheckPath: "/health"
  });
  const nodes = diagram.nodes.filter((node) => node.kind === "resource");
  const byType = (resourceType: string) =>
    nodes.find((node) => node.parameters?.resourceType === resourceType);

  assert.ok(byType("aws_s3_bucket"));
  assert.ok(byType("aws_s3_bucket_public_access_block"));
  assert.ok(byType("aws_s3_object"));
  assert.ok(byType("aws_cloudfront_origin_access_control"));
  assert.ok(byType("aws_s3_bucket_policy"));

  const cloudFront = byType("aws_cloudfront_distribution");
  const targetGroup = byType("aws_lb_target_group");
  const task = byType("aws_ecs_task_definition");
  const service = byType("aws_ecs_service");
  const origins = cloudFront?.parameters?.values.origin as Array<{ originId?: string }> | undefined;
  const orderedBehaviors = cloudFront?.parameters?.values.orderedCacheBehavior as
    | Array<{ pathPattern?: string }>
    | undefined;

  assert.deepEqual(
    origins?.map((origin) => origin.originId),
    ["web-assets", "api-alb"]
  );
  assert.deepEqual(
    orderedBehaviors?.map((behavior) => behavior.pathPattern),
    ["/api/*", "/health"]
  );
  assert.equal(targetGroup?.parameters?.values.port, 8080);
  assert.deepEqual(targetGroup?.parameters?.values.healthCheck, {
    path: "/health",
    matcher: "200-399"
  });
  assert.equal(
    (service?.parameters?.values.loadBalancer as { containerPort?: number } | undefined)
      ?.containerPort,
    8080
  );
  assert.match(String(task?.parameters?.values.containerDefinitions), /listen 8080/);
  assert.match(String(task?.parameters?.values.containerDefinitions), /location = \/health/);
});
