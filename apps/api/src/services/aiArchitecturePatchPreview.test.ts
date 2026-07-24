import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitecturePatchPreview } from "@sketchcatch/types";
import {
  createArchitecturePatchPreview,
  createArchitecturePatchPreviewWithPatchPlanCompiler
} from "./aiArchitecturePatchPreview.js";

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

test("리소스 이름으로 지정한 ECS 요청 기준값을 자연어로 줄인다", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { name: "app-service" },
          id: "ecs_service_fixed_template_fargate_container_app",
          label: "ECS Service",
          positionX: 0,
          positionY: 0,
          type: "ECS_SERVICE"
        },
        {
          config: {
            name: "ecs-service-requests",
            targetTrackingScalingPolicyConfiguration: {
              predefinedMetricSpecification: [
                { predefinedMetricType: "ALBRequestCountPerTarget" }
              ],
              scaleInCooldown: 60,
              targetValue: 50
            },
            terraformResourceType: "aws_appautoscaling_policy"
          },
          id: "ecs_service_requests",
          label: "ECS request scaling policy",
          positionX: 100,
          positionY: 0,
          type: "APPLICATION_AUTO_SCALING_POLICY"
        }
      ]
    },
    instruction: "ecs_service_requests target value 50에서 5로 줄여줘"
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "ecs_service_requests");
  assert.equal(preview.patchPlan?.target.resourceId, "ecs_service_requests");
  assert.deepEqual(preview.patchPlan?.operations, [
    {
      op: "set_value",
      path: "config.targetTrackingScalingPolicyConfiguration.targetValue",
      value: 5
    }
  ]);
  assert.deepEqual(
    preview.proposedArchitectureJson.nodes.find(({ id }) => id === "ecs_service_requests")?.config
      .targetTrackingScalingPolicyConfiguration,
    {
      predefinedMetricSpecification: [
        { predefinedMetricType: "ALBRequestCountPerTarget" }
      ],
      scaleInCooldown: 60,
      targetValue: 5
    }
  );
  assert.equal(
    preview.proposedArchitectureJson.nodes.find(
      ({ id }) => id === "ecs_service_fixed_template_fargate_container_app"
    )?.config.naturalLanguageChangeRequest,
    undefined
  );
});

test("유일한 오토스케일링 정책의 요청 기준을 짧은 자연어로 줄인다", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: {
            targetTrackingScalingPolicyConfiguration: [{ targetValue: 50 }],
            terraformResourceType: "aws_appautoscaling_policy"
          },
          id: "request-scaling-policy",
          label: "요청 오토스케일링",
          positionX: 0,
          positionY: 0,
          type: "APPLICATION_AUTO_SCALING_POLICY"
        }
      ]
    },
    instruction: "오토스케일링 요청 기준을 5로 낮춰줘"
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "request-scaling-policy");
  assert.deepEqual(
    preview.proposedArchitectureJson.nodes[0]?.config
      .targetTrackingScalingPolicyConfiguration,
    [{ targetValue: 5 }]
  );
});

test("provider가 거절해도 지원되는 요청 기준 변경은 deterministic plan을 사용한다", async () => {
  let providerCallCount = 0;
  const response = await createArchitecturePatchPreviewWithPatchPlanCompiler(
    {
      architectureJson: {
        edges: [],
        nodes: [
          {
            config: {
              targetTrackingScalingPolicyConfiguration: { targetValue: 50 }
            },
            id: "request-scaling-policy",
            label: "요청 오토스케일링",
            positionX: 0,
            positionY: 0,
            type: "APPLICATION_AUTO_SCALING_POLICY"
          }
        ]
      },
      instruction: "요청 기준을 5로 낮춰줘"
    },
    {
      bedrockProvider: {
        generate: async () => {
          providerCallCount += 1;
          return {
            text: JSON.stringify({
              action: null,
              candidateResourceIds: [],
              clarificationQuestion: "unsupported",
              confidence: 0.2,
              operations: [],
              preserve: [],
              status: "unsupported",
              target: { label: null, resourceId: null, resourceType: null }
            })
          };
        },
        model: "test-model",
        provider: "bedrock",
        service: "bedrock_runtime"
      },
      creditPolicy: { bedrock: true, billingMode: "aws_credit_only" }
    }
  );

  assert.equal(providerCallCount, 0);
  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(
    (preview.proposedArchitectureJson.nodes[0]?.config
      .targetTrackingScalingPolicyConfiguration as { targetValue?: number })?.targetValue,
    5
  );
  assert.equal(preview.patchPlan?.status, "planned");
});

test("실제로 바꿀 수 없는 설정은 성공 미리보기 대신 다시 질문한다", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { name: "app-service" },
          id: "ecs_service_fixed_template_fargate_container_app",
          label: "ECS Service",
          positionX: 0,
          positionY: 0,
          type: "ECS_SERVICE"
        }
      ]
    },
    instruction: "ecs_service_fixed_template_fargate_container_app의 알 수 없는 값을 5로 수정해줘"
  });

  assert.equal(response.status, "needs_clarification", JSON.stringify(response));
  if (response.status !== "needs_clarification") {
    assert.fail("변경 없는 preview를 성공으로 표시하면 안 됩니다.");
  }
  assert.match(response.question, /자동으로 변경하지 못했습니다/);
  assert.equal(response.patchPlan?.status, "unsupported");
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
