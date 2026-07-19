import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import { createSourceExactReverseEngineeringDiagram } from "./reverse-engineering-source-exact";

const source: ArchitectureJson = {
  nodes: [
    {
      id: "vpc-source",
      type: "VPC",
      label: "원본 VPC",
      positionX: 120,
      positionY: 80,
      config: {
        cidrBlock: "10.0.0.0/16",
        providerResourceId: "vpc-0123456789abcdef0",
        terraformResourceName: "source_vpc"
      }
    },
    {
      id: "bucket-source",
      type: "S3",
      label: "원본 버킷",
      positionX: 420,
      positionY: 80,
      config: {
        bucket: "source-assets",
        providerResourceId: "source-assets"
      }
    }
  ],
  edges: [
    {
      id: "edge-source",
      sourceId: "vpc-source",
      targetId: "bucket-source",
      label: "reads"
    }
  ]
};

test("Reverse Engineering 원본은 AWS가 준 Resource, 설정, 관계만 그대로 Board로 옮긴다", () => {
  const diagram = createSourceExactReverseEngineeringDiagram(source);

  assert.equal(diagram.presentation?.geometryPolicy, "source-exact");
  assert.deepEqual(
    diagram.nodes.map((node) => ({
      config: node.parameters?.values,
      id: node.id,
      label: node.label,
      position: node.position
    })),
    [
      {
        config: source.nodes[0]?.config,
        id: "vpc-source",
        label: "원본 VPC",
        position: { x: 120, y: 80 }
      },
      {
        config: source.nodes[1]?.config,
        id: "bucket-source",
        label: "원본 버킷",
        position: { x: 420, y: 80 }
      }
    ]
  );
  assert.deepEqual(diagram.edges, [
    {
      id: "edge-source",
      label: "reads",
      sourceNodeId: "vpc-source",
      targetNodeId: "bucket-source"
    }
  ]);
  assert.equal(diagram.nodes.some((node) => node.type === "AWS_REGION"), false);
  assert.equal(diagram.nodes.some((node) => node.type === "AWS_AVAILABILITY_ZONE"), false);
});

test("Reverse Engineering 원본 변환은 입력 Architecture를 바꾸지 않는다", () => {
  const before = structuredClone(source);

  createSourceExactReverseEngineeringDiagram(source);

  assert.deepEqual(source, before);
});
