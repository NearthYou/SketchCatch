import type { DiagramJson, DiagramNode, DiagramNodeKind, TerraformBlockType } from "./index.js";

export const TEMPLATE_IDS = [
  "static-web-hosting",
  "minimal-serverless-api",
  "full-serverless-web-app",
  "three-tier-web-app",
  "ecs-fargate-container-app",
  "eks-container-app"
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];
export type TemplateProvider = "aws" | "kubernetes";

export type TemplateResourceDefinition = {
  readonly id: string;
  readonly label: string;
  readonly provider: TemplateProvider;
  readonly terraformBlockType: TerraformBlockType;
  readonly terraformResourceType: string;
  readonly values: Record<string, unknown>;
  readonly position: { readonly x: number; readonly y: number };
  readonly parentResourceId?: string;
  readonly kind?: DiagramNodeKind;
};

export type TemplateRelationship = {
  readonly id: string;
  readonly sourceResourceId: string;
  readonly targetResourceId: string;
  readonly label: string;
};

export type TemplateParameterDefinition = {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly defaultValue: unknown;
};

export type TemplateDefinition = {
  readonly id: TemplateId;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly providers: readonly TemplateProvider[];
  readonly resources: readonly TemplateResourceDefinition[];
  readonly relationships: readonly TemplateRelationship[];
  readonly parameters: readonly TemplateParameterDefinition[];
};

export type BuildTemplateDiagramInput = {
  readonly projectSlug: string;
  readonly shortId: string;
};

