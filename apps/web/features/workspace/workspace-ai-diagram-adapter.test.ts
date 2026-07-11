import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { AiArchitectureDraftResult, ArchitectureJson, DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson,
  getDiagramJsonForArchitectureDraft,
  normalizeDiagramJsonConventions
} from "./workspace-ai-diagram-adapter";
import { isAreaNode } from "../diagram-editor/area-nodes";

test("convertArchitectureJsonToDiagramJson keeps non-overlapping authored positions as the default layout", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      { id: "source", type: "S3", label: "Source", positionX: 713, positionY: 119, config: {} },
      { id: "target", type: "CLOUDFRONT", label: "Target", positionX: 127, positionY: 887, config: {} }
    ],
    edges: [{ id: "source-to-target", sourceId: "source", targetId: "target", label: "origin" }]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => ({ id: node.id, position: node.position })),
    [
      { id: "source", position: { x: 713, y: 119 } },
      { id: "target", position: { x: 127, y: 887 } }
    ]
  );
  assert.deepEqual(
    diagramJson.edges
      .filter((edge) => edge.id === "source-to-target")
      .map((edge) => ({ id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId })),
    [{ id: "source-to-target", sourceNodeId: "source", targetNodeId: "target" }]
  );
});

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

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      iconUrl: node.iconUrl,
      id: node.id,
      kind: node.kind,
      label: node.label,
      parameters: node.parameters,
      position: node.position,
      size: node.size,
      style: node.style,
      type: node.type
    })),
    [
      {
        iconUrl:
          "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg",
        id: "vpc-main",
        kind: "resource",
        label: "Main VPC",
        parameters: {
          fileName: "main",
          resourceName: "vpc_main",
          resourceType: "aws_vpc",
          terraformBlockType: "resource",
          values: {
            cidrBlock: "10.0.0.0/16",
            enableDnsSupport: true,
            instanceTenancy: "default",
            terraformResourceName: "main"
          }
        },
        position: { x: 304, y: 164 },
        size: { width: 420, height: 280 },
        style: {
          borderColor: "#2f6db3",
          textColor: "#172033"
        },
        type: "aws_vpc"
      },
      {
        iconUrl: "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg",
        id: "ec2-backend",
        kind: "resource",
        label: "Backend Server",
        parameters: {
          fileName: "main",
          resourceName: "compute_backend",
          resourceType: "aws_instance",
          terraformBlockType: "resource",
          values: {
            associatePublicIpAddress: false,
            instanceType: "t3.micro"
          }
        },
        position: { x: 360, y: 220 },
        size: { width: 124, height: 96 },
        style: {
          borderColor: "#2f6db3",
          textColor: "#172033"
        },
        type: "aws_instance"
      }
    ]
  );
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
        color: "#506176",
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

  assert.equal(edge?.sourceHandleId, "handle-top");
  assert.equal(edge?.targetHandleId, "handle-top");
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
  assert.equal(nodeById.get("subnet-private-app-a")?.parameters?.resourceName, "subnet_private_app_a");
  assert.equal(nodeById.get("app-security-group")?.parameters?.resourceName, "sg_app");
  assert.equal(nodeById.get("compute-content-board")?.parameters?.resourceName, "compute_content_board");
  assert.equal(
    nodeById.get("profile-app")?.parameters?.values["role"],
    "aws_iam_role.role_app_runtime.name"
  );
  assert.equal(nodeById.get("compute-content-board")?.parameters?.values["ami"], "data.aws_ami.ami_app.id");
  assert.equal(
    nodeById.get("compute-content-board")?.parameters?.values["iamInstanceProfile"],
    "aws_iam_instance_profile.profile_app.name"
  );
  assert.equal(
    nodeById.get("compute-content-board")?.parameters?.values["subnetId"],
    "aws_subnet.subnet_private_app_a.id"
  );
  assert.deepEqual(nodeById.get("compute-content-board")?.parameters?.values["vpcSecurityGroupIds"], [
    "aws_security_group.sg_app.id"
  ]);
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
    color: "#506176",
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
  assert.deepEqual(cloudFrontNode?.size, { width: 124, height: 96 });
  assert.equal(cloudFrontNode?.parameters?.resourceName, "cdn_site");
});

test("convertArchitectureJsonToDiagramJson preserves configured catalog Terraform resource types", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "bucket-policy",
        type: "S3",
        label: "Bucket Policy",
        positionX: 120,
        positionY: 80,
        config: {
          terraformResourceType: "aws_s3_bucket_policy"
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const policyNode = diagramJson.nodes[0];

  assert.equal(policyNode?.type, "aws_s3_bucket_policy");
  assert.equal(policyNode?.parameters?.resourceType, "aws_s3_bucket_policy");
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
  assert.deepEqual(unknownNode?.size, { width: 56, height: 56 });
});

test("getDiagramJsonForArchitectureDraft preserves exact DiagramJson coordinates while normalizing conventions", () => {
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

  const result = getDiagramJsonForArchitectureDraft(draft);

  assert.notEqual(result, exactDiagramJson);
  assert.deepEqual(result.nodes[0]?.position, exactDiagramJson.nodes[0]?.position);
  assert.deepEqual(result.viewport, exactDiagramJson.viewport);
});

