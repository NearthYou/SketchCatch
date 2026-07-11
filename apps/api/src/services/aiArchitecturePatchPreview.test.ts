import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson, ResourceType } from "@sketchcatch/types";
import { createArchitecturePatchPreview } from "./aiArchitecturePatchPreview.js";

test("createArchitecturePatchPreview asks for a target when multiple resources match", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "logs-bucket", type: "S3", label: "Logs Bucket" })
      ],
      edges: []
    },
    instruction: "delete the S3 bucket"
  });

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.intent.requestedAction, "remove_resource");
  assert.deepEqual(
    response.candidates.map((candidate) => candidate.resourceId),
    ["assets-bucket", "logs-bucket"]
  );
  assert.match(response.question, /어떤 리소스/);
});

test("createArchitecturePatchPreview asks what manual-review instructions should change", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" })
      ],
      edges: []
    },
    instruction: "make it better"
  });

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.intent.requestedAction, "manual_review");
  assert.deepEqual(response.suggestions, [
    "로그인 있는 작은 웹서비스로 확장해줘",
    "파일 업로드가 되는 서비스로 확장해줘",
    "예약이나 신청을 받는 서비스로 확장해줘",
    "정적 소개 웹사이트로 정리해줘"
  ]);
  assert.match(response.question, /어떤 서비스/);
  assert.deepEqual(response.candidates, []);
});

test("createArchitecturePatchPreview removes the selected target and connected edges in the proposed preview", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "logs-bucket", type: "S3", label: "Logs Bucket" })
      ],
      edges: [
        {
          id: "app-to-assets",
          sourceId: "app-server",
          targetId: "assets-bucket",
          label: "stores uploads"
        },
        {
          id: "app-to-logs",
          sourceId: "app-server",
          targetId: "logs-bucket",
          label: "writes logs"
        }
      ]
    },
    instruction: "delete the S3 bucket",
    selectedTargetResourceId: "assets-bucket"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.changes.map((change) => ({
      action: change.action,
      resourceId: change.resourceId,
      resourceType: change.resourceType
    })),
    [
      {
        action: "remove_resource",
        resourceId: "assets-bucket",
        resourceType: "S3"
      }
    ]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => node.id),
    ["app-server", "logs-bucket"]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.edges.map((edge) => edge.id),
    ["app-to-logs"]
  );
});

test("createArchitecturePatchPreview recognizes broad natural-language add requests", () => {
  const addCases: readonly { readonly instruction: string; readonly resourceType: ResourceType }[] = [
    { instruction: "네트워크 하나 추가해줘", resourceType: "VPC" },
    { instruction: "데이터 저장 공간 추가", resourceType: "RDS" },
    { instruction: "파일 저장 공간 추가", resourceType: "S3" },
    { instruction: "보안 설정 추가", resourceType: "SECURITY_GROUP" },
    { instruction: "API 입구 추가", resourceType: "API_GATEWAY_REST_API" },
    { instruction: "여기에 데이터베이스 하나 추가해줘", resourceType: "RDS" },
    { instruction: "스토리지 버킷도 넣어줘", resourceType: "S3" },
    { instruction: "웹 서버 인스턴스 만들어줘", resourceType: "EC2" },
    { instruction: "보안 그룹 하나 붙여줘", resourceType: "SECURITY_GROUP" },
    { instruction: "서브넷 추가해줘", resourceType: "SUBNET" },
    { instruction: "라우트 테이블 생성해줘", resourceType: "ROUTE_TABLE" },
    { instruction: "라우트 테이블 연결도 추가해줘", resourceType: "ROUTE_TABLE_ASSOCIATION" },
    { instruction: "인터넷 게이트웨이 추가해줘", resourceType: "INTERNET_GATEWAY" },
    { instruction: "cdn 추가해줘", resourceType: "CLOUDFRONT" },
    { instruction: "람다 함수 만들어줘", resourceType: "LAMBDA" },
    { instruction: "ami 이미지 추가해줘", resourceType: "AMI" },
    { instruction: "api gateway 추가해줘", resourceType: "API_GATEWAY_REST_API" },
    { instruction: "iam role 만들어줘", resourceType: "IAM_ROLE" },
    { instruction: "kms 키 추가해줘", resourceType: "KMS_KEY" },
    { instruction: "인스턴스 프로파일 추가해줘", resourceType: "IAM_INSTANCE_PROFILE" },
    { instruction: "cloudwatch 로그 그룹 추가해줘", resourceType: "CLOUDWATCH_LOG_GROUP" },
    { instruction: "알람 추가해줘", resourceType: "CLOUDWATCH_METRIC_ALARM" },
    { instruction: "람다 권한 추가해줘", resourceType: "LAMBDA_PERMISSION" }
  ];

  for (const addCase of addCases) {
    const response = createArchitecturePatchPreview({
      architectureJson: {
        nodes: [makeNode({ id: "app-server", type: "EC2", label: "App Server" })],
        edges: []
      },
      instruction: addCase.instruction,
      skipConnection: true
    });

    assert.equal(response.status, "preview", addCase.instruction);
    assert.equal(response.changes[0]?.action, "add_resource", addCase.instruction);
    assert.equal(response.changes[0]?.resourceType, addCase.resourceType, addCase.instruction);
    assert.equal(response.proposedArchitectureJson.nodes.at(-1)?.type, addCase.resourceType, addCase.instruction);
  }
});