export const templateDefinitions = [
  createTemplate({
    id: "static-web-hosting",
    title: "Static Web Hosting",
    description: "S3와 CloudFront로 보호된 정적 웹사이트를 배포합니다.",
    tags: ["S3", "CloudFront", "OAC"],
    resources: [
      resource("bucket", "S3 Bucket", "aws", "aws_s3_bucket", 100, 180, { forceDestroy: true }),
      resource("public-access", "S3 Public Access Block", "aws", "aws_s3_bucket_public_access_block", 100, 340, {
        bucket: "@ref:bucket.id"
      }),
      resource("oac", "CloudFront Origin Access Control", "aws", "aws_cloudfront_origin_access_control", 360, 180, {
        name: "static-site-oac",
        originType: "s3",
        signingBehavior: "always",
        signingProtocol: "sigv4"
      }),
      resource("distribution", "CloudFront Distribution", "aws", "aws_cloudfront_distribution", 620, 180, {
        enabled: true,
        defaultRootObject: "index.html",
        priceClass: "PriceClass_100",
        origin: [{ domainName: "@ref:bucket.bucket_regional_domain_name", originId: "static-bucket", originAccessControlId: "@ref:oac.id" }]
      }),
      resource("bucket-policy", "S3 Bucket Policy", "aws", "aws_s3_bucket_policy", 360, 360, {
        bucket: "@ref:bucket.id",
        policy: "static-site-cloudfront-only"
      })
    ],
    relationships: [
      relationship("bucket-public-access", "bucket", "public-access", "controls"),
      relationship("bucket-oac", "bucket", "oac", "origin"),
      relationship("oac-distribution", "oac", "distribution", "secures"),
      relationship("distribution-bucket", "distribution", "bucket", "origin"),
      relationship("bucket-policy-bucket", "bucket-policy", "bucket", "restricts")
    ],
    parameters: [parameter("projectSlug", "Project slug", true, "sketchcatch"), parameter("customDomain", "Custom domain", false, null)]
  }),
  createTemplate({
    id: "minimal-serverless-api",
    title: "Minimal Serverless API",
    description: "API Gateway, Lambda, DynamoDB로 구성한 최소 API입니다.",
    tags: ["API Gateway", "Lambda", "DynamoDB"],
    resources: [
      resource("api", "API Gateway", "aws", "aws_api_gateway_rest_api", 80, 180, { name: "items-api" }),
      resource("route", "API Route", "aws", "aws_api_gateway_resource", 300, 180, { pathPart: "items", restApiId: "@ref:api.id" }),
      resource("method", "POST Method", "aws", "aws_api_gateway_method", 500, 180, { httpMethod: "POST", authorization: "NONE", restApiId: "@ref:api.id", resourceId: "@ref:route.id" }),
      resource("integration", "Lambda Integration", "aws", "aws_api_gateway_integration", 700, 180, { type: "AWS_PROXY", httpMethod: "POST", restApiId: "@ref:api.id", resourceId: "@ref:route.id", integrationHttpMethod: "POST", uri: "@ref:handler.invoke_arn" }),
      resource("handler", "Lambda Function", "aws", "aws_lambda_function", 300, 360, { functionName: "items-handler", handler: "index.handler", runtime: "nodejs24.x", memorySize: 128, timeout: 10 }),
      resource("role", "Lambda IAM Role", "aws", "aws_iam_role", 80, 360, { name: "items-handler-role" }),
      resource("table", "DynamoDB Table", "aws", "aws_dynamodb_table", 560, 360, { name: "items", billingMode: "PAY_PER_REQUEST", hashKey: "id", attribute: [{ name: "id", type: "S" }] })
    ],
    relationships: [
      relationship("api-route", "api", "route", "contains"),
      relationship("route-method", "route", "method", "exposes"),
      relationship("method-integration", "method", "integration", "invokes"),
      relationship("integration-handler", "integration", "handler", "calls"),
      relationship("handler-role", "handler", "role", "assumes"),
      relationship("handler-table", "handler", "table", "reads/writes")
    ],
    parameters: [parameter("projectSlug", "Project slug", true, "sketchcatch"), parameter("apiAuth", "API authentication", false, "disabled")]
  }),
  createTemplate({
    id: "full-serverless-web-app",
    title: "Full Serverless Web App",
    description: "Frontend, Cognito, API, Lambda, DynamoDB를 연결한 웹 앱입니다.",
    tags: ["Cognito", "API", "Lambda", "DynamoDB"],
    resources: [
      resource("frontend", "Amplify App", "aws", "aws_amplify_app", 80, 180, { name: "serverless-web" }),
      resource("user-pool", "Cognito User Pool", "aws", "aws_cognito_user_pool", 320, 180, { name: "serverless-users" }),
      resource("user-client", "Cognito User Pool Client", "aws", "aws_cognito_user_pool_client", 520, 180, { name: "serverless-web-client", userPoolId: "@ref:user-pool.id" }),
      resource("api", "API Gateway", "aws", "aws_api_gateway_rest_api", 760, 180, { name: "serverless-api" }),
      resource("handler", "Lambda Function", "aws", "aws_lambda_function", 360, 380, { functionName: "serverless-handler", handler: "index.handler", runtime: "nodejs24.x", memorySize: 128, timeout: 10 }),
      resource("table", "DynamoDB Table", "aws", "aws_dynamodb_table", 620, 380, { name: "serverless-items", billingMode: "PAY_PER_REQUEST", hashKey: "id", attribute: [{ name: "id", type: "S" }] })
    ],
    relationships: [
      relationship("frontend-api", "frontend", "api", "calls"),
      relationship("client-pool", "user-client", "user-pool", "authenticates"),
      relationship("api-pool", "api", "user-pool", "authorizes"),
      relationship("api-handler", "api", "handler", "invokes"),
      relationship("handler-table", "handler", "table", "reads/writes")
    ],
    parameters: [parameter("projectSlug", "Project slug", true, "sketchcatch"), parameter("enableAuth", "Enable Cognito auth", true, true)]
  }),
  createTemplate({
    id: "three-tier-web-app",
    title: "3-Tier Web App",
    description: "Public, application, database tier를 분리한 VPC 기반 구조입니다.",
    tags: ["VPC", "ALB", "ASG", "RDS"],
    resources: [
      resource("vpc", "VPC", "aws", "aws_vpc", 360, 80, { cidrBlock: "10.20.0.0/16", enableDnsSupport: true, enableDnsHostnames: true }),
      resource("public-subnet", "Public Subnet", "aws", "aws_subnet", 100, 240, { cidrBlock: "10.20.1.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" }, "resource", "vpc"),
      resource("app-subnet", "App Subnet", "aws", "aws_subnet", 360, 240, { cidrBlock: "10.20.2.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" }, "resource", "vpc"),
      resource("db-subnet", "DB Subnet", "aws", "aws_subnet", 620, 240, { cidrBlock: "10.20.3.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" }, "resource", "vpc"),
      resource("internet-gateway", "Internet Gateway", "aws", "aws_internet_gateway", 100, 440, { vpcId: "@ref:vpc.id" }),
      resource("nat-gateway", "NAT Gateway", "aws", "aws_nat_gateway", 360, 440, { allocationId: "@ref:nat-eip.id", subnetId: "@ref:public-subnet.id" }),
      resource("nat-eip", "NAT Elastic IP", "aws", "aws_eip", 620, 440, { domain: "vpc" }),
      resource("load-balancer", "Application Load Balancer", "aws", "aws_lb", 100, 620, { name: "three-tier-alb", loadBalancerType: "application", subnets: ["@ref:public-subnet.id"] }),
      resource("application-group", "Auto Scaling Group", "aws", "aws_autoscaling_group", 360, 620, { minSize: 1, maxSize: 2, desiredCapacity: 1, vpcZoneIdentifier: ["@ref:app-subnet.id"] }),
      resource("database", "RDS Database", "aws", "aws_db_instance", 620, 620, { identifier: "three-tier-db", engine: "postgres", instanceClass: "db.t4g.micro", allocatedStorage: 20, publiclyAccessible: false })
    ],
    relationships: [
      relationship("vpc-public", "vpc", "public-subnet", "contains"),
      relationship("vpc-app", "vpc", "app-subnet", "contains"),
      relationship("vpc-db", "vpc", "db-subnet", "contains"),
      relationship("vpc-igw", "vpc", "internet-gateway", "routes"),
      relationship("public-nat", "public-subnet", "nat-gateway", "egress"),
      relationship("alb-asg", "load-balancer", "application-group", "routes"),
      relationship("app-db", "application-group", "database", "reads/writes")
    ],
    parameters: [parameter("projectSlug", "Project slug", true, "sketchcatch"), parameter("enableNatGateway", "Enable NAT Gateway", true, true)]
  }),
  createTemplate({
    id: "ecs-fargate-container-app",
    title: "ECS Fargate Container App",
    description: "ECS Fargate와 Application Load Balancer를 사용하는 컨테이너 앱입니다.",
    tags: ["ECS", "Fargate", "ALB"],
    resources: [
      resource("vpc", "VPC", "aws", "aws_vpc", 300, 80, { cidrBlock: "10.30.0.0/16", enableDnsSupport: true, enableDnsHostnames: true }),
      resource("subnet", "Public Subnet", "aws", "aws_subnet", 100, 260, { cidrBlock: "10.30.1.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" }, "resource", "vpc"),
      resource("cluster", "ECS Cluster", "aws", "aws_ecs_cluster", 500, 220, { name: "fargate-cluster" }),
      resource("execution-role", "ECS Execution Role", "aws", "aws_iam_role", 100, 500, { name: "fargate-execution-role" }),
      resource("task", "ECS Task Definition", "aws", "aws_ecs_task_definition", 340, 500, { family: "fargate-app", networkMode: "awsvpc", requiresCompatibilities: ["FARGATE"], cpu: 256, memory: 512, containerDefinitions: "public-sample-image" }),
      resource("service", "ECS Service", "aws", "aws_ecs_service", 600, 500, { name: "fargate-service", cluster: "@ref:cluster.id", taskDefinition: "@ref:task.arn", desiredCount: 1, launchType: "FARGATE" })
    ],
    relationships: [
      relationship("vpc-subnet", "vpc", "subnet", "contains"),
      relationship("cluster-service", "cluster", "service", "runs"),
      relationship("service-task", "service", "task", "uses"),
      relationship("task-role", "task", "execution-role", "assumes")
    ],
    parameters: [parameter("projectSlug", "Project slug", true, "sketchcatch"), parameter("containerImage", "Container image", true, "public.ecr.aws/docker/library/nginx:stable")]
  }),
  createTemplate({
    id: "eks-container-app",
    title: "EKS Container App",
    description: "EKS managed node group에서 Kubernetes workload를 실행합니다.",
    tags: ["EKS", "Kubernetes", "Service"],
    resources: [
      resource("vpc", "VPC", "aws", "aws_vpc", 300, 80, { cidrBlock: "10.40.0.0/16", enableDnsSupport: true, enableDnsHostnames: true }),
      resource("subnet", "EKS Subnet", "aws", "aws_subnet", 100, 260, { cidrBlock: "10.40.1.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" }, "resource", "vpc"),
      resource("cluster-role", "EKS Cluster Role", "aws", "aws_iam_role", 520, 180, { name: "eks-cluster-role" }),
      resource("node-role", "EKS Node Role", "aws", "aws_iam_role", 520, 340, { name: "eks-node-role" }),
      resource("cluster", "EKS Cluster", "aws", "aws_eks_cluster", 300, 260, { name: "eks-app", roleArn: "@ref:cluster-role.arn", vpcConfig: { subnetIds: ["@ref:subnet.id"] } }),
      resource("node-group", "EKS Managed Node Group", "aws", "aws_eks_node_group", 300, 500, { clusterName: "@ref:cluster.name", nodeRoleArn: "@ref:node-role.arn", subnetIds: ["@ref:subnet.id"], scalingConfig: { desiredSize: 1, minSize: 1, maxSize: 2 } }),
      resource("namespace", "Kubernetes Namespace", "kubernetes", "kubernetes_namespace", 620, 500, { metadata: { name: "sketchcatch" } }),
      resource("deployment", "Kubernetes Deployment", "kubernetes", "kubernetes_deployment", 620, 660, { metadata: { name: "web" }, spec: { replicas: 1, selector: { matchLabels: { app: "web" } }, template: { metadata: { labels: { app: "web" } }, spec: { container: [{ name: "web", image: "nginx:stable", port: [{ containerPort: 80 }] }] } } } }),
      resource("service", "Kubernetes Service", "kubernetes", "kubernetes_service", 860, 660, { metadata: { name: "web" }, spec: { selector: { app: "web" }, port: [{ port: 80, targetPort: 80 }], type: "ClusterIP" } })
    ],
    relationships: [
      relationship("vpc-subnet", "vpc", "subnet", "contains"),
      relationship("cluster-role", "cluster-role", "cluster", "authorizes"),
      relationship("cluster-subnet", "cluster", "subnet", "uses"),
      relationship("cluster-node-group", "cluster", "node-group", "runs"),
      relationship("cluster-namespace", "cluster", "namespace", "hosts"),
      relationship("namespace-deployment", "namespace", "deployment", "contains"),
      relationship("deployment-service", "deployment", "service", "exposes")
    ],
    parameters: [parameter("projectSlug", "Project slug", true, "sketchcatch"), parameter("containerImage", "Container image", true, "nginx:stable")]
  })
] as const satisfies readonly TemplateDefinition[];