test("normalizeDiagramJsonConventions removes area endpoint arrows from exact Q diagrams", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeDiagramNode({
        id: "private-subnet",
        label: "Private Subnet",
        type: "aws_subnet",
        parameters: {
          fileName: "network",
          resourceName: "private_subnet",
          resourceType: "aws_subnet",
          terraformBlockType: "resource",
          values: {}
        }
      }),
      makeDiagramNode({
        id: "app-asg",
        label: "Application ASG",
        type: "aws_autoscaling_group",
        parameters: {
          fileName: "compute",
          resourceName: "app_asg",
          resourceType: "aws_autoscaling_group",
          terraformBlockType: "resource",
          values: {}
        }
      }),
      makeDiagramNode({
        id: "app-instance",
        label: "Application Instance",
        type: "aws_instance",
        parameters: {
          fileName: "compute",
          resourceName: "app_instance",
          resourceType: "aws_instance",
          terraformBlockType: "resource",
          values: {}
        }
      })
    ],
    edges: [
      {
        id: "subnet-binds-instance",
        sourceNodeId: "private-subnet",
        targetNodeId: "app-instance",
        label: "binds"
      },
      {
        id: "asg-manages-instance",
        sourceNodeId: "app-asg",
        targetNodeId: "app-instance",
        label: "manages"
      }
    ],
    viewport: { x: 12, y: 24, zoom: 0.75 }
  };

  const result = normalizeDiagramJsonConventions(diagramJson);
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));

  assert.equal(isAreaNode(nodeById.get("private-subnet")!), true);
  assert.equal(isAreaNode(nodeById.get("app-asg")!), false);
  assert.deepEqual(result.edges.map((edge) => edge.id), ["asg-manages-instance"]);
  assert.deepEqual(result.viewport, diagramJson.viewport);
});