test("createArchitecturePatchPreview treats colloquial NAT attachment as a connected patch", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({
          id: "vpc-main",
          type: "VPC",
          label: "Main VPC",
          config: { cidrBlock: "10.0.0.0/16" }
        }),
        makeNode({
          id: "public-subnet-a",
          type: "SUBNET",
          label: "Public Subnet A",
          config: { mapPublicIpOnLaunch: true, tier: "public" }
        }),
        makeNode({
          id: "private-subnet-a",
          type: "SUBNET",
          label: "Private Subnet A",
          config: { mapPublicIpOnLaunch: false, tier: "private_app" }
        })
      ],
      edges: []
    },
    instruction: "NAT 게이트웨이 여기에 붙이렴"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.intent.requestedAction, "add_resource");
  assert.equal(response.intent.resourceType, "NAT_GATEWAY");
  if (response.status !== "preview") {
    return;
  }

  const eip = response.proposedArchitectureJson.nodes.find((node) => node.type === "ELASTIC_IP");
  const nat = response.proposedArchitectureJson.nodes.find((node) => node.type === "NAT_GATEWAY");
  assert.ok(eip);
  assert.ok(nat);
  assert.equal(nat.config.subnetId, "aws_subnet.public_subnet_a.id");
  assert.equal(nat.config.allocationId, `aws_eip.${eip.id.replaceAll("-", "_")}.id`);
  assert.ok(
    response.proposedArchitectureJson.edges.some(
      (edge) => edge.sourceId === "public-subnet-a" && edge.targetId === nat.id
    )
  );
  assert.ok(
    response.proposedArchitectureJson.edges.some(
      (edge) => edge.sourceId === eip.id && edge.targetId === nat.id
    )
  );
});

