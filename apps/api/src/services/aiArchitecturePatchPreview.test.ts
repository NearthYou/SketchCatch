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

test("ECS average CPU condition changes only the CPU target tracking value", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: {
            targetTrackingScalingPolicyConfiguration: {
              targetValue: 60,
              predefinedMetricSpecification: [
                { predefinedMetricType: "ECSServiceAverageCPUUtilization" }
              ]
            }
          },
          id: "ecs-cpu-scaling-policy",
          label: "ECS CPU Auto Scaling",
          positionX: 0,
          positionY: 0,
          type: "APPLICATION_AUTO_SCALING_POLICY"
        },
        {
          config: {
            targetTrackingScalingPolicyConfiguration: {
              targetValue: 50,
              predefinedMetricSpecification: [
                { predefinedMetricType: "ALBRequestCountPerTarget" }
              ]
            }
          },
          id: "ecs-request-scaling-policy",
          label: "ECS Request Auto Scaling",
          positionX: 100,
          positionY: 0,
          type: "APPLICATION_AUTO_SCALING_POLICY"
        }
      ]
    },
    instruction:
      "ECS \uD0DC\uC2A4\uD06C\uB4E4\uC758 \uD3C9\uADE0 CPU \uC0AC\uC6A9\uB960\uC774 5%\uB97C \uB118\uC73C\uBA74 \uD0DC\uC2A4\uD06C\uB97C \uB298\uB9AC\uB3C4\uB85D \uC124\uC815\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "ecs-cpu-scaling-policy");
  assert.equal(
    (preview.proposedArchitectureJson.nodes[0]?.config
      .targetTrackingScalingPolicyConfiguration as { targetValue?: number })?.targetValue,
    5
  );
  assert.equal(
    (preview.proposedArchitectureJson.nodes[1]?.config
      .targetTrackingScalingPolicyConfiguration as { targetValue?: number })?.targetValue,
    50
  );
});

test("target value and Korean goal value phrases set the scaling target to five", () => {
  const instructions = [
    "auto scaling policy\uC758 target value\uB97C 5\uB85C \uC124\uC815\uD574\uC918.",
    "auto scaling \uC815\uCC45\uC758 \uBAA9\uD45C\uAC12\uC744 5\uB85C \uC124\uC815\uD574\uC918."
  ];

  for (const instruction of instructions) {
    const response = createArchitecturePatchPreview({
      architectureJson: {
        edges: [],
        nodes: [
          {
            config: {
              targetTrackingScalingPolicyConfiguration: {
                targetValue: 50,
                predefinedMetricSpecification: [
                  { predefinedMetricType: "ECSServiceAverageCPUUtilization" }
                ]
              }
            },
            id: "ecs-cpu-scaling-policy",
            label: "ECS CPU Auto Scaling",
            positionX: 0,
            positionY: 0,
            type: "APPLICATION_AUTO_SCALING_POLICY"
          }
        ]
      },
      instruction
    });

    assert.equal(response.status, "preview", JSON.stringify(response));
    const preview = response as ArchitecturePatchPreview;
    assert.equal(preview.intent.targetResourceId, "ecs-cpu-scaling-policy");
    assert.equal(
      (preview.proposedArchitectureJson.nodes[0]?.config
        .targetTrackingScalingPolicyConfiguration as { targetValue?: number })?.targetValue,
      5
    );
  }
});

test("ECS average CPU condition also selects the ECS CPU predefined metric", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: {
            targetTrackingScalingPolicyConfiguration: {
              targetValue: 50,
              predefinedMetricSpecification: [
                { predefinedMetricType: "ALBRequestCountPerTarget" }
              ]
            }
          },
          id: "ecs-scaling-policy",
          label: "ECS Auto Scaling",
          positionX: 0,
          positionY: 0,
          type: "APPLICATION_AUTO_SCALING_POLICY"
        }
      ]
    },
    instruction:
      "ECS \uD0DC\uC2A4\uD06C\uB4E4\uC758 \uD3C9\uADE0 CPU \uC0AC\uC6A9\uB960\uC774 5%\uB97C \uB118\uC73C\uBA74 \uD0DC\uC2A4\uD06C\uB97C \uB298\uB9AC\uB3C4\uB85D \uC124\uC815\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  const configuration = preview.proposedArchitectureJson.nodes[0]?.config
    .targetTrackingScalingPolicyConfiguration as {
      targetValue?: number;
      predefinedMetricSpecification?: Array<{ predefinedMetricType?: string }>;
    };

  assert.equal(configuration.targetValue, 5);
  assert.equal(
    configuration.predefinedMetricSpecification?.[0]?.predefinedMetricType,
    "ECSServiceAverageCPUUtilization"
  );
});