test("normalizeDiagramJsonConventions adds one reusable external flow to exact Q diagrams", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeDiagramNode({
        id: "public-api",
        label: "Public API",
        type: "aws_apigatewayv2_api",
        parameters: {
          fileName: "api",
          resourceName: "public_api",
          resourceType: "aws_apigatewayv2_api",
          terraformBlockType: "resource",
          values: { protocolType: "HTTP" }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const once = normalizeDiagramJsonConventions(diagramJson);
  const twice = normalizeDiagramJsonConventions(once);

  assert.deepEqual(
    twice.nodes
      .filter((node) => node.kind === "design")
      .map((node) => ({ id: node.id, type: node.type })),
    [
      { id: "flow-user-client", type: "sketchcatch_user_client" },
      { id: "flow-internet", type: "sketchcatch_internet" }
    ]
  );
  assert.deepEqual(
    twice.edges.map((edge) => ({ sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId })),
    [
      { sourceNodeId: "flow-user-client", targetNodeId: "flow-internet" },
      { sourceNodeId: "flow-internet", targetNodeId: "public-api" }
    ]
  );
});

test("normalizeDiagramJsonConventions upgrades stored subnet placement labels", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeDiagramNode({
        id: "placement-ecs-a",
        kind: "design",
        label: "Fargate task 1",
        type: "sketchcatch_subnet_placement"
      }),
      makeDiagramNode({
        id: "placement-db-a",
        kind: "design",
        label: "RDS primary",
        type: "sketchcatch_subnet_placement"
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const normalized = normalizeDiagramJsonConventions(diagramJson);

  assert.deepEqual(
    normalized.nodes.map((node) => node.label),
    ["Fargate task placement A", "RDS primary (Multi-AZ)"]
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
  assert.equal(vpcNode?.position.x, 104);
  assert.equal(vpcNode?.position.y, 104);
  assert.equal(vpcNode?.size.width, 420);
  assert.equal(vpcNode?.size.height, 280);
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
  const parentByNodeId = new Map(diagramJson.nodes.map((node) => [node.id, node.metadata?.parentAreaNodeId]));

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
  const parentByNodeId = new Map(diagramJson.nodes.map((node) => [node.id, node.metadata?.parentAreaNodeId]));

  assert.equal(parentByNodeId.get("server-storage-az"), "network-main");
  assert.equal(parentByNodeId.get("network-main"), "server-storage-region");
  assert.equal(parentByNodeId.get("public-a"), "server-storage-az");
  assert.equal(parentByNodeId.get("web-server"), "public-a");
});

test("convertArchitectureJsonToDiagramJson creates one area per Availability Zone and keeps subnet-backed resources in the VPC", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 80,
        positionY: 320,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      {
        id: "public-subnet-a",
        type: "SUBNET",
        label: "Public Subnet A",
        positionX: 160,
        positionY: 500,
        config: {
          availabilityZone: "ap-northeast-2a",
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "public-subnet-b",
        type: "SUBNET",
        label: "Public Subnet B",
        positionX: 760,
        positionY: 500,
        config: {
          availabilityZone: "ap-northeast-2b",
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "private-db-subnet-a",
        type: "SUBNET",
        label: "Private DB Subnet A",
        positionX: 160,
        positionY: 820,
        config: {
          availabilityZone: "ap-northeast-2a",
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "private-db-subnet-b",
        type: "SUBNET",
        label: "Private DB Subnet B",
        positionX: 760,
        positionY: 820,
        config: {
          availabilityZone: "ap-northeast-2b",
          vpcId: "aws_vpc.vpc_main.id"
        }
      },
      {
        id: "app-server-a",
        type: "EC2",
        label: "App Server A",
        positionX: 220,
        positionY: 660,
        config: { subnetId: "aws_subnet.public_subnet_a.id" }
      },
      {
        id: "app-server-b",
        type: "EC2",
        label: "App Server B",
        positionX: 820,
        positionY: 660,
        config: { subnetId: "aws_subnet.public_subnet_b.id" }
      },
      {
        id: "application-load-balancer",
        type: "LOAD_BALANCER",
        label: "Application Load Balancer",
        positionX: 520,
        positionY: 420,
        config: {
          subnets: [
            "aws_subnet.public_subnet_a.id",
            "aws_subnet.public_subnet_b.id"
          ]
        }
      },
      {
        id: "db-subnet-group",
        type: "DB_SUBNET_GROUP",
        label: "DB Subnet Group",
        positionX: 520,
        positionY: 860,
        config: {
          subnetIds: [
            "aws_subnet.private_db_subnet_a.id",
            "aws_subnet.private_db_subnet_b.id"
          ]
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const azNodes = diagramJson.nodes.filter(
    (node) => node.parameters?.resourceType === "aws_availability_zone"
  );

  assert.equal(azNodes.length, 2);
  assert.deepEqual(
    new Set(azNodes.map((node) => node.parameters?.values?.["awsAvailabilityZone"])),
    new Set(["ap-northeast-2a", "ap-northeast-2b"])
  );
  assert.deepEqual(
    new Set(azNodes.map((node) => node.parameters?.resourceName)),
    new Set(["az_ap_northeast_2a", "az_ap_northeast_2b"])
  );
  assert.notEqual(
    nodeById.get("public-subnet-a")?.metadata?.parentAreaNodeId,
    nodeById.get("public-subnet-b")?.metadata?.parentAreaNodeId
  );
  assert.equal(
    nodeById.get("application-load-balancer")?.metadata?.parentAreaNodeId,
    "vpc-main"
  );
  assert.equal(nodeById.get("db-subnet-group")?.metadata?.parentAreaNodeId, "vpc-main");
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("application-load-balancer"));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("db-subnet-group"));
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
    diagramJson.nodes.map((node) => ({ id: node.id, parentAreaNodeId: node.metadata?.parentAreaNodeId })),
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
  assertContainsNode(nodeById.get("subnet-app"), nodeById.get("ec2-api"));
  assert.deepEqual(diagramJson.edges.map((edge) => edge.id), ["sg-to-ec2"]);
});

test("convertArchitectureJsonToDiagramJson keeps EC2 instances in their explicit subnets when they share a security group", () => {
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
        id: "subnet-app-a",
        type: "SUBNET",
        label: "Private App Subnet A",
        positionX: 140,
        positionY: 150,
        config: { cidrBlock: "10.0.1.0/24", vpcId: "vpc-main", terraformResourceName: "private_app_a" }
      },
      {
        id: "subnet-app-b",
        type: "SUBNET",
        label: "Private App Subnet B",
        positionX: 140,
        positionY: 350,
        config: { cidrBlock: "10.0.2.0/24", vpcId: "vpc-main", terraformResourceName: "private_app_b" }
      },
      {
        id: "sg-app",
        type: "SECURITY_GROUP",
        label: "App Security Group",
        positionX: 220,
        positionY: 190,
        config: { vpcId: "vpc-main" }
      },
      {
        id: "ec2-a",
        type: "EC2",
        label: "API Server A",
        positionX: 300,
        positionY: 190,
        config: { subnetId: "aws_subnet.private_app_a.id", securityGroupIds: ["sg-app"] }
      },
      {
        id: "ec2-b",
        type: "EC2",
        label: "API Server B",
        positionX: 300,
        positionY: 390,
        config: { subnetId: "aws_subnet.private_app_b.id", securityGroupIds: ["sg-app"] }
      },
      {
        id: "ec2-c",
        type: "EC2",
        label: "API Server C",
        positionX: 440,
        positionY: 390,
        config: { subnetId: "aws_subnet.private_app_b.id", securityGroupIds: ["sg-app"] }
      }
    ],
    edges: [
      { id: "subnet-a-to-ec2-a", sourceId: "subnet-app-a", targetId: "ec2-a", label: "hosts" },
      { id: "subnet-b-to-ec2-b", sourceId: "subnet-app-b", targetId: "ec2-b", label: "hosts" },
      { id: "subnet-b-to-ec2-c", sourceId: "subnet-app-b", targetId: "ec2-c", label: "hosts" }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const parentByNodeId = new Map(diagramJson.nodes.map((node) => [node.id, node.metadata?.parentAreaNodeId]));
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));

  assert.equal(parentByNodeId.get("sg-app"), "vpc-main");
  assert.equal(parentByNodeId.get("ec2-a"), "subnet-app-a");
  assert.equal(parentByNodeId.get("ec2-b"), "subnet-app-b");
  assert.equal(parentByNodeId.get("ec2-c"), "subnet-app-b");
  assertContainsNode(nodeById.get("subnet-app-a"), nodeById.get("ec2-a"));
  assertContainsNode(nodeById.get("subnet-app-b"), nodeById.get("ec2-b"));
  assertContainsNode(nodeById.get("subnet-app-b"), nodeById.get("ec2-c"));
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
          route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "aws_internet_gateway.internet_gateway.id" }],
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
    diagramJson.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => ({
        id: node.id,
        resourceType: node.parameters?.resourceType,
        terraformBlockType: node.parameters?.terraformBlockType
      })),
    [
      { id: "api-gateway", resourceType: "aws_api_gateway_rest_api", terraformBlockType: "resource" },
      { id: "lambda-execution-role", resourceType: "aws_iam_role", terraformBlockType: "resource" },
      { id: "lambda-execution-policy", resourceType: "aws_iam_policy", terraformBlockType: "resource" },
      { id: "api-instance-profile", resourceType: "aws_iam_instance_profile", terraformBlockType: "resource" },
      { id: "db-encryption-key", resourceType: "aws_kms_key", terraformBlockType: "resource" },
      { id: "lambda-log-group", resourceType: "aws_cloudwatch_log_group", terraformBlockType: "resource" },
      { id: "lambda-error-alarm", resourceType: "aws_cloudwatch_metric_alarm", terraformBlockType: "resource" },
      { id: "lambda-invoke-permission", resourceType: "aws_lambda_permission", terraformBlockType: "resource" }
    ]
  );
});

