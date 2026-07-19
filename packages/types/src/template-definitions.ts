import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeKind,
  TerraformBlockType
} from "./index.js";

export const REPOSITORY_TEMPLATE_IDS = [
  "static-web-hosting",
  "minimal-serverless-api",
  "full-serverless-web-app",
  "three-tier-web-app",
  "ecs-fargate-container-app",
  "eks-container-app"
] as const;

export type RepositoryTemplateId = (typeof REPOSITORY_TEMPLATE_IDS)[number];

export const TEMPLATE_IDS = [...REPOSITORY_TEMPLATE_IDS] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];
export type TemplateProvider = "aws" | "kubernetes";

export type TemplateResourceDefinition = {
  readonly id: string;
  readonly label: string;
  readonly provider: TemplateProvider;
  readonly terraformBlockType: TerraformBlockType;
  readonly terraformResourceType: string;
  readonly terraformResourceName?: string;
  readonly fileName?: string;
  readonly values: Record<string, unknown>;
  readonly position: { readonly x: number; readonly y: number };
  readonly size?: DiagramNode["size"];
  readonly parentResourceId?: string;
  readonly presentationArea?: boolean;
  readonly kind?: DiagramNodeKind;
  readonly zIndex?: DiagramNode["zIndex"];
  readonly rotation?: DiagramNode["rotation"];
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

export type TemplatePresentationNodeDefinition = {
  readonly id: string;
  readonly catalogItemId: string;
  readonly label: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: DiagramNode["size"];
  readonly parentNodeId?: string;
  readonly zIndex?: DiagramNode["zIndex"];
  readonly rotation?: DiagramNode["rotation"];
};

export type TemplatePresentationEdgeDefinition = {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly label: string;
  readonly sourceHandleId?: string;
  readonly targetHandleId?: string;
  readonly type?: DiagramEdge["type"];
};

export type TemplateDefinition = {
  readonly id: TemplateId;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly providers: readonly TemplateProvider[];
  readonly resources: readonly TemplateResourceDefinition[];
  readonly relationships: readonly TemplateRelationship[];
  readonly presentationNodes: readonly TemplatePresentationNodeDefinition[];
  readonly presentationEdges: readonly TemplatePresentationEdgeDefinition[];
  readonly parameters: readonly TemplateParameterDefinition[];
  readonly viewport?: DiagramJson["viewport"];
  readonly presentation?: DiagramJson["presentation"];
};

export type BuildTemplateDiagramInput = {
  readonly projectSlug: string;
  readonly shortId: string;
};

export type EcsFargateRuntimeNames = {
  readonly ecrRepositoryName: string;
  readonly clusterName: string;
  readonly serviceName: string;
  readonly taskFamily: string;
  readonly containerName: string;
  readonly logGroupName: string;
};

const TERRAFORM_LOCAL_NAME_MAX_LENGTH = 48;

const LAMBDA_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole"
    }
  ]
});
const ECS_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole"
    }
  ]
});
const EKS_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "eks.amazonaws.com" },
      Action: "sts:AssumeRole"
    }
  ]
});
const EC2_ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "ec2.amazonaws.com" },
      Action: "sts:AssumeRole"
    }
  ]
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
const THREE_TIER_USER_DATA =
  "IyEvYmluL2Jhc2gKIyBza2V0Y2hjYXRjaC1kZW1vLW1hbmFnZWQtdXNlci1kYXRhOnYxCiMgc2tldGNoY2F0Y2gtZGVtby1tYW5hZ2VkLXVzZXItZGF0YS1zaGEyNTY6ZTMxODQ5OGZkYTIxMTc0OTNlNjljOWM3ZmZkOTdmMWEwM2JkMDc3OTVkMDA4MzEwMTdiMTc4MTBkODZmODkxMApzZXQgLWV1eG8gcGlwZWZhaWwKZG5mIGluc3RhbGwgLXkgbmdpbngKc3lzdGVtY3RsIGVuYWJsZSAtLW5vdyBuZ2lueAo=";

type TemplatePresentationPlacement = {
  readonly position: TemplateResourceDefinition["position"];
  readonly parentResourceId?: string;
  readonly size?: DiagramNode["size"];
  readonly presentationArea?: boolean;
};

type TemplatePresentationLayout = {
  readonly viewport: DiagramJson["viewport"];
  readonly resources: Readonly<Record<string, TemplatePresentationPlacement>>;
  readonly routing: Readonly<
    Record<string, Pick<TemplateRelationship, "sourceHandleId" | "targetHandleId" | "type">>
  >;
  readonly presentationNodes: Readonly<
    Record<string, Omit<TemplatePresentationNodeDefinition, "id">>
  >;
  readonly presentationEdges: Readonly<
    Record<string, Omit<TemplatePresentationEdgeDefinition, "id">>
  >;
};

const TEMPLATE_LAYOUT_GRID_SIZE = 40;
const DEFAULT_TEMPLATE_RESOURCE_SIZE = { width: 124, height: 96 } as const;
const TEMPLATE_AREA_PADDING = TEMPLATE_LAYOUT_GRID_SIZE;
const TEMPLATE_AREA_HEADER_HEIGHT = TEMPLATE_LAYOUT_GRID_SIZE * 2;

// The presentation layer is deliberately separate from deployable resource values.
// It lets a template follow the AWS pattern diagram without changing Terraform identity or behavior.
const TEMPLATE_PRESENTATION_LAYOUTS: Readonly<
  Record<RepositoryTemplateId, TemplatePresentationLayout>
