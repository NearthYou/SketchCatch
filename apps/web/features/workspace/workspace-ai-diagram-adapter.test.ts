import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type {
  AiArchitectureDraftResult,
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  ResourceType
} from "@sketchcatch/types";
import { buildTemplateDiagramJson, getTemplateDefinitionById } from "@sketchcatch/types";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import {
  createPlannedDiagramJson,
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson,
  getDiagramJsonForArchitectureDraft,
  normalizeDiagramJsonConventions
} from "./workspace-ai-diagram-adapter";
import { isAreaNode, isSecurityGroupScopeNode } from "../diagram-editor/area-nodes";
import { getOrthogonalRouteNodeOverlapLength } from "../diagram-editor/obstacle-safe-edge-routing";
import { evaluateAutomaticDiagramLayout } from "./automatic-diagram-layout";

function makeConventionResourceNode(
  id: string,
  resourceType: string,
  resourceName: string
): DiagramNode {
  return {
    id,
    kind: "resource",
    label: resourceName.toLocaleUpperCase(),
    locked: false,
    parameters: {
      fileName: "main",
      resourceName,
      resourceType,
      terraformBlockType: resourceType === "aws_ami" ? "data" : "resource",
      values: {}
    },
    position: { x: 0, y: 0 },
    size: resourceType === "aws_vpc" ? { width: 240, height: 160 } : { width: 48, height: 48 },
    type: resourceType,
    zIndex: resourceType === "aws_vpc" ? 0 : 1
  };
}

// SG scope fixture에 실제 containment parent와 authored geometry를 함께 둡니다.
function makeScopedNode(
  id: string,
  resourceType: string,
  resourceName: string,
  parentAreaNodeId: string,
  position: DiagramNode["position"]
): DiagramNode {
  return {
    ...makeConventionResourceNode(id, resourceType, resourceName),
    metadata: { parentAreaNodeId },
    position,
    size: { width: 180, height: 120 }
  };
}

// 다양한 Terraform SG attachment path를 가진 일반 Resource fixture를 만듭니다.
function makeReferencedNode(
  id: string,
  resourceType: string,
  resourceName: string,
  position: DiagramNode["position"],
  values: NonNullable<DiagramNode["parameters"]>["values"]
): DiagramNode {
  const node = makeConventionResourceNode(id, resourceType, resourceName);

  return {
    ...node,
    parameters: {
      ...node.parameters!,
      values
    },
    position
  };
}

test("workspace AI diagram adapter uses shared resource definitions for Terraform mapping", () => {
  const source = readFileSync(
    fileURLToPath(new URL("workspace-ai-diagram-adapter.ts", import.meta.url)),
    "utf8"
  );

  assert.doesNotMatch(source, /RESOURCE_TO_TERRAFORM_RESOURCE_TYPE/);
  assert.doesNotMatch(source, /TERRAFORM_RESOURCE_TYPE_TO_RESOURCE/);
  assert.match(source, /getDefaultResourceDefinitionByResourceType/);
  assert.match(source, /getResourceDefinitionByTerraform/);
});

test("workspace layout collision and Area fitting use the rendered icon-caption footprint", () => {
  const adapterSource = readFileSync(
    fileURLToPath(new URL("workspace-ai-diagram-adapter.ts", import.meta.url)),
    "utf8"
  );
  const layoutSource = readFileSync(
    fileURLToPath(new URL("automatic-diagram-layout.ts", import.meta.url)),
    "utf8"
  );

  assert.match(
    adapterSource,
    /import \{ getResourceNodeVisualBounds \} from "\.\.\/diagram-editor\/resource-node-visual-footprint";/
  );
  assert.match(adapterSource, /const visualBounds = getResourceNodeVisualBounds\(node\);/);
  assert.match(layoutSource, /getResourceNodeVisualBounds\(node\)/);
  assert.match(
    layoutSource,
    /const childBounds = children\.map\(\(child\) => getLayoutNodeBounds\(child\)\);/
  );
  assert.match(
    adapterSource,
    /function getSegmentNodeOverlapLength[\s\S]*?const visualBounds = getResourceNodeVisualBounds\(node\);[\s\S]*?const left = visualBounds\.x - padding;/
  );
  assert.doesNotMatch(adapterSource, /MIN_RESOURCE_AREA_CHILD_FOOTPRINT/);
});

test("convertArchitectureJsonToDiagramJson preserves authored node border style", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "region-1",
        type: "VPC",
        label: "Region",
        positionX: 0,
        positionY: 0,
        config: {
          diagramBorderStyle: "dashed",
          terraformResourceType: "aws_region"
        }
      }
    ],
    edges: []
  });

  assert.equal(diagramJson.nodes[0]?.style?.borderStyle, "dashed");
});

test("convertArchitectureJsonToDiagramJson preserves authored Terraform identity", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "execution-policy",
        type: "IAM_POLICY",
        label: "ECS execution policy",
        positionX: 0,
        positionY: 0,
        config: {
          terraformResourceName: "execution_policy",
          terraformResourceType: "aws_iam_role_policy_attachment",
          terraformBlockType: "resource",
          templateResourceId: "execution-policy",
          parentAreaNodeId: "managed-services",
          role: "aws_iam_role.execution_role.name",
          policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
        }
      }
    ],
    edges: []
  });

  assert.deepEqual(diagramJson.nodes[0]?.parameters, {
    fileName: "main",
    resourceName: "execution_policy",
    resourceType: "aws_iam_role_policy_attachment",
    terraformBlockType: "resource",
    values: {
      terraformResourceName: "execution_policy",
      terraformResourceType: "aws_iam_role_policy_attachment",
      terraformBlockType: "resource",
      templateResourceId: "execution-policy",
      parentAreaNodeId: "managed-services",
      role: "aws_iam_role.execution_role.name",
      policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    }
  });
  assert.equal(diagramJson.nodes[0]?.metadata?.parentAreaNodeId, "managed-services");
});

test("explicit companion Terraform resources do not inherit parent resource defaults", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "web-public-access",
        type: "S3",
        label: "S3 public access block",
        positionX: 0,
        positionY: 0,
        config: {
          terraformResourceType: "aws_s3_bucket_public_access_block",
          bucket: "aws_s3_bucket.web.id",
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true
        }
      }
    ],
    edges: []
  });

  assert.equal(diagramJson.nodes[0]?.parameters?.resourceType, "aws_s3_bucket_public_access_block");
  assert.equal(diagramJson.nodes[0]?.parameters?.values.forceDestroy, undefined);
  assert.equal(diagramJson.nodes[0]?.parameters?.values.blockPublicAcls, true);
});

test("normalizeDiagramJsonConventions preserves saved names and Terraform references exactly", () => {
  const renamedAmi = makeConventionResourceNode("renamed-ami-stable-id", "aws_ami", "renamed");
  const ec2Instance = makeConventionResourceNode(
    "ec2-node-stable-id",
    "aws_instance",
    "ec2_instance"
  );
  const diagram: DiagramJson = {
    nodes: [
      makeConventionResourceNode("ami-node-stable-id", "aws_ami", "ami"),
      makeConventionResourceNode("vpc-node-stable-id", "aws_vpc", "vpc"),
      renamedAmi,
      {
        ...ec2Instance,
        parameters: {
          ...ec2Instance.parameters!,
          values: {
            imageId: "data.aws_ami.renamed.id",
            vpcId: "aws_vpc.vpc.id"
          }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const normalized = normalizeDiagramJsonConventions(diagram);
  const amiName = normalized.nodes.find((node) => node.id === "ami-node-stable-id")?.parameters
    ?.resourceName;
  const vpcName = normalized.nodes.find((node) => node.id === "vpc-node-stable-id")?.parameters
    ?.resourceName;
  const renamedAmiAfter = normalized.nodes.find((node) => node.id === "renamed-ami-stable-id");
  const ec2After = normalized.nodes.find((node) => node.id === "ec2-node-stable-id");

  assert.equal(amiName, "ami");
  assert.equal(vpcName, "vpc");
  assert.equal(renamedAmiAfter?.parameters?.resourceName, "renamed");
  assert.equal(ec2After?.parameters?.resourceName, "ec2_instance");
  assert.deepEqual(ec2After?.parameters?.values, {
    imageId: "data.aws_ami.renamed.id",
    vpcId: "aws_vpc.vpc.id"
  });
  assert.doesNotMatch(amiName ?? "", /node|stable|id/);
  assert.doesNotMatch(vpcName ?? "", /node|stable|id/);
  assert.doesNotMatch(renamedAmiAfter?.parameters?.resourceName ?? "", /node|stable|id/);
  assert.doesNotMatch(ec2After?.parameters?.resourceName ?? "", /node|stable|id/);
});

test("normalizeDiagramJsonConventions fits SG scopes around ALB, ECS, and EKS attachment paths", () => {
  const vpc = {
    ...makeConventionResourceNode("vpc", "aws_vpc", "vpc"),
    position: { x: 0, y: 0 },
    size: { width: 2_000, height: 1_000 }
  };
  const scopeFixtures = [
    {
      scope: makeScopedNode("alb-sg", "aws_security_group", "alb_sg", vpc.id, { x: 120, y: 120 }),
      target: makeReferencedNode(
        "load-balancer",
        "aws_lb",
        "load_balancer",
        { x: 320, y: 160 },
        {
          securityGroups: ["aws_security_group.alb_sg.id"]
        }
      )
    },
    {
      scope: makeScopedNode("task-sg", "aws_security_group", "task_sg", vpc.id, { x: 680, y: 120 }),
      target: makeReferencedNode(
        "ecs-service",
        "aws_ecs_service",
        "ecs_service",
        { x: 840, y: 160 },
        {
          networkConfiguration: { securityGroups: ["aws_security_group.task_sg.id"] }
        }
      )
    },
    {
      scope: makeScopedNode("cluster-sg", "aws_security_group", "cluster_sg", vpc.id, {
        x: 1_200,
        y: 120
      }),
      target: makeReferencedNode(
        "eks-cluster",
        "aws_eks_cluster",
        "eks_cluster",
        { x: 1_360, y: 160 },
        {
          vpcConfig: { securityGroupIds: ["aws_security_group.cluster_sg.id"] }
        }
      )
    }
  ];
  const normalized = normalizeDiagramJsonConventions({
    nodes: [vpc, ...scopeFixtures.flatMap(({ scope, target }) => [scope, target])],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });
  const nodeById = new Map(normalized.nodes.map((node) => [node.id, node]));

  for (const { scope, target } of scopeFixtures) {
    assertContainsNode(nodeById.get(scope.id), nodeById.get(target.id));
  }
});

test("normalizeDiagramJsonConventions repairs visual-only parents and keeps SG relationship edges", () => {
  const vpc = {
    ...makeConventionResourceNode("vpc", "aws_vpc", "vpc"),
    position: { x: 0, y: 0 },
    size: { width: 800, height: 600 }
  };
  const subnet = {
    ...makeConventionResourceNode("subnet", "aws_subnet", "subnet"),
    metadata: { parentAreaNodeId: vpc.id },
    position: { x: 80, y: 80 },
    size: { width: 600, height: 400 }
  };
  const securityGroup = makeScopedNode(
    "security-group",
    "aws_security_group",
    "security_group",
    vpc.id,
    { x: 160, y: 160 }
  );
  const autoscalingGroup = makeScopedNode("asg", "aws_autoscaling_group", "asg", subnet.id, {
    x: 240,
    y: 240
  });
  const instance = {
    ...makeReferencedNode("instance", "aws_instance", "instance", { x: 320, y: 320 }, {}),
    metadata: { parentAreaNodeId: securityGroup.id }
  };
  const launchTemplate = {
    ...makeReferencedNode(
      "launch-template",
      "aws_launch_template",
      "launch_template",
      { x: 400, y: 320 },
      {}
    ),
    metadata: { parentAreaNodeId: autoscalingGroup.id }
  };
  const normalized = normalizeDiagramJsonConventions({
    nodes: [vpc, subnet, securityGroup, autoscalingGroup, instance, launchTemplate],
    edges: [
      {
        id: "vpc-subnet",
        label: "contains",
        sourceNodeId: vpc.id,
        targetNodeId: subnet.id
      },
      {
        id: "sg-instance",
        label: "contains",
        sourceNodeId: securityGroup.id,
        targetNodeId: instance.id
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  });
  const nodeById = new Map(normalized.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get(instance.id)?.metadata?.parentAreaNodeId, vpc.id);
  assert.equal(nodeById.get(launchTemplate.id)?.metadata?.parentAreaNodeId, subnet.id);
  assert.deepEqual(
    normalized.edges.map((edge) => edge.id),
    ["sg-instance"]
  );
});

test("convertArchitectureJsonToDiagramJson creates board nodes and hides containment arrows from an Architecture Draft", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 120,
        positionY: 80,
        config: {
          cidrBlock: "10.0.0.0/16",
          terraformResourceName: "main"
        }
      },
      {
        id: "ec2-backend",
        type: "EC2",
        label: "Backend Server",
        positionX: 360,
        positionY: 220,
        config: {
          instanceType: "t3.micro"
        }
      }
    ],
    edges: [
      {
        id: "edge-vpc-ec2",
        sourceId: "vpc-main",
        targetId: "ec2-backend",
        label: "contains"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const vpc = nodeById.get("vpc-main");
  const backend = nodeById.get("ec2-backend");

  assert.equal(vpc?.parameters?.resourceName, "vpc_main");
  assert.equal(vpc?.parameters?.values.cidrBlock, "10.0.0.0/16");
  assert.equal(backend?.parameters?.resourceName, "compute_backend");
  assert.equal(backend?.parameters?.values.instanceType, "t3.micro");
  assert.equal(backend?.metadata?.parentAreaNodeId, "vpc-main");
  assertContainsNode(vpc, backend);
  assert.deepEqual(diagramJson.edges, []);
  assert.deepEqual(diagramJson.viewport, { x: 0, y: 0, zoom: 1 });
});

test("convertArchitectureJsonToDiagramJson keeps RDS read replicas separate from general RDS defaults", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "rds-replica",
        type: "RDS_READ_REPLICA",
        label: "Reporting Replica",
        positionX: 360,
        positionY: 220,
        config: {
          replicateSourceDb: "aws_db_instance.primary.identifier"
        }
      }
    ],
    edges: []
  });

  assert.deepEqual(diagramJson.nodes[0]?.parameters?.values, {
    replicateSourceDb: "aws_db_instance.primary.identifier"
  });
});