test("createArchitecturePatchPreview recognizes catalog-backed resource panel add requests", () => {
  const addCases: readonly {
    readonly instruction: string;
    readonly resourceType: ResourceType;
    readonly terraformBlockType?: "data";
    readonly terraformResourceType: string;
  }[] = [
    {
      instruction: "ECS Service 추가해줘",
      resourceType: "ECS_SERVICE",
      terraformResourceType: "aws_ecs_service"
    },
    {
      instruction: "CodeBuild Project 추가해줘",
      resourceType: "CODEBUILD_PROJECT",
      terraformResourceType: "aws_codebuild_project"
    },
    {
      instruction: "SSM Parameter 추가해줘",
      resourceType: "SSM_PARAMETER",
      terraformBlockType: "data",
      terraformResourceType: "aws_ssm_parameter"
    },
    {
      instruction: "S3 Bucket Policy 추가해줘",
      resourceType: "S3",
      terraformResourceType: "aws_s3_bucket_policy"
    }
  ];

  for (const addCase of addCases) {
    const response = createArchitecturePatchPreview({
      architectureJson: {
        nodes: [makeNode({ id: "app-server", type: "EC2", label: "App Server" })],
        edges: []
      },
      instruction: addCase.instruction,
      skipConnection: true
    });

    assert.equal(response.status, "preview", addCase.instruction);
    assert.equal(response.changes[0]?.resourceType, addCase.resourceType, addCase.instruction);
    assert.equal(response.proposedArchitectureJson.nodes.at(-1)?.type, addCase.resourceType, addCase.instruction);
    assert.equal(
      response.proposedArchitectureJson.nodes.at(-1)?.config["terraformResourceType"],
      addCase.terraformResourceType,
      addCase.instruction
    );

    if (addCase.terraformBlockType) {
      assert.equal(
        response.proposedArchitectureJson.nodes.at(-1)?.config["terraformBlockType"],
        addCase.terraformBlockType,
        addCase.instruction
      );
    }
  }
});

test("createArchitecturePatchPreview asks how to use a new resource before previewing it", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" })
      ],
      edges: []
    },
    instruction: "데이터베이스 하나 추가해줘"
  });

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.intent.requestedAction, "add_resource");
  assert.equal(response.intent.resourceType, "RDS");
  assert.match(response.question, /어떤 용도/);
  assert.deepEqual(response.candidates, []);
  assert.deepEqual(response.suggestions, [
    "로그인/회원 데이터를 저장할래",
    "주문이나 예약 데이터를 저장할래",
    "기존 서버가 읽고 쓰는 서비스 DB로 쓸래"
  ]);
});

test("createArchitecturePatchPreview auto-connects a purposeful storage addition to the app server", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "app-db", type: "RDS", label: "App Database" })
      ],
      edges: []
    },
    instruction: "스토리지 버킷도 넣어줘\n사용자 업로드 파일을 저장할래"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.changes[0]?.action, "add_resource");
  assert.equal(response.changes[0]?.resourceType, "S3");
  assert.equal(response.proposedArchitectureJson.nodes.at(-1)?.label, "S3 Bucket");
  assert.deepEqual(response.proposedArchitectureJson.edges, [
    {
      id: "app-server-to-s3-3",
      sourceId: "app-server",
      targetId: "s3-3",
      label: "uses S3 Bucket"
    }
  ]);
});

test("createArchitecturePatchPreview turns a service-purpose answer into a concrete resource patch", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [makeNode({ id: "app-server", type: "EC2", label: "App Server" })],
      edges: []
    },
    instruction: "로그인 있는 작은 웹서비스로 확장해줘"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.intent.requestedAction, "add_resource");
  assert.equal(response.intent.resourceType, "RDS");
  assert.equal(response.proposedArchitectureJson.nodes.at(-1)?.label, "RDS Database");
  assert.deepEqual(response.proposedArchitectureJson.edges, [
    {
      id: "app-server-to-rds-2",
      sourceId: "app-server",
      targetId: "rds-2",
      label: "uses RDS Database"
    }
  ]);
});

test("createArchitecturePatchPreview adds EC2 as a container-based runtime bundle", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" })],
      edges: []
    },
    instruction: "ec2 \uCD94\uAC00\uD574\uC918"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => node.type),
    ["S3", "VPC", "SUBNET", "SECURITY_GROUP", "AMI", "EC2"]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.edges.map((edge) => ({
      label: edge.label,
      sourceId: edge.sourceId,
      targetId: edge.targetId
    })),
    [
      { label: "contains", sourceId: "vpc-2", targetId: "subnet-3" },
      { label: "allows traffic", sourceId: "security-group-4", targetId: "ec2-6" },
      { label: "launch image", sourceId: "ami-5", targetId: "ec2-6" },
      { label: "hosts runtime", sourceId: "subnet-3", targetId: "ec2-6" },
      { label: "uses Assets Bucket", sourceId: "ec2-6", targetId: "assets-bucket" }
    ]
  );
  assert.deepEqual(response.proposedArchitectureJson.nodes.at(-1)?.config, {
    ami: "data.aws_ami.ami_5.id",
    associatePublicIpAddress: true,
    instanceType: "t3.micro",
    subnetId: "aws_subnet.subnet_3.id",
    vpcSecurityGroupIds: ["aws_security_group.security_group_4.id"]
  });
});