> = {
  "static-web-hosting": {
    viewport: { x: 0, y: 0, zoom: 0.8 },
    resources: {
      bucket: layoutAt(560, 400, "region"),
      "index-object": layoutAt(760, 400, "region"),
      "public-access": layoutAt(560, 560, "region"),
      oac: layoutAt(320, 560),
      distribution: layoutAt(320, 400),
      "bucket-policy": layoutAt(760, 560, "region")
    },
    routing: {
      "bucket-public-access": layoutRoute("handle-bottom", "handle-top"),
      "bucket-index": layoutRoute("handle-right", "handle-left"),
      "bucket-oac": layoutRoute("handle-bottom", "handle-right"),
      "oac-distribution": layoutRoute("handle-top", "handle-bottom"),
      "distribution-bucket": layoutRoute("handle-right", "handle-left"),
      "bucket-policy-bucket": layoutRoute("handle-left", "handle-right")
    },
    presentationNodes: {
      user: presentationNode("design-user-client", "User", 120, 400),
      region: presentationNode("aws-region", "Region", 480, 240, { width: 480, height: 480 })
    },
    presentationEdges: {
      "user-distribution": presentationEdge(
        "user",
        "distribution",
        "requests",
        "handle-right",
        "handle-left"
      )
    }
  },
  "minimal-serverless-api": {
    viewport: { x: 0, y: 0, zoom: 0.62 },
    resources: {
      api: layoutAt(280, 200, "region", { width: 520, height: 680 }, true),
      route: layoutAt(360, 320, "api"),
      method: layoutAt(360, 440, "api"),
      integration: layoutAt(360, 560, "api"),
      deployment: layoutAt(600, 320, "api"),
      stage: layoutAt(600, 440, "api"),
      handler: layoutAt(880, 560, "region"),
      role: layoutAt(1480, 400, "global-iam-group"),
      "role-policy": layoutAt(1640, 400, "global-iam-group"),
      permission: layoutAt(880, 320, "region"),
      table: layoutAt(1120, 560, "region"),
      "log-group": layoutAt(1120, 720, "region")
    },
    routing: {
      "api-route": layoutRoute("handle-bottom", "handle-top"),
      "route-method": layoutRoute("handle-bottom", "handle-top"),
      "method-integration": layoutRoute("handle-bottom", "handle-top"),
      "integration-handler": layoutRoute("handle-right", "handle-left"),
      "handler-role": layoutRoute("handle-bottom", "handle-top"),
      "handler-table": layoutRoute("handle-right", "handle-left")
    },
    presentationNodes: {
      user: presentationNode("design-user-client", "API Client", 80, 520),
      region: presentationNode("aws-region", "Region", 200, 80, { width: 1160, height: 880 }),
      "global-iam-group": presentationNode("design-group", "Global IAM", 1400, 280, {
        width: 400,
        height: 400
      })
    },
    presentationEdges: {
      "user-api": presentationEdge("user", "api", "requests", "handle-right", "handle-left")
    }
  },
  "full-serverless-web-app": {
    viewport: { x: 0, y: 0, zoom: 0.52 },
    resources: {
      frontend: layoutAt(520, 520, "frontend-group"),
      "user-pool": layoutAt(760, 560, "identity-group"),
      "user-client": layoutAt(760, 360, "identity-group"),
      api: layoutAt(1000, 240, "api-group", { width: 360, height: 560 }, true),
      authorizer: layoutAt(1080, 320, "api"),
      route: layoutAt(1080, 440, "api"),
      method: layoutAt(1080, 560, "api"),
      integration: layoutAt(1240, 560, "api"),
      deployment: layoutAt(1240, 320, "api"),
      stage: layoutAt(1240, 440, "api"),
      handler: layoutAt(1520, 440, "compute-group"),
      role: layoutAt(1800, 440, "global-iam-group"),
      "role-policy": layoutAt(1960, 440, "global-iam-group"),
      permission: layoutAt(1520, 320, "compute-group"),
      table: layoutAt(1520, 760, "data-ops-group"),
      "log-group": layoutAt(1520, 880, "data-ops-group")
    },
    routing: {
      "frontend-api": layoutRoute("handle-bottom", "handle-bottom"),
      "client-pool": layoutRoute("handle-bottom", "handle-top"),
      "api-pool": layoutRoute("handle-left", "handle-right"),
      "api-handler": layoutRoute("handle-right", "handle-left"),
      "handler-table": layoutRoute("handle-right", "handle-left")
    },
    presentationNodes: {
      "source-repository": presentationNode(
        "design-source-repository",
        "Source Repository",
        160,
        440,
        undefined,
        "source-user-group"
      ),
      user: presentationNode(
        "design-user-client",
        "User",
        160,
        640,
        undefined,
        "source-user-group"
      ),
      region: presentationNode("aws-region", "Region", 360, 80, { width: 1320, height: 960 }),
      "source-user-group": presentationNode("design-group", "Source / User", 80, 320, {
        width: 240,
        height: 480
      }),
      "frontend-group": presentationNode(
        "design-group",
        "Frontend",
        440,
        400,
        { width: 240, height: 320 },
        "region"
      ),
      "identity-group": presentationNode(
        "design-group",
        "Identity",
        680,
        240,
        { width: 240, height: 560 },
        "region"
      ),
      "api-group": presentationNode(
        "design-group",
        "API",
        920,
        160,
        { width: 520, height: 720 },
        "region"
      ),
      "compute-group": presentationNode(
        "design-group",
        "Compute",
        1440,
        240,
        { width: 200, height: 400 },
        "region"
      ),
      "data-ops-group": presentationNode(
        "design-group",
        "Data / Ops",
        1440,
        680,
        { width: 200, height: 320 },
        "region"
      ),
      "global-iam-group": presentationNode("design-group", "Global IAM", 1720, 320, {
        width: 400,
        height: 400
      })
    },
    presentationEdges: {
      "source-frontend": presentationEdge(
        "source-repository",
        "frontend",
        "source",
        "handle-right",
        "handle-left"
      ),
      "user-frontend": presentationEdge("user", "frontend", "opens", "handle-right", "handle-left"),
      "user-pool": presentationEdge(
        "user",
        "user-pool",
        "authenticates",
        "handle-top",
        "handle-top"
      )
    }
  },
  "three-tier-web-app": {
    viewport: { x: 0, y: 0, zoom: 0.46 },
    resources: {
      vpc: layoutAt(320, 160, "region", { width: 1760, height: 1360 }),
      "public-subnet-a": layoutAt(520, 400, "az-a", { width: 400, height: 280 }),
      "public-subnet-b": layoutAt(1480, 400, "az-b", { width: 400, height: 280 }),
      "app-subnet-a": layoutAt(520, 760, "az-a", { width: 400, height: 280 }),
      "app-subnet-b": layoutAt(1480, 760, "az-b", { width: 400, height: 280 }),
      "db-subnet-a": layoutAt(520, 1120, "az-a", { width: 400, height: 240 }),
      "db-subnet-b": layoutAt(1480, 1120, "az-b", { width: 400, height: 240 }),
      "internet-gateway": layoutAt(280, 240, "region"),
      "public-route-table": layoutAt(1160, 280, "vpc"),
      "public-route-a": layoutAt(640, 360, "az-a"),
      "public-route-b": layoutAt(1600, 360, "az-b"),
      "nat-gateway": layoutAt(640, 520, "public-subnet-a"),
      "nat-eip": layoutAt(240, 520, "region"),
      "app-route-table": layoutAt(1160, 680, "vpc"),
      "app-route-a": layoutAt(640, 720, "az-a"),
      "app-route-b": layoutAt(1600, 720, "az-b"),
      "db-route-table": layoutAt(360, 1080, "vpc"),
      "db-route-a": layoutAt(640, 1080, "az-a"),
      "db-route-b": layoutAt(1600, 1080, "az-b"),
      "alb-security-group": layoutAt(1080, 400, "vpc", { width: 240, height: 200 }),
      "app-security-group": layoutAt(1080, 800, "vpc", { width: 240, height: 280 }),
      "db-security-group": layoutAt(1080, 1120, "vpc", { width: 240, height: 240 }),
      "latest-ami": layoutAt(240, 880, "region"),
      "launch-template": layoutAt(1160, 840, "vpc"),
      "load-balancer": layoutAt(1160, 480, "vpc"),
      "target-group": layoutAt(1280, 600, "vpc"),
      listener: layoutAt(1040, 600, "vpc"),
      "application-group": layoutAt(1160, 960, "vpc"),
      "db-subnet-group": layoutAt(1920, 1200, "vpc"),
      database: layoutAt(1160, 1200, "vpc")
    },
    routing: {
      "vpc-igw": layoutRoute("handle-left", "handle-right"),
      "igw-public-route-table": layoutRoute("handle-bottom", "handle-top"),
      "public-route-a-link": layoutRoute("handle-left", "handle-right"),
      "public-route-b-link": layoutRoute("handle-right", "handle-left"),
      "nat-eip-link": layoutRoute("handle-right", "handle-left"),
      "public-nat": layoutRoute("handle-top", "handle-bottom"),
      "nat-app-route-table": layoutRoute("handle-bottom", "handle-top"),
      "app-route-a-link": layoutRoute("handle-left", "handle-right"),
      "app-route-b-link": layoutRoute("handle-right", "handle-left"),
      "db-route-a-link": layoutRoute("handle-top", "handle-top"),
      "db-route-b-link": layoutRoute("handle-top", "handle-top"),
      "alb-sg-load-balancer": layoutRoute("handle-bottom", "handle-top"),
      "load-balancer-listener": layoutRoute("handle-bottom", "handle-top"),
      "listener-target-group": layoutRoute("handle-right", "handle-left"),
      "target-group-asg": layoutRoute("handle-bottom", "handle-top"),
      "app-sg-launch-template": layoutRoute("handle-top", "handle-top"),
      "app-sg-asg": layoutRoute("handle-bottom", "handle-bottom"),
      "launch-template-asg": layoutRoute("handle-bottom", "handle-top"),
      "db-sg-database": layoutRoute("handle-bottom", "handle-top"),
      "app-db": layoutRoute("handle-bottom", "handle-top")
    },
    presentationNodes: {
      internet: presentationNode("design-internet", "Internet", 80, 240),
      region: presentationNode("aws-region", "Asia Pacific (Seoul)", 200, 40, { width: 1960, height: 1560 }),
      "az-a": presentationNode(
        "aws-availability-zone",
        "AZ ap-northeast-2a",
        440,
        280,
        { width: 560, height: 1120 },
        "vpc"
      ),
      "az-b": presentationNode(
        "aws-availability-zone",
        "AZ ap-northeast-2b",
        1400,
        280,
        { width: 560, height: 1120 },
        "vpc"
      )
    },
    presentationEdges: {
      "internet-igw": presentationEdge(
        "internet",
        "internet-gateway",
        "connects",
        "handle-right",
        "handle-left"
      )
    }
  },
  "ecs-fargate-container-app": {
    viewport: { x: 0, y: 0, zoom: 0.6 },
    resources: {
      vpc: layoutAt(400, 200, "region", { width: 1360, height: 560 }),
      "subnet-a": layoutAt(520, 560, "vpc", { width: 480, height: 160 }),
      "subnet-b": layoutAt(1080, 560, "vpc", { width: 480, height: 160 }),
      "internet-gateway": layoutAt(360, 240, "region"),
      "route-table": layoutAt(440, 640, "vpc"),
      "route-a": layoutAt(920, 520, "vpc"),
      "route-b": layoutAt(1480, 520, "vpc"),
      cluster: layoutAt(1280, 280, "vpc", { width: 320, height: 240 }, true),
      "alb-security-group": layoutAt(560, 280, "vpc", { width: 200, height: 200 }),
      "task-security-group": layoutAt(1360, 320, "cluster", { width: 160, height: 160 }),
      "execution-role": layoutInSupportGrid(1840, 120, 0, 0, "global-iam-group"),
      "execution-policy": layoutInSupportGrid(1840, 120, 1, 0, "global-iam-group"),
      "task-role": layoutInSupportGrid(1840, 120, 0, 1, "global-iam-group"),
      repository: layoutInSupportGrid(1840, 480, 0, 0, "definition-ops-group"),
      "log-group": layoutInSupportGrid(1840, 480, 0, 1, "definition-ops-group"),
      "load-balancer": layoutAt(640, 360, "vpc"),
      "target-group": layoutAt(1080, 360, "vpc"),
      listener: layoutAt(880, 360, "vpc"),
      task: layoutInSupportGrid(1840, 480, 1, 0, "definition-ops-group"),
      service: layoutAt(1400, 360, "cluster"),
      "scaling-target": layoutInSupportGrid(1840, 480, 1, 1, "definition-ops-group"),
      "scaling-policy": layoutInSupportGrid(1840, 480, 2, 0, "definition-ops-group")
    },
    routing: {
      "vpc-igw": layoutRoute("handle-left", "handle-right"),
      "igw-route-table": layoutRoute("handle-bottom", "handle-left"),
      "route-table-a": layoutRoute("handle-right", "handle-left"),
      "route-table-b": layoutRoute("handle-right", "handle-left"),
      "alb-sg-load-balancer": layoutRoute("handle-bottom", "handle-top"),
      "alb-sg-task-sg": layoutRoute("handle-bottom", "handle-top"),
      "task-sg-service": layoutRoute("handle-bottom", "handle-top"),
      "load-balancer-listener": layoutRoute("handle-right", "handle-left"),
      "listener-target-group": layoutRoute("handle-right", "handle-left"),
      "target-group-service": layoutRoute("handle-right", "handle-left"),
      "cluster-service": layoutRoute("handle-right", "handle-left"),
      "service-task": layoutRoute("handle-right", "handle-left"),
      "service-scaling-target": layoutRoute("handle-right", "handle-left"),
      "scaling-target-policy": layoutRoute("handle-right", "handle-left"),
      "repository-task": layoutRoute("handle-bottom", "handle-top"),
      "task-log-group": layoutRoute("handle-right", "handle-left"),
      "task-role": layoutRoute("handle-top", "handle-bottom")
    },
    presentationNodes: {
      user: presentationNode("design-user-client", "User", 80, 360),
      region: presentationAreaAroundChildren("aws-region", "Asia Pacific (Seoul)", 240, 40, [
        layoutAt(400, 200, "region", { width: 1360, height: 560 }),
        layoutAt(360, 240, "region"),
        presentationAreaAroundChildren(
          "design-group",
          "Definition / Ops",
          1840,
          480,
          [
            layoutInSupportGrid(1840, 480, 0, 0, "definition-ops-group"),
            layoutInSupportGrid(1840, 480, 1, 0, "definition-ops-group"),
            layoutInSupportGrid(1840, 480, 0, 1, "definition-ops-group"),
            layoutInSupportGrid(1840, 480, 1, 1, "definition-ops-group"),
            layoutInSupportGrid(1840, 480, 2, 0, "definition-ops-group")
          ],
          "region"
        ),
        presentationAreaAroundChildren(
          "design-group",
          "Global IAM",
          1840,
          120,
          [
            layoutInSupportGrid(1840, 120, 0, 0, "global-iam-group"),
            layoutInSupportGrid(1840, 120, 1, 0, "global-iam-group"),
            layoutInSupportGrid(1840, 120, 0, 1, "global-iam-group")
          ],
          "region"
        )
      ]),
      "definition-ops-group": presentationAreaAroundChildren(
        "design-group",
        "Definition / Ops",
        1840,
        480,
        [
          layoutInSupportGrid(1840, 480, 0, 0, "definition-ops-group"),
          layoutInSupportGrid(1840, 480, 1, 0, "definition-ops-group"),
          layoutInSupportGrid(1840, 480, 0, 1, "definition-ops-group"),
          layoutInSupportGrid(1840, 480, 1, 1, "definition-ops-group"),
          layoutInSupportGrid(1840, 480, 2, 0, "definition-ops-group")
        ],
        "region"
      ),
      "global-iam-group": presentationAreaAroundChildren(
        "design-group",
        "Global IAM",
        1840,
        120,
        [
          layoutInSupportGrid(1840, 120, 0, 0, "global-iam-group"),
          layoutInSupportGrid(1840, 120, 1, 0, "global-iam-group"),
          layoutInSupportGrid(1840, 120, 0, 1, "global-iam-group")
        ],
        "region"
      )
    },
    presentationEdges: {
      "user-load-balancer": presentationEdge(
        "user",
        "load-balancer",
        "requests",
        "handle-right",
        "handle-left"
      )
    }
  },
  "eks-container-app": {
    viewport: { x: 0, y: 0, zoom: 0.46 },
    resources: {
      vpc: layoutAt(320, 240, "region", { width: 1480, height: 1040 }),
      "subnet-a": layoutAt(520, 480, "az-a", { width: 360, height: 160 }),
      "subnet-b": layoutAt(1280, 480, "az-b", { width: 360, height: 160 }),
      "internet-gateway": layoutAt(280, 320, "region"),
      "route-table": layoutAt(360, 440, "vpc"),
      "route-a": layoutAt(480, 440, "az-a"),
      "route-b": layoutAt(1240, 440, "az-b"),
      "cluster-security-group": layoutAt(960, 440, "vpc", { width: 240, height: 200 }),
      "cluster-role": layoutAt(1960, 320, "global-iam-group"),
      "node-role": layoutAt(1960, 480, "global-iam-group"),
      "cluster-policy": layoutAt(2120, 320, "global-iam-group"),
      "node-policy": layoutAt(2120, 480, "global-iam-group"),
      "node-cni-policy": layoutAt(1960, 640, "global-iam-group"),
      "node-ecr-policy": layoutAt(2120, 640, "global-iam-group"),
      cluster: layoutAt(1040, 520, "vpc"),
      "node-group": layoutAt(640, 920, "workloads-group"),
      namespace: layoutAt(960, 840, "workloads-group", { width: 520, height: 240 }, true),
      deployment: layoutAt(1040, 920, "namespace"),
      service: layoutAt(1280, 920, "namespace")
    },
    routing: {
      "vpc-igw": layoutRoute("handle-left", "handle-right"),
      "igw-route-table": layoutRoute("handle-bottom", "handle-left"),
      "route-table-a": layoutRoute("handle-right", "handle-left"),
      "route-table-b": layoutRoute("handle-right", "handle-left"),
      "cluster-sg-cluster": layoutRoute("handle-bottom", "handle-top"),
      "cluster-role": layoutRoute("handle-left", "handle-right"),
      "cluster-subnet": layoutRoute("handle-top", "handle-bottom"),
      "cluster-subnet-b": layoutRoute("handle-top", "handle-bottom"),
      "cluster-node-group": layoutRoute("handle-left", "handle-left"),
      "deployment-service": layoutRoute("handle-right", "handle-left")
    },
    presentationNodes: {
      region: presentationNode("aws-region", "Asia Pacific (Seoul)", 200, 40, { width: 2120, height: 1320 }),
      "az-a": presentationNode(
        "aws-availability-zone",
        "AZ ap-northeast-2a",
        440,
        400,
        { width: 520, height: 280 },
        "vpc"
      ),
      "az-b": presentationNode(
        "aws-availability-zone",
        "AZ ap-northeast-2b",
        1200,
        400,
        { width: 520, height: 280 },
        "vpc"
      ),
      "workloads-group": presentationNode(
        "design-group",
        "EKS Workloads",
        520,
        800,
        { width: 1120, height: 360 },
        "vpc"
      ),
      "global-iam-group": presentationNode(
        "design-group",
        "Global IAM",
        1880,
        200,
        { width: 360, height: 800 },
        "region"
      )
    },
    presentationEdges: {}
  }
};