test("convertArchitectureJsonToDiagramJson preserves authored serverless lanes while correcting collisions", () => {
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
      { id: "api-to-permission", sourceId: "api-gateway", targetId: "lambda-invoke-permission", label: "allows invoke" },
      { id: "permission-to-lambda", sourceId: "lambda-invoke-permission", targetId: "lambda-function", label: "invokes" },
      { id: "role-to-lambda", sourceId: "lambda-execution-role", targetId: "lambda-function", label: "execution role" },
      { id: "policy-to-role", sourceId: "lambda-execution-policy", targetId: "lambda-execution-role", label: "grants log access" },
      { id: "lambda-to-upload", sourceId: "lambda-function", targetId: "upload-bucket", label: "stores files" },
      { id: "kms-to-logs", sourceId: "lambda-log-key", targetId: "lambda-log-group", label: "encrypts logs" },
      { id: "lambda-to-logs", sourceId: "lambda-function", targetId: "lambda-log-group", label: "writes logs" },
      { id: "alarm-to-lambda", sourceId: "lambda-error-alarm", targetId: "lambda-function", label: "monitors errors" },
      { id: "cdn-to-assets", sourceId: "cdn-public-entry", targetId: "web-assets-bucket", label: "HTTPS" }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
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
  assert.deepEqual(apiGateway.position, { x: 40, y: 260 });
  assert.deepEqual(permission.position, { x: 300, y: 500 });
  assert.deepEqual(lambdaFunction.position, { x: 1100, y: 500 });
  assert.deepEqual(uploadBucket.position, { x: 1420, y: 400 });
  assert.deepEqual(logGroup.position, { x: 1740, y: 300 });
  assert.deepEqual(executionRole.position, { x: 300, y: 120 });
  assert.deepEqual(executionPolicy.position, { x: 1200, y: 120 });
  assert.deepEqual(errorAlarm.position, { x: 840, y: 500 });
  assert.deepEqual(cdn.position, { x: 650, y: 180 });
  assert.deepEqual(webAssets.position, { x: 980, y: 200 });
  assertNoSiblingNodeOverlap(diagramJson);
  assertNoEdgeRouteOverlap(diagramJson);
  assertNoEdgeLineOverlap(diagramJson);
});

