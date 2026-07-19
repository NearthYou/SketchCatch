import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  createTemplateTerraformResourceNames,
  REPOSITORY_TEMPLATE_IDS,
  TEMPLATE_IDS,
  templateDefinitions,
  type RepositoryTemplateId,
  type TemplateDefinition,
  type TemplateId
} from "./template-definitions.js";

test("repository template IDs stay a separate six-template subset of gallery IDs", () => {
  const expectedRepositoryTemplateIds = [
    "static-web-hosting",
    "minimal-serverless-api",
    "full-serverless-web-app",
    "three-tier-web-app",
    "ecs-fargate-container-app",
    "eks-container-app"
  ] as const;
  const repositoryTemplateId: RepositoryTemplateId = "static-web-hosting";
  const galleryTemplateId: TemplateId = repositoryTemplateId;

  assert.deepEqual(REPOSITORY_TEMPLATE_IDS, expectedRepositoryTemplateIds);
  assert.notStrictEqual(REPOSITORY_TEMPLATE_IDS, TEMPLATE_IDS);
  assert.ok(REPOSITORY_TEMPLATE_IDS.every((templateId) => TEMPLATE_IDS.includes(templateId)));
  assert.deepEqual(
    REPOSITORY_TEMPLATE_IDS.map(
      (templateId) => templateDefinitions.find((definition) => definition.id === templateId)?.id
    ),
    expectedRepositoryTemplateIds
  );
  assert.equal(galleryTemplateId, repositoryTemplateId);
});