export const templateDefinitions = [
  createTemplate({
    id: "static-web-hosting",
    title: "Static Web Hosting",
    description: "S3와 CloudFront로 보호된 정적 웹사이트를 배포합니다.",
    tags: ["S3", "CloudFront", "OAC"],
    resources: [
      resource("bucket", "Static Website S3 Bucket", "aws", "aws_s3_bucket", 100, 180, { forceDestroy: true }),
      resource("index-object", "Index Page S3 Object", "aws", "aws_s3_object", 100, 500, {
        bucket: "@ref:bucket.id",
        key: "index.html",
        contentType: "text/html; charset=utf-8",
        content:
          '<!doctype html><html><head><meta charset="utf-8"><title>SketchCatch</title></head><body><h1>SketchCatch Static Web</h1></body></html>'
      }),
      resource(
        "public-access",
        "S3 Public Access Block",
        "aws",
        "aws_s3_bucket_public_access_block",
        100,
        340,
        {
          bucket: "@ref:bucket.id"
        }
      ),
      resource(
        "oac",
        "CloudFront OAC",
        "aws",
        "aws_cloudfront_origin_access_control",
        360,
        180,
        {
          name: "static-site-oac",
          originAccessControlOriginType: "s3",
          signingBehavior: "always",
          signingProtocol: "sigv4"
        }
      ),
      resource(
        "distribution",
        "Static Website CloudFront Distribution",
        "aws",
        "aws_cloudfront_distribution",
        620,
        180,
        {
          enabled: true,
          defaultRootObject: "index.html",
          priceClass: "PriceClass_100",
          origin: [
            {
              domainName: "@ref:bucket.bucket_regional_domain_name",
              originId: "static-bucket",
              originAccessControlId: "@ref:oac.id"
            }
          ],
          defaultCacheBehavior: [
            {
              allowedMethods: ["GET", "HEAD"],
              cachedMethods: ["GET", "HEAD"],
              targetOriginId: "static-bucket",
              viewerProtocolPolicy: "redirect-to-https",
              forwardedValues: { queryString: false, cookies: { forward: "none" } }
            }
          ],
          restrictions: [{ geoRestriction: { restrictionType: "none" } }],
          viewerCertificate: [{ cloudfrontDefaultCertificate: true }]
        }
      ),
      resource("bucket-policy", "CloudFront S3 Read Policy", "aws", "aws_s3_bucket_policy", 360, 360, {
        bucket: "@ref:bucket.id",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "AllowCloudFrontServicePrincipalReadOnly",
              Effect: "Allow",
              Principal: { Service: "cloudfront.amazonaws.com" },
              Action: "s3:GetObject",
              Resource: "${@ref:bucket.arn}/*",
              Condition: {
                StringEquals: { "AWS:SourceArn": "${@ref:distribution.arn}" }
              }
            }
          ]
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
    parameters: [
      parameter("projectSlug", "Project slug", true, "sketchcatch"),
      parameter("customDomain", "Custom domain", false, null)
    ]
  }),
  createTemplate({
    id: "minimal-serverless-api",
    title: "Minimal Serverless API",
    description: "API Gateway, Lambda, DynamoDB로 구성한 최소 API입니다.",
    tags: ["API Gateway", "Lambda", "DynamoDB"],
    resources: [
      resource("api", "API Gateway REST API", "aws", "aws_api_gateway_rest_api", 80, 180, {
        name: "items-api"
      }),
      resource("route", "API Route", "aws", "aws_api_gateway_resource", 300, 180, {
        pathPart: "items",
        restApiId: "@ref:api.id",
        parentId: "@ref:api.root_resource_id"
      }),
      resource("method", "POST Method", "aws", "aws_api_gateway_method", 500, 180, {
        httpMethod: "POST",
        authorization: "NONE",
        restApiId: "@ref:api.id",
        resourceId: "@ref:route.id"
      }),
      resource(
        "integration",
        "Lambda Proxy Integration",
        "aws",
        "aws_api_gateway_integration",
        700,
        180,
        {
          type: "AWS_PROXY",
          httpMethod: "POST",
          restApiId: "@ref:api.id",
          resourceId: "@ref:route.id",
          integrationHttpMethod: "POST",
          uri: "@ref:handler.invoke_arn"
        }
      ),
      resource("deployment", "API Deployment", "aws", "aws_api_gateway_deployment", 900, 180, {
        restApiId: "@ref:api.id",
        triggers: { redeployment: "items-v1" },
        dependsOn: ["@address:integration"]
      }),
      resource("stage", "API Stage", "aws", "aws_api_gateway_stage", 1080, 180, {
        restApiId: "@ref:api.id",
        deploymentId: "@ref:deployment.id",
        stageName: "prod"
      }),
      resource("handler", "Lambda Function", "aws", "aws_lambda_function", 300, 360, {
        functionName: "items-handler",
        handler: "index.handler",
        runtime: "nodejs22.x",
        inlineSource: LAMBDA_INLINE_SOURCE,
        memorySize: 128,
        timeout: 10,
        role: "@ref:role.arn",
        environment: { variables: { TABLE_NAME: "@ref:table.name" } }
      }),
      resource("role", "Lambda Execution IAM Role", "aws", "aws_iam_role", 80, 360, {
        name: "items-handler-role",
        assumeRolePolicy: LAMBDA_ASSUME_ROLE_POLICY
      }),
      resource("role-policy", "DynamoDB Access IAM Policy", "aws", "aws_iam_role_policy", 80, 500, {
        name: "items-handler-dynamodb",
        role: "@ref:role.id",
        policy: createDynamoDbPolicy("table")
      }),
      resource("permission", "API Gateway Invoke Permission", "aws", "aws_lambda_permission", 900, 360, {
        statementId: "AllowApiGatewayInvoke",
        action: "lambda:InvokeFunction",
        functionName: "@ref:handler.function_name",
        principal: "apigateway.amazonaws.com",
        sourceArn: "${@ref:api.execution_arn}/*/*"
      }),
      resource("table", "DynamoDB Table", "aws", "aws_dynamodb_table", 560, 360, {
        name: "items",
        billingMode: "PAY_PER_REQUEST",
        hashKey: "id",
        attribute: [{ name: "id", type: "S" }]
      }),
      resource("log-group", "Lambda CloudWatch Log Group", "aws", "aws_cloudwatch_log_group", 780, 500, {
        name: "/aws/lambda/${@ref:handler.function_name}",
        retentionInDays: 7
      })
    ],
    relationships: [
      relationship("api-route", "api", "route", "contains"),
      relationship("route-method", "route", "method", "exposes"),
      relationship("method-integration", "method", "integration", "invokes"),
      relationship("integration-handler", "integration", "handler", "calls"),
      relationship("handler-role", "handler", "role", "assumes"),
      relationship("handler-table", "handler", "table", "reads/writes")
    ],
    parameters: [
      parameter("projectSlug", "Project slug", true, "sketchcatch"),
      parameter("apiAuth", "API authentication", false, "disabled")
    ]
  }),
  createTemplate({
    id: "full-serverless-web-app",
    title: "Full Serverless Web App",
    description: "Frontend, Cognito, API, Lambda, DynamoDB를 연결한 웹 앱입니다.",
    tags: ["Cognito", "API", "Lambda", "DynamoDB"],
    resources: [
      resource("frontend", "Amplify App", "aws", "aws_amplify_app", 80, 180, {
        name: "serverless-web"
      }),
      resource("user-pool", "Cognito User Pool", "aws", "aws_cognito_user_pool", 320, 180, {
        name: "serverless-users"
      }),
      resource(
        "user-client",
        "Cognito App Client",
        "aws",
        "aws_cognito_user_pool_client",
        520,
        180,
        { name: "serverless-web-client", userPoolId: "@ref:user-pool.id" }
      ),
      resource("api", "API Gateway REST API", "aws", "aws_api_gateway_rest_api", 760, 180, {
        name: "serverless-api"
      }),
      resource("authorizer", "Cognito API Authorizer", "aws", "aws_api_gateway_authorizer", 980, 180, {
        name: "serverless-cognito",
        restApiId: "@ref:api.id",
        type: "COGNITO_USER_POOLS",
        providerArns: ["@ref:user-pool.arn"],
        identitySource: "method.request.header.Authorization"
      }),
      resource("route", "API Route", "aws", "aws_api_gateway_resource", 760, 340, {
        pathPart: "items",
        restApiId: "@ref:api.id",
        parentId: "@ref:api.root_resource_id"
      }),
      resource("method", "Authenticated POST Method", "aws", "aws_api_gateway_method", 980, 340, {
        httpMethod: "POST",
        authorization: "COGNITO_USER_POOLS",
        authorizerId: "@ref:authorizer.id",
        restApiId: "@ref:api.id",
        resourceId: "@ref:route.id"
      }),
      resource(
        "integration",
        "Lambda Proxy Integration",
        "aws",
        "aws_api_gateway_integration",
        1180,
        340,
        {
          type: "AWS_PROXY",
          httpMethod: "POST",
          integrationHttpMethod: "POST",
          restApiId: "@ref:api.id",
          resourceId: "@ref:route.id",
          uri: "@ref:handler.invoke_arn"
        }
      ),
      resource("deployment", "API Deployment", "aws", "aws_api_gateway_deployment", 1180, 500, {
        restApiId: "@ref:api.id",
        triggers: { redeployment: "serverless-v1" },
        dependsOn: ["@address:integration"]
      }),
      resource("stage", "API Stage", "aws", "aws_api_gateway_stage", 1180, 660, {
        restApiId: "@ref:api.id",
        deploymentId: "@ref:deployment.id",
        stageName: "prod"
      }),
      resource("handler", "Lambda Function", "aws", "aws_lambda_function", 360, 380, {
        functionName: "serverless-handler",
        handler: "index.handler",
        runtime: "nodejs22.x",
        inlineSource: LAMBDA_INLINE_SOURCE,
        memorySize: 128,
        timeout: 10,
        role: "@ref:role.arn",
        environment: { variables: { TABLE_NAME: "@ref:table.name" } }
      }),
      resource("role", "Lambda Execution IAM Role", "aws", "aws_iam_role", 100, 380, {
        name: "serverless-handler-role",
        assumeRolePolicy: LAMBDA_ASSUME_ROLE_POLICY
      }),
      resource("role-policy", "DynamoDB Access IAM Policy", "aws", "aws_iam_role_policy", 100, 540, {
        name: "serverless-handler-dynamodb",
        role: "@ref:role.id",
        policy: createDynamoDbPolicy("table")
      }),
      resource("permission", "API Gateway Invoke Permission", "aws", "aws_lambda_permission", 620, 540, {
        statementId: "AllowApiGatewayInvoke",
        action: "lambda:InvokeFunction",
        functionName: "@ref:handler.function_name",
        principal: "apigateway.amazonaws.com",
        sourceArn: "${@ref:api.execution_arn}/*/*"
      }),
      resource("table", "DynamoDB Table", "aws", "aws_dynamodb_table", 620, 380, {
        name: "serverless-items",
        billingMode: "PAY_PER_REQUEST",
        hashKey: "id",
        attribute: [{ name: "id", type: "S" }]
      }),
      resource("log-group", "Lambda CloudWatch Log Group", "aws", "aws_cloudwatch_log_group", 860, 540, {
        name: "/aws/lambda/${@ref:handler.function_name}",
        retentionInDays: 7
      })
    ],
    relationships: [
      relationship("frontend-api", "frontend", "api", "calls"),
      relationship("client-pool", "user-client", "user-pool", "authenticates"),
      relationship("api-pool", "api", "user-pool", "authorizes"),
      relationship("api-handler", "api", "handler", "invokes"),
      relationship("handler-table", "handler", "table", "reads/writes")
    ],
    parameters: [
      parameter("projectSlug", "Project slug", true, "sketchcatch"),
      parameter("enableAuth", "Enable Cognito auth", true, true)
    ]
  }),
  createTemplate({
    id: "three-tier-web-app",
    title: "3-Tier Web App",
    description: "Public, application, database tier를 분리한 VPC 기반 구조입니다.",
    tags: ["VPC", "ALB", "ASG", "RDS"],
    resources: [
      resource("vpc", "VPC", "aws", "aws_vpc", 360, 80, {
        cidrBlock: "10.20.0.0/16",
        enableDnsSupport: true,
        enableDnsHostnames: true
      }),
      resource(
        "public-subnet-a",
        "Public Subnet A",
        "aws",
        "aws_subnet",
        80,
        240,
        {
          cidrBlock: "10.20.1.0/24",
          vpcId: "@ref:vpc.id",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true
        },
        "resource",
        "vpc"
      ),
      resource(
        "public-subnet-b",
        "Public Subnet B",
        "aws",
        "aws_subnet",
        280,
        240,
        {
          cidrBlock: "10.20.2.0/24",
          vpcId: "@ref:vpc.id",
          availabilityZone: "ap-northeast-2b",
          mapPublicIpOnLaunch: true
        },
        "resource",
        "vpc"
      ),
      resource(
        "app-subnet-a",
        "Application Private Subnet A",
        "aws",
        "aws_subnet",
        480,
        240,
        { cidrBlock: "10.20.11.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" },
        "resource",
        "vpc"
      ),
      resource(
        "app-subnet-b",
        "Application Private Subnet B",
        "aws",
        "aws_subnet",
        680,
        240,
        { cidrBlock: "10.20.12.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2b" },
        "resource",
        "vpc"
      ),
      resource(
        "db-subnet-a",
        "Database Isolated Subnet A",
        "aws",
        "aws_subnet",
        880,
        240,
        { cidrBlock: "10.20.21.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2a" },
        "resource",
        "vpc"
      ),
      resource(
        "db-subnet-b",
        "Database Isolated Subnet B",
        "aws",
        "aws_subnet",
        1080,
        240,
        { cidrBlock: "10.20.22.0/24", vpcId: "@ref:vpc.id", availabilityZone: "ap-northeast-2b" },
        "resource",
        "vpc"
      ),
      resource("internet-gateway", "Internet Gateway", "aws", "aws_internet_gateway", 100, 440, {
        vpcId: "@ref:vpc.id"
      }),
      resource("public-route-table", "Public Route Table", "aws", "aws_route_table", 260, 440, {
        vpcId: "@ref:vpc.id",
        route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "@ref:internet-gateway.id" }]
      }),
      resource("public-route-a", "Public Route Association A", "aws", "aws_route_table_association", 420, 440, {
        subnetId: "@ref:public-subnet-a.id",
        routeTableId: "@ref:public-route-table.id"
      }),
      resource("public-route-b", "Public Route Association B", "aws", "aws_route_table_association", 580, 440, {
        subnetId: "@ref:public-subnet-b.id",
        routeTableId: "@ref:public-route-table.id"
      }),
      resource("nat-gateway", "NAT Gateway", "aws", "aws_nat_gateway", 740, 440, {
        allocationId: "@ref:nat-eip.id",
        subnetId: "@ref:public-subnet-a.id"
      }),
      resource("nat-eip", "NAT EIP", "aws", "aws_eip", 620, 440, { domain: "vpc" }),
      resource("app-route-table", "Application Private Route Table", "aws", "aws_route_table", 900, 440, {
        vpcId: "@ref:vpc.id",
        route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: "@ref:nat-gateway.id" }]
      }),
      resource("app-route-a", "Application Route Association A", "aws", "aws_route_table_association", 1060, 440, {
        subnetId: "@ref:app-subnet-a.id",
        routeTableId: "@ref:app-route-table.id"
      }),
      resource("app-route-b", "Application Route Association B", "aws", "aws_route_table_association", 1220, 440, {
        subnetId: "@ref:app-subnet-b.id",
        routeTableId: "@ref:app-route-table.id"
      }),
      resource("db-route-table", "Database Isolated Route Table", "aws", "aws_route_table", 1380, 440, {
        vpcId: "@ref:vpc.id"
      }),
      resource("db-route-a", "Database Route Association A", "aws", "aws_route_table_association", 1540, 440, {
        subnetId: "@ref:db-subnet-a.id",
        routeTableId: "@ref:db-route-table.id"
      }),
      resource("db-route-b", "Database Route Association B", "aws", "aws_route_table_association", 1700, 440, {
        subnetId: "@ref:db-subnet-b.id",
        routeTableId: "@ref:db-route-table.id"
      }),
      resource("alb-security-group", "ALB SG", "aws", "aws_security_group", 80, 620, {
        name: "three-tier-alb",
        description: "Allow HTTP to the ALB",
        vpcId: "@ref:vpc.id",
        ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] }],
        egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]
      }),
      resource(
        "app-security-group",
        "Application Security Group",
        "aws",
        "aws_security_group",
        260,
        620,
        {
          name: "three-tier-app",
          description: "Allow ALB traffic to application instances",
          vpcId: "@ref:vpc.id",
          ingress: [
            {
              fromPort: 80,
              toPort: 80,
              protocol: "tcp",
              securityGroups: ["@ref:alb-security-group.id"]
            }
          ],
          egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]
        }
      ),
      resource(
        "db-security-group",
        "Database Security Group",
        "aws",
        "aws_security_group",
        440,
        620,
        {
          name: "three-tier-db",
          description: "Allow PostgreSQL from application instances",
          vpcId: "@ref:vpc.id",
          ingress: [
            {
              fromPort: 5432,
              toPort: 5432,
              protocol: "tcp",
              securityGroups: ["@ref:app-security-group.id"]
            }
          ],
          egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]
        }
      ),
      dataResource("latest-ami", "Latest Amazon Linux AMI", "aws", "aws_ami", 340, 620, {
        mostRecent: true,
        owners: ["amazon"],
        filter: [
          { name: "name", values: ["al2023-ami-2023.*-kernel-6.1-arm64"] },
          { name: "architecture", values: ["arm64"] },
          { name: "virtualization-type", values: ["hvm"] }
        ]
      }),
      resource(
        "launch-template",
        "Application Launch Template",
        "aws",
        "aws_launch_template",
        560,
        620,
        {
          namePrefix: "three-tier-app-",
          imageId: "@ref:latest-ami.id",
          instanceType: "t4g.micro",
          userData: THREE_TIER_USER_DATA,
          vpcSecurityGroupIds: ["@ref:app-security-group.id"]
        }
      ),
      resource("load-balancer", "Public ALB", "aws", "aws_lb", 100, 780, {
        name: "three-tier-alb",
        loadBalancerType: "application",
        subnets: ["@ref:public-subnet-a.id", "@ref:public-subnet-b.id"],
        securityGroups: ["@ref:alb-security-group.id"]
      }),
      resource("target-group", "Application Target Group", "aws", "aws_lb_target_group", 300, 780, {
        name: "three-tier-app",
        port: 80,
        protocol: "HTTP",
        targetType: "instance",
        vpcId: "@ref:vpc.id",
        healthCheck: { path: "/", matcher: "200-399" }
      }),
      resource("listener", "HTTP Listener", "aws", "aws_lb_listener", 500, 780, {
        loadBalancerArn: "@ref:load-balancer.arn",
        port: 80,
        protocol: "HTTP",
        defaultAction: { type: "forward", targetGroupArn: "@ref:target-group.arn" }
      }),
      resource(
        "application-group",
        "Application Auto Scaling Group",
        "aws",
        "aws_autoscaling_group",
        700,
        780,
        {
          minSize: 1,
          maxSize: 2,
          desiredCapacity: 1,
          healthCheckType: "ELB",
          vpcZoneIdentifier: ["@ref:app-subnet-a.id", "@ref:app-subnet-b.id"],
          targetGroupArns: ["@ref:target-group.arn"],
          launchTemplate: { id: "@ref:launch-template.id", version: "$Latest" }
        }
      ),
      resource("db-subnet-group", "RDS Subnet Group", "aws", "aws_db_subnet_group", 900, 780, {
        name: "three-tier-db",
        subnetIds: ["@ref:db-subnet-a.id", "@ref:db-subnet-b.id"]
      }),
      resource("database", "PostgreSQL RDS", "aws", "aws_db_instance", 1100, 780, {
        identifier: "three-tier-db",
        engine: "postgres",
        instanceClass: "db.t4g.micro",
        allocatedStorage: 20,
        publiclyAccessible: false,
        manageMasterUserPassword: true,
        username: "appadmin",
        skipFinalSnapshot: true,
        dbSubnetGroupName: "@ref:db-subnet-group.name",
        vpcSecurityGroupIds: ["@ref:db-security-group.id"]
      })
    ],
    relationships: [
      relationship("vpc-public-a", "vpc", "public-subnet-a", "contains"),
      relationship("vpc-public-b", "vpc", "public-subnet-b", "contains"),
      relationship("vpc-app-a", "vpc", "app-subnet-a", "contains"),
      relationship("vpc-app-b", "vpc", "app-subnet-b", "contains"),
      relationship("vpc-db-a", "vpc", "db-subnet-a", "contains"),
      relationship("vpc-db-b", "vpc", "db-subnet-b", "contains"),
      relationship("vpc-igw", "vpc", "internet-gateway", "routes"),
      relationship(
        "igw-public-route-table",
        "internet-gateway",
        "public-route-table",
        "default route"
      ),
      relationship("public-route-a-link", "public-route-table", "public-route-a", "associates"),
      relationship("public-route-b-link", "public-route-table", "public-route-b", "associates"),
      relationship("nat-eip-link", "nat-eip", "nat-gateway", "allocates"),
      relationship("public-nat", "public-subnet-a", "nat-gateway", "egress"),
      relationship("nat-app-route-table", "nat-gateway", "app-route-table", "private egress"),
      relationship("app-route-a-link", "app-route-table", "app-route-a", "associates"),
      relationship("app-route-b-link", "app-route-table", "app-route-b", "associates"),
      relationship("db-route-a-link", "db-route-table", "db-route-a", "associates"),
      relationship("db-route-b-link", "db-route-table", "db-route-b", "associates"),
      relationship("alb-sg-load-balancer", "alb-security-group", "load-balancer", "applies to"),
      relationship("load-balancer-listener", "load-balancer", "listener", "listens"),
      relationship("listener-target-group", "listener", "target-group", "forwards"),
      relationship("target-group-asg", "target-group", "application-group", "routes"),
      relationship("app-sg-launch-template", "app-security-group", "launch-template", "applies to"),
      relationship("app-sg-asg", "app-security-group", "application-group", "protects instances"),
      relationship("launch-template-asg", "launch-template", "application-group", "launches"),
      relationship("db-sg-database", "db-security-group", "database", "applies to"),
      relationship("app-db", "application-group", "database", "reads/writes")
    ],
    parameters: [
      parameter("projectSlug", "Project slug", true, "sketchcatch"),
      parameter("enableNatGateway", "Enable NAT Gateway", true, true)
    ]
  }),
  createTemplate({
    id: "ecs-fargate-container-app",
    title: "ECS Fargate Container App",
    description: "ECS Fargate와 Application Load Balancer를 사용하는 컨테이너 앱입니다.",
    tags: ["ECS", "Fargate", "ALB"],
    resources: [
      resource("vpc", "VPC", "aws", "aws_vpc", 300, 80, {
        cidrBlock: "10.30.0.0/16",
        enableDnsSupport: true,
        enableDnsHostnames: true
      }),
      resource(
        "subnet-a",
        "Public Subnet A",
        "aws",
        "aws_subnet",
        100,
        260,
        {
          cidrBlock: "10.30.1.0/24",
          vpcId: "@ref:vpc.id",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true
        },
        "resource",
        "vpc"
      ),
      resource(
        "subnet-b",
        "Public Subnet B",
        "aws",
        "aws_subnet",
        300,
        260,
        {
          cidrBlock: "10.30.2.0/24",
          vpcId: "@ref:vpc.id",
          availabilityZone: "ap-northeast-2b",
          mapPublicIpOnLaunch: true
        },
        "resource",
        "vpc"
      ),
      resource("internet-gateway", "Internet Gateway", "aws", "aws_internet_gateway", 500, 260, {
        vpcId: "@ref:vpc.id"
      }),
      resource("route-table", "Public Route Table", "aws", "aws_route_table", 700, 260, {
        vpcId: "@ref:vpc.id",
        route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "@ref:internet-gateway.id" }]
      }),
      resource("route-a", "Public Route Association A", "aws", "aws_route_table_association", 900, 260, {
        subnetId: "@ref:subnet-a.id",
        routeTableId: "@ref:route-table.id"
      }),
      resource("route-b", "Public Route Association B", "aws", "aws_route_table_association", 1100, 260, {
        subnetId: "@ref:subnet-b.id",
        routeTableId: "@ref:route-table.id"
      }),
      resource("cluster", "ECS Cluster", "aws", "aws_ecs_cluster", 500, 220, {
        name: "fargate-cluster"
      }),
      resource("alb-security-group", "ALB SG", "aws", "aws_security_group", 100, 500, {
        name: "fargate-alb",
        description: "Allow public HTTP to the load balancer",
        vpcId: "@ref:vpc.id",
        ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] }],
        egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]
      }),
      resource(
        "task-security-group",
        "Fargate Task SG",
        "aws",
        "aws_security_group",
        300,
        500,
        {
          name: "fargate-task",
          description: "Allow ALB traffic to Fargate tasks",
          vpcId: "@ref:vpc.id",
          ingress: [
            {
              fromPort: 80,
              toPort: 80,
              protocol: "tcp",
              securityGroups: ["@ref:alb-security-group.id"]
            }
          ],
          egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]
        }
      ),
      resource("execution-role", "ECS Task Execution IAM Role", "aws", "aws_iam_role", 300, 500, {
        name: "fargate-execution-role",
        assumeRolePolicy: ECS_ASSUME_ROLE_POLICY
      }),
      resource(
        "execution-policy",
        "ECS Task Execution Policy Attachment",
        "aws",
        "aws_iam_role_policy_attachment",
        500,
        500,
        {
          role: "@ref:execution-role.name",
          policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
        }
      ),
      resource("task-role", "ECS Task IAM Role", "aws", "aws_iam_role", 700, 500, {
        name: "fargate-task-role",
        assumeRolePolicy: ECS_ASSUME_ROLE_POLICY
      }),
      resource("repository", "ECR Repository", "aws", "aws_ecr_repository", 900, 500, {
        name: "fargate-app",
        imageTagMutability: "IMMUTABLE"
      }),
      resource("log-group", "ECS Task Log Group", "aws", "aws_cloudwatch_log_group", 1100, 500, {
        name: "/ecs/fargate-app",
        retentionInDays: 7
      }),
      resource("load-balancer", "Public ALB", "aws", "aws_lb", 100, 660, {
        name: "fargate-alb",
        loadBalancerType: "application",
        subnets: ["@ref:subnet-a.id", "@ref:subnet-b.id"],
        securityGroups: ["@ref:alb-security-group.id"]
      }),
      resource("target-group", "Target Group", "aws", "aws_lb_target_group", 300, 660, {
        name: "fargate-web",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        vpcId: "@ref:vpc.id",
        healthCheck: { path: "/", matcher: "200-399" }
      }),
      resource("listener", "HTTP Listener", "aws", "aws_lb_listener", 500, 660, {
        loadBalancerArn: "@ref:load-balancer.arn",
        port: 80,
        protocol: "HTTP",
        defaultAction: { type: "forward", targetGroupArn: "@ref:target-group.arn" }
      }),
      resource("task", "ECS Task Definition", "aws", "aws_ecs_task_definition", 700, 660, {
        family: "fargate-app",
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: 256,
        memory: 512,
        executionRoleArn: "@ref:execution-role.arn",
        taskRoleArn: "@ref:task-role.arn",
        containerDefinitions: JSON.stringify([
          {
            name: "web",
            image: "public.ecr.aws/docker/library/nginx:stable",
            essential: true,
            portMappings: [{ containerPort: 80, hostPort: 80, protocol: "tcp" }],
            logConfiguration: {
              logDriver: "awslogs",
              options: {
                "awslogs-group": "${@ref:log-group.name}",
                "awslogs-region": "ap-northeast-2",
                "awslogs-stream-prefix": "ecs"
              }
            }
          }
        ])
      }),
      resource("service", "ECS Service", "aws", "aws_ecs_service", 900, 660, {
        name: "fargate-service",
        cluster: "@ref:cluster.id",
        taskDefinition: "@ref:task.arn",
        desiredCount: 1,
        launchType: "FARGATE",
        healthCheckGracePeriodSeconds: 30,
        networkConfiguration: {
          subnets: ["@ref:subnet-a.id", "@ref:subnet-b.id"],
          securityGroups: ["@ref:task-security-group.id"],
          assignPublicIp: true
        },
        loadBalancer: {
          targetGroupArn: "@ref:target-group.arn",
          containerName: "web",
          containerPort: 80
        },
        dependsOn: ["@address:listener"]
      }),
      resource("scaling-target", "ECS Scaling Target", "aws", "aws_appautoscaling_target", 1100, 660, {
        minCapacity: 1,
        maxCapacity: 3,
        resourceId: "service/${@ref:cluster.name}/${@ref:service.name}",
        scalableDimension: "ecs:service:DesiredCount",
        serviceNamespace: "ecs"
      }),
      resource("scaling-policy", "Request Scaling Policy", "aws", "aws_appautoscaling_policy", 1300, 660, {
        name: "${@ref:service.name}-requests",
        policyType: "TargetTrackingScaling",
        resourceId: "@ref:scaling-target.resource_id",
        scalableDimension: "@ref:scaling-target.scalable_dimension",
        serviceNamespace: "@ref:scaling-target.service_namespace",
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 10,
          scaleInCooldown: 60,
          scaleOutCooldown: 30,
          predefinedMetricSpecification: [
            {
              predefinedMetricType: "ALBRequestCountPerTarget",
              resourceLabel:
                "${@ref:load-balancer.arn_suffix}/${@ref:target-group.arn_suffix}"
            }
          ]
        }
      })
    ],
    relationships: [
      relationship("vpc-subnet-a", "vpc", "subnet-a", "contains"),
      relationship("vpc-subnet-b", "vpc", "subnet-b", "contains"),
      relationship("vpc-igw", "vpc", "internet-gateway", "routes"),
      relationship("igw-route-table", "internet-gateway", "route-table", "default route"),
      relationship("route-table-a", "route-table", "route-a", "associates"),
      relationship("route-table-b", "route-table", "route-b", "associates"),
      relationship("alb-sg-load-balancer", "alb-security-group", "load-balancer", "applies to"),
      relationship("alb-sg-task-sg", "alb-security-group", "task-security-group", "allows tcp/80"),
      relationship("task-sg-service", "task-security-group", "service", "applies to"),
      relationship("load-balancer-listener", "load-balancer", "listener", "listens"),
      relationship("listener-target-group", "listener", "target-group", "forwards"),
      relationship("target-group-service", "target-group", "service", "routes"),
      relationship("cluster-service", "cluster", "service", "runs"),
      relationship("service-task", "service", "task", "uses"),
      relationship("service-scaling-target", "service", "scaling-target", "scales"),
      relationship("scaling-target-policy", "scaling-target", "scaling-policy", "tracks requests"),
      // The zero-step default stays on the public nginx image until an image is pushed to this ECR repository.
      relationship("repository-task", "repository", "task", "optional image source"),
      relationship("task-log-group", "task", "log-group", "writes logs"),
      relationship("task-role", "task", "execution-role", "assumes")
    ],
    parameters: [
      parameter("projectSlug", "Project slug", true, "sketchcatch"),
      parameter(
        "containerImage",
        "Container image",
        true,
        "public.ecr.aws/docker/library/nginx:stable"
      )
    ]
  }),
  createTemplate({
    id: "eks-container-app",
    title: "EKS Container App",
    description: "EKS managed node group에서 Kubernetes workload를 실행합니다.",
    tags: ["EKS", "Kubernetes", "Service"],
    resources: [
      resource("vpc", "VPC", "aws", "aws_vpc", 300, 80, {
        cidrBlock: "10.40.0.0/16",
        enableDnsSupport: true,
        enableDnsHostnames: true
      }),
      resource(
        "subnet-a",
        "Public Subnet A",
        "aws",
        "aws_subnet",
        100,
        260,
        {
          cidrBlock: "10.40.1.0/24",
          vpcId: "@ref:vpc.id",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true
        },
        "resource",
        "vpc"
      ),
      resource(
        "subnet-b",
        "Public Subnet B",
        "aws",
        "aws_subnet",
        300,
        260,
        {
          cidrBlock: "10.40.2.0/24",
          vpcId: "@ref:vpc.id",
          availabilityZone: "ap-northeast-2b",
          mapPublicIpOnLaunch: true
        },
        "resource",
        "vpc"
      ),
      resource("internet-gateway", "Internet Gateway", "aws", "aws_internet_gateway", 500, 260, {
        vpcId: "@ref:vpc.id"
      }),
      resource("route-table", "Public Route Table", "aws", "aws_route_table", 700, 260, {
        vpcId: "@ref:vpc.id",
        route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "@ref:internet-gateway.id" }]
      }),
      resource("route-a", "Public Route Association A", "aws", "aws_route_table_association", 900, 260, {
        subnetId: "@ref:subnet-a.id",
        routeTableId: "@ref:route-table.id"
      }),
      resource("route-b", "Public Route Association B", "aws", "aws_route_table_association", 1100, 260, {
        subnetId: "@ref:subnet-b.id",
        routeTableId: "@ref:route-table.id"
      }),
      resource(
        "cluster-security-group",
        "EKS Cluster SG",
        "aws",
        "aws_security_group",
        100,
        420,
        {
          name: "eks-cluster",
          description: "EKS control plane and node communication",
          vpcId: "@ref:vpc.id",
          egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]
        }
      ),
      resource("cluster-role", "EKS Cluster IAM Role", "aws", "aws_iam_role", 520, 180, {
        name: "eks-cluster-role",
        assumeRolePolicy: EKS_ASSUME_ROLE_POLICY
      }),
      resource("node-role", "Worker Node IAM Role", "aws", "aws_iam_role", 520, 340, {
        name: "eks-node-role",
        assumeRolePolicy: EC2_ASSUME_ROLE_POLICY
      }),
      resource(
        "cluster-policy",
        "EKS Cluster Policy Attachment",
        "aws",
        "aws_iam_role_policy_attachment",
        760,
        180,
        {
          role: "@ref:cluster-role.name",
          policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
        }
      ),
      resource(
        "node-policy",
        "Worker Node Policy Attachment",
        "aws",
        "aws_iam_role_policy_attachment",
        760,
        340,
        {
          role: "@ref:node-role.name",
          policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
        }
      ),
      resource(
        "node-cni-policy",
        "CNI Policy Attachment",
        "aws",
        "aws_iam_role_policy_attachment",
        760,
        500,
        { role: "@ref:node-role.name", policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy" }
      ),
      resource(
        "node-ecr-policy",
        "ECR Read Policy Attachment",
        "aws",
        "aws_iam_role_policy_attachment",
        760,
        660,
        {
          role: "@ref:node-role.name",
          policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
        }
      ),
      resource("cluster", "EKS Cluster", "aws", "aws_eks_cluster", 300, 420, {
        name: "eks-app",
        roleArn: "@ref:cluster-role.arn",
        vpcConfig: {
          subnetIds: ["@ref:subnet-a.id", "@ref:subnet-b.id"],
          securityGroupIds: ["@ref:cluster-security-group.id"]
        },
        dependsOn: ["@address:cluster-policy"]
      }),
      resource("node-group", "EKS Node Group", "aws", "aws_eks_node_group", 300, 580, {
        clusterName: "@ref:cluster.name",
        nodeRoleArn: "@ref:node-role.arn",
        subnetIds: ["@ref:subnet-a.id", "@ref:subnet-b.id"],
        instanceTypes: ["t3.small"],
        scalingConfig: { desiredSize: 1, minSize: 1, maxSize: 2 },
        dependsOn: ["@address:node-policy", "@address:node-cni-policy", "@address:node-ecr-policy"]
      }),
      resource(
        "namespace",
        "Kubernetes Namespace",
        "kubernetes",
        "kubernetes_namespace",
        620,
        500,
        { metadata: { name: "sketchcatch" } }
      ),
      resource(
        "deployment",
        "Kubernetes Deployment",
        "kubernetes",
        "kubernetes_deployment",
        620,
        660,
        {
          metadata: { name: "web", namespace: "@ref:namespace.metadata.0.name" },
          spec: {
            replicas: 1,
            selector: [{ matchLabels: { app: "web" } }],
            template: {
              metadata: { labels: { app: "web" } },
              spec: {
                container: [{ name: "web", image: "nginx:stable", port: [{ containerPort: 80 }] }]
              }
            }
          },
          dependsOn: ["@address:node-group"]
        }
      ),
      resource("service", "Kubernetes Service", "kubernetes", "kubernetes_service", 860, 660, {
        metadata: { name: "web", namespace: "@ref:namespace.metadata.0.name" },
        spec: { selector: { app: "web" }, port: [{ port: 80, targetPort: 80 }], type: "ClusterIP" }
      })
    ],
    relationships: [
      relationship("vpc-subnet-a", "vpc", "subnet-a", "contains"),
      relationship("vpc-subnet-b", "vpc", "subnet-b", "contains"),
      relationship("vpc-igw", "vpc", "internet-gateway", "routes"),
      relationship("igw-route-table", "internet-gateway", "route-table", "default route"),
      relationship("route-table-a", "route-table", "route-a", "associates"),
      relationship("route-table-b", "route-table", "route-b", "associates"),
      relationship(
        "cluster-sg-cluster",
        "cluster-security-group",
        "cluster",
        "applies to control plane"
      ),
      relationship("cluster-role", "cluster-role", "cluster", "authorizes"),
      relationship("cluster-subnet", "cluster", "subnet-a", "uses"),
      relationship("cluster-subnet-b", "cluster", "subnet-b", "uses"),
      relationship("cluster-node-group", "cluster", "node-group", "runs"),
      relationship("cluster-namespace", "cluster", "namespace", "hosts"),
      relationship("namespace-deployment", "namespace", "deployment", "contains"),
      relationship("deployment-service", "deployment", "service", "exposes")
    ],
    parameters: [
      parameter("projectSlug", "Project slug", true, "sketchcatch"),
      parameter("containerImage", "Container image", true, "nginx:stable")
    ]
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
  // Keep project metadata out of Terraform local names so Board labels and deployable identity remain separate.
  const definition = getTemplateDefinitionById(templateId);
  const resources =
    templateId === "ecs-fargate-container-app"
      ? applyEcsFargateRuntimeNames(definition.resources, input.projectSlug)
      : definition.resources;
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const resourceNames = createTemplateTerraformResourceNames(resources);
  const nodeIdByResourceId = new Map(
    resources.map((resource) => [resource.id, `template-${templateId}-${resource.id}`])
  );
  const nodeIdByPresentationId = new Map(
    definition.presentationNodes.map((node) => [
      node.id,
      `template-${templateId}-presentation-${node.id}`
    ])
  );
  const nodeIdByTemplateNodeId = new Map([...nodeIdByResourceId, ...nodeIdByPresentationId]);

  return {
    nodes: [
      ...resources.map((resource) =>
        createDiagramNode(
          resource,
          resourceById,
          resourceNames,
          nodeIdByResourceId,
          nodeIdByTemplateNodeId
        )
      ),
      ...definition.presentationNodes.map((node) =>
        createPresentationDiagramNode(node, nodeIdByPresentationId, nodeIdByTemplateNodeId)
      )
    ],
    edges: [
      ...definition.relationships.map((relationship) => {
        const presentationRole = getTemplateRelationshipPresentationRole(
          templateId,
          relationship.id
        );

        return {
          id: `template-${templateId}-${relationship.id}`,
          label: relationship.label,
          metadata: presentationRole ? { presentationRole } : undefined,
          sourceNodeId: nodeIdByResourceId.get(relationship.sourceResourceId) ?? "",
          targetNodeId: nodeIdByResourceId.get(relationship.targetResourceId) ?? "",
          type: relationship.type ?? "smoothstep",
          ...(relationship.sourceHandleId ? { sourceHandleId: relationship.sourceHandleId } : {}),
          ...(relationship.targetHandleId ? { targetHandleId: relationship.targetHandleId } : {})
        };
      }),
      ...definition.presentationEdges.map((edge) => ({
        id: `template-${templateId}-presentation-${edge.id}`,
        label: edge.label,
        metadata: { presentationRole: "primary" as const },
        sourceNodeId: nodeIdByTemplateNodeId.get(edge.sourceNodeId) ?? "",
        targetNodeId: nodeIdByTemplateNodeId.get(edge.targetNodeId) ?? "",
        type: edge.type ?? "smoothstep",
        ...(edge.sourceHandleId ? { sourceHandleId: edge.sourceHandleId } : {}),
        ...(edge.targetHandleId ? { targetHandleId: edge.targetHandleId } : {})
      }))
    ],
    viewport: definition.viewport ? { ...definition.viewport } : { x: 0, y: 0, zoom: 0.8 },
    ...(definition.presentation
      ? {
          presentation: {
            ...definition.presentation,
            ...(definition.presentation.sourceViewBox
              ? { sourceViewBox: { ...definition.presentation.sourceViewBox } }
              : {})
          }
        }
      : {})
  };
}