test("convertArchitectureJsonToDiagramJson keeps mixed cloud authored layout bounded and routable", () => {
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
        config: { cidrBlock: "10.0.1.0/24", terraformResourceName: "private_app_a", vpcId: "aws_vpc.main.id" }
      },
      {
        id: "subnet-db-a",
        type: "SUBNET",
        label: "Private DB Subnet A",
        positionX: 160,
        positionY: 980,
        config: { cidrBlock: "10.0.2.0/24", terraformResourceName: "private_db_a", vpcId: "aws_vpc.main.id" }
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
      { id: "cdn-to-assets", sourceId: "cdn-public-entry", targetId: "bucket-web-assets", label: "HTTPS" },
      { id: "compute-to-upload", sourceId: "compute-app", targetId: "bucket-upload", label: "stores files" },
      { id: "compute-to-db", sourceId: "compute-app", targetId: "db-app", label: "reads/writes" },
      { id: "profile-to-compute", sourceId: "profile-app", targetId: "compute-app", label: "attaches profile" },
      { id: "policy-to-role", sourceId: "policy-app-runtime", targetId: "role-app-runtime", label: "grants runtime access" },
      { id: "key-to-logs", sourceId: "key-data-encryption", targetId: "logs-app", label: "encrypts logs" },
      { id: "compute-to-logs", sourceId: "compute-app", targetId: "logs-app", label: "writes logs" },
      { id: "alarm-to-compute", sourceId: "alarm-app-cpu", targetId: "compute-app", label: "monitors CPU" },
      { id: "alarm-to-db", sourceId: "alarm-db-cpu", targetId: "db-app", label: "monitors CPU" }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const bounds = getDiagramBounds(diagramJson.nodes);

  assert.ok(bounds.width <= 1900, `Expected bounded width, received ${bounds.width}`);
  assert.ok(bounds.height <= 1560, `Expected compact height, received ${bounds.height}`);
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
  assertContainsNode(subnetNode, instanceNode);
  assert.deepEqual(regionNode?.parameters?.values, {
    awsRegion: "ap-northeast-2"
  });
  assert.deepEqual(azNode?.parameters?.values, {
    awsAvailabilityZone: "ap-northeast-2a"
  });
  assert.equal(regionNode?.parameters?.resourceName, "region_ap_northeast_2");
  assert.equal(azNode?.parameters?.resourceName, "az_ap_northeast_2a");
  assert.ok((regionNode?.size.width ?? 0) <= 1100);
  assert.ok((regionNode?.size.height ?? 0) <= 1040);
  assert.ok((vpcNode?.size.width ?? 0) <= 1100);
  assert.ok((vpcNode?.size.height ?? 0) <= 780);
  assert.ok((azNode?.size.width ?? 0) <= 440);
  assert.ok((azNode?.size.height ?? 0) <= 700);
  assertNoSiblingNodeOverlap(diagramJson);
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
  assertStraddlesTopBoundary(nodeById.get("vpc-main"), nodeById.get("internet-gateway"));
  assertContainsNode(nodeById.get("public-subnet"), nodeById.get("app-server"));
});

test("convertArchitectureJsonToDiagramJson places Internet Gateway across the VPC boundary", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 200,
        positionY: 300,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      {
        id: "public-subnet-a",
        type: "SUBNET",
        label: "Public Subnet A",
        positionX: 320,
        positionY: 440,
        config: { cidrBlock: "10.0.1.0/24", vpcId: "aws_vpc.vpc_main.id" }
      },
      {
        id: "internet-gateway",
        type: "INTERNET_GATEWAY",
        label: "Internet Gateway",
        positionX: 360,
        positionY: 520,
        config: { vpcId: "aws_vpc.vpc_main.id" }
      },
      {
        id: "nat-gateway",
        type: "NAT_GATEWAY",
        label: "NAT Gateway",
        positionX: 380,
        positionY: 480,
        config: { subnetId: "aws_subnet.public_subnet_a.id" }
      }
    ],
    edges: []
  });
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const vpcNode = nodeById.get("vpc-main")!;
  const subnetNode = nodeById.get("public-subnet-a")!;
  const internetGatewayNode = nodeById.get("internet-gateway")!;
  const natGatewayNode = nodeById.get("nat-gateway")!;

  assert.equal(internetGatewayNode.metadata?.parentAreaNodeId, vpcNode.id);
  assertStraddlesTopBoundary(vpcNode, internetGatewayNode);
  assert.equal(natGatewayNode.metadata?.parentAreaNodeId, subnetNode.id);
  assertContainsNode(subnetNode, natGatewayNode);

  const normalizedDiagramJson = normalizeDiagramJsonConventions(diagramJson);
  const normalizedNodeById = new Map(normalizedDiagramJson.nodes.map((node) => [node.id, node]));

  assertStraddlesTopBoundary(
    normalizedNodeById.get("vpc-main"),
    normalizedNodeById.get("internet-gateway")
  );
  assertContainsNode(
    normalizedNodeById.get("public-subnet-a"),
    normalizedNodeById.get("nat-gateway")
  );
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
  const subnetNode = nodeById.get("public-subnet-a");
  const associationNode = nodeById.get("public-route-table-association");

  assert.equal(associationNode?.metadata?.parentAreaNodeId, "vpc-main");
  assert.ok(subnetNode, "Expected subnet node");
  assert.ok(associationNode, "Expected route table association node");
  assert.ok(
    associationNode.position.y > subnetNode.position.y + subnetNode.size.height,
    "Route table association should not stretch the subnet area downward"
  );
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

