import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot,
  ArchitectureJson
} from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import type { AiTextProvider } from "./aiLlmExplanation.js";
import {
  ArchitectureDraftGenerationError,
  createAmazonQArchitectureDraftResponse,
  createArchitectureDraft,
  createDeterministicArchitectureIntentPlan,
  shouldWarmConfiguredAmazonQArchitectureDraftProvider
} from "./aiArchitectureDrafts.js";
import { analyzePreDeployment } from "./aiPreDeploymentAnalysis.js";

const confirmedCreditPolicy = {
  bedrock: false,
  amazonQ: true,
  transcribe: false,
  billingMode: "aws_credit_only"
} as const;

test("GitHub Actions handoff does not imply an AWS-native CI/CD pipeline", () => {
  const githubActionsPlan = createDeterministicArchitectureIntentPlan(
    "GitHub Actions builds an image, pushes to ECR, and deploys ECS. Do not substitute CodePipeline or CodeBuild."
  );
  const awsNativePlan = createDeterministicArchitectureIntentPlan(
    "Use CodeStar Connection, CodePipeline, CodeBuild, and CodeDeploy for delivery."
  );

  assert.equal(githubActionsPlan?.patternIds?.includes("github-cicd-codedeploy") ?? false, false);
  assert.equal(githubActionsPlan?.requiredResources?.includes("CODEPIPELINE") ?? false, false);
  assert.equal(awsNativePlan?.patternIds?.includes("github-cicd-codedeploy"), true);
  assert.equal(awsNativePlan?.requiredResources?.includes("CODEPIPELINE"), true);
});

test("fixed Template keeps its core resources and merges compatible answer-driven additions", () => {
  const result = createArchitectureDraft({
    prompt: [
      "Generate an API backend on the selected ECS Fargate Template.",
      "The selected Template is the highest-priority constraint.",
      "Include a managed relational database such as RDS and connect the backend workload to it.",
      "Do not include a public web frontend."
    ].join("\n"),
    templateId: "ecs-fargate-container-app"
  });

  assert.ok(
    result.architectureJson.nodes.some((node) =>
      node.id.startsWith("fixed-template-ecs-fargate-container-app-")
      && node.type === "ECS_SERVICE"
    )
  );
  assert.ok(result.architectureJson.nodes.some((node) => node.type === "RDS"));
  assert.equal(
    result.architectureJson.nodes.filter((node) => node.type === "ECS_SERVICE").length,
    1
  );
  const fixedVpc = result.architectureJson.nodes.find((node) =>
    node.id === "fixed-template-ecs-fargate-container-app-vpc"
  );
  const fixedService = result.architectureJson.nodes.find((node) =>
    node.id === "fixed-template-ecs-fargate-container-app-service"
  );
  const fixedSubnet = result.architectureJson.nodes.find((node) =>
    node.id === "fixed-template-ecs-fargate-container-app-subnet-a"
  );
  assert.equal(fixedVpc?.config.cidrBlock, "10.30.0.0/16");
  assert.equal(fixedVpc?.config.templateId, "ecs-fargate-container-app");
  assert.equal(fixedVpc?.config.values, undefined);
  assert.equal(
    fixedSubnet?.config.vpcId,
    "aws_vpc.fixed-template-ecs-fargate-container-app-vpc.id"
  );
  assert.equal(fixedService?.config.launchType, "FARGATE");
  assert.equal(fixedService?.config.desiredCount, 1);
  assert.equal(fixedService?.config.values, undefined);
  assert.equal(
    fixedService?.config.cluster,
    "aws_ecs_cluster.fixed-template-ecs-fargate-container-app-cluster.id"
  );
  assert.deepEqual(fixedService?.config.dependsOn, [
    "aws_lb_listener.fixed-template-ecs-fargate-container-app-listener"
  ]);
  assert.ok(
    result.architectureJson.edges.some((edge) => {
      const source = result.architectureJson.nodes.find((node) => node.id === edge.sourceId);
      const target = result.architectureJson.nodes.find((node) => node.id === edge.targetId);
      return new Set([source?.type, target?.type]).has("ECS_SERVICE")
        && new Set([source?.type, target?.type]).has("RDS");
    })
  );
});

test("fixed Template resolves data-source addresses with the Terraform data prefix", () => {
  const result = createArchitectureDraft({
    prompt: "Generate an API backend using the selected Template core.",
    templateId: "three-tier-web-app"
  });
  const launchTemplate = result.architectureJson.nodes.find((node) =>
    node.id === "fixed-template-three-tier-web-app-launch-template"
  );

  assert.equal(
    launchTemplate?.config.imageId,
    "data.aws_ami.fixed-template-three-tier-web-app-latest-ami.id"
  );
});

test("fixed Template keeps CI/CD resource parameters aligned with merged Terraform names", async () => {
  const provider = createFakeAmazonQProvider(createNormalizedRequirementPlan);
  const response = await createAmazonQArchitectureDraftResponse({
    prompt: [
      "Generate a production-quality Practice Architecture for a source repository.",
      "The selected Template is the highest-priority constraint.",
      "Selected Template: ecs-fargate-container-app.",
      "Required Components: preserve the selected ECS Fargate Template and add only compatible supporting resources.",
      "Include a managed relational database such as RDS.",
      "Include a Git/CI/CD handoff with CodeStar Connection, CodePipeline, CodeBuild, and an S3 artifact bucket.",
      "Include the API backend scope and omit a public web frontend.",
      "File upload: not required. Realtime transport: not required."
    ].join("\n"),
    templateId: "ecs-fargate-container-app"
  }, {
    provider,
    creditPolicy: confirmedCreditPolicy
  });
  assert.ok(!("status" in response));
  if ("status" in response) return;

  const countNodes = (type: ArchitectureJson["nodes"][number]["type"]): number =>
    response.architectureJson.nodes.filter((node) => node.type === type).length;
  const terraformNames = new Set(
    response.architectureJson.nodes
      .map((node) => node.config.terraformResourceName)
      .filter((name): name is string => typeof name === "string")
  );

  assert.ok(terraformNames.has("codebuild_service_role"));
  assert.ok(terraformNames.has("codepipeline_service_role"));
  assert.ok(terraformNames.has("codepipeline_artifacts"));
  assert.ok(terraformNames.has("github"));
  assert.ok(terraformNames.has("build"));
  assert.equal(countNodes("INTERNET_GATEWAY"), 1);
  assert.equal(countNodes("SUBNET"), 6);
  assert.equal(countNodes("ROUTE_TABLE"), 3);
  assert.equal(countNodes("ROUTE_TABLE_ASSOCIATION"), 6);
  assert.equal(countNodes("SECURITY_GROUP"), 3);
  assert.equal(countNodes("IAM_ROLE"), 4);
  assert.ok(!response.architectureJson.nodes.some((node) => node.id === "public-subnet-a"));
  assert.ok(!response.architectureJson.nodes.some((node) => node.id === "ecs-execution-role"));
  assert.doesNotMatch(JSON.stringify(response.architectureJson), /aws_vpc\.vpc_main\./u);
});

test("repository evidence strict mode keeps the Fargate diagram minimal and evidence-backed", async () => {
  const provider = createFakeAmazonQProvider(createNormalizedRequirementPlan);
  const response = await createAmazonQArchitectureDraftResponse({
    prompt: [
      "Generate a source repository architecture on the selected ECS Fargate Template.",
      "Repository architecture facts are authoritative.",
      "Use S3 and CloudFront for the static web frontend.",
      "Use ECR and one ECS Fargate task behind an ALB with /health on port 8080.",
      "Use CloudWatch for logs and metrics.",
      "GitHub Actions builds and deploys; do not substitute CodePipeline, CodeBuild, or CodeDeploy.",
      "No database, Redis, WebSocket, or authentication is required.",
      "Repository-inferred requirement profile:",
      "- Application type: web frontend and API backend detected as separate application units.",
      "- Traffic: not established by repository evidence; do not infer burst scaling.",
      "- Database: no persistent database required by explicit repository evidence.",
      "- Frontend: SPA frontend detected.",
      "- Backend: Express API in a container.",
      "- Primary region: ap-northeast-2 (Seoul) for the initial draft.",
      "- Budget: cost-conscious initial deployment.",
      "- HTTPS: TLS terminated at the Application Load Balancer.",
      "- File upload: not required.",
      "- Realtime features: not required.",
      "- Management preference: managed container runtime.",
      "- Performance target: not established by repository evidence.",
      "- Runtime scale: one runtime task; do not add autoscaling.",
      "- Traffic pattern: not established by repository evidence.",
      "- Availability target: not established by repository evidence.",
      "Required Components: preserve the selected ECS Fargate Template and add only evidence-backed resources.",
      "Architecture Flow: Browser to CloudFront and S3; Browser to ALB to ECS Fargate.",
      "Validation Checklist: keep the selected Template core visible and connected."
    ].join("\n"),
    templateId: "ecs-fargate-container-app",
    repositoryEvidence: {
      mode: "strict",
      repositoryName: "audience-live-check",
      facts: [
        { kind: "frontend_delivery", value: "s3_cloudfront_static", sourcePath: "README.md" },
        { kind: "backend_runtime", value: "ecs_fargate_service", sourcePath: "README.md" },
        { kind: "container_registry", value: "ecr", sourcePath: "README.md" },
        { kind: "traffic_entry", value: "application_load_balancer", sourcePath: "README.md" },
        { kind: "observability", value: "cloudwatch", sourcePath: "README.md" },
        { kind: "ci_cd", value: "github_actions", sourcePath: "README.md" },
        { kind: "health_check", value: "http:8080/health", sourcePath: "apps/api/Dockerfile" },
        { kind: "transport_security", value: "alb_tls_termination", sourcePath: "README.md" },
        { kind: "runtime_scale", value: "single_task", sourcePath: "README.md" },
        { kind: "excluded_capability", value: "database", sourcePath: "README.md" },
        { kind: "excluded_capability", value: "redis", sourcePath: "README.md" },
        { kind: "excluded_capability", value: "websocket", sourcePath: "README.md" },
        { kind: "excluded_capability", value: "authentication", sourcePath: "README.md" }
      ]
    }
  }, {
    provider,
    creditPolicy: confirmedCreditPolicy
  });

  assert.ok(!("status" in response));
  if ("status" in response) return;

  const countNodes = (type: ArchitectureJson["nodes"][number]["type"]): number =>
    response.architectureJson.nodes.filter((node) => node.type === type).length;
  const service = response.architectureJson.nodes.find((node) => node.type === "ECS_SERVICE");
  const targetGroup = response.architectureJson.nodes.find(
    (node) => node.type === "LOAD_BALANCER_TARGET_GROUP"
  );
  const listener = response.architectureJson.nodes.find(
    (node) => node.type === "LOAD_BALANCER_LISTENER"
  );
  const cloudFront = response.architectureJson.nodes.find(
    (node) =>
      node.type === "CLOUDFRONT" &&
      node.config.terraformResourceType !== "aws_cloudfront_origin_access_control"
  );
  const cloudFrontOac = response.architectureJson.nodes.find(
    (node) => node.config.terraformResourceType === "aws_cloudfront_origin_access_control"
  );
  const webBucket = response.architectureJson.nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
  );
  const webPublicAccess = response.architectureJson.nodes.find(
    (node) => node.config.terraformResourceType === "aws_s3_bucket_public_access_block"
  );
  const webBootstrap = response.architectureJson.nodes.find(
    (node) => node.config.terraformResourceType === "aws_s3_object"
  );
  const webBucketPolicy = response.architectureJson.nodes.find(
    (node) => node.config.terraformResourceType === "aws_s3_bucket_policy"
  );
  const taskDefinition = response.architectureJson.nodes.find(
    (node) => node.type === "ECS_TASK_DEFINITION"
  );
  const loadBalancer = response.architectureJson.nodes.find(
    (node) => node.type === "LOAD_BALANCER"
  );
  const albSecurityGroup = response.architectureJson.nodes.find(
    (node) => node.config.templateResourceId === "alb-security-group"
  );
  const taskSecurityGroup = response.architectureJson.nodes.find(
    (node) => node.config.templateResourceId === "task-security-group"
  );
  const executionPolicy = response.architectureJson.nodes.find(
    (node) => node.config.templateResourceId === "execution-policy"
  );
  const taskRole = response.architectureJson.nodes.find(
    (node) => node.config.templateResourceId === "task-role"
  );
  const publicSubnets = response.architectureJson.nodes.filter(
    (node) => node.type === "SUBNET" && node.config.mapPublicIpOnLaunch === true
  );
  const privateAppSubnets = response.architectureJson.nodes.filter(
    (node) => node.type === "SUBNET" && node.config.mapPublicIpOnLaunch === false
  );
  const fargateRuntime = response.architectureJson.nodes.find(
    (node) => node.id === "repository-fargate-runtime"
  );
  const vpc = response.architectureJson.nodes.find((node) => node.type === "VPC");
  const managedServices = response.architectureJson.nodes.find(
    (node) => node.label === "AWS Managed Services"
  );
  const labels = new Set(response.architectureJson.nodes.map((node) => node.label));
  const edgeLabels = new Set(response.architectureJson.edges.map((edge) => edge.label));

  assert.equal(countNodes("SUBNET"), 4);
  assert.equal(publicSubnets.length, 2);
  assert.equal(privateAppSubnets.length, 2);
  assert.equal(countNodes("S3"), 4);
  assert.equal(countNodes("CLOUDFRONT"), 2);
  assert.equal(countNodes("ECR_REPOSITORY"), 1);
  assert.equal(countNodes("CLOUDWATCH_LOG_GROUP"), 1);
  assert.equal(countNodes("ACM_CERTIFICATE"), 0);
  assert.equal(countNodes("UNKNOWN"), 4);
  assert.equal(countNodes("NAT_GATEWAY"), 1);
  assert.equal(countNodes("ELASTIC_IP"), 1);
  assert.equal(countNodes("APPLICATION_AUTO_SCALING_TARGET"), 0);
  assert.equal(countNodes("APPLICATION_AUTO_SCALING_POLICY"), 0);
  assert.equal(countNodes("CODESTAR_CONNECTION"), 0);
  assert.equal(countNodes("CODEPIPELINE"), 0);
  assert.equal(countNodes("CODEBUILD_PROJECT"), 0);
  assert.equal(countNodes("RDS"), 0);
  assert.equal(countNodes("ELASTICACHE_REDIS"), 0);
  assert.equal(countNodes("API_GATEWAY_WEBSOCKET_API"), 0);
  assert.equal(countNodes("COGNITO_USER_POOL"), 0);
  assert.deepEqual(
    [...((loadBalancer?.config.subnets as string[] | undefined) ?? [])].sort(),
    publicSubnets.map((node) => `aws_subnet.${node.id}.id`).sort()
  );
  assert.deepEqual(
    [...((service?.config.networkConfiguration as { subnets?: string[] } | undefined)?.subnets ?? [])].sort(),
    privateAppSubnets.map((node) => `aws_subnet.${node.id}.id`).sort()
  );
  assert.equal(
    (service?.config.networkConfiguration as { assignPublicIp?: boolean } | undefined)?.assignPublicIp,
    false
  );
  assert.equal(albSecurityGroup?.config.parentAreaNodeId, publicSubnets[0]?.id);
  assert.equal(loadBalancer?.config.parentAreaNodeId, albSecurityGroup?.id);
  assert.equal(taskSecurityGroup?.config.parentAreaNodeId, privateAppSubnets[0]?.id);
  assert.equal(fargateRuntime?.config.parentAreaNodeId, taskSecurityGroup?.id);
  assert.equal(fargateRuntime?.config.sketchcatchReferenceTerraform, true);
  assert.match(loadBalancer?.label ?? "", /Public A\/B/u);
  assert.match(fargateRuntime?.label ?? "", /Private App A\/B/u);
  assert.equal(service?.config.desiredCount, 1);
  assert.equal(
    (service?.config.loadBalancer as { containerPort?: number } | undefined)?.containerPort,
    8080
  );
  assert.deepEqual(targetGroup?.config.healthCheck, { path: "/health", matcher: "200-399" });
  assert.equal(listener?.config.port, 80);
  assert.equal(listener?.config.protocol, "HTTP");
  assert.deepEqual(cloudFront?.config.restrictions, [{
    geoRestriction: [{ restrictionType: "none" }]
  }]);
  assert.deepEqual(cloudFront?.config.viewerCertificate, [{
    cloudfrontDefaultCertificate: true
  }]);
  assert.equal((cloudFront?.config.origin as unknown[] | undefined)?.length, 2);
  assert.deepEqual(
    (cloudFront?.config.orderedCacheBehavior as Array<{ pathPattern?: string }> | undefined)?.map(
      (behavior) => behavior.pathPattern
    ),
    ["/api/*", "/health"]
  );
  assert.equal(cloudFrontOac?.config.signingBehavior, "always");
  assert.equal(cloudFrontOac?.config.signingProtocol, "sigv4");
  assert.deepEqual(
    [
      webPublicAccess?.config.blockPublicAcls,
      webPublicAccess?.config.blockPublicPolicy,
      webPublicAccess?.config.ignorePublicAcls,
      webPublicAccess?.config.restrictPublicBuckets
    ],
    [true, true, true, true]
  );
  assert.equal(webBootstrap?.config.key, "index.html");
  assert.equal(webBootstrap?.config.releaseManagedContent, true);
  assert.match(String(webBootstrap?.config.content), /Application deployment is in progress/u);
  assert.match(
    String(webBootstrap?.config.content),
    /SketchCatch is deploying the approved application release/u
  );
  assert.doesNotMatch(String(webBootstrap?.config.content), /GitHub Actions will replace/u);
  assert.equal(webBucket?.config.versioningEnabled, true);
  assert.match(String(webBucketPolicy?.config.policy), /cloudfront\.amazonaws\.com/u);
  assert.match(String(webBucketPolicy?.config.policy), /repository-cloudfront/u);
  assert.match(String(webBucket?.config.bucketPrefix), /^audience-live-check-web-/u);
  assert.match(String(taskDefinition?.config.containerDefinitions), /nginx:1\.27-alpine/u);
  assert.match(String(taskDefinition?.config.containerDefinitions), /\/health/u);
  const containerDefinitions = JSON.parse(
    String(taskDefinition?.config.containerDefinitions)
  ) as Array<{
    entryPoint?: string[];
    command?: string[];
    environment?: Array<{ name: string; value: string }>;
    logConfiguration?: { options?: Record<string, string> };
  }>;
  assert.deepEqual(containerDefinitions[0]?.entryPoint, ["/bin/sh", "-c"]);
  assert.equal(containerDefinitions[0]?.command?.length, 1);
  assert.match(
    containerDefinitions[0]?.command?.[0] ?? "",
    /default_type text\/plain;.*return 200 ok;.*exec nginx/u
  );
  assert.equal((containerDefinitions[0]?.command?.[0] ?? "").includes('\\"'), false);
  assert.deepEqual(containerDefinitions[0]?.environment, [
    { name: "PORT", value: "8080" },
    {
      name: "WEB_ORIGIN",
      value: "https://${aws_cloudfront_distribution.repository-cloudfront.domain_name}"
    },
    { name: "INSTANCE_ID", value: "fargate" }
  ]);
  assert.equal(
    containerDefinitions[0]?.logConfiguration?.options?.["awslogs-group"],
    "/ecs/audience-live-check-api"
  );
  assert.deepEqual(taskDefinition?.config.dependsOn, [
    "aws_cloudwatch_log_group.repository-ecs-logs"
  ]);
  assert.equal(taskDefinition?.config.family, "audience-live-check-api");
  assert.equal(service?.config.name, "audience-live-check-service");
  assert.equal(executionPolicy?.config.name, undefined);
  assert.equal(taskRole?.config.name, "audience-live-check-ecs-task");
  assert.ok(labels.has("Browser"));
  assert.ok(labels.has("GitHub Actions"));
  assert.ok(labels.has("AWS Managed Services"));
  assert.ok(
    managedServices !== undefined &&
    vpc !== undefined &&
    managedServices.positionY + Number(managedServices.config.diagramHeight) < vpc.positionY
  );
  assert.ok(edgeLabels.has("builds and pushes API image"));
  assert.ok(edgeLabels.has("uploads apps/web/dist"));
  assert.ok(edgeLabels.has("invalidates updated static assets"));
  assert.ok(edgeLabels.has("deploys task revision"));
  assert.ok(edgeLabels.has("health checks /health"));
  assert.ok(edgeLabels.has("HTTPS web and /api entry"));
  assert.ok(edgeLabels.has("proxies /api/* and /health to ALB over HTTP"));
  assert.ok(edgeLabels.has("ALB SG -> Task SG: TCP 8080 only"));
  assert.ok(edgeLabels.has("application revisions pull API image from ECR"));
  assert.ok(edgeLabels.has("writes ECS container logs via awslogs"));
  assert.equal(
    response.architectureJson.edges.filter(
      (edge) =>
        edge.sourceId === "repository-browser" && edge.targetId === cloudFront?.id
    ).length,
    1
  );
  assert.deepEqual(albSecurityGroup?.config.ingress, [{
    fromPort: 80,
    toPort: 80,
    protocol: "tcp",
    cidrBlocks: ["0.0.0.0/0"]
  }]);
  assert.deepEqual(taskSecurityGroup?.config.ingress, [{
    fromPort: 8080,
    toPort: 8080,
    protocol: "tcp",
    securityGroups: [`aws_security_group.${albSecurityGroup?.id}.id`]
  }]);
  assert.ok(
    response.metadata.assumptions.some((assumption) =>
      assumption.includes("CloudFront terminates public HTTPS") && assumption.includes("/api/*")
    )
  );
  assert.deepEqual(
    analyzePreDeployment(response.architectureJson).findings.filter(
      (finding) => finding.category === "configuration"
    ),
    []
  );
});

test("repository evidence strict mode does not create edges for unsupported delivery services", async () => {
  const provider = createFakeAmazonQProvider(createNormalizedRequirementPlan);
  const response = await createAmazonQArchitectureDraftResponse({
    prompt: [
      "website type: API server mobile app backend",
      "traffic: small traffic under daily 100 users concurrent 10",
      "database: no database required",
      "frontend technology: mobile app native client",
      "backend: simple API Node.js in one managed ECS Fargate task",
      "region: Korea only Seoul region ap-northeast-2",
      "monthly budget: under 10 manwon minimum cost",
      "SSL HTTPS: optional HTTP acceptable",
      "file upload: none",
      "realtime feature: none",
      "realtime notification transport: simple polling with cost warning",
      "management preference: managed container runtime",
      "loading time target: within 5 seconds",
      "website size: under 10MB",
      "traffic pattern: steady traffic",
      "downtime tolerance: monthly 8 hours within 99 availability"
    ].join("\n"),
    templateId: "ecs-fargate-container-app",
    repositoryEvidence: {
      mode: "strict",
      repositoryName: "api-only",
      facts: [
        { kind: "backend_runtime", value: "ecs_fargate_service", sourcePath: "README.md" },
        { kind: "traffic_entry", value: "application_load_balancer", sourcePath: "README.md" },
        { kind: "health_check", value: "http:8080/health", sourcePath: "Dockerfile" },
        { kind: "runtime_scale", value: "single_task", sourcePath: "README.md" }
      ]
    }
  }, {
    provider,
    creditPolicy: confirmedCreditPolicy
  });

  assert.ok(!("status" in response), JSON.stringify(response));
  if ("status" in response) return;

  const nodeIds = new Set(response.architectureJson.nodes.map((node) => node.id));
  assert.ok(response.architectureJson.edges.every(
    (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
  ));
  assert.equal(
    response.architectureJson.edges.some((edge) => edge.sourceId === "repository-cloudfront"),
    false
  );
  assert.equal(
    response.architectureJson.edges.some((edge) => edge.sourceId === "repository-github-actions"),
    false
  );
  const albSecurityGroupId = response.architectureJson.nodes.find(
    (node) => node.config.templateResourceId === "alb-security-group"
  )?.id;
  assert.ok(response.architectureJson.edges.some(
    (edge) =>
      edge.sourceId === "repository-browser" &&
      edge.targetId === albSecurityGroupId
  ));
});

test("createAmazonQArchitectureDraftResponse sends the web deployment answer path to Amazon Q", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider((request) => {
    callCount += 1;
    return createNormalizedRequirementPlan(request);
  });

  await createAmazonQArchitectureDraftResponse(
    {
      prompt: createDynamicWebDeploymentSelectionPrompt()
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.ok(callCount > 0);
});

test("selected Repository Template and follow-up answers reach Amazon Q without generic clarification", async () => {
  let callCount = 0;
  let requestedPayload: unknown;
  const provider = createFakeAmazonQProvider((request) => {
    callCount += 1;
    requestedPayload = request.payload;
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "Generate a production-quality Practice Architecture for a source repository.",
        "The selected Template is the highest-priority constraint.",
        "Selected Template: ecs-fargate-container-app.",
        "Required Components: preserve the selected ECS Fargate Template and add only compatible supporting resources.",
        "Include a managed relational database such as RDS.",
        "Include the API backend scope and omit a public web frontend.",
        "The user prefers direct host operations, but preserve the selected Template core."
      ].join("\n"),
      templateId: "ecs-fargate-container-app"
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 1);
  assert.ok(!("status" in response));
  const payload = requestedPayload as {
    fixedTemplateSelection?: { id?: string };
    prompt?: string;
  };
  assert.equal(payload.fixedTemplateSelection?.id, "ecs-fargate-container-app");
  assert.match(payload.prompt ?? "", /relational database/i);
});

test("createAmazonQArchitectureDraftResponse asks the next required website question before calling Amazon Q", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: "회사 소개용 웹사이트를 만들고 싶어요."
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "예상 트래픽 규모는?");
  assert.deepEqual(response.suggestions, [
    "소규모 (일 100명 미만, 동시 10명 미만)",
    "중간 규모 (일 1,000명, 동시 50명)",
    "대규모 (일 10,000명 이상, 동시 500명 이상)",
    "급변동 (평상시 적지만 이벤트 시 급증)"
  ]);
});