export function createEcsFargateRuntimeNames(projectSlug: string): EcsFargateRuntimeNames {
  const normalizedSlug =
    projectSlug
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 48)
      .replace(/-+$/gu, "") || "sketchcatch";
  const applicationName = `${normalizedSlug}-app`;

  return {
    ecrRepositoryName: applicationName,
    clusterName: `${normalizedSlug}-cluster`,
    serviceName: `${normalizedSlug}-service`,
    taskFamily: applicationName,
    containerName: "web",
    logGroupName: `/ecs/${applicationName}`
  };
}

function applyEcsFargateRuntimeNames(
  resources: readonly TemplateResourceDefinition[],
  projectSlug: string
): readonly TemplateResourceDefinition[] {
  const names = createEcsFargateRuntimeNames(projectSlug);

  return resources.map((resource) => {
    if (resource.id === "repository") {
      return { ...resource, values: { ...resource.values, name: names.ecrRepositoryName } };
    }
    if (resource.id === "cluster") {
      return { ...resource, values: { ...resource.values, name: names.clusterName } };
    }
    if (resource.id === "service") {
      const loadBalancer = isTemplateRecord(resource.values.loadBalancer)
        ? { ...resource.values.loadBalancer, containerName: names.containerName }
        : resource.values.loadBalancer;
      return {
        ...resource,
        values: { ...resource.values, name: names.serviceName, loadBalancer }
      };
    }
    if (resource.id === "log-group") {
      return { ...resource, values: { ...resource.values, name: names.logGroupName } };
    }
    if (resource.id === "task") {
      return {
        ...resource,
        values: {
          ...resource.values,
          family: names.taskFamily,
          containerDefinitions: renameEcsContainerDefinition(
            resource.values.containerDefinitions,
            names.containerName
          )
        }
      };
    }

    return resource;
  });
}