export function getTemplateDefinitionById(id: TemplateId): TemplateDefinition {
  const definition = templateDefinitions.find((candidate) => candidate.id === id);

  if (!definition) {
    throw new Error(`Unknown TemplateDefinition: ${id}`);
  }

  return definition;
}

export function buildTemplateDiagramJson(
  templateId: TemplateId,
  input: BuildTemplateDiagramInput
): DiagramJson {
  const definition = getTemplateDefinitionById(templateId);
  const resourceById = new Map(definition.resources.map((resource) => [resource.id, resource]));
  const resourceNames = new Map(
    definition.resources.map((resource) => [resource.id, createTerraformResourceName(input, resource.id)])
  );
  const nodeIdByResourceId = new Map(
    definition.resources.map((resource) => [resource.id, `template-${templateId}-${resource.id}`])
  );

  return {
    nodes: definition.resources.map((resource) => createDiagramNode(resource, resourceById, resourceNames, nodeIdByResourceId)),
    edges: definition.relationships.map((relationship) => ({
      id: `template-${templateId}-${relationship.id}`,
      label: relationship.label,
      sourceNodeId: nodeIdByResourceId.get(relationship.sourceResourceId) ?? "",
      targetNodeId: nodeIdByResourceId.get(relationship.targetResourceId) ?? "",
      type: "smoothstep"
    })),
    viewport: { x: 0, y: 0, zoom: 0.8 }
  };
}

