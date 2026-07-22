import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitecturePatchPreview } from "@sketchcatch/types";
import { createArchitecturePatchPreview } from "./aiArchitecturePatchPreview.js";

test("CloudFront OAC signing behavior를 never로 바꾸는 미리보기를 만든다", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: {
            name: "static-site-oac",
            signingBehavior: "always",
            signingProtocol: "sigv4",
            terraformResourceType: "aws_cloudfront_origin_access_control"
          },
          id: "oac",
          label: "CloudFront Origin Access Control",
          positionX: 0,
          positionY: 0,
          type: "CLOUDFRONT"
        }
      ]
    },
    instruction: "cloudfront에서 signing behavior 값 안하도록 바꿔줘",
    selectedTargetResourceId: "oac"
  });

  assert.equal(response.status, "preview");
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.signingBehavior, "never");
  assert.deepEqual(preview.patchPlan?.operations, [
    {
      op: "set_value",
      path: "config.signingBehavior",
      value: "never"
    }
  ]);
});
test("기존 테스트와 다른 자연어 다이어그램 수정 5가지를 해석한다", () => {
  const architectureJson = {
    edges: [
      { id: "ec2-to-rds", sourceId: "ec2", targetId: "rds" },
      { id: "ec2-to-s3", sourceId: "ec2", targetId: "s3" }
    ],
    nodes: [
      {
        id: "ec2",
        type: "EC2" as const,
        label: "주문 API 서버",
        positionX: 100,
        positionY: 100,
        config: { instanceType: "t3.micro" }
      },
      {
        id: "rds",
        type: "RDS" as const,
        label: "사용자 DB",
        positionX: 350,
        positionY: 100,
        config: { engine: "postgres" }
      },
      {
        id: "s3",
        type: "S3" as const,
        label: "이미지 저장소",
        positionX: 350,
        positionY: 300,
        config: {}
      }
    ]
  };
  const scenarios = [
    {
      name: "EC2 사양 변경",
      instruction: "주문 API 서버 사양을 t3.large로 올려줘",
      selectedTargetResourceId: "ec2"
    },
    {
      name: "RDS 삭제",
      instruction: "사용자 DB는 이제 필요 없으니 삭제해줘",
      selectedTargetResourceId: "rds"
    },
    {
      name: "S3 추가",
      instruction: "프로필 사진 저장용 S3 버킷을 하나 추가해줘",
      connectionTargetResourceId: "ec2"
    },
    {
      name: "EC2를 Lambda로 교체",
      instruction: "주문 API 서버를 Lambda로 바꿔줘",
      selectedTargetResourceId: "ec2"
    },
    {
      name: "CloudFront 추가",
      instruction: "이미지 저장소 앞에 CloudFront CDN을 붙여줘",
      connectionTargetResourceId: "s3"
    }
  ] as const;

  const results = scenarios.map((scenario) => {
    const response = createArchitecturePatchPreview({ architectureJson, ...scenario });
    if (response.status !== "preview") {
      return { name: scenario.name, status: response.status, applied: false };
    }

    const nodes = response.proposedArchitectureJson.nodes;
    const edges = response.proposedArchitectureJson.edges;
    const applied = scenario.name === "EC2 사양 변경"
      ? nodes.find(({ id }) => id === "ec2")?.config.instanceType === "t3.large"
      : scenario.name === "RDS 삭제"
        ? nodes.every(({ id }) => id !== "rds")
        : scenario.name === "S3 추가"
          ? nodes.filter(({ type }) => type === "S3").length === 2
          : scenario.name === "EC2를 Lambda로 교체"
            ? nodes.some(({ type }) => type === "LAMBDA") && nodes.every(({ id }) => id !== "ec2")
            : (() => {
                const cloudFront = nodes.find(({ type }) => type === "CLOUDFRONT");
                return cloudFront !== undefined && edges.some((edge) =>
                  [edge.sourceId, edge.targetId].includes(cloudFront.id)
                  && [edge.sourceId, edge.targetId].includes("s3")
                );
              })();

    return { name: scenario.name, status: response.status, applied };
  });

  assert.deepEqual(
    results,
    scenarios.map(({ name }) => ({ name, status: "preview", applied: true }))
  );
});
test("로드 밸런서 넣어줘 요청으로 서버 앞에 로드 밸런서를 추가한다", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          id: "ec2",
          type: "EC2",
          label: "웹 서버",
          positionX: 100,
          positionY: 100,
          config: { instanceType: "t3.micro" }
        }
      ]
    },
    instruction: "로드 밸런서 넣어줘"
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  const loadBalancer = preview.proposedArchitectureJson.nodes.find(
    ({ type }) => type === "LOAD_BALANCER"
  );

  assert.ok(loadBalancer);
  assert.ok(
    preview.proposedArchitectureJson.edges.some(
      ({ sourceId, targetId }) =>
        [sourceId, targetId].includes(loadBalancer.id) && [sourceId, targetId].includes("ec2")
    )
  );
});