test("each template builds a deterministic, connected DiagramJson with short Terraform local names", () => {
  for (const templateId of REPOSITORY_TEMPLATE_IDS) {
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
    assert.ok(
      first.nodes.filter((node) => node.kind === "resource").every((node) => node.parameters),
      templateId
    );
    assert.ok(
      first.nodes.filter((node) => node.kind === "design").every((node) => !node.parameters),
      templateId
    );

    const nodeIds = new Set(first.nodes.map((node) => node.id));
    assert.ok(
      first.edges.every((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
      templateId
    );
    assert.ok(
      first.nodes
        .filter((node) => node.kind === "resource")
        .every((node) => /^[a-z_][a-z0-9_]*$/u.test(node.parameters?.resourceName ?? "")),
      templateId
    );
    assert.ok(
      first.nodes
        .filter((node) => node.kind === "resource")
        .every(
          (node) =>
            !node.parameters?.resourceName.includes("sketchcatch") &&
            !node.parameters?.resourceName.includes("test01")
        ),
      templateId
    );

    const withAnotherProject = buildTemplateDiagramJson(templateId, {
      projectSlug: "another-project",
      shortId: "another-template-instance"
    });
    assert.deepEqual(
      first.nodes.map((node) => node.parameters?.resourceName),
      withAnotherProject.nodes.map((node) => node.parameters?.resourceName),
      templateId
    );
  }
});

test("Terraform local names add a deterministic suffix only for normalization collisions in the same block", () => {
  const resources = [
    {
      id: "edge-name",
      terraformBlockType: "resource" as const,
      terraformResourceType: "aws_example"
    },
    {
      id: "edge_name",
      terraformBlockType: "resource" as const,
      terraformResourceType: "aws_example"
    },
    {
      id: "edge_name_1",
      terraformBlockType: "resource" as const,
      terraformResourceType: "aws_example"
    },
    { id: "edge name", terraformBlockType: "data" as const, terraformResourceType: "aws_example" },
    {
      id: "edge.name",
      terraformBlockType: "resource" as const,
      terraformResourceType: "aws_other"
    },
    {
      id: "123-start",
      terraformBlockType: "resource" as const,
      terraformResourceType: "aws_example"
    }
  ];

  const first = createTemplateTerraformResourceNames(resources);
  const second = createTemplateTerraformResourceNames([...resources].reverse());

  assert.match(first.get("edge-name") ?? "", /^edge_name_[a-z0-9]{6}$/u);
  assert.match(first.get("edge_name") ?? "", /^edge_name_[a-z0-9]{6}$/u);
  assert.notEqual(first.get("edge-name"), first.get("edge_name"));
  assert.equal(first.get("edge_name_1"), "edge_name_1");
  assert.equal(first.get("edge name"), "edge_name");
  assert.equal(first.get("edge.name"), "edge_name");
  assert.equal(first.get("123-start"), "resource_123_start");
  assert.equal(first.get("edge-name"), second.get("edge-name"));
  assert.equal(first.get("edge_name"), second.get("edge_name"));

  const extended = createTemplateTerraformResourceNames([
    ...resources,
    {
      id: "EDGE NAME",
      terraformBlockType: "resource" as const,
      terraformResourceType: "aws_example"
    }
  ]);
  assert.equal(first.get("edge-name"), extended.get("edge-name"));
  assert.equal(first.get("edge_name"), extended.get("edge_name"));
});

test("duplicate explicit Terraform local names fail deterministically in the same block", () => {
  const resources = [
    {
      id: "second",
      terraformBlockType: "resource" as const,
      terraformResourceName: "shared_name",
      terraformResourceType: "aws_example"
    },
    {
      id: "first",
      terraformBlockType: "resource" as const,
      terraformResourceName: "shared_name",
      terraformResourceType: "aws_example"
    }
  ];
  const expectedError = {
    name: "Error",
    message:
      'Duplicate explicit TemplateDefinition Terraform resource name "shared_name" in resource:aws_example: first, second'
  };

  assert.throws(() => createTemplateTerraformResourceNames(resources), expectedError);
  assert.throws(
    () => createTemplateTerraformResourceNames([...resources].reverse()),
    expectedError
  );
});

test("explicit Terraform local names win collisions while generated fallbacks receive suffixes", () => {
  const resources = [
    {
      id: "authored",
      terraformBlockType: "resource" as const,
      terraformResourceName: "edge_name",
      terraformResourceType: "aws_example"
    },
    {
      id: "edge-name",
      terraformBlockType: "resource" as const,
      terraformResourceType: "aws_example"
    }
  ];
  const first = createTemplateTerraformResourceNames(resources);
  const second = createTemplateTerraformResourceNames([...resources].reverse());

  assert.equal(first.get("authored"), "edge_name");
  assert.match(first.get("edge-name") ?? "", /^edge_name_[a-z0-9]{6}$/u);
  assert.equal(first.get("authored"), second.get("authored"));
  assert.equal(first.get("edge-name"), second.get("edge-name"));
});

test("a unique explicit Terraform local name remains exact in nodes and resolved references", () => {
  const explicitTemplate = {
    id: "explicit-name-contract" as TemplateId,
    title: "Explicit name contract",
    description: "Explicit Terraform identity fixture",
    tags: ["fixture"],
    providers: ["aws"],
    resources: [
      {
        id: "bucket",
        label: "Bucket",
        provider: "aws",
        terraformBlockType: "resource",
        terraformResourceType: "aws_s3_bucket",
        terraformResourceName: "captured_bucket",
        values: { bucket: "captured-bucket" },
        position: { x: 0, y: 0 }
      },
      {
        id: "consumer",
        label: "Consumer",
        provider: "aws",
        terraformBlockType: "resource",
        terraformResourceType: "aws_example",
        values: {
          bucketAddress: "@address:bucket",
          bucketId: "@ref:bucket.id"
        },
        position: { x: 80, y: 0 }
      }
    ],
    relationships: [],
    presentationNodes: [],
    presentationEdges: [],
    parameters: []
  } as unknown as TemplateDefinition;
  const mutableDefinitions = templateDefinitions as unknown as TemplateDefinition[];
  mutableDefinitions.push(explicitTemplate);

  try {
    const diagram = buildTemplateDiagramJson(explicitTemplate.id, {
      projectSlug: "contract",
      shortId: "explicit-name"
    });
    const bucket = diagram.nodes.find((node) => node.type === "aws_s3_bucket");
    const consumer = diagram.nodes.find((node) => node.type === "aws_example");

    assert.equal(bucket?.parameters?.resourceName, "captured_bucket");
    assert.equal(
      consumer?.parameters?.values.bucketAddress,
      "aws_s3_bucket.captured_bucket"
    );
    assert.equal(
      consumer?.parameters?.values.bucketId,
      "aws_s3_bucket.captured_bucket.id"
    );
  } finally {
    mutableDefinitions.splice(mutableDefinitions.indexOf(explicitTemplate), 1);
  }
});

test("Terraform local names stay compact after normalization and collision suffixing", () => {
  const longPrefix = "very-long-template-resource-name-that-should-never-leak-into-a-board-address";
  const names = createTemplateTerraformResourceNames([
    { id: `${longPrefix}-a`, terraformBlockType: "resource", terraformResourceType: "aws_example" },
    { id: `${longPrefix} a`, terraformBlockType: "resource", terraformResourceType: "aws_example" }
  ]);

  assert.ok([...names.values()].every((name) => name.length <= 48));
});

test("template labels and AWS-facing names stay separate from Terraform local names", () => {
  const diagram = buildTemplateDiagramJson("ecs-fargate-container-app", {
    projectSlug: "sketchcatch",
    shortId: "test01"
  });
  const subnet = diagram.nodes.find((node) => node.id.endsWith("-subnet-a"));
  const albSecurityGroup = diagram.nodes.find((node) => node.id.endsWith("-alb-security-group"));

  assert.equal(subnet?.label, "Public Subnet A");
  assert.equal(subnet?.parameters?.resourceName, "subnet_a");
  assert.equal(albSecurityGroup?.label, "ALB SG");
  assert.equal(albSecurityGroup?.parameters?.resourceName, "alb_security_group");
  assert.equal(albSecurityGroup?.parameters?.values.name, "fargate-alb");
});

test("ECS Fargate Board uses project-scoped runtime names", () => {
  const diagram = buildTemplateDiagramJson("ecs-fargate-container-app", {
    projectSlug: "Audience Live Check",
    shortId: "repository"
  });
  const values = (resourceType: string) => diagram.nodes.find(
    (node) => node.parameters?.resourceType === resourceType
  )?.parameters?.values;

  assert.equal(values("aws_ecr_repository")?.name, "audience-live-check-app");
  assert.equal(values("aws_ecs_cluster")?.name, "audience-live-check-cluster");
  assert.equal(values("aws_ecs_service")?.name, "audience-live-check-service");
  assert.equal(values("aws_ecs_task_definition")?.family, "audience-live-check-app");
  assert.equal(values("aws_cloudwatch_log_group")?.name, "/ecs/audience-live-check-app");
});

test("all built-in template references resolve through the final Terraform local-name map", () => {
  for (const templateId of REPOSITORY_TEMPLATE_IDS) {
    const diagram = buildTemplateDiagramJson(templateId, {
      projectSlug: "sketchcatch",
      shortId: "test01"
    });
    const serializedValues = JSON.stringify(
      diagram.nodes.flatMap((node) => node.parameters?.values ?? [])
    );

    assert.doesNotMatch(serializedValues, /@(?:ref|address):/u, templateId);
  }
});

test("repository template IDs are a closed union for registry lookup", () => {
  const templateId: RepositoryTemplateId = "static-web-hosting";
  assert.equal(templateDefinitions.find((definition) => definition.id === templateId)?.id, templateId);
});

test("each template contains the resources required by its deployable default", () => {
  const definitions = new Map(templateDefinitions.map((definition) => [definition.id, definition]));
  const resourceTypes = (templateId: RepositoryTemplateId) =>
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
    "aws_cloudfront_distribution",
    "aws_ecr_repository",
    "aws_cloudwatch_log_group",
    "aws_appautoscaling_target",
    "aws_appautoscaling_policy"
  ]) {
    assert.ok(ecsTypes.includes(requiredType), `ecs-fargate-container-app: ${requiredType}`);
  }

  const ecsDefinition = definitions.get("ecs-fargate-container-app");
  assert.ok(ecsDefinition?.description.includes("실시간 관측"));
  assert.ok(ecsDefinition?.tags.includes("CloudFront"));
  assert.ok(ecsDefinition?.tags.includes("Auto Scaling"));
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
  const builtScalingTarget = builtEcs.nodes.find(
    (node) => node.parameters?.resourceType === "aws_appautoscaling_target"
  );
  const builtScalingPolicy = builtEcs.nodes.find(
    (node) => node.parameters?.resourceType === "aws_appautoscaling_policy"
  );
  const builtCloudFront = builtEcs.nodes.find(
    (node) => node.parameters?.resourceType === "aws_cloudfront_distribution"
  );
  const builtContainerDefinitions = String(builtTask?.parameters?.values.containerDefinitions);
  const builtContainer = JSON.parse(builtContainerDefinitions)[0] as {
    logConfiguration?: { options?: Record<string, string> };
  };

  assert.doesNotMatch(builtContainerDefinitions, /@ref:/);
  assert.equal(
    builtContainer.logConfiguration?.options?.["awslogs-group"],
    "${aws_cloudwatch_log_group.log_group.name}"
  );
  assert.equal(
    builtEcs.edges.find((edge) => edge.id.endsWith("-target-group-service"))?.metadata
      ?.presentationRole,
    "primary"
  );
  assert.equal(
    builtEcs.edges.find((edge) => edge.id.endsWith("-task-log-group"))?.metadata?.presentationRole,
    "detail"
  );
  assert.equal(builtScalingTarget?.parameters?.values.minCapacity, 1);
  assert.equal(builtScalingTarget?.parameters?.values.maxCapacity, 3);
  assert.equal(
    builtScalingTarget?.parameters?.values.resourceId,
    "service/${aws_ecs_cluster.cluster.name}/${aws_ecs_service.service.name}"
  );
  assert.equal(
    (
      builtScalingPolicy?.parameters?.values
        .targetTrackingScalingPolicyConfiguration as { targetValue?: number } | undefined
    )?.targetValue,
    10
  );
  assert.equal(
    (
      builtScalingPolicy?.parameters?.values
        .targetTrackingScalingPolicyConfiguration as {
          predefinedMetricSpecification?: Array<{ resourceLabel?: string }>;
        } | undefined
    )?.predefinedMetricSpecification?.[0]?.resourceLabel,
    "${aws_lb.load_balancer.arn_suffix}/${aws_lb_target_group.target_group.arn_suffix}"
  );
  assert.equal(
    (
      builtCloudFront?.parameters?.values.origin as
        | Array<{ domainName?: string; originId?: string }>
        | undefined
    )?.[0]?.domainName,
    "aws_lb.load_balancer.dns_name"
  );
  assert.equal(
    (
      builtCloudFront?.parameters?.values.defaultCacheBehavior as
        | Array<{ targetOriginId?: string; viewerProtocolPolicy?: string }>
        | undefined
    )?.[0]?.targetOriginId,
    "fargate-alb"
  );
  assert.equal(
    (
      builtCloudFront?.parameters?.values.defaultCacheBehavior as
        | Array<{ viewerProtocolPolicy?: string }>
        | undefined
    )?.[0]?.viewerProtocolPolicy,
    "redirect-to-https"
  );
  assert.equal(builtCloudFront?.parameters?.values.orderedCacheBehavior, undefined);
  assert.ok(
    builtEcs.edges.some(
      (edge) =>
        edge.sourceNodeId.endsWith("-distribution") &&
        edge.targetNodeId.endsWith("-load-balancer")
    )
  );

  const eksTypes = resourceTypes("eks-container-app");
  assert.equal(eksTypes.filter((resourceType) => resourceType === "aws_subnet").length, 2);
  assert.ok(eksTypes.includes("aws_internet_gateway"));
  assert.ok(eksTypes.includes("aws_route_table"));
  assert.ok(eksTypes.includes("aws_route_table_association"));
  assert.ok(eksTypes.includes("aws_security_group"));
});