test("createArchitecturePatchPreview preserves existing S3 and EC2 when reorganizing as a static intro site", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "app-server", type: "EC2", label: "App Server" })
      ],
      edges: []
    },
    instruction: "\uC815\uC801 \uC18C\uAC1C \uC6F9\uC0AC\uC774\uD2B8\uB85C \uC815\uB9AC\uD574\uC918"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => ({ id: node.id, type: node.type })),
    [
      { id: "assets-bucket", type: "S3" },
      { id: "app-server", type: "EC2" },
      { id: "cloudfront-3", type: "CLOUDFRONT" }
    ]
  );
  assert.deepEqual(response.proposedArchitectureJson.edges, [
    {
      id: "cloudfront-3-to-assets-bucket",
      sourceId: "cloudfront-3",
      targetId: "assets-bucket",
      label: "uses Assets Bucket"
    }
  ]);
});

test("createArchitecturePatchPreview keeps upload runtime resources when adding static site delivery", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "upload-server", type: "EC2", label: "Upload Server" }),
        makeNode({ id: "upload-bucket", type: "S3", label: "Upload Bucket" })
      ],
      edges: [
        {
          id: "upload-server-to-upload-bucket",
          sourceId: "upload-server",
          targetId: "upload-bucket",
          label: "stores uploads"
        }
      ]
    },
    instruction: "\uC815\uC801 \uC18C\uAC1C \uC6F9\uC0AC\uC774\uD2B8\uB85C \uC815\uB9AC\uD574\uC918"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => ({ id: node.id, type: node.type })),
    [
      { id: "upload-server", type: "EC2" },
      { id: "upload-bucket", type: "S3" },
      { id: "cloudfront-3", type: "CLOUDFRONT" }
    ]
  );
  assert.deepEqual(response.proposedArchitectureJson.edges, [
    {
      id: "upload-server-to-upload-bucket",
      sourceId: "upload-server",
      targetId: "upload-bucket",
      label: "stores uploads"
    },
    {
      id: "cloudfront-3-to-upload-bucket",
      sourceId: "cloudfront-3",
      targetId: "upload-bucket",
      label: "uses Upload Bucket"
    }
  ]);
});

test("createArchitecturePatchPreview keeps login runtime resources when adding static site delivery", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "app-database", type: "RDS", label: "App Database" })
      ],
      edges: [
        {
          id: "app-server-to-app-database",
          sourceId: "app-server",
          targetId: "app-database",
          label: "uses database"
        }
      ]
    },
    instruction: "\uC815\uC801 \uC18C\uAC1C \uC6F9\uC0AC\uC774\uD2B8\uB85C \uC815\uB9AC\uD574\uC918"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => ({ id: node.id, type: node.type })),
    [
      { id: "app-server", type: "EC2" },
      { id: "app-database", type: "RDS" },
      { id: "s3-3", type: "S3" },
      { id: "cloudfront-4", type: "CLOUDFRONT" }
    ]
  );
  assert.deepEqual(response.proposedArchitectureJson.edges, [
    {
      id: "app-server-to-app-database",
      sourceId: "app-server",
      targetId: "app-database",
      label: "uses database"
    },
    {
      id: "app-server-to-s3-3",
      sourceId: "app-server",
      targetId: "s3-3",
      label: "uses S3 Bucket"
    },
    {
      id: "cloudfront-4-to-s3-3",
      sourceId: "cloudfront-4",
      targetId: "s3-3",
      label: "uses S3 Bucket"
    }
  ]);
});