test("convertArchitectureJsonToDiagramJson keeps non-containment edges as arrows", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "ec2-backend",
        type: "EC2",
        label: "Backend Server",
        positionX: 160,
        positionY: 220,
        config: {}
      },
      {
        id: "rds-primary",
        type: "RDS",
        label: "Database",
        positionX: 420,
        positionY: 220,
        config: {}
      }
    ],
    edges: [
      {
        id: "backend-to-database",
        sourceId: "ec2-backend",
        targetId: "rds-primary",
        label: "reads/writes"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(diagramJson.edges, [
    {
      id: "backend-to-database",
      label: "reads/writes",
      sourceHandleId: "handle-right",
      sourceNodeId: "ec2-backend",
      targetHandleId: "handle-left",
      targetNodeId: "rds-primary",
      type: "smoothstep",
      style: {
        animated: false,
        color: "#59687d",
        lineStyle: "solid",
        width: "thin"
      }
    }
  ]);
});

test("convertArchitectureJsonToDiagramJson routes edge handles around intermediate resources", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "client",
        type: "CLOUDFRONT",
        label: "Client",
        positionX: 80,
        positionY: 100,
        config: {}
      },
      {
        id: "middle",
        type: "S3",
        label: "Middle Bucket",
        positionX: 300,
        positionY: 120,
        config: {}
      },
      {
        id: "api",
        type: "API_GATEWAY_REST_API",
        label: "API",
        positionX: 520,
        positionY: 100,
        config: {}
      }
    ],
    edges: [
      {
        id: "client-to-api",
        sourceId: "client",
        targetId: "api",
        label: "HTTPS"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const edge = diagramJson.edges[0];

  assert.ok(edge);
  assertNoEdgeRouteOverlap(diagramJson);
});

test("convertArchitectureJsonToDiagramJson applies diagram naming conventions and avoids resource overlaps", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "main",
        type: "VPC",
        label: "Main VPC",
        positionX: 120,
        positionY: 120,
        config: {
          terraformResourceName: "main"
        }
      },
      {
        id: "public-a",
        type: "SUBNET",
        label: "Public Subnet A",
        positionX: 120,
        positionY: 120,
        config: {
          terraformResourceName: "public_a",
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "web-sg",
        type: "SECURITY_GROUP",
        label: "Web Security Group",
        positionX: 120,
        positionY: 120,
        config: {
          terraformResourceName: "web",
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "web",
        type: "EC2",
        label: "Web App",
        positionX: 520,
        positionY: 120,
        config: {}
      },
      {
        id: "primary",
        type: "RDS",
        label: "Primary DB",
        positionX: 520,
        positionY: 120,
        config: {}
      },
      {
        id: "artifacts",
        type: "S3",
        label: "Artifacts Bucket",
        positionX: 520,
        positionY: 120,
        config: {}
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const vpcNode = nodeById.get("main");
  const subnetNode = nodeById.get("public-a");
  const securityGroupNode = nodeById.get("web-sg");
  const computeNode = nodeById.get("web");
  const databaseNode = nodeById.get("primary");
  const bucketNode = nodeById.get("artifacts");

  assert.equal(vpcNode?.parameters?.resourceName, "vpc_main");
  assert.equal(subnetNode?.parameters?.resourceName, "subnet_public_a");
  assert.equal(securityGroupNode?.parameters?.resourceName, "sg_web");
  assertNoNodeOverlap(computeNode, databaseNode);
  assertNoNodeOverlap(computeNode, bucketNode);
  assertNoNodeOverlap(databaseNode, bucketNode);
});

test("convertArchitectureJsonToDiagramJson rewrites Terraform references after applying resource name conventions", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "role-app-runtime",
        type: "IAM_ROLE",
        label: "App Runtime Role",
        positionX: 100,
        positionY: 100,
        config: {
          terraformResourceName: "app_runtime_role"
        }
      },
      {
        id: "profile-app",
        type: "IAM_INSTANCE_PROFILE",
        label: "App Instance Profile",
        positionX: 220,
        positionY: 100,
        config: {
          role: "aws_iam_role.app_runtime_role.name",
          terraformResourceName: "app_instance_profile"
        }
      },
      {
        id: "ami-app",
        type: "AMI",
        label: "App AMI",
        positionX: 100,
        positionY: 220,
        config: {
          terraformResourceName: "app_ami"
        }
      },
      {
        id: "subnet-private-app-a",
        type: "SUBNET",
        label: "Private App Subnet A",
        positionX: 220,
        positionY: 220,
        config: {
          terraformResourceName: "private_app_subnet_a"
        }
      },
      {
        id: "app-security-group",
        type: "SECURITY_GROUP",
        label: "App Security Group",
        positionX: 340,
        positionY: 220,
        config: {
          terraformResourceName: "app_security_group"
        }
      },
      {
        id: "compute-content-board",
        type: "EC2",
        label: "Content Board",
        positionX: 460,
        positionY: 220,
        config: {
          ami: "data.aws_ami.app_ami.id",
          iamInstanceProfile: "aws_iam_instance_profile.app_instance_profile.name",
          subnetId: "aws_subnet.private_app_subnet_a.id",
          terraformResourceName: "app_server",
          vpcSecurityGroupIds: ["aws_security_group.app_security_group.id"]
        }
      },
      {
        id: "alarm-app-cpu",
        type: "CLOUDWATCH_METRIC_ALARM",
        label: "App CPU Alarm",
        positionX: 580,
        positionY: 220,
        config: {
          dimensions: {
            InstanceId: "aws_instance.app_server.id"
          }
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get("role-app-runtime")?.parameters?.resourceName, "role_app_runtime");
  assert.equal(nodeById.get("profile-app")?.parameters?.resourceName, "profile_app");
  assert.equal(nodeById.get("ami-app")?.parameters?.resourceName, "ami_app");
  assert.equal(
    nodeById.get("subnet-private-app-a")?.parameters?.resourceName,
    "subnet_private_app_a"
  );
  assert.equal(nodeById.get("app-security-group")?.parameters?.resourceName, "sg_app");
  assert.equal(
    nodeById.get("compute-content-board")?.parameters?.resourceName,
    "compute_content_board"
  );
  assert.equal(
    nodeById.get("profile-app")?.parameters?.values["role"],
    "aws_iam_role.role_app_runtime.name"
  );
  assert.equal(
    nodeById.get("compute-content-board")?.parameters?.values["ami"],
    "data.aws_ami.ami_app.id"
  );
  assert.equal(
    nodeById.get("compute-content-board")?.parameters?.values["iamInstanceProfile"],
    "aws_iam_instance_profile.profile_app.name"
  );
  assert.equal(
    nodeById.get("compute-content-board")?.parameters?.values["subnetId"],
    "aws_subnet.subnet_private_app_a.id"
  );
  assert.deepEqual(
    nodeById.get("compute-content-board")?.parameters?.values["vpcSecurityGroupIds"],
    ["aws_security_group.sg_app.id"]
  );
  assert.deepEqual(nodeById.get("alarm-app-cpu")?.parameters?.values["dimensions"], {
    InstanceId: "aws_instance.compute_content_board.id"
  });
});

test("convertArchitectureJsonToDiagramJson avoids sibling overlaps after area nodes expand", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 80,
        positionY: 120,
        config: { terraformResourceName: "main" }
      },
      {
        id: "public-subnet-a",
        type: "SUBNET",
        label: "Public Subnet A",
        positionX: 160,
        positionY: 220,
        config: { terraformResourceName: "public_a", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "private-app-subnet-a",
        type: "SUBNET",
        label: "Private App Subnet A",
        positionX: 180,
        positionY: 300,
        config: { terraformResourceName: "private_app_a", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "private-app-subnet-b",
        type: "SUBNET",
        label: "Private App Subnet B",
        positionX: 210,
        positionY: 330,
        config: { terraformResourceName: "private_app_b", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "app-security-group",
        type: "SECURITY_GROUP",
        label: "App Security Group",
        positionX: 220,
        positionY: 340,
        config: { terraformResourceName: "app", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "app-server",
        type: "EC2",
        label: "Application Server",
        positionX: 250,
        positionY: 380,
        config: {
          subnetId: "aws_subnet.private_app_a.id",
          vpcSecurityGroupIds: ["aws_security_group.app.id"]
        }
      },
      {
        id: "public-route-table",
        type: "ROUTE_TABLE",
        label: "Public Route Table",
        positionX: 240,
        positionY: 320,
        config: { route: [], terraformResourceName: "public", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "public-route-association-a",
        type: "ROUTE_TABLE_ASSOCIATION",
        label: "Public Route Association A",
        positionX: 260,
        positionY: 340,
        config: {
          routeTableId: "aws_route_table.public.id",
          subnetId: "aws_subnet.public_a.id",
          terraformResourceName: "public_a"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assertNoSiblingNodeOverlap(diagramJson);
});

test("convertArchitectureJsonToDiagramJson classifies edge line styles from relationship labels", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "client",
        type: "CLOUDFRONT",
        label: "Client Edge",
        positionX: 80,
        positionY: 120,
        config: {}
      },
      {
        id: "api",
        type: "API_GATEWAY_REST_API",
        label: "API Gateway",
        positionX: 320,
        positionY: 120,
        config: {}
      },
      {
        id: "queue",
        type: "SQS_QUEUE",
        label: "Event Queue",
        positionX: 560,
        positionY: 120,
        config: {}
      },
      {
        id: "worker",
        type: "LAMBDA",
        label: "Worker",
        positionX: 800,
        positionY: 120,
        config: {}
      },
      {
        id: "key",
        type: "KMS_KEY",
        label: "Log Key",
        positionX: 1040,
        positionY: 120,
        config: {}
      },
      {
        id: "logs",
        type: "CLOUDWATCH_LOG_GROUP",
        label: "Logs",
        positionX: 1280,
        positionY: 120,
        config: {}
      }
    ],
    edges: [
      {
        id: "client-to-api",
        sourceId: "client",
        targetId: "api",
        label: "HTTPS"
      },
      {
        id: "api-to-queue",
        sourceId: "api",
        targetId: "queue",
        label: "event queue"
      },
      {
        id: "worker-to-deploy",
        sourceId: "queue",
        targetId: "worker",
        label: "Terraform apply"
      },
      {
        id: "key-to-logs",
        sourceId: "key",
        targetId: "logs",
        label: "uses"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const edgeById = new Map(diagramJson.edges.map((edge) => [edge.id, edge]));

  assert.deepEqual(edgeById.get("client-to-api")?.style, {
    animated: false,
    color: "#59687d",
    lineStyle: "solid",
    width: "thin"
  });
  assert.deepEqual(edgeById.get("api-to-queue")?.style, {
    animated: false,
    color: "#476582",
    lineStyle: "dashed",
    width: "medium"
  });
  assert.deepEqual(edgeById.get("worker-to-deploy")?.style, {
    animated: false,
    color: "#8a5a00",
    lineStyle: "dashed",
    width: "thick"
  });
  assert.deepEqual(edgeById.get("key-to-logs")?.style, {
    animated: false,
    color: "#6b7280",
    lineStyle: "solid",
    width: "thin"
  });
  assert.equal(edgeById.get("client-to-api")?.label, "HTTPS");
  assert.equal(edgeById.get("api-to-queue")?.label, "event queue");
});

test("convertArchitectureJsonToDiagramJson uses catalog icon and size for CloudFront drafts", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "cloudfront-site",
        type: "CLOUDFRONT",
        label: "CloudFront CDN",
        positionX: 120,
        positionY: 80,
        config: {
          originResourceId: "s3-site"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const cloudFrontNode = diagramJson.nodes[0];

  assert.equal(cloudFrontNode?.type, "aws_cloudfront_distribution");
  assert.equal(
    cloudFrontNode?.iconUrl,
    "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg"
  );
  assert.deepEqual(cloudFrontNode?.size, { width: 48, height: 48 });
  assert.equal(cloudFrontNode?.parameters?.resourceName, "cdn_site");
});

test("convertArchitectureJsonToDiagramJson uses fallback size for unknown draft resources", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "unknown-1",
        type: "UNKNOWN",
        label: "Unknown Resource",
        positionX: 120,
        positionY: 80,
        config: {}
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const unknownNode = diagramJson.nodes[0];

  assert.equal(unknownNode?.type, "unknown_resource");
  assert.deepEqual(unknownNode?.size, { width: 48, height: 48 });
});

test("getDiagramJsonForArchitectureDraft prefers an exact DiagramJson fixture when present", () => {
  const exactDiagramJson: DiagramJson = {
    edges: [],
    nodes: [
      {
        id: "exact-node",
        type: "aws_vpc",
        kind: "resource",
        label: "Exact VPC",
        locked: false,
        position: { x: 123, y: 456 },
        size: { width: 90, height: 80 },
        zIndex: 1,
        parameters: {
          values: {},
          fileName: "main",
          resourceName: "exact_vpc",
          resourceType: "aws_vpc",
          terraformBlockType: "resource"
        }
      }
    ],
    viewport: { x: 7, y: 8, zoom: 0.5 }
  };
  const draft: AiArchitectureDraftResult = {
    architectureJson: {
      edges: [],
      nodes: [
        {
          id: "converted-node",
          type: "VPC",
          label: "Converted VPC",
          positionX: 1,
          positionY: 2,
          config: {}
        }
      ]
    },
    diagramJson: exactDiagramJson,
    metadata: {
      source: "template_fallback",
      confidence: "high",
      assumptions: [],
      explanations: []
    },
    title: "Exact fixture"
  };

  assert.equal(getDiagramJsonForArchitectureDraft(draft), exactDiagramJson);
});

test("automatic layout preserves resource configuration, containment, and connection semantics", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 900,
        positionY: 700,
        config: { cidrBlock: "10.42.0.0/16" }
      },
      {
        id: "compute-app",
        type: "EC2",
        label: "Application",
        positionX: 40,
        positionY: 40,
        config: { instanceType: "t3.small", vpcId: "vpc-main" }
      },
      {
        id: "db-app",
        type: "RDS",
        label: "Database",
        positionX: 120,
        positionY: 80,
        config: { engine: "postgres", vpcId: "vpc-main" }
      }
    ],
    edges: [
      {
        id: "vpc-contains-compute",
        sourceId: "vpc-main",
        targetId: "compute-app",
        label: "contains"
      },
      {
        id: "compute-to-db",
        sourceId: "compute-app",
        targetId: "db-app",
        label: "reads/writes"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const compute = nodeById.get("compute-app");
  const database = nodeById.get("db-app");

  assert.equal(compute?.parameters?.values.instanceType, "t3.small");
  assert.equal(database?.parameters?.values.engine, "postgres");
  assert.equal(compute?.metadata?.parentAreaNodeId, "vpc-main");
  assert.equal(database?.metadata?.parentAreaNodeId, "vpc-main");
  assert.deepEqual(
    diagramJson.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId
    })),
    [{ id: "compute-to-db", sourceId: "compute-app", targetId: "db-app" }]
  );
});