test("network templates keep gateways and route associations on their related boundaries", () => {
  for (const templateId of [
    "three-tier-web-app",
    "ecs-fargate-container-app",
    "eks-container-app"
  ] as const) {
    const definition = templateDefinitions.find((candidate) => candidate.id === templateId);
    const vpc = definition?.resources.find((resource) => resource.id === "vpc");
    const internetGateway = definition?.resources.find(
      (resource) => resource.id === "internet-gateway"
    );

    assert.ok(vpc, `${templateId}/vpc`);
    assert.ok(internetGateway, `${templateId}/internet-gateway`);
    assert.notEqual(
      internetGateway.parentResourceId,
      "vpc",
      `${templateId}/internet-gateway parent`
    );
    assert.ok(
      internetGateway.position.x < vpc.position.x,
      `${templateId}/internet-gateway left edge`
    );
    assert.ok(
      internetGateway.position.x + 48 > vpc.position.x,
      `${templateId}/internet-gateway must straddle the VPC boundary`
    );

    for (const association of definition.resources.filter(
      (resource) => resource.terraformResourceType === "aws_route_table_association"
    )) {
      const subnetReference = String(association.values.subnetId);
      const subnetId = subnetReference.match(/^@ref:([^.]+)\.id$/u)?.[1];
      const subnet = definition.resources.find((resource) => resource.id === subnetId);

      assert.ok(subnet, `${templateId}/${association.id} subnet`);
      assert.ok(
        association.position.y < subnet.position.y &&
          association.position.y + 48 > subnet.position.y,
        `${templateId}/${association.id} must straddle ${subnet.id}'s top boundary`
      );
    }
  }
});