test("convertArchitectureJsonToDiagramJson represents areas only through containment", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 40,
        positionY: 40,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      {
        id: "private-subnet-a",
        type: "SUBNET",
        label: "Private Subnet A",
        positionX: 100,
        positionY: 140,
        config: { cidrBlock: "10.0.1.0/24", vpcId: "aws_vpc.vpc_main.id" }
      },
      {
        id: "app-asg",
        type: "AUTO_SCALING_GROUP",
        label: "Application ASG",
        positionX: 720,
        positionY: 140,
        config: { vpcZoneIdentifier: ["aws_subnet.private_subnet_a.id"] }
      },
      {
        id: "app-sg",
        type: "SECURITY_GROUP",
        label: "Application Security Group",
        positionX: 720,
        positionY: 300,
        config: { vpcId: "aws_vpc.vpc_main.id" }
      },
      {
        id: "app-instance",
        type: "EC2",
        label: "Application Instance",
        positionX: 300,
        positionY: 260,
        config: {
          subnetId: "aws_subnet.private_subnet_a.id",
          vpcSecurityGroupIds: ["aws_security_group.app_sg.id"]
        }
      },
      {
        id: "application-alb",
        type: "LOAD_BALANCER",
        label: "Application ALB",
        positionX: 720,
        positionY: 460,
        config: { subnets: ["aws_subnet.private_subnet_a.id"] }
      }
    ],
    edges: [
      {
        id: "subnet-hosts-alb",
        sourceId: "private-subnet-a",
        targetId: "application-alb",
        label: "hosts ALB"
      },
      {
        id: "subnet-routes-instance",
        sourceId: "private-subnet-a",
        targetId: "app-instance",
        label: "routes traffic"
      },
      {
        id: "asg-manages-instance",
        sourceId: "app-asg",
        targetId: "app-instance",
        label: "manages"
      },
      {
        id: "sg-protects-instance",
        sourceId: "app-sg",
        targetId: "app-instance",
        label: "protects"
      },
      {
        id: "alb-forwards-instance",
        sourceId: "application-alb",
        targetId: "app-instance",
        label: "forwards"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const areaNodeIds = new Set(diagramJson.nodes.filter(isAreaNode).map((node) => node.id));

  assert.equal(isAreaNode(nodeById.get("vpc-main")!), true);
  assert.equal(isAreaNode(nodeById.get("private-subnet-a")!), true);
  assert.equal(isAreaNode(nodeById.get("app-asg")!), false);
  assert.equal(isAreaNode(nodeById.get("app-sg")!), false);
  assert.ok(
    diagramJson.edges.every(
      (edge) => !areaNodeIds.has(edge.sourceNodeId) && !areaNodeIds.has(edge.targetNodeId)
    )
  );
  assert.deepEqual(
    diagramJson.edges.map((edge) => edge.id).sort(),
    [
      "alb-forwards-instance",
      "asg-manages-instance",
      "flow-internet-to-application-alb",
      "flow-user-to-internet",
      "sg-protects-instance"
    ]
  );
  assert.equal(nodeById.get("app-instance")?.metadata?.parentAreaNodeId, "private-subnet-a");
});

test("convertArchitectureJsonToDiagramJson adds external actors for public entry points", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "public-cdn",
        type: "CLOUDFRONT",
        label: "Public CDN",
        positionX: 520,
        positionY: 120,
        config: {}
      },
      {
        id: "public-alb",
        type: "LOAD_BALANCER",
        label: "Public ALB",
        positionX: 780,
        positionY: 300,
        config: { internal: false }
      },
      {
        id: "internal-alb",
        type: "LOAD_BALANCER",
        label: "Internal ALB",
        positionX: 780,
        positionY: 500,
        config: { internal: true }
      }
    ],
    edges: []
  });
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const userNode = nodeById.get("flow-user-client");
  const internetNode = nodeById.get("flow-internet");

  assert.equal(userNode?.kind, "design");
  assert.equal(userNode?.type, "sketchcatch_user_client");
  assert.equal(
    userNode?.iconUrl,
    "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg"
  );
  assert.equal(internetNode?.kind, "design");
  assert.equal(internetNode?.type, "sketchcatch_internet");
  assert.deepEqual(
    diagramJson.edges.map((edge) => ({
      label: edge.label,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId
    })),
    [
      {
        label: "internet access",
        sourceNodeId: "flow-user-client",
        targetNodeId: "flow-internet"
      },
      {
        label: "HTTPS requests",
        sourceNodeId: "flow-internet",
        targetNodeId: "public-cdn"
      }
    ]
  );
});