test("resource config name and parameter name select one resource for modification", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { desiredCount: 2, name: "checkout-service" },
          id: "checkout-service-node",
          label: "ECS Service",
          positionX: 0,
          positionY: 0,
          type: "ECS_SERVICE"
        },
        {
          config: { desiredCount: 2, name: "catalog-service" },
          id: "catalog-service-node",
          label: "ECS Service",
          positionX: 100,
          positionY: 0,
          type: "ECS_SERVICE"
        }
      ]
    },
    instruction:
      "ECS \uC11C\uBE44\uC2A4 checkout-service\uC758 desiredCount\uB97C 4\uB85C \uBCC0\uACBD\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "checkout-service-node");

  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.desiredCount, 4);
  assert.equal(preview.proposedArchitectureJson.nodes[1]?.config.desiredCount, 2);
});

test("resource type and exact config name prefer the named resource over a shared label", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { desiredCount: 2, name: "orders-api" },
          id: "orders-api-node",
          label: "ECS Service",
          positionX: 0,
          positionY: 0,
          type: "ECS_SERVICE"
        },
        {
          config: { desiredCount: 2, name: "catalog-api" },
          id: "catalog-api-node",
          label: "ECS Service",
          positionX: 100,
          positionY: 0,
          type: "ECS_SERVICE"
        }
      ]
    },
    instruction: "ECS Service orders-api\uC758 desiredCount\uB97C 4\uB85C \uBCC0\uACBD\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "orders-api-node");
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.desiredCount, 4);
  assert.equal(preview.proposedArchitectureJson.nodes[1]?.config.desiredCount, 2);
});

test("intent and action map an autoscaling capacity phrase to its parameter", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { maxCapacity: 4, minCapacity: 1, name: "checkout-scaling" },
          id: "checkout-scaling-target",
          label: "Application Auto Scaling Target",
          positionX: 0,
          positionY: 0,
          type: "APPLICATION_AUTO_SCALING_TARGET"
        }
      ]
    },
    instruction:
      "\uD2B8\uB798\uD53D \uC99D\uAC00\uC5D0 \uB300\uBE44\uD574\uC11C checkout-scaling\uC758 \uCD5C\uB300 \uD0DC\uC2A4\uD06C \uC218\uB97C 8\uB85C \uB298\uB824\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "checkout-scaling-target");
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.maxCapacity, 8);
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.minCapacity, 1);
});

test("resource config name selects exactly one resource for deletion", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [
        { id: "app-to-logs", sourceId: "app", targetId: "logs-bucket" },
        { id: "app-to-assets", sourceId: "app", targetId: "assets-bucket" }
      ],
      nodes: [
        {
          config: { name: "app" },
          id: "app",
          label: "Application",
          positionX: 0,
          positionY: 0,
          type: "EC2"
        },
        {
          config: { bucketName: "logs-archive" },
          id: "logs-bucket",
          label: "S3 Bucket",
          positionX: 100,
          positionY: 0,
          type: "S3"
        },
        {
          config: { bucketName: "assets-public" },
          id: "assets-bucket",
          label: "S3 Bucket",
          positionX: 200,
          positionY: 0,
          type: "S3"
        }
      ]
    },
    instruction: "logs-archive \uBC84\uD0B7\uC744 \uC0AD\uC81C\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "logs-bucket");
  assert.deepEqual(preview.proposedArchitectureJson.nodes.map(({ id }) => id), ["app", "assets-bucket"]);
  assert.deepEqual(preview.proposedArchitectureJson.edges.map(({ id }) => id), ["app-to-assets"]);
});