test("createAmazonQArchitectureDraftResponse asks deterministic clarifications before the Amazon Q availability gate", async () => {
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: "웹 앱 하나 만들고 싶어"
    },
    {
      creditPolicy: {
        bedrock: false,
        amazonQ: false,
        transcribe: false,
        billingMode: "disabled"
      }
    }
  );

  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "어떤 종류의 웹사이트인가요?");
  assert.ok((response.suggestions?.length ?? 0) > 0);
  assert.equal(response.providerMetadata.provider, "fallback");
});

test("deterministic clarification never claims Amazon Q provenance when credit is unavailable", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: "웹 앱 하나 만들고 싶어" },
    {
      provider,
      creditPolicy: {
        bedrock: false,
        amazonQ: false,
        transcribe: false,
        billingMode: "aws_credit_only"
      }
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.providerMetadata.provider, "fallback");
});

test("configured Amazon Q draft provider only warms after credit approval", () => {
  assert.equal(
    shouldWarmConfiguredAmazonQArchitectureDraftProvider({
      bedrock: false,
      amazonQ: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    }),
    false
  );
  assert.equal(shouldWarmConfiguredAmazonQArchitectureDraftProvider(confirmedCreditPolicy), true);
});

test("createAmazonQArchitectureDraftResponse treats Play Store app prompts as mobile app backend requests", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: "구글 플레이스토어에 올릴 앱 하나 만들고 싶어"
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.notEqual(response.question, "어떤 종류의 웹사이트인가요?");
  assert.equal(response.question, "예상 트래픽 규모는?");
});

test("createAmazonQArchitectureDraftResponse does not classify web app prompts as mobile app requests", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: "웹 앱 하나 만들고 싶어"
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "어떤 종류의 웹사이트인가요?");
});

test("createAmazonQArchitectureDraftResponse treats concurrent user capacity as traffic information", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)입니다.",
        "동접자 1000명은 버틸 수 있어야 돼."
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.question, "데이터베이스가 필요한가요?");
});

test("createAmazonQArchitectureDraftResponse asks clarification questions in the provided priority order", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");

  const answeredRequirements = [
    "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 HTML/CSS/JS만 (순수 웹)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다."
  ] as const;

  const orderedClarifications = [
    {
      question: "어떤 종류의 웹사이트인가요?",
      suggestions: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)",
        "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)",
        "SPA (Single Page Application) (React/Vue 등)",
        "API 서버 (모바일 앱 백엔드)"
      ]
    },
    {
      question: "예상 트래픽 규모는?",
      suggestions: [
        "소규모 (일 100명 미만, 동시 10명 미만)",
        "중간 규모 (일 1,000명, 동시 50명)",
        "대규모 (일 10,000명 이상, 동시 500명 이상)",
        "급변동 (평상시 적지만 이벤트 시 급증)"
      ]
    },
    {
      question: "데이터베이스가 필요한가요?",
      suggestions: [
        "필요 없음 (정적 콘텐츠만)",
        "간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
        "중간 규모 데이터 (10GB ~ 100GB)",
        "대용량 데이터 (100GB 이상, 복잡한 쿼리)"
      ]
    },
    {
      question: "프론트엔드 기술은?",
      suggestions: [
        "HTML/CSS/JS만 (순수 웹)",
        "React/Vue/Angular (SPA 프레임워크)",
        "Next.js/Nuxt.js (SSR 필요)",
        "모바일 앱 (웹뷰 또는 네이티브)"
      ]
    },
    {
      question: "백엔드가 필요한가요?",
      suggestions: [
        "필요 없음 (정적 사이트)",
        "간단한 API (Node.js, Python Flask 등)",
        "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
        "마이크로서비스 (여러 서비스 분리)"
      ]
    },
    {
      question: "주요 사용자 지역은?",
      suggestions: [
        "한국만 (서울 리전)",
        "아시아 태평양 (도쿄, 싱가포르 포함)",
        "글로벌 (미국, 유럽 포함)",
        "특정 지역 (중국, 일본 등)"
      ]
    },
    {
      question: "월 예산 범위는?",
      suggestions: [
        "10만원 미만 (최소 비용)",
        "10-50만원 (적당한 성능)",
        "50-200만원 (고성능)",
        "200만원 이상 (엔터프라이즈급)"
      ]
    },
    {
      question: "SSL 인증서(HTTPS)가 필요한가요?",
      suggestions: [
        "필수 (보안 중요)",
        "선택사항 (HTTP도 괜찮음)",
        "모르겠음 (추천해주세요)"
      ]
    },
    {
      question: "파일 업로드 기능이 있나요? (이미지, 문서 등)",
      suggestions: [
        "없음 (텍스트만)",
        "이미지만 (프로필, 게시글 이미지)",
        "다양한 파일 (문서, 동영상 포함)",
        "대용량 파일 (100MB 이상)"
      ]
    },
    {
      question: "실시간 기능이 필요한가요? (채팅, 알림 등)",
      suggestions: [
        "필요 없음",
        "실시간 채팅",
        "실시간 알림",
        "실시간 데이터 업데이트 (주식, 게임 등)"
      ]
    },
    {
      question: "관리 복잡도 선호도는?",
      suggestions: [
        "완전 관리형 (서버리스, 관리 최소화)",
        "반관리형 (일부 서버 관리)",
        "직접 관리 (서버 직접 운영)",
        "모르겠음 (추천해주세요)"
      ]
    },
    {
      question: "페이지 로딩 시간 목표는?",
      suggestions: [
        "1초 이내 (매우 빠름)",
        "3초 이내 (적당함)",
        "5초 이내 (느려도 괜찮음)",
        "상관없음"
      ]
    },
    {
      question: "전체 웹사이트 크기는?",
      suggestions: [
        "10MB 미만 (간단한 사이트)",
        "10MB-100MB (일반적인 사이트)",
        "100MB-1GB (이미지 많은 사이트)",
        "1GB 이상 (동영상 포함)"
      ]
    },
    {
      question: "트래픽 패턴은?",
      suggestions: [
        "일정함 (하루 종일 비슷)",
        "시간대별 차이 (낮에 많음)",
        "이벤트성 급증 (특정 시기에만)",
        "예측 불가"
      ]
    },
    {
      question: "서비스 중단 허용 시간은?",
      suggestions: [
        "절대 안됨 (99.99% 가용성)",
        "월 1시간 이내 (99.9% 가용성)",
        "월 8시간 이내 (99% 가용성)",
        "상관없음"
      ]
    }
  ] as const;

  const promptsAndQuestions = orderedClarifications.map((clarification, answeredCount) => ({
    prompt:
      answeredCount === 0
        ? "웹사이트를 만들고 싶어요."
        : answeredRequirements.slice(0, answeredCount).join("\n"),
    ...clarification
  }));

  for (const scenario of promptsAndQuestions) {
    const response = await createAmazonQArchitectureDraftResponse(
      {
        prompt: scenario.prompt
      },
      {
        provider,
        creditPolicy: confirmedCreditPolicy
      }
    );

    if (!("status" in response)) {
      assert.fail(`Expected clarification for question: ${scenario.question}`);
    }

    assert.equal(response.question, scenario.question);
    assert.deepEqual(response.suggestions, scenario.suggestions);
  }
});

test("createAmazonQArchitectureDraftResponse returns the Amazon Q architecture preview when requirements are complete", async () => {
  let requestedPrompt = "";
  let requestedPayload: unknown;
  const progressSnapshots: ArchitectureDraftProgressSnapshot[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompt = request.prompt;
    requestedPayload = request.payload;
    return JSON.stringify({
      status: "preview",
      title: "Cost Optimized Static Site",
      architectureJson: {
        nodes: [
          {
            id: "site-bucket",
            type: "S3",
            label: "Static Website Bucket",
            positionX: 120,
            positionY: 180,
            config: {
              versioning: true
            }
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 360,
            positionY: 180,
            config: {
              priceClass: "PriceClass_200"
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-site",
            sourceId: "cdn",
            targetId: "site-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: sampleRequirementCoverage(["site-bucket", "cdn"]),
      assumptions: ["Korea users and low budget favor Seoul-region AWS services."],
      explanations: ["S3 and CloudFront avoid server management for static content."],
      summary: "Amazon Q recommended a managed static delivery path.",
      highlights: ["Low operational overhead", "HTTPS-ready CDN"],
      nextActions: ["Review domain and SSL certificate requirements."]
    });
  });

  const prompt = [
    "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 HTML/CSS/JS만 (순수 웹)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy,
      onProgress: (snapshot) => progressSnapshots.push(snapshot)
    }
  );

  assert.ok(!("status" in response));
  assert.match(requestedPrompt, /정적 사이트/);
  assert.match(requestedPrompt, /Do not artificially limit the architecture to one resource per type/);
  assert.match(requestedPrompt, /ArchitectureDecisionSpace/);
  assert.match(requestedPrompt, /static_cdn_site/);
  assert.match(requestedPrompt, /hardConstraints/);
  assert.match(requestedPrompt, /preferredPatterns/);
  assert.match(requestedPrompt, /coverageRequirements/);
  assert.match(requestedPrompt, /not a fixed skeleton/);
  assert.doesNotMatch(requestedPrompt, /Clarification choice mapping rules/);
  const payload = requestedPayload as {
    architectureDecisionSpace?: {
      answerProfile?: {
        traffic?: string;
        frontend?: string;
        region?: string;
        upload?: string;
        realtime?: string;
        management?: string;
        availability?: string;
        budget?: string;
      };
      hardConstraints?: string[];
      preferredPatterns?: Array<{ id?: string; typicalNodeTypes?: string[] }>;
    };
  };
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.traffic, "medium");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.frontend, "static");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.region, "korea");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.upload, "none");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.realtime, "none");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.management, "fully_managed");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.availability, "99.9");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.budget, "low");
  assert.ok(payload.architectureDecisionSpace?.hardConstraints?.some((constraint) => /Database not required/.test(constraint)));
  assert.ok(payload.architectureDecisionSpace?.preferredPatterns?.some((pattern) => pattern.id === "static_cdn_site"));
  assert.equal(response.metadata.source, "amazon_q");
  assert.equal(response.title, "Cost Optimized Static Site");
  assert.equal(response.architectureJson.nodes[0]?.type, "S3");
  assert.equal(response.llmExplanation?.fallbackUsed, false);
  assert.equal(response.llmExplanation?.providerMetadata?.provider, "amazon_q");
  assert.deepEqual(progressSnapshots.map(({ sequence }) => sequence), [1]);
  assert.ok(
    progressSnapshots.every(
      (snapshot) => snapshot.provisionalArchitectureJson.nodes.length > 0
    )
  );
  assert.ok(
    progressSnapshots.every(
      (snapshot) =>
        Array.isArray(snapshot.excludableCandidateIds)
        && Object.hasOwn(snapshot, "provisionalArchitectureJson")
    )
  );
  assert.deepEqual(Object.keys(progressSnapshots[0]!).sort(), [
    "excludableCandidateIds",
    "provisionalArchitectureJson",
    "sequence"
  ]);
});

test("createAmazonQArchitectureDraftResponse applies an exact server-authorized exclusion to provisional and final graphs", async () => {
  const prompt = createMultiCandidateDraftPrompt();
  const baseline = createArchitectureDraft({ prompt });
  const candidate = baseline.architectureJson.nodes.find(({ type }) => type === "SQS_QUEUE");
  assert.ok(candidate);
  const progressSnapshots: ArchitectureDraftProgressSnapshot[] = [];
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt,
      candidateExclusions: [
        {
          candidateId: candidate.id,
          resourceType: candidate.type,
          label: candidate.label ?? candidate.type
        }
      ]
    },
    {
      creditPolicy: confirmedCreditPolicy,
      onProgress: (snapshot) => progressSnapshots.push(snapshot)
    }
  );

  assert.ok(!("status" in response));
  if ("status" in response) return;

  assert.equal(response.architectureJson.nodes.some((node) => node.type === candidate.type), false);
  assertGraphHasNoDanglingEdges(response.architectureJson);
  assert.ok(
    response.metadata.assumptions.some((assumption) =>
      assumption.includes(candidate.type)
    )
  );
  assert.ok(
    response.metadata.explanations.some((explanation) =>
      explanation.includes(candidate.id)
    )
  );

  const provisionalSnapshots = progressSnapshots.filter(
    (snapshot) => snapshot.provisionalArchitectureJson !== null
  );
  assert.ok(provisionalSnapshots.length > 0);
  for (const snapshot of provisionalSnapshots) {
    assert.equal(
      snapshot.provisionalArchitectureJson?.nodes.some((node) => node.type === candidate.type),
      false
    );
    assert.equal(snapshot.excludableCandidateIds.includes("ecs-service"), false);
    assert.equal(snapshot.excludableCandidateIds.includes("ecs-task-definition"), false);
    assertGraphHasNoDanglingEdges(snapshot.provisionalArchitectureJson!);
  }
});

test("candidate exclusions ignore forged ids and mismatched types or labels", () => {
  const prompt = createMultiCandidateDraftPrompt();
  const baseline = createArchitectureDraft({ prompt });
  const candidate = baseline.architectureJson.nodes.find(({ type }) => type === "SQS_QUEUE");
  assert.ok(candidate);

  const invalidExclusions: ArchitectureDraftCandidateExclusion[] = [
    {
      candidateId: "forged-candidate-id",
      resourceType: candidate.type,
      label: candidate.label ?? candidate.type
    },
    {
      candidateId: candidate.id,
      resourceType: "CODEBUILD_PROJECT",
      label: candidate.label ?? candidate.type
    },
    {
      candidateId: candidate.id,
      resourceType: candidate.type,
      label: "Mismatched Candidate Label"
    }
  ];

  for (const candidateExclusion of invalidExclusions) {
    const result = createArchitectureDraft({
      prompt,
      candidateExclusions: [candidateExclusion]
    });

    assert.deepEqual(result.architectureJson, baseline.architectureJson);
  }
});

test("candidate exclusions ignore stale candidates issued for a different draft", () => {
  const staleCandidate = createArchitectureDraft({
    prompt: createStaticPortfolioQuestionnairePrompt()
  }).architectureJson.nodes.find(({ type }) => type === "S3");
  assert.ok(staleCandidate);
  const prompt = createStructuralCandidateDraftPrompt();
  const baseline = createArchitectureDraft({ prompt });
  assert.ok(baseline.architectureJson.nodes.some(({ type }) => type === "S3"));

  const result = createArchitectureDraft({
    prompt,
    candidateExclusions: [
      {
        candidateId: staleCandidate.id,
        resourceType: staleCandidate.type,
        label: staleCandidate.label ?? staleCandidate.type
      }
    ]
  });

  assert.deepEqual(result.architectureJson, baseline.architectureJson);
});

test("structural draft resources are never exposed or accepted as excludable candidates", async () => {
  const prompt = createStructuralCandidateDraftPrompt();
  const baseline = createArchitectureDraft({ prompt });
  const structuralCandidate = baseline.architectureJson.nodes.find(({ type }) => type === "VPC");
  const referencedCandidate = baseline.architectureJson.nodes.find(({ type }) => type === "S3");
  const leafCandidate = baseline.architectureJson.nodes.find(
    ({ type }) => type === "CLOUDWATCH_METRIC_ALARM"
  );
  assert.ok(structuralCandidate);
  assert.ok(referencedCandidate);
  assert.ok(leafCandidate);
  const progressSnapshots: ArchitectureDraftProgressSnapshot[] = [];

  const result = await createAmazonQArchitectureDraftResponse(
    {
      prompt,
      candidateExclusions: [
        {
          candidateId: structuralCandidate.id,
          resourceType: structuralCandidate.type,
          label: structuralCandidate.label ?? structuralCandidate.type
        }
      ]
    },
    {
      creditPolicy: confirmedCreditPolicy,
      onProgress: (snapshot) => progressSnapshots.push(snapshot)
    }
  );

  assert.ok(!("status" in result));
  if ("status" in result) return;
  assert.deepEqual(result.architectureJson, baseline.architectureJson);
  const candidateSnapshot = progressSnapshots.find(
    ({ provisionalArchitectureJson }) => provisionalArchitectureJson !== null
  );
  assert.ok(candidateSnapshot);
  assert.equal(candidateSnapshot.excludableCandidateIds.includes(structuralCandidate.id), false);
  assert.equal(candidateSnapshot.excludableCandidateIds.includes(referencedCandidate.id), false);
  assert.equal(candidateSnapshot.excludableCandidateIds.includes(leafCandidate.id), true);
});

test("candidate exclusions reject a resource that surviving config still references", () => {
  const prompt = createStructuralCandidateDraftPrompt();
  const baseline = createArchitectureDraft({ prompt });
  const referencedCandidate = baseline.architectureJson.nodes.find(({ type }) => type === "S3");
  assert.ok(referencedCandidate);
  assert.ok(
    baseline.architectureJson.nodes.some(
      ({ config }) => config.originResourceId === referencedCandidate.id
    )
  );

  const result = createArchitectureDraft({
    prompt,
    candidateExclusions: [
      {
        candidateId: referencedCandidate.id,
        resourceType: referencedCandidate.type,
        label: referencedCandidate.label ?? referencedCandidate.type
      }
    ]
  });

  assert.deepEqual(result.architectureJson, baseline.architectureJson);
});

test("one exact candidate tuple authorizes the documented resource-type exclusion constraint", () => {
  const prompt = createStructuralCandidateDraftPrompt();
  const baseline = createArchitectureDraft({ prompt });
  const sameTypeCandidates = baseline.architectureJson.nodes.filter(
    ({ type }) => type === "CLOUDFRONT"
  );
  assert.ok(sameTypeCandidates.length > 1);
  const candidate = sameTypeCandidates[0];
  assert.ok(candidate);

  const result = createArchitectureDraft({
    prompt,
    candidateExclusions: [
      {
        candidateId: candidate.id,
        resourceType: candidate.type,
        label: candidate.label ?? candidate.type
      }
    ]
  });

  assert.equal(result.architectureJson.nodes.some(({ type }) => type === candidate.type), false);
  assertGraphHasNoDanglingEdges(result.architectureJson);
});

test("candidate exclusions fall back to the unfiltered graph when combined removal would empty the draft", () => {
  const prompt = createSafeCandidateOnlyDraftPrompt();
  const baseline = createArchitectureDraft({ prompt });
  assert.ok(baseline.architectureJson.nodes.length > 1);

  const result = createArchitectureDraft({
    prompt,
    candidateExclusions: baseline.architectureJson.nodes.map((candidate) => ({
      candidateId: candidate.id,
      resourceType: candidate.type,
      label: candidate.label ?? candidate.type
    }))
  });

  assert.deepEqual(result.architectureJson, baseline.architectureJson);
  assertGraphHasNoDanglingEdges(result.architectureJson);
  assert.ok(
    result.metadata.explanations.some((explanation) =>
      explanation.includes("적용하지")
    )
  );
});

test("authorized candidate exclusions are sent to Amazon Q and override matching earlier requirements", async () => {
  const prompt = createStaticPortfolioWithOptionalQueuePrompt();
  const baseline = createArchitectureDraft({ prompt });
  const candidate = baseline.architectureJson.nodes.find(({ type }) => type === "SQS_QUEUE");
  assert.ok(candidate);
  const requestedPrompts: string[] = [];
  const requestedPayloads: unknown[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    requestedPayloads.push(request.payload);
    return createStaticProviderPreview(false);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt,
      candidateExclusions: [
        {
          candidateId: candidate.id,
          resourceType: candidate.type,
          label: candidate.label ?? candidate.type
        }
      ]
    },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  assert.ok(!("status" in response));
  if ("status" in response) return;
  assert.equal(requestedPrompts.length, 1);
  assert.match(requestedPrompts[0] ?? "", /Server-authorized Draft Candidate Exclusions/);
  assert.match(requestedPrompts[0] ?? "", /sqs-queue/);
  assert.deepEqual(
    (requestedPayloads[0] as { candidateExclusions?: unknown }).candidateExclusions,
    [
      {
        candidateId: candidate.id,
        resourceType: candidate.type,
        label: candidate.label ?? candidate.type
      }
    ]
  );
  assert.equal(response.architectureJson.nodes.some(({ type }) => type === candidate.type), false);
});

test("Amazon Q previews that violate an authorized candidate exclusion are retried", async () => {
  const prompt = createStaticPortfolioWithOptionalQueuePrompt();
  const baseline = createArchitectureDraft({ prompt });
  const candidate = baseline.architectureJson.nodes.find(({ type }) => type === "SQS_QUEUE");
  assert.ok(candidate);
  const requestedPrompts: string[] = [];
  let callCount = 0;
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    callCount += 1;
    return createStaticProviderPreview(callCount === 1);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt,
      candidateExclusions: [
        {
          candidateId: candidate.id,
          resourceType: candidate.type,
          label: candidate.label ?? candidate.type
        }
      ]
    },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  assert.ok(!("status" in response));
  if ("status" in response) return;
  assert.equal(callCount, 2);
  assert.match(requestedPrompts[1] ?? "", /violates the server-authorized candidate exclusion/);
  assert.equal(response.architectureJson.nodes.some(({ type }) => type === candidate.type), false);
});