test("convertArchitectureJsonToDiagramJson shows Fargate and RDS placements inside every private subnet", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 200,
        positionY: 300,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      ...[
        ["public-a", "10.0.0.0/24", "public"],
        ["public-b", "10.0.1.0/24", "public"],
        ["private-app-a", "10.0.10.0/24", "private_app"],
        ["private-app-b", "10.0.11.0/24", "private_app"],
        ["private-db-a", "10.0.20.0/24", "private_db"],
        ["private-db-b", "10.0.21.0/24", "private_db"]
      ].map(([id, cidrBlock, tier], index) => ({
        id: id!,
        type: "SUBNET" as const,
        label: id!,
        positionX: 320 + (index % 2) * 300,
        positionY: 480 + Math.floor(index / 2) * 240,
        config: {
          cidrBlock,
          tier,
          vpcId: "aws_vpc.vpc_main.id"
        }
      })),
      {
        id: "application-alb",
        type: "LOAD_BALANCER",
        label: "Application Load Balancer",
        positionX: 900,
        positionY: 360,
        config: {
          internal: false,
          subnets: ["aws_subnet.public_a.id", "aws_subnet.public_b.id"]
        }
      },
      {
        id: "ecs-service",
        type: "ECS_SERVICE",
        label: "Fargate Application Service",
        positionX: 900,
        positionY: 520,
        config: {
          networkConfiguration: {
            subnets: [
              "aws_subnet.private_app_a.id",
              "aws_subnet.private_app_b.id"
            ]
          }
        }
      },
      {
        id: "db-subnet-group",
        type: "DB_SUBNET_GROUP",
        label: "DB Subnet Group",
        positionX: 900,
        positionY: 700,
        config: {
          subnetIds: ["aws_subnet.private_db_a.id", "aws_subnet.private_db_b.id"]
        }
      },
      {
        id: "app-database",
        type: "RDS",
        label: "Application Database",
        positionX: 1100,
        positionY: 700,
        config: {
          dbSubnetGroupName: "aws_db_subnet_group.db_subnet_group.name",
          multiAz: true
        }
      }
    ],
    edges: []
  });
  const placementNodes = diagramJson.nodes.filter(
    (node) => node.type === "sketchcatch_subnet_placement"
  );
  const placementParents = new Set(
    placementNodes.map((node) => node.metadata?.parentAreaNodeId)
  );

  assert.equal(placementNodes.length, 6);
  assert.deepEqual(
    placementParents,
    new Set(["public-a", "public-b", "private-app-a", "private-app-b", "private-db-a", "private-db-b"])
  );
  assert.deepEqual(
    placementNodes.map((node) => node.label).sort(),
    [
      "ALB node A",
      "ALB node B",
      "Fargate task placement A",
      "Fargate task placement B",
      "RDS primary (Multi-AZ)",
      "RDS standby (Multi-AZ)"
    ].sort()
  );

  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  for (const placementNode of placementNodes) {
    assertContainsNode(
      nodeById.get(placementNode.metadata?.parentAreaNodeId ?? ""),
      placementNode
    );
  }
});