test("convertArchitectureJsonToDiagramJson expands area nodes to include upper-left children", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 200,
        positionY: 200,
        config: {}
      },
      {
        id: "ec2-left",
        type: "EC2",
        label: "Left EC2",
        positionX: 160,
        positionY: 160,
        config: {
          vpcId: "vpc-main"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const vpcNode = diagramJson.nodes.find((node) => node.id === "vpc-main");
  const ec2Node = diagramJson.nodes.find((node) => node.id === "ec2-left");

  assert.equal(ec2Node?.metadata?.parentAreaNodeId, "vpc-main");
  assertContainsNode(vpcNode, ec2Node);
});

test("convertArchitectureJsonToDiagramJson keeps managed services outside the VPC boundary", () => {
  const managedServicesId = "managed-services";
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: managedServicesId,
        type: "UNKNOWN",
        label: "AWS Managed Services",
        positionX: 20,
        positionY: -700,
        config: {
          diagramKind: "design",
          diagramType: "design_group",
          diagramWidth: 1100,
          diagramHeight: 360
        }
      },
      ...(
        ["CLOUDFRONT", "S3", "ECR_REPOSITORY", "CLOUDWATCH_LOG_GROUP", "ACM_CERTIFICATE"] as const
      ).map((type, index) => ({
        id: `managed-${type.toLowerCase()}`,
        type,
        label: type,
        positionX: 80 + index * 220,
        positionY: -600,
        config: { parentAreaNodeId: managedServicesId }
      })),
      {
        id: "vpc-main",
        type: "VPC",
        label: "Application VPC",
        positionX: 80,
        positionY: 80,
        config: {}
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const managedServices = diagramJson.nodes.find((node) => node.id === managedServicesId);
  const vpc = diagramJson.nodes.find((node) => node.id === "vpc-main");

  assert.ok(managedServices);
  assert.ok(vpc);
  assertNoNodeOverlap(managedServices, vpc);
});

test("convertArchitectureJsonToDiagramJson keeps area layers behind contained resources", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "web-server",
        type: "EC2",
        label: "Web Server",
        positionX: 220,
        positionY: 180,
        config: {
          subnetId: "public-subnet-a"
        }
      },
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
        positionX: 160,
        positionY: 140,
        config: {
          vpcId: "vpc-main"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const vpcNode = diagramJson.nodes.find((node) => node.id === "vpc-main");
  const subnetNode = diagramJson.nodes.find((node) => node.id === "public-subnet-a");
  const webServerNode = diagramJson.nodes.find((node) => node.id === "web-server");

  assert.ok((vpcNode?.zIndex ?? 0) < (subnetNode?.zIndex ?? 0));
  assert.ok((subnetNode?.zIndex ?? 0) < (webServerNode?.zIndex ?? 0));
});

test("convertArchitectureJsonToDiagramJson resolves Terraform references to area parent nodes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "network-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 100,
        positionY: 100,
        config: {
          terraformResourceName: "main"
        }
      },
      {
        id: "public-a",
        type: "SUBNET",
        label: "Public Subnet",
        positionX: 160,
        positionY: 180,
        config: {
          terraformResourceName: "public",
          vpcId: "aws_vpc.main.id"
        }
      },
      {
        id: "web-server",
        type: "EC2",
        label: "Web Server",
        positionX: 220,
        positionY: 260,
        config: {
          subnetId: "aws_subnet.public.id"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const parentByNodeId = new Map(
    diagramJson.nodes.map((node) => [node.id, node.metadata?.parentAreaNodeId])
  );

  assert.equal(parentByNodeId.get("server-storage-az"), "network-main");
  assert.equal(parentByNodeId.get("network-main"), "server-storage-region");
  assert.equal(parentByNodeId.get("public-a"), "server-storage-az");
  assert.equal(parentByNodeId.get("web-server"), "public-a");
});

test("convertArchitectureJsonToDiagramJson resolves common Terraform reference attributes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "network-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 100,
        positionY: 100,
        config: {
          terraformResourceName: "main"
        }
      },
      {
        id: "public-a",
        type: "SUBNET",
        label: "Public Subnet",
        positionX: 160,
        positionY: 180,
        config: {
          terraformResourceName: "public",
          vpcId: "aws_vpc.main.arn"
        }
      },
      {
        id: "web-server",
        type: "EC2",
        label: "Web Server",
        positionX: 220,
        positionY: 260,
        config: {
          subnetId: "aws_subnet.public.name"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const parentByNodeId = new Map(
    diagramJson.nodes.map((node) => [node.id, node.metadata?.parentAreaNodeId])
  );

  assert.equal(parentByNodeId.get("server-storage-az"), "network-main");
  assert.equal(parentByNodeId.get("network-main"), "server-storage-region");
  assert.equal(parentByNodeId.get("public-a"), "server-storage-az");
  assert.equal(parentByNodeId.get("web-server"), "public-a");
});

test("convertArchitectureJsonToDiagramJson marks VPC and Subnet containment for board area nodes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 80,
        positionY: 80,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      {
        id: "subnet-app",
        type: "SUBNET",
        label: "App Subnet",
        positionX: 140,
        positionY: 150,
        config: { cidrBlock: "10.0.1.0/24", vpcId: "vpc-main" }
      },
      {
        id: "sg-app",
        type: "SECURITY_GROUP",
        label: "App Security Group",
        positionX: 210,
        positionY: 190,
        config: { vpcId: "vpc-main" }
      },
      {
        id: "ec2-api",
        type: "EC2",
        label: "API Server",
        positionX: 300,
        positionY: 190,
        config: { subnetId: "subnet-app", securityGroupIds: ["sg-app"] }
      }
    ],
    edges: [
      {
        id: "subnet-to-ec2",
        sourceId: "subnet-app",
        targetId: "ec2-api",
        label: "hosts"
      },
      {
        id: "sg-to-ec2",
        sourceId: "sg-app",
        targetId: "ec2-api",
        label: "allows traffic"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      parentAreaNodeId: node.metadata?.parentAreaNodeId
    })),
    [
      { id: "server-storage-region", parentAreaNodeId: undefined },
      { id: "server-storage-az", parentAreaNodeId: "vpc-main" },
      { id: "vpc-main", parentAreaNodeId: "server-storage-region" },
      { id: "subnet-app", parentAreaNodeId: "server-storage-az" },
      { id: "sg-app", parentAreaNodeId: "vpc-main" },
      { id: "ec2-api", parentAreaNodeId: "subnet-app" }
    ]
  );

  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  assertContainsNode(nodeById.get("server-storage-region"), nodeById.get("vpc-main"));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("subnet-app"));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("server-storage-az"));
  assertContainsNode(nodeById.get("server-storage-az"), nodeById.get("subnet-app"));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("sg-app"));
  assertContainsNode(nodeById.get("sg-app"), nodeById.get("ec2-api"));
  assert.deepEqual(
    diagramJson.edges.map((edge) => ({
      label: edge.label,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId
    })),
    [{ label: "allows traffic", sourceNodeId: "sg-app", targetNodeId: "ec2-api" }]
  );
});

test("convertArchitectureJsonToDiagramJson maps server and storage draft resources to Terraform nodes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "internet-gateway",
        type: "INTERNET_GATEWAY",
        label: "Internet Gateway",
        positionX: 80,
        positionY: 80,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "route-table",
        type: "ROUTE_TABLE",
        label: "Route Table",
        positionX: 220,
        positionY: 80,
        config: {
          route: [
            { cidrBlock: "0.0.0.0/0", gatewayId: "aws_internet_gateway.internet_gateway.id" }
          ],
          vpcId: "aws_vpc.vpc.id"
        }
      },
      {
        id: "route-table-association",
        type: "ROUTE_TABLE_ASSOCIATION",
        label: "Route Table Association",
        positionX: 360,
        positionY: 80,
        config: {
          routeTableId: "aws_route_table.route_table.id",
          subnetId: "aws_subnet.subnet.id"
        }
      },
      {
        id: "ami",
        type: "AMI",
        label: "Amazon Linux AMI",
        positionX: 500,
        positionY: 80,
        config: {
          mostRecent: true,
          nameRegex: "^al2023-ami-2023.*-x86_64$",
          owners: ["amazon"]
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      resourceName: node.parameters?.resourceName,
      resourceType: node.parameters?.resourceType,
      terraformBlockType: node.parameters?.terraformBlockType,
      values: node.parameters?.values
    })),
    [
      {
        id: "internet-gateway",
        resourceName: "igw",
        resourceType: "aws_internet_gateway",
        terraformBlockType: "resource",
        values: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "route-table",
        resourceName: "rt",
        resourceType: "aws_route_table",
        terraformBlockType: "resource",
        values: {
          route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "aws_internet_gateway.igw.id" }],
          vpcId: "aws_vpc.vpc.id"
        }
      },
      {
        id: "route-table-association",
        resourceName: "rta",
        resourceType: "aws_route_table_association",
        terraformBlockType: "resource",
        values: {
          routeTableId: "aws_route_table.rt.id",
          subnetId: "aws_subnet.subnet.id"
        }
      },
      {
        id: "ami",
        resourceName: "ami_amazon_linux",
        resourceType: "aws_ami",
        terraformBlockType: "data",
        values: {
          mostRecent: true,
          nameRegex: "^al2023-ami-2023.*-x86_64$",
          owners: ["amazon"]
        }
      }
    ]
  );
});

test("convertArchitectureJsonToDiagramJson maps Lambda draft resources to Terraform nodes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "lambda-function",
        type: "LAMBDA",
        label: "Lambda Function",
        positionX: 260,
        positionY: 220,
        config: {
          functionName: "practice-function",
          handler: "index.handler",
          runtime: "nodejs20.x"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      resourceName: node.parameters?.resourceName,
      resourceType: node.parameters?.resourceType,
      terraformBlockType: node.parameters?.terraformBlockType,
      type: node.type,
      values: node.parameters?.values
    })),
    [
      {
        id: "lambda-function",
        resourceName: "lambda_function",
        resourceType: "aws_lambda_function",
        terraformBlockType: "resource",
        type: "aws_lambda_function",
        values: {
          functionName: "practice-function",
          handler: "index.handler",
          runtime: "nodejs20.x"
        }
      }
    ]
  );
});

test("convertArchitectureJsonToDiagramJson maps operations and permission draft resources", () => {
  const architectureJson = {
    nodes: [
      {
        id: "api-gateway",
        type: "API_GATEWAY_REST_API",
        label: "Practice API",
        positionX: 80,
        positionY: 80,
        config: { name: "practice-api" }
      },
      {
        id: "lambda-execution-role",
        type: "IAM_ROLE",
        label: "Lambda Execution Role",
        positionX: 220,
        positionY: 80,
        config: { assumeRolePolicy: "policy-json" }
      },
      {
        id: "lambda-execution-policy",
        type: "IAM_POLICY",
        label: "Lambda Execution Policy",
        positionX: 360,
        positionY: 80,
        config: { policy: "policy-json" }
      },
      {
        id: "api-instance-profile",
        type: "IAM_INSTANCE_PROFILE",
        label: "API Instance Profile",
        positionX: 500,
        positionY: 80,
        config: { role: "aws_iam_role.api_runtime_role.name" }
      },
      {
        id: "db-encryption-key",
        type: "KMS_KEY",
        label: "DB Encryption Key",
        positionX: 640,
        positionY: 80,
        config: { enableKeyRotation: true }
      },
      {
        id: "lambda-log-group",
        type: "CLOUDWATCH_LOG_GROUP",
        label: "Lambda Logs",
        positionX: 780,
        positionY: 80,
        config: { retentionInDays: 14 }
      },
      {
        id: "lambda-error-alarm",
        type: "CLOUDWATCH_METRIC_ALARM",
        label: "Lambda Error Alarm",
        positionX: 920,
        positionY: 80,
        config: { alarmName: "lambda-errors", namespace: "AWS/Lambda", metricName: "Errors" }
      },
      {
        id: "lambda-invoke-permission",
        type: "LAMBDA_PERMISSION",
        label: "API Invoke Permission",
        positionX: 1060,
        positionY: 80,
        config: { action: "lambda:InvokeFunction", principal: "apigateway.amazonaws.com" }
      }
    ],
    edges: []
  } as ArchitectureJson;

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      resourceType: node.parameters?.resourceType,
      terraformBlockType: node.parameters?.terraformBlockType
    })),
    [
      {
        id: "api-gateway",
        resourceType: "aws_api_gateway_rest_api",
        terraformBlockType: "resource"
      },
      { id: "lambda-execution-role", resourceType: "aws_iam_role", terraformBlockType: "resource" },
      {
        id: "lambda-execution-policy",
        resourceType: "aws_iam_policy",
        terraformBlockType: "resource"
      },
      {
        id: "api-instance-profile",
        resourceType: "aws_iam_instance_profile",
        terraformBlockType: "resource"
      },
      { id: "db-encryption-key", resourceType: "aws_kms_key", terraformBlockType: "resource" },
      {
        id: "lambda-log-group",
        resourceType: "aws_cloudwatch_log_group",
        terraformBlockType: "resource"
      },
      {
        id: "lambda-error-alarm",
        resourceType: "aws_cloudwatch_metric_alarm",
        terraformBlockType: "resource"
      },
      {
        id: "lambda-invoke-permission",
        resourceType: "aws_lambda_permission",
        terraformBlockType: "resource"
      }
    ]
  );
});