function renameEcsContainerDefinition(value: unknown, containerName: string): unknown {
  if (typeof value !== "string") return value;

  try {
    const definitions: unknown = JSON.parse(value);
    if (!Array.isArray(definitions)) return value;

    return JSON.stringify(
      definitions.map((definition, index) =>
        index === 0 && isTemplateRecord(definition)
          ? { ...definition, name: containerName }
          : definition
      )
    );
  } catch {
    return value;
  }
}

function isTemplateRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ECS_FARGATE_PRIMARY_RELATIONSHIP_IDS = new Set([
  "load-balancer-listener",
  "listener-target-group",
  "target-group-service"
]);

function getTemplateRelationshipPresentationRole(
  templateId: TemplateId,
  relationshipId: string
): "detail" | "primary" | undefined {
  if (templateId !== "ecs-fargate-container-app") {
    return undefined;
  }

  return ECS_FARGATE_PRIMARY_RELATIONSHIP_IDS.has(relationshipId) ? "primary" : "detail";
}

function createDiagramNode(
  resource: TemplateResourceDefinition,
  resourceById: ReadonlyMap<string, TemplateResourceDefinition>,
  resourceNames: ReadonlyMap<string, string>,
  nodeIdByResourceId: ReadonlyMap<string, string>,
  nodeIdByTemplateNodeId: ReadonlyMap<string, string>
): DiagramNode {
  // Preserve the catalog-backed resource identity while applying only template-authored Board geometry.
  const values = resolveTemplateValue(resource.values, resourceById, resourceNames);

  return {
    id: nodeIdByResourceId.get(resource.id) ?? `template-resource-${resource.id}`,
    kind: resource.kind ?? "resource",
    label: resource.label,
    locked: false,
    metadata:
      resource.parentResourceId || resource.presentationArea
        ? {
            ...(resource.parentResourceId
              ? { parentAreaNodeId: nodeIdByTemplateNodeId.get(resource.parentResourceId) }
              : {}),
            ...(resource.presentationArea ? { presentationArea: true } : {})
          }
        : undefined,
    parameters: {
      resourceType: resource.terraformResourceType,
      resourceName: resourceNames.get(resource.id) ?? resource.terraformResourceName ?? resource.id,
      fileName: resource.fileName ?? "main.tf",
      terraformBlockType: resource.terraformBlockType,
      values
    },
    position: { ...resource.position },
    size: resource.size
      ? { ...resource.size }
      : resource.kind === "design"
        ? { width: 260, height: 180 }
        : { ...DEFAULT_TEMPLATE_RESOURCE_SIZE },
    type: resource.terraformResourceType,
    zIndex: resource.zIndex ?? (resource.kind === "design" ? 0 : 1),
    ...(resource.rotation === undefined ? {} : { rotation: resource.rotation })
  };
}

