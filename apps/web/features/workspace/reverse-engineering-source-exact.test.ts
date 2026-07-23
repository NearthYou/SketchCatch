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
    diagram.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => ({
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

test("AWS 원본에 없는 Terraform 식별자와 파일 정보를 Catalog에서 추론하지 않는다", () => {
  const diagram = createSourceExactReverseEngineeringDiagram(source);
  const vpc = diagram.nodes.find((node) => node.id === "vpc-source");
  const bucket = diagram.nodes.find((node) => node.id === "bucket-source");

  assert.ok(vpc);
  assert.equal(vpc.type, "VPC");
  assert.equal(vpc.parameters?.resourceName, "source_vpc");
  assert.equal(vpc.parameters?.resourceType, "");
  assert.equal(vpc.parameters?.fileName, "");
  assert.equal(vpc.parameters?.terraformBlockType, undefined);
  assert.equal(vpc.parameters?.invalid, true);

  assert.ok(bucket);
  assert.equal(bucket.type, "S3");
  assert.equal(bucket.parameters?.resourceName, "");
  assert.equal(bucket.parameters?.resourceType, "");
  assert.equal(bucket.parameters?.fileName, "");
  assert.equal(bucket.parameters?.terraformBlockType, undefined);
  assert.equal(bucket.parameters?.invalid, true);
  assert.deepEqual(bucket.parameters?.values, source.nodes[1]?.config);
});

test("서버가 검증해 부여한 기존 AWS Terraform identity는 편집 가능한 Board node로 보존한다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      {
        id: "resource-existing-bucket",
        type: "S3",
        label: "기존 버킷",
        positionX: 120,
        positionY: 80,
        config: {
          bucket: "existing-bucket",
          terraformBlockType: "resource",
          terraformResourceType: "aws_s3_bucket",
          terraformResourceName: "resource_existing_bucket",
          terraformFileName: "reverse-engineering",
          reverseEngineeringManagement: "managed",
          reverseEngineeringSourceScanId: "scan-1",
          reverseEngineeringDraftId: "draft-1"
        }
      }
    ],
    edges: []
  };

  const bucket = createSourceExactReverseEngineeringDiagram(architecture).nodes.find(
    (node) => node.id === "resource-existing-bucket"
  );

  assert.equal(bucket?.type, "aws_s3_bucket");
  assert.equal(bucket?.parameters?.terraformBlockType, "resource");
  assert.equal(bucket?.parameters?.resourceType, "aws_s3_bucket");
  assert.equal(bucket?.parameters?.resourceName, "resource_existing_bucket");
  assert.equal(bucket?.parameters?.fileName, "reverse-engineering");
  assert.equal(bucket?.parameters?.invalid, undefined);
  assert.equal(bucket?.parameters?.values["bucket"], "existing-bucket");
});

test("검토 전용 Resource도 실제 왼쪽 Catalog 아이콘으로 표시한다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      {
        id: "iam-role-source",
        type: "IAM_ROLE",
        label: "Read Only Role",
        positionX: 120,
        positionY: 80,
        config: {
          analysisExcluded: true,
          providerResourceType: "AWS::IAM::Role",
          providerResourceId: "aws-ref-role"
        }
      }
    ],
    edges: []
  };

  const diagram = createSourceExactReverseEngineeringDiagram(architecture);
  const role = diagram.nodes.find((node) => node.id === "iam-role-source");

  assert.equal(role?.type, "IAM_ROLE");
  assert.match(role?.iconUrl ?? "", /Identity-Access-Management_Role_48\.svg$/);
});

test("Reverse Engineering 원본 Board에 표시 전용 인프라 프레임을 함께 넣는다", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      {
        id: "service",
        type: "LAMBDA",
        label: "Checkout API",
        positionX: 160,
        positionY: 120,
        config: {
          tags: { Project: "store" }
        }
      }
    ],
    edges: []
  };

  const diagram = createSourceExactReverseEngineeringDiagram(architecture);
  const resource = diagram.nodes.find((node) => node.id === "service");
  const frame = diagram.nodes.find(
    (node) => node.metadata?.reverseEngineeringInfrastructureFrame !== undefined
  );

  assert.ok(resource);
  assert.ok(frame);
  assert.deepEqual(
    frame.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds,
    ["service"]
  );
  assert.equal(resource.metadata?.parentAreaNodeId, undefined);
  assert.equal(frame.metadata?.parentAreaNodeId, undefined);
});