test("convertArchitectureJsonToDiagramJson arranges serverless resources into readable lanes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "api-gateway",
        type: "API_GATEWAY_REST_API",
        label: "API Gateway",
        positionX: 40,
        positionY: 260,
        config: {}
      },
      {
        id: "lambda-invoke-permission",
        type: "LAMBDA_PERMISSION",
        label: "Lambda Permission Invoke",
        positionX: 300,
        positionY: 500,
        config: { action: "lambda:InvokeFunction", principal: "apigateway.amazonaws.com" }
      },
      {
        id: "lambda-execution-role",
        type: "IAM_ROLE",
        label: "Lambda Execution Role",
        positionX: 300,
        positionY: 120,
        config: { assumeRolePolicy: "policy-json" }
      },
      {
        id: "lambda-execution-policy",
        type: "IAM_POLICY",
        label: "Lambda Execution Policy",
        positionX: 1200,
        positionY: 120,
        config: { policy: "policy-json" }
      },
      {
        id: "lambda-function",
        type: "LAMBDA",
        label: "Lambda Function",
        positionX: 1100,
        positionY: 500,
        config: { handler: "index.handler", runtime: "nodejs20.x" }
      },
      {
        id: "upload-bucket",
        type: "S3",
        label: "Upload Bucket",
        positionX: 1420,
        positionY: 400,
        config: {}
      },
      {
        id: "lambda-log-key",
        type: "KMS_KEY",
        label: "Lambda Log Key",
        positionX: 1510,
        positionY: 120,
        config: { enableKeyRotation: true }
      },
      {
        id: "lambda-log-group",
        type: "CLOUDWATCH_LOG_GROUP",
        label: "Lambda Logs",
        positionX: 1740,
        positionY: 300,
        config: { name: "/aws/lambda/practice-function" }
      },
      {
        id: "lambda-error-alarm",
        type: "CLOUDWATCH_METRIC_ALARM",
        label: "Lambda Error Alarm",
        positionX: 840,
        positionY: 500,
        config: { metricName: "Errors", namespace: "AWS/Lambda" }
      },
      {
        id: "cdn-public-entry",
        type: "CLOUDFRONT",
        label: "CDN Public Entry",
        positionX: 650,
        positionY: 180,
        config: {}
      },
      {
        id: "web-assets-bucket",
        type: "S3",
        label: "Web Assets Bucket",
        positionX: 980,
        positionY: 200,
        config: { terraformResourceName: "web_assets" }
      }
    ],
    edges: [
      {
        id: "api-to-permission",
        sourceId: "api-gateway",
        targetId: "lambda-invoke-permission",
        label: "allows invoke"
      },
      {
        id: "permission-to-lambda",
        sourceId: "lambda-invoke-permission",
        targetId: "lambda-function",
        label: "invokes"
      },
      {
        id: "role-to-lambda",
        sourceId: "lambda-execution-role",
        targetId: "lambda-function",
        label: "execution role"
      },
      {
        id: "policy-to-role",
        sourceId: "lambda-execution-policy",
        targetId: "lambda-execution-role",
        label: "grants log access"
      },
      {
        id: "lambda-to-upload",
        sourceId: "lambda-function",
        targetId: "upload-bucket",
        label: "stores files"
      },
      {
        id: "kms-to-logs",
        sourceId: "lambda-log-key",
        targetId: "lambda-log-group",
        label: "encrypts logs"
      },
      {
        id: "lambda-to-logs",
        sourceId: "lambda-function",
        targetId: "lambda-log-group",
        label: "writes logs"
      },
      {
        id: "alarm-to-lambda",
        sourceId: "lambda-error-alarm",
        targetId: "lambda-function",
        label: "monitors errors"
      },
      {
        id: "cdn-to-assets",
        sourceId: "cdn-public-entry",
        targetId: "web-assets-bucket",
        label: "HTTPS"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(diagramJson.edges.map((edge) => [edge.id, edge]));
  const apiGateway = nodeById.get("api-gateway");
  const permission = nodeById.get("lambda-invoke-permission");
  const lambdaFunction = nodeById.get("lambda-function");
  const uploadBucket = nodeById.get("upload-bucket");
  const logGroup = nodeById.get("lambda-log-group");
  const executionRole = nodeById.get("lambda-execution-role");
  const executionPolicy = nodeById.get("lambda-execution-policy");
  const errorAlarm = nodeById.get("lambda-error-alarm");
  const cdn = nodeById.get("cdn-public-entry");
  const webAssets = nodeById.get("web-assets-bucket");

  assert.ok(apiGateway);
  assert.ok(permission);
  assert.ok(lambdaFunction);
  assert.ok(uploadBucket);
  assert.ok(logGroup);
  assert.ok(executionRole);
  assert.ok(executionPolicy);
  assert.ok(errorAlarm);
  assert.ok(cdn);
  assert.ok(webAssets);
  assert.ok(apiGateway.position.x < lambdaFunction.position.x);
  assert.ok(lambdaFunction.position.x < uploadBucket.position.x);
  const quality = evaluateDiagramLayout(diagramJson);

  assert.equal(quality.nodeOverlapCount, 0);
  assert.equal(quality.supportLaneIntrusionCount, 0);
  assert.ok(edgeById.get("lambda-to-upload"));
  assert.ok(edgeById.get("lambda-to-logs"));
  assert.ok(edgeById.get("role-to-lambda"));
  assert.ok(quality.canvasArea < 1_000_000);
  assert.equal(diagramJson.nodes.some(isAreaNode), false);
  assertNoSiblingNodeOverlap(diagramJson);
  assertNoEdgeRouteOverlap(diagramJson);
});

test("convertArchitectureJsonToDiagramJson preserves authored Template positions and resource parameters", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "template-vpc",
        type: "VPC",
        label: "Template VPC",
        positionX: 300,
        positionY: 80,
        config: { cidrBlock: "10.30.0.0/16", templateResourceId: "vpc" }
      },
      {
        id: "template-cluster",
        type: "ECS_CLUSTER",
        label: "Template ECS Cluster",
        positionX: 500,
        positionY: 220,
        config: { name: "fargate-cluster", templateResourceId: "cluster" }
      },
      {
        id: "template-load-balancer",
        type: "LOAD_BALANCER",
        label: "Template ALB",
        positionX: 100,
        positionY: 660,
        config: { internal: false, templateResourceId: "load-balancer" }
      },
      {
        id: "template-task",
        type: "ECS_TASK_DEFINITION",
        label: "Template Task",
        positionX: 700,
        positionY: 660,
        config: { cpu: 256, memory: 512, templateResourceId: "task" }
      },
      {
        id: "template-service",
        type: "ECS_SERVICE",
        label: "Template Service",
        positionX: 900,
        positionY: 660,
        config: { desiredCount: 1, launchType: "FARGATE", templateResourceId: "service" }
      },
      {
        id: "answer-database",
        type: "RDS",
        label: "Multi-AZ Application Database",
        positionX: 730,
        positionY: 1120,
        config: { engine: "postgres", multiAz: true, publiclyAccessible: false }
      }
    ],
    edges: [
      {
        id: "cluster-service",
        sourceId: "template-cluster",
        targetId: "template-service",
        label: "runs"
      },
      {
        id: "service-task",
        sourceId: "template-service",
        targetId: "template-task",
        label: "uses"
      },
      {
        id: "service-database",
        sourceId: "template-service",
        targetId: "answer-database",
        label: "reads/writes"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const service = nodeById.get("template-service");
  const task = nodeById.get("template-task");
  const database = nodeById.get("answer-database");

  assert.equal(diagramJson.nodes.length, architectureJson.nodes.length);
  assert.equal(diagramJson.edges.length, architectureJson.edges.length);
  assert.equal(service?.parameters?.resourceType, "aws_ecs_service");
  assert.equal(service?.parameters?.values.desiredCount, 1);
  assert.equal(service?.parameters?.values.launchType, "FARGATE");
  assert.equal(service?.parameters?.values.templateResourceId, "service");
  assert.equal(task?.parameters?.values.cpu, 256);
  assert.equal(task?.parameters?.values.memory, 512);
  assert.equal(database?.parameters?.resourceType, "aws_db_instance");
  assert.equal(database?.parameters?.values.engine, "postgres");
  assert.equal(database?.parameters?.values.multiAz, true);
  assert.equal(database?.parameters?.values.publiclyAccessible, false);
  assert.ok(task && service && database);
  for (const architectureNode of architectureJson.nodes.filter(
    (node) => typeof node.config?.templateResourceId === "string"
  )) {
    assert.deepEqual(nodeById.get(architectureNode.id)?.position, {
      x: architectureNode.positionX,
      y: architectureNode.positionY
    });
  }
  assertNoSiblingNodeOverlap(diagramJson);
});

test("createPlannedDiagramJson applies Template layout rules as hard constraints", () => {
  const templateId = "ecs-fargate-container-app" as const;
  const definition = getTemplateDefinitionById(templateId);
  const architectureJson: ArchitectureJson = {
    nodes: definition.resources.map((resource) => {
      const resourceDefinition = getResourceDefinitionByTerraform(
        resource.terraformBlockType,
        resource.terraformResourceType
      );
      assert.ok(resourceDefinition);

      return {
        id: `fixed-template-${templateId}-${resource.id}`,
        type: resourceDefinition.resourceType,
        label: resource.label,
        positionX: 9_000,
        positionY: 9_000,
        config: {
          templateId,
          templateResourceId: resource.id,
          terraformBlockType: resource.terraformBlockType,
          terraformResourceType: resource.terraformResourceType
        }
      };
    }),
    edges: definition.relationships.map((relationship) => ({
      id: `fixed-template-${templateId}-${relationship.id}`,
      sourceId: `fixed-template-${templateId}-${relationship.sourceResourceId}`,
      targetId: `fixed-template-${templateId}-${relationship.targetResourceId}`,
      label: relationship.label
    }))
  };
  const authoredDiagram = buildTemplateDiagramJson(templateId, {
    projectSlug: "planner-test",
    shortId: "layout"
  });
  const firstPlan = createPlannedDiagramJson({ architectureJson });
  const movedPreviousDiagram: DiagramJson = {
    ...firstPlan,
    nodes: firstPlan.nodes.map((node) =>
      node.id === `fixed-template-${templateId}-vpc`
        ? { ...node, position: { x: 7_000, y: 7_000 }, size: { width: 200, height: 200 } }
        : node
    )
  };
  const plannedDiagram = createPlannedDiagramJson({
    architectureJson,
    previousDiagram: movedPreviousDiagram
  });
  const nodeById = new Map(plannedDiagram.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(plannedDiagram.edges.map((edge) => [edge.id, edge]));
  const authoredVpc = authoredDiagram.nodes.find(
    (node) => node.id === `template-${templateId}-vpc`
  );
  const authoredRoute = authoredDiagram.edges.find(
    (edge) => edge.id === `template-${templateId}-target-group-service`
  );
  const plannedVpc = nodeById.get(`fixed-template-${templateId}-vpc`);
  const plannedSubnet = nodeById.get(`fixed-template-${templateId}-subnet-a`);
  const plannedRegion = nodeById.get(`fixed-template-${templateId}-presentation-region`);
  const plannedRoute = edgeById.get(`fixed-template-${templateId}-target-group-service`);

  assert.ok(authoredVpc);
  assert.ok(authoredRoute);
  assert.deepEqual(plannedVpc?.position, authoredVpc.position);
  assert.deepEqual(plannedVpc?.size, authoredVpc.size);
  assert.equal(plannedSubnet?.metadata?.parentAreaNodeId, `fixed-template-${templateId}-vpc`);
  assert.equal(plannedRegion?.kind, "design");
  assert.deepEqual(plannedRegion?.size, { width: 1_920, height: 880 });
  assert.equal(plannedRoute?.sourceHandleId, authoredRoute.sourceHandleId);
  assert.equal(plannedRoute?.targetHandleId, authoredRoute.targetHandleId);
  assert.equal(plannedRoute?.metadata?.presentationRole, "primary");
  assert.equal(
    edgeById.get(`fixed-template-${templateId}-task-log-group`)?.metadata?.presentationRole,
    "detail"
  );
  assert.equal(
    edgeById.has(
      `summary-fixed-template-${templateId}-load-balancer-to-fixed-template-${templateId}-service`
    ),
    false
  );

  const omittedNodeIds = new Set([
    `fixed-template-${templateId}-repository`,
    `fixed-template-${templateId}-log-group`
  ]);
  const partialArchitectureJson: ArchitectureJson = {
    nodes: architectureJson.nodes.filter((node) => !omittedNodeIds.has(node.id)),
    edges: architectureJson.edges.filter(
      (edge) => !omittedNodeIds.has(edge.sourceId) && !omittedNodeIds.has(edge.targetId)
    )
  };
  const partialPlan = createPlannedDiagramJson({ architectureJson: partialArchitectureJson });
  const partialNodeById = new Map(partialPlan.nodes.map((node) => [node.id, node]));
  const partialEdgeById = new Map(partialPlan.edges.map((edge) => [edge.id, edge]));

  assert.deepEqual(
    partialNodeById.get(`fixed-template-${templateId}-vpc`)?.position,
    authoredVpc.position
  );
  assert.deepEqual(partialNodeById.get(`fixed-template-${templateId}-vpc`)?.size, authoredVpc.size);
  assert.equal(
    partialNodeById.get(`fixed-template-${templateId}-subnet-a`)?.metadata?.parentAreaNodeId,
    `fixed-template-${templateId}-vpc`
  );
  assert.equal(
    partialNodeById.get(`fixed-template-${templateId}-presentation-region`)?.kind,
    "design"
  );
  assert.equal(
    partialNodeById.get(`fixed-template-${templateId}-presentation-definition-ops-group`)?.kind,
    "design"
  );
  assert.equal(partialNodeById.has(`fixed-template-${templateId}-repository`), false);
  assert.equal(partialNodeById.has(`fixed-template-${templateId}-log-group`), false);
  assert.equal(
    partialEdgeById.get(`fixed-template-${templateId}-target-group-service`)?.sourceHandleId,
    authoredRoute.sourceHandleId
  );
  assert.equal(
    partialEdgeById.get(`fixed-template-${templateId}-target-group-service`)?.targetHandleId,
    authoredRoute.targetHandleId
  );
});

test("createPlannedDiagramJson reduces repeated and support labels on dense diagrams", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "gateway",
        type: "API_GATEWAY_REST_API",
        label: "Gateway",
        positionX: 0,
        positionY: 0,
        config: {}
      },
      {
        id: "service-a",
        type: "ECS_SERVICE",
        label: "Service A",
        positionX: 300,
        positionY: 0,
        config: {}
      },
      {
        id: "service-b",
        type: "ECS_SERVICE",
        label: "Service B",
        positionX: 300,
        positionY: 180,
        config: {}
      },
      { id: "database", type: "RDS", label: "Database", positionX: 600, positionY: 0, config: {} },
      {
        id: "alarm",
        type: "CLOUDWATCH_METRIC_ALARM",
        label: "Alarm",
        positionX: 300,
        positionY: 360,
        config: {}
      }
    ],
    edges: [
      { id: "gateway-a", sourceId: "gateway", targetId: "service-a", label: "routes requests" },
      { id: "gateway-b", sourceId: "gateway", targetId: "service-b", label: "routes requests" },
      { id: "gateway-db", sourceId: "gateway", targetId: "database", label: "routes requests" },
      { id: "a-db", sourceId: "service-a", targetId: "database", label: "reads/writes" },
      { id: "b-db", sourceId: "service-b", targetId: "database", label: "reads/writes" },
      { id: "alarm-a", sourceId: "alarm", targetId: "service-a", label: "monitors CPU" },
      { id: "alarm-b", sourceId: "alarm", targetId: "service-b", label: "monitors CPU" },
      { id: "alarm-db", sourceId: "alarm", targetId: "database", label: "monitors CPU" },
      { id: "alarm-gateway", sourceId: "alarm", targetId: "gateway", label: "monitors CPU" },
      { id: "db-a", sourceId: "database", targetId: "service-a", label: "replicates" }
    ]
  };

  const diagramJson = createPlannedDiagramJson({ architectureJson });

  assert.equal(diagramJson.edges.filter((edge) => edge.label === "routes requests").length, 1);
  assert.equal(
    diagramJson.edges.some((edge) => edge.label === "monitors CPU"),
    false
  );
});