test("security-group scopes enclose only their explicit targets without becoming parents", () => {
  const scopeTargets = {
    "three-tier-web-app": {
      "alb-security-group": ["load-balancer"],
      "app-security-group": ["launch-template", "application-group"],
      "db-security-group": ["database"]
    },
    "ecs-fargate-container-app": {
      "alb-security-group": ["load-balancer"],
      "task-security-group": ["service"]
    },
    "eks-container-app": {
      "cluster-security-group": ["cluster"]
    }
  } as const;

  for (const [templateId, targetsByScopeId] of Object.entries(scopeTargets)) {
    const definition = templateDefinitions.find((candidate) => candidate.id === templateId);

    assert.ok(definition, templateId);
    for (const [scopeId, targetIds] of Object.entries(targetsByScopeId)) {
      const scope = definition.resources.find((resource) => resource.id === scopeId);

      assert.ok(scope?.size, `${templateId}/${scopeId} scope size`);
      for (const targetId of targetIds) {
        const target = definition.resources.find((resource) => resource.id === targetId);

        assert.ok(target, `${templateId}/${targetId}`);
        assert.notEqual(target.parentResourceId, scopeId, `${templateId}/${targetId} parent`);
        assert.ok(
          target.position.x >= scope.position.x,
          `${templateId}/${scopeId}/${targetId} left`
        );
        assert.ok(
          target.position.y >= scope.position.y,
          `${templateId}/${scopeId}/${targetId} top`
        );
        assert.ok(
          target.position.x + 48 <= scope.position.x + scope.size.width,
          `${templateId}/${scopeId}/${targetId} right`
        );
        assert.ok(
          target.position.y + 48 <= scope.position.y + scope.size.height,
          `${templateId}/${scopeId}/${targetId} bottom`
        );
        assert.ok(
          definition.relationships.some(
            (relationship) =>
              relationship.sourceResourceId === scopeId &&
              relationship.targetResourceId === targetId
          ),
          `${templateId}/${scopeId} must connect to ${targetId}`
        );
      }
    }
  }
});