test("Amazon Q cannot satisfy combined authorized exclusions with an empty final graph", async () => {
  const prompt = createStaticPortfolioWithOptionalQueuePrompt();
  const baseline = createArchitectureDraft({ prompt });
  const candidates = baseline.architectureJson.nodes.filter(({ type }) =>
    type === "S3" || type === "SQS_QUEUE"
  );
  assert.equal(candidates.length, 2);
  let callCount = 0;
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    callCount += 1;
    return JSON.stringify({
      status: "preview",
      title: "Empty Exclusion Result",
      architectureJson: { nodes: [], edges: [] },
      requirementCoverage: sampleRequirementCoverage(),
      assumptions: ["All excluded candidates were removed."],
      explanations: ["No alternative topology was selected."]
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt,
      candidateExclusions: candidates.map((candidate) => ({
        candidateId: candidate.id,
        resourceType: candidate.type,
        label: candidate.label ?? candidate.type
      }))
    },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  assert.ok(!("status" in response));
  if ("status" in response) return;
  assert.equal(callCount, 2);
  assert.match(requestedPrompts[1] ?? "", /must contain at least one usable ResourceNode/);
  assert.deepEqual(response.architectureJson, baseline.architectureJson);
  assert.equal(response.llmExplanation?.fallbackUsed, true);
  assert.equal(response.llmExplanation?.fallbackReason, "invalid_response");
});

test("provider fallback still emits a candidate-bearing progress snapshot before the final draft", async () => {
  const progressSnapshots: ArchitectureDraftProgressSnapshot[] = [];
  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createStaticPortfolioQuestionnairePrompt() },
    {
      creditPolicy: confirmedCreditPolicy,
      onProgress: (snapshot) => progressSnapshots.push(snapshot)
    }
  );

  assert.ok(!("status" in response));
  if ("status" in response) return;

  const candidateSnapshot = progressSnapshots.find(
    ({ provisionalArchitectureJson }) => provisionalArchitectureJson.nodes.length > 0
  );
  assert.ok(candidateSnapshot);
  assert.deepEqual(
    candidateSnapshot.provisionalArchitectureJson,
    response.architectureJson
  );
  assert.deepEqual(
    candidateSnapshot.excludableCandidateIds,
    []
  );
});

test("candidate exclusions only apply to the exact server-issued id, type, and label tuple", async () => {
  const progressSnapshots: ArchitectureDraftProgressSnapshot[] = [];
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createStaticPortfolioQuestionnairePrompt(),
      candidateExclusions: [
        {
          candidateId: "forged-candidate-id",
          resourceType: "S3",
          label: "Static Website Bucket"
        }
      ]
    },
    {
      creditPolicy: confirmedCreditPolicy,
      onProgress: (snapshot) => progressSnapshots.push(snapshot)
    }
  );

  assert.ok(!("status" in response));
  if ("status" in response) return;

  assert.equal(response.architectureJson.nodes.some(({ type }) => type === "S3"), true);
  assert.equal(
    progressSnapshots.some((snapshot) =>
      snapshot.provisionalArchitectureJson.nodes.some(({ type }) => type === "S3")
    ),
    true
  );
});

test("createAmazonQArchitectureDraftResponse keeps progress reporting observational", async () => {
  let progressCallbackCount = 0;
  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createStaticPortfolioQuestionnairePrompt() },
    {
      provider: createFakeAmazonQProvider(createNormalizedRequirementPlan),
      creditPolicy: confirmedCreditPolicy,
      onProgress: () => {
        progressCallbackCount += 1;
        throw new Error("progress consumer failed");
      }
    }
  );

  assert.ok(!("status" in response));
  assert.equal(progressCallbackCount, 1);
});

test("createAmazonQArchitectureDraftResponse keeps candidate exclusion failures observational", async () => {
  const candidateExclusions = new Proxy<ArchitectureDraftCandidateExclusion[]>([], {
    get(target, property, receiver) {
      if (property === "length") {
        throw new Error("candidate exclusions unavailable");
      }
      return Reflect.get(target, property, receiver);
    }
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createStaticPortfolioQuestionnairePrompt(),
      candidateExclusions
    },
    {
      provider: createFakeAmazonQProvider(createNormalizedRequirementPlan),
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.ok(!("status" in response));
});

test("createAmazonQArchitectureDraftResponse materializes a compact Amazon Q architecture plan", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "plan",
      title: "Amazon Q ALB Fleet",
      requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2"],
      resourceQuantities: { EC2: 3 },
      runtimeTopology: {
        trafficEntry: "LOAD_BALANCER",
        compute: "EC2",
        computeCount: 3,
        placement: "private_subnets",
        spreadAcrossPrivateSubnets: true,
        autoScaling: true
      },
      assumptions: ["The application runtime is managed as an EC2 fleet."],
      explanations: ["Amazon Q selected ALB and Auto Scaling for burst traffic."]
    })
  );

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createDynamicWebDeploymentSelectionPrompt()
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const nodesByType = new Map<string, string[]>();
  for (const node of response.architectureJson.nodes) {
    nodesByType.set(node.type, [...(nodesByType.get(node.type) ?? []), node.id]);
  }
  const loadBalancerId = nodesByType.get("LOAD_BALANCER")?.[0];
  const autoScalingGroupId = nodesByType.get("AUTO_SCALING_GROUP")?.[0];
  const ec2Ids = nodesByType.get("EC2") ?? [];

  assert.equal(response.title, "Amazon Q ALB Fleet");
  assert.equal(response.metadata.source, "amazon_q");
  assert.equal(ec2Ids.length, 3);
  assert.ok(loadBalancerId);
  assert.ok(autoScalingGroupId);
  assert.ok(
    response.architectureJson.edges.some(
      (edge) => edge.sourceId === loadBalancerId && edge.targetId === autoScalingGroupId
    )
  );
  for (const ec2Id of ec2Ids) {
    assert.ok(
      response.architectureJson.edges.some(
        (edge) => edge.sourceId === autoScalingGroupId && edge.targetId === ec2Id
      )
    );
  }
  assert.equal(response.llmExplanation?.fallbackUsed, false);
  assert.equal(response.llmExplanation?.providerMetadata?.provider, "amazon_q");
});

test("createAmazonQArchitectureDraftResponse repairs a one-node Q plan that requires EC2 subnet spread", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "plan",
      title: "Amazon Q Multi-AZ EC2 Web App",
      patternIds: ["alb-asg-ec2", "spa-cloudfront-s3", "multi-az-rds"],
      requiredResources: [
        "VPC",
        "SUBNET",
        "INTERNET_GATEWAY",
        "ROUTE_TABLE",
        "ROUTE_TABLE_ASSOCIATION",
        "SECURITY_GROUP",
        "LOAD_BALANCER",
        "LOAD_BALANCER_LISTENER",
        "LOAD_BALANCER_TARGET_GROUP",
        "LAUNCH_TEMPLATE",
        "AUTO_SCALING_GROUP",
        "EC2",
        "CLOUDFRONT",
        "S3",
        "RDS"
      ],
      resourceQuantities: { EC2: 1 },
      runtimeTopology: {
        trafficEntry: "LOAD_BALANCER",
        compute: "EC2",
        computeCount: 1,
        placement: "private_subnets",
        spreadAcrossPrivateSubnets: true,
        autoScaling: true
      }
    })
  );

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createDynamicWebDeploymentSelectionPrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const ec2Nodes = response.architectureJson.nodes.filter((node) => node.type === "EC2");
  const ec2SubnetIds = new Set(
    ec2Nodes.map((node) => node.config.subnetId).filter((value) => typeof value === "string")
  );

  assert.equal(response.metadata.source, "amazon_q");
  assert.equal(ec2Nodes.length, 2);
  assert.equal(ec2SubnetIds.size, 2);
});

test("createAmazonQArchitectureDraftResponse materializes a deployable multi-AZ EC2 web app with image uploads and SSE chat", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "plan",
      title: "Amazon Q Production EC2 Web App",
      patternIds: ["alb-asg-ec2", "spa-cloudfront-s3", "multi-az-rds"],
      requiredResources: [
        "VPC",
        "SUBNET",
        "INTERNET_GATEWAY",
        "ROUTE_TABLE",
        "ROUTE_TABLE_ASSOCIATION",
        "SECURITY_GROUP",
        "LOAD_BALANCER",
        "LOAD_BALANCER_LISTENER",
        "LOAD_BALANCER_TARGET_GROUP",
        "LAUNCH_TEMPLATE",
        "AUTO_SCALING_GROUP",
        "EC2",
        "CLOUDFRONT",
        "S3",
        "DB_SUBNET_GROUP",
        "RDS",
        "SECRETS_MANAGER_SECRET",
        "CLOUDWATCH_METRIC_ALARM"
      ],
      resourceQuantities: { EC2: 2, S3: 2 },
      runtimeTopology: {
        trafficEntry: "LOAD_BALANCER",
        compute: "EC2",
        computeCount: 2,
        placement: "private_subnets",
        spreadAcrossPrivateSubnets: true,
        autoScaling: true
      },
      region: "ap-northeast-2",
      database: "simple",
      availability: "99.9"
    })
  );
  const prompt = [
    "website type: dynamic web application",
    "traffic: small daily traffic under 100 concurrent users under 10",
    "database: medium data 10GB-100GB",
    "frontend: React/Vue/Angular SPA framework",
    "backend: complex business logic Spring Boot or Django",
    "region: Korea only Seoul ap-northeast-2",
    "budget: 50-200만원 high performance",
    "SSL HTTPS: optional HTTP acceptable",
    "\uD30C\uC77C \uC5C5\uB85C\uB4DC \uAE30\uB2A5\uC774 \uC788\uB098\uC694? (\uC774\uBBF8\uC9C0, \uBB38\uC11C \uB4F1)",
    "\uC774\uBBF8\uC9C0\uB9CC (\uD504\uB85C\uD544, \uAC8C\uC2DC\uAE00 \uC774\uBBF8\uC9C0)",
    "\uC2E4\uC2DC\uAC04 \uAE30\uB2A5\uC774 \uD544\uC694\uD55C\uAC00\uC694? (\uCC44\uD305, \uC54C\uB9BC \uB4F1)",
    "\uC2E4\uC2DC\uAC04 \uCC44\uD305",
    "management: semi-managed",
    "loading target: within 3 seconds",
    "website size: 10MB-100MB",
    "traffic pattern: event spikes",
    "availability: 99%, monthly downtime within 8 hours",
    "realtime implementation: SSE \uB2E8\uBC29\uD5A5 \uC54C\uB9BC \uACBD\uB85C"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const publicSubnets = nodes.filter(
    (node) => node.type === "SUBNET" && node.config.tier === "public"
  );
  const privateAppSubnets = nodes.filter(
    (node) => node.type === "SUBNET" && node.config.tier === "private_app"
  );
  const privateDbSubnets = nodes.filter(
    (node) => node.type === "SUBNET" && node.config.tier === "private_db"
  );
  const loadBalancer = nodes.find((node) => node.type === "LOAD_BALANCER");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const cloudFront = nodes.find((node) => node.type === "CLOUDFRONT");
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );
  const staticBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
  );
  const database = nodes.find((node) => node.type === "RDS");
  const runtimePolicy = nodes.find((node) => node.type === "IAM_POLICY");

  assert.equal(publicSubnets.length, 2);
  assert.equal(privateAppSubnets.length, 2);
  assert.equal(privateDbSubnets.length, 2);
  assert.deepEqual(
    new Set(publicSubnets.map((node) => node.config.availabilityZone)),
    new Set(["ap-northeast-2a", "ap-northeast-2b"])
  );
  assert.ok(loadBalancer);
  assert.equal(loadBalancer.config.idleTimeout, 120);
  assert.deepEqual(
    loadBalancer.config.subnets,
    publicSubnets.map((node) => `aws_subnet.${node.id.replaceAll("-", "_")}.id`)
  );
  assert.equal(nodes.filter((node) => node.type === "NAT_GATEWAY").length, 2);
  assert.ok(autoScalingGroup);
  assert.deepEqual(
    autoScalingGroup.config.vpcZoneIdentifier,
    privateAppSubnets.map((node) => `aws_subnet.${node.id.replaceAll("-", "_")}.id`)
  );
  assert.ok(uploadBucket);
  assert.ok(staticBucket);
  assert.equal(uploadBucket.config.publicAccessBlock, true);
  assert.equal(database?.config.multiAz, true);
  assert.equal(database?.config.publiclyAccessible, false);
  assert.equal(database?.config.allocatedStorage, 50);
  assert.ok(cloudFront);
  assert.equal(
    edges.some((edge) => edge.sourceId === cloudFront.id && edge.targetId === loadBalancer.id),
    false
  );
  assert.equal(
    edges.some(
      (edge) =>
        edge.sourceId === cloudFront.id &&
        nodes.some((node) => node.type === "EC2" && node.id === edge.targetId)
    ),
    false
  );
  assert.ok(
    edges.some(
      (edge) => edge.sourceId === autoScalingGroup.id && edge.targetId === uploadBucket.id
    )
  );
  assert.ok(listener);
  assert.ok(targetGroup);
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === listener.id &&
        edge.targetId === targetGroup.id &&
        /SSE/i.test(edge.label ?? "")
    )
  );
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === autoScalingGroup.id &&
        edge.targetId === database?.id &&
        /LISTEN\/NOTIFY/i.test(edge.label ?? "")
    )
  );
  const policyDocument = JSON.parse(String(runtimePolicy?.config.policy ?? "{}")) as {
    Statement?: unknown[];
  };
  const policyStatements = policyDocument.Statement ?? [];
  assert.ok(policyStatements.length >= 2);
  assert.equal(
    policyStatements.some(
      (statement) =>
        typeof statement === "object" &&
        statement !== null &&
        Array.isArray((statement as { Action?: unknown }).Action) &&
        (statement as { Action: unknown[] }).Action.some((action) =>
          String(action).startsWith("s3:")
        ) &&
        (statement as { Resource?: unknown }).Resource === "*"
    ),
    false
  );
});

test("createAmazonQArchitectureDraftResponse materializes HTTPS SSE and burst scaling for a managed Fargate web app", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "plan",
      title: "Managed APAC Fargate Web App",
      patternIds: ["ecs-fargate", "spa-cloudfront-s3", "multi-az-rds"],
      requiredResources: [
        "VPC",
        "SUBNET",
        "INTERNET_GATEWAY",
        "LOAD_BALANCER",
        "LOAD_BALANCER_LISTENER",
        "LOAD_BALANCER_TARGET_GROUP",
        "ECR_REPOSITORY",
        "ECS_CLUSTER",
        "ECS_SERVICE",
        "ECS_TASK_DEFINITION",
        "CLOUDFRONT",
        "S3",
        "RDS"
      ],
      resourceQuantities: { S3: 2 },
      runtimeTopology: {
        trafficEntry: "LOAD_BALANCER",
        compute: "ECS_FARGATE",
        placement: "private_subnets",
        autoScaling: true
      },
      region: "ap-northeast-1",
      database: "simple",
      availability: "99"
    })
  );
  const prompt = [
    "웹사이트 유형: 동적 웹 애플리케이션",
    "트래픽: 중간 규모 일 1,000명 동시 50명",
    "데이터베이스: 간단한 데이터 사용자 정보 게시글 10GB 미만",
    "프론트엔드: React/Vue/Angular SPA 프레임워크",
    "백엔드: 복잡한 비즈니스 로직 Spring Boot Django",
    "주요 사용자 지역: 아시아 태평양 도쿄 싱가포르 포함",
    "예산: 50-200만원 고성능",
    "SSL 인증서 HTTPS: 필수",
    "파일 업로드: 이미지만 프로필 게시글 이미지",
    "실시간 기능: 실시간 채팅",
    "음성 기능: 사용자가 음성 메시지를 업로드하면 Amazon Transcribe로 전사",
    "관리: 완전 관리형 서버리스 관리 최소화",
    "로딩 시간: 3초 이내",
    "웹사이트 크기: 10MB-100MB",
    "트래픽 패턴: 이벤트성 급증",
    "가용성: 99% 월 8시간 이내",
    "실시간 채팅 연결: HTTP 메시지 전송 + SSE 수신 경로"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const httpsListener = nodes.find(
    (node) =>
      node.type === "LOAD_BALANCER_LISTENER" &&
      node.config.port === 443 &&
      node.config.protocol === "HTTPS"
  );
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const ecsService = nodes.find((node) => node.type === "ECS_SERVICE");
  const database = nodes.find((node) => node.type === "RDS");

  assert.ok(nodes.some((node) => node.type === "ACM_CERTIFICATE"));
  assert.ok(httpsListener);
  assert.equal(typeof httpsListener.config.certificateArn, "string");
  assert.ok(nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_TARGET"));
  assert.ok(nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_POLICY"));
  assert.ok(
    nodes.some(
      (node) => node.type === "S3" && node.config.bucketPurpose === "voice_audio"
    )
  );
  assert.ok(
    nodes.some(
      (node) =>
        node.type === "IAM_POLICY" &&
        /transcribe:StartTranscriptionJob/u.test(String(node.config.policy ?? ""))
    )
  );
  assert.ok(edges.some((edge) => /Amazon Transcribe API/u.test(edge.label ?? "")));
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === httpsListener.id &&
        edge.targetId === targetGroup?.id &&
        /POST \/messages \+ SSE \/events/i.test(edge.label ?? "")
    )
  );
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === ecsService?.id &&
        edge.targetId === database?.id &&
        /LISTEN\/NOTIFY/i.test(edge.label ?? "")
    )
  );
});

test("createAmazonQArchitectureDraftResponse maps the Korean SPA questionnaire to APAC Fargate SSE topology", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createKoreanSpaQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
    };
    normalizedRequirement?: {
      patternIds?: string[];
      region?: string;
      runtimeTopology?: {
        compute?: string;
        autoScaling?: boolean;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  assert.equal(answerProfile?.traffic, "bursty");
  assert.equal(answerProfile?.frontend, "spa");
  assert.equal(answerProfile?.backend, "simple_api");
  assert.equal(answerProfile?.region, "apac");
  assert.equal(answerProfile?.upload, "image");
  assert.equal(answerProfile?.realtime, "notification");
  assert.equal(answerProfile?.management, "semi_managed");
  assert.equal(answerProfile?.availability, "99.9");
  assert.equal(answerProfile?.budget, "enterprise");
  assert.equal(firstPayload.normalizedRequirement?.region, "ap-northeast-1");
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("ecs-fargate"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("spa-cloudfront-s3"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"));
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "ECS_FARGATE");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const subnets = nodes.filter((node) => node.type === "SUBNET");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const database = nodes.find((node) => node.type === "RDS");

  assert.ok(nodes.some((node) => node.type === "ECS_SERVICE"));
  assert.equal(nodes.some((node) => node.type === "EC2"), false);
  assert.equal(listener?.config.protocol, "HTTP");
  assert.equal(listener?.config.port, 80);
  assert.equal(nodes.some((node) => node.type === "ACM_CERTIFICATE"), false);
  assert.ok(nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_TARGET"));
  assert.ok(nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_POLICY"));
  assert.equal(database?.config.allocatedStorage, 50);
  assert.equal(database?.config.multiAz, true);
  assert.ok(
    subnets.every((node) => String(node.config.availabilityZone ?? "").startsWith("ap-northeast-1"))
  );
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === listener?.id &&
        edge.targetId === targetGroup?.id &&
        /SSE \/events notification stream/iu.test(edge.label ?? "")
    )
  );
});

test("createAmazonQArchitectureDraftResponse maps the SPA microservices questionnaire to APAC Fargate services", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createSpaMicroservicesQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
      preferredPatterns?: Array<{ id?: string }>;
      coverageRequirements?: string[];
    };
    normalizedRequirement?: {
      patternIds?: string[];
      region?: string;
      resourceQuantities?: Record<string, number>;
      runtimeTopology?: {
        compute?: string;
        autoScaling?: boolean;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  assert.equal(answerProfile?.traffic, "medium");
  assert.equal(answerProfile?.frontend, "spa");
  assert.equal(answerProfile?.backend, "microservices");
  assert.equal(answerProfile?.region, "apac");
  assert.equal(answerProfile?.upload, "mixed");
  assert.equal(answerProfile?.realtime, "none");
  assert.equal(answerProfile?.management, "fully_managed");
  assert.equal(answerProfile?.latency, "three_seconds");
  assert.equal(answerProfile?.availability, "99.99");
  assert.equal(answerProfile?.budget, "normal");
  assert.ok(firstPayload.architectureDecisionSpace?.preferredPatterns?.some((pattern) => pattern.id === "ecs_fargate_microservices"));
  assert.ok(
    firstPayload.architectureDecisionSpace?.coverageRequirements?.some((requirement) =>
      /cost-warning/i.test(requirement)
    )
  );
  assert.equal(firstPayload.normalizedRequirement?.region, "ap-northeast-1");
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("ecs-fargate"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("spa-cloudfront-s3"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"));
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "ECS_FARGATE");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.ECS_SERVICE, 3);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.ECS_TASK_DEFINITION, 3);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.LOAD_BALANCER_TARGET_GROUP, 3);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.APPLICATION_AUTO_SCALING_TARGET, 3);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.APPLICATION_AUTO_SCALING_POLICY, 3);

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const serviceNodes = nodes.filter((node) => node.type === "ECS_SERVICE");
  const taskDefinitions = nodes.filter((node) => node.type === "ECS_TASK_DEFINITION");
  const targetGroups = nodes.filter((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const scalingTargets = nodes.filter((node) => node.type === "APPLICATION_AUTO_SCALING_TARGET");
  const scalingPolicies = nodes.filter((node) => node.type === "APPLICATION_AUTO_SCALING_POLICY");
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );

  assert.equal(serviceNodes.length, 3);
  assert.equal(taskDefinitions.length, 3);
  assert.equal(targetGroups.length, 3);
  assert.equal(scalingTargets.length, 3);
  assert.equal(scalingPolicies.length, 3);
  assert.equal(nodes.some((node) => node.type === "EC2"), false);
  assert.equal(nodes.some((node) => node.type === "API_GATEWAY_WEBSOCKET_API"), false);
  assert.match(serviceNodes.map((node) => node.label ?? "").join("\n"), /Auth \/ Member/u);
  assert.match(serviceNodes.map((node) => node.label ?? "").join("\n"), /Commerce \/ Board/u);
  assert.match(serviceNodes.map((node) => node.label ?? "").join("\n"), /Upload/u);
  assert.equal(uploadBucket?.config.bucketPrefix, "sketchcatch-file-uploads-");
  assert.ok(
    serviceNodes.every((node) => {
      const networkConfiguration = node.config.networkConfiguration;

      return (
        typeof networkConfiguration === "object" &&
        networkConfiguration !== null &&
        "assignPublicIp" in networkConfiguration &&
        networkConfiguration.assignPublicIp === false
      );
    })
  );
  assert.equal(
    edges.some((edge) => /sse|websocket|notification|realtime/i.test(edge.label ?? "")),
    false
  );
});

test("createAmazonQArchitectureDraftResponse maps the global self-managed SPA questionnaire to EC2 ASG and large database sizing", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createGlobalSelfManagedSpaQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
    };
    normalizedRequirement?: {
      patternIds?: string[];
      requiredResources?: string[];
      resourceQuantities?: Record<string, number>;
      runtimeTopology?: {
        autoScaling?: boolean;
        compute?: string;
        computeCount?: number;
        placement?: string;
        spreadAcrossPrivateSubnets?: boolean;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  assert.equal(answerProfile?.traffic, "large");
  assert.equal(answerProfile?.frontend, "spa");
  assert.equal(answerProfile?.backend, "complex");
  assert.equal(answerProfile?.region, "global");
  assert.equal(answerProfile?.upload, "large");
  assert.equal(answerProfile?.realtime, "data_updates");
  assert.equal(answerProfile?.management, "self_managed");
  assert.equal(answerProfile?.latency, "one_second");
  assert.equal(answerProfile?.availability, "99.99");
  assert.equal(answerProfile?.budget, "enterprise");
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("alb-asg-ec2"));
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("ecs-fargate"), false);
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("spa-cloudfront-s3"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"));
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "EC2");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.computeCount, 4);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.placement, "private_subnets");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.spreadAcrossPrivateSubnets, true);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.EC2, 4);

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const ec2Nodes = nodes.filter((node) => node.type === "EC2");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const launchTemplate = nodes.find((node) => node.type === "LAUNCH_TEMPLATE");
  const database = nodes.find((node) => node.type === "RDS");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );
  const webSocketApi = nodes.find((node) => node.type === "API_GATEWAY_WEBSOCKET_API");
  const webSocketRoute = nodes.find((node) => node.type === "API_GATEWAY_V2_ROUTE");
  const webSocketIntegration = nodes.find((node) => node.type === "API_GATEWAY_V2_INTEGRATION");
  const webSocketStage = nodes.find((node) => node.type === "API_GATEWAY_V2_STAGE");

  assert.equal(nodes.some((node) => node.type === "ECS_SERVICE"), false);
  assert.equal(nodes.some((node) => node.type === "ECS_TASK_DEFINITION"), false);
  assert.equal(ec2Nodes.length, 4);
  assert.equal(autoScalingGroup?.config.desiredCapacity, 4);
  assert.equal(autoScalingGroup?.config.maxSize, 12);
  assert.equal(launchTemplate?.config.instanceType, "m7i.large");
  assert.equal(database?.config.allocatedStorage, 200);
  assert.equal(database?.config.instanceClass, "db.r6g.large");
  assert.equal(database?.config.multiAz, true);
  assert.equal(uploadBucket?.config.bucketPrefix, "sketchcatch-large-file-uploads-");
  assert.equal(webSocketApi?.config.protocolType, "WEBSOCKET");
  assert.equal(webSocketApi?.config.routeSelectionExpression, "$request.body.action");
  assert.equal(webSocketRoute?.config.routeKey, "$default");
  assert.equal(webSocketIntegration?.config.integrationType, "HTTP_PROXY");
  assert.equal(webSocketIntegration?.config.integrationUri, "aws_lb_listener.http_listener.arn");
  assert.equal(webSocketStage?.config.name, "prod");
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === listener?.id &&
        edge.targetId === targetGroup?.id &&
        /WebSocket upgrade/iu.test(edge.label ?? "")
    )
  );
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === webSocketApi?.id &&
        edge.targetId === webSocketRoute?.id &&
        /routes/iu.test(edge.label ?? "")
    )
  );
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === webSocketIntegration?.id &&
        edge.targetId === listener?.id &&
        /WebSocket proxy/iu.test(edge.label ?? "")
    )
  );
});