test("createPlannedDiagramJson preserves dense dependencies but exposes a compact semantic flow", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "alb",
        type: "LOAD_BALANCER",
        label: "Application Load Balancer",
        positionX: 0,
        positionY: 0,
        config: {}
      },
      {
        id: "listener",
        type: "LOAD_BALANCER_LISTENER",
        label: "HTTPS Listener",
        positionX: 160,
        positionY: 0,
        config: {}
      },
      {
        id: "target",
        type: "LOAD_BALANCER_TARGET_GROUP",
        label: "App Target Group",
        positionX: 320,
        positionY: 0,
        config: {}
      },
      {
        id: "service",
        type: "ECS_SERVICE",
        label: "Application Service",
        positionX: 480,
        positionY: 0,
        config: {}
      },
      {
        id: "task",
        type: "ECS_TASK_DEFINITION",
        label: "Task Definition",
        positionX: 320,
        positionY: 180,
        config: {}
      },
      {
        id: "role",
        type: "IAM_ROLE",
        label: "Task Role",
        positionX: 160,
        positionY: 180,
        config: {}
      },
      {
        id: "policy",
        type: "IAM_POLICY",
        label: "Task Policy",
        positionX: 0,
        positionY: 180,
        config: {}
      },
      {
        id: "database",
        type: "RDS",
        label: "Application Database",
        positionX: 700,
        positionY: 0,
        config: {}
      },
      {
        id: "alarm",
        type: "CLOUDWATCH_METRIC_ALARM",
        label: "CPU Alarm",
        positionX: 480,
        positionY: 180,
        config: {}
      },
      { id: "bucket", type: "S3", label: "Uploads", positionX: 700, positionY: 180, config: {} }
    ],
    edges: [
      { id: "alb-listener", sourceId: "alb", targetId: "listener" },
      { id: "listener-target", sourceId: "listener", targetId: "target" },
      { id: "target-service", sourceId: "target", targetId: "service" },
      { id: "policy-role", sourceId: "policy", targetId: "role" },
      { id: "role-task", sourceId: "role", targetId: "task" },
      { id: "task-service", sourceId: "task", targetId: "service" },
      { id: "service-alarm", sourceId: "service", targetId: "alarm" },
      { id: "service-bucket", sourceId: "service", targetId: "bucket" },
      { id: "alarm-service", sourceId: "alarm", targetId: "service" },
      { id: "role-service", sourceId: "role", targetId: "service" }
    ]
  };

  const diagramJson = createPlannedDiagramJson({ architectureJson });
  const originalEdges = diagramJson.edges.filter(
    (edge) => edge.metadata?.presentationRole !== "summary"
  );
  const visibleEdges = diagramJson.edges.filter(
    (edge) => edge.metadata?.presentationRole !== "detail"
  );

  assert.equal(originalEdges.length, architectureJson.edges.length);
  assert.ok(visibleEdges.length < originalEdges.length);
  assert.ok(
    visibleEdges.some(
      (edge) =>
        edge.sourceNodeId === "alb" &&
        edge.targetNodeId === "service" &&
        edge.metadata?.presentationRole === "summary"
    )
  );
  assert.ok(
    visibleEdges.some(
      (edge) =>
        edge.sourceNodeId === "service" &&
        edge.targetNodeId === "database" &&
        edge.metadata?.presentationRole === "summary"
    )
  );
  assert.equal(
    diagramJson.edges.find((edge) => edge.id === "role-task")?.metadata?.presentationRole,
    "detail"
  );
});

test("convertDiagramJsonToArchitectureJson excludes summary-only presentation edges", () => {
  const diagramJson = createPlannedDiagramJson({
    architectureJson: {
      nodes: [
        {
          id: "service",
          type: "ECS_SERVICE",
          label: "Service",
          positionX: 0,
          positionY: 0,
          config: {}
        },
        {
          id: "database",
          type: "RDS",
          label: "Database",
          positionX: 300,
          positionY: 0,
          config: {}
        },
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `role-${index}`,
          type: "IAM_ROLE" as const,
          label: `Role ${index}`,
          positionX: index * 80,
          positionY: 200,
          config: {}
        }))
      ],
      edges: Array.from({ length: 10 }, (_, index) => ({
        id: `dependency-${index}`,
        sourceId: `role-${index % 8}`,
        targetId: "service"
      }))
    }
  });
  const architectureJson = convertDiagramJsonToArchitectureJson(diagramJson);

  assert.equal(
    architectureJson.edges.some((edge) => edge.id.startsWith("summary-")),
    false
  );
});

test("convertArchitectureJsonToDiagramJson keeps mixed cloud area drafts compact and routable", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 80,
        positionY: 720,
        config: { cidrBlock: "10.0.0.0/16", terraformResourceName: "main" }
      },
      {
        id: "subnet-app-a",
        type: "SUBNET",
        label: "Private App Subnet A",
        positionX: 160,
        positionY: 780,
        config: {
          cidrBlock: "10.0.1.0/24",
          terraformResourceName: "private_app_a",
          vpcId: "aws_vpc.main.id"
        }
      },
      {
        id: "subnet-db-a",
        type: "SUBNET",
        label: "Private DB Subnet A",
        positionX: 160,
        positionY: 980,
        config: {
          cidrBlock: "10.0.2.0/24",
          terraformResourceName: "private_db_a",
          vpcId: "aws_vpc.main.id"
        }
      },
      {
        id: "sg-app",
        type: "SECURITY_GROUP",
        label: "App Security Group",
        positionX: 220,
        positionY: 840,
        config: { terraformResourceName: "app", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "sg-db",
        type: "SECURITY_GROUP",
        label: "DB Security Group",
        positionX: 660,
        positionY: 980,
        config: { terraformResourceName: "db", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "compute-app",
        type: "EC2",
        label: "Content Board",
        positionX: 320,
        positionY: 900,
        config: {
          instanceType: "t3.micro",
          subnetId: "aws_subnet.private_app_a.id",
          vpcSecurityGroupIds: ["aws_security_group.app.id"]
        }
      },
      {
        id: "db-app",
        type: "RDS",
        label: "App DB",
        positionX: 820,
        positionY: 1040,
        config: {
          dbInstanceClass: "db.t3.micro",
          subnetId: "aws_subnet.private_db_a.id",
          vpcSecurityGroupIds: ["aws_security_group.db.id"]
        }
      },
      {
        id: "cdn-public-entry",
        type: "CLOUDFRONT",
        label: "Public CDN",
        positionX: 980,
        positionY: 170,
        config: {}
      },
      {
        id: "bucket-web-assets",
        type: "S3",
        label: "Web Assets Bucket",
        positionX: 280,
        positionY: 110,
        config: { terraformResourceName: "web_assets" }
      },
      {
        id: "bucket-upload",
        type: "S3",
        label: "Upload Bucket",
        positionX: 520,
        positionY: 250,
        config: { terraformResourceName: "upload" }
      },
      {
        id: "ami-app",
        type: "AMI",
        label: "App AMI",
        positionX: 520,
        positionY: 360,
        config: { owners: ["amazon"] }
      },
      {
        id: "profile-app",
        type: "IAM_INSTANCE_PROFILE",
        label: "App Profile",
        positionX: 1320,
        positionY: 170,
        config: { role: "aws_iam_role.app_runtime.name" }
      },
      {
        id: "role-app-runtime",
        type: "IAM_ROLE",
        label: "App Runtime Role",
        positionX: 980,
        positionY: 80,
        config: { assumeRolePolicy: "policy-json" }
      },
      {
        id: "policy-app-runtime",
        type: "IAM_POLICY",
        label: "App Runtime Policy",
        positionX: 1160,
        positionY: 80,
        config: { policy: "policy-json" }
      },
      {
        id: "key-data-encryption",
        type: "KMS_KEY",
        label: "Data Encryption Key",
        positionX: 1500,
        positionY: 80,
        config: { enableKeyRotation: true }
      },
      {
        id: "logs-app",
        type: "CLOUDWATCH_LOG_GROUP",
        label: "App Logs",
        positionX: 1220,
        positionY: 240,
        config: { name: "/aws/app/content-board" }
      },
      {
        id: "alarm-app-cpu",
        type: "CLOUDWATCH_METRIC_ALARM",
        label: "App CPU Alarm",
        positionX: 960,
        positionY: 420,
        config: { metricName: "CPUUtilization", namespace: "AWS/EC2" }
      },
      {
        id: "alarm-db-cpu",
        type: "CLOUDWATCH_METRIC_ALARM",
        label: "DB CPU Alarm",
        positionX: 1260,
        positionY: 520,
        config: { metricName: "CPUUtilization", namespace: "AWS/RDS" }
      }
    ],
    edges: [
      {
        id: "cdn-to-assets",
        sourceId: "cdn-public-entry",
        targetId: "bucket-web-assets",
        label: "HTTPS"
      },
      {
        id: "compute-to-upload",
        sourceId: "compute-app",
        targetId: "bucket-upload",
        label: "stores files"
      },
      { id: "compute-to-db", sourceId: "compute-app", targetId: "db-app", label: "reads/writes" },
      {
        id: "profile-to-compute",
        sourceId: "profile-app",
        targetId: "compute-app",
        label: "attaches profile"
      },
      {
        id: "policy-to-role",
        sourceId: "policy-app-runtime",
        targetId: "role-app-runtime",
        label: "grants runtime access"
      },
      {
        id: "key-to-logs",
        sourceId: "key-data-encryption",
        targetId: "logs-app",
        label: "encrypts logs"
      },
      {
        id: "compute-to-logs",
        sourceId: "compute-app",
        targetId: "logs-app",
        label: "writes logs"
      },
      {
        id: "alarm-to-compute",
        sourceId: "alarm-app-cpu",
        targetId: "compute-app",
        label: "monitors CPU"
      },
      { id: "alarm-to-db", sourceId: "alarm-db-cpu", targetId: "db-app", label: "monitors CPU" }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const bounds = getDiagramBounds(diagramJson.nodes);

  assert.ok(bounds.width <= 1400, `Expected compact width, received ${bounds.width}`);
  assert.ok(bounds.height <= 1380, `Expected compact height, received ${bounds.height}`);
  assertNoSiblingNodeOverlap(diagramJson);
  assertNoNonAncestorAreaResourceOverlap(diagramJson);
  assertResourceChildrenInsetFromAreaBoundaries(diagramJson);
  assertNoEdgeRouteOverlap(diagramJson);
  assertNoEdgeSharedSegmentOverlap(diagramJson);
});