test("EKS separates the control plane security scope from its workload presentation group", () => {
  const definition = templateDefinitions.find((candidate) => candidate.id === "eks-container-app");
  const cluster = definition?.resources.find((resource) => resource.id === "cluster");
  const clusterSecurityGroup = definition?.resources.find(
    (resource) => resource.id === "cluster-security-group"
  );
  const workloadGroup = definition?.presentationNodes.find((node) => node.id === "workloads-group");
  const nodeGroup = definition?.resources.find((resource) => resource.id === "node-group");
  const namespace = definition?.resources.find((resource) => resource.id === "namespace");

  assert.ok(cluster);
  assert.equal(cluster.presentationArea, undefined);
  assert.equal(cluster.size, undefined);
  assert.equal(cluster.parentResourceId, "vpc");
  assert.ok(clusterSecurityGroup);
  assert.ok(workloadGroup);
  assert.equal(workloadGroup.catalogItemId, "design-group");
  assert.equal(workloadGroup.parentNodeId, "vpc");
  assert.equal(nodeGroup?.parentResourceId, "workloads-group");
  assert.equal(namespace?.parentResourceId, "workloads-group");
});

test("serverless templates keep their authored composition close to a 16:9 card", () => {
  for (const templateId of ["minimal-serverless-api", "full-serverless-web-app"] as const) {
    const definition = templateDefinitions.find((candidate) => candidate.id === templateId);

    assert.ok(definition, templateId);
    const bounds = [...definition.resources, ...definition.presentationNodes].map((node) => ({
      left: node.position.x,
      top: node.position.y,
      right: node.position.x + (node.size?.width ?? 48),
      bottom: node.position.y + (node.size?.height ?? 48)
    }));
    const width =
      Math.max(...bounds.map((bound) => bound.right)) -
      Math.min(...bounds.map((bound) => bound.left));
    const height =
      Math.max(...bounds.map((bound) => bound.bottom)) -
      Math.min(...bounds.map((bound) => bound.top));
    const aspectRatio = width / height;

    assert.ok(aspectRatio >= 1.75, `${templateId} is too tall: ${aspectRatio}`);
    assert.ok(aspectRatio <= 2.3, `${templateId} is too wide: ${aspectRatio}`);
  }
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