test("createAmazonQArchitectureDraftResponse infers a backend from operational SPA answers", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createGlobalSelfManagedSpaWithoutBackendAnswerPrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
    };
    normalizedRequirement?: {
      patternIds?: string[];
      requiredResources?: string[];
      resourceQuantities?: Record<string, number>;
      runtimeTopology?: {
        autoScaling?: boolean;
        compute?: string;
        computeCount?: number;
        trafficEntry?: string;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  assert.equal(answerProfile?.frontend, "spa");
  assert.equal(answerProfile?.backend, "complex");
  assert.equal(answerProfile?.management, "self_managed");
  assert.equal(answerProfile?.traffic, "bursty");
  assert.equal(answerProfile?.region, "global");
  assert.equal(answerProfile?.budget, "high");
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("alb-asg-ec2"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("spa-cloudfront-s3"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"));
  assert.ok(firstPayload.normalizedRequirement?.requiredResources?.includes("CLOUDFRONT"));
  assert.ok(firstPayload.normalizedRequirement?.requiredResources?.includes("S3"));
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.trafficEntry, "LOAD_BALANCER");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "EC2");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.computeCount, 4);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.EC2, 4);

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const ec2Nodes = nodes.filter((node) => node.type === "EC2");
  const loadBalancer = nodes.find((node) => node.type === "LOAD_BALANCER");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const launchTemplate = nodes.find((node) => node.type === "LAUNCH_TEMPLATE");
  const database = nodes.find((node) => node.type === "RDS");
  const cloudFront = nodes.find((node) => node.type === "CLOUDFRONT");
  const staticBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
  );
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );
  const webSocketApi = nodes.find((node) => node.type === "API_GATEWAY_WEBSOCKET_API");
  const webSocketIntegration = nodes.find((node) => node.type === "API_GATEWAY_V2_INTEGRATION");

  assert.notEqual(loadBalancer, undefined);
  assert.notEqual(listener, undefined);
  assert.notEqual(targetGroup, undefined);
  assert.equal(cloudFront?.config.originResourceId, "web-assets-bucket");
  assert.equal(staticBucket?.config.publicAccessBlock, true);
  assert.equal(ec2Nodes.length, 4);
  assert.equal(autoScalingGroup?.config.desiredCapacity, 4);
  assert.equal(autoScalingGroup?.config.maxSize, 12);
  assert.equal(launchTemplate?.config.instanceType, "m7i.large");
  assert.equal(database?.config.allocatedStorage, 200);
  assert.equal(database?.config.instanceClass, "db.r6g.large");
  assert.equal(database?.config.multiAz, true);
  assert.equal(uploadBucket?.config.bucketPrefix, "sketchcatch-file-uploads-");
  assert.equal(webSocketApi?.config.protocolType, "WEBSOCKET");
  assert.equal(webSocketIntegration?.config.integrationType, "HTTP_PROXY");
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === listener?.id &&
        edge.targetId === targetGroup?.id &&
        /WebSocket upgrade/iu.test(edge.label ?? "")
    )
  );
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === cloudFront?.id &&
        edge.targetId === staticBucket?.id &&
        /private origin/iu.test(edge.label ?? "")
    )
  );
});

test("createAmazonQArchitectureDraftResponse sizes a large self-managed API server for burst polling traffic", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createKoreanApiServerPollingQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
    };
    normalizedRequirement?: {
      patternIds?: string[];
      region?: string;
      resourceQuantities?: Record<string, number>;
      runtimeTopology?: {
        autoScaling?: boolean;
        compute?: string;
        computeCount?: number;
        placement?: string;
        spreadAcrossPrivateSubnets?: boolean;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  assert.equal(answerProfile?.traffic, "bursty");
  assert.equal(answerProfile?.frontend, "mobile");
  assert.equal(answerProfile?.backend, "simple_api");
  assert.equal(answerProfile?.region, "korea");
  assert.equal(answerProfile?.upload, "image");
  assert.equal(answerProfile?.realtime, "notification");
  assert.equal(answerProfile?.management, "self_managed");
  assert.equal(answerProfile?.latency, "one_second");
  assert.equal(answerProfile?.availability, "99.9");
  assert.equal(answerProfile?.budget, "enterprise");
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("alb-asg-ec2"));
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"));
  assert.equal(firstPayload.normalizedRequirement?.region, "ap-northeast-2");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "EC2");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.computeCount, 4);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.placement, "private_subnets");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.spreadAcrossPrivateSubnets, true);
  assert.equal(firstPayload.normalizedRequirement?.resourceQuantities?.EC2, 4);

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const ec2Nodes = nodes.filter((node) => node.type === "EC2");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const launchTemplate = nodes.find((node) => node.type === "LAUNCH_TEMPLATE");
  const scalingPolicy = nodes.find((node) => node.type === "AUTO_SCALING_POLICY");
  const database = nodes.find((node) => node.type === "RDS");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );

  assert.equal(ec2Nodes.length, 4);
  assert.equal(autoScalingGroup?.config.desiredCapacity, 4);
  assert.equal(autoScalingGroup?.config.maxSize, 12);
  assert.equal(launchTemplate?.config.instanceType, "m7i.large");
  assert.equal(scalingPolicy?.config.policyType, "TargetTrackingScaling");
  assert.deepEqual(scalingPolicy?.config.targetTrackingConfiguration, {
    targetValue: 55,
    disableScaleIn: false,
    predefinedMetricSpecification: {
      predefinedMetricType: "ASGAverageCPUUtilization"
    }
  });
  assert.equal(database?.config.allocatedStorage, 50);
  assert.equal(database?.config.instanceClass, "db.r6g.large");
  assert.equal(database?.config.multiAz, true);
  assert.equal(uploadBucket?.config.bucketPrefix, "sketchcatch-image-uploads-");
  assert.equal(listener?.config.protocol, "HTTPS");
  assert.equal(listener?.config.port, 443);
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === listener?.id &&
        edge.targetId === targetGroup?.id &&
        /polling API requests \(cost warning\)/iu.test(edge.label ?? "")
    )
  );
  assert.ok(
    response.metadata.assumptions.some((assumption) =>
      /polling.*cost.*traffic spikes/iu.test(assumption)
    )
  );
});

test("createAmazonQArchitectureDraftResponse lets low-budget DB-free API answers override earlier data sizing", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createKoreanLowBudgetDbFreeApiQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
    };
    normalizedRequirement?: {
      database?: string;
      forbiddenCapabilities?: string[];
      patternIds?: string[];
      region?: string;
      runtimeTopology?: {
        compute?: string;
        trafficEntry?: string;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const nodeTypes = new Set(nodes.map((node) => node.type));
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );

  assert.equal(answerProfile?.traffic, "small");
  assert.equal(answerProfile?.frontend, "mobile");
  assert.equal(answerProfile?.backend, "simple_api");
  assert.equal(answerProfile?.region, "apac");
  assert.equal(answerProfile?.upload, "image");
  assert.equal(answerProfile?.realtime, "notification");
  assert.equal(answerProfile?.management, "semi_managed");
  assert.equal(answerProfile?.latency, "five_seconds");
  assert.equal(answerProfile?.availability, "99");
  assert.equal(answerProfile?.budget, "low");
  assert.equal(firstPayload.normalizedRequirement?.database, "none");
  assert.ok(firstPayload.normalizedRequirement?.forbiddenCapabilities?.includes("database"));
  assert.equal(firstPayload.normalizedRequirement?.region, "ap-northeast-1");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.trafficEntry, "API_GATEWAY_REST_API");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "LAMBDA");
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"), false);

  for (const forbiddenType of [
    "RDS",
    "DB_SUBNET_GROUP",
    "VPC",
    "SUBNET",
    "SECURITY_GROUP",
    "SECRETS_MANAGER_SECRET",
    "API_GATEWAY_RESOURCE",
    "API_GATEWAY_METHOD",
    "API_GATEWAY_INTEGRATION",
    "API_GATEWAY_DEPLOYMENT",
    "API_GATEWAY_STAGE"
  ] as const) {
    assert.equal(nodeTypes.has(forbiddenType), false, `Expected no ${forbiddenType}`);
  }

  assert.equal(nodeTypes.has("API_GATEWAY_REST_API"), true);
  assert.equal(nodeTypes.has("LAMBDA"), true);
  assert.equal(nodeTypes.has("S3"), true);
  assert.equal(nodeTypes.has("CLOUDWATCH_LOG_GROUP"), true);
  assert.equal(nodeTypes.has("CLOUDWATCH_METRIC_ALARM"), true);
  assert.equal(uploadBucket?.config.bucketPrefix, "sketchcatch-image-uploads-");
  assert.equal(uploadBucket?.config.bucketPurpose, "user_uploads");
  assert.ok(
    edges.some((edge) => /polling.*cost warning/iu.test(edge.label ?? "")),
    "Expected a polling cost-warning edge"
  );
  assert.ok(
    response.metadata.assumptions.some((assumption) =>
      /database.*excluded|db.*excluded|no database|db-free/iu.test(assumption)
    ),
    "Expected DB-free assumption coverage"
  );
  assert.ok(
    response.metadata.assumptions.some((assumption) =>
      /polling.*cost/iu.test(assumption)
    ),
    "Expected polling cost assumption coverage"
  );
});

test("createAmazonQArchitectureDraftResponse maps fully managed SPA API answers to valid serverless resources", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createServerlessBoardQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
    };
    normalizedRequirement?: {
      patternIds?: string[];
      runtimeTopology?: {
        compute?: string;
        trafficEntry?: string;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const nodeTypes = new Set(nodes.map((node) => node.type));
  const api = nodes.find((node) => node.type === "API_GATEWAY_REST_API");
  const lambda = nodes.find((node) => node.type === "LAMBDA");
  const cloudFront = nodes.find((node) => node.type === "CLOUDFRONT");
  const dataTable = nodes.find((node) => node.type === "DYNAMODB_TABLE");
  const logGroup = nodes.find((node) => node.type === "CLOUDWATCH_LOG_GROUP");
  const staticBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
  );
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );

  assert.equal(answerProfile?.frontend, "spa");
  assert.equal(answerProfile?.backend, "simple_api");
  assert.equal(answerProfile?.management, "fully_managed");
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("serverless-api"), true);
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("spa-cloudfront-s3"), true);
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"), false);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.trafficEntry, "API_GATEWAY_REST_API");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "LAMBDA");
  assert.equal(nodeTypes.has("EC2"), false);
  assert.equal(nodeTypes.has("LOAD_BALANCER"), false);
  assert.ok(api);
  assert.equal(api.config.name, "practice-api");
  assert.ok(lambda);
  assert.equal(lambda.config.runtime, "nodejs20.x");
  assert.equal(logGroup?.config.kmsKeyId, undefined);
  assert.ok(staticBucket);
  assert.equal(staticBucket.config.publicAccessBlock, true);
  assert.ok(uploadBucket);
  assert.equal(uploadBucket.config.bucketPrefix, "sketchcatch-image-uploads-");
  assert.equal(cloudFront?.config.originResourceId, staticBucket.id);
  assert.deepEqual(cloudFront?.config.origin, {
    domainName: `${staticBucket.id}.s3.amazonaws.com`,
    originId: "static-assets"
  });
  assert.deepEqual(cloudFront?.config.defaultCacheBehavior, {
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD"],
    targetOriginId: "static-assets",
    viewerProtocolPolicy: "redirect-to-https"
  });
  assert.deepEqual(cloudFront?.config.restrictions, {
    geoRestriction: [{ restrictionType: "none" }]
  });
  assert.deepEqual(cloudFront?.config.viewerCertificate, {
    cloudfrontDefaultCertificate: true
  });
  assert.equal(dataTable?.config.name, "practice-board-data");
  assert.equal(dataTable?.config.billingMode, "PAY_PER_REQUEST");
  assert.equal(dataTable?.config.hashKey, "pk");
  assert.equal(dataTable?.config.rangeKey, "sk");
  assert.deepEqual(dataTable?.config.attribute, [
    { name: "pk", type: "S" },
    { name: "sk", type: "S" }
  ]);
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === api?.id &&
        edge.targetId === lambda?.id &&
        /polling.*cost warning/iu.test(edge.label ?? "")
    ),
    "Expected polling cost warning on the API Gateway to Lambda path"
  );
});

test("createAmazonQArchitectureDraftResponse removes orphan VPC scaffolding from DB-free serverless previews", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "preview",
      title: "Serverless SSR API draft with orphan network scaffold",
      architectureJson: {
        nodes: [
          configuredNode(node("api", "API_GATEWAY_REST_API", "API Gateway", 120, 180), {
            name: "practice-api"
          }),
          node("lambda", "LAMBDA", "API Lambda", 360, 180),
          node("cdn", "CLOUDFRONT", "CloudFront", 120, 420),
          configuredNode(node("site-bucket", "S3", "Web Assets", 360, 420), {
            bucketPurpose: "static_website_origin"
          }),
          configuredNode(node("upload-bucket", "S3", "Image Uploads", 600, 180), {
            bucketPurpose: "user_uploads"
          }),
          node("logs", "CLOUDWATCH_LOG_GROUP", "API Logs", 600, 420),
          node("alarm", "CLOUDWATCH_METRIC_ALARM", "Burst Alarm", 840, 420),
          configuredNode(node("vpc", "VPC", "VPC", 1300, 120), {
            cidrBlock: "172.16.0.0/16"
          }),
          configuredNode(node("private-a", "SUBNET", "PRIVATE SUBNET A", 1600, 120), {
            cidrBlock: "172.16.1.0/24"
          }),
          node("nat", "NAT_GATEWAY", "NAT Gateway", 1860, 130)
        ],
        edges: [
          { id: "api-lambda", sourceId: "api", targetId: "lambda", label: "SSE one-way updates" },
          { id: "cdn-site", sourceId: "cdn", targetId: "site-bucket", label: "origin" },
          { id: "lambda-upload", sourceId: "lambda", targetId: "upload-bucket", label: "image upload" },
          { id: "lambda-logs", sourceId: "lambda", targetId: "logs", label: "logs" },
          { id: "alarm-logs", sourceId: "logs", targetId: "alarm", label: "metric alarm" }
        ]
      },
      metadata: {
        assumptions: [
          "DB excluded by budget decision",
          "SSE is represented by API Gateway to Lambda one-way updates."
        ],
        recommendations: []
      },
      requirementCoverage: [
        {
          answer: "selected dynamic SSR/serverless DB-free SSE answers",
          status: "satisfied",
          capability:
            "selectedPattern: serverless-api; rejectedPatterns: VPC/EC2/RDS are excluded by low-budget DB-free fully managed answers; SSE realtime data update path uses API Gateway to Lambda; data persistence is limited to S3 image objects",
          nodes: ["api", "lambda", "cdn", "site-bucket", "upload-bucket", "logs", "alarm"],
          assumption:
            "Selected answers are represented by the listed topology nodes with pattern trade-off rationale."
        }
      ]
    })
  );

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createDbFreeSsrServerlessQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const nodes = response.architectureJson.nodes;
  const nodeTypes = new Set(nodes.map((node) => node.type));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const lambda = nodes.find((node) => node.type === "LAMBDA");

  for (const forbiddenType of [
    "VPC",
    "SUBNET",
    "NAT_GATEWAY",
    "INTERNET_GATEWAY",
    "ROUTE_TABLE",
    "ROUTE_TABLE_ASSOCIATION",
    "ELASTIC_IP",
    "SECURITY_GROUP",
    "IAM_ROLE",
    "RDS",
    "DB_SUBNET_GROUP",
    "EC2",
    "LOAD_BALANCER"
  ] as const) {
    assert.equal(nodeTypes.has(forbiddenType), false, `Expected no ${forbiddenType}`);
  }

  assert.equal(nodeTypes.has("API_GATEWAY_REST_API"), true);
  assert.equal(nodeTypes.has("LAMBDA"), true);
  assert.equal(nodeTypes.has("CLOUDFRONT"), true);
  assert.equal(nodeTypes.has("S3"), true);
  assert.equal(lambda?.config.functionName, "practice-api-handler");
  assert.equal(lambda?.config.role, "var.lambda_execution_role_arn");
  assert.equal(lambda?.config.handler, "index.handler");
  assert.equal(lambda?.config.runtime, "nodejs20.x");
  assert.deepEqual(
    response.architectureJson.edges.filter(
      (edge) => !nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)
    ),
    []
  );
});

test("createAmazonQArchitectureDraftResponse materializes static no-backend answers as CloudFront and S3", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createStaticPortfolioQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    normalizedRequirement?: {
      patternIds?: string[];
      requiredResources?: string[];
      forbiddenCapabilities?: string[];
    };
  };
  const nodeTypes = new Set(response.architectureJson.nodes.map((node) => node.type));
  const cloudFront = response.architectureJson.nodes.find((node) => node.type === "CLOUDFRONT");
  const bucket = response.architectureJson.nodes.find((node) => node.type === "S3");

  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("spa-cloudfront-s3"), true);
  assert.equal(firstPayload.normalizedRequirement?.requiredResources?.includes("CLOUDFRONT"), true);
  assert.equal(firstPayload.normalizedRequirement?.requiredResources?.includes("S3"), true);
  assert.equal(firstPayload.normalizedRequirement?.forbiddenCapabilities?.includes("database"), true);
  assert.ok(cloudFront);
  assert.ok(bucket);
  assert.equal(cloudFront.config.originResourceId, bucket.id);
  assert.equal(nodeTypes.has("EC2"), false);
  assert.equal(nodeTypes.has("LAMBDA"), false);
  assert.equal(nodeTypes.has("LOAD_BALANCER"), false);
  assert.equal(nodeTypes.has("RDS"), false);
});

test("createAmazonQArchitectureDraftResponse expands Git CI/CD EC2 handoff answers into deployable resources", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createGitCiCdEc2HandoffQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    normalizedRequirement?: {
      patternIds?: string[];
      requiredResources?: string[];
      runtimeTopology?: { compute?: string; autoScaling?: boolean };
    };
  };
  const nodes = response.architectureJson.nodes;
  const nodeTypes = new Set(nodes.map((node) => node.type));
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const asg = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const ec2 = nodes.find((node) => node.type === "EC2");

  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("alb-asg-ec2"), true);
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("github-cicd-codedeploy"), true);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "EC2");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);
  for (const requiredType of [
    "CODESTAR_CONNECTION",
    "CODEPIPELINE",
    "CODEBUILD_PROJECT",
    "CODEDEPLOY_APP",
    "CODEDEPLOY_DEPLOYMENT_GROUP",
    "S3"
  ] as const) {
    assert.equal(nodeTypes.has(requiredType), true, `Expected ${requiredType}`);
    assert.equal(firstPayload.normalizedRequirement?.requiredResources?.includes(requiredType), true);
  }
  assert.ok(ec2);
  assert.equal(typeof ec2.config.ami, "string");
  assert.equal(typeof ec2.config.instanceType, "string");
  assert.equal(typeof ec2.config.subnetId, "string");
  assert.ok(asg);
  assert.equal(Array.isArray(asg.config.launchTemplate), true);
  assert.ok(listener);
  assert.equal(Array.isArray(listener.config.defaultAction), true);
});

test("createAmazonQArchitectureDraftResponse maps APAC mobile API database answers to Fargate instead of bare EC2", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createVoiceTranscriptionApiQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: { answerProfile?: Record<string, string | undefined> };
    normalizedRequirement?: {
      patternIds?: string[];
      runtimeTopology?: { compute?: string; autoScaling?: boolean };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  const nodes = response.architectureJson.nodes;
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");

  assert.equal(answerProfile?.frontend, "mobile");
  assert.equal(answerProfile?.backend, "simple_api");
  assert.equal(answerProfile?.region, "apac");
  assert.equal(answerProfile?.management, "semi_managed");
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("ecs-fargate"), true);
  assert.equal(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"), true);
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "ECS_FARGATE");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);
  assert.equal(nodes.some((node) => node.type === "EC2"), false);
  assert.equal(nodes.some((node) => node.type === "ECS_SERVICE"), true);
  assert.equal(nodes.some((node) => node.type === "RDS"), true);
  assert.equal(nodes.some((node) => node.type === "S3"), true);
  assert.ok(listener);
  assert.equal(Array.isArray(listener.config.defaultAction), true);
});

test("createAmazonQArchitectureDraftResponse maps the Korean SSR mixed-upload questionnaire to Seoul Fargate SSE notifications", async () => {
  const requests: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    requests.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createKoreanSsrMixedUploadQuestionnairePrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const firstPayload = requests[0]?.payload as {
    architectureDecisionSpace?: {
      answerProfile?: Record<string, string | undefined>;
    };
    normalizedRequirement?: {
      patternIds?: string[];
      region?: string;
      runtimeTopology?: {
        compute?: string;
        autoScaling?: boolean;
      };
    };
  };
  const answerProfile = firstPayload.architectureDecisionSpace?.answerProfile;
  assert.equal(answerProfile?.traffic, "bursty");
  assert.equal(answerProfile?.frontend, "ssr");
  assert.equal(answerProfile?.backend, "simple_api");
  assert.equal(answerProfile?.region, "korea");
  assert.equal(answerProfile?.upload, "mixed");
  assert.equal(answerProfile?.realtime, "notification");
  assert.equal(answerProfile?.management, "semi_managed");
  assert.equal(answerProfile?.availability, "99");
  assert.equal(answerProfile?.budget, "high");
  assert.equal(firstPayload.normalizedRequirement?.region, "ap-northeast-2");
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("ecs-fargate"));
  assert.equal(
    firstPayload.normalizedRequirement?.patternIds?.includes("spa-cloudfront-s3"),
    false
  );
  assert.ok(firstPayload.normalizedRequirement?.patternIds?.includes("multi-az-rds"));
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.compute, "ECS_FARGATE");
  assert.equal(firstPayload.normalizedRequirement?.runtimeTopology?.autoScaling, true);

  const nodes = response.architectureJson.nodes;
  const edges = response.architectureJson.edges;
  const subnets = nodes.filter((node) => node.type === "SUBNET");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const database = nodes.find((node) => node.type === "RDS");
  const uploadBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
  );
  const cloudFront = nodes.find((node) => node.type === "CLOUDFRONT");
  const taskDefinition = nodes.find((node) => node.type === "ECS_TASK_DEFINITION");

  assert.ok(nodes.some((node) => node.type === "ECS_SERVICE"));
  assert.equal(nodes.some((node) => node.type === "EC2"), false);
  assert.equal(listener?.config.protocol, "HTTPS");
  assert.equal(listener?.config.port, 443);
  assert.ok(nodes.some((node) => node.type === "ACM_CERTIFICATE"));
  assert.ok(nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_TARGET"));
  assert.ok(nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_POLICY"));
  assert.equal(database?.config.allocatedStorage, 50);
  assert.equal(database?.config.multiAz, true);
  assert.ok(
    subnets.every((node) => String(node.config.availabilityZone ?? "").startsWith("ap-northeast-2"))
  );
  assert.ok(uploadBucket);
  assert.equal(uploadBucket.config.bucketPrefix, "sketchcatch-file-uploads-");
  assert.match(uploadBucket.label ?? "", /Mixed File/u);
  assert.doesNotMatch(`${uploadBucket.id} ${uploadBucket.label ?? ""}`, /image/iu);
  assert.match(String(taskDefinition?.label ?? ""), /SSR/u);
  assert.equal(cloudFront?.config.originResourceId, "application-load-balancer");
  assert.ok(
    edges.some(
      (edge) =>
        edge.sourceId === listener?.id &&
        edge.targetId === targetGroup?.id &&
        /SSE \/events notification stream/iu.test(edge.label ?? "")
    )
  );
});