test("convertArchitectureJsonToDiagramJson lays out server and storage draft as nested cloud areas", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc",
        type: "VPC",
        label: "VPC",
        positionX: 100,
        positionY: 300,
        config: { cidrBlock: "172.16.0.0/16" }
      },
      {
        id: "subnet",
        type: "SUBNET",
        label: "Subnet",
        positionX: 245,
        positionY: 650,
        config: { cidrBlock: "172.16.1.0/24", vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "security-group",
        type: "SECURITY_GROUP",
        label: "Security Group",
        positionX: 200,
        positionY: 520,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "ec2-instance",
        type: "EC2",
        label: "EC2 Instance",
        positionX: 330,
        positionY: 765,
        config: {
          ami: "data.aws_ami.ami.id",
          instanceType: "t3.micro",
          securityGroupIds: ["aws_security_group.security_group.id"],
          subnetId: "aws_subnet.subnet.id"
        }
      },
      {
        id: "internet-gateway",
        type: "INTERNET_GATEWAY",
        label: "Internet Gateway",
        positionX: 590,
        positionY: 365,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "route-table-association",
        type: "ROUTE_TABLE_ASSOCIATION",
        label: "Route Table Association",
        positionX: 700,
        positionY: 620,
        config: { routeTableId: "aws_route_table.route_table.id", subnetId: "aws_subnet.subnet.id" }
      },
      {
        id: "route-table",
        type: "ROUTE_TABLE",
        label: "Route Table",
        positionX: 940,
        positionY: 610,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "ami",
        type: "AMI",
        label: "Amazon Linux AMI",
        positionX: 120,
        positionY: 130,
        config: { owners: ["amazon"] }
      },
      {
        id: "s3-bucket",
        type: "S3",
        label: "S3 Bucket",
        positionX: 950,
        positionY: 130,
        config: {}
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      parentAreaNodeId: node.metadata?.parentAreaNodeId,
      type: node.type
    })),
    [
      {
        id: "server-storage-region",
        kind: "resource",
        parentAreaNodeId: undefined,
        type: "aws_region"
      },
      {
        id: "server-storage-az",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_availability_zone"
      },
      {
        id: "vpc",
        kind: "resource",
        parentAreaNodeId: "server-storage-region",
        type: "aws_vpc"
      },
      {
        id: "subnet",
        kind: "resource",
        parentAreaNodeId: "server-storage-az",
        type: "aws_subnet"
      },
      {
        id: "security-group",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_security_group"
      },
      {
        id: "ec2-instance",
        kind: "resource",
        parentAreaNodeId: "subnet",
        type: "aws_instance"
      },
      {
        id: "internet-gateway",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_internet_gateway"
      },
      {
        id: "route-table-association",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_route_table_association"
      },
      {
        id: "route-table",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_route_table"
      },
      {
        id: "ami",
        kind: "resource",
        parentAreaNodeId: "server-storage-region",
        type: "aws_ami"
      },
      {
        id: "s3-bucket",
        kind: "resource",
        parentAreaNodeId: "server-storage-region",
        type: "aws_s3_bucket"
      }
    ]
  );

  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const regionNode = nodeById.get("server-storage-region");
  const vpcNode = nodeById.get("vpc");
  const azNode = nodeById.get("server-storage-az");
  const subnetNode = nodeById.get("subnet");
  const securityGroupNode = nodeById.get("security-group");
  const instanceNode = nodeById.get("ec2-instance");

  assertContainsNode(regionNode, vpcNode);
  assertContainsNode(vpcNode, azNode);
  assertContainsNode(azNode, subnetNode);
  assertContainsNode(vpcNode, securityGroupNode);
  assertContainsNode(securityGroupNode, instanceNode);
  assert.deepEqual(regionNode?.parameters?.values, {
    awsRegion: "ap-northeast-2"
  });
  assert.deepEqual(azNode?.parameters?.values, {
    awsAvailabilityZone: "ap-northeast-2a"
  });
  assert.equal(regionNode?.parameters?.resourceName, "region_ap_northeast_2");
  assert.equal(azNode?.parameters?.resourceName, "az_ap_northeast_2a");
  assert.ok(
    (regionNode?.size.width ?? 0) <= 1160,
    `expected region width <= 1160, got ${regionNode?.size.width}`
  );
  assert.ok(
    (regionNode?.size.height ?? 0) <= 1040,
    `expected region height <= 1040, got ${regionNode?.size.height}`
  );
  assert.ok(
    (vpcNode?.size.width ?? 0) <= 1000,
    `expected VPC width <= 1000, got ${vpcNode?.size.width}`
  );
  assert.ok(
    (vpcNode?.size.height ?? 0) <= 780,
    `expected VPC height <= 780, got ${vpcNode?.size.height}`
  );
  assert.ok(
    (azNode?.size.width ?? 0) <= 440,
    `expected AZ width <= 440, got ${azNode?.size.width}`
  );
  assert.ok(
    (azNode?.size.height ?? 0) <= 400,
    `expected AZ height <= 400, got ${azNode?.size.height}`
  );
  assertNoSiblingNodeOverlap(diagramJson);
});

test("createPlannedDiagramJson preserves the selected Template layout for repository-generated ECS frontend diagrams", () => {
  const templateId = "ecs-fargate-container-app" as const;
  const nodes: ArchitectureJson["nodes"] = [
    repositoryNode("repository-browser", "UNKNOWN", "Browser", 40, 680, {
      diagramKind: "design",
      diagramType: "client",
      diagramWidth: 140,
      diagramHeight: 80
    }),
    repositoryNode("repository-managed-services", "UNKNOWN", "AWS Managed Services", 260, 40, {
      diagramKind: "design",
      diagramType: "design_group",
      diagramWidth: 1800,
      diagramHeight: 400
    }),
    templateNode(templateId, "vpc", "VPC", "VPC", 260, 500, { diagramWidth: 1800, diagramHeight: 900 }),
    templateNode(templateId, "subnet-a", "SUBNET", "Public Subnet A", 360, 620, {
      parentAreaNodeId: `fixed-template-${templateId}-vpc`,
      diagramWidth: 420,
      diagramHeight: 280
    }),
    templateNode(templateId, "subnet-b", "SUBNET", "Public Subnet B", 840, 620, {
      parentAreaNodeId: `fixed-template-${templateId}-vpc`,
      diagramWidth: 420,
      diagramHeight: 280
    }),
    repositoryNode("repository-private-app-subnet-a", "SUBNET", "Private App Subnet A", 360, 1010, {
      parentAreaNodeId: `fixed-template-${templateId}-vpc`,
      diagramWidth: 420,
      diagramHeight: 300
    }),
    repositoryNode("repository-private-app-subnet-b", "SUBNET", "Private App Subnet B", 840, 1010, {
      parentAreaNodeId: `fixed-template-${templateId}-vpc`,
      diagramWidth: 420,
      diagramHeight: 300
    }),
    templateNode(templateId, "alb-security-group", "SECURITY_GROUP", "ALB Security Group", 420, 680, {
      parentAreaNodeId: `fixed-template-${templateId}-subnet-a`,
      diagramWidth: 300,
      diagramHeight: 160
    }),
    templateNode(templateId, "task-security-group", "SECURITY_GROUP", "Task Security Group", 420, 1070, {
      parentAreaNodeId: "repository-private-app-subnet-a",
      diagramWidth: 340,
      diagramHeight: 180
    }),
    templateNode(templateId, "load-balancer", "LOAD_BALANCER", "Internet-facing ALB (Public A/B)", 500, 730, {
      parentAreaNodeId: `fixed-template-${templateId}-alb-security-group`
    }),
    templateNode(templateId, "listener", "LOAD_BALANCER_LISTENER", "CloudFront Origin HTTP Listener", 1560, 700, {
      parentAreaNodeId: `fixed-template-${templateId}-vpc`
    }),
    templateNode(templateId, "target-group", "LOAD_BALANCER_TARGET_GROUP", "API Target Group", 1360, 700, {
      parentAreaNodeId: `fixed-template-${templateId}-vpc`
    }),
    templateNode(templateId, "cluster", "ECS_CLUSTER", "ECS Cluster", 1540, 140, {
      parentAreaNodeId: `fixed-template-${templateId}-vpc`
    }),
    templateNode(templateId, "service", "ECS_SERVICE", "API Fargate Service", 1780, 140, {
      parentAreaNodeId: `fixed-template-${templateId}-task-security-group`
    }),
    repositoryNode("repository-fargate-runtime", "UNKNOWN", "Fargate Task (1, Private App A/B)", 460, 1140, {
      diagramKind: "design",
      diagramType: "aws_ecs_task_definition",
      diagramWidth: 260,
      diagramHeight: 96,
      parentAreaNodeId: `fixed-template-${templateId}-task-security-group`
    }),
    templateNode(templateId, "task", "ECS_TASK_DEFINITION", "API Task Definition (control plane)", 1060, 140, {
      parentAreaNodeId: "repository-managed-services"
    }),
    templateNode(templateId, "execution-role", "IAM_ROLE", "ECS Execution Role", 820, 300, {
      parentAreaNodeId: "repository-managed-services"
    }),
    templateNode(templateId, "execution-policy", "IAM_POLICY", "ECS Execution Policy", 1060, 300, {
      terraformResourceType: "aws_iam_role_policy_attachment",
      parentAreaNodeId: "repository-managed-services"
    }),
    templateNode(templateId, "task-role", "IAM_ROLE", "ECS Task Role", 1300, 300, {
      parentAreaNodeId: "repository-managed-services"
    }),
    repositoryNode("repository-cloudfront", "CLOUDFRONT", "CloudFront Web Entry", 340, 140, {
      parentAreaNodeId: "repository-managed-services"
    }),
    repositoryNode("repository-web-assets", "S3", "Static Web Assets", 580, 140, {
      parentAreaNodeId: "repository-managed-services",
      bucketPurpose: "static_website_origin"
    }),
    repositoryNode("repository-web-public-access", "S3", "S3 Public Access Block", 560, 280, {
      terraformResourceType: "aws_s3_bucket_public_access_block",
      parentAreaNodeId: "repository-managed-services"
    }),
    repositoryNode("repository-ecr", "ECR_REPOSITORY", "ECR API Image Repository", 820, 140, {
      parentAreaNodeId: "repository-managed-services"
    }),
    repositoryNode("repository-ecs-logs", "CLOUDWATCH_LOG_GROUP", "CloudWatch ECS Container Logs", 1300, 140, {
      parentAreaNodeId: "repository-managed-services"
    }),
    repositoryNode("repository-github-actions", "UNKNOWN", "GitHub Actions", 40, 180, {
      diagramKind: "design",
      diagramType: "github_actions",
      diagramWidth: 160,
      diagramHeight: 80
    })
  ];
  const architectureJson: ArchitectureJson = {
    nodes,
    edges: [
      edge("browser-cloudfront", "repository-browser", "repository-cloudfront", "HTTPS web and /api entry"),
      edge("cloudfront-alb", "repository-cloudfront", `fixed-template-${templateId}-alb-security-group`, "proxies /api/* to ALB over HTTP"),
      edge("alb-lb", `fixed-template-${templateId}-alb-security-group`, `fixed-template-${templateId}-load-balancer`, "attached to public ALB"),
      edge("lb-listener", `fixed-template-${templateId}-load-balancer`, `fixed-template-${templateId}-listener`, "accepts CloudFront origin HTTP"),
      edge("listener-target", `fixed-template-${templateId}-listener`, `fixed-template-${templateId}-target-group`, "forwards API traffic"),
      edge("target-service", `fixed-template-${templateId}-target-group`, `fixed-template-${templateId}-service`, "health checks /health"),
      edge("cluster-service", `fixed-template-${templateId}-cluster`, `fixed-template-${templateId}-service`, "runs the API service"),
      edge("service-runtime", `fixed-template-${templateId}-service`, "repository-fargate-runtime", "schedules desired task in private app subnets"),
      edge("ecr-runtime", "repository-ecr", "repository-fargate-runtime", "application revisions pull API image from ECR"),
      edge("runtime-logs", "repository-fargate-runtime", "repository-ecs-logs", "writes ECS container logs via awslogs"),
      edge("actions-ecr", "repository-github-actions", "repository-ecr", "builds and pushes API image"),
      edge("actions-web", "repository-github-actions", "repository-web-assets", "uploads apps/web/dist")
    ]
  };

  const diagramJson = createPlannedDiagramJson({ architectureJson });
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const authoredDiagram = buildTemplateDiagramJson(templateId, {
    projectSlug: "repository-template",
    shortId: "layout"
  });
  const authoredNodeById = new Map(authoredDiagram.nodes.map((node) => [node.id, node]));
  const quality = evaluateDiagramLayout(diagramJson);
  const visibleQuality = evaluateVisibleDiagramLayout(diagramJson);
  const service = nodeById.get(`fixed-template-${templateId}-service`);
  const runtime = nodeById.get("repository-fargate-runtime");
  const browser = nodeById.get("repository-browser");
  const cloudFront = nodeById.get("repository-cloudfront");
  const webAssets = nodeById.get("repository-web-assets");
  const vpc = nodeById.get(`fixed-template-${templateId}-vpc`);
  const publicSubnetA = nodeById.get(`fixed-template-${templateId}-subnet-a`);
  const publicSubnetB = nodeById.get(`fixed-template-${templateId}-subnet-b`);
  const privateSubnetA = nodeById.get("repository-private-app-subnet-a");
  const privateSubnetB = nodeById.get("repository-private-app-subnet-b");
  const albSecurityGroup = nodeById.get(`fixed-template-${templateId}-alb-security-group`);
  const taskSecurityGroup = nodeById.get(`fixed-template-${templateId}-task-security-group`);
  const bounds = getDiagramBounds(diagramJson.nodes);

  assert.equal(diagramJson.nodes.some((node) => node.id.includes("-presentation-")), true);
  assert.equal(nodeById.has("repository-managed-services"), false);
  assert.ok(quality.parentBoundaryViolationCount <= 3);
  assert.ok(quality.backwardEdgeCount <= 2);
  assert.ok(visibleQuality.edgeCrossingCount <= 4);
  assert.ok(
    browser &&
      cloudFront &&
      webAssets &&
      vpc &&
      publicSubnetA &&
      publicSubnetB &&
      privateSubnetA &&
      privateSubnetB &&
      albSecurityGroup &&
      taskSecurityGroup
  );

  for (const plannedNode of diagramJson.nodes.filter((node) =>
    node.id.startsWith(`fixed-template-${templateId}-`)
  )) {
    const authoredNodeId = plannedNode.id.replace(
      `fixed-template-${templateId}-presentation-`,
      `template-${templateId}-presentation-`
    ).replace(`fixed-template-${templateId}-`, `template-${templateId}-`);
    const authoredNode = authoredNodeById.get(authoredNodeId);

    assert.ok(authoredNode, plannedNode.id);
    assert.deepEqual(plannedNode.position, authoredNode.position, `${plannedNode.id} position`);
    assert.deepEqual(plannedNode.size, authoredNode.size, `${plannedNode.id} size`);
  }

  assert.ok(cloudFront.position.x > browser.position.x);
  assert.ok(webAssets.position.x > cloudFront.position.x);
  assert.deepEqual(vpc.position, authoredNodeById.get(`template-${templateId}-vpc`)?.position);
  assert.deepEqual(vpc.size, authoredNodeById.get(`template-${templateId}-vpc`)?.size);
  assert.deepEqual(publicSubnetA.position, authoredNodeById.get(`template-${templateId}-subnet-a`)?.position);
  assert.deepEqual(publicSubnetB.position, authoredNodeById.get(`template-${templateId}-subnet-b`)?.position);
  assert.equal(albSecurityGroup.metadata?.parentAreaNodeId, vpc.id);
  assert.equal(taskSecurityGroup.metadata?.parentAreaNodeId, `fixed-template-${templateId}-cluster`);
  assert.ok(bounds.width <= 2900, `bounds width ${bounds.width}`);
  assert.ok(bounds.height <= 1200);
  assert.ok(service && runtime);
  assert.equal(runtime.metadata?.parentAreaNodeId, undefined);
});

