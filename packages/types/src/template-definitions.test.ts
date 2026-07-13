import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  TEMPLATE_IDS,
  templateDefinitions,
  type TemplateId
} from "./template-definitions.js";

test("the template registry contains the six deployable AWS patterns", () => {
  assert.deepEqual(templateDefinitions.map((definition) => definition.id), [...TEMPLATE_IDS]);
  assert.equal(templateDefinitions.length, 6);
  assert.ok(templateDefinitions.every((definition) => definition.resources.length > 0));
  assert.ok(templateDefinitions.every((definition) => definition.relationships.length > 0));
});

test("each template builds a deterministic, connected DiagramJson", () => {
  for (const templateId of TEMPLATE_IDS) {
    const first = buildTemplateDiagramJson(templateId, {
      projectSlug: "sketchcatch",
      shortId: "test01"
    });
    const second = buildTemplateDiagramJson(templateId, {
      projectSlug: "sketchcatch",
      shortId: "test01"
    });

    assert.deepEqual(first, second, templateId);
    assert.ok(first.nodes.length > 0, templateId);
    assert.ok(first.nodes.filter((node) => node.kind === "resource").every((node) => node.parameters), templateId);
    assert.ok(first.nodes.filter((node) => node.kind === "design").every((node) => !node.parameters), templateId);

    const nodeIds = new Set(first.nodes.map((node) => node.id));
    assert.ok(
      first.edges.every((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
      templateId
    );
    assert.ok(
      first.nodes
        .filter((node) => node.kind === "resource")
        .every((node) => node.parameters?.resourceName.startsWith("sketchcatch_")),
      templateId
    );
  }
});

test("template IDs are a closed union for registry lookup", () => {
  const templateId: TemplateId = "static-web-hosting";
  assert.equal(templateDefinitions.find((definition) => definition.id === templateId)?.id, templateId);
});

test("each template contains the resources required by its deployable default", () => {
  const definitions = new Map(templateDefinitions.map((definition) => [definition.id, definition]));
  const resourceTypes = (templateId: TemplateId) =>
    definitions.get(templateId)?.resources.map((resource) => resource.terraformResourceType) ?? [];

  const staticTypes = resourceTypes("static-web-hosting");
  for (const requiredType of [
      "aws_s3_bucket",
      "aws_s3_bucket_public_access_block",
      "aws_s3_bucket_policy",
      "aws_cloudfront_origin_access_control",
      "aws_cloudfront_distribution",
      "aws_s3_object"
  ]) {
    assert.ok(staticTypes.includes(requiredType), `static-web-hosting: ${requiredType}`);
  }

  const minimalTypes = resourceTypes("minimal-serverless-api");
  assert.ok(minimalTypes.includes("aws_cloudwatch_log_group"));
  assert.ok(minimalTypes.includes("aws_lambda_function"));

  const fullTypes = resourceTypes("full-serverless-web-app");
  for (const requiredType of [
    "aws_amplify_app",
    "aws_api_gateway_authorizer",
    "aws_api_gateway_method",
    "aws_api_gateway_integration",
    "aws_api_gateway_deployment",
    "aws_api_gateway_stage",
    "aws_lambda_permission"
  ]) {
    assert.ok(fullTypes.includes(requiredType), `full-serverless-web-app: ${requiredType}`);
  }

  const threeTierTypes = resourceTypes("three-tier-web-app");
  assert.equal(threeTierTypes.filter((resourceType) => resourceType === "aws_subnet").length, 6);
  for (const requiredType of [
    "aws_route_table",
    "aws_route_table_association",
    "aws_lb_target_group",
    "aws_lb_listener",
    "aws_db_subnet_group"
  ]) {
    assert.ok(threeTierTypes.includes(requiredType), `three-tier-web-app: ${requiredType}`);
  }

  const ecsTypes = resourceTypes("ecs-fargate-container-app");
  assert.equal(ecsTypes.filter((resourceType) => resourceType === "aws_subnet").length, 2);
  for (const requiredType of [
    "aws_internet_gateway",
    "aws_route_table",
    "aws_route_table_association",
    "aws_lb",
    "aws_lb_target_group",
    "aws_lb_listener",
    "aws_ecr_repository",
    "aws_cloudwatch_log_group"
  ]) {
    assert.ok(ecsTypes.includes(requiredType), `ecs-fargate-container-app: ${requiredType}`);
  }

  const ecsDefinition = definitions.get("ecs-fargate-container-app");
  const ecsTask = ecsDefinition?.resources.find((resource) => resource.id === "task");
  const ecsContainer = JSON.parse(String(ecsTask?.values.containerDefinitions))[0] as {
    image?: string;
    logConfiguration?: { logDriver?: string; options?: Record<string, string> };
  };
  const ecsRepositoryRelationship = ecsDefinition?.relationships.find(
    (relationship) => relationship.id === "repository-task"
  );
  assert.equal(ecsContainer.image, "public.ecr.aws/docker/library/nginx:stable");
  assert.equal(ecsRepositoryRelationship?.label, "optional image source");
  assert.equal(ecsContainer.logConfiguration?.logDriver, "awslogs");
  assert.equal(ecsContainer.logConfiguration?.options?.["awslogs-group"], "${@ref:log-group.name}");
  assert.equal(ecsContainer.logConfiguration?.options?.["awslogs-stream-prefix"], "ecs");

  const builtEcs = buildTemplateDiagramJson("ecs-fargate-container-app", {
    projectSlug: "sketchcatch",
    shortId: "test01"
  });
  const builtTask = builtEcs.nodes.find(
    (node) => node.parameters?.resourceType === "aws_ecs_task_definition"
  );
  const builtContainerDefinitions = String(builtTask?.parameters?.values.containerDefinitions);
  const builtContainer = JSON.parse(builtContainerDefinitions)[0] as {
    logConfiguration?: { options?: Record<string, string> };
  };

  assert.doesNotMatch(builtContainerDefinitions, /@ref:/);
  assert.equal(
    builtContainer.logConfiguration?.options?.["awslogs-group"],
    "${aws_cloudwatch_log_group.sketchcatch_log-group_test01.name}"
  );

  const eksTypes = resourceTypes("eks-container-app");
  assert.equal(eksTypes.filter((resourceType) => resourceType === "aws_subnet").length, 2);
  assert.ok(eksTypes.includes("aws_internet_gateway"));
  assert.ok(eksTypes.includes("aws_route_table"));
  assert.ok(eksTypes.includes("aws_route_table_association"));
  assert.ok(eksTypes.includes("aws_security_group"));
});

test("Lambda templates use an inline archive and least-privilege table policies", () => {
  for (const templateId of ["minimal-serverless-api", "full-serverless-web-app"] as const) {
    const definition = templateDefinitions.find((candidate) => candidate.id === templateId);
    const lambda = definition?.resources.find(
      (resource) => resource.terraformResourceType === "aws_lambda_function"
    );
    const rolePolicy = definition?.resources.find(
      (resource) => resource.terraformResourceType === "aws_iam_role_policy"
    );

    assert.equal(typeof lambda?.values.inlineSource, "string", templateId);
    assert.equal(lambda?.values.packageType, undefined, templateId);
    assert.doesNotMatch(String(rolePolicy?.values.policy), /"Resource":"\*"/, templateId);
  }
});