test("createAmazonQArchitectureDraftResponse rejects when Amazon Q returns an invalid compact plan", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "plan",
      title: "Invalid Q Plan",
      requiredResources: ["NOT_A_SUPPORTED_RESOURCE"]
    })
  );

  await assert.rejects(
    createAmazonQArchitectureDraftResponse(
      {
        prompt: createDynamicWebDeploymentSelectionPrompt()
      },
      {
        provider,
        creditPolicy: confirmedCreditPolicy
      }
    ),
    (error: unknown) =>
      error instanceof ArchitectureDraftGenerationError &&
      error.kind === "provider_response_invalid" &&
      error.statusCode === 502
  );
});

test("createAmazonQArchitectureDraftResponse rejects when compact plan quantities cannot be materialized", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "plan",
      title: "Unsupported Quantity Plan",
      requiredResources: ["IAM_ROLE"],
      resourceQuantities: { IAM_ROLE: 3 }
    })
  );

  await assert.rejects(
    createAmazonQArchitectureDraftResponse(
      { prompt: createDynamicWebDeploymentSelectionPrompt() },
      { provider, creditPolicy: confirmedCreditPolicy }
    ),
    (error: unknown) =>
      error instanceof ArchitectureDraftGenerationError &&
      error.kind === "requirements_unsatisfied" &&
      error.statusCode === 422
  );
});

test("createAmazonQArchitectureDraftResponse retries once when a compact plan fails materialization", async () => {
  const calls: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    calls.push(request);

    if (calls.length === 1) {
      return JSON.stringify({
        status: "plan",
        title: "Invalid Quantity Plan",
        requiredResources: ["IAM_ROLE"],
        resourceQuantities: { IAM_ROLE: 3 }
      });
    }

    return JSON.stringify({
      status: "plan",
      title: "Repaired ALB Fleet",
      requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2"],
      resourceQuantities: { EC2: 3 },
      runtimeTopology: {
        trafficEntry: "LOAD_BALANCER",
        compute: "EC2",
        computeCount: 3,
        placement: "private_subnets",
        spreadAcrossPrivateSubnets: true,
        autoScaling: true
      }
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createDynamicWebDeploymentSelectionPrompt() },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if ("status" in response) {
    assert.fail(`Expected repaired preview, got clarification: ${response.question}`);
  }

  assert.equal(calls.length, 2);
  assert.equal(response.title, "Repaired ALB Fleet");
  assert.equal(response.architectureJson.nodes.filter((node) => node.type === "EC2").length, 3);
  const retryPayload = calls[1]?.payload as {
    validationIssues?: string[];
    previousPlan?: { title?: string; resourceQuantities?: Record<string, number> };
  };
  assert.equal(retryPayload.validationIssues?.length, 1);
  assert.match(retryPayload.validationIssues?.[0] ?? "", /materialization/i);
  assert.equal(retryPayload.previousPlan?.title, "Invalid Quantity Plan");
  assert.deepEqual(retryPayload.previousPlan?.resourceQuantities, { IAM_ROLE: 3 });
});

test("createAmazonQArchitectureDraftResponse rejects compact plans that contradict no-backend answers", async () => {
  const provider = createFakeAmazonQProvider(() =>
    JSON.stringify({
      status: "plan",
      title: "Contradictory Compute Plan",
      requiredResources: ["EC2"]
    })
  );

  await assert.rejects(
    createAmazonQArchitectureDraftResponse(
      { prompt: createStaticWebsiteCompletePrompt("file upload: none no file upload text only") },
      { provider, creditPolicy: confirmedCreditPolicy }
    ),
    { name: "ArchitectureDraftGenerationError" }
  );
});

test("createAmazonQArchitectureDraftResponse accepts panel-backed ResourceType values from Amazon Q", async () => {
  let requestedPrompt = "";
  let requestedPayload: unknown;
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompt = request.prompt;
    requestedPayload = request.payload;

    return JSON.stringify({
      status: "preview",
      title: "Panel Catalog Resources",
      architectureJson: {
        nodes: [
          {
            id: "container-cluster",
            type: "EKS_CLUSTER",
            label: "EKS Cluster",
            positionX: 120,
            positionY: 180,
            config: {}
          },
          {
            id: "app-autoscaling",
            type: "AUTO_SCALING_GROUP",
            label: "Auto Scaling Group",
            positionX: 360,
            positionY: 180,
            config: {}
          },
          {
            id: "state-table",
            type: "DYNAMODB_TABLE",
            label: "DynamoDB Table",
            positionX: 600,
            positionY: 180,
            config: {}
          },
          {
            id: "work-queue",
            type: "SQS_QUEUE",
            label: "SQS Queue",
            positionX: 840,
            positionY: 180,
            config: {}
          }
        ],
        edges: []
      },
      requirementCoverage: [
        {
          answer: "panel catalog compute and queue resources",
          status: "satisfied",
          capability: "selectedPattern: panel_catalog_resource_brief; rejectedPatterns: standard web templates are not needed; container workers and autoscaling job processing",
          nodes: ["container-cluster", "app-autoscaling", "work-queue"],
          assumption: "The requested panel resources are represented directly."
        },
        {
          answer: "DynamoDB Table data requirement",
          status: "satisfied",
          capability: "data persistence",
          nodes: ["state-table"],
          assumption: "DynamoDB Table is the requested persisted state store."
        }
      ]
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "Required components: EKS Cluster, Auto Scaling Group, DynamoDB Table, and SQS Queue.",
        "Architecture flow: EKS workers process SQS queue jobs and store state in DynamoDB.",
        "Validation checklist: include those resource-panel components as ResourceNode.type values."
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const payload = requestedPayload as {
    supportedResourceCatalog?: Array<{
      displayName?: string;
      id?: string;
      nodeType?: string;
      terraformBlockType?: string;
      terraformResourceType?: string;
    }>;
    supportedResourceTypes?: string[];
  };
  const sharedResourceTypes = new Set(
    resourceDefinitions
      .map((definition) => definition.resourceType)
      .filter((resourceType) => resourceType !== "UNKNOWN")
  );
  const catalogByTerraformType = new Map(
    payload.supportedResourceCatalog?.map((definition) => [definition.terraformResourceType, definition])
  );

  assert.match(requestedPrompt, /EKS_CLUSTER/);
  assert.deepEqual(new Set(payload.supportedResourceTypes), sharedResourceTypes);
  assert.equal(catalogByTerraformType.get("aws_codebuild_project")?.nodeType, "CODEBUILD_PROJECT");
  assert.equal(catalogByTerraformType.get("aws_codedeploy_app")?.nodeType, "CODEDEPLOY_APP");
  assert.equal(catalogByTerraformType.get("aws_codepipeline")?.nodeType, "CODEPIPELINE");
  assert.equal(catalogByTerraformType.get("aws_ssm_parameter")?.terraformBlockType, "data");
  assert.deepEqual(
    response.architectureJson.nodes.map((node) => node.type),
    ["EKS_CLUSTER", "AUTO_SCALING_GROUP", "DYNAMODB_TABLE", "SQS_QUEUE"]
  );
});

test("createArchitectureDraft assembles explicitly requested resource-panel items in fallback drafts", () => {
  const response = createArchitectureDraft({
    prompt: [
      "Required components: ECS Cluster, ECS Service, ECS Task Definition, SQS Queue, CodeBuild Project, and SSM Parameter.",
      "Architecture flow: Fargate service processes queue jobs and CodeBuild packages deployments.",
      "Validation checklist: include those exact resource-panel components."
    ].join("\n")
  });

  const nodesByType = new Map(response.architectureJson.nodes.map((node) => [node.type, node]));

  assert.equal(nodesByType.get("ECS_CLUSTER")?.config["terraformResourceType"], "aws_ecs_cluster");
  assert.equal(nodesByType.get("ECS_SERVICE")?.config["terraformResourceType"], "aws_ecs_service");
  assert.equal(nodesByType.get("ECS_TASK_DEFINITION")?.config["terraformResourceType"], "aws_ecs_task_definition");
  assert.equal(nodesByType.get("SQS_QUEUE")?.config["terraformResourceType"], "aws_sqs_queue");
  assert.equal(nodesByType.get("CODEBUILD_PROJECT")?.config["terraformResourceType"], "aws_codebuild_project");
  assert.equal(nodesByType.get("SSM_PARAMETER")?.config["terraformResourceType"], "aws_ssm_parameter");
  assert.equal(nodesByType.get("SSM_PARAMETER")?.config["terraformBlockType"], "data");
});

test("createAmazonQArchitectureDraftResponse repairs previews missing explicit CI/CD resources and EC2 count", async () => {
  const requestedPrompts: string[] = [];
  let callCount = 0;
  const prompt = [
    "Required components: CodeStar Connection, CodePipeline, CodeBuild Project, CodeDeploy App, CodeDeploy Deployment Group, S3 artifact bucket, IAM Role, EC2 3 instances, Auto Scaling Group, and Application Load Balancer.",
    "Architecture flow: GitHub main -> CodeStar Connection -> CodePipeline -> CodeBuild Project -> CodeDeploy App and Deployment Group -> Auto Scaling Group -> EC2 fleet behind ALB.",
    "Validation checklist: include every listed resource-panel component as visible ResourceNode.type values and at least 3 EC2 nodes.",
    "file upload: none no file upload."
  ].join("\n");
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    callCount += 1;

    if (callCount === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Incomplete CI/CD EC2 Deployment",
        architectureJson: {
          nodes: [
            node("codestar", "CODESTAR_CONNECTION", "CodeStar Connection", 100, 100),
            node("pipeline", "CODEPIPELINE", "CodePipeline", 420, 100),
            node("deploy-app", "CODEDEPLOY_APP", "CodeDeploy App", 740, 100),
            node("deploy-group", "CODEDEPLOY_DEPLOYMENT_GROUP", "CodeDeploy Deployment Group", 1060, 100),
            node("artifact-bucket", "S3", "Artifact Bucket", 1380, 100),
            node("service-role", "IAM_ROLE", "Pipeline Service Role", 1700, 100),
            node("alb", "LOAD_BALANCER", "Application Load Balancer", 100, 360),
            node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 420, 360),
            node("app-a", "EC2", "Application Server A", 740, 360),
            node("app-b", "EC2", "Application Server B", 1060, 360)
          ],
          edges: []
        },
        requirementCoverage: sampleRequirementCoverage([
          "codestar",
          "pipeline",
          "deploy-app",
          "deploy-group",
          "artifact-bucket",
          "service-role",
          "alb",
          "asg",
          "app-a",
          "app-b"
        ])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Corrected CI/CD EC2 Deployment",
      architectureJson: {
        nodes: [
          node("codestar", "CODESTAR_CONNECTION", "CodeStar Connection", 100, 100),
          node("pipeline", "CODEPIPELINE", "CodePipeline", 420, 100),
          node("build", "CODEBUILD_PROJECT", "CodeBuild Project", 740, 100),
          node("deploy-app", "CODEDEPLOY_APP", "CodeDeploy App", 1060, 100),
          node("deploy-group", "CODEDEPLOY_DEPLOYMENT_GROUP", "CodeDeploy Deployment Group", 1380, 100),
          node("artifact-bucket", "S3", "Artifact Bucket", 1700, 100),
          node("service-role", "IAM_ROLE", "Pipeline Service Role", 2020, 100),
          node("alb", "LOAD_BALANCER", "Application Load Balancer", 100, 360),
          node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 420, 420),
          node("app-a", "EC2", "Application Server A", 740, 260),
          node("app-b", "EC2", "Application Server B", 740, 420),
          node("app-c", "EC2", "Application Server C", 740, 580)
        ],
        edges: [
          { id: "alb-to-asg", sourceId: "alb", targetId: "asg", label: "routes" },
          { id: "asg-to-app-a", sourceId: "asg", targetId: "app-a", label: "scales" },
          { id: "asg-to-app-b", sourceId: "asg", targetId: "app-b", label: "scales" },
          { id: "asg-to-app-c", sourceId: "asg", targetId: "app-c", label: "scales" }
        ]
      },
      requirementCoverage: sampleRequirementCoverage([
        "codestar",
        "pipeline",
        "build",
        "deploy-app",
        "deploy-group",
        "artifact-bucket",
        "service-role",
        "alb",
        "asg",
        "app-a",
        "app-b",
        "app-c"
      ])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /CODEBUILD_PROJECT/);
  assert.match(requestedPrompts[1] ?? "", /requested 3 EC2 instances/);
  assert.equal(response.title, "Corrected CI/CD EC2 Deployment");
  assert.equal(response.architectureJson.nodes.filter((node) => node.type === "EC2").length, 3);
  assert.ok(response.architectureJson.nodes.some((node) => node.type === "CODEBUILD_PROJECT"));
});

test("createAmazonQArchitectureDraftResponse repairs no-upload CI/CD drafts with disconnected ALB and ASG topology", async () => {
  const requestedPrompts: string[] = [];
  let callCount = 0;
  const prompt = [
    "GitHub main 브랜치에서 AWS로 배포되는 동적 웹 애플리케이션을 만들고 싶어.",
    "반드시 CodeStar Connection, CodePipeline, CodeBuild Project, CodeDeploy App, CodeDeploy Deployment Group을 포함해줘.",
    "런타임은 ALB 뒤의 EC2 3대와 Auto Scaling Group으로 구성해줘.",
    "어떤 종류의 웹사이트인가요? 동적 웹 애플리케이션입니다.",
    "예상 트래픽 규모는 중간 규모입니다.",
    "데이터베이스가 필요한가요? 간단한 데이터입니다.",
    "프론트엔드 기술은? React/Vue/Angular SPA 프레임워크입니다.",
    "백엔드가 필요한가요? 복잡한 비즈니스 로직입니다.",
    "주요 사용자 지역은 한국만 서울 리전입니다.",
    "월 예산 범위는 50-200만원 고성능입니다.",
    "SSL 인증서(HTTPS)가 필요한가요? 선택사항입니다.",
    "파일 업로드는 없고 텍스트만 처리합니다.",
    "실시간 기능이 필요한가요? 필요 없음.",
    "관리 복잡도 선호도는 직접 관리입니다.",
    "페이지 로딩 시간 목표는 3초 이내입니다.",
    "전체 웹사이트 크기는 10MB-100MB입니다.",
    "트래픽 패턴은 이벤트성 급증입니다.",
    "서비스 중단 허용 시간은 일 1시간 이내 99.9% 가용성입니다."
  ].join("\n");
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    callCount += 1;

    if (callCount === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Disconnected CI/CD Deployment",
        architectureJson: {
          nodes: [
            node("codestar", "CODESTAR_CONNECTION", "CodeStar Connection", 100, 100),
            node("pipeline", "CODEPIPELINE", "CodePipeline", 420, 100),
            node("build", "CODEBUILD_PROJECT", "CodeBuild Project", 740, 100),
            node("deploy-app", "CODEDEPLOY_APP", "CodeDeploy App", 1060, 100),
            node("deploy-group", "CODEDEPLOY_DEPLOYMENT_GROUP", "CodeDeploy Deployment Group", 1380, 100),
            node("artifact-bucket", "S3", "Artifact Bucket", 1700, 100),
            node("service-role", "IAM_ROLE", "Pipeline Service Role", 2020, 100),
            node("alb", "LOAD_BALANCER", "Application Load Balancer", 100, 360),
            node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 420, 360),
            node("app-a", "EC2", "Application Server A", 740, 360),
            node("app-b", "EC2", "Application Server B", 1060, 360),
            node("app-c", "EC2", "Application Server C", 1380, 360),
            node("upload-bucket", "S3", "Upload Bucket", 1700, 360),
            node("media-bucket", "S3", "Content Media Bucket", 2020, 360)
          ],
          edges: [
            { id: "pipeline-to-build", sourceId: "pipeline", targetId: "build", label: "builds" },
            { id: "deploy-to-asg", sourceId: "deploy-group", targetId: "asg", label: "deploys" }
          ]
        },
        requirementCoverage: sampleRequirementCoverage([
          "codestar",
          "pipeline",
          "build",
          "deploy-app",
          "deploy-group",
          "artifact-bucket",
          "service-role",
          "alb",
          "asg",
          "app-a",
          "app-b",
          "app-c"
        ])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Corrected No Upload CI/CD Deployment",
      architectureJson: {
        nodes: [
          node("codestar", "CODESTAR_CONNECTION", "CodeStar Connection", 100, 100),
          node("pipeline", "CODEPIPELINE", "CodePipeline", 420, 100),
          node("build", "CODEBUILD_PROJECT", "CodeBuild Project", 740, 100),
          node("deploy-app", "CODEDEPLOY_APP", "CodeDeploy App", 1060, 100),
          node("deploy-group", "CODEDEPLOY_DEPLOYMENT_GROUP", "CodeDeploy Deployment Group", 1380, 100),
          node("artifact-bucket", "S3", "Artifact Bucket", 1700, 100),
          node("service-role", "IAM_ROLE", "Pipeline Service Role", 2020, 100),
          node("alb", "LOAD_BALANCER", "Application Load Balancer", 100, 360),
          node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 420, 420),
          node("app-a", "EC2", "Application Server A", 740, 260),
          node("app-b", "EC2", "Application Server B", 740, 420),
          node("app-c", "EC2", "Application Server C", 740, 580),
          node("db-subnets", "DB_SUBNET_GROUP", "DB Subnet Group", 1060, 580),
          node("database", "RDS", "Application Database", 1380, 580)
        ],
        edges: [
          { id: "pipeline-to-build", sourceId: "pipeline", targetId: "build", label: "builds" },
          { id: "build-to-deploy-app", sourceId: "build", targetId: "deploy-app", label: "deploy artifact" },
          { id: "deploy-app-to-group", sourceId: "deploy-app", targetId: "deploy-group", label: "uses group" },
          { id: "alb-to-asg", sourceId: "alb", targetId: "asg", label: "routes" },
          { id: "asg-to-app-a", sourceId: "asg", targetId: "app-a", label: "scales" },
          { id: "asg-to-app-b", sourceId: "asg", targetId: "app-b", label: "scales" },
          { id: "asg-to-app-c", sourceId: "asg", targetId: "app-c", label: "scales" }
        ]
      },
      requirementCoverage: sampleRequirementCoverage([
        "codestar",
        "pipeline",
        "build",
        "deploy-app",
        "deploy-group",
        "artifact-bucket",
        "service-role",
        "alb",
        "asg",
        "app-a",
        "app-b",
        "app-c",
        "database"
      ])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /selected no file upload/);
  assert.match(requestedPrompts[1] ?? "", /ALB -> ASG\/target group -> EC2/);
  assert.match(requestedPrompts[1] ?? "", /AUTO_SCALING_GROUP to the EC2 fleet/);
  assert.equal(response.title, "Corrected No Upload CI/CD Deployment");
  assert.equal(response.architectureJson.nodes.some((node) => /upload|media/iu.test(node.id)), false);
});

test("createAmazonQArchitectureDraftResponse repairs EC2 fleets not split across requested private subnets", async () => {
  const requestedPrompts: string[] = [];
  let callCount = 0;
  const prompt = [
    "Required components: EC2 3 instances, Auto Scaling Group, Application Load Balancer, VPC, and two private app subnets.",
    "Architecture flow: ALB -> Auto Scaling Group -> EC2 fleet.",
    "Validation checklist: EC2 3대를 프라이빗 서브넷 2개에 나눠 배치하고 ALB 뒤에서 트래픽을 받는 구조.",
    "database: none no database.",
    "file upload: none no file upload."
  ].join("\n");
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    callCount += 1;

    if (callCount === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Single Subnet EC2 Fleet",
        architectureJson: {
          nodes: [
            node("vpc", "VPC", "Application VPC", 900, 900),
            node("private-a", "SUBNET", "Private App Subnet A", 100, 100),
            node("private-b", "SUBNET", "Private App Subnet B", 100, 340),
            node("alb", "LOAD_BALANCER", "Application Load Balancer", 500, 100),
            node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 720, 100),
            configuredNode(node("app-a", "EC2", "Application Server A", 120, 120), { subnetId: "private-a" }),
            configuredNode(node("app-b", "EC2", "Application Server B", 140, 140), { subnetId: "private-a" }),
            configuredNode(node("app-c", "EC2", "Application Server C", 160, 160), { subnetId: "private-a" })
          ],
          edges: [
            { id: "alb-to-asg", sourceId: "alb", targetId: "asg", label: "routes" },
            { id: "asg-to-app-a", sourceId: "asg", targetId: "app-a", label: "scales" },
            { id: "asg-to-app-b", sourceId: "asg", targetId: "app-b", label: "scales" },
            { id: "asg-to-app-c", sourceId: "asg", targetId: "app-c", label: "scales" },
            { id: "private-a-to-app-a", sourceId: "private-a", targetId: "app-a", label: "places" },
            { id: "private-a-to-app-b", sourceId: "private-a", targetId: "app-b", label: "places" },
            { id: "private-a-to-app-c", sourceId: "private-a", targetId: "app-c", label: "places" }
          ]
        },
        requirementCoverage: sampleRequirementCoverage(["vpc", "private-a", "private-b", "alb", "asg", "app-a", "app-b", "app-c"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Split Private Subnet EC2 Fleet",
      architectureJson: {
        nodes: [
            node("vpc", "VPC", "Application VPC", 900, 900),
            node("private-a", "SUBNET", "Private App Subnet A", 100, 100),
            node("private-b", "SUBNET", "Private App Subnet B", 100, 340),
            node("alb", "LOAD_BALANCER", "Application Load Balancer", 500, 600),
            node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 760, 600),
            configuredNode(node("app-a", "EC2", "Application Server A", 120, 120), { subnetId: "private-a" }),
            configuredNode(node("app-b", "EC2", "Application Server B", 120, 360), { subnetId: "private-b" }),
            node("app-c", "EC2", "Application Server C", 1000, 500)
        ],
        edges: [
          { id: "alb-to-asg", sourceId: "alb", targetId: "asg", label: "routes" },
          { id: "asg-to-app-a", sourceId: "asg", targetId: "app-a", label: "scales" }
        ]
      },
      requirementCoverage: sampleRequirementCoverage(["vpc", "private-a", "private-b", "alb", "asg", "app-a", "app-b", "app-c"])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /split across two private subnets/);
  assert.equal(response.title, "Split Private Subnet EC2 Fleet");
});