test("convertArchitectureJsonToDiagramJson lays out generated EC2 drafts inside cloud container areas", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 70,
        positionY: 320,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      {
        id: "public-subnet",
        type: "SUBNET",
        label: "Public Subnet",
        positionX: 150,
        positionY: 490,
        config: { cidrBlock: "10.0.1.0/24", vpcId: "aws_vpc.vpc_main.id" }
      },
      {
        id: "app-security-group",
        type: "SECURITY_GROUP",
        label: "App Security Group",
        positionX: 220,
        positionY: 560,
        config: { vpcId: "aws_vpc.vpc_main.id" }
      },
      {
        id: "internet-gateway",
        type: "INTERNET_GATEWAY",
        label: "Internet Gateway",
        positionX: 650,
        positionY: 360,
        config: { vpcId: "aws_vpc.vpc_main.id" }
      },
      {
        id: "app-server",
        type: "EC2",
        label: "Application Server",
        positionX: 370,
        positionY: 620,
        config: {
          instanceType: "t3.micro",
          subnetId: "aws_subnet.public_subnet.id",
          vpcSecurityGroupIds: ["aws_security_group.app_security_group.id"]
        }
      }
    ],
    edges: [
      {
        id: "vpc-main-to-public-subnet",
        sourceId: "vpc-main",
        targetId: "public-subnet",
        label: "contains"
      },
      {
        id: "public-subnet-to-app-server",
        sourceId: "public-subnet",
        targetId: "app-server",
        label: "hosts"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      parentAreaNodeId: node.metadata?.parentAreaNodeId,
      type: node.type
    })),
    [
      { id: "server-storage-region", parentAreaNodeId: undefined, type: "aws_region" },
      { id: "server-storage-az", parentAreaNodeId: "vpc-main", type: "aws_availability_zone" },
      { id: "vpc-main", parentAreaNodeId: "server-storage-region", type: "aws_vpc" },
      { id: "public-subnet", parentAreaNodeId: "server-storage-az", type: "aws_subnet" },
      { id: "app-security-group", parentAreaNodeId: "vpc-main", type: "aws_security_group" },
      { id: "internet-gateway", parentAreaNodeId: "vpc-main", type: "aws_internet_gateway" },
      { id: "app-server", parentAreaNodeId: "public-subnet", type: "aws_instance" }
    ]
  );

  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));

  assertContainsNode(nodeById.get("server-storage-region"), nodeById.get("vpc-main"));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("server-storage-az"));
  assertContainsNode(nodeById.get("server-storage-az"), nodeById.get("public-subnet"));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("app-security-group"));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("internet-gateway"));
  assertContainsNode(nodeById.get("app-security-group"), nodeById.get("app-server"));
});

test("convertArchitectureJsonToDiagramJson keeps route table associations out of subnet child layout", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 70,
        positionY: 320,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      {
        id: "public-subnet-a",
        type: "SUBNET",
        label: "Public Subnet A",
        positionX: 150,
        positionY: 320,
        config: {
          cidrBlock: "10.0.1.0/24",
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "public-route-table",
        type: "ROUTE_TABLE",
        label: "Public Route Table",
        positionX: 650,
        positionY: 520,
        config: {
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "public-route-table-association",
        type: "ROUTE_TABLE_ASSOCIATION",
        label: "Public Route Association A",
        positionX: 520,
        positionY: 720,
        config: {
          routeTableId: "aws_route_table.public_route_table.id",
          subnetId: "aws_subnet.public_subnet_a.id"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const vpcNode = nodeById.get("vpc-main");
  const subnetNode = nodeById.get("public-subnet-a");
  const associationNode = nodeById.get("public-route-table-association");

  assert.equal(associationNode?.metadata?.parentAreaNodeId, "vpc-main");
  assert.ok(subnetNode, "Expected subnet node");
  assert.ok(associationNode, "Expected route table association node");
  assertContainsNode(vpcNode, subnetNode);
  assertContainsNode(vpcNode, associationNode);
  assertNoNodeOverlap(subnetNode, associationNode);
});

test("convertArchitectureJsonToDiagramJson keeps multi-subnet runtime resources inside their VPC", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 0,
        positionY: 0,
        config: { terraformResourceName: "main" }
      },
      ...["public-a", "public-b", "app-a", "app-b", "db-a", "db-b"].map((id) => ({
        id: `subnet-${id}`,
        type: "SUBNET" as const,
        label: `Subnet ${id}`,
        positionX: 0,
        positionY: 0,
        config: {
          terraformResourceName: id.replaceAll("-", "_"),
          vpcId: "aws_vpc.main.id"
        }
      })),
      {
        id: "load-balancer",
        type: "LOAD_BALANCER",
        label: "Application Load Balancer",
        positionX: 0,
        positionY: 0,
        config: {
          subnets: ["aws_subnet.public_a.id", "aws_subnet.public_b.id"]
        }
      },
      {
        id: "service",
        type: "ECS_SERVICE",
        label: "Fargate Service",
        positionX: 0,
        positionY: 0,
        config: {
          networkConfiguration: {
            subnets: ["aws_subnet.app_a.id", "aws_subnet.app_b.id"]
          }
        }
      },
      {
        id: "db-subnet-group",
        type: "DB_SUBNET_GROUP",
        label: "DB Subnet Group",
        positionX: 0,
        positionY: 0,
        config: {
          terraformResourceName: "database",
          subnetIds: ["aws_subnet.db_a.id", "aws_subnet.db_b.id"]
        }
      },
      {
        id: "database",
        type: "RDS",
        label: "Application Database",
        positionX: 0,
        positionY: 0,
        config: {
          dbSubnetGroupName: "aws_db_subnet_group.database.name"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const parentByNodeId = new Map(
    diagramJson.nodes.map((node) => [node.id, node.metadata?.parentAreaNodeId])
  );

  assert.equal(parentByNodeId.get("load-balancer"), "vpc-main");
  assert.equal(parentByNodeId.get("service"), "vpc-main");
  assert.equal(parentByNodeId.get("db-subnet-group"), "vpc-main");
  assert.equal(parentByNodeId.get("database"), "vpc-main");
});

test("convertArchitectureJsonToDiagramJson keeps runtime usage arrows visible", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "ami",
        type: "AMI",
        label: "Amazon Linux AMI",
        positionX: 120,
        positionY: 130,
        config: { owners: ["amazon"] }
      },
      {
        id: "ec2-instance",
        type: "EC2",
        label: "EC2 Instance",
        positionX: 330,
        positionY: 765,
        config: {
          ami: "data.aws_ami.ami.id",
          instanceType: "t3.micro"
        }
      },
      {
        id: "s3-bucket",
        type: "S3",
        label: "S3 Bucket",
        positionX: 950,
        positionY: 130,
        config: {}
      }
    ],
    edges: [
      {
        id: "ami-to-ec2-instance",
        sourceId: "ami",
        targetId: "ec2-instance",
        label: "launch image"
      },
      {
        id: "ec2-instance-to-s3-bucket",
        sourceId: "ec2-instance",
        targetId: "s3-bucket",
        label: "stores images"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.edges.map((edge) => ({
      id: edge.id,
      label: edge.label,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId
    })),
    [
      {
        id: "ami-to-ec2-instance",
        label: "launch image",
        sourceNodeId: "ami",
        targetNodeId: "ec2-instance"
      },
      {
        id: "ec2-instance-to-s3-bucket",
        label: "stores images",
        sourceNodeId: "ec2-instance",
        targetNodeId: "s3-bucket"
      }
    ]
  );
});

test("convertDiagramJsonToArchitectureJson keeps only valid resource nodes and connected edges", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeDiagramNode({
        id: "rds-primary",
        label: "Primary DB",
        parameters: {
          fileName: "main",
          resourceName: "primary",
          resourceType: "aws_db_instance",
          terraformBlockType: "resource",
          values: {
            engine: "postgres"
          }
        },
        type: "aws_db_instance"
      }),
      makeDiagramNode({
        id: "note-1",
        kind: "design",
        label: "설명 메모",
        parameters: undefined,
        type: "sketchcatch_note"
      }),
      makeDiagramNode({
        id: "invalid-ec2",
        label: "Invalid EC2",
        parameters: {
          fileName: "main",
          invalid: true,
          resourceName: "invalid",
          resourceType: "aws_instance",
          terraformBlockType: "resource",
          values: {}
        },
        type: "aws_instance"
      })
    ],
    edges: [
      {
        id: "dangling",
        sourceNodeId: "rds-primary",
        targetNodeId: "invalid-ec2"
      },
      {
        id: "self",
        sourceNodeId: "rds-primary",
        targetNodeId: "rds-primary"
      }
    ],
    viewport: { x: 24, y: 48, zoom: 0.8 }
  };

  const architectureJson = convertDiagramJsonToArchitectureJson(diagramJson);

  assert.deepEqual(architectureJson, {
    nodes: [
      {
        id: "rds-primary",
        type: "RDS",
        label: "Primary DB",
        positionX: 10,
        positionY: 20,
        config: {
          engine: "postgres",
          terraformResourceName: "primary",
          terraformResourceType: "aws_db_instance"
        }
      }
    ],
    edges: [
      {
        id: "self",
        sourceId: "rds-primary",
        targetId: "rds-primary",
        label: undefined
      }
    ]
  });
});