// Presentation nodes carry only Catalog identity and Board geometry, never Terraform identity or values.
function createPresentationDiagramNode(
  node: TemplatePresentationNodeDefinition,
  nodeIdByPresentationId: ReadonlyMap<string, string>,
  nodeIdByTemplateNodeId: ReadonlyMap<string, string>
): DiagramNode {
  return {
    id: nodeIdByPresentationId.get(node.id) ?? `template-presentation-${node.id}`,
    kind: "design",
    label: node.label,
    locked: false,
    metadata: {
      presentationCatalogItemId: node.catalogItemId,
      ...(node.parentNodeId
        ? { parentAreaNodeId: nodeIdByTemplateNodeId.get(node.parentNodeId) }
        : {})
    },
    position: { ...node.position },
    size: { ...node.size },
    type: node.catalogItemId === "design-group" ? "design_group" : node.catalogItemId,
    zIndex: node.zIndex ?? 0,
    ...(node.rotation === undefined ? {} : { rotation: node.rotation })
  };
}

export function createTemplateTerraformResourceNames(
  resources: readonly Pick<
    TemplateResourceDefinition,
    "id" | "terraformBlockType" | "terraformResourceName" | "terraformResourceType"
  >[]
): ReadonlyMap<string, string> {
  // Resolve the full identity set first so references never observe a partially assigned collision suffix.
  const normalizedResources = resources.map((resource) => ({
    ...resource,
    hasExplicitName: resource.terraformResourceName !== undefined,
    normalizedName: resource.terraformResourceName ?? toTerraformIdentifier(resource.id)
  }));
  const resourcesById = new Map<string, (typeof normalizedResources)[number]>();
  const collisionGroups = new Map<string, (typeof normalizedResources)[number][]>();
  const explicitNameGroups = new Map<string, (typeof normalizedResources)[number][]>();
  const reservedNamesByNamespace = new Map<string, Set<string>>();

  for (const resource of normalizedResources) {
    if (resourcesById.has(resource.id)) {
      throw new Error(`Duplicate TemplateDefinition resource id: ${resource.id}`);
    }

    resourcesById.set(resource.id, resource);
    const namespaceKey = `${resource.terraformBlockType}:${resource.terraformResourceType}`;
    const collisionKey = `${namespaceKey}:${resource.normalizedName}`;
    reservedNamesByNamespace.set(
      namespaceKey,
      new Set([...(reservedNamesByNamespace.get(namespaceKey) ?? []), resource.normalizedName])
    );
    const targetGroups = resource.hasExplicitName ? explicitNameGroups : collisionGroups;
    targetGroups.set(collisionKey, [...(targetGroups.get(collisionKey) ?? []), resource]);
  }

  const duplicateExplicitNameGroup = [...explicitNameGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([leftKey], [rightKey]) =>
      leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    )[0]?.[1];

  if (duplicateExplicitNameGroup) {
    const firstResource = duplicateExplicitNameGroup[0];
    const resourceIds = duplicateExplicitNameGroup
      .map(({ id }) => id)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

    throw new Error(
      `Duplicate explicit TemplateDefinition Terraform resource name "${firstResource?.normalizedName}" in ${firstResource?.terraformBlockType}:${firstResource?.terraformResourceType}: ${resourceIds.join(", ")}`
    );
  }

  const resourceNames = new Map<string, string>();

  for (const group of explicitNameGroups.values()) {
    const resource = group[0];

    if (resource) {
      resourceNames.set(resource.id, resource.normalizedName);
    }
  }

  for (const [collisionKey, group] of collisionGroups) {
    if (group.length === 1 && !explicitNameGroups.has(collisionKey)) {
      const resource = group[0];

      if (resource) {
        resourceNames.set(resource.id, resource.normalizedName);
      }
      continue;
    }

    const sortedGroup = [...group].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    );
    const firstResource = sortedGroup[0];
    const namespaceKey = firstResource
      ? `${firstResource.terraformBlockType}:${firstResource.terraformResourceType}`
      : "";
    const reservedNames = reservedNamesByNamespace.get(namespaceKey) ?? new Set<string>();
    sortedGroup.forEach((resource) => {
      let attempt = 0;
      let candidate = appendTerraformNameSuffix(
        resource.normalizedName,
        createStableTerraformNameSuffix(resource.id, attempt)
      );

      while (reservedNames.has(candidate)) {
        attempt += 1;
        candidate = appendTerraformNameSuffix(
          resource.normalizedName,
          createStableTerraformNameSuffix(resource.id, attempt)
        );
      }

      resourceNames.set(resource.id, candidate);
      reservedNames.add(candidate);
    });
  }

  return resourceNames;
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
    return value.replace(
      /\$\{@ref:([^}.]+)\.([^}]+)\}/g,
      (_match, resourceId: string, attribute: string) =>
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
  // Template resource IDs become compact Terraform locals without leaking project or Template IDs.
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  const prefixed = /^[0-9]/u.test(normalized) ? `resource_${normalized}` : normalized || "resource";
  return prefixed.slice(0, TERRAFORM_LOCAL_NAME_MAX_LENGTH).replace(/_+$/gu, "") || "resource";
}