test("createAmazonQArchitectureDraftResponse repairs EC2 fleets visually grouped in one private subnet despite split edges", async () => {
  const requestedPrompts: string[] = [];
  let callCount = 0;
  const prompt = [
    "Required components: EC2 3 instances, Auto Scaling Group, Application Load Balancer, VPC, and two private app subnets.",
    "Architecture flow: ALB -> Auto Scaling Group -> EC2 fleet.",
    "Validation checklist: EC2 3대를 프라이빗 서브넷 2개에 나눠 배치하고 ALB 뒤에서 트래픽을 받는 구조.",
    "database: none no database.",
    "file upload: optional, not related to EC2 runtime.",
    "region: Korea only Seoul region ap-northeast-2.",
    "availability: 99.99%."
  ].join("\n");
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    callCount += 1;

    if (callCount === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Visually Single Subnet Fleet",
        architectureJson: {
          nodes: [
            node("vpc", "VPC", "Application VPC", 40, 40),
            node("private-a", "SUBNET", "Private App Subnet A", 100, 120),
            node("private-b", "SUBNET", "Private App Subnet B", 100, 320),
            node("alb", "LOAD_BALANCER", "Application Load Balancer", 420, 180),
            node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 680, 180),
            configuredNode(node("app-a", "EC2", "Application Server A", 140, 150), { subnetId: "private-a" }),
            configuredNode(node("app-b", "EC2", "Application Server B", 180, 160), { subnetId: "private-b" }),
            configuredNode(node("app-c", "EC2", "Application Server C", 220, 170), { subnetId: "private-b" })
          ],
          edges: [
            { id: "alb-to-asg", sourceId: "alb", targetId: "asg", label: "routes" },
            { id: "asg-to-app-a", sourceId: "asg", targetId: "app-a", label: "scales" },
            { id: "asg-to-app-b", sourceId: "asg", targetId: "app-b", label: "scales" },
            { id: "asg-to-app-c", sourceId: "asg", targetId: "app-c", label: "scales" },
            { id: "private-a-to-app-a", sourceId: "private-a", targetId: "app-a", label: "places" },
            { id: "private-b-to-app-b", sourceId: "private-b", targetId: "app-b", label: "places" },
            { id: "private-b-to-app-c", sourceId: "private-b", targetId: "app-c", label: "places" }
          ]
        },
        requirementCoverage: deploymentRequirementCoverage(["vpc", "private-a", "private-b", "alb", "asg", "app-a", "app-b", "app-c"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Visually Split Private Subnet Fleet",
      architectureJson: {
        nodes: [
          node("vpc", "VPC", "Application VPC", 900, 900),
          node("private-a", "SUBNET", "Private App Subnet A", 100, 120),
          node("private-b", "SUBNET", "Private App Subnet B", 100, 320),
          node("alb", "LOAD_BALANCER", "Application Load Balancer", 500, 600),
          node("asg", "AUTO_SCALING_GROUP", "Auto Scaling Group", 760, 600),
          configuredNode(node("app-a", "EC2", "Application Server A", 120, 130), { subnetId: "private-a" }),
          configuredNode(node("app-b", "EC2", "Application Server B", 120, 340), { subnetId: "private-b" }),
          node("app-c", "EC2", "Application Server C", 1000, 500)
        ],
        edges: [
          { id: "alb-to-asg", sourceId: "alb", targetId: "asg", label: "routes" },
          { id: "asg-to-app-a", sourceId: "asg", targetId: "app-a", label: "scales" }
        ]
      },
      requirementCoverage: deploymentRequirementCoverage(["vpc", "private-a", "private-b", "alb", "asg", "app-a", "app-b", "app-c"])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    { prompt },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /visually placed across at least two private app subnets/);
  assert.equal(response.title, "Visually Split Private Subnet Fleet");
});

test("createArchitectureDraft keeps high budget answers from triggering low-budget DB follow-up", () => {
  const response = createArchitectureDraft({
    prompt: [
      "GitHub main 브랜치에서 AWS로 배포되는 동적 웹 애플리케이션을 만들고 싶어.",
      "데이터베이스가 필요한가요? 간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
      "프론트엔드 기술은? React/Vue/Angular (SPA 프레임워크)",
      "백엔드가 필요한가요? 복잡한 비즈니스 로직 (Spring Boot, Django 등)",
      "월 예산 범위는? 50-200만원 (고성능)",
      "파일 업로드는 없고, 서울 리전, 중간 규모, 99.9% 가용성으로 해줘."
    ].join("\n")
  });

  assert.equal(response.metadata.operatingProfile?.budgetLevel, "normal");
  assert.equal(
    response.metadata.guardrailWarnings?.some((warning) => warning.code === "low_budget_rds_cost"),
    false
  );
});

test("createArchitectureDraft treats neutral file answers as not requiring upload buckets", () => {
  const response = createArchitectureDraft({
    prompt: [
      "EC2 3대를 프라이빗 서브넷 2개에 나눠 배치하고, ALB 뒤에서 트래픽을 받는 구조로 만들어줘.",
      "운영 배포 가능한 형태여야 하고 Auto Scaling Group도 포함해줘.",
      "동적 웹 애플리케이션",
      "중간 규모",
      "DB 필요하면 간단한 데이터",
      "React/Vue/Angular",
      "복잡한 비즈니스 로직",
      "한국만 / 서울 리전",
      "50-200만원 이상",
      "SSL 필수",
      "파일은 아무거나, EC2랑 직접 상관은 적음",
      "실시간은 없어도 됨",
      "직접 관리 또는 반관리형",
      "3초 이내",
      "10MB-100MB 이상",
      "시간대별 차이 또는 이벤트성 급증",
      "일 1시간 이내 또는 절대 안 됨 / 99.99%"
    ].join("\n")
  });

  const uploadLikeNodes = response.architectureJson.nodes.filter((node) =>
    /upload|media|attachment|file[_\s-]*upload/iu.test(`${node.id} ${node.label ?? ""} ${JSON.stringify(node.config ?? {})}`)
  );
  const ec2SubnetIds = response.architectureJson.nodes
    .filter((node) => node.type === "EC2")
    .map((node) => String(node.config?.subnetId ?? ""));

  assert.equal(uploadLikeNodes.length, 0);
  assert.equal(response.architectureJson.nodes.filter((node) => node.type === "EC2").length, 3);
  assert.deepEqual([...new Set(ec2SubnetIds)].sort(), [
    "aws_subnet.private_app_subnet_a.id",
    "aws_subnet.private_app_subnet_b.id"
  ]);
});

test("createAmazonQArchitectureDraftResponse creates deterministic decision spaces that vary by answer profile", async () => {
  const staticPrompt = createStaticWebsiteCompletePrompt("file upload: none no file upload text only");
  const imageUploadPrompt = createStaticWebsiteCompletePrompt("file upload: image upload only profile image");
  const firstPayloads: unknown[] = [];
  const secondPayloads: unknown[] = [];
  const imagePayloads: unknown[] = [];

  await createAmazonQArchitectureDraftResponse(
    { prompt: staticPrompt },
    {
      provider: createFakeAmazonQProvider((request) => {
        firstPayloads.push(request.payload);
        return createNormalizedRequirementPlan(request);
      }),
      creditPolicy: confirmedCreditPolicy
    }
  );

  await createAmazonQArchitectureDraftResponse(
    { prompt: staticPrompt },
    {
      provider: createFakeAmazonQProvider((request) => {
        secondPayloads.push(request.payload);
        return createNormalizedRequirementPlan(request);
      }),
      creditPolicy: confirmedCreditPolicy
    }
  );

  await createAmazonQArchitectureDraftResponse(
    { prompt: imageUploadPrompt },
    {
      provider: createFakeAmazonQProvider((request) => {
        imagePayloads.push(request.payload);
        return createNormalizedRequirementPlan(request);
      }),
      creditPolicy: confirmedCreditPolicy
    }
  );

  const firstDecisionSpace = readDecisionSpace(firstPayloads[0]);
  const secondDecisionSpace = readDecisionSpace(secondPayloads[0]);
  const imageDecisionSpace = readDecisionSpace(imagePayloads[0]);

  assert.deepEqual(secondDecisionSpace, firstDecisionSpace);
  assert.equal(firstDecisionSpace.answerProfile.upload, "none");
  assert.equal(imageDecisionSpace.answerProfile.upload, "image");
  assert.notDeepEqual(imageDecisionSpace, firstDecisionSpace);
  assert.ok(
    imageDecisionSpace.preferredPatterns.some((pattern: { id?: string }) => pattern.id === "direct_media_upload")
  );
});

test("createAmazonQArchitectureDraftResponse asks conditional tradeoff questions before calling Amazon Q", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const prompt = [
    "website type: dynamic SPA website",
    "traffic: daily traffic 1000 concurrent users 50",
    "database: PostgreSQL database required",
    "frontend: React/Vue/Angular SPA framework",
    "backend: complex backend business logic with Spring Boot or Django",
    "region: global users including US and Europe",
    "budget cost: 100 monthly",
    "SSL HTTPS: required",
    "file upload: image upload only",
    "realtime: real-time notification",
    "management preference: semi-managed operations",
    "loading time: 1 second",
    "website size: 10MB-100MB",
    "traffic pattern: time of day daytime peak",
    "downtime tolerance: 99.99% availability"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a conditional clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.match(response.question, /월 \$100 예산과 99\.99% 가용성/);
  assert.deepEqual(response.suggestions, [
    "월 $100 예산을 유지하고 99.9% 수준으로 완화",
    "99.99% 가용성을 우선하고 예산 초과 허용",
    "목표 아키텍처는 99.99%로 그리고 비용 초과 경고 표시"
  ]);
});

test("createAmazonQArchitectureDraftResponse sends dynamic global website constraints to Amazon Q", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Incomplete Dynamic Global Website",
        architectureJson: {
          nodes: [
            {
              id: "frontend-bucket",
              type: "S3",
              label: "SPA Assets Bucket",
              positionX: 120,
              positionY: 180,
              config: {}
            },
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Public Entry",
              positionX: 360,
              positionY: 180,
              config: {}
            }
          ],
          edges: [
            {
              id: "cdn-to-frontend",
              sourceId: "cdn",
              targetId: "frontend-bucket",
              label: "origin"
            }
          ]
        },
        requirementCoverage: sampleRequirementCoverage(["frontend-bucket", "cdn"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Dynamic Global Website Practice Architecture",
      architectureJson: {
        nodes: [
          {
            id: "frontend-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 180,
            config: {}
          },
          {
            id: "media-bucket",
            type: "S3",
            label: "Image Media Bucket",
            positionX: 120,
            positionY: 340,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Public Entry",
            positionX: 360,
            positionY: 180,
            config: {}
          },
          {
            id: "app-load-balancer",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 180,
            config: {}
          },
          {
            id: "https-listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTPS Listener",
            positionX: 600,
            positionY: 320,
            config: {
              certificateArn: "aws_acm_certificate.application_certificate.arn",
              port: 443,
              protocol: "HTTPS"
            }
          },
          {
            id: "application-certificate",
            type: "ACM_CERTIFICATE",
            label: "Application TLS Certificate",
            positionX: 360,
            positionY: 520,
            config: {
              domainName: "app.example.com",
              validationMethod: "DNS"
            }
          },
          {
            id: "app-server-a",
            type: "EC2",
            label: "App Server A",
            positionX: 840,
            positionY: 120,
            config: {}
          },
          {
            id: "app-server-b",
            type: "EC2",
            label: "App Server B",
            positionX: 840,
            positionY: 280,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "Multi-AZ DB Subnet Group",
            positionX: 1080,
            positionY: 200,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "PostgreSQL Multi-AZ Database",
            positionX: 1360,
            positionY: 200,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-frontend",
            sourceId: "cdn",
            targetId: "frontend-bucket",
            label: "origin"
          },
          {
            id: "cdn-to-alb",
            sourceId: "cdn",
            targetId: "app-load-balancer",
            label: "api origin"
          },
          {
            id: "listener-to-alb",
            sourceId: "https-listener",
            targetId: "app-load-balancer",
            label: "listens"
          },
          {
            id: "alb-to-app-a",
            sourceId: "app-load-balancer",
            targetId: "app-server-a",
            label: "routes"
          },
          {
            id: "alb-to-app-b",
            sourceId: "app-load-balancer",
            targetId: "app-server-b",
            label: "routes"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["frontend-bucket", "cdn"]),
        {
          answer: "complex backend business logic",
          status: "satisfied",
          capability: "complex_backend_api",
          nodes: ["app-load-balancer", "https-listener", "app-server-a", "app-server-b"]
        },
        {
          answer: "PostgreSQL database required",
          status: "satisfied",
          capability: "relational_database_multi_az",
          nodes: ["database", "db-subnet-group"],
          assumption: "RDS Multi-AZ is required for the 99.99% availability target."
        },
        {
          answer: "image upload only",
          status: "satisfied",
          capability: "image_upload",
          nodes: ["media-bucket"],
          assumption: "Browser uses presigned upload URLs for direct S3 image upload."
        },
        {
          answer: "real-time notification",
          status: "satisfied",
          capability: "realtime_notification",
          nodes: ["app-load-balancer", "app-server-a", "app-server-b"],
          assumption: "Realtime notification is represented as an SSE notification path through the backend tier."
        },
        {
          answer: "budget cost 100 monthly plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["app-load-balancer", "app-server-a", "app-server-b", "database"],
          assumption: "Cost warning: the selected high-availability pattern can exceed the low monthly budget."
        }
      ]
    });
  });

  const prompt = [
    "website type: dynamic SPA website",
    "traffic: daily traffic 1000 concurrent users 50",
    "database: PostgreSQL database required",
    "frontend: React/Vue/Angular SPA framework",
    "backend: complex backend business logic with Spring Boot or Django",
    "region: global users including US and Europe",
    "budget cost: 100 monthly",
    "SSL HTTPS: required",
    "file upload: image upload only",
    "realtime: real-time notification",
    "management preference: semi-managed operations",
    "loading time: 1 second",
    "website size: 10MB-100MB",
    "traffic pattern: time of day daytime peak",
    "downtime tolerance: 99.99% availability",
    "tradeoff: target architecture with cost warning",
    "global deployment: CloudFront global plus API/RDS single region",
    "realtime implementation: WebSocket connection path"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /dynamic SPA website/);
  assert.match(requestedPrompts[0] ?? "", /Amazon Q Architecture Brief/);
  assert.match(requestedPrompts[0] ?? "", /Derived Architecture Requirements/);
  assert.match(requestedPrompts[0] ?? "", /Required Architecture Flows/);
  assert.match(requestedPrompts[0] ?? "", /Validation Checklist/);
  assert.match(requestedPrompts[0] ?? "", /ArchitectureDecisionSpace/);
  assert.match(requestedPrompts[0] ?? "", /Monthly \$100 budget conflicts with 99\.99% availability/);
  assert.match(requestedPrompts[0] ?? "", /global_static_delivery_single_region_api/);
  assert.match(requestedPrompts[0] ?? "", /high_availability_multi_az_target/);
  assert.match(requestedPrompts[1] ?? "", /Do not return the same topology/);
  assert.match(requestedPrompts[1] ?? "", /Amazon Q Architecture Brief/);
  assert.match(requestedPrompts[1] ?? "", /requirementCoverage does not explain/);
  assert.match(requestedPrompts[1] ?? "", /image upload/);
  assert.match(requestedPrompts[1] ?? "", /real-time notification/);
  assert.match(requestedPrompts[1] ?? "", /cost warning/);
  assert.equal(response.title, "Dynamic Global Website Practice Architecture");
});

test("createAmazonQArchitectureDraftResponse respects gated choices for korea-only no-upload no-realtime answers", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    return JSON.stringify({
      status: "preview",
      title: "Korea Simple API Practice Architecture",
      architectureJson: {
        nodes: [
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 160,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Static Entry",
            positionX: 360,
            positionY: 160,
            config: {}
          },
          {
            id: "alb",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 160,
            config: {}
          },
          {
            id: "listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTP Listener",
            positionX: 600,
            positionY: 300,
            config: {}
          },
          {
            id: "app-a",
            type: "EC2",
            label: "API Server A",
            positionX: 840,
            positionY: 100,
            config: {}
          },
          {
            id: "app-b",
            type: "EC2",
            label: "API Server B",
            positionX: 840,
            positionY: 260,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 1080,
            positionY: 160,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "PostgreSQL Multi-AZ Database",
            positionX: 1360,
            positionY: 160,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-spa",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "static origin"
          },
          {
            id: "alb-to-app-a",
            sourceId: "alb",
            targetId: "app-a",
            label: "routes"
          },
          {
            id: "alb-to-app-b",
            sourceId: "alb",
            targetId: "app-b",
            label: "routes"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["spa-bucket", "cdn", "alb", "listener", "app-a", "app-b"]),
        {
          answer: "no file upload",
          status: "satisfied",
          capability: "text_only_data",
          nodes: ["database"],
          assumption: "No upload or media flow is modeled."
        },
        {
          answer: "no realtime",
          status: "satisfied",
          capability: "request_response_only",
          nodes: ["alb", "app-a", "app-b"],
          assumption: "No realtime channel is modeled."
        },
        {
          answer: "99.99% availability with database",
          status: "satisfied",
          capability: "rds_multi_az",
          nodes: ["db-subnet-group", "database"],
          assumption: "RDS Multi-AZ is configured for the availability target."
        },
        {
          answer: "budget cost 100 monthly plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["alb", "app-a", "app-b", "database"],
          assumption: "Cost warning: the high-availability pattern may exceed the low budget."
        }
      ]
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createKoreaNoUploadNoRealtimePrompt()
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 1);
  assert.match(requestedPrompts[0] ?? "", /ArchitectureDecisionSpace/);
  assert.match(requestedPrompts[0] ?? "", /File upload not required/);
  assert.match(requestedPrompts[0] ?? "", /Realtime not required/);
  assert.match(requestedPrompts[0] ?? "", /Region scope is Korea only/);
  assert.equal(response.title, "Korea Simple API Practice Architecture");
});

test("createAmazonQArchitectureDraftResponse regenerates previews that violate no-upload and no-realtime choices", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Invalid Korea Website",
        architectureJson: {
          nodes: [
            {
              id: "spa-bucket",
              type: "S3",
              label: "SPA Assets Bucket",
              positionX: 120,
              positionY: 160,
              config: {}
            },
            {
              id: "upload-bucket",
              type: "S3",
              label: "Upload Storage Bucket",
              positionX: 120,
              positionY: 320,
              config: {}
            },
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Static Entry",
              positionX: 360,
              positionY: 160,
              config: {}
            },
            {
              id: "websocket-api",
              type: "API_GATEWAY_REST_API",
              label: "WebSocket Notification API",
              positionX: 600,
              positionY: 160,
              config: {}
            },
            {
              id: "app",
              type: "EC2",
              label: "Single API Server",
              positionX: 840,
              positionY: 160,
              config: {}
            },
            {
              id: "db-subnet-group",
              type: "DB_SUBNET_GROUP",
              label: "DB Subnet Group",
              positionX: 1080,
              positionY: 160,
              config: {}
            },
            {
              id: "database",
              type: "RDS",
              label: "PostgreSQL Multi-AZ Database",
              positionX: 1360,
              positionY: 160,
              config: {
                multiAz: true
              }
            }
          ],
          edges: [
            {
              id: "cdn-to-spa",
              sourceId: "cdn",
              targetId: "spa-bucket",
              label: "static origin"
            }
          ]
        },
        requirementCoverage: [
          ...sampleRequirementCoverage(["spa-bucket", "cdn", "app"]),
          {
            answer: "websocket notification",
            status: "satisfied",
            capability: "realtime_notification",
            nodes: ["websocket-api"],
            assumption: "WebSocket notifications are included."
          },
          {
            answer: "image upload",
            status: "satisfied",
            capability: "upload_media",
            nodes: ["upload-bucket"],
            assumption: "Presigned URL upload flow is included."
          },
          {
            answer: "99.99% database",
            status: "satisfied",
            capability: "rds_multi_az",
            nodes: ["db-subnet-group", "database"],
            assumption: "RDS Multi-AZ is configured."
          }
        ]
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Corrected Korea Website",
      architectureJson: {
        nodes: [
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 160,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Static Entry",
            positionX: 360,
            positionY: 160,
            config: {}
          },
          {
            id: "alb",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 160,
            config: {}
          },
          {
            id: "listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTP Listener",
            positionX: 600,
            positionY: 300,
            config: {}
          },
          {
            id: "app-a",
            type: "EC2",
            label: "API Server A",
            positionX: 840,
            positionY: 100,
            config: {}
          },
          {
            id: "app-b",
            type: "EC2",
            label: "API Server B",
            positionX: 840,
            positionY: 260,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 1080,
            positionY: 160,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "PostgreSQL Multi-AZ Database",
            positionX: 1360,
            positionY: 160,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-spa",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "static origin"
          },
          {
            id: "alb-to-app-a",
            sourceId: "alb",
            targetId: "app-a",
            label: "routes"
          },
          {
            id: "alb-to-app-b",
            sourceId: "alb",
            targetId: "app-b",
            label: "routes"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["spa-bucket", "cdn", "alb", "listener", "app-a", "app-b"]),
        {
          answer: "no file upload",
          status: "satisfied",
          capability: "text_only_data",
          nodes: ["database"],
          assumption: "No upload or media flow is modeled."
        },
        {
          answer: "no realtime",
          status: "satisfied",
          capability: "request_response_only",
          nodes: ["alb", "app-a", "app-b"],
          assumption: "No realtime channel is modeled."
        },
        {
          answer: "99.99% database",
          status: "satisfied",
          capability: "rds_multi_az",
          nodes: ["db-subnet-group", "database"],
          assumption: "RDS Multi-AZ is configured."
        },
        {
          answer: "budget cost 100 monthly plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["alb", "app-a", "app-b", "database"],
          assumption: "Cost warning: the high-availability pattern may exceed the low budget."
        }
      ]
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createKoreaNoUploadNoRealtimePrompt()
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /selected no file upload/);
  assert.match(requestedPrompts[1] ?? "", /selected no realtime feature/);
  assert.match(requestedPrompts[1] ?? "", /cost warning/);
  assert.equal(response.title, "Corrected Korea Website");
  assert.equal(response.architectureJson.nodes.some((node) => node.id === "upload-bucket"), false);
  assert.equal(response.architectureJson.nodes.some((node) => node.id === "websocket-api"), false);
});