function createDiagramNode(
  resource: TemplateResourceDefinition,
  resourceById: ReadonlyMap<string, TemplateResourceDefinition>,
  resourceNames: ReadonlyMap<string, string>,
  nodeIdByResourceId: ReadonlyMap<string, string>
): DiagramNode {
  const values = resolveTemplateValue(resource.values, resourceById, resourceNames);

  return {
    id: nodeIdByResourceId.get(resource.id) ?? `template-resource-${resource.id}`,
    kind: resource.kind ?? "resource",
    label: resource.label,
    locked: false,
    metadata: resource.parentResourceId
      ? { parentAreaNodeId: nodeIdByResourceId.get(resource.parentResourceId) }
      : undefined,
    parameters: {
      resourceType: resource.terraformResourceType,
      resourceName: resourceNames.get(resource.id) ?? resource.id,
      fileName: "main.tf",
      terraformBlockType: resource.terraformBlockType,
      values
    },
    position: resource.position,
    size: resource.kind === "design" ? { width: 260, height: 180 } : { width: 124, height: 96 },
    type: resource.terraformResourceType,
    zIndex: resource.kind === "design" ? 0 : 1
  };
}

function createTerraformResourceName(input: BuildTemplateDiagramInput, resourceId: string): string {
  const slug = toTerraformIdentifier(input.projectSlug);
  const shortId = toTerraformIdentifier(input.shortId);
  return `${slug}_${resourceId}_${shortId}`;
}