// 충돌 suffix를 붙여도 local name 길이 계약을 넘지 않게 base를 줄입니다.
function appendTerraformNameSuffix(baseName: string, suffix: string): string {
  const baseMaxLength = TERRAFORM_LOCAL_NAME_MAX_LENGTH - suffix.length - 1;
  const compactBase = baseName.slice(0, baseMaxLength).replace(/_+$/gu, "") || "resource";
  return `${compactBase}_${suffix}`;
}

// Resource ID에서 안정적인 짧은 suffix를 만들어 새 충돌 항목이 기존 주소를 재번호화하지 않게 합니다.
function createStableTerraformNameSuffix(resourceId: string, attempt: number): string {
  const input = attempt === 0 ? resourceId : `${resourceId}:${attempt}`;
  let hash = 2166136261;

  for (const character of input) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).padStart(6, "0").slice(-6);
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

function relationship(
  id: string,
  sourceResourceId: string,
  targetResourceId: string,
  label: string
): TemplateRelationship {
  return { id, sourceResourceId, targetResourceId, label };
}

function parameter(
  key: string,
  label: string,
  required: boolean,
  defaultValue: unknown
): TemplateParameterDefinition {
  return { key, label, required, defaultValue };
}

function createDynamoDbPolicy(tableResourceId: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: DYNAMODB_ACTIONS,
        Resource: `\${@ref:${tableResourceId}.arn}`
      }
    ]
  });
}

