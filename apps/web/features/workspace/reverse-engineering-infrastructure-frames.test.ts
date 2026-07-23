import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, DiagramNode } from "@sketchcatch/types";
import {
  createReverseEngineeringInfrastructureFrames,
  isReverseEngineeringInfrastructureFrameNode
} from "./reverse-engineering-infrastructure-frames";

test("AWS 태그를 Project, Service, Environment 순서로 사용해 표시 프레임을 만든다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      architectureNode("project-api", "LAMBDA", 100, 100, {
        tags: [
          { key: "Service", value: "checkout" },
          { key: "Project", value: "store" }
        ]
      }),
      architectureNode("project-db", "DYNAMODB_TABLE", 220, 100, {
        reverseEngineeringObservedConfig: {
          tags: { Project: "store", Environment: "production" }
        }
      }),
      architectureNode("service-worker", "LAMBDA", 420, 100, {
        tags: { Service: "worker", Environment: "production" }
      }),
      architectureNode("environment-log", "CLOUDWATCH_LOG_GROUP", 620, 100, {
        tags: [{ Key: "Environment", Value: "production" }]
      })
    ],
    edges: []
  };
  const resourceNodes = architecture.nodes.map(toDiagramNode);

  const frames = createReverseEngineeringInfrastructureFrames(architecture, resourceNodes);
  const frameByLabel = new Map(frames.map((frame) => [frame.label, frame]));

  assert.deepEqual(
    frameByLabel.get("프로젝트 · store")?.metadata?.reverseEngineeringInfrastructureFrame
      ?.memberNodeIds,
    ["project-api", "project-db"]
  );
  assert.deepEqual(
    frameByLabel.get("서비스 · worker")?.metadata?.reverseEngineeringInfrastructureFrame
      ?.memberNodeIds,
    ["service-worker"]
  );
  assert.deepEqual(
    frameByLabel.get("환경 · production")?.metadata?.reverseEngineeringInfrastructureFrame
      ?.memberNodeIds,
    ["environment-log"]
  );
});

test("태그가 없으면 VPC, 실제 연결, 공통 리소스 순서로 표시 프레임을 만든다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      architectureNode("vpc-main", "VPC", 80, 80, {
        providerResourceId: "vpc-123"
      }),
      architectureNode("subnet-main", "SUBNET", 200, 80, {
        vpcId: "vpc-123"
      }),
      architectureNode("queue", "SQS_QUEUE", 420, 80),
      architectureNode("worker", "LAMBDA", 540, 80),
      architectureNode("shared-bucket", "S3", 760, 80)
    ],
    edges: [
      {
        id: "queue-worker",
        sourceId: "queue",
        targetId: "worker",
        label: "connects_to"
      }
    ]
  };
  const resourceNodes = architecture.nodes.map(toDiagramNode);

  const frames = createReverseEngineeringInfrastructureFrames(architecture, resourceNodes);
  const groups = frames.map((frame) => ({
    groupBy: frame.metadata?.reverseEngineeringInfrastructureFrame?.groupBy,
    label: frame.label,
    memberNodeIds:
      frame.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds ?? []
  }));

  assert.deepEqual(groups, [
    {
      groupBy: "common",
      label: "공통 리소스",
      memberNodeIds: ["shared-bucket"]
    },
    {
      groupBy: "relationship",
      label: "함께 연결된 리소스",
      memberNodeIds: ["queue", "worker"]
    },
    {
      groupBy: "vpc",
      label: "VPC · vpc-main",
      memberNodeIds: ["subnet-main", "vpc-main"]
    }
  ]);
});

test("태그가 있는 VPC의 직접 하위 Resource는 같은 상위 표시 프레임에 둔다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      architectureNode("vpc-store", "VPC", 100, 100, {
        providerResourceId: "vpc-store",
        tags: { Project: "store" }
      }),
      architectureNode("subnet-store", "SUBNET", 220, 100, {
        vpcId: "vpc-store"
      })
    ],
    edges: []
  };

  const frames = createReverseEngineeringInfrastructureFrames(
    architecture,
    architecture.nodes.map(toDiagramNode)
  );

  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.label, "프로젝트 · store");
  assert.deepEqual(
    frames[0]?.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds,
    ["subnet-store", "vpc-store"]
  );
});

test("태그가 없는 Resource는 실제로 연결된 인프라 프레임에 넣는다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      architectureNode("api", "LAMBDA", 100, 100, {
        tags: { Service: "checkout" }
      }),
      architectureNode("role", "IAM_ROLE", 220, 100),
      architectureNode("policy", "IAM_POLICY", 340, 100)
    ],
    edges: [
      { id: "api-role", sourceId: "api", targetId: "role", label: "depends_on" },
      { id: "role-policy", sourceId: "role", targetId: "policy", label: "depends_on" }
    ]
  };

  const frames = createReverseEngineeringInfrastructureFrames(
    architecture,
    architecture.nodes.map(toDiagramNode)
  );

  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.label, "서비스 · checkout");
  assert.deepEqual(
    frames[0]?.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds,
    ["api", "policy", "role"]
  );
});

test("표시 프레임은 별도 marker를 쓰고 AWS 포함 관계를 만들지 않는다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      architectureNode("bucket", "S3", 200, 160, {
        tags: { Project: "demo" }
      })
    ],
    edges: []
  };
  const resourceNodes = architecture.nodes.map(toDiagramNode);

  const [frame] = createReverseEngineeringInfrastructureFrames(architecture, resourceNodes);

  assert.ok(frame);
  assert.equal(isReverseEngineeringInfrastructureFrameNode(frame), true);
  assert.match(frame.id, /^reverse-infra-frame:/u);
  assert.equal(frame.id.startsWith("board-auto-frame:"), false);
  assert.equal(frame.metadata?.parentAreaNodeId, undefined);
  assert.equal(frame.position.x < resourceNodes[0]!.position.x, true);
  assert.equal(frame.position.y < resourceNodes[0]!.position.y, true);
  assert.equal(
    frame.position.x + frame.size.width >
      resourceNodes[0]!.position.x + resourceNodes[0]!.size.width,
    true
  );
  assert.equal(
    frame.position.y + frame.size.height >
      resourceNodes[0]!.position.y + resourceNodes[0]!.size.height,
    true
  );
});

/** gg: 그룹 규칙만 확인하도록 최소 AWS Architecture node를 만듭니다. */
function architectureNode(
  id: string,
  type: ArchitectureJson["nodes"][number]["type"],
  positionX: number,
  positionY: number,
  config: Record<string, unknown> = {}
): ArchitectureJson["nodes"][number] {
  return { id, type, positionX, positionY, config };
}

/** gg: 프레임 geometry 계산에 필요한 Resource node 모양만 만듭니다. */
function toDiagramNode(
  node: ArchitectureJson["nodes"][number],
  index: number
): DiagramNode {
  return {
    id: node.id,
    type: node.type,
    kind: "resource",
    position: { x: node.positionX, y: node.positionY },
    size: { width: 48, height: 48 },
    label: node.id,
    locked: false,
    zIndex: index + 1,
    parameters: {
      resourceType: "",
      resourceName: "",
      fileName: "",
      values: structuredClone(node.config)
    }
  };
}
