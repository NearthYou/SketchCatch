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
    "리소스를 하나 추가해줘",
    "특정 리소스를 삭제해줘",
    "특정 리소스를 다른 리소스로 교체해줘",
    "특정 리소스 설정을 바꿔줘"
  ]);
  assert.match(response.question, /무엇을 바꿀지/);
  assert.deepEqual(
    response.candidates.map((candidate) => candidate.resourceId),
    ["app-server", "assets-bucket"]
  );
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

test("createArchitecturePatchPreview asks where to connect a new resource before previewing it", () => {
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
  assert.match(response.question, /어디에 연결/);
  assert.deepEqual(
    response.candidates.map((candidate) => candidate.resourceId),
    ["app-server", "assets-bucket"]
  );
  assert.deepEqual(response.suggestions, ["연결하지 않기"]);
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
  assert.match(response.question, /어떤 리소스/);
  assert.deepEqual(response.suggestions, [
    "데이터베이스 추가",
    "스토리지 버킷 추가",
    "서버 인스턴스 추가",
    "보안 그룹 추가",
    "서브넷 추가",
    "API Gateway 추가"
  ]);
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
  assert.deepEqual(response.proposedArchitectureJson.edges, []);
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