test("createAmazonQArchitectureDraftResponse sends detailed architecture briefs directly to Amazon Q", async () => {
  let requestedPrompt = "";
  let requestedInstructions = "";
  let requestedPayload: unknown;
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompt = request.prompt;
    requestedInstructions = request.instructions;
    requestedPayload = request.payload;
    return JSON.stringify({
      status: "preview",
      title: "Detailed Global Dynamic Website",
      architectureJson: {
        nodes: [
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 160,
            config: {}
          },
          {
            id: "media-bucket",
            type: "S3",
            label: "Image Upload Bucket",
            positionX: 120,
            positionY: 320,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "Global CloudFront",
            positionX: 360,
            positionY: 160,
            config: {}
          },
          {
            id: "alb",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 160,
            config: {}
          },
          {
            id: "app-asg",
            type: "AUTO_SCALING_GROUP",
            label: "EC2 Auto Scaling Group",
            positionX: 840,
            positionY: 160,
            config: {}
          },
          {
            id: "https-listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTPS Listener",
            positionX: 600,
            positionY: 320,
            config: {}
          },
          {
            id: "app-a",
            type: "EC2",
            label: "App Target A",
            positionX: 1080,
            positionY: 120,
            config: {}
          },
          {
            id: "app-b",
            type: "EC2",
            label: "App Target B",
            positionX: 1080,
            positionY: 280,
            config: {}
          },
          {
            id: "database-subnets",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 1320,
            positionY: 160,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "RDS Multi-AZ",
            positionX: 1640,
            positionY: 160,
            config: { multiAz: true }
          },
          {
            id: "vpc",
            type: "VPC",
            label: "Application VPC",
            positionX: 1880,
            positionY: 160,
            config: {}
          },
          {
            id: "realtime-api",
            type: "API_GATEWAY_REST_API",
            label: "Realtime WebSocket Assumption",
            positionX: 600,
            positionY: 480,
            config: {}
          }
        ],
        edges: [
          {
            id: "cdn-to-spa",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "static origin"
          },
          {
            id: "cdn-to-alb",
            sourceId: "cdn",
            targetId: "alb",
            label: "api origin"
          },
          {
            id: "alb-to-asg",
            sourceId: "alb",
            targetId: "app-asg",
            label: "routes"
          },
          {
            id: "asg-to-app-a",
            sourceId: "app-asg",
            targetId: "app-a",
            label: "scales"
          },
          {
            id: "asg-to-app-b",
            sourceId: "app-asg",
            targetId: "app-b",
            label: "scales"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["spa-bucket", "cdn", "alb", "app-asg", "app-a", "app-b", "vpc"]),
        {
          answer: "99.99% availability and database",
          status: "satisfied",
          capability: "rds_multi_az",
          nodes: ["database-subnets", "database"],
          assumption: "RDS Multi-AZ is represented for the availability target."
        },
        {
          answer: "realtime notification",
          status: "satisfied",
          capability: "websocket_notification",
          nodes: ["realtime-api"],
          assumption: "Realtime notification is represented as a WebSocket/SSE path."
        },
        {
          answer: "image upload",
          status: "satisfied",
          capability: "upload_media",
          nodes: ["media-bucket"],
          assumption: "Image upload uses a direct upload/media handling path with validation assumptions."
        },
        {
          answer: "monthly 100 dollar budget plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["alb", "app-a", "app-b", "database"],
          assumption: "Cost warning: this 99.99% target can exceed the monthly 100 dollar budget."
        }
      ]
    });
  });

  const prompt = [
    "월 100달러 예산으로 글로벌 동적 웹사이트 아키텍처를 설계해주세요.",
    "핵심 요구사항: 99.99% 가용성, 글로벌 사용자, React SPA, 복잡한 백엔드 로직, 실시간 알림, 이미지 업로드, 1초 이내 페이지 로딩",
    "필수 포함 컴포넌트: CloudFront, S3, Application Load Balancer, HTTPS listener, EC2 Auto Scaling Group, RDS Multi-AZ, WebSocket/API Gateway, VPC, CloudWatch, IAM",
    "아키텍처 플로우: 사용자 -> CloudFront -> S3, 사용자 -> CloudFront -> ALB -> EC2, EC2 -> RDS, 클라이언트 -> presigned URL -> S3, WebSocket 연결 경로 명시",
    "예산 최적화와 성능 최적화 방안도 함께 제안해주세요."
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.match(requestedPrompt, /Amazon Q Architecture Brief/);
  assert.match(requestedPrompt, /Persistent AWS\/Terraform reference knowledge pack/);
  assert.match(requestedPrompt, /User supplied a detailed architecture brief/);
  assert.match(requestedPrompt, /AUTO_SCALING_GROUP is a supported ResourceNode\.type/);
  assert.match(requestedPrompt, /ArchitectureDecisionSpace/);
  assert.match(requestedPrompt, /direct_media_upload/);
  assert.match(requestedInstructions, /persistent compact AWS\/Terraform referenceKnowledge payload/);
  const payload = requestedPayload as {
    referenceKnowledge?: {
      version?: string;
      size?: string;
      sourceUrls?: string[];
      guidance?: string[];
      generatedResourceCatalog?: Array<{
        nodeType?: string;
        terraformBlockType?: string;
        terraformResourceType?: string;
      }>;
    };
    architectureDecisionSpace?: {
      unsupportedSubstitutions?: Array<{ requestedService?: string }>;
      coverageRequirements?: string[];
    };
  };
  assert.equal(payload.referenceKnowledge?.version, "aws-reference-pack-2026-07-07");
  assert.equal(payload.referenceKnowledge?.size, "compact");
  assert.equal(payload.referenceKnowledge?.sourceUrls?.includes("https://aws.amazon.com/ko/solutions/"), true);
  assert.ok((payload.referenceKnowledge?.guidance?.length ?? 0) <= 8);
  const generatedCatalogByTerraformType = new Map(
    payload.referenceKnowledge?.generatedResourceCatalog?.map((definition) => [
      definition.terraformResourceType,
      definition
    ])
  );
  assert.equal(generatedCatalogByTerraformType.get("aws_codebuild_project")?.nodeType, "CODEBUILD_PROJECT");
  assert.equal(generatedCatalogByTerraformType.get("aws_codepipeline")?.nodeType, "CODEPIPELINE");
  assert.equal(generatedCatalogByTerraformType.get("aws_ssm_parameter")?.terraformBlockType, "data");
  assert.equal(
    payload.architectureDecisionSpace?.unsupportedSubstitutions?.some(
      (substitution) => substitution.requestedService === "Auto Scaling Group"
    ),
    false
  );
  assert.equal(response.title, "Detailed Global Dynamic Website");
});

test("createAmazonQArchitectureDraftResponse sends normalized requirements to Amazon Q when a normalizer is configured", async () => {
  const normalizerCalls: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const amazonQCalls: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const normalizerProvider = createFakeOpenAiNormalizerProvider((request) => {
    normalizerCalls.push(request);
    return JSON.stringify({
      intent: "dynamic_web_application",
      region: "ap-northeast-2",
      requiredResources: [
        "CODESTAR_CONNECTION",
        "CODEPIPELINE",
        "CODEBUILD_PROJECT",
        "CODEDEPLOY_APP",
        "CODEDEPLOY_DEPLOYMENT_GROUP",
        "LOAD_BALANCER",
        "AUTO_SCALING_GROUP",
        "EC2",
        "IAM_ROLE"
      ],
      resourceQuantities: {
        EC2: 3
      },
      forbiddenCapabilities: ["file_upload"],
      runtimeTopology: {
        trafficEntry: "LOAD_BALANCER",
        compute: "EC2",
        computeCount: 3,
        placement: "private_subnets",
        spreadAcrossPrivateSubnets: true,
        autoScaling: true
      },
      database: "simple",
      availability: "99.9",
      amazonQBrief: [
        "GitHub main branch deploys to AWS through CodeStar Connection, CodePipeline, CodeBuild, and CodeDeploy.",
        "Runtime must be ALB -> Auto Scaling Group -> exactly 3 EC2 instances spread across private subnets.",
        "No file upload resources or upload/media buckets are allowed."
      ]
    });
  });
  const provider = createFakeAmazonQProvider((request) => {
    amazonQCalls.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "GitHub main 브랜치에서 AWS로 배포되는 동적 웹 애플리케이션을 만들고 싶어.",
        "반드시 CodeStar Connection, CodePipeline, CodeBuild Project, CodeDeploy App, CodeDeploy Deployment Group을 포함해줘.",
        "런타임은 ALB 뒤의 EC2 3대와 Auto Scaling Group으로 구성해줘.",
        "파일 업로드는 없고, 서울 리전, 중간 규모, 99.9% 가용성으로 해줘.",
        "간단한 데이터, React/Vue/Angular, 복잡한 비즈니스 로직, 50-200만원, SSL 필수, 실시간 필요 없음, 직접 관리, 3초 이내, 10MB-100MB, 이벤트성 급증"
      ].join("\n")
    },
    {
      provider,
      requirementNormalizerProvider: normalizerProvider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(normalizerCalls.length, 1);
  assert.ok(amazonQCalls.length >= 1);
  assert.equal(normalizerCalls[0]?.target, "architecture_requirement_normalization");
  assert.match(normalizerCalls[0]?.instructions ?? "", /Requirement Normalizer/);
  assert.match(normalizerCalls[0]?.prompt ?? "", /Supported resource panel catalog/);

  const amazonQPayload = amazonQCalls.at(-1)?.payload as {
    normalizedRequirement?: {
      intent?: string;
      requiredResources?: string[];
      forbiddenCapabilities?: string[];
      resourceQuantities?: Record<string, number>;
      runtimeTopology?: { computeCount?: number; spreadAcrossPrivateSubnets?: boolean };
    };
  };
  assert.equal(amazonQPayload.normalizedRequirement?.intent, "dynamic_web_application");
  assert.deepEqual(amazonQPayload.normalizedRequirement?.resourceQuantities, { EC2: 3 });
  assert.equal(amazonQPayload.normalizedRequirement?.runtimeTopology?.computeCount, 3);
  assert.equal(amazonQPayload.normalizedRequirement?.runtimeTopology?.spreadAcrossPrivateSubnets, true);
  assert.equal(amazonQPayload.normalizedRequirement?.requiredResources?.includes("CODEPIPELINE"), true);
  assert.equal(amazonQPayload.normalizedRequirement?.forbiddenCapabilities?.includes("file_upload"), true);
  for (const amazonQCall of amazonQCalls) {
    assert.match(amazonQCall.prompt, /Normalized Architecture Intent Plan/);
    assert.match(amazonQCall.prompt, /exactly 3 EC2 instances/);
    assert.match(amazonQCall.prompt, /No file upload resources/);
  }
  if (amazonQCalls.length > 1) {
    const repairPayload = amazonQCalls.at(-1)?.payload as { validationIssues?: string[] };
    assert.equal(
      repairPayload.validationIssues?.some((issue) => /normalized requirement plan/i.test(issue)),
      true
    );
  }
});

test("createAmazonQArchitectureDraftResponse sends deterministic normalized requirements without an OpenAI normalizer", async () => {
  const amazonQCalls: Array<Parameters<AiTextProvider["generate"]>[0]> = [];
  const provider = createFakeAmazonQProvider((request) => {
    amazonQCalls.push(request);
    return createNormalizedRequirementPlan(request);
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "Dynamic web application for GitHub main branch deployment to AWS.",
        "Required resources: CodeStar Connection, CodePipeline, CodeBuild Project, CodeDeploy App, CodeDeploy Deployment Group, IAM Role.",
        "Runtime must be Application Load Balancer -> Auto Scaling Group -> EC2 3 instances spread across two private subnets.",
        "Database: simple data under 10GB.",
        "Frontend: React/Vue/Angular SPA.",
        "Backend: complex business logic with Spring Boot or Django.",
        "Region: Korea only Seoul ap-northeast-2.",
        "Budget: 50-200만원.",
        "SSL: required.",
        "File upload: none no file upload.",
        "Realtime: none no realtime.",
        "Management: direct management.",
        "Loading time: 3 seconds.",
        "Website size: 10MB-100MB.",
        "Traffic pattern: event spike.",
        "Downtime: 1 hour per day, 99.9% availability."
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const amazonQPayload = amazonQCalls.at(-1)?.payload as {
    normalizedRequirement?: {
      requiredResources?: string[];
      forbiddenCapabilities?: string[];
      resourceQuantities?: Record<string, number>;
      runtimeTopology?: {
        trafficEntry?: string;
        compute?: string;
        computeCount?: number;
        spreadAcrossPrivateSubnets?: boolean;
        autoScaling?: boolean;
      };
    };
  };

  assert.ok(amazonQPayload.normalizedRequirement);
  assert.deepEqual(amazonQPayload.normalizedRequirement.resourceQuantities, { EC2: 3 });
  assert.equal(amazonQPayload.normalizedRequirement.runtimeTopology?.trafficEntry, "LOAD_BALANCER");
  assert.equal(amazonQPayload.normalizedRequirement.runtimeTopology?.compute, "EC2");
  assert.equal(amazonQPayload.normalizedRequirement.runtimeTopology?.computeCount, 3);
  assert.equal(amazonQPayload.normalizedRequirement.runtimeTopology?.spreadAcrossPrivateSubnets, true);
  assert.equal(amazonQPayload.normalizedRequirement.runtimeTopology?.autoScaling, true);
  assert.equal(amazonQPayload.normalizedRequirement.requiredResources?.includes("CODEPIPELINE"), true);
  assert.equal(amazonQPayload.normalizedRequirement.requiredResources?.includes("AUTO_SCALING_GROUP"), true);
  assert.equal(amazonQPayload.normalizedRequirement.requiredResources?.includes("EC2"), true);
  assert.equal(amazonQPayload.normalizedRequirement.forbiddenCapabilities?.includes("file_upload"), true);
  assert.equal(amazonQPayload.normalizedRequirement.forbiddenCapabilities?.includes("realtime"), true);
  assert.ok(response.architectureJson.nodes.some((node) => node.type === "AUTO_SCALING_GROUP"));
  assert.ok(response.architectureJson.nodes.some((node) => node.type === "LOAD_BALANCER_TARGET_GROUP"));
  assert.ok(response.architectureJson.nodes.some((node) => node.type === "LAUNCH_TEMPLATE"));
  assert.match(amazonQCalls[0]?.prompt ?? "", /Normalized Architecture Intent Plan/);
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews that fail self-validation", async () => {
  const requestedPrompts: string[] = [];
  const requestedPayloads: unknown[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    requestedPayloads.push(request.payload);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Invalid Serverless Draft",
        architectureJson: {
          nodes: [
            {
              id: "app-server",
              type: "EC2",
              label: "Application Server",
              positionX: 120,
              positionY: 180,
              config: {}
            }
          ],
          edges: []
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Serverless Draft",
      architectureJson: {
        nodes: [
          {
            id: "api-gateway",
            type: "API_GATEWAY_REST_API",
            label: "Serverless API",
            positionX: 120,
            positionY: 180,
            config: {}
          },
          {
            id: "lambda-function",
            type: "LAMBDA",
            label: "Serverless Function",
            positionX: 360,
            positionY: 180,
            config: {}
          },
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 340,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 360,
            positionY: 340,
            config: {}
          }
        ],
        edges: [
          {
            id: "api-gateway-to-lambda-function",
            sourceId: "api-gateway",
            targetId: "lambda-function"
          },
          {
            id: "cdn-to-spa-bucket",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: sampleRequirementCoverage(["api-gateway", "lambda-function", "spa-bucket", "cdn"])
    });
  });

  const prompt = [
    "SPA (Single Page Application) (React/Vue 등)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)이지만 서버리스로 만들고 EC2는 쓰지 마.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /Persistent AWS\/Terraform reference knowledge pack/);
  assert.match(requestedPrompts[1] ?? "", /Persistent AWS\/Terraform reference knowledge pack/);
  assert.match(requestedPrompts[1] ?? "", /failed SketchCatch self-validation/);
  assert.match(requestedPrompts[1] ?? "", /preview includes EC2/);
  for (const payload of requestedPayloads) {
    const referenceKnowledge = (payload as { referenceKnowledge?: { size?: string } }).referenceKnowledge;
    assert.equal(referenceKnowledge?.size, "compact");
  }
  assert.equal(response.title, "Serverless Draft");
  assert.equal(response.architectureJson.nodes.some((node) => node.type === "EC2"), false);
  assert.equal(response.architectureJson.nodes.some((node) => node.type === "LAMBDA"), true);
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with broken area layout", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Broken Area Layout Draft",
        architectureJson: {
          nodes: [
            {
              id: "vpc-main",
              type: "VPC",
              label: "Main VPC",
              positionX: 100,
              positionY: 100,
              config: {}
            },
            {
              id: "public-subnet-a",
              type: "SUBNET",
              label: "Public Subnet A",
              positionX: 260,
              positionY: 180,
              config: {
                vpcId: "vpc-main"
              }
            },
            {
              id: "private-subnet-a",
              type: "SUBNET",
              label: "Private Subnet A",
              positionX: 320,
              positionY: 220,
              config: {
                vpcId: "vpc-main"
              }
            },
            {
              id: "web-server",
              type: "EC2",
              label: "Web Server",
              positionX: 420,
              positionY: 230,
              config: {
                subnetId: "public-subnet-a"
              }
            }
          ],
          edges: [
            {
              id: "vpc-main-to-public-subnet-a",
              sourceId: "vpc-main",
              targetId: "public-subnet-a",
              label: "contains"
            }
          ]
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Clean Area Layout Draft",
      architectureJson: {
        nodes: [
          {
            id: "vpc-main",
            type: "VPC",
            label: "Main VPC",
            positionX: 100,
            positionY: 100,
            config: {}
          },
          {
            id: "public-subnet-a",
            type: "SUBNET",
            label: "Public Subnet A",
            positionX: 130,
            positionY: 130,
            config: {
              vpcId: "vpc-main"
            }
          },
          {
            id: "web-server",
            type: "EC2",
            label: "Web Server",
            positionX: 160,
            positionY: 150,
            config: {
              subnetId: "public-subnet-a"
            }
          },
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 420,
            positionY: 100,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 620,
            positionY: 100,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 420,
            positionY: 280,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "Application Database",
            positionX: 620,
            positionY: 280,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "vpc-main-to-public-subnet-a",
            sourceId: "vpc-main",
            targetId: "public-subnet-a",
            label: "contains"
          },
          {
            id: "cdn-to-spa-bucket",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["web-server", "spa-bucket", "cdn", "database", "db-subnet-group"]),
        {
          answer: "database required",
          status: "satisfied",
          capability: "relational_database_multi_az",
          nodes: ["database", "db-subnet-group"],
          assumption: "RDS Multi-AZ is represented for availability-sensitive database requirements."
        }
      ]
    });
  });

  const prompt = [
    "어떤 종류의 웹사이트인가요? API 서버 (모바일 앱 백엔드)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스가 필요한가요? 간단한 데이터 (사용자 정보, 게시글 등 < 10GB)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드가 필요한가요? 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10-50만원 (적당한 성능)입니다.",
    "SSL 인증서(HTTPS)가 필요한가요? 필수 (보안 중요)입니다.",
    "파일 업로드 기능이 있나요? 없음 (텍스트만)입니다.",
    "실시간 기능이 필요한가요? 필요 없음입니다.",
    "관리 복잡도 선호도는 반관리형 (일부 서버 관리)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB-100MB (일반적인 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /Layout rules: VPC and SUBNET nodes are area boxes/);
  assert.match(requestedPrompts[0] ?? "", /SECURITY_GROUP nodes are regular VPC-scoped resource icons/);
  assert.match(requestedPrompts[1] ?? "", /failed SketchCatch self-validation/);
  assert.match(requestedPrompts[1] ?? "", /fully inside parent area/);
  assert.match(requestedPrompts[1] ?? "", /overlap without full containment/);
  assert.equal(response.title, "Clean Area Layout Draft");
  assert.deepEqual(
    response.architectureJson.nodes.find((node) => node.id === "web-server")?.config,
    {
      subnetId: "public-subnet-a"
    }
  );
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with arrows crossing unrelated resources", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Blocked Edge Draft",
        architectureJson: {
          nodes: [
            {
              id: "app-server",
              type: "EC2",
              label: "App Server",
              positionX: 100,
              positionY: 100,
              config: {}
            },
            {
              id: "database",
              type: "RDS",
              label: "Database",
              positionX: 500,
              positionY: 100,
              config: {}
            },
            {
              id: "asset-bucket",
              type: "S3",
              label: "Asset Bucket",
              positionX: 300,
              positionY: 110,
              config: {}
            }
          ],
          edges: [
            {
              id: "app-server-to-database",
              sourceId: "app-server",
              targetId: "database",
              label: "writes"
            }
          ]
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Clear Edge Draft",
      architectureJson: {
        nodes: [
          {
            id: "app-server",
            type: "EC2",
            label: "App Server",
            positionX: 100,
            positionY: 100,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "Database",
            positionX: 500,
            positionY: 100,
            config: {}
          },
          {
            id: "asset-bucket",
            type: "S3",
            label: "Asset Bucket",
            positionX: 300,
            positionY: 260,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 100,
            positionY: 420,
            config: {}
          }
        ],
        edges: [
          {
            id: "app-server-to-database",
            sourceId: "app-server",
            targetId: "database",
            label: "writes"
          },
          {
            id: "cdn-to-asset-bucket",
            sourceId: "cdn",
            targetId: "asset-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: sampleRequirementCoverage(["app-server", "database", "asset-bucket", "cdn"])
    });
  });

  const prompt = [
    "?대뼡 醫낅쪟???뱀궗?댄듃?멸??? API ?쒕쾭 (紐⑤컮????諛깆뿏???낅땲??",
    "?덉긽 ?몃옒??洹쒕え??以묎컙 洹쒕え (??1,000紐? ?숈떆 50紐??낅땲?? daily traffic 1000 concurrent users 50",
    "?곗씠?곕쿋?댁뒪媛 ?꾩슂?쒓??? 媛꾨떒???곗씠??(?ъ슜???뺣낫, 寃뚯떆湲 ??< 10GB)?낅땲??",
    "?꾨줎?몄뿏??湲곗닠? React/Vue/Angular (SPA ?꾨젅?꾩썙???낅땲??",
    "諛깆뿏?쒓? ?꾩슂?쒓??? 媛꾨떒??API (Node.js, Python Flask ???낅땲??",
    "二쇱슂 ?ъ슜??吏??? ?쒓뎅留?(?쒖슱 由ъ쟾)?낅땲?? korea seoul region",
    "???덉궛 踰붿쐞??10-50留뚯썝 (?곷떦???깅뒫)?낅땲?? budget cost 100000 KRW",
    "SSL ?몄쬆??HTTPS)媛 ?꾩슂?쒓??? ?꾩닔 (蹂댁븞 以묒슂)?낅땲??",
    "?뚯씪 ?낅줈??湲곕뒫???덈굹?? ?놁쓬 (?띿뒪?몃쭔)?낅땲??",
    "?ㅼ떆媛?湲곕뒫???꾩슂?쒓??? ?꾩슂 ?놁쓬?낅땲?? no realtime chat notification",
    "愿由?蹂듭옟???좏샇?꾨뒗 諛섍?由ы삎 (?쇰? ?쒕쾭 愿由??낅땲?? managed operations",
    "?섏씠吏 濡쒕뵫 ?쒓컙 紐⑺몴??3珥??대궡 (?곷떦???낅땲?? loading time 3 seconds",
    "?꾩껜 ?뱀궗?댄듃 ?ш린??10MB-100MB (?쇰컲?곸씤 ?ъ씠???낅땲??",
    "?몃옒???⑦꽩? ?쇱젙??(?섎（ 醫낆씪 鍮꾩듂)?낅땲?? traffic pattern steady",
    "?쒕퉬??以묐떒 ?덉슜 ?쒓컙? ??1?쒓컙 ?대궡 (99.9% 媛?⑹꽦)?낅땲??"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /do not route visible arrows through unrelated resources/);
  assert.match(requestedPrompts[1] ?? "", /edge path crosses unrelated resource/);
  assert.equal(response.title, "Clear Edge Draft");
  assert.equal(response.architectureJson.nodes.find((node) => node.id === "asset-bucket")?.positionY, 260);
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with overlapping node labels", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Cramped Label Draft",
        architectureJson: {
          nodes: [
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Public Entry",
              positionX: 280,
              positionY: 120,
              config: {}
            },
            {
              id: "logs",
              type: "CLOUDWATCH_LOG_GROUP",
              label: "Lambda Logs",
              positionX: 350,
              positionY: 125,
              config: {}
            },
            {
              id: "bucket",
              type: "S3",
              label: "Static Content Bucket",
              positionX: 430,
              positionY: 120,
              config: {}
            }
          ],
          edges: []
        },
        requirementCoverage: sampleRequirementCoverage(["cdn", "logs", "bucket"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Readable Label Draft",
      architectureJson: {
        nodes: [
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Public Entry",
            positionX: 120,
            positionY: 120,
            config: {}
          },
          {
            id: "logs",
            type: "CLOUDWATCH_LOG_GROUP",
            label: "Lambda Logs",
            positionX: 420,
            positionY: 120,
            config: {}
          },
          {
            id: "bucket",
            type: "S3",
            label: "Static Content Bucket",
            positionX: 720,
            positionY: 120,
            config: {}
          }
        ],
        edges: []
      },
      requirementCoverage: sampleRequirementCoverage(["cdn", "logs", "bucket"])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createStaticWebsiteCompletePrompt("file upload: none no file upload text only")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /overlapping visual or label bounds/);
  assert.equal(response.title, "Readable Label Draft");
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with an S3 node fully overlapping another resource", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Overlapped S3 Draft",
        architectureJson: {
          nodes: [
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Public Entry",
              positionX: 240,
              positionY: 120,
              config: {}
            },
            {
              id: "site-bucket",
              type: "S3",
              label: "Static Content Bucket",
              positionX: 240,
              positionY: 120,
              config: {}
            }
          ],
          edges: []
        },
        requirementCoverage: sampleRequirementCoverage(["cdn", "site-bucket"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Separated S3 Draft",
      architectureJson: {
        nodes: [
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Public Entry",
            positionX: 120,
            positionY: 120,
            config: {}
          },
          {
            id: "site-bucket",
            type: "S3",
            label: "Static Content Bucket",
            positionX: 420,
            positionY: 120,
            config: {}
          }
        ],
        edges: []
      },
      requirementCoverage: sampleRequirementCoverage(["cdn", "site-bucket"])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createStaticWebsiteCompletePrompt("file upload: none no file upload text only")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /site-bucket \(S3\).*overlapping visual or label bounds/);
  assert.equal(response.title, "Separated S3 Draft");
});

