import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeKind,
  TerraformBlockType
} from "./index.js";

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
  readonly size?: DiagramNode["size"];
  readonly parentResourceId?: string;
  readonly presentationArea?: boolean;
  readonly kind?: DiagramNodeKind;
};

export type TemplateRelationship = {
  readonly id: string;
  readonly sourceResourceId: string;
  readonly targetResourceId: string;
  readonly label: string;
  readonly sourceHandleId?: string;
  readonly targetHandleId?: string;
  readonly type?: DiagramEdge["type"];
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
  readonly viewport?: DiagramJson["viewport"];
};

export type BuildTemplateDiagramInput = {
  readonly projectSlug: string;
  readonly shortId: string;
};

const LAMBDA_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole"
  }]
});
const ECS_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: { Service: "ecs-tasks.amazonaws.com" },
    Action: "sts:AssumeRole"
  }]
});
const EKS_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: { Service: "eks.amazonaws.com" },
    Action: "sts:AssumeRole"
  }]
});
const EC2_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: { Service: "ec2.amazonaws.com" },
    Action: "sts:AssumeRole"
  }]
});
const LAMBDA_INLINE_SOURCE = `import { randomUUID } from "node:crypto";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamodb = new DynamoDBClient({});

export const handler = async (event) => {
  const body = event?.body ? JSON.parse(event.body) : {};
  const id = typeof body.id === "string" && body.id ? body.id : randomUUID();

  await dynamodb.send(new PutItemCommand({
    TableName: process.env.TABLE_NAME,
    Item: {
      id: { S: id },
      payload: { S: JSON.stringify(body) }
    }
  }));

  return {
    statusCode: 201,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  };
};
`;
const DYNAMODB_ACTIONS = [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:Query",
  "dynamodb:Scan"
] as const;
const THREE_TIER_USER_DATA = "IyEvYmluL2Jhc2gKIyBza2V0Y2hjYXRjaC1kZW1vLW1hbmFnZWQtdXNlci1kYXRhOnYxCiMgc2tldGNoY2F0Y2gtZGVtby1tYW5hZ2VkLXVzZXItZGF0YS1zaGEyNTY6ZTMxODQ5OGZkYTIxMTc0OTNlNjljOWM3ZmZkOTdmMWEwM2JkMDc3OTVkMDA4MzEwMTdiMTc4MTBkODZmODkxMApzZXQgLWV1eG8gcGlwZWZhaWwKZG5mIGluc3RhbGwgLXkgbmdpbngKc3lzdGVtY3RsIGVuYWJsZSAtLW5vdyBuZ2lueAo=";

type TemplatePresentationPlacement = {
  readonly position: TemplateResourceDefinition["position"];
  readonly parentResourceId?: string;
  readonly size?: DiagramNode["size"];
  readonly presentationArea?: boolean;
};

type TemplatePresentationLayout = {
  readonly viewport: DiagramJson["viewport"];
  readonly resources: Readonly<Record<string, TemplatePresentationPlacement>>;
  readonly routing: Readonly<Record<string, Pick<TemplateRelationship, "sourceHandleId" | "targetHandleId" | "type">>>;
};