test("convertDiagramJsonToArchitectureJson tolerates missing parameter values for RDS mapping", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeDiagramNode({
        id: "legacy-null-rds",
        label: "Legacy Null RDS",
        parameters: {
          fileName: "main",
          resourceName: "legacy_null",
          resourceType: "aws_db_instance",
          terraformBlockType: "resource",
          values: null as unknown as Record<string, unknown>
        },
        type: "aws_db_instance"
      }),
      makeDiagramNode({
        id: "legacy-undefined-rds",
        label: "Legacy Undefined RDS",
        parameters: {
          fileName: "main",
          resourceName: "legacy_undefined",
          resourceType: "aws_db_instance",
          terraformBlockType: "resource",
          values: undefined as unknown as Record<string, unknown>
        },
        type: "aws_db_instance"
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const architectureJson = convertDiagramJsonToArchitectureJson(diagramJson);

  assert.deepEqual(
    architectureJson.nodes.map((node) => ({
      config: node.config,
      id: node.id,
      type: node.type
    })),
    [
      {
        config: {
          terraformResourceName: "legacy_null",
          terraformResourceType: "aws_db_instance"
        },
        id: "legacy-null-rds",
        type: "RDS"
      },
      {
        config: {
          terraformResourceName: "legacy_undefined",
          terraformResourceType: "aws_db_instance"
        },
        id: "legacy-undefined-rds",
        type: "RDS"
      }
    ]
  );
});

test("convertDiagramJsonToArchitectureJson keeps only AWS port range values in ingress config", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeSecurityGroupRuleNode({
        cidrBlock: "0.0.0.0/0",
        fromPort: "22",
        id: "ssh-rule",
        label: "SSH Rule",
        resourceName: "ssh"
      }),
      makeSecurityGroupRuleNode({
        cidrBlock: "10.0.0.0/16",
        fromPort: "70000",
        id: "invalid-port-rule",
        label: "Invalid Port Rule",
        resourceName: "invalid"
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const architectureJson = convertDiagramJsonToArchitectureJson(diagramJson);

  assert.deepEqual(
    architectureJson.nodes.map((node) => node.config["ingress"]),
    [[{ cidr: "0.0.0.0/0", port: 22 }], [{ cidr: "10.0.0.0/16" }]]
  );
});

// Security Group Rule fixture는 포트 범위 테스트가 ingress 값에만 집중하도록 둡니다.
function makeSecurityGroupRuleNode(node: {
  readonly cidrBlock: string;
  readonly fromPort: string;
  readonly id: string;
  readonly label: string;
  readonly resourceName: string;
}): DiagramJson["nodes"][number] {
  return makeDiagramNode({
    id: node.id,
    label: node.label,
    parameters: {
      fileName: "main",
      resourceName: node.resourceName,
      resourceType: "aws_security_group_rule",
      terraformBlockType: "resource",
      values: { cidrBlocks: [node.cidrBlock], fromPort: node.fromPort, type: "ingress" }
    },
    type: "aws_security_group_rule"
  });
}

function repositoryNode(
  id: string,
  type: ResourceType,
  label: string,
  positionX: number,
  positionY: number,
  config: Record<string, unknown>
): ArchitectureJson["nodes"][number] {
  return { id, type, label, positionX, positionY, config };
}

function templateNode(
  templateId: string,
  templateResourceId: string,
  type: ResourceType,
  label: string,
  positionX: number,
  positionY: number,
  config: Record<string, unknown>
): ArchitectureJson["nodes"][number] {
  return repositoryNode(
    `fixed-template-${templateId}-${templateResourceId}`,
    type,
    label,
    positionX,
    positionY,
    {
      templateId,
      templateResourceId,
      ...config
    }
  );
}

function edge(
  id: string,
  sourceId: string,
  targetId: string,
  label: string
): ArchitectureJson["edges"][number] {
  return { id, sourceId, targetId, label };
}

function makeDiagramNode(
  node: Partial<DiagramJson["nodes"][number]> &
    Pick<DiagramJson["nodes"][number], "id" | "label" | "type">
): DiagramJson["nodes"][number] {
  return {
    id: node.id,
    kind: node.kind ?? "resource",
    label: node.label,
    locked: false,
    position: node.position ?? { x: 10, y: 20 },
    size: node.size ?? { width: 180, height: 96 },
    type: node.type,
    zIndex: node.zIndex ?? 1,
    ...(node.parameters !== undefined ? { parameters: node.parameters } : {})
  };
}

function assertContainsNode(parent: DiagramNode | undefined, child: DiagramNode | undefined): void {
  assert.ok(parent, "Expected parent node to exist");
  assert.ok(child, "Expected child node to exist");
  assert.ok(
    child.position.x >= parent.position.x,
    `${parent.id} should contain ${child.id} on the left edge`
  );
  assert.ok(
    child.position.y >= parent.position.y,
    `${parent.id} should contain ${child.id} on the top edge`
  );
  assert.ok(
    child.position.x + child.size.width <= parent.position.x + parent.size.width,
    `${parent.id} should contain ${child.id} on the right edge`
  );
  assert.ok(
    child.position.y + child.size.height <= parent.position.y + parent.size.height,
    `${parent.id} should contain ${child.id} on the bottom edge`
  );
}

function assertNoNodeOverlap(left: DiagramNode | undefined, right: DiagramNode | undefined): void {
  assert.ok(left, "Expected left node to exist");
  assert.ok(right, "Expected right node to exist");
  assert.ok(
    left.position.x + left.size.width <= right.position.x ||
      right.position.x + right.size.width <= left.position.x ||
      left.position.y + left.size.height <= right.position.y ||
      right.position.y + right.size.height <= left.position.y,
    `${left.id} should not overlap ${right.id}`
  );
}

function evaluateDiagramLayout(diagramJson: DiagramJson) {
  return evaluateAutomaticDiagramLayout({
    edges: diagramJson.edges.map((edge) => ({
      id: edge.id,
      label: edge.label,
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId
    })),
    nodes: diagramJson.nodes
  });
}

function evaluateVisibleDiagramLayout(diagramJson: DiagramJson) {
  return evaluateAutomaticDiagramLayout({
    edges: getVisibleDiagramJson(diagramJson).edges.map((edge) => ({
        id: edge.id,
        label: edge.label,
        sourceId: edge.sourceNodeId,
        targetId: edge.targetNodeId
      })),
    nodes: diagramJson.nodes
  });
}

function getVisibleDiagramJson(diagramJson: DiagramJson): DiagramJson {
  return {
    ...diagramJson,
    edges: diagramJson.edges.filter((edge) => edge.metadata?.presentationRole !== "detail")
  };
}

function assertNoSiblingNodeOverlap(diagramJson: DiagramJson): void {
  for (let leftIndex = 0; leftIndex < diagramJson.nodes.length; leftIndex += 1) {
    const left = diagramJson.nodes[leftIndex];

    if (!left || left.kind !== "resource") {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < diagramJson.nodes.length; rightIndex += 1) {
      const right = diagramJson.nodes[rightIndex];

      if (!right || right.kind !== "resource") {
        continue;
      }

      if (isSecurityGroupScopeNode(left) || isSecurityGroupScopeNode(right)) {
        continue;
      }

      if (left.metadata?.parentAreaNodeId !== right.metadata?.parentAreaNodeId) {
        continue;
      }

      if (isAreaNode(left) !== isAreaNode(right)) {
        continue;
      }

      assertNoNodeOverlap(left, right);
    }
  }
}

function assertResourceChildrenInsetFromAreaBoundaries(diagramJson: DiagramJson): void {
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const minimumInset = 32;

  for (const node of diagramJson.nodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId || node.kind !== "resource" || isAreaNode(node)) {
      continue;
    }

    const parent = nodeById.get(parentAreaNodeId);

    if (!parent || !isAreaNode(parent)) {
      continue;
    }

    assert.ok(
      node.position.x - parent.position.x >= minimumInset,
      `${node.id} should stay inside ${parent.id} left boundary`
    );
    assert.ok(
      node.position.y - parent.position.y >= minimumInset,
      `${node.id} should stay inside ${parent.id} top boundary`
    );
    assert.ok(
      parent.position.x + parent.size.width - (node.position.x + node.size.width) >= minimumInset,
      `${node.id} should stay inside ${parent.id} right boundary`
    );
    assert.ok(
      parent.position.y + parent.size.height - (node.position.y + node.size.height) >= minimumInset,
      `${node.id} should stay inside ${parent.id} bottom boundary`
    );
  }
}

function assertNoNonAncestorAreaResourceOverlap(diagramJson: DiagramJson): void {
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));

  for (const area of diagramJson.nodes) {
    if (!isAreaNode(area) || isSecurityGroupScopeNode(area)) {
      continue;
    }

    for (const resource of diagramJson.nodes) {
      if (resource.id === area.id || resource.kind !== "resource" || isAreaNode(resource)) {
        continue;
      }

      if (hasTestAreaAncestor(resource, area.id, nodeById)) {
        continue;
      }

      assertNoNodeOverlap(area, resource);
    }
  }
}

function hasTestAreaAncestor(
  node: DiagramNode,
  ancestorAreaNodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>();

  while (parentAreaNodeId) {
    if (parentAreaNodeId === ancestorAreaNodeId) {
      return true;
    }

    if (visitedNodeIds.has(parentAreaNodeId)) {
      return false;
    }

    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return false;
}

function getDiagramBounds(nodes: readonly DiagramNode[]): { width: number; height: number } {
  const bounds = nodes.reduce(
    (currentBounds, node) => ({
      maxX: Math.max(currentBounds.maxX, node.position.x + node.size.width),
      maxY: Math.max(currentBounds.maxY, node.position.y + node.size.height),
      minX: Math.min(currentBounds.minX, node.position.x),
      minY: Math.min(currentBounds.minY, node.position.y)
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY
    }
  );

  return {
    height: bounds.maxY - bounds.minY,
    width: bounds.maxX - bounds.minX
  };
}

function assertNoEdgeRouteOverlap(diagramJson: DiagramJson): void {
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));

  for (const edge of diagramJson.edges) {
    const sourceNode = nodeById.get(edge.sourceNodeId);
    const targetNode = nodeById.get(edge.targetNodeId);

    assert.ok(sourceNode, `Expected source node for ${edge.id}`);
    assert.ok(targetNode, `Expected target node for ${edge.id}`);

    for (const node of diagramJson.nodes) {
      if (
        node.id === sourceNode.id ||
        node.id === targetNode.id ||
        node.kind !== "resource" ||
        isAreaNode(node)
      ) {
        continue;
      }

      const overlapLength = getOrthogonalRouteNodeOverlapLength(
        sourceNode,
        targetNode,
        {
          sourceHandleId: edge.sourceHandleId ?? "handle-right",
          targetHandleId: edge.targetHandleId ?? "handle-left"
        },
        node
      );
      assert.ok(
        overlapLength <= 6,
        `${edge.id} should not route through ${node.id} (${overlapLength})`
      );
    }
  }
}

function assertNoEdgeSharedSegmentOverlap(diagramJson: DiagramJson): void {
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const routes = diagramJson.edges.map((edge) => {
    const sourceNode = nodeById.get(edge.sourceNodeId);
    const targetNode = nodeById.get(edge.targetNodeId);

    assert.ok(sourceNode, `Expected source node for ${edge.id}`);
    assert.ok(targetNode, `Expected target node for ${edge.id}`);

    return {
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      segments: getTestRouteSegments(
        getTestNodeHandlePoint(sourceNode, edge.sourceHandleId ?? "handle-right"),
        getTestNodeHandlePoint(targetNode, edge.targetHandleId ?? "handle-left"),
        edge.sourceHandleId ?? "handle-right",
        edge.targetHandleId ?? "handle-left"
      ),
      targetNodeId: edge.targetNodeId
    };
  });

  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const leftRoute = routes[leftIndex];
      const rightRoute = routes[rightIndex];

      assert.ok(leftRoute);
      assert.ok(rightRoute);

      if (
        leftRoute.sourceNodeId === rightRoute.sourceNodeId ||
        leftRoute.sourceNodeId === rightRoute.targetNodeId ||
        leftRoute.targetNodeId === rightRoute.sourceNodeId ||
        leftRoute.targetNodeId === rightRoute.targetNodeId
      ) {
        continue;
      }

      const overlapLength = leftRoute.segments.reduce(
        (total, leftSegment) =>
          total +
          rightRoute.segments.reduce(
            (segmentTotal, rightSegment) =>
              segmentTotal + getTestSegmentOverlapLength(leftSegment, rightSegment),
            0
          ),
        0
      );

      assert.ok(
        overlapLength <= 80,
        `${leftRoute.id} should not share a route segment with ${rightRoute.id} beyond the endpoint handle stub (${overlapLength})`
      );
    }
  }
}

type TestRouteSegment = {
  readonly from: DiagramNode["position"];
  readonly to: DiagramNode["position"];
};

function getTestRouteSegments(
  sourcePoint: DiagramNode["position"],
  targetPoint: DiagramNode["position"],
  sourceHandleId: string,
  targetHandleId: string
): TestRouteSegment[] {
  const sourceExitPoint = getTestHandleStubPoint(sourcePoint, sourceHandleId);
  const targetExitPoint = getTestHandleStubPoint(targetPoint, targetHandleId);
  const segments: TestRouteSegment[] = [{ from: sourcePoint, to: sourceExitPoint }];

  if (sourceExitPoint.x === targetExitPoint.x || sourceExitPoint.y === targetExitPoint.y) {
    segments.push(
      { from: sourceExitPoint, to: targetExitPoint },
      { from: targetExitPoint, to: targetPoint }
    );
    return removeZeroLengthTestRouteSegments(segments);
  }

  if (isTestVerticalEdgeHandle(sourceHandleId) && isTestVerticalEdgeHandle(targetHandleId)) {
    const middleY = sourceExitPoint.y + (targetExitPoint.y - sourceExitPoint.y) / 2;

    segments.push(
      { from: sourceExitPoint, to: { x: sourceExitPoint.x, y: middleY } },
      { from: { x: sourceExitPoint.x, y: middleY }, to: { x: targetExitPoint.x, y: middleY } },
      { from: { x: targetExitPoint.x, y: middleY }, to: targetExitPoint },
      { from: targetExitPoint, to: targetPoint }
    );
    return removeZeroLengthTestRouteSegments(segments);
  }

  const middleX = sourceExitPoint.x + (targetExitPoint.x - sourceExitPoint.x) / 2;

  segments.push(
    { from: sourceExitPoint, to: { x: middleX, y: sourceExitPoint.y } },
    { from: { x: middleX, y: sourceExitPoint.y }, to: { x: middleX, y: targetExitPoint.y } },
    { from: { x: middleX, y: targetExitPoint.y }, to: targetExitPoint },
    { from: targetExitPoint, to: targetPoint }
  );
  return removeZeroLengthTestRouteSegments(segments);
}

function isTestVerticalEdgeHandle(handleId: string): boolean {
  return handleId === "handle-top" || handleId === "handle-bottom";
}

function getTestHandleStubPoint(
  point: DiagramNode["position"],
  handleId: string
): DiagramNode["position"] {
  const stubLength = 20;

  if (handleId === "handle-left") {
    return { x: point.x - stubLength, y: point.y };
  }

  if (handleId === "handle-right") {
    return { x: point.x + stubLength, y: point.y };
  }

  if (handleId === "handle-top") {
    return { x: point.x, y: point.y - stubLength };
  }

  return { x: point.x, y: point.y + stubLength };
}

function removeZeroLengthTestRouteSegments(
  segments: readonly TestRouteSegment[]
): TestRouteSegment[] {
  return segments.filter(
    (segment) => segment.from.x !== segment.to.x || segment.from.y !== segment.to.y
  );
}

function getTestNodeHandlePoint(node: DiagramNode, handleId: string): DiagramNode["position"] {
  const center = {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };

  if (handleId === "handle-left") {
    return { x: node.position.x, y: center.y };
  }

  if (handleId === "handle-right") {
    return { x: node.position.x + node.size.width, y: center.y };
  }

  if (handleId === "handle-top") {
    return { x: center.x, y: node.position.y };
  }

  return { x: center.x, y: node.position.y + node.size.height };
}

function getTestSegmentOverlapLength(
  leftSegment: TestRouteSegment,
  rightSegment: TestRouteSegment
): number {
  const leftHorizontal = leftSegment.from.y === leftSegment.to.y;
  const rightHorizontal = rightSegment.from.y === rightSegment.to.y;
  const leftVertical = leftSegment.from.x === leftSegment.to.x;
  const rightVertical = rightSegment.from.x === rightSegment.to.x;

  if (
    leftHorizontal &&
    rightHorizontal &&
    Math.abs(leftSegment.from.y - rightSegment.from.y) <= 1
  ) {
    return getTestRangeOverlapLength(
      leftSegment.from.x,
      leftSegment.to.x,
      rightSegment.from.x,
      rightSegment.to.x
    );
  }

  if (leftVertical && rightVertical && Math.abs(leftSegment.from.x - rightSegment.from.x) <= 1) {
    return getTestRangeOverlapLength(
      leftSegment.from.y,
      leftSegment.to.y,
      rightSegment.from.y,
      rightSegment.to.y
    );
  }

  return 0;
}

function getTestRangeOverlapLength(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
): number {
  const leftMin = Math.min(leftStart, leftEnd);
  const leftMax = Math.max(leftStart, leftEnd);
  const rightMin = Math.min(rightStart, rightEnd);
  const rightMax = Math.max(rightStart, rightEnd);

  return Math.max(0, Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin));
}