test("createArchitecturePatchPreview adds connected resources with English labels", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [makeNode({ id: "app-server", type: "EC2", label: "App Server" })],
      edges: []
    },
    instruction: "데이터베이스 하나 추가해줘",
    connectionTargetResourceId: "app-server"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.proposedArchitectureJson.nodes.at(-1)?.label, "RDS Database");
  assert.deepEqual(response.proposedArchitectureJson.edges, [
    {
      id: "app-server-to-rds-2",
      sourceId: "app-server",
      targetId: "rds-2",
      label: "uses RDS Database"
    }
  ]);
});

test("createArchitecturePatchPreview can add an unconnected resource with an English label", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [makeNode({ id: "app-server", type: "EC2", label: "App Server" })],
      edges: []
    },
    instruction: "스토리지 버킷도 넣어줘",
    skipConnection: true
  });

  assert.equal(response.status, "preview");
  assert.equal(response.proposedArchitectureJson.nodes.at(-1)?.label, "S3 Bucket");
  assert.deepEqual(response.proposedArchitectureJson.edges, []);
});

test("createArchitecturePatchPreview can add and remove multiple resources in one request", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "legacy-cache", type: "CLOUDWATCH_LOG_GROUP", label: "Legacy Logs" }),
        makeNode({ id: "old-uploads", type: "S3", label: "Old Uploads" })
      ],
      edges: [
        {
          id: "app-to-old-uploads",
          sourceId: "app-server",
          targetId: "old-uploads",
          label: "stores old uploads"
        },
        {
          id: "app-to-legacy-cache",
          sourceId: "app-server",
          targetId: "legacy-cache",
          label: "writes old logs"
        }
      ]
    },
    instruction: "Legacy Logs와 Old Uploads는 삭제하고 데이터베이스와 파일 저장 공간을 추가해줘"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.changes.map((change) => ({
      action: change.action,
      resourceId: change.resourceId,
      resourceType: change.resourceType
    })),
    [
      {
        action: "remove_resource",
        resourceId: "legacy-cache",
        resourceType: "CLOUDWATCH_LOG_GROUP"
      },
      {
        action: "remove_resource",
        resourceId: "old-uploads",
        resourceType: "S3"
      },
      {
        action: "add_resource",
        resourceId: undefined,
        resourceType: "RDS"
      },
      {
        action: "add_resource",
        resourceId: undefined,
        resourceType: "S3"
      }
    ]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => node.id),
    ["app-server", "rds-2", "s3-3"]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.edges.map((edge) => ({
      sourceId: edge.sourceId,
      targetId: edge.targetId
    })),
    [
      { sourceId: "app-server", targetId: "rds-2" },
      { sourceId: "app-server", targetId: "s3-3" }
    ]
  );
});