// The presentation layer is deliberately separate from deployable resource values.
// It lets a template follow the AWS pattern diagram without changing Terraform identity or behavior.
const TEMPLATE_PRESENTATION_LAYOUTS: Readonly<Record<TemplateId, TemplatePresentationLayout>> = {
  "static-web-hosting": {
    viewport: { x: 0, y: 0, zoom: 0.75 },
    resources: {
      bucket: layoutAt(920, 280),
      "index-object": layoutAt(1120, 360),
      "public-access": layoutAt(920, 520),
      oac: layoutAt(640, 480),
      distribution: layoutAt(480, 280),
      "bucket-policy": layoutAt(1480, 560)
    },
    routing: {
      "bucket-public-access": layoutRoute("handle-bottom", "handle-top"),
      "bucket-index": layoutRoute("handle-right", "handle-left"),
      "bucket-oac": layoutRoute("handle-bottom", "handle-right"),
      "oac-distribution": layoutRoute("handle-top", "handle-bottom"),
      "distribution-bucket": layoutRoute("handle-right", "handle-left"),
      "bucket-policy-bucket": layoutRoute("handle-left", "handle-right")
    }
  },
  "minimal-serverless-api": {
    viewport: { x: 0, y: 0, zoom: 0.64 },
    resources: {
      api: layoutAt(320, 240, undefined, { width: 480, height: 900 }, true),
      route: layoutAt(440, 380, "api"),
      method: layoutAt(440, 520, "api"),
      integration: layoutAt(440, 660, "api"),
      deployment: layoutAt(440, 800, "api"),
      stage: layoutAt(440, 940, "api"),
      handler: layoutAt(880, 560),
      role: layoutAt(880, 840),
      "role-policy": layoutAt(1160, 840),
      permission: layoutAt(880, 320),
      table: layoutAt(1200, 560),
      "log-group": layoutAt(1480, 560)
    },
    routing: {
      "api-route": layoutRoute("handle-bottom", "handle-top"),
      "route-method": layoutRoute("handle-bottom", "handle-top"),
      "method-integration": layoutRoute("handle-bottom", "handle-top"),
      "integration-handler": layoutRoute("handle-right", "handle-left"),
      "handler-role": layoutRoute("handle-bottom", "handle-top"),
      "handler-table": layoutRoute("handle-right", "handle-left")
    }
  },
  "full-serverless-web-app": {
    viewport: { x: 0, y: 0, zoom: 0.48 },
    resources: {
      frontend: layoutAt(200, 560),
      "user-pool": layoutAt(560, 640),
      "user-client": layoutAt(560, 400),
      api: layoutAt(920, 260, undefined, { width: 480, height: 1040 }, true),
      authorizer: layoutAt(1040, 420, "api"),
      route: layoutAt(1040, 580, "api"),
      method: layoutAt(1040, 720, "api"),
      integration: layoutAt(1040, 860, "api"),
      deployment: layoutAt(1040, 1000, "api"),
      stage: layoutAt(1040, 1140, "api"),
      handler: layoutAt(1520, 560),
      role: layoutAt(1520, 840),
      "role-policy": layoutAt(1760, 840),
      permission: layoutAt(1520, 400),
      table: layoutAt(1840, 560),
      "log-group": layoutAt(2080, 720)
    },
    routing: {
      "frontend-api": layoutRoute("handle-right", "handle-left"),
      "client-pool": layoutRoute("handle-bottom", "handle-top"),
      "api-pool": layoutRoute("handle-left", "handle-right"),
      "api-handler": layoutRoute("handle-right", "handle-left"),
      "handler-table": layoutRoute("handle-right", "handle-left")
    }
  },
  "three-tier-web-app": {
    viewport: { x: 0, y: 0, zoom: 0.38 },
    resources: {
      vpc: layoutAt(160, 160, undefined, { width: 2400, height: 1840 }),
      "public-subnet-a": layoutAt(680, 440, "vpc", { width: 560, height: 400 }),
      "public-subnet-b": layoutAt(1440, 440, "vpc", { width: 560, height: 400 }),
      "app-subnet-a": layoutAt(680, 920, "vpc", { width: 560, height: 440 }),
      "app-subnet-b": layoutAt(1440, 920, "vpc", { width: 560, height: 440 }),
      "db-subnet-a": layoutAt(680, 1400, "vpc", { width: 560, height: 360 }),
      "db-subnet-b": layoutAt(1440, 1400, "vpc", { width: 560, height: 360 }),
      "internet-gateway": layoutAt(320, 280, "vpc"),
      "public-route-table": layoutAt(320, 560, "vpc"),
      "public-route-a": layoutAt(520, 560, "vpc"),
      "public-route-b": layoutAt(520, 680, "vpc"),
      "nat-gateway": layoutAt(1120, 280, "vpc"),
      "nat-eip": layoutAt(960, 280, "vpc"),
      "app-route-table": layoutAt(320, 1040, "vpc"),
      "app-route-a": layoutAt(520, 1040, "vpc"),
      "app-route-b": layoutAt(520, 1160, "vpc"),
      "db-route-table": layoutAt(320, 1520, "vpc"),
      "db-route-a": layoutAt(520, 1520, "vpc"),
      "db-route-b": layoutAt(520, 1640, "vpc"),
      "alb-security-group": layoutAt(820, 680, "public-subnet-a"),
      "app-security-group": layoutAt(1760, 1120, "app-subnet-b"),
      "db-security-group": layoutAt(1820, 1560, "db-subnet-b"),
      "latest-ami": layoutAt(1120, 1240, "app-subnet-a"),
      "launch-template": layoutAt(900, 1080, "application-group"),
      "load-balancer": layoutAt(820, 560, "public-subnet-a"),
      "target-group": layoutAt(1520, 1000, "app-subnet-b"),
      listener: layoutAt(1040, 560, "public-subnet-a"),
      "application-group": layoutAt(760, 980, "app-subnet-a", { width: 400, height: 220 }),
      "db-subnet-group": layoutAt(860, 1480, "db-subnet-a"),
      database: layoutAt(1660, 1460, "db-subnet-b")
    },
    routing: {
      "vpc-igw": layoutRoute("handle-top", "handle-bottom"),
      "public-nat": layoutRoute("handle-top", "handle-bottom"),
      "alb-asg": layoutRoute("handle-bottom", "handle-top"),
      "app-db": layoutRoute("handle-bottom", "handle-top")
    }
  },
  "ecs-fargate-container-app": {
    viewport: { x: 0, y: 0, zoom: 0.4 },
    resources: {
      vpc: layoutAt(160, 160, undefined, { width: 1800, height: 1440 }),
      "subnet-a": layoutAt(400, 360, "vpc", { width: 560, height: 400 }),
      "subnet-b": layoutAt(1120, 360, "vpc", { width: 560, height: 320 }),
      "internet-gateway": layoutAt(320, 1360, "vpc"),
      "route-table": layoutAt(520, 1360, "vpc"),
      "route-a": layoutAt(720, 1360, "vpc"),
      "route-b": layoutAt(880, 1360, "vpc"),
      cluster: layoutAt(440, 760, "vpc", { width: 1200, height: 560 }, true),
      "alb-security-group": layoutAt(480, 620, "subnet-a"),
      "task-security-group": layoutAt(600, 1160, "cluster"),
      "execution-role": layoutAt(2200, 760),
      "execution-policy": layoutAt(2440, 760),
      "task-role": layoutAt(2200, 960),
      repository: layoutAt(2200, 360),
      "log-group": layoutAt(2600, 560),
      "load-balancer": layoutAt(600, 440, "subnet-a"),
      "target-group": layoutAt(1200, 480, "subnet-b"),
      listener: layoutAt(800, 560, "subnet-a"),
      task: layoutAt(2200, 560),
      service: layoutAt(880, 980, "cluster")
    },
    routing: {
      "cluster-service": layoutRoute("handle-right", "handle-left"),
      "service-task": layoutRoute("handle-right", "handle-left"),
      "repository-task": layoutRoute("handle-bottom", "handle-top"),
      "task-log-group": layoutRoute("handle-right", "handle-left"),
      "task-role": layoutRoute("handle-bottom", "handle-top")
    }
  },
  "eks-container-app": {
    viewport: { x: 0, y: 0, zoom: 0.42 },
    resources: {
      vpc: layoutAt(160, 160, undefined, { width: 1800, height: 1280 }),
      "subnet-a": layoutAt(400, 360, "vpc", { width: 560, height: 200 }),
      "subnet-b": layoutAt(1120, 360, "vpc", { width: 560, height: 200 }),
      "internet-gateway": layoutAt(320, 1240, "vpc"),
      "route-table": layoutAt(520, 1240, "vpc"),
      "route-a": layoutAt(720, 1240, "vpc"),
      "route-b": layoutAt(880, 1240, "vpc"),
      "cluster-security-group": layoutAt(2160, 360),
      "cluster-role": layoutAt(2160, 560),
      "node-role": layoutAt(2160, 760),
      "cluster-policy": layoutAt(2400, 560),
      "node-policy": layoutAt(2400, 760),
      "node-cni-policy": layoutAt(2160, 960),
      "node-ecr-policy": layoutAt(2400, 960),
      cluster: layoutAt(400, 640, "vpc", { width: 1200, height: 480 }, true),
      "node-group": layoutAt(600, 800, "cluster"),
      namespace: layoutAt(920, 760, "cluster", { width: 560, height: 280 }, true),
      deployment: layoutAt(1040, 900, "namespace"),
      service: layoutAt(1280, 900, "namespace")
    },
    routing: {
      "cluster-role": layoutRoute("handle-left", "handle-right"),
      "cluster-subnet": layoutRoute("handle-top", "handle-bottom"),
      "cluster-node-group": layoutRoute("handle-right", "handle-left"),
      "deployment-service": layoutRoute("handle-right", "handle-left")
    }
  }
};