test("resource purpose and action add the requested resource type", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { name: "orders-api" },
          id: "orders-api",
          label: "Orders API",
          positionX: 0,
          positionY: 0,
          type: "EC2"
        }
      ]
    },
    instruction:
      "\uC8FC\uBB38 \uC774\uBCA4\uD2B8\uB97C \uBE44\uB3D9\uAE30\uB85C \uCC98\uB9AC\uD560 SQS \uD050\uB97C \uCD94\uAC00\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.requestedAction, "add_resource");
  assert.equal(preview.requiresUserAcceptance, true);
  assert.equal(preview.userAcceptedChange, null);
  assert.ok(preview.proposedArchitectureJson.nodes.some(({ type }) => type === "SQS_QUEUE"));
  assert.ok(preview.changes.some(({ action, resourceType }) => action === "add_resource" && resourceType === "SQS_QUEUE"));
});

test("exact resource and parameter names update an existing string parameter", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { name: "public-listener", port: 80, protocol: "HTTP" },
          id: "public-listener-node",
          label: "ALB Listener",
          positionX: 0,
          positionY: 0,
          type: "LOAD_BALANCER_LISTENER"
        }
      ]
    },
    instruction:
      "public-listener\uC758 protocol\uC744 HTTPS\uB85C \uBCC0\uACBD\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "public-listener-node");
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.protocol, "HTTPS");
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.port, 80);
  assert.deepEqual(preview.patchPlan?.operations, [
    { op: "set_value", path: "config.protocol", value: "HTTPS" }
  ]);
});

test("provider intent can modify an existing scalar path on an exactly named resource", async () => {
  let providerCallCount = 0;
  const response = await createArchitecturePatchPreviewWithPatchPlanCompiler(
    {
      architectureJson: {
        edges: [],
        nodes: [
          {
            config: { desiredCount: 2, name: "orders-api" },
            id: "orders-api-node",
            label: "ECS Service",
            positionX: 0,
            positionY: 0,
            type: "ECS_SERVICE"
          },
          {
            config: { desiredCount: 2, name: "catalog-api" },
            id: "catalog-api-node",
            label: "ECS Service",
            positionX: 100,
            positionY: 0,
            type: "ECS_SERVICE"
          }
        ]
      },
      instruction:
        "\uB300\uADDC\uBAA8 \uC8FC\uBB38 \uD2B8\uB798\uD53D\uC744 \uBC84\uD2F0\uB3C4\uB85D orders-api\uC758 \uB3D9\uC2DC \uC2E4\uD589 \uC218\uB97C 12\uB85C \uB298\uB824\uC918."
    },
    {
      bedrockProvider: {
        generate: async () => {
          providerCallCount += 1;
          return {
            text: JSON.stringify({
              status: "planned",
              action: "modify_resource",
              target: {
                resourceType: "ECS_SERVICE",
                resourceId: "orders-api-node",
                label: "ECS Service"
              },
              candidateResourceIds: [],
              operations: [
                {
                  op: "set_value",
                  path: "config.desiredCount",
                  value: 12
                }
              ],
              preserve: [],
              clarificationQuestion: null,
              confidence: 0.94
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

  assert.equal(providerCallCount, 1);
  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.intent.targetResourceId, "orders-api-node");
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.desiredCount, 12);
  assert.equal(preview.proposedArchitectureJson.nodes[1]?.config.desiredCount, 2);
  assert.deepEqual(preview.patchPlan?.operations, [
    { op: "set_value", path: "config.desiredCount", value: 12 }
  ]);
});

test("ambiguous parameter request asks which same-type resource to modify", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { desiredCount: 2, name: "orders-api" },
          id: "orders-api-node",
          label: "ECS Service",
          positionX: 0,
          positionY: 0,
          type: "ECS_SERVICE"
        },
        {
          config: { desiredCount: 2, name: "catalog-api" },
          id: "catalog-api-node",
          label: "ECS Service",
          positionX: 100,
          positionY: 0,
          type: "ECS_SERVICE"
        }
      ]
    },
    instruction:
      "ECS \uC11C\uBE44\uC2A4\uC758 desiredCount\uB97C 4\uB85C \uBCC0\uACBD\uD574\uC918."
  });

  assert.equal(response.status, "needs_clarification", JSON.stringify(response));

  if (response.status !== "needs_clarification") {
    assert.fail("ambiguous resource request must not produce a preview");
  }

  assert.deepEqual(
    response.candidates.map(({ resourceId }) => resourceId),
    ["orders-api-node", "catalog-api-node"]
  );
  assert.deepEqual(response.patchPlan?.candidateResourceIds, [
    "orders-api-node",
    "catalog-api-node"
  ]);
});