test("createArchitecturePatchPreview can replace a whole VPC boundary with multiple new resources", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "vpc-main", type: "VPC", label: "Main VPC" }),
        makeNode({
          id: "public-subnet-a",
          type: "SUBNET",
          label: "Public Subnet A",
          config: { vpcId: "aws_vpc.vpc_main.id" }
        }),
        makeNode({
          id: "app-security-group",
          type: "SECURITY_GROUP",
          label: "App Security Group",
          config: { vpcId: "aws_vpc.vpc_main.id" }
        }),
        makeNode({
          id: "app-server",
          type: "EC2",
          label: "App Server",
          config: {
            subnetId: "aws_subnet.public_subnet_a.id",
            vpcSecurityGroupIds: ["aws_security_group.app_security_group.id"]
          }
        }),
        makeNode({
          id: "app-database",
          type: "RDS",
          label: "App Database",
          config: {
            subnetIds: ["aws_subnet.public_subnet_a.id"],
            vpcSecurityGroupIds: ["aws_security_group.app_security_group.id"]
          }
        }),
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" })
      ],
      edges: [
        {
          id: "vpc-to-subnet",
          sourceId: "vpc-main",
          targetId: "public-subnet-a"
        },
        {
          id: "subnet-to-app",
          sourceId: "public-subnet-a",
          targetId: "app-server"
        },
        {
          id: "sg-to-app",
          sourceId: "app-security-group",
          targetId: "app-server"
        },
        {
          id: "sg-to-db",
          sourceId: "app-security-group",
          targetId: "app-database"
        },
        {
          id: "app-to-assets",
          sourceId: "app-server",
          targetId: "assets-bucket"
        }
      ]
    },
    instruction: "Main VPC 안의 리소스를 통째로 삭제하고 새 VPC, 서브넷, 보안 설정, 서버, 데이터베이스를 추가해줘"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.changes.map((change) => ({
      action: change.action,
      resourceId: change.resourceId,
      resourceType: change.resourceType
    })),
    [
      { action: "remove_resource", resourceId: "vpc-main", resourceType: "VPC" },
      { action: "remove_resource", resourceId: "public-subnet-a", resourceType: "SUBNET" },
      { action: "remove_resource", resourceId: "app-security-group", resourceType: "SECURITY_GROUP" },
      { action: "remove_resource", resourceId: "app-server", resourceType: "EC2" },
      { action: "remove_resource", resourceId: "app-database", resourceType: "RDS" },
      { action: "add_resource", resourceId: undefined, resourceType: "VPC" },
      { action: "add_resource", resourceId: undefined, resourceType: "SUBNET" },
      { action: "add_resource", resourceId: undefined, resourceType: "SECURITY_GROUP" },
      { action: "add_resource", resourceId: undefined, resourceType: "EC2" },
      { action: "add_resource", resourceId: undefined, resourceType: "RDS" }
    ]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => node.id),
    ["assets-bucket", "vpc-2", "subnet-3", "security-group-4", "ami-5", "ec2-6", "rds-7"]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.edges.map((edge) => edge.id),
    [
      "vpc-2-to-subnet-3",
      "vpc-2-to-security-group-4",
      "security-group-4-to-ec2-6",
      "ami-5-to-ec2-6",
      "subnet-3-to-ec2-6",
      "ec2-6-to-assets-bucket",
      "ec2-6-to-rds-7"
    ]
  );
});

test("createArchitecturePatchPreview asks for the resource type when add requests are incomplete", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [makeNode({ id: "app-server", type: "EC2", label: "App Server" })],
      edges: []
    },
    instruction: "리소스를 하나 추가해줘"
  });

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.intent.requestedAction, "add_resource");
  assert.match(response.question, /무엇을 더 추가/);
  assert.deepEqual(response.suggestions, [
    "데이터 저장 공간",
    "파일 저장 공간",
    "서버",
    "보안 설정",
    "네트워크 공간",
    "API 입구",
    "추가 안 함"
  ]);
});

test("createArchitecturePatchPreview keeps the diagram unchanged when no resource addition is selected", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [makeNode({ id: "app-server", type: "EC2", label: "App Server" })],
    edges: []
  };

  for (const instruction of ["리소스를 하나 추가해줘\n추가 안 함", "아무것도 추가하지 마"]) {
    const response = createArchitecturePatchPreview({
      architectureJson,
      instruction
    });

    assert.equal(response.status, "preview", instruction);
    assert.equal(response.intent.requestedAction, "manual_review", instruction);
    assert.deepEqual(response.changes, [], instruction);
    assert.deepEqual(response.proposedArchitectureJson, architectureJson, instruction);
  }
});

test("createArchitecturePatchPreview resolves label-mentioned targets before asking a clarification", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "logs-bucket", type: "S3", label: "Logs Bucket" })
      ],
      edges: []
    },
    instruction: "logs bucket 지워줘"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(response.changes[0], {
    action: "remove_resource",
    resourceId: "logs-bucket",
    resourceType: "S3",
    summary: "Logs Bucket 리소스를 삭제합니다."
  });
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => node.id),
    ["assets-bucket"]
  );
});