export const templateDefinitions = [
  createTemplate({
    id: "static-web-hosting",
    title: "Static Web Hosting",
    description: "S3와 CloudFront로 보호된 정적 웹사이트를 배포합니다.",
    tags: ["S3", "CloudFront", "OAC"],
    resources: [
      resource("bucket", "S3 Bucket", "aws", "aws_s3_bucket", 100, 180, { forceDestroy: true }),
      resource("index-object", "Index Document", "aws", "aws_s3_object", 100, 500, { bucket: "@ref:bucket.id", key: "index.html", contentType: "text/html; charset=utf-8", content: "<!doctype html><html><head><meta charset=\"utf-8\"><title>SketchCatch</title></head><body><h1>SketchCatch Static Web</h1></body></html>" }),
      resource("public-access", "S3 Public Access Block", "aws", "aws_s3_bucket_public_access_block", 100, 340, {
        bucket: "@ref:bucket.id"
      }),
      resource("oac", "CloudFront Origin Access Control", "aws", "aws_cloudfront_origin_access_control", 360, 180, {
        name: "static-site-oac",
        originAccessControlOriginType: "s3",
        signingBehavior: "always",
        signingProtocol: "sigv4"
      }),
      resource("distribution", "CloudFront Distribution", "aws", "aws_cloudfront_distribution", 620, 180, {
        enabled: true,
        defaultRootObject: "index.html",
        priceClass: "PriceClass_100",
        origin: [{ domainName: "@ref:bucket.bucket_regional_domain_name", originId: "static-bucket", originAccessControlId: "@ref:oac.id" }],
        defaultCacheBehavior: [{ allowedMethods: ["GET", "HEAD"], cachedMethods: ["GET", "HEAD"], targetOriginId: "static-bucket", viewerProtocolPolicy: "redirect-to-https", forwardedValues: { queryString: false, cookies: { forward: "none" } } }],
        restrictions: [{ geoRestriction: { restrictionType: "none" } }],
        viewerCertificate: [{ cloudfrontDefaultCertificate: true }]
      }),
      resource("bucket-policy", "S3 Bucket Policy", "aws", "aws_s3_bucket_policy", 360, 360, {
        bucket: "@ref:bucket.id",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [{
            Sid: "AllowCloudFrontServicePrincipalReadOnly",
            Effect: "Allow",
            Principal: { Service: "cloudfront.amazonaws.com" },
            Action: "s3:GetObject",
            Resource: "${@ref:bucket.arn}/*",
            Condition: {
              StringEquals: { "AWS:SourceArn": "${@ref:distribution.arn}" }
            }
          }]
        })
      })
    ],
    relationships: [
      relationship("bucket-public-access", "bucket", "public-access", "controls"),
      relationship("bucket-index", "bucket", "index-object", "stores"),
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
      resource("route", "API Route", "aws", "aws_api_gateway_resource", 300, 180, { pathPart: "items", restApiId: "@ref:api.id", parentId: "@ref:api.root_resource_id" }),
      resource("method", "POST Method", "aws", "aws_api_gateway_method", 500, 180, { httpMethod: "POST", authorization: "NONE", restApiId: "@ref:api.id", resourceId: "@ref:route.id" }),
      resource("integration", "Lambda Integration", "aws", "aws_api_gateway_integration", 700, 180, { type: "AWS_PROXY", httpMethod: "POST", restApiId: "@ref:api.id", resourceId: "@ref:route.id", integrationHttpMethod: "POST", uri: "@ref:handler.invoke_arn" }),
      resource("deployment", "API Deployment", "aws", "aws_api_gateway_deployment", 900, 180, { restApiId: "@ref:api.id", triggers: { redeployment: "items-v1" }, dependsOn: ["@address:integration"] }),
      resource("stage", "API Stage", "aws", "aws_api_gateway_stage", 1080, 180, { restApiId: "@ref:api.id", deploymentId: "@ref:deployment.id", stageName: "prod" }),
      resource("handler", "Lambda Function", "aws", "aws_lambda_function", 300, 360, { functionName: "items-handler", handler: "index.handler", runtime: "nodejs22.x", inlineSource: LAMBDA_INLINE_SOURCE, memorySize: 128, timeout: 10, role: "@ref:role.arn", environment: { variables: { TABLE_NAME: "@ref:table.name" } } }),
      resource("role", "Lambda IAM Role", "aws", "aws_iam_role", 80, 360, { name: "items-handler-role", assumeRolePolicy: LAMBDA_ASSUME_ROLE_POLICY }),
      resource("role-policy", "Lambda DynamoDB Policy", "aws", "aws_iam_role_policy", 80, 500, { name: "items-handler-dynamodb", role: "@ref:role.id", policy: createDynamoDbPolicy("table") }),
      resource("permission", "API Lambda Permission", "aws", "aws_lambda_permission", 900, 360, { statementId: "AllowApiGatewayInvoke", action: "lambda:InvokeFunction", functionName: "@ref:handler.function_name", principal: "apigateway.amazonaws.com", sourceArn: "${@ref:api.execution_arn}/*/*" }),
      resource("table", "DynamoDB Table", "aws", "aws_dynamodb_table", 560, 360, { name: "items", billingMode: "PAY_PER_REQUEST", hashKey: "id", attribute: [{ name: "id", type: "S" }] }),
      resource("log-group", "Lambda Log Group", "aws", "aws_cloudwatch_log_group", 780, 500, { name: "/aws/lambda/${@ref:handler.function_name}", retentionInDays: 7 })
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
      resource("authorizer", "Cognito Authorizer", "aws", "aws_api_gateway_authorizer", 980, 180, { name: "serverless-cognito", restApiId: "@ref:api.id", type: "COGNITO_USER_POOLS", providerArns: ["@ref:user-pool.arn"], identitySource: "method.request.header.Authorization" }),
      resource("route", "API Route", "aws", "aws_api_gateway_resource", 760, 340, { pathPart: "items", restApiId: "@ref:api.id", parentId: "@ref:api.root_resource_id" }),
      resource("method", "Authorized POST Method", "aws", "aws_api_gateway_method", 980, 340, { httpMethod: "POST", authorization: "COGNITO_USER_POOLS", authorizerId: "@ref:authorizer.id", restApiId: "@ref:api.id", resourceId: "@ref:route.id" }),
      resource("integration", "Lambda Integration", "aws", "aws_api_gateway_integration", 1180, 340, { type: "AWS_PROXY", httpMethod: "POST", integrationHttpMethod: "POST", restApiId: "@ref:api.id", resourceId: "@ref:route.id", uri: "@ref:handler.invoke_arn" }),
      resource("deployment", "API Deployment", "aws", "aws_api_gateway_deployment", 1180, 500, { restApiId: "@ref:api.id", triggers: { redeployment: "serverless-v1" }, dependsOn: ["@address:integration"] }),
      resource("stage", "API Stage", "aws", "aws_api_gateway_stage", 1180, 660, { restApiId: "@ref:api.id", deploymentId: "@ref:deployment.id", stageName: "prod" }),
      resource("handler", "Lambda Function", "aws", "aws_lambda_function", 360, 380, { functionName: "serverless-handler", handler: "index.handler", runtime: "nodejs22.x", inlineSource: LAMBDA_INLINE_SOURCE, memorySize: 128, timeout: 10, role: "@ref:role.arn", environment: { variables: { TABLE_NAME: "@ref:table.name" } } }),
      resource("role", "Lambda IAM Role", "aws", "aws_iam_role", 100, 380, { name: "serverless-handler-role", assumeRolePolicy: LAMBDA_ASSUME_ROLE_POLICY }),
      resource("role-policy", "Lambda DynamoDB Policy", "aws", "aws_iam_role_policy", 100, 540, { name: "serverless-handler-dynamodb", role: "@ref:role.id", policy: createDynamoDbPolicy("table") }),
      resource("permission", "API Lambda Permission", "aws", "aws_lambda_permission", 620, 540, { statementId: "AllowApiGatewayInvoke", action: "lambda:InvokeFunction", functionName: "@ref:handler.function_name", principal: "apigateway.amazonaws.com", sourceArn: "${@ref:api.execution_arn}/*/*" }),
      resource("table", "DynamoDB Table", "aws", "aws_dynamodb_table", 620, 380, { name: "serverless-items", billingMode: "PAY_PER_REQUEST", hashKey: "id", attribute: [{ name: "id", type: "S" }] }),
      resource("log-group", "Lambda Log Group", "aws", "aws_cloudwatch_log_group", 860, 540, { name: "/aws/lambda/${@ref:handler.function_name}", retentionInDays: 7 })
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
      resource("public-subnet-a", "Public Subnet A", "aws", "aws_subnet", 80, 240, { cidrBlock: "10.20.1.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a", mapPublicIpOnLaunch: true }, "resource", "vpc"),
      resource("public-subnet-b", "Public Subnet B", "aws", "aws_subnet", 280, 240, { cidrBlock: "10.20.2.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2b", mapPublicIpOnLaunch: true }, "resource", "vpc"),
      resource("app-subnet-a", "App Subnet A", "aws", "aws_subnet", 480, 240, { cidrBlock: "10.20.11.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" }, "resource", "vpc"),
      resource("app-subnet-b", "App Subnet B", "aws", "aws_subnet", 680, 240, { cidrBlock: "10.20.12.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2b" }, "resource", "vpc"),
      resource("db-subnet-a", "DB Subnet A", "aws", "aws_subnet", 880, 240, { cidrBlock: "10.20.21.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" }, "resource", "vpc"),
      resource("db-subnet-b", "DB Subnet B", "aws", "aws_subnet", 1080, 240, { cidrBlock: "10.20.22.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2b" }, "resource", "vpc"),
      resource("internet-gateway", "Internet Gateway", "aws", "aws_internet_gateway", 100, 440, { vpcId: "@ref:vpc.id" }),
      resource("public-route-table", "Public Route Table", "aws", "aws_route_table", 260, 440, { vpcId: "@ref:vpc.id", route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "@ref:internet-gateway.id" }] }),
      resource("public-route-a", "Public Route A", "aws", "aws_route_table_association", 420, 440, { subnetId: "@ref:public-subnet-a.id", routeTableId: "@ref:public-route-table.id" }),
      resource("public-route-b", "Public Route B", "aws", "aws_route_table_association", 580, 440, { subnetId: "@ref:public-subnet-b.id", routeTableId: "@ref:public-route-table.id" }),
      resource("nat-gateway", "NAT Gateway", "aws", "aws_nat_gateway", 740, 440, { allocationId: "@ref:nat-eip.id", subnetId: "@ref:public-subnet-a.id" }),
      resource("nat-eip", "NAT Elastic IP", "aws", "aws_eip", 620, 440, { domain: "vpc" }),
      resource("app-route-table", "App Route Table", "aws", "aws_route_table", 900, 440, { vpcId: "@ref:vpc.id", route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: "@ref:nat-gateway.id" }] }),
      resource("app-route-a", "App Route A", "aws", "aws_route_table_association", 1060, 440, { subnetId: "@ref:app-subnet-a.id", routeTableId: "@ref:app-route-table.id" }),
      resource("app-route-b", "App Route B", "aws", "aws_route_table_association", 1220, 440, { subnetId: "@ref:app-subnet-b.id", routeTableId: "@ref:app-route-table.id" }),
      resource("db-route-table", "DB Route Table", "aws", "aws_route_table", 1380, 440, { vpcId: "@ref:vpc.id" }),
      resource("db-route-a", "DB Route A", "aws", "aws_route_table_association", 1540, 440, { subnetId: "@ref:db-subnet-a.id", routeTableId: "@ref:db-route-table.id" }),
      resource("db-route-b", "DB Route B", "aws", "aws_route_table_association", 1700, 440, { subnetId: "@ref:db-subnet-b.id", routeTableId: "@ref:db-route-table.id" }),
      resource("alb-security-group", "ALB Security Group", "aws", "aws_security_group", 80, 620, { name: "three-tier-alb", description: "Allow HTTP to the ALB", vpcId: "@ref:vpc.id", ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] }], egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }] }),
      resource("app-security-group", "Application Security Group", "aws", "aws_security_group", 260, 620, { name: "three-tier-app", description: "Allow ALB traffic to application instances", vpcId: "@ref:vpc.id", ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", securityGroups: ["@ref:alb-security-group.id"] }], egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }] }),
      resource("db-security-group", "Database Security Group", "aws", "aws_security_group", 440, 620, { name: "three-tier-db", description: "Allow PostgreSQL from application instances", vpcId: "@ref:vpc.id", ingress: [{ fromPort: 5432, toPort: 5432, protocol: "tcp", securityGroups: ["@ref:app-security-group.id"] }], egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }] }),
      dataResource("latest-ami", "Latest Amazon Linux AMI", "aws", "aws_ami", 340, 620, { mostRecent: true, owners: ["amazon"], filter: [{ name: "name", values: ["al2023-ami-2023.*-kernel-6.1-arm64"] }, { name: "architecture", values: ["arm64"] }, { name: "virtualization-type", values: ["hvm"] }] }),
      resource("launch-template", "Application Launch Template", "aws", "aws_launch_template", 560, 620, { namePrefix: "three-tier-app-", imageId: "@ref:latest-ami.id", instanceType: "t4g.micro", userData: THREE_TIER_USER_DATA, vpcSecurityGroupIds: ["@ref:app-security-group.id"] }),
      resource("load-balancer", "Application Load Balancer", "aws", "aws_lb", 100, 780, { name: "three-tier-alb", loadBalancerType: "application", subnets: ["@ref:public-subnet-a.id", "@ref:public-subnet-b.id"], securityGroups: ["@ref:alb-security-group.id"] }),
      resource("target-group", "Application Target Group", "aws", "aws_lb_target_group", 300, 780, { name: "three-tier-app", port: 80, protocol: "HTTP", targetType: "instance", vpcId: "@ref:vpc.id", healthCheck: { path: "/", matcher: "200-399" } }),
      resource("listener", "HTTP Listener", "aws", "aws_lb_listener", 500, 780, { loadBalancerArn: "@ref:load-balancer.arn", port: 80, protocol: "HTTP", defaultAction: { type: "forward", targetGroupArn: "@ref:target-group.arn" } }),
      resource("application-group", "Auto Scaling Group", "aws", "aws_autoscaling_group", 700, 780, { minSize: 1, maxSize: 2, desiredCapacity: 1, healthCheckType: "ELB", vpcZoneIdentifier: ["@ref:app-subnet-a.id", "@ref:app-subnet-b.id"], targetGroupArns: ["@ref:target-group.arn"], launchTemplate: { id: "@ref:launch-template.id", version: "$Latest" } }),
      resource("db-subnet-group", "Database Subnet Group", "aws", "aws_db_subnet_group", 900, 780, { name: "three-tier-db", subnetIds: ["@ref:db-subnet-a.id", "@ref:db-subnet-b.id"] }),
      resource("database", "RDS Database", "aws", "aws_db_instance", 1100, 780, { identifier: "three-tier-db", engine: "postgres", instanceClass: "db.t4g.micro", allocatedStorage: 20, publiclyAccessible: false, manageMasterUserPassword: true, username: "appadmin", skipFinalSnapshot: true, dbSubnetGroupName: "@ref:db-subnet-group.name", vpcSecurityGroupIds: ["@ref:db-security-group.id"] })
    ],
    relationships: [
      relationship("vpc-public-a", "vpc", "public-subnet-a", "contains"),
      relationship("vpc-public-b", "vpc", "public-subnet-b", "contains"),
      relationship("vpc-app-a", "vpc", "app-subnet-a", "contains"),
      relationship("vpc-app-b", "vpc", "app-subnet-b", "contains"),
      relationship("vpc-db-a", "vpc", "db-subnet-a", "contains"),
      relationship("vpc-db-b", "vpc", "db-subnet-b", "contains"),
      relationship("vpc-igw", "vpc", "internet-gateway", "routes"),
      relationship("public-nat", "public-subnet-a", "nat-gateway", "egress"),
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
      resource("subnet-a", "Public Subnet A", "aws", "aws_subnet", 100, 260, { cidrBlock: "10.30.1.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a", mapPublicIpOnLaunch: true }, "resource", "vpc"),
      resource("subnet-b", "Public Subnet B", "aws", "aws_subnet", 300, 260, { cidrBlock: "10.30.2.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2b", mapPublicIpOnLaunch: true }, "resource", "vpc"),
      resource("internet-gateway", "Internet Gateway", "aws", "aws_internet_gateway", 500, 260, { vpcId: "@ref:vpc.id" }),
      resource("route-table", "Public Route Table", "aws", "aws_route_table", 700, 260, { vpcId: "@ref:vpc.id", route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "@ref:internet-gateway.id" }] }),
      resource("route-a", "Public Route A", "aws", "aws_route_table_association", 900, 260, { subnetId: "@ref:subnet-a.id", routeTableId: "@ref:route-table.id" }),
      resource("route-b", "Public Route B", "aws", "aws_route_table_association", 1100, 260, { subnetId: "@ref:subnet-b.id", routeTableId: "@ref:route-table.id" }),
      resource("cluster", "ECS Cluster", "aws", "aws_ecs_cluster", 500, 220, { name: "fargate-cluster" }),
      resource("alb-security-group", "ALB Security Group", "aws", "aws_security_group", 100, 500, { name: "fargate-alb", description: "Allow public HTTP to the load balancer", vpcId: "@ref:vpc.id", ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] }], egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }] }),
      resource("task-security-group", "Task Security Group", "aws", "aws_security_group", 300, 500, { name: "fargate-task", description: "Allow ALB traffic to Fargate tasks", vpcId: "@ref:vpc.id", ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", securityGroups: ["@ref:alb-security-group.id"] }], egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }] }),
      resource("execution-role", "ECS Execution Role", "aws", "aws_iam_role", 300, 500, { name: "fargate-execution-role", assumeRolePolicy: ECS_ASSUME_ROLE_POLICY }),
      resource("execution-policy", "ECS Execution Policy", "aws", "aws_iam_role_policy_attachment", 500, 500, { role: "@ref:execution-role.name", policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" }),
      resource("task-role", "ECS Task Role", "aws", "aws_iam_role", 700, 500, { name: "fargate-task-role", assumeRolePolicy: ECS_ASSUME_ROLE_POLICY }),
      resource("repository", "ECR Repository", "aws", "aws_ecr_repository", 900, 500, { name: "fargate-app", imageTagMutability: "IMMUTABLE" }),
      resource("log-group", "Fargate Log Group", "aws", "aws_cloudwatch_log_group", 1100, 500, { name: "/ecs/fargate-app", retentionInDays: 7 }),
      resource("load-balancer", "Application Load Balancer", "aws", "aws_lb", 100, 660, { name: "fargate-alb", loadBalancerType: "application", subnets: ["@ref:subnet-a.id", "@ref:subnet-b.id"], securityGroups: ["@ref:alb-security-group.id"] }),
      resource("target-group", "Fargate Target Group", "aws", "aws_lb_target_group", 300, 660, { name: "fargate-web", port: 80, protocol: "HTTP", targetType: "ip", vpcId: "@ref:vpc.id", healthCheck: { path: "/", matcher: "200-399" } }),
      resource("listener", "HTTP Listener", "aws", "aws_lb_listener", 500, 660, { loadBalancerArn: "@ref:load-balancer.arn", port: 80, protocol: "HTTP", defaultAction: { type: "forward", targetGroupArn: "@ref:target-group.arn" } }),
      resource("task", "ECS Task Definition", "aws", "aws_ecs_task_definition", 700, 660, { family: "fargate-app", networkMode: "awsvpc", requiresCompatibilities: ["FARGATE"], cpu: 256, memory: 512, executionRoleArn: "@ref:execution-role.arn", taskRoleArn: "@ref:task-role.arn", containerDefinitions: JSON.stringify([{ name: "web", image: "public.ecr.aws/docker/library/nginx:stable", essential: true, portMappings: [{ containerPort: 80, hostPort: 80, protocol: "tcp" }], logConfiguration: { logDriver: "awslogs", options: { "awslogs-group": "@ref:log-group.name", "awslogs-region": "ap-northeast-2", "awslogs-stream-prefix": "ecs" } } }]) }),
      resource("service", "ECS Service", "aws", "aws_ecs_service", 900, 660, { name: "fargate-service", cluster: "@ref:cluster.id", taskDefinition: "@ref:task.arn", desiredCount: 1, launchType: "FARGATE", healthCheckGracePeriodSeconds: 30, networkConfiguration: { subnets: ["@ref:subnet-a.id", "@ref:subnet-b.id"], securityGroups: ["@ref:task-security-group.id"], assignPublicIp: true }, loadBalancer: { targetGroupArn: "@ref:target-group.arn", containerName: "web", containerPort: 80 }, dependsOn: ["@address:listener"] })
    ],
    relationships: [
      relationship("vpc-subnet-a", "vpc", "subnet-a", "contains"),
      relationship("vpc-subnet-b", "vpc", "subnet-b", "contains"),
      relationship("cluster-service", "cluster", "service", "runs"),
      relationship("service-task", "service", "task", "uses"),
      relationship("repository-task", "repository", "task", "provides image"),
      relationship("task-log-group", "task", "log-group", "writes logs"),
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
      resource("subnet-a", "EKS Subnet A", "aws", "aws_subnet", 100, 260, { cidrBlock: "10.40.1.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a", mapPublicIpOnLaunch: true }, "resource", "vpc"),
      resource("subnet-b", "EKS Subnet B", "aws", "aws_subnet", 300, 260, { cidrBlock: "10.40.2.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2b", mapPublicIpOnLaunch: true }, "resource", "vpc"),
      resource("internet-gateway", "Internet Gateway", "aws", "aws_internet_gateway", 500, 260, { vpcId: "@ref:vpc.id" }),
      resource("route-table", "Public Route Table", "aws", "aws_route_table", 700, 260, { vpcId: "@ref:vpc.id", route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "@ref:internet-gateway.id" }] }),
      resource("route-a", "EKS Route A", "aws", "aws_route_table_association", 900, 260, { subnetId: "@ref:subnet-a.id", routeTableId: "@ref:route-table.id" }),
      resource("route-b", "EKS Route B", "aws", "aws_route_table_association", 1100, 260, { subnetId: "@ref:subnet-b.id", routeTableId: "@ref:route-table.id" }),
      resource("cluster-security-group", "EKS Cluster Security Group", "aws", "aws_security_group", 100, 420, { name: "eks-cluster", description: "EKS control plane and node communication", vpcId: "@ref:vpc.id", egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }] }),
      resource("cluster-role", "EKS Cluster Role", "aws", "aws_iam_role", 520, 180, { name: "eks-cluster-role", assumeRolePolicy: EKS_ASSUME_ROLE_POLICY }),
      resource("node-role", "EKS Node Role", "aws", "aws_iam_role", 520, 340, { name: "eks-node-role", assumeRolePolicy: EC2_ASSUME_ROLE_POLICY }),
      resource("cluster-policy", "EKS Cluster Policy", "aws", "aws_iam_role_policy_attachment", 760, 180, { role: "@ref:cluster-role.name", policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy" }),
      resource("node-policy", "EKS Node Policy", "aws", "aws_iam_role_policy_attachment", 760, 340, { role: "@ref:node-role.name", policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy" }),
      resource("node-cni-policy", "EKS CNI Policy", "aws", "aws_iam_role_policy_attachment", 760, 500, { role: "@ref:node-role.name", policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy" }),
      resource("node-ecr-policy", "EKS ECR Policy", "aws", "aws_iam_role_policy_attachment", 760, 660, { role: "@ref:node-role.name", policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly" }),
      resource("cluster", "EKS Cluster", "aws", "aws_eks_cluster", 300, 420, { name: "eks-app", roleArn: "@ref:cluster-role.arn", vpcConfig: { subnetIds: ["@ref:subnet-a.id", "@ref:subnet-b.id"], securityGroupIds: ["@ref:cluster-security-group.id"] }, dependsOn: ["@address:cluster-policy"] }),
      resource("node-group", "EKS Managed Node Group", "aws", "aws_eks_node_group", 300, 580, { clusterName: "@ref:cluster.name", nodeRoleArn: "@ref:node-role.arn", subnetIds: ["@ref:subnet-a.id", "@ref:subnet-b.id"], instanceTypes: ["t3.small"], scalingConfig: { desiredSize: 1, minSize: 1, maxSize: 2 }, dependsOn: ["@address:node-policy", "@address:node-cni-policy", "@address:node-ecr-policy"] }),
      resource("namespace", "Kubernetes Namespace", "kubernetes", "kubernetes_namespace", 620, 500, { metadata: { name: "sketchcatch" } }),
      resource("deployment", "Kubernetes Deployment", "kubernetes", "kubernetes_deployment", 620, 660, { metadata: { name: "web", namespace: "@ref:namespace.metadata.0.name" }, spec: { replicas: 1, selector: [{ matchLabels: { app: "web" } }], template: { metadata: { labels: { app: "web" } }, spec: { container: [{ name: "web", image: "nginx:stable", port: [{ containerPort: 80 }] }] } } }, dependsOn: ["@address:node-group"] }),
      resource("service", "Kubernetes Service", "kubernetes", "kubernetes_service", 860, 660, { metadata: { name: "web", namespace: "@ref:namespace.metadata.0.name" }, spec: { selector: { app: "web" }, port: [{ port: 80, targetPort: 80 }], type: "ClusterIP" } })
    ],
    relationships: [
      relationship("vpc-subnet-a", "vpc", "subnet-a", "contains"),
      relationship("vpc-subnet-b", "vpc", "subnet-b", "contains"),
      relationship("cluster-role", "cluster-role", "cluster", "authorizes"),
      relationship("cluster-subnet", "cluster", "subnet-a", "uses"),
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
  // This builder only transfers authored Board presentation metadata; deployable values are resolved unchanged.
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
      type: relationship.type ?? "smoothstep",
      ...(relationship.sourceHandleId ? { sourceHandleId: relationship.sourceHandleId } : {}),
      ...(relationship.targetHandleId ? { targetHandleId: relationship.targetHandleId } : {})
    })),
    viewport: definition.viewport ? { ...definition.viewport } : { x: 0, y: 0, zoom: 0.8 }
  };
}

function createDiagramNode(
  resource: TemplateResourceDefinition,
  resourceById: ReadonlyMap<string, TemplateResourceDefinition>,
  resourceNames: ReadonlyMap<string, string>,
  nodeIdByResourceId: ReadonlyMap<string, string>
): DiagramNode {
  // Preserve the catalog-backed resource identity while applying only template-authored Board geometry.
  const values = resolveTemplateValue(resource.values, resourceById, resourceNames);

  return {
    id: nodeIdByResourceId.get(resource.id) ?? `template-resource-${resource.id}`,
    kind: resource.kind ?? "resource",
    label: resource.label,
    locked: false,
    metadata: resource.parentResourceId || resource.presentationArea
      ? {
          ...(resource.parentResourceId
            ? { parentAreaNodeId: nodeIdByResourceId.get(resource.parentResourceId) }
            : {}),
          ...(resource.presentationArea ? { presentationArea: true } : {})
        }
      : undefined,
    parameters: {
      resourceType: resource.terraformResourceType,
      resourceName: resourceNames.get(resource.id) ?? resource.id,
      fileName: "main.tf",
      terraformBlockType: resource.terraformBlockType,
      values
    },
    position: { ...resource.position },
    size: resource.size
      ? { ...resource.size }
      : resource.kind === "design"
        ? { width: 260, height: 180 }
        : { width: 124, height: 96 },
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
  if (typeof value === "string" && value.startsWith("@address:")) {
    const resourceId = value.slice("@address:".length);
    const resource = resourceById.get(resourceId);
    const resourceName = resourceNames.get(resourceId);

    if (!resource || !resourceName) {
      throw new Error(`Invalid TemplateDefinition address: ${value}`);
    }

    const addressPrefix = resource.terraformBlockType === "data" ? "data." : "";
    return `${addressPrefix}${resource.terraformResourceType}.${resourceName}`;
  }

  if (typeof value === "string" && value.startsWith("@ref:")) {
    return resolveTemplateReference(value.slice("@ref:".length), resourceById, resourceNames);
  }

  if (typeof value === "string" && value.includes("${@ref:")) {
    return value.replace(/\$\{@ref:([^}.]+)\.([^}]+)\}/g, (_match, resourceId: string, attribute: string) =>
      `\${${resolveTemplateReference(`${resourceId}.${attribute}`, resourceById, resourceNames)}}`
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValueEntry(item, resourceById, resourceNames));
  }

  if (isRecord(value)) {
    return resolveTemplateValue(value, resourceById, resourceNames);
  }

  return value;
}

function resolveTemplateReference(
  reference: string,
  resourceById: ReadonlyMap<string, TemplateResourceDefinition>,
  resourceNames: ReadonlyMap<string, string>
): string {
  const [resourceId, ...attributeSegments] = reference.split(".");
  const attribute = attributeSegments.join(".");
  const resource = resourceId ? resourceById.get(resourceId) : undefined;
  const resourceName = resourceId ? resourceNames.get(resourceId) : undefined;

  if (!resource || !resourceName || !attribute) {
    throw new Error(`Invalid TemplateDefinition reference: @ref:${reference}`);
  }

  const addressPrefix = resource.terraformBlockType === "data" ? "data." : "";
  return `${addressPrefix}${resource.terraformResourceType}.${resourceName}.${attribute}`;
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

function dataResource(
  id: string,
  label: string,
  provider: TemplateProvider,
  terraformResourceType: string,
  x: number,
  y: number,
  values: Record<string, unknown>
): TemplateResourceDefinition {
  return {
    ...resource(id, label, provider, terraformResourceType, x, y, values),
    terraformBlockType: "data"
  };
}

function relationship(id: string, sourceResourceId: string, targetResourceId: string, label: string): TemplateRelationship {
  return { id, sourceResourceId, targetResourceId, label };
}

function parameter(key: string, label: string, required: boolean, defaultValue: unknown): TemplateParameterDefinition {
  return { key, label, required, defaultValue };
}

function createDynamoDbPolicy(tableResourceId: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Action: DYNAMODB_ACTIONS,
      Resource: `\${@ref:${tableResourceId}.arn}`
    }]
  });
}