test("provider cannot modify protected architecture identity fields", async () => {
  const response = await createArchitecturePatchPreviewWithPatchPlanCompiler(
    {
      architectureJson: {
        edges: [],
        nodes: [
          {
            config: {
              desiredCount: 2,
              name: "orders-api",
              terraformResourceName: "orders_api"
            },
            id: "orders-api-node",
            label: "ECS Service",
            positionX: 0,
            positionY: 0,
            type: "ECS_SERVICE"
          }
        ]
      },
      instruction:
        "orders-api\uC758 \uB0B4\uBD80 Terraform \uC2DD\uBCC4\uC790\uB97C bad-name\uC73C\uB85C \uBC14\uAFB8\uC918."
    },
    {
      bedrockProvider: {
        generate: async () => ({
          text: JSON.stringify({
            status: "planned",
            action: "modify_resource",
            target: {
              resourceType: "ECS_SERVICE",
              resourceId: "orders-api-node",
              label: "ECS Service"
            },
            candidateResourceIds: [],
            operations: [
              {
                op: "set_value",
                path: "config.terraformResourceName",
                value: "bad-name"
              }
            ],
            preserve: [],
            clarificationQuestion: null,
            confidence: 0.99
          })
        }),
        model: "test-model",
        provider: "bedrock",
        service: "bedrock_runtime"
      },
      creditPolicy: { bedrock: true, billingMode: "aws_credit_only" }
    }
  );

  assert.equal(response.status, "needs_clarification", JSON.stringify(response));

  if (response.status !== "needs_clarification") {
    assert.fail("protected identity changes must not produce a preview");
  }

  assert.equal(response.patchPlan?.status, "unsupported");
  assert.equal(
    response.intent.targetResourceId,
    "orders-api-node"
  );
});

test("provider cannot apply a boolean operation to an existing numeric parameter", async () => {
  const response = await createArchitecturePatchPreviewWithPatchPlanCompiler(
    {
      architectureJson: {
        edges: [],
        nodes: [
          {
            config: { desiredCount: 2, name: "orders-api" },
            id: "orders-api-node",
            label: "ECS Service",
            positionX: 0,
            positionY: 0,
            type: "ECS_SERVICE"
          }
        ]
      },
      instruction: "orders-api\uC758 \uCC98\uB9AC \uC131\uB2A5\uC744 \uC218\uC815\uD574\uC918."
    },
    {
      bedrockProvider: {
        generate: async () => ({
          text: JSON.stringify({
            status: "planned",
            action: "modify_resource",
            target: {
              resourceType: "ECS_SERVICE",
              resourceId: "orders-api-node",
              label: "ECS Service"
            },
            candidateResourceIds: [],
            operations: [
              {
                op: "enable",
                path: "config.desiredCount",
                value: null
              }
            ],
            preserve: [],
            clarificationQuestion: null,
            confidence: 0.99
          })
        }),
        model: "test-model",
        provider: "bedrock",
        service: "bedrock_runtime"
      },
      creditPolicy: { bedrock: true, billingMode: "aws_credit_only" }
    }
  );

  assert.equal(response.status, "needs_clarification", JSON.stringify(response));

  if (response.status !== "needs_clarification") {
    assert.fail("numeric parameters must reject boolean operations");
  }

  assert.equal(response.patchPlan?.status, "unsupported");
});

test("one request can update multiple existing scalar parameters", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: { maxCapacity: 4, minCapacity: 1, name: "checkout-scaling" },
          id: "checkout-scaling-target",
          label: "Application Auto Scaling Target",
          positionX: 0,
          positionY: 0,
          type: "APPLICATION_AUTO_SCALING_TARGET"
        }
      ]
    },
    instruction:
      "checkout-scaling\uC758 minCapacity\uB97C 2\uB85C, maxCapacity\uB97C 8\uB85C \uBCC0\uACBD\uD574\uC918."
  });

  assert.equal(response.status, "preview", JSON.stringify(response));
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.minCapacity, 2);
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.maxCapacity, 8);
  assert.deepEqual(
    preview.patchPlan?.operations
      .map(({ path, value }) => ({ path, value }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    [
      { path: "config.maxCapacity", value: 8 },
      { path: "config.minCapacity", value: 2 }
    ]
  );
});