test("createArchitecturePatchPreview replaces a targeted resource as remove plus add preview changes", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "logs-bucket", type: "S3", label: "Logs Bucket" })
      ],
      edges: [
        {
          id: "app-to-assets",
          sourceId: "app-server",
          targetId: "assets-bucket",
          label: "stores uploads"
        }
      ]
    },
    instruction: "assets bucket을 데이터베이스로 교체해줘"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.changes.map((change) => ({
      action: change.action,
      resourceId: change.resourceId,
      resourceType: change.resourceType
    })),
    [
      {
        action: "remove_resource",
        resourceId: "assets-bucket",
        resourceType: "S3"
      },
      {
        action: "add_resource",
        resourceId: undefined,
        resourceType: "RDS"
      }
    ]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => node.id),
    ["app-server", "logs-bucket", "rds-3"]
  );
  assert.deepEqual(response.proposedArchitectureJson.edges, [
    {
      id: "app-server-to-rds-3",
      sourceId: "app-server",
      targetId: "rds-3",
      label: "uses RDS Database"
    }
  ]);
});

test("createArchitecturePatchPreview replaces a label-only target when the source text has no resource type keyword", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "legacy-uploads", type: "S3", label: "Legacy Uploads" }),
        makeNode({ id: "app-server", type: "EC2", label: "App Server" })
      ],
      edges: []
    },
    instruction: "legacy uploads를 람다 함수로 바꿔줘"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.changes.map((change) => ({
      action: change.action,
      resourceId: change.resourceId,
      resourceType: change.resourceType
    })),
    [
      {
        action: "remove_resource",
        resourceId: "legacy-uploads",
        resourceType: "S3"
      },
      {
        action: "add_resource",
        resourceId: undefined,
        resourceType: "LAMBDA"
      }
    ]
  );
});

test("createArchitecturePatchPreview asks which resource to replace when the source target is ambiguous", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "logs-bucket", type: "S3", label: "Logs Bucket" })
      ],
      edges: []
    },
    instruction: "S3 버킷을 데이터베이스로 교체해줘"
  });

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.intent.requestedAction, "modify_resource");
  assert.deepEqual(
    response.candidates.map((candidate) => candidate.resourceId),
    ["assets-bucket", "logs-bucket"]
  );
  assert.match(response.question, /교체/);
});

test("createArchitecturePatchPreview modifies Korean target requests without falling back to manual review", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({
          id: "web-server",
          type: "EC2",
          label: "웹 서버",
          config: {
            instanceType: "t3.micro"
          }
        })
      ],
      edges: []
    },
    instruction: "웹 서버 인스턴스 타입을 t3.small로 바꿔줘"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.changes[0]?.action, "modify_resource");
  assert.equal(response.changes[0]?.resourceId, "web-server");
  assert.equal(response.proposedArchitectureJson.nodes[0]?.config.instanceType, "t3.small");
});

test("createArchitecturePatchPreview updates requested resource attributes without moving the node", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({
          id: "app-server",
          type: "EC2",
          label: "App Server",
          config: {
            instanceType: "t3.micro"
          },
          positionX: 240,
          positionY: 180
        })
      ],
      edges: []
    },
    instruction: "change the EC2 instance type to t3.small"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.changes[0]?.action, "modify_resource");
  assert.equal(response.changes[0]?.resourceId, "app-server");
  assert.deepEqual(response.proposedArchitectureJson.nodes[0], {
    id: "app-server",
    type: "EC2",
    label: "App Server",
    positionX: 240,
    positionY: 180,
    config: {
      instanceType: "t3.small"
    }
  });
});

test("createArchitecturePatchPreview updates Lambda runtime parameters as deployable config", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({
          id: "worker",
          type: "LAMBDA",
          label: "Worker Lambda",
          config: {
            memorySize: 128,
            timeout: 10,
            runtime: "nodejs18.x"
          }
        })
      ],
      edges: []
    },
    instruction: "change Lambda timeout to 30 seconds and memory to 512 MB"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.changes[0]?.action, "modify_resource");
  assert.equal(response.changes[0]?.resourceId, "worker");
  assert.deepEqual(response.proposedArchitectureJson.nodes[0]?.config, {
    memorySize: 512,
    timeout: 30,
    runtime: "nodejs18.x"
  });
});