// Apply visual-only PNG placement after the resource list is declared, keeping Terraform values immutable here.
function createTemplate(input: Omit<TemplateDefinition, "providers" | "viewport">): TemplateDefinition {
  const presentation = TEMPLATE_PRESENTATION_LAYOUTS[input.id];

  if (!presentation) {
    throw new Error(`Missing Template presentation layout: ${input.id}`);
  }

  const resources = input.resources.map((resource) => {
    const placement = presentation.resources[resource.id];

    if (!placement) {
      throw new Error(`Missing Template presentation resource: ${input.id}/${resource.id}`);
    }

    const {
      position: _position,
      parentResourceId: _parentResourceId,
      size: _size,
      presentationArea: _presentationArea,
      ...semanticResource
    } = resource;

    return {
      ...semanticResource,
      position: { ...placement.position },
      ...(placement.parentResourceId ? { parentResourceId: placement.parentResourceId } : {}),
      ...(placement.size ? { size: { ...placement.size } } : {}),
      ...(placement.presentationArea ? { presentationArea: true } : {})
    };
  });
  const relationships = input.relationships.map((relationship) => {
    const routing = presentation.routing[relationship.id];
    const {
      sourceHandleId: _sourceHandleId,
      targetHandleId: _targetHandleId,
      type: _type,
      ...semanticRelationship
    } = relationship;

    return routing
      ? { ...semanticRelationship, ...routing }
      : semanticRelationship;
  });

  return {
    ...input,
    resources,
    relationships,
    viewport: { ...presentation.viewport },
    providers: [...new Set(resources.map((resource) => resource.provider))]
  };
}

// Keep all layout coordinates on the same grid so edits remain easy to inspect in the Board.
function layoutAt(
  x: number,
  y: number,
  parentResourceId?: string,
  size?: DiagramNode["size"],
  presentationArea?: boolean
): TemplatePresentationPlacement {
  return {
    position: { x, y },
    ...(parentResourceId ? { parentResourceId } : {}),
    ...(size ? { size } : {}),
    ...(presentationArea ? { presentationArea: true } : {})
  };
}

// Stored handles make support rails deterministic instead of letting auto-routing cross the runtime flow.
function layoutRoute(sourceHandleId: string, targetHandleId: string) {
  return { sourceHandleId, targetHandleId, type: "smoothstep" as const };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