function resolveTemplateValue(
  value: unknown,
  resourceById: ReadonlyMap<string, TemplateResourceDefinition>,
  resourceNames: ReadonlyMap<string, string>
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      resolveTemplateValueEntry(nestedValue, resourceById, resourceNames)
    ])
  );
}

function resolveTemplateValueEntry(
  value: unknown,
  resourceById: ReadonlyMap<string, TemplateResourceDefinition>,
  resourceNames: ReadonlyMap<string, string>
): unknown {
  if (typeof value === "string" && value.startsWith("@ref:")) {
    const [resourceId, attribute] = value.slice("@ref:".length).split(".");
    const resource = resourceId ? resourceById.get(resourceId) : undefined;
    const resourceName = resourceId ? resourceNames.get(resourceId) : undefined;

    if (!resource || !resourceName || !attribute) {
      throw new Error(`Invalid TemplateDefinition reference: ${value}`);
    }

    return `${resource.terraformResourceType}.${resourceName}.${attribute}`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValueEntry(item, resourceById, resourceNames));
  }

  if (isRecord(value)) {
    return resolveTemplateValue(value, resourceById, resourceNames);
  }

  return value;
}

function toTerraformIdentifier(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return /^[0-9]/.test(normalized) ? `project_${normalized}` : normalized || "project";
}

function resource(
  id: string,
  label: string,
  provider: TemplateProvider,
  terraformResourceType: string,
  x: number,
  y: number,
  values: Record<string, unknown>,
  kind: DiagramNodeKind = "resource",
  parentResourceId?: string
): TemplateResourceDefinition {
  return {
    id,
    label,
    provider,
    terraformBlockType: "resource",
    terraformResourceType,
    values,
    position: { x, y },
    kind,
    ...(parentResourceId ? { parentResourceId } : {})
  };
}

function relationship(id: string, sourceResourceId: string, targetResourceId: string, label: string): TemplateRelationship {
  return { id, sourceResourceId, targetResourceId, label };
}

function parameter(key: string, label: string, required: boolean, defaultValue: unknown): TemplateParameterDefinition {
  return { key, label, required, defaultValue };
}

function createTemplate(input: Omit<TemplateDefinition, "providers">): TemplateDefinition {
  return {
    ...input,
    providers: [...new Set(input.resources.map((resource) => resource.provider))]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