test("createArchitecturePatchPreview updates storage and network parameters as deployable config", () => {
  const s3Response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({
          id: "assets",
          type: "S3",
          label: "Assets Bucket",
          config: {
            versioning: false
          }
        })
      ],
      edges: []
    },
    instruction: "enable versioning on the S3 bucket"
  });

  assert.equal(s3Response.status, "preview");
  assert.equal(s3Response.proposedArchitectureJson.nodes[0]?.config.versioning, true);

  const securityGroupResponse = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({
          id: "web-sg",
          type: "SECURITY_GROUP",
          label: "Web Security Group",
          config: {
            ingress: [{ protocol: "tcp", port: 80, cidr: "0.0.0.0/0" }]
          }
        })
      ],
      edges: []
    },
    instruction: "open port 443 on the security group"
  });

  assert.equal(securityGroupResponse.status, "preview");
  assert.deepEqual(securityGroupResponse.proposedArchitectureJson.nodes[0]?.config.ingress, [
    { protocol: "tcp", port: 80, cidr: "0.0.0.0/0" },
    { protocol: "tcp", port: 443, cidr: "0.0.0.0/0" }
  ]);
});

test("createArchitecturePatchPreview migrates an EC2 runtime path to serverless", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "alb", type: "LOAD_BALANCER", label: "Application Load Balancer" }),
        makeNode({ id: "asg", type: "AUTO_SCALING_GROUP", label: "Auto Scaling Group" }),
        makeNode({ id: "ami", type: "AMI", label: "Amazon Linux AMI" }),
        makeNode({ id: "app-server", type: "EC2", label: "App Server", positionX: 320 }),
        makeNode({ id: "db", type: "RDS", label: "App Database" }),
        makeNode({ id: "assets", type: "S3", label: "Assets Bucket" })
      ],
      edges: [
        { id: "alb-to-app", sourceId: "alb", targetId: "app-server", label: "routes traffic" },
        { id: "asg-to-app", sourceId: "asg", targetId: "app-server", label: "scales" },
        { id: "ami-to-app", sourceId: "ami", targetId: "app-server", label: "launch image" },
        { id: "app-to-db", sourceId: "app-server", targetId: "db", label: "uses database" },
        { id: "app-to-assets", sourceId: "app-server", targetId: "assets", label: "uses bucket" }
      ]
    },
    instruction: "convert the EC2 environment to serverless with API Gateway and Lambda"
  });

  assert.equal(response.status, "preview");

  const nodeTypes = response.proposedArchitectureJson.nodes.map((node) => node.type);
  assert.equal(nodeTypes.includes("EC2"), false);
  assert.equal(nodeTypes.includes("LOAD_BALANCER"), false);
  assert.equal(nodeTypes.includes("AUTO_SCALING_GROUP"), false);
  assert.equal(nodeTypes.includes("AMI"), false);
  assert.equal(nodeTypes.includes("API_GATEWAY_REST_API"), true);
  assert.equal(nodeTypes.includes("LAMBDA"), true);

  const lambdaNode = response.proposedArchitectureJson.nodes.find((node) => node.type === "LAMBDA");
  const apiNode = response.proposedArchitectureJson.nodes.find(
    (node) => node.type === "API_GATEWAY_REST_API"
  );
  assert.ok(lambdaNode);
  assert.ok(apiNode);
  assert.equal(
    response.proposedArchitectureJson.edges.some(
      (edge) => edge.sourceId === apiNode.id && edge.targetId === lambdaNode.id
    ),
    true
  );
  assert.equal(
    response.proposedArchitectureJson.edges.some(
      (edge) => edge.sourceId === lambdaNode.id && edge.targetId === "db"
    ),
    true
  );
  assert.equal(
    response.proposedArchitectureJson.edges.some(
      (edge) => edge.sourceId === lambdaNode.id && edge.targetId === "assets"
    ),
    true
  );
});

function makeNode(
  node: Partial<ArchitectureJson["nodes"][number]> &
    Pick<ArchitectureJson["nodes"][number], "id" | "type">
): ArchitectureJson["nodes"][number] {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    positionX: node.positionX ?? 120,
    positionY: node.positionY ?? 80,
    config: node.config ?? {}
  };
}