test("createAmazonQArchitectureDraftResponse asks the global deployment scope question with readable Korean text", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "website type: dynamic SPA website",
        "traffic: medium daily traffic 1000 concurrent users 50",
        "database: PostgreSQL database required",
        "frontend: React/Vue/Angular SPA framework",
        "backend: simple API Node.js",
        "region: global users including US and Europe",
        "budget cost: 100 monthly",
        "SSL HTTPS: required",
        "file upload: none no file upload text only",
        "realtime: none no realtime features",
        "management preference: semi-managed operations",
        "loading time: 1 second",
        "website size: 10MB-100MB",
        "traffic pattern: steady traffic",
        "downtime tolerance: 99.9% availability"
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "글로벌 사용자와 1초 로딩 목표를 어떤 범위로 설계할까요?");
  assert.deepEqual(response.suggestions, [
    "CloudFront 글로벌 + API/RDS는 단일 리전",
    "다중 리전 API까지 포함",
    "MVP는 단일 리전, 추후 다중 리전 확장 경고 표시"
  ]);
});

test("createAmazonQArchitectureDraftResponse does not fake unsupported multi-region Terraform topology", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "website type: static website blog portfolio",
        "traffic: medium daily traffic 1000 concurrent users 50",
        "database: simple user and post data under 10GB",
        "frontend: React Vue Angular SPA",
        "backend: simple API Node.js Flask",
        "region: global users in US and Europe",
        "budget: under KRW 100000 per month minimum cost",
        "SSL HTTPS: optional HTTP acceptable",
        "file upload: documents and video mixed files",
        "realtime: real-time chat",
        "management: semi-managed",
        "loading time: 3 seconds",
        "website size: 10MB-100MB",
        "traffic pattern: event spikes",
        "availability: 99%",
        "global deployment: 다중 리전 API까지 포함",
        "realtime implementation: HTTP 메시지 전송 + SSE 수신 경로"
      ].join("\n")
    },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected an execution-boundary clarification response");
  }
  assert.match(response.question, /단일 AWS 리전/);
  assert.ok(response.suggestions.some((suggestion) => /CloudFront.*단일 리전/u.test(suggestion)));
});

test("createAmazonQArchitectureDraftResponse asks the realtime implementation question with readable Korean text", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "website type: dynamic SPA website",
        "traffic: medium daily traffic 1000 concurrent users 50",
        "database: PostgreSQL database required",
        "frontend: React/Vue/Angular SPA framework",
        "backend: simple API Node.js",
        "region: Korea only Seoul region ap-northeast-2",
        "budget cost: 100 monthly",
        "SSL HTTPS: required",
        "file upload: none no file upload text only",
        "realtime: real-time notification",
        "management preference: semi-managed operations",
        "loading time: 1 second",
        "website size: 10MB-100MB",
        "traffic pattern: steady traffic",
        "downtime tolerance: 99.9% availability"
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "실시간 알림은 어떤 방식으로 표현할까요?");
  assert.deepEqual(response.suggestions, [
    "WebSocket 연결 경로",
    "SSE 단방향 알림 경로",
    "간단 폴링 방식과 비용 절감 경고"
  ]);
});

test("createAmazonQArchitectureDraftResponse asks a chat-specific realtime implementation question", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "website type: dynamic web application",
        "traffic: medium daily traffic 1000 concurrent users 50",
        "database: medium data 10GB-100GB",
        "frontend: HTML/CSS/JS only pure web",
        "backend: simple API Node.js",
        "region: Korea only Seoul region ap-northeast-2",
        "budget: 50-200만원 high performance",
        "SSL HTTPS: optional HTTP acceptable",
        "file upload: image upload only",
        "realtime: real-time chat",
        "management: semi-managed",
        "loading time: 3 seconds",
        "website size: 100MB-1GB",
        "traffic pattern: event spikes",
        "availability: 99%"
      ].join("\n")
    },
    { provider, creditPolicy: confirmedCreditPolicy }
  );

  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.question, "실시간 채팅 연결은 어떤 방식으로 표현할까요?");
  assert.deepEqual(response.suggestions, [
    "WebSocket 양방향 연결 경로",
    "HTTP 메시지 전송 + SSE 수신 경로",
    "간단 폴링 방식과 비용 절감 경고"
  ]);
});

function createKoreaNoUploadNoRealtimePrompt(): string {
  return [
    "website type: dynamic SPA website with simple API and DB",
    "traffic: small daily traffic under 100 concurrent users under 10",
    "database: PostgreSQL database required",
    "frontend: React/Vue/Angular SPA framework",
    "backend: simple API Node.js or Python Flask",
    "region: Korea only Seoul region ap-northeast-2",
    "budget cost: 100 monthly",
    "SSL HTTPS: optional HTTP is acceptable",
    "file upload: none no file upload text only",
    "realtime: none no realtime features",
    "management preference: semi-managed operations",
    "loading time: 1 second",
    "website size: 10MB-100MB",
    "traffic pattern: steady traffic",
    "downtime tolerance: 99.99% availability",
    "tradeoff: target architecture with cost warning",
    "global deployment: CloudFront for static assets only, API and RDS single Seoul region",
    "database budget decision: include database"
  ].join("\n");
}

function createDynamicWebDeploymentSelectionPrompt(): string {
  return [
    "웹서비스를 배포하고 싶어",
    "어떤 종류의 웹사이트인가요? 동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스가 필요한가요? 간단한 데이터 (사용자 정보, 게시글 등 < 10GB)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드가 필요한가요? 복잡한 비즈니스 로직 (Spring Boot, Django 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 50-200만원 (고성능)입니다.",
    "SSL 인증서(HTTPS)가 필요한가요? 선택사항 (HTTP도 괜찮음)입니다.",
    "파일 업로드 기능이 있나요? 없음 (텍스트만)입니다.",
    "실시간 기능이 필요한가요? 필요 없음입니다.",
    "관리 복잡도 선호도는 반관리형 (일부 서버 관리)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB-100MB (일반적인 사이트)입니다.",
    "트래픽 패턴은 시간대별 차이 (낮에 많음)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");
}

function createKoreanSpaQuestionnairePrompt(): string {
  return [
    "어떤 종류의 웹사이트인가요?",
    "SPA (Single Page Application) (React/Vue 등)",
    "예상 트래픽 규모는?",
    "중간 규모 (일 1,000명, 동시 50명)",
    "데이터베이스가 필요한가요?",
    "중간 규모 데이터 (10GB ~ 100GB)",
    "백엔드가 필요한가요?",
    "간단한 API (Node.js, Python Flask 등)",
    "주요 사용자 지역은?",
    "아시아 태평양 (도쿄, 싱가포르 포함)",
    "월 예산 범위는?",
    "200만원 이상 (엔터프라이즈급)",
    "SSL 인증서(HTTPS)가 필요한가요?",
    "선택사항 (HTTP도 괜찮음)",
    "파일 업로드 기능이 있나요? (이미지, 문서 등)",
    "이미지만 (프로필, 게시글 이미지)",
    "실시간 기능이 필요한가요? (채팅, 알림 등)",
    "실시간 알림",
    "관리 복잡도 선호도는?",
    "반관리형 (일부 서버 관리)",
    "페이지 로딩 시간 목표는?",
    "5초 이내 (느려도 괜찮음)",
    "전체 웹사이트 크기는?",
    "10MB-100MB (일반적인 사이트)",
    "트래픽 패턴은?",
    "이벤트성 급증 (특정 시기에만)",
    "서비스 중단 허용 시간은?",
    "월 1시간 이내 (99.9% 가용성)",
    "실시간 채팅 연결은 어떤 방식으로 표현할까요?",
    "HTTP 메시지 전송 + SSE 수신 경로"
  ].join("\n");
}

function createKoreanSsrMixedUploadQuestionnairePrompt(): string {
  return [
    "website type: dynamic web application shopping mall board member system",
    "traffic: medium traffic daily 1000 concurrent 50",
    "traffic pattern: event spike bursty traffic",
    "database: medium data 10GB to 100GB",
    "frontend technology: Next.js Nuxt.js SSR server side rendering required",
    "backend: simple API Node.js Python Flask",
    "region: Korea only Seoul region ap-northeast-2",
    "monthly budget: 50-200 manwon high performance high budget",
    "SSL HTTPS: required mandatory",
    "file upload: mixed files documents and video included",
    "realtime feature: realtime notification",
    "management preference: semi-managed some server management",
    "loading time target: within 5 seconds",
    "website size: 10MB-100MB general website",
    "downtime tolerance: monthly 8 hours within 99% availability",
    "realtime notification transport: SSE one-way notification path"
  ].join("\n");
}

function createSpaMicroservicesQuestionnairePrompt(): string {
  return [
    "website type: SPA Single Page Application React Vue",
    "traffic: medium traffic daily 1000 concurrent 50",
    "database: medium data 10GB to 100GB",
    "backend: microservices multiple separated services",
    "region: Asia Pacific APAC Tokyo Singapore ap-northeast-1",
    "monthly budget: 10-50 manwon normal moderate performance",
    "SSL HTTPS: optional HTTP acceptable",
    "file upload: mixed files documents and video included",
    "realtime: none no realtime features",
    "management preference: fully managed serverless minimal operations",
    "loading time target: within 3 seconds",
    "website size: 10MB-100MB general website",
    "traffic pattern: time-of-day daytime peak",
    "downtime tolerance: zero downtime 99.99 availability"
  ].join("\n");
}

function createGlobalSelfManagedSpaQuestionnairePrompt(): string {
  return [
    "website type: SPA Single Page Application React Vue",
    "traffic: large traffic daily 10000 concurrent 500",
    "database: 대용량 데이터 100GB 이상 complex queries large database",
    "backend: complex business logic Spring Boot Django",
    "region: global users United States Europe included",
    "monthly budget: enterprise 200 manwon or more",
    "SSL HTTPS: optional HTTP acceptable",
    "file upload: large files over 100MB",
    "realtime feature: realtime data updates stocks games",
    "management preference: 직접 관리 서버 직접 운영 self-managed",
    "loading time target: within 1 second",
    "website size: 10MB-100MB general website",
    "traffic pattern: time-of-day daytime peak",
    "downtime tolerance: zero downtime 99.99 availability",
    "global scope: CloudFront global with API and RDS single region",
    "realtime transport: WebSocket connection path"
  ].join("\n");
}

function createGlobalSelfManagedSpaWithoutBackendAnswerPrompt(): string {
  return [
    "website type: SPA Single Page Application React admin dashboard",
    "traffic: large traffic daily 10000+ concurrent 500+",
    "database: large data 100GB or more complex queries PostgreSQL database required",
    "region: global users including US Europe Asia, but accept single primary AWS region with CDN warning",
    "monthly budget: 50-200 manwon high performance",
    "SSL HTTPS: required",
    "file upload: diverse files documents and images under 100MB",
    "realtime feature: realtime chat",
    "realtime implementation: WebSocket connection path",
    "management preference: self-managed direct server operation EC2 Auto Scaling behind ALB",
    "loading time target: within 1 second",
    "website size: 100MB-1GB image-heavy",
    "traffic pattern: event burst spikes",
    "availability: 99.99 no downtime",
    "deployment path: Git CI/CD handoff requested"
  ].join("\n");
}

function createKoreanApiServerPollingQuestionnairePrompt(): string {
  return [
    "website type: API server mobile app backend",
    "traffic: large traffic daily 10000 concurrent 500",
    "database: simple data user info posts under 10GB",
    "frontend technology: mobile app native client",
    "region: Korea only Seoul region ap-northeast-2",
    "monthly budget: enterprise 200 manwon or more",
    "SSL HTTPS: required mandatory security important",
    "file upload: image upload only profile and post images",
    "realtime feature: realtime data updates stocks games",
    "management preference: direct management self-managed servers",
    "loading time target: within 1 second",
    "website size: 10MB-100MB general website",
    "traffic pattern: event spike bursty traffic",
    "downtime tolerance: monthly 1 hour within 99.9 availability",
    "realtime notification transport: simple polling with cost warning"
  ].join("\n");
}

function createKoreanLowBudgetDbFreeApiQuestionnairePrompt(): string {
  return [
    "website type: API server mobile app backend",
    "traffic: small traffic under daily 100 users concurrent 10",
    "database question answer: medium data 10GB-100GB",
    "frontend technology: mobile app native client",
    "region: Asia Pacific APAC Tokyo and Singapore included",
    "monthly budget: under 10 manwon minimum cost",
    "SSL HTTPS: optional HTTP acceptable",
    "file upload: image upload only profile and post images",
    "realtime feature: realtime notification",
    "management preference: semi-managed some server management",
    "loading time target: within 5 seconds",
    "website size: 10MB-100MB general website",
    "traffic pattern: time-of-day daytime peak",
    "downtime tolerance: monthly 8 hours within 99 availability; availability: 99%",
    "realtime notification transport: simple polling with cost warning",
    "final database budget decision: DB 없이 만들기"
  ].join("\n");
}

function createServerlessBoardQuestionnairePrompt(): string {
  return [
    "website type: dynamic web application community board",
    "traffic: small traffic daily under 100 users concurrent under 10",
    "database: simple data user info and posts under 10GB, DB included proceed",
    "frontend technology: React SPA",
    "backend: simple API Node.js",
    "region: Asia Pacific APAC Tokyo and Singapore included",
    "monthly budget: 10-50 manwon moderate performance",
    "SSL HTTPS: required mandatory",
    "file upload: images only profile and post images",
    "realtime feature: realtime notifications",
    "realtime implementation: simple polling with cost warning",
    "management preference: fully managed serverless minimal operations",
    "loading time target: within 3 seconds",
    "website size: 10MB-100MB general website",
    "traffic pattern: steady traffic",
    "availability: monthly 1 hour within 99.9 availability"
  ].join("\n");
}

function createDbFreeSsrServerlessQuestionnairePrompt(): string {
  return [
    "website type: dynamic web application shopping mall board member system",
    "traffic: bursty event spike normally low but sudden event traffic",
    "database question answer: simple data user info posts under 10GB",
    "frontend technology: Next.js Nuxt.js SSR server side rendering required",
    "backend: simple API Node.js Python Flask",
    "region: Asia Pacific APAC Tokyo and Singapore included",
    "monthly budget: under 10 manwon minimum cost",
    "SSL HTTPS: required mandatory security important",
    "file upload: image upload only profile and post images",
    "realtime feature: realtime data updates stocks games",
    "management preference: fully managed serverless minimal operations",
    "loading time target: within 5 seconds",
    "website size: 10MB-100MB general website",
    "traffic pattern: event spike bursty traffic",
    "downtime tolerance: no preference none",
    "realtime implementation: SSE one-way notification path",
    "final database budget decision: DB 없이 만들기 no database make without DB"
  ].join("\n");
}

function createStaticPortfolioQuestionnairePrompt(): string {
  return [
    "website type: static website blog portfolio company intro",
    "traffic: small traffic daily under 100 users concurrent under 10",
    "database: none no database static content only",
    "frontend: HTML/CSS/JS only pure web static",
    "backend: none no backend static site",
    "region: Korea only Seoul region ap-northeast-2",
    "monthly budget: under 10 manwon minimum cost",
    "SSL HTTPS: required mandatory security important",
    "file upload: none no file upload text only",
    "realtime: none no realtime features",
    "management preference: fully managed serverless minimal operations",
    "loading time: 3 seconds",
    "website size: under 10MB",
    "traffic pattern: steady traffic",
    "downtime tolerance: monthly 8 hours within 99% availability"
  ].join("\n");
}

function createStaticPortfolioWithOptionalQueuePrompt(): string {
  return [
    createStaticPortfolioQuestionnairePrompt(),
    "Required supporting component: SQS Queue for optional asynchronous notifications."
  ].join("\n");
}

function createStaticProviderPreview(includeQueue: boolean): string {
  const nodes = [
    {
      id: "site-bucket",
      type: "S3",
      label: "Static Website Bucket",
      positionX: 120,
      positionY: 180,
      config: { versioning: true }
    },
    {
      id: "cdn",
      type: "CLOUDFRONT",
      label: "CloudFront CDN",
      positionX: 360,
      positionY: 180,
      config: { originResourceId: "site-bucket" }
    },
    ...(includeQueue
      ? [
          {
            id: "provider-queue",
            type: "SQS_QUEUE",
            label: "Optional Notification Queue",
            positionX: 600,
            positionY: 180,
            config: {}
          }
        ]
      : [])
  ];

  return JSON.stringify({
    status: "preview",
    title: "Cost Optimized Static Site",
    architectureJson: {
      nodes,
      edges: [
        {
          id: "cdn-to-site",
          sourceId: "cdn",
          targetId: "site-bucket",
          label: "origin"
        }
      ]
    },
    requirementCoverage: sampleRequirementCoverage(nodes.map(({ id }) => id)),
    assumptions: ["The excluded optional queue is not required for static delivery."],
    explanations: ["S3 and CloudFront provide the selected static delivery path."],
    summary: "Amazon Q recommended a managed static delivery path.",
    highlights: ["Low operational overhead"],
    nextActions: ["Review domain and SSL certificate requirements."]
  });
}

function createMultiCandidateDraftPrompt(): string {
  return [
    "Required components: ECS Cluster, ECS Service, ECS Task Definition, SQS Queue, CodeBuild Project, and SSM Parameter.",
    "Architecture flow: Fargate service processes queue jobs and CodeBuild packages deployments."
  ].join("\n");
}

function createSafeCandidateOnlyDraftPrompt(): string {
  return [
    "Required components: SQS Queue and CodeBuild Project.",
    "Architecture flow: CodeBuild packages a worker that publishes optional jobs to SQS."
  ].join("\n");
}

function createStructuralCandidateDraftPrompt(): string {
  return [
    "Required components: VPC, Subnet, Internet Gateway, EC2, RDS, S3, and CloudFront.",
    "Architecture flow: CloudFront to S3 and Internet Gateway to VPC to Subnet to EC2 to RDS."
  ].join("\n");
}

function createGitCiCdEc2HandoffQuestionnairePrompt(): string {
  return [
    "website type: dynamic web application admin board member system",
    "traffic: medium traffic daily 1000 concurrent 50",
    "database: simple data user info posts under 10GB PostgreSQL database required",
    "frontend technology: React SPA",
    "backend: complex business logic Spring Boot Django",
    "region: Korea only Seoul region ap-northeast-2",
    "monthly budget: 10-50 manwon moderate performance",
    "SSL HTTPS: required mandatory",
    "file upload: none no file upload text only",
    "realtime: none no realtime features",
    "management preference: self-managed direct server operation EC2 Auto Scaling behind ALB",
    "deployment path: Git CI/CD handoff requested AWS CodePipeline CodeBuild CodeDeploy",
    "loading time target: within 3 seconds",
    "website size: 10MB-100MB general website",
    "traffic pattern: time-of-day daytime peak",
    "downtime tolerance: monthly 1 hour within 99.9 availability"
  ].join("\n");
}

function createVoiceTranscriptionApiQuestionnairePrompt(): string {
  return [
    "website type: API server mobile app backend",
    "traffic: small traffic daily under 100 users concurrent under 10",
    "database: simple data user info posts under 10GB PostgreSQL database required",
    "frontend technology: mobile app native client",
    "backend: simple API Node.js Python Flask",
    "region: Asia Pacific APAC Tokyo and Singapore included",
    "monthly budget: under 10 manwon minimum cost",
    "SSL HTTPS: required mandatory security important",
    "file upload: mixed files documents video images included",
    "voice requirement input: Transcribe audio to text and show back to user for confirmation before Requirement Prompt",
    "realtime: none no realtime features",
    "management preference: semi-managed some server management",
    "loading time target: within 5 seconds",
    "website size: 10MB-100MB general website",
    "traffic pattern: unpredictable",
    "downtime tolerance: monthly 8 hours within 99% availability"
  ].join("\n");
}

function createStaticWebsiteCompletePrompt(uploadAnswer: string): string {
  return [
    "website type: static website blog portfolio",
    "traffic: medium daily traffic 1000 concurrent users 50",
    "database: none no database static content only",
    "frontend: HTML/CSS/JS only pure web",
    "backend: none no backend static site",
    "region: Korea only Seoul region ap-northeast-2",
    "budget cost: 100 monthly minimum cost",
    "SSL HTTPS: optional HTTP is acceptable",
    uploadAnswer,
    "realtime: none no realtime features",
    "management preference: fully managed serverless",
    "loading time: 3 seconds",
    "website size: under 10MB",
    "traffic pattern: steady traffic",
    "downtime tolerance: 99.9% availability"
  ].join("\n");
}

function node(
  id: string,
  type: ArchitectureJson["nodes"][number]["type"],
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    config: {},
    id,
    label,
    positionX,
    positionY,
    type
  };
}

function configuredNode(
  architectureNode: ArchitectureJson["nodes"][number],
  config: ArchitectureJson["nodes"][number]["config"]
): ArchitectureJson["nodes"][number] {
  return {
    ...architectureNode,
    config: {
      ...architectureNode.config,
      ...config
    }
  };
}

function readDecisionSpace(payload: unknown): {
  answerProfile: { upload?: string };
  preferredPatterns: Array<{ id?: string }>;
} {
  const decisionSpace = (payload as { architectureDecisionSpace?: unknown }).architectureDecisionSpace;

  assert.ok(decisionSpace && typeof decisionSpace === "object");

  return decisionSpace as {
    answerProfile: { upload?: string };
    preferredPatterns: Array<{ id?: string }>;
  };
}

function assertGraphHasNoDanglingEdges(architectureJson: ArchitectureJson): void {
  const nodeIds = new Set(architectureJson.nodes.map((node) => node.id));

  assert.ok(
    architectureJson.edges.every(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
    )
  );
}

function sampleRequirementCoverage(nodes: string[] = []): Array<{
  answer: string;
  status: string;
  capability: string;
  nodes: string[];
  assumption: string;
}> {
  return [
    {
      answer: "baseline selected answers",
      status: "satisfied",
      capability: "selectedPattern: baseline_architecture; rejectedPatterns: not applicable",
      nodes,
      assumption: "Selected answers are represented by the listed topology nodes with pattern trade-off rationale."
    }
  ];
}

function deploymentRequirementCoverage(nodes: string[] = []): Array<{
  answer: string;
  status: string;
  capability: string;
  nodes: string[];
  assumption: string;
}> {
  return [
    {
      answer: "deployment selected answers",
      status: "satisfied",
      capability:
        "selectedPattern: alb_asg_ec2; rejectedPatterns: serverless because the user explicitly required EC2. Backend API entry uses ALB to Auto Scaling Group to EC2. High availability uses redundant EC2 placement across private subnets with Auto Scaling Group failover capacity.",
      nodes,
      assumption: "No file upload path is included; any object storage is static delivery or deployment artifact storage only."
    }
  ];
}

function createFakeAmazonQProvider(generate: (request: Parameters<AiTextProvider["generate"]>[0]) => string): AiTextProvider {
  return {
    provider: "amazon_q",
    service: "amazon_q_business",
    model: "fake-q-application",
    generate: async (request) => {
      const text = generate(request);

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}

function createNormalizedRequirementPlan(
  request: Parameters<AiTextProvider["generate"]>[0]
): string {
  const payload = request.payload as {
    normalizedRequirement?: Record<string, unknown> | undefined;
  };

  return JSON.stringify({
    status: "plan",
    title: "Verified Requirement Plan",
    ...(payload.normalizedRequirement ?? {})
  });
}

function createFakeOpenAiNormalizerProvider(
  generate: (request: Parameters<AiTextProvider["generate"]>[0]) => string
): AiTextProvider {
  return {
    provider: "openai",
    service: "openai_responses",
    model: "fake-openai-normalizer",
    generate: async (request) => {
      const text = generate(request);

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}