test("convertArchitectureJsonToDiagramJson omits external actors for internal-only entry points", () => {
  const diagramJson = convertArchitectureJsonToDiagramJson({
    nodes: [
      {
        id: "internal-alb",
        type: "LOAD_BALANCER",
        label: "Internal ALB",
        positionX: 320,
        positionY: 240,
        config: { internal: true }
      }
    ],
    edges: []
  });

  assert.equal(
    diagramJson.nodes.some(
      (node) => node.type === "sketchcatch_user_client" || node.type === "sketchcatch_internet"
    ),
    false
  );
  assert.deepEqual(diagramJson.edges, []);
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
      makeSecurityGroupRuleNode({ cidrBlock: "0.0.0.0/0", fromPort: "22", id: "ssh-rule", label: "SSH Rule", resourceName: "ssh" }),
      makeSecurityGroupRuleNode({ cidrBlock: "10.0.0.0/16", fromPort: "70000", id: "invalid-port-rule", label: "Invalid Port Rule", resourceName: "invalid" })
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
  assert.ok(child.position.x >= parent.position.x, `${parent.id} should contain ${child.id} on the left edge`);
  assert.ok(child.position.y >= parent.position.y, `${parent.id} should contain ${child.id} on the top edge`);
  assert.ok(
    child.position.x + child.size.width <= parent.position.x + parent.size.width,
    `${parent.id} should contain ${child.id} on the right edge`
  );
  assert.ok(
    child.position.y + child.size.height <= parent.position.y + parent.size.height,
    `${parent.id} should contain ${child.id} on the bottom edge`
  );
}

function assertStraddlesTopBoundary(parent: DiagramNode | undefined, child: DiagramNode | undefined): void {
  assert.ok(parent, "Expected parent node to exist");
  assert.ok(child, "Expected child node to exist");
  assert.equal(
    child.position.x + child.size.width / 2,
    parent.position.x + parent.size.width / 2,
    `${child.id} should be centered on ${parent.id}`
  );
  assert.ok(child.position.y < parent.position.y, `${child.id} should extend above ${parent.id}`);
  assert.ok(
    child.position.y + child.size.height > parent.position.y,
    `${child.id} should extend inside ${parent.id}`
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

    if (
      !parentAreaNodeId ||
      node.kind !== "resource" ||
      isAreaNode(node) ||
      node.parameters?.resourceType === "aws_internet_gateway"
    ) {
      continue;
    }

    const parent = nodeById.get(parentAreaNodeId);

    if (!parent || !isAreaNode(parent)) {
      continue;
    }

    assert.ok(node.position.x - parent.position.x >= minimumInset, `${node.id} should stay inside ${parent.id} left boundary`);
    assert.ok(node.position.y - parent.position.y >= minimumInset, `${node.id} should stay inside ${parent.id} top boundary`);
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
    if (!isAreaNode(area)) {
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

    const segments = getTestRouteSegments(
      getTestNodeHandlePoint(sourceNode, edge.sourceHandleId ?? "handle-right"),
      getTestNodeHandlePoint(targetNode, edge.targetHandleId ?? "handle-left"),
      edge.sourceHandleId ?? "handle-right",
      edge.targetHandleId ?? "handle-left"
    );

    for (const node of diagramJson.nodes) {
      if (node.id === sourceNode.id || node.id === targetNode.id || node.kind !== "resource" || isAreaNode(node)) {
        continue;
      }

      const overlapLength = segments.reduce((total, segment) => total + getTestSegmentNodeOverlapLength(segment, node), 0);
      assert.ok(overlapLength <= 6, `${edge.id} should not route through ${node.id} (${overlapLength})`);
    }
  }
}

function assertNoEdgeLineOverlap(diagramJson: DiagramJson): void {
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
            (segmentTotal, rightSegment) => segmentTotal + getTestSegmentOverlapLength(leftSegment, rightSegment),
            0
          ),
        0
      );

      assert.ok(
        overlapLength <= 80,
        `${leftRoute.id} should not share a route segment with ${rightRoute.id} beyond the endpoint handle stub (${overlapLength})`
      );
      assert.equal(
        getTestRouteCrossingCount(leftRoute.segments, rightRoute.segments),
        0,
        `${leftRoute.id} should not cross ${rightRoute.id}`
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
            (segmentTotal, rightSegment) => segmentTotal + getTestSegmentOverlapLength(leftSegment, rightSegment),
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
    segments.push({ from: sourceExitPoint, to: targetExitPoint }, { from: targetExitPoint, to: targetPoint });
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

function getTestHandleStubPoint(point: DiagramNode["position"], handleId: string): DiagramNode["position"] {
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

function removeZeroLengthTestRouteSegments(segments: readonly TestRouteSegment[]): TestRouteSegment[] {
  return segments.filter((segment) => segment.from.x !== segment.to.x || segment.from.y !== segment.to.y);
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

function getTestSegmentNodeOverlapLength(segment: TestRouteSegment, node: DiagramNode): number {
  const horizontal = segment.from.y === segment.to.y;
  const vertical = segment.from.x === segment.to.x;

  if (!horizontal && !vertical) {
    return 0;
  }

  const padding = 18;
  const left = node.position.x - padding;
  const right = node.position.x + node.size.width + padding;
  const top = node.position.y - padding;
  const bottom = node.position.y + node.size.height + padding;

  if (horizontal) {
    const y = segment.from.y;

    if (y <= top || y >= bottom) {
      return 0;
    }

    const segmentLeft = Math.min(segment.from.x, segment.to.x);
    const segmentRight = Math.max(segment.from.x, segment.to.x);

    return Math.max(0, Math.min(segmentRight, right) - Math.max(segmentLeft, left));
  }

  const x = segment.from.x;

  if (x <= left || x >= right) {
    return 0;
  }

  const segmentTop = Math.min(segment.from.y, segment.to.y);
  const segmentBottom = Math.max(segment.from.y, segment.to.y);

  return Math.max(0, Math.min(segmentBottom, bottom) - Math.max(segmentTop, top));
}

function getTestSegmentOverlapLength(leftSegment: TestRouteSegment, rightSegment: TestRouteSegment): number {
  const leftHorizontal = leftSegment.from.y === leftSegment.to.y;
  const rightHorizontal = rightSegment.from.y === rightSegment.to.y;
  const leftVertical = leftSegment.from.x === leftSegment.to.x;
  const rightVertical = rightSegment.from.x === rightSegment.to.x;

  if (leftHorizontal && rightHorizontal && Math.abs(leftSegment.from.y - rightSegment.from.y) <= 1) {
    return getTestRangeOverlapLength(leftSegment.from.x, leftSegment.to.x, rightSegment.from.x, rightSegment.to.x);
  }

  if (leftVertical && rightVertical && Math.abs(leftSegment.from.x - rightSegment.from.x) <= 1) {
    return getTestRangeOverlapLength(leftSegment.from.y, leftSegment.to.y, rightSegment.from.y, rightSegment.to.y);
  }

  return 0;
}

function getTestRouteCrossingCount(
  leftSegments: readonly TestRouteSegment[],
  rightSegments: readonly TestRouteSegment[]
): number {
  return leftSegments.reduce(
    (total, leftSegment) =>
      total +
      rightSegments.reduce(
        (segmentTotal, rightSegment) => segmentTotal + (doTestSegmentsCross(leftSegment, rightSegment) ? 1 : 0),
        0
      ),
    0
  );
}

function doTestSegmentsCross(leftSegment: TestRouteSegment, rightSegment: TestRouteSegment): boolean {
  const leftHorizontal = leftSegment.from.y === leftSegment.to.y;
  const rightHorizontal = rightSegment.from.y === rightSegment.to.y;

  if (leftHorizontal === rightHorizontal) {
    return false;
  }

  const horizontalSegment = leftHorizontal ? leftSegment : rightSegment;
  const verticalSegment = leftHorizontal ? rightSegment : leftSegment;
  const horizontalY = horizontalSegment.from.y;
  const verticalX = verticalSegment.from.x;
  const horizontalLeft = Math.min(horizontalSegment.from.x, horizontalSegment.to.x);
  const horizontalRight = Math.max(horizontalSegment.from.x, horizontalSegment.to.x);
  const verticalTop = Math.min(verticalSegment.from.y, verticalSegment.to.y);
  const verticalBottom = Math.max(verticalSegment.from.y, verticalSegment.to.y);

  return (
    verticalX > horizontalLeft &&
    verticalX < horizontalRight &&
    horizontalY > verticalTop &&
    horizontalY < verticalBottom
  );
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