// Apply visual-only PNG placement after the resource list is declared, keeping Terraform values immutable here.
function createTemplate(
  input: Omit<
    TemplateDefinition,
    "id" | "providers" | "viewport" | "presentationNodes" | "presentationEdges"
  > & { readonly id: RepositoryTemplateId }
): TemplateDefinition {
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

    return routing ? { ...semanticRelationship, ...routing } : semanticRelationship;
  });
  const presentationNodes = Object.entries(presentation.presentationNodes).map(([id, node]) => ({
    id,
    ...node,
    position: { ...node.position },
    size: { ...node.size }
  }));
  const presentationEdges = Object.entries(presentation.presentationEdges).map(([id, edge]) => ({
    id,
    ...edge
  }));

  validatePresentationGraph(input.id, resources, presentationNodes, presentationEdges);

  return {
    ...input,
    resources,
    relationships,
    presentationNodes,
    presentationEdges,
    viewport: { ...presentation.viewport },
    providers: [...new Set(resources.map((resource) => resource.provider))]
  };
}

// Fail at registry construction when a visual edge is dangling or accidentally becomes a semantic-only edge.
function validatePresentationGraph(
  templateId: TemplateId,
  resources: readonly TemplateResourceDefinition[],
  presentationNodes: readonly TemplatePresentationNodeDefinition[],
  presentationEdges: readonly TemplatePresentationEdgeDefinition[]
): void {
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const presentationNodeIds = new Set(presentationNodes.map((node) => node.id));
  const allNodeIds = new Set([...resourceIds, ...presentationNodeIds]);

  for (const node of presentationNodes) {
    if (node.parentNodeId && !allNodeIds.has(node.parentNodeId)) {
      throw new Error(
        `Invalid Template presentation parent: ${templateId}/${node.id}/${node.parentNodeId}`
      );
    }
  }

  for (const resource of resources) {
    if (resource.parentResourceId && !allNodeIds.has(resource.parentResourceId)) {
      throw new Error(
        `Invalid Template resource parent: ${templateId}/${resource.id}/${resource.parentResourceId}`
      );
    }
  }

  for (const edge of presentationEdges) {
    if (!allNodeIds.has(edge.sourceNodeId) || !allNodeIds.has(edge.targetNodeId)) {
      throw new Error(`Invalid Template presentation edge: ${templateId}/${edge.id}`);
    }

    if (
      !presentationNodeIds.has(edge.sourceNodeId) &&
      !presentationNodeIds.has(edge.targetNodeId)
    ) {
      throw new Error(`Template presentation edge must touch Design: ${templateId}/${edge.id}`);
    }
  }
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

function layoutInSupportGrid(
  areaX: number,
  areaY: number,
  column: number,
  row: number,
  parentResourceId: string
): TemplatePresentationPlacement {
  const columnWidth = roundUpToTemplateGrid(DEFAULT_TEMPLATE_RESOURCE_SIZE.width);
  const rowHeight = roundUpToTemplateGrid(DEFAULT_TEMPLATE_RESOURCE_SIZE.height);
  return layoutAt(
    areaX + TEMPLATE_AREA_PADDING + column * columnWidth,
    areaY + TEMPLATE_AREA_HEADER_HEIGHT + row * rowHeight,
    parentResourceId
  );
}

function presentationAreaAroundChildren(
  catalogItemId: string,
  label: string,
  x: number,
  y: number,
  children: readonly {
    readonly position: { readonly x: number; readonly y: number };
    readonly size?: DiagramNode["size"];
  }[],
  parentNodeId?: string
): Omit<TemplatePresentationNodeDefinition, "id"> {
  const right = Math.max(
    ...children.map(
      (child) => child.position.x + (child.size ?? DEFAULT_TEMPLATE_RESOURCE_SIZE).width
    )
  );
  const bottom = Math.max(
    ...children.map(
      (child) => child.position.y + (child.size ?? DEFAULT_TEMPLATE_RESOURCE_SIZE).height
    )
  );
  return presentationNode(
    catalogItemId,
    label,
    x,
    y,
    {
      width: roundUpToTemplateGrid(right - x + TEMPLATE_AREA_PADDING),
      height: roundUpToTemplateGrid(bottom - y + TEMPLATE_AREA_PADDING)
    },
    parentNodeId
  );
}

function roundUpToTemplateGrid(value: number): number {
  return Math.ceil(value / TEMPLATE_LAYOUT_GRID_SIZE) * TEMPLATE_LAYOUT_GRID_SIZE;
}

// Stored handles make support rails deterministic instead of letting auto-routing cross the runtime flow.
function layoutRoute(sourceHandleId: string, targetHandleId: string) {
  return { sourceHandleId, targetHandleId, type: "smoothstep" as const };
}

// Keep Catalog identity next to authored Design geometry without copying Terraform parameter contracts.
function presentationNode(
  catalogItemId: string,
  label: string,
  x: number,
  y: number,
  size: DiagramNode["size"] = { width: 48, height: 48 },
  parentNodeId?: string
): Omit<TemplatePresentationNodeDefinition, "id"> {
  return {
    catalogItemId,
    label,
    position: { x, y },
    size: { ...size },
    ...(parentNodeId ? { parentNodeId } : {})
  };
}

// Visual flow edges are authored separately so no deployment relationship can be inferred from them.
function presentationEdge(
  sourceNodeId: string,
  targetNodeId: string,
  label: string,
  sourceHandleId: string,
  targetHandleId: string
): Omit<TemplatePresentationEdgeDefinition, "id"> {
  return {
    sourceNodeId,
    targetNodeId,
    label,
    sourceHandleId,
    targetHandleId,
    type: "smoothstep"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
