import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import type { AiTextProvider } from "./aiLlmExplanation.js";
import { createAmazonQArchitectureDraftResponse, createArchitectureDraft } from "./aiArchitectureDrafts.js";
import { SKETCHCATCH_REFERENCE_DIAGRAM_JSON } from "./aiArchitectureSketchcatchReferenceDiagram.js";
import { SKETCHCATCH_REFERENCE_TERRAFORM_MARKER } from "./terraform/sketchcatch-reference-terraform-code.js";

const confirmedCreditPolicy = {
  bedrock: false,
  amazonQ: true,
  transcribe: false,
  billingMode: "aws_credit_only"
} as const;

test("createAmazonQArchitectureDraftResponse uses the fixed SketchCatch deployment draft for the selected answer path", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createSketchCatchReferenceSelectionPrompt()
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if ("status" in response) {
    assert.fail(`Expected fixed preview, got clarification: ${response.question}`);
  }

  assert.equal(response.title, "SketchCatch Web Service Deployment Architecture");
  assert.equal(response.metadata.confidence, "high");
  assert.deepEqual(response.diagramJson, SKETCHCATCH_REFERENCE_DIAGRAM_JSON);
  assert.equal(response.diagramJson?.nodes.length, 84);
  assert.equal(response.diagramJson?.edges.length, 26);
  assert.deepEqual(response.diagramJson?.nodes.find((node) => node.id === "region-seoul")?.position, {
    x: 230,
    y: -42
  });
  assert.deepEqual(response.diagramJson?.nodes.find((node) => node.id === "vpc-main")?.position, {
    x: 540,
    y: 444
  });
  assert.deepEqual(response.diagramJson?.nodes.find((node) => node.id === "node-mrb8gls3-rdjo68")?.position, {
    x: 948,
    y: 756
  });
  assert.equal(
    response.architectureJson.nodes.find((node) => node.id === "vpc-main")?.config?.["sketchcatchReferenceTerraform"],
    SKETCHCATCH_REFERENCE_TERRAFORM_MARKER
  );

  const nodeTypes = new Set(response.architectureJson.nodes.map((node) => node.type));
  for (const expectedType of [
    "VPC",
    "SUBNET",
    "INTERNET_GATEWAY",
    "NAT_GATEWAY",
    "LOAD_BALANCER",
    "LOAD_BALANCER_LISTENER",
    "LOAD_BALANCER_TARGET_GROUP",
    "LAUNCH_TEMPLATE",
    "AUTO_SCALING_GROUP",
    "RDS",
    "DB_SUBNET_GROUP",
    "S3",
    "CLOUDFRONT",
    "SECRETS_MANAGER_SECRET"
  ] as const) {
    assert.equal(nodeTypes.has(expectedType), true, `Expected ${expectedType} in fixed draft`);
  }

  assert.equal(response.architectureJson.nodes.filter((node) => node.type === "SUBNET").length, 6);
  assertReferenceNodePosition(response.architectureJson, "region-seoul", 230, 14, 2010, 1490);
  assertReferenceNodePosition(response.architectureJson, "vpc-main", 648, 430, 1580, 1055);
  assertReferenceNodePosition(response.architectureJson, "cicd-artifacts-group", 522, 52, 142, 150);
  assertReferenceNodePosition(response.architectureJson, "pipeline-group", 705, 52, 545, 150);
  assertReferenceNodePosition(response.architectureJson, "cloudfront-distribution", 320, 945);
  assertReferenceNodePosition(response.architectureJson, "api-alb", 878, 680);
  assertReferenceNodePosition(response.architectureJson, "http-listener", 1148, 690);
  assertReferenceNodePosition(response.architectureJson, "api-autoscaling-group", 1442, 632, 282, 615);
  assertReferenceNodePosition(response.architectureJson, "app-database", 1920, 890);
  assertReferenceNodePosition(response.architectureJson, "standby-database", 1920, 1135);
  assertAllExplicitReferenceChildrenFitInsideParents(response.architectureJson);

  const autoscalingGroupConfig = response.architectureJson.nodes.find(
    (node) => node.id === "api-autoscaling-group"
  )?.config;

  assert.equal(autoscalingGroupConfig?.desiredCapacity, 2);
  assert.equal(autoscalingGroupConfig?.launchTemplateId, "aws_launch_template.launch_template.id");
  assert.equal(autoscalingGroupConfig?.maxSize, 4);
  assert.equal(autoscalingGroupConfig?.minSize, 2);
  assert.deepEqual(autoscalingGroupConfig?.targetGroupArns, ["aws_lb_target_group.api_target_group.arn"]);
  assert.deepEqual(autoscalingGroupConfig?.vpcZoneIdentifier, [
    "aws_subnet.private_app_subnet_a.id",
    "aws_subnet.private_app_subnet_c.id"
  ]);
  assert.equal(autoscalingGroupConfig?.diagramAreaLabel, "autoscaling_group");
  assert.equal(autoscalingGroupConfig?.parentAreaNodeId, "vpc-main");
});

function assertReferenceNodePosition(
  architectureJson: ArchitectureJson,
  nodeId: string,
  positionX: number,
  positionY: number,
  diagramWidth?: number,
  diagramHeight?: number
): void {
  const node = architectureJson.nodes.find((candidate) => candidate.id === nodeId);

  assert.ok(node, `Expected ${nodeId} in fixed draft`);
  assert.equal(node.positionX, positionX, nodeId);
  assert.equal(node.positionY, positionY, nodeId);

  if (diagramWidth !== undefined) {
    assert.equal(node.config.diagramWidth, diagramWidth, nodeId);
  }

  if (diagramHeight !== undefined) {
    assert.equal(node.config.diagramHeight, diagramHeight, nodeId);
  }
}

function assertAllExplicitReferenceChildrenFitInsideParents(architectureJson: ArchitectureJson): void {
  const nodesById = new Map(architectureJson.nodes.map((node) => [node.id, node]));

  for (const node of architectureJson.nodes) {
    const parentAreaNodeId = node.config.parentAreaNodeId;

    if (typeof parentAreaNodeId !== "string") {
      continue;
    }

    const parentNode = nodesById.get(parentAreaNodeId);

    assert.ok(parentNode, `Expected parent ${parentAreaNodeId} for ${node.id}`);

    const childWidth = readFixtureDimension(node.config.diagramWidth, 76);
    const childHeight = readFixtureDimension(node.config.diagramHeight, 72);
    const parentWidth = readFixtureDimension(parentNode.config.diagramWidth, 0);
    const parentHeight = readFixtureDimension(parentNode.config.diagramHeight, 0);

    assert.ok(parentWidth > 0 && parentHeight > 0, `Expected explicit size for parent ${parentAreaNodeId}`);
    assert.ok(node.positionX >= parentNode.positionX, `${node.id} left is outside ${parentAreaNodeId}`);
    assert.ok(node.positionY >= parentNode.positionY, `${node.id} top is outside ${parentAreaNodeId}`);
    assert.ok(
      node.positionX + childWidth <= parentNode.positionX + parentWidth,
      `${node.id} right is outside ${parentAreaNodeId}`
    );
    assert.ok(
      node.positionY + childHeight <= parentNode.positionY + parentHeight,
      `${node.id} bottom is outside ${parentAreaNodeId}`
    );
  }
}

function readFixtureDimension(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 0 ? value : fallback;
}

test("createArchitectureDraft uses the same fixed SketchCatch deployment draft without Amazon Q", () => {
  const draft = createArchitectureDraft({ prompt: createSketchCatchReferenceSelectionPrompt() });

  assert.equal(draft.title, "SketchCatch Web Service Deployment Architecture");
  assert.deepEqual(draft.diagramJson, SKETCHCATCH_REFERENCE_DIAGRAM_JSON);
  assert.equal(draft.architectureJson.nodes.some((node) => node.id === "cloudfront-distribution"), true);
  assert.equal(draft.architectureJson.nodes.some((node) => node.id === "app-database"), true);
});

test("createAmazonQArchitectureDraftResponse keeps similar non-matching answer paths on the existing provider flow", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  await createAmazonQArchitectureDraftResponse(
    {
      prompt: createSketchCatchReferenceSelectionPrompt().replace(
        "월 예산 범위는 50-200만원 (고성능)입니다.",
        "월 예산 범위는 10-50만원 (적당한 성능)입니다."
      )
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 1);
});

test("createAmazonQArchitectureDraftResponse asks the next required website question before calling Amazon Q", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: "회사 소개용 웹사이트를 만들고 싶어요."
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "예상 트래픽 규모는?");
  assert.deepEqual(response.suggestions, [
    "소규모 (일 100명 미만, 동시 10명 미만)",
    "중간 규모 (일 1,000명, 동시 50명)",
    "대규모 (일 10,000명 이상, 동시 500명 이상)",
    "급변동 (평상시 적지만 이벤트 시 급증)"
  ]);
});

test("createAmazonQArchitectureDraftResponse treats concurrent user capacity as traffic information", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)입니다.",
        "동접자 1000명은 버틸 수 있어야 돼."
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.question, "데이터베이스가 필요한가요?");
});

test("createAmazonQArchitectureDraftResponse asks clarification questions in the provided priority order", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");

  const answeredRequirements = [
    "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 HTML/CSS/JS만 (순수 웹)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다."
  ] as const;

  const orderedClarifications = [
    {
      question: "어떤 종류의 웹사이트인가요?",
      suggestions: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)",
        "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)",
        "SPA (Single Page Application) (React/Vue 등)",
        "API 서버 (모바일 앱 백엔드)"
      ]
    },
    {
      question: "예상 트래픽 규모는?",
      suggestions: [
        "소규모 (일 100명 미만, 동시 10명 미만)",
        "중간 규모 (일 1,000명, 동시 50명)",
        "대규모 (일 10,000명 이상, 동시 500명 이상)",
        "급변동 (평상시 적지만 이벤트 시 급증)"
      ]
    },
    {
      question: "데이터베이스가 필요한가요?",
      suggestions: [
        "필요 없음 (정적 콘텐츠만)",
        "간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
        "중간 규모 데이터 (10GB ~ 100GB)",
        "대용량 데이터 (100GB 이상, 복잡한 쿼리)"
      ]
    },
    {
      question: "프론트엔드 기술은?",
      suggestions: [
        "HTML/CSS/JS만 (순수 웹)",
        "React/Vue/Angular (SPA 프레임워크)",
        "Next.js/Nuxt.js (SSR 필요)",
        "모바일 앱 (웹뷰 또는 네이티브)"
      ]
    },
    {
      question: "백엔드가 필요한가요?",
      suggestions: [
        "필요 없음 (정적 사이트)",
        "간단한 API (Node.js, Python Flask 등)",
        "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
        "마이크로서비스 (여러 서비스 분리)"
      ]
    },
    {
      question: "주요 사용자 지역은?",
      suggestions: [
        "한국만 (서울 리전)",
        "아시아 태평양 (도쿄, 싱가포르 포함)",
        "글로벌 (미국, 유럽 포함)",
        "특정 지역 (중국, 일본 등)"
      ]
    },
    {
      question: "월 예산 범위는?",
      suggestions: [
        "10만원 미만 (최소 비용)",
        "10-50만원 (적당한 성능)",
        "50-200만원 (고성능)",
        "200만원 이상 (엔터프라이즈급)"
      ]
    },
    {
      question: "SSL 인증서(HTTPS)가 필요한가요?",
      suggestions: [
        "필수 (보안 중요)",
        "선택사항 (HTTP도 괜찮음)",
        "모르겠음 (추천해주세요)"
      ]
    },
    {
      question: "파일 업로드 기능이 있나요? (이미지, 문서 등)",
      suggestions: [
        "없음 (텍스트만)",
        "이미지만 (프로필, 게시글 이미지)",
        "다양한 파일 (문서, 동영상 포함)",
        "대용량 파일 (100MB 이상)"
      ]
    },
    {
      question: "실시간 기능이 필요한가요? (채팅, 알림 등)",
      suggestions: [
        "필요 없음",
        "실시간 채팅",
        "실시간 알림",
        "실시간 데이터 업데이트 (주식, 게임 등)"
      ]
    },
    {
      question: "관리 복잡도 선호도는?",
      suggestions: [
        "완전 관리형 (서버리스, 관리 최소화)",
        "반관리형 (일부 서버 관리)",
        "직접 관리 (서버 직접 운영)",
        "모르겠음 (추천해주세요)"
      ]
    },
    {
      question: "페이지 로딩 시간 목표는?",
      suggestions: [
        "1초 이내 (매우 빠름)",
        "3초 이내 (적당함)",
        "5초 이내 (느려도 괜찮음)",
        "상관없음"
      ]
    },
    {
      question: "전체 웹사이트 크기는?",
      suggestions: [
        "10MB 미만 (간단한 사이트)",
        "10MB-100MB (일반적인 사이트)",
        "100MB-1GB (이미지 많은 사이트)",
        "1GB 이상 (동영상 포함)"
      ]
    },
    {
      question: "트래픽 패턴은?",
      suggestions: [
        "일정함 (하루 종일 비슷)",
        "시간대별 차이 (낮에 많음)",
        "이벤트성 급증 (특정 시기에만)",
        "예측 불가"
      ]
    },
    {
      question: "서비스 중단 허용 시간은?",
      suggestions: [
        "절대 안됨 (99.99% 가용성)",
        "월 1시간 이내 (99.9% 가용성)",
        "월 8시간 이내 (99% 가용성)",
        "상관없음"
      ]
    }
  ] as const;

  const promptsAndQuestions = orderedClarifications.map((clarification, answeredCount) => ({
    prompt:
      answeredCount === 0
        ? "웹사이트를 만들고 싶어요."
        : answeredRequirements.slice(0, answeredCount).join("\n"),
    ...clarification
  }));

  for (const scenario of promptsAndQuestions) {
    const response = await createAmazonQArchitectureDraftResponse(
      {
        prompt: scenario.prompt
      },
      {
        provider,
        creditPolicy: confirmedCreditPolicy
      }
    );

    if (!("status" in response)) {
      assert.fail(`Expected clarification for question: ${scenario.question}`);
    }

    assert.equal(response.question, scenario.question);
    assert.deepEqual(response.suggestions, scenario.suggestions);
  }
});

test("createAmazonQArchitectureDraftResponse returns the Amazon Q architecture preview when requirements are complete", async () => {
  let requestedPrompt = "";
  let requestedPayload: unknown;
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompt = request.prompt;
    requestedPayload = request.payload;
    return JSON.stringify({
      status: "preview",
      title: "Cost Optimized Static Site",
      architectureJson: {
        nodes: [
          {
            id: "site-bucket",
            type: "S3",
            label: "Static Website Bucket",
            positionX: 120,
            positionY: 180,
            config: {
              versioning: true
            }
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 360,
            positionY: 180,
            config: {
              priceClass: "PriceClass_200"
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-site",
            sourceId: "cdn",
            targetId: "site-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: sampleRequirementCoverage(["site-bucket", "cdn"]),
      assumptions: ["Korea users and low budget favor Seoul-region AWS services."],
      explanations: ["S3 and CloudFront avoid server management for static content."],
      summary: "Amazon Q recommended a managed static delivery path.",
      highlights: ["Low operational overhead", "HTTPS-ready CDN"],
      nextActions: ["Review domain and SSL certificate requirements."]
    });
  });

  const prompt = [
    "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 HTML/CSS/JS만 (순수 웹)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.ok(!("status" in response));
  assert.match(requestedPrompt, /정적 사이트/);
  assert.match(requestedPrompt, /Do not artificially limit the architecture to one resource per type/);
  assert.match(requestedPrompt, /ArchitectureDecisionSpace/);
  assert.match(requestedPrompt, /static_cdn_site/);
  assert.match(requestedPrompt, /hardConstraints/);
  assert.match(requestedPrompt, /preferredPatterns/);
  assert.match(requestedPrompt, /coverageRequirements/);
  assert.match(requestedPrompt, /not a fixed skeleton/);
  assert.doesNotMatch(requestedPrompt, /Clarification choice mapping rules/);
  const payload = requestedPayload as {
    architectureDecisionSpace?: {
      answerProfile?: {
        traffic?: string;
        frontend?: string;
        region?: string;
        upload?: string;
        realtime?: string;
        management?: string;
        availability?: string;
        budget?: string;
      };
      hardConstraints?: string[];
      preferredPatterns?: Array<{ id?: string; typicalNodeTypes?: string[] }>;
    };
  };
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.traffic, "medium");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.frontend, "static");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.region, "korea");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.upload, "none");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.realtime, "none");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.management, "fully_managed");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.availability, "99.9");
  assert.equal(payload.architectureDecisionSpace?.answerProfile?.budget, "low");
  assert.ok(payload.architectureDecisionSpace?.hardConstraints?.some((constraint) => /Database not required/.test(constraint)));
  assert.ok(payload.architectureDecisionSpace?.preferredPatterns?.some((pattern) => pattern.id === "static_cdn_site"));
  assert.equal(response.metadata.source, "amazon_q");
  assert.equal(response.title, "Cost Optimized Static Site");
  assert.equal(response.architectureJson.nodes[0]?.type, "S3");
  assert.equal(response.llmExplanation?.fallbackUsed, false);
  assert.equal(response.llmExplanation?.providerMetadata?.provider, "amazon_q");
});

test("createAmazonQArchitectureDraftResponse accepts panel-backed ResourceType values from Amazon Q", async () => {
  let requestedPrompt = "";
  let requestedPayload: unknown;
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompt = request.prompt;
    requestedPayload = request.payload;

    return JSON.stringify({
      status: "preview",
      title: "Panel Catalog Resources",
      architectureJson: {
        nodes: [
          {
            id: "container-cluster",
            type: "EKS_CLUSTER",
            label: "EKS Cluster",
            positionX: 120,
            positionY: 180,
            config: {}
          },
          {
            id: "app-autoscaling",
            type: "AUTO_SCALING_GROUP",
            label: "Auto Scaling Group",
            positionX: 360,
            positionY: 180,
            config: {}
          },
          {
            id: "state-table",
            type: "DYNAMODB_TABLE",
            label: "DynamoDB Table",
            positionX: 600,
            positionY: 180,
            config: {}
          },
          {
            id: "work-queue",
            type: "SQS_QUEUE",
            label: "SQS Queue",
            positionX: 840,
            positionY: 180,
            config: {}
          }
        ],
        edges: []
      },
      requirementCoverage: [
        {
          answer: "panel catalog compute and queue resources",
          status: "satisfied",
          capability: "selectedPattern: panel_catalog_resource_brief; rejectedPatterns: standard web templates are not needed; container workers and autoscaling job processing",
          nodes: ["container-cluster", "app-autoscaling", "work-queue"],
          assumption: "The requested panel resources are represented directly."
        },
        {
          answer: "DynamoDB Table data requirement",
          status: "satisfied",
          capability: "data persistence",
          nodes: ["state-table"],
          assumption: "DynamoDB Table is the requested persisted state store."
        }
      ]
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "Required components: EKS Cluster, Auto Scaling Group, DynamoDB Table, and SQS Queue.",
        "Architecture flow: EKS workers process SQS queue jobs and store state in DynamoDB.",
        "Validation checklist: include those resource-panel components as ResourceNode.type values."
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  const payload = requestedPayload as { supportedResourceTypes?: string[] };
  const sharedResourceTypes = new Set(
    resourceDefinitions
      .map((definition) => definition.resourceType)
      .filter((resourceType) => resourceType !== "UNKNOWN")
  );

  assert.match(requestedPrompt, /EKS_CLUSTER/);
  assert.deepEqual(new Set(payload.supportedResourceTypes), sharedResourceTypes);
  assert.deepEqual(
    response.architectureJson.nodes.map((node) => node.type),
    ["EKS_CLUSTER", "AUTO_SCALING_GROUP", "DYNAMODB_TABLE", "SQS_QUEUE"]
  );
});

test("createAmazonQArchitectureDraftResponse creates deterministic decision spaces that vary by answer profile", async () => {
  const staticPrompt = createStaticWebsiteCompletePrompt("file upload: none no file upload text only");
  const imageUploadPrompt = createStaticWebsiteCompletePrompt("file upload: image upload only profile image");
  const firstPayloads: unknown[] = [];
  const secondPayloads: unknown[] = [];
  const imagePayloads: unknown[] = [];

  await createAmazonQArchitectureDraftResponse(
    { prompt: staticPrompt },
    {
      provider: createFakeAmazonQProvider((request) => {
        firstPayloads.push(request.payload);
        return JSON.stringify(createStaticPreview(["site-bucket", "cdn"]));
      }),
      creditPolicy: confirmedCreditPolicy
    }
  );

  await createAmazonQArchitectureDraftResponse(
    { prompt: staticPrompt },
    {
      provider: createFakeAmazonQProvider((request) => {
        secondPayloads.push(request.payload);
        return JSON.stringify(createStaticPreview(["site-bucket", "cdn"]));
      }),
      creditPolicy: confirmedCreditPolicy
    }
  );

  await createAmazonQArchitectureDraftResponse(
    { prompt: imageUploadPrompt },
    {
      provider: createFakeAmazonQProvider((request) => {
        imagePayloads.push(request.payload);
        return JSON.stringify(createStaticPreview(["site-bucket", "cdn"]));
      }),
      creditPolicy: confirmedCreditPolicy
    }
  );

  const firstDecisionSpace = readDecisionSpace(firstPayloads[0]);
  const secondDecisionSpace = readDecisionSpace(secondPayloads[0]);
  const imageDecisionSpace = readDecisionSpace(imagePayloads[0]);

  assert.deepEqual(secondDecisionSpace, firstDecisionSpace);
  assert.equal(firstDecisionSpace.answerProfile.upload, "none");
  assert.equal(imageDecisionSpace.answerProfile.upload, "image");
  assert.notDeepEqual(imageDecisionSpace, firstDecisionSpace);
  assert.ok(
    imageDecisionSpace.preferredPatterns.some((pattern: { id?: string }) => pattern.id === "direct_media_upload")
  );
});

test("createAmazonQArchitectureDraftResponse asks conditional tradeoff questions before calling Amazon Q", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const prompt = [
    "website type: dynamic SPA website",
    "traffic: daily traffic 1000 concurrent users 50",
    "database: PostgreSQL database required",
    "frontend: React/Vue/Angular SPA framework",
    "backend: complex backend business logic with Spring Boot or Django",
    "region: global users including US and Europe",
    "budget cost: 100 monthly",
    "SSL HTTPS: required",
    "file upload: image upload only",
    "realtime: real-time notification",
    "management preference: semi-managed operations",
    "loading time: 1 second",
    "website size: 10MB-100MB",
    "traffic pattern: time of day daytime peak",
    "downtime tolerance: 99.99% availability"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a conditional clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.match(response.question, /월 \$100 예산과 99\.99% 가용성/);
  assert.deepEqual(response.suggestions, [
    "월 $100 예산을 유지하고 99.9% 수준으로 완화",
    "99.99% 가용성을 우선하고 예산 초과 허용",
    "목표 아키텍처는 99.99%로 그리고 비용 초과 경고 표시"
  ]);
});

test("createAmazonQArchitectureDraftResponse sends dynamic global website constraints to Amazon Q", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Incomplete Dynamic Global Website",
        architectureJson: {
          nodes: [
            {
              id: "frontend-bucket",
              type: "S3",
              label: "SPA Assets Bucket",
              positionX: 120,
              positionY: 180,
              config: {}
            },
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Public Entry",
              positionX: 360,
              positionY: 180,
              config: {}
            }
          ],
          edges: [
            {
              id: "cdn-to-frontend",
              sourceId: "cdn",
              targetId: "frontend-bucket",
              label: "origin"
            }
          ]
        },
        requirementCoverage: sampleRequirementCoverage(["frontend-bucket", "cdn"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Dynamic Global Website Practice Architecture",
      architectureJson: {
        nodes: [
          {
            id: "frontend-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 180,
            config: {}
          },
          {
            id: "media-bucket",
            type: "S3",
            label: "Image Media Bucket",
            positionX: 120,
            positionY: 340,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Public Entry",
            positionX: 360,
            positionY: 180,
            config: {}
          },
          {
            id: "app-load-balancer",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 180,
            config: {}
          },
          {
            id: "https-listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTPS Listener",
            positionX: 600,
            positionY: 320,
            config: {}
          },
          {
            id: "app-server-a",
            type: "EC2",
            label: "App Server A",
            positionX: 840,
            positionY: 120,
            config: {}
          },
          {
            id: "app-server-b",
            type: "EC2",
            label: "App Server B",
            positionX: 840,
            positionY: 280,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "Multi-AZ DB Subnet Group",
            positionX: 1080,
            positionY: 200,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "PostgreSQL Multi-AZ Database",
            positionX: 1360,
            positionY: 200,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-frontend",
            sourceId: "cdn",
            targetId: "frontend-bucket",
            label: "origin"
          },
          {
            id: "cdn-to-alb",
            sourceId: "cdn",
            targetId: "app-load-balancer",
            label: "api origin"
          },
          {
            id: "listener-to-alb",
            sourceId: "https-listener",
            targetId: "app-load-balancer",
            label: "listens"
          },
          {
            id: "alb-to-app-a",
            sourceId: "app-load-balancer",
            targetId: "app-server-a",
            label: "routes"
          },
          {
            id: "alb-to-app-b",
            sourceId: "app-load-balancer",
            targetId: "app-server-b",
            label: "routes"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["frontend-bucket", "cdn"]),
        {
          answer: "complex backend business logic",
          status: "satisfied",
          capability: "complex_backend_api",
          nodes: ["app-load-balancer", "https-listener", "app-server-a", "app-server-b"]
        },
        {
          answer: "PostgreSQL database required",
          status: "satisfied",
          capability: "relational_database_multi_az",
          nodes: ["database", "db-subnet-group"],
          assumption: "RDS Multi-AZ is required for the 99.99% availability target."
        },
        {
          answer: "image upload only",
          status: "satisfied",
          capability: "image_upload",
          nodes: ["media-bucket"],
          assumption: "Browser uses presigned upload URLs for direct S3 image upload."
        },
        {
          answer: "real-time notification",
          status: "satisfied",
          capability: "realtime_notification",
          nodes: ["app-load-balancer", "app-server-a", "app-server-b"],
          assumption: "Realtime notification is represented as an SSE notification path through the backend tier."
        },
        {
          answer: "budget cost 100 monthly plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["app-load-balancer", "app-server-a", "app-server-b", "database"],
          assumption: "Cost warning: the selected high-availability pattern can exceed the low monthly budget."
        }
      ]
    });
  });

  const prompt = [
    "website type: dynamic SPA website",
    "traffic: daily traffic 1000 concurrent users 50",
    "database: PostgreSQL database required",
    "frontend: React/Vue/Angular SPA framework",
    "backend: complex backend business logic with Spring Boot or Django",
    "region: global users including US and Europe",
    "budget cost: 100 monthly",
    "SSL HTTPS: required",
    "file upload: image upload only",
    "realtime: real-time notification",
    "management preference: semi-managed operations",
    "loading time: 1 second",
    "website size: 10MB-100MB",
    "traffic pattern: time of day daytime peak",
    "downtime tolerance: 99.99% availability",
    "tradeoff: target architecture with cost warning",
    "global deployment: CloudFront global plus API/RDS single region",
    "realtime implementation: WebSocket connection path"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /dynamic SPA website/);
  assert.match(requestedPrompts[0] ?? "", /Amazon Q Architecture Brief/);
  assert.match(requestedPrompts[0] ?? "", /Derived Architecture Requirements/);
  assert.match(requestedPrompts[0] ?? "", /Required Architecture Flows/);
  assert.match(requestedPrompts[0] ?? "", /Validation Checklist/);
  assert.match(requestedPrompts[0] ?? "", /ArchitectureDecisionSpace/);
  assert.match(requestedPrompts[0] ?? "", /Monthly \$100 budget conflicts with 99\.99% availability/);
  assert.match(requestedPrompts[0] ?? "", /global_static_delivery_single_region_api/);
  assert.match(requestedPrompts[0] ?? "", /high_availability_multi_az_target/);
  assert.match(requestedPrompts[1] ?? "", /Do not return the same topology/);
  assert.match(requestedPrompts[1] ?? "", /Amazon Q Architecture Brief/);
  assert.match(requestedPrompts[1] ?? "", /requirementCoverage does not explain/);
  assert.match(requestedPrompts[1] ?? "", /image upload/);
  assert.match(requestedPrompts[1] ?? "", /real-time notification/);
  assert.match(requestedPrompts[1] ?? "", /cost warning/);
  assert.equal(response.title, "Dynamic Global Website Practice Architecture");
});

test("createAmazonQArchitectureDraftResponse respects gated choices for korea-only no-upload no-realtime answers", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    return JSON.stringify({
      status: "preview",
      title: "Korea Simple API Practice Architecture",
      architectureJson: {
        nodes: [
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 160,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Static Entry",
            positionX: 360,
            positionY: 160,
            config: {}
          },
          {
            id: "alb",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 160,
            config: {}
          },
          {
            id: "listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTP Listener",
            positionX: 600,
            positionY: 300,
            config: {}
          },
          {
            id: "app-a",
            type: "EC2",
            label: "API Server A",
            positionX: 840,
            positionY: 100,
            config: {}
          },
          {
            id: "app-b",
            type: "EC2",
            label: "API Server B",
            positionX: 840,
            positionY: 260,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 1080,
            positionY: 160,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "PostgreSQL Multi-AZ Database",
            positionX: 1360,
            positionY: 160,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-spa",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "static origin"
          },
          {
            id: "alb-to-app-a",
            sourceId: "alb",
            targetId: "app-a",
            label: "routes"
          },
          {
            id: "alb-to-app-b",
            sourceId: "alb",
            targetId: "app-b",
            label: "routes"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["spa-bucket", "cdn", "alb", "listener", "app-a", "app-b"]),
        {
          answer: "no file upload",
          status: "satisfied",
          capability: "text_only_data",
          nodes: ["database"],
          assumption: "No upload or media flow is modeled."
        },
        {
          answer: "no realtime",
          status: "satisfied",
          capability: "request_response_only",
          nodes: ["alb", "app-a", "app-b"],
          assumption: "No realtime channel is modeled."
        },
        {
          answer: "99.99% availability with database",
          status: "satisfied",
          capability: "rds_multi_az",
          nodes: ["db-subnet-group", "database"],
          assumption: "RDS Multi-AZ is configured for the availability target."
        },
        {
          answer: "budget cost 100 monthly plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["alb", "app-a", "app-b", "database"],
          assumption: "Cost warning: the high-availability pattern may exceed the low budget."
        }
      ]
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createKoreaNoUploadNoRealtimePrompt()
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 1);
  assert.match(requestedPrompts[0] ?? "", /ArchitectureDecisionSpace/);
  assert.match(requestedPrompts[0] ?? "", /File upload not required/);
  assert.match(requestedPrompts[0] ?? "", /Realtime not required/);
  assert.match(requestedPrompts[0] ?? "", /Region scope is Korea only/);
  assert.equal(response.title, "Korea Simple API Practice Architecture");
});

test("createAmazonQArchitectureDraftResponse regenerates previews that violate no-upload and no-realtime choices", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Invalid Korea Website",
        architectureJson: {
          nodes: [
            {
              id: "spa-bucket",
              type: "S3",
              label: "SPA Assets Bucket",
              positionX: 120,
              positionY: 160,
              config: {}
            },
            {
              id: "upload-bucket",
              type: "S3",
              label: "Upload Storage Bucket",
              positionX: 120,
              positionY: 320,
              config: {}
            },
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Static Entry",
              positionX: 360,
              positionY: 160,
              config: {}
            },
            {
              id: "websocket-api",
              type: "API_GATEWAY_REST_API",
              label: "WebSocket Notification API",
              positionX: 600,
              positionY: 160,
              config: {}
            },
            {
              id: "app",
              type: "EC2",
              label: "Single API Server",
              positionX: 840,
              positionY: 160,
              config: {}
            },
            {
              id: "db-subnet-group",
              type: "DB_SUBNET_GROUP",
              label: "DB Subnet Group",
              positionX: 1080,
              positionY: 160,
              config: {}
            },
            {
              id: "database",
              type: "RDS",
              label: "PostgreSQL Multi-AZ Database",
              positionX: 1360,
              positionY: 160,
              config: {
                multiAz: true
              }
            }
          ],
          edges: [
            {
              id: "cdn-to-spa",
              sourceId: "cdn",
              targetId: "spa-bucket",
              label: "static origin"
            }
          ]
        },
        requirementCoverage: [
          ...sampleRequirementCoverage(["spa-bucket", "cdn", "app"]),
          {
            answer: "websocket notification",
            status: "satisfied",
            capability: "realtime_notification",
            nodes: ["websocket-api"],
            assumption: "WebSocket notifications are included."
          },
          {
            answer: "image upload",
            status: "satisfied",
            capability: "upload_media",
            nodes: ["upload-bucket"],
            assumption: "Presigned URL upload flow is included."
          },
          {
            answer: "99.99% database",
            status: "satisfied",
            capability: "rds_multi_az",
            nodes: ["db-subnet-group", "database"],
            assumption: "RDS Multi-AZ is configured."
          }
        ]
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Corrected Korea Website",
      architectureJson: {
        nodes: [
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 160,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Static Entry",
            positionX: 360,
            positionY: 160,
            config: {}
          },
          {
            id: "alb",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 160,
            config: {}
          },
          {
            id: "listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTP Listener",
            positionX: 600,
            positionY: 300,
            config: {}
          },
          {
            id: "app-a",
            type: "EC2",
            label: "API Server A",
            positionX: 840,
            positionY: 100,
            config: {}
          },
          {
            id: "app-b",
            type: "EC2",
            label: "API Server B",
            positionX: 840,
            positionY: 260,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 1080,
            positionY: 160,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "PostgreSQL Multi-AZ Database",
            positionX: 1360,
            positionY: 160,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-spa",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "static origin"
          },
          {
            id: "alb-to-app-a",
            sourceId: "alb",
            targetId: "app-a",
            label: "routes"
          },
          {
            id: "alb-to-app-b",
            sourceId: "alb",
            targetId: "app-b",
            label: "routes"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["spa-bucket", "cdn", "alb", "listener", "app-a", "app-b"]),
        {
          answer: "no file upload",
          status: "satisfied",
          capability: "text_only_data",
          nodes: ["database"],
          assumption: "No upload or media flow is modeled."
        },
        {
          answer: "no realtime",
          status: "satisfied",
          capability: "request_response_only",
          nodes: ["alb", "app-a", "app-b"],
          assumption: "No realtime channel is modeled."
        },
        {
          answer: "99.99% database",
          status: "satisfied",
          capability: "rds_multi_az",
          nodes: ["db-subnet-group", "database"],
          assumption: "RDS Multi-AZ is configured."
        },
        {
          answer: "budget cost 100 monthly plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["alb", "app-a", "app-b", "database"],
          assumption: "Cost warning: the high-availability pattern may exceed the low budget."
        }
      ]
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createKoreaNoUploadNoRealtimePrompt()
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /selected no file upload/);
  assert.match(requestedPrompts[1] ?? "", /selected no realtime feature/);
  assert.match(requestedPrompts[1] ?? "", /cost warning/);
  assert.equal(response.title, "Corrected Korea Website");
  assert.equal(response.architectureJson.nodes.some((node) => node.id === "upload-bucket"), false);
  assert.equal(response.architectureJson.nodes.some((node) => node.id === "websocket-api"), false);
});

test("createAmazonQArchitectureDraftResponse sends detailed architecture briefs directly to Amazon Q", async () => {
  let requestedPrompt = "";
  let requestedInstructions = "";
  let requestedPayload: unknown;
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompt = request.prompt;
    requestedInstructions = request.instructions;
    requestedPayload = request.payload;
    return JSON.stringify({
      status: "preview",
      title: "Detailed Global Dynamic Website",
      architectureJson: {
        nodes: [
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 160,
            config: {}
          },
          {
            id: "media-bucket",
            type: "S3",
            label: "Image Upload Bucket",
            positionX: 120,
            positionY: 320,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "Global CloudFront",
            positionX: 360,
            positionY: 160,
            config: {}
          },
          {
            id: "alb",
            type: "LOAD_BALANCER",
            label: "Application Load Balancer",
            positionX: 600,
            positionY: 160,
            config: {}
          },
          {
            id: "https-listener",
            type: "LOAD_BALANCER_LISTENER",
            label: "HTTPS Listener",
            positionX: 600,
            positionY: 320,
            config: {}
          },
          {
            id: "app-a",
            type: "EC2",
            label: "App Target A",
            positionX: 840,
            positionY: 120,
            config: {}
          },
          {
            id: "app-b",
            type: "EC2",
            label: "App Target B",
            positionX: 840,
            positionY: 280,
            config: {}
          },
          {
            id: "database-subnets",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 1080,
            positionY: 160,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "RDS Multi-AZ",
            positionX: 1360,
            positionY: 160,
            config: { multiAz: true }
          },
          {
            id: "realtime-api",
            type: "API_GATEWAY_REST_API",
            label: "Realtime WebSocket Assumption",
            positionX: 600,
            positionY: 480,
            config: {}
          }
        ],
        edges: [
          {
            id: "cdn-to-spa",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "static origin"
          },
          {
            id: "cdn-to-alb",
            sourceId: "cdn",
            targetId: "alb",
            label: "api origin"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["spa-bucket", "cdn", "alb", "app-a", "app-b"]),
        {
          answer: "99.99% availability and database",
          status: "satisfied",
          capability: "rds_multi_az",
          nodes: ["database-subnets", "database"],
          assumption: "RDS Multi-AZ is represented for the availability target."
        },
        {
          answer: "realtime notification",
          status: "satisfied",
          capability: "websocket_notification",
          nodes: ["realtime-api"],
          assumption: "Realtime notification is represented as a WebSocket/SSE path."
        },
        {
          answer: "image upload",
          status: "satisfied",
          capability: "upload_media",
          nodes: ["media-bucket"],
          assumption: "Image upload uses a direct upload/media handling path with validation assumptions."
        },
        {
          answer: "monthly 100 dollar budget plus 99.99% availability",
          status: "warning",
          capability: "cost_warning",
          nodes: ["alb", "app-a", "app-b", "database"],
          assumption: "Cost warning: this 99.99% target can exceed the monthly 100 dollar budget."
        }
      ]
    });
  });

  const prompt = [
    "월 100달러 예산으로 글로벌 동적 웹사이트 아키텍처를 설계해주세요.",
    "핵심 요구사항: 99.99% 가용성, 글로벌 사용자, React SPA, 복잡한 백엔드 로직, 실시간 알림, 이미지 업로드, 1초 이내 페이지 로딩",
    "필수 포함 컴포넌트: CloudFront, S3, Application Load Balancer, HTTPS listener, EC2 Auto Scaling Group, RDS Multi-AZ, WebSocket/API Gateway, VPC, CloudWatch, IAM",
    "아키텍처 플로우: 사용자 -> CloudFront -> S3, 사용자 -> CloudFront -> ALB -> EC2, EC2 -> RDS, 클라이언트 -> presigned URL -> S3, WebSocket 연결 경로 명시",
    "예산 최적화와 성능 최적화 방안도 함께 제안해주세요."
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.match(requestedPrompt, /Amazon Q Architecture Brief/);
  assert.match(requestedPrompt, /Persistent AWS\/Terraform reference knowledge pack/);
  assert.match(requestedPrompt, /User supplied a detailed architecture brief/);
  assert.match(requestedPrompt, /AUTO_SCALING_GROUP is a supported ResourceNode\.type/);
  assert.match(requestedPrompt, /ArchitectureDecisionSpace/);
  assert.match(requestedPrompt, /direct_media_upload/);
  assert.match(requestedInstructions, /persistent compact AWS\/Terraform referenceKnowledge payload/);
  const payload = requestedPayload as {
    referenceKnowledge?: {
      version?: string;
      size?: string;
      sourceUrls?: string[];
      guidance?: string[];
    };
    architectureDecisionSpace?: {
      unsupportedSubstitutions?: Array<{ requestedService?: string }>;
      coverageRequirements?: string[];
    };
  };
  assert.equal(payload.referenceKnowledge?.version, "aws-reference-pack-2026-07-07");
  assert.equal(payload.referenceKnowledge?.size, "compact");
  assert.equal(payload.referenceKnowledge?.sourceUrls?.includes("https://aws.amazon.com/ko/solutions/"), true);
  assert.ok((payload.referenceKnowledge?.guidance?.length ?? 0) <= 8);
  assert.equal(
    payload.architectureDecisionSpace?.unsupportedSubstitutions?.some(
      (substitution) => substitution.requestedService === "Auto Scaling Group"
    ),
    false
  );
  assert.equal(response.title, "Detailed Global Dynamic Website");
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews that fail self-validation", async () => {
  const requestedPrompts: string[] = [];
  const requestedPayloads: unknown[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);
    requestedPayloads.push(request.payload);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Invalid Serverless Draft",
        architectureJson: {
          nodes: [
            {
              id: "app-server",
              type: "EC2",
              label: "Application Server",
              positionX: 120,
              positionY: 180,
              config: {}
            }
          ],
          edges: []
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Serverless Draft",
      architectureJson: {
        nodes: [
          {
            id: "api-gateway",
            type: "API_GATEWAY_REST_API",
            label: "Serverless API",
            positionX: 120,
            positionY: 180,
            config: {}
          },
          {
            id: "lambda-function",
            type: "LAMBDA",
            label: "Serverless Function",
            positionX: 360,
            positionY: 180,
            config: {}
          },
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 120,
            positionY: 340,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 360,
            positionY: 340,
            config: {}
          }
        ],
        edges: [
          {
            id: "api-gateway-to-lambda-function",
            sourceId: "api-gateway",
            targetId: "lambda-function"
          },
          {
            id: "cdn-to-spa-bucket",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: sampleRequirementCoverage(["api-gateway", "lambda-function", "spa-bucket", "cdn"])
    });
  });

  const prompt = [
    "SPA (Single Page Application) (React/Vue 등)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)이지만 서버리스로 만들고 EC2는 쓰지 마.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /Persistent AWS\/Terraform reference knowledge pack/);
  assert.match(requestedPrompts[1] ?? "", /Persistent AWS\/Terraform reference knowledge pack/);
  assert.match(requestedPrompts[1] ?? "", /failed SketchCatch self-validation/);
  assert.match(requestedPrompts[1] ?? "", /preview includes EC2/);
  for (const payload of requestedPayloads) {
    const referenceKnowledge = (payload as { referenceKnowledge?: { size?: string } }).referenceKnowledge;
    assert.equal(referenceKnowledge?.size, "compact");
  }
  assert.equal(response.title, "Serverless Draft");
  assert.equal(response.architectureJson.nodes.some((node) => node.type === "EC2"), false);
  assert.equal(response.architectureJson.nodes.some((node) => node.type === "LAMBDA"), true);
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with broken area layout", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Broken Area Layout Draft",
        architectureJson: {
          nodes: [
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
              positionX: 260,
              positionY: 180,
              config: {
                vpcId: "vpc-main"
              }
            },
            {
              id: "private-subnet-a",
              type: "SUBNET",
              label: "Private Subnet A",
              positionX: 320,
              positionY: 220,
              config: {
                vpcId: "vpc-main"
              }
            },
            {
              id: "web-server",
              type: "EC2",
              label: "Web Server",
              positionX: 420,
              positionY: 230,
              config: {
                subnetId: "public-subnet-a"
              }
            }
          ],
          edges: [
            {
              id: "vpc-main-to-public-subnet-a",
              sourceId: "vpc-main",
              targetId: "public-subnet-a",
              label: "contains"
            }
          ]
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Clean Area Layout Draft",
      architectureJson: {
        nodes: [
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
            positionX: 130,
            positionY: 130,
            config: {
              vpcId: "vpc-main"
            }
          },
          {
            id: "web-server",
            type: "EC2",
            label: "Web Server",
            positionX: 160,
            positionY: 150,
            config: {
              subnetId: "public-subnet-a"
            }
          },
          {
            id: "spa-bucket",
            type: "S3",
            label: "SPA Assets Bucket",
            positionX: 420,
            positionY: 100,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 620,
            positionY: 100,
            config: {}
          },
          {
            id: "db-subnet-group",
            type: "DB_SUBNET_GROUP",
            label: "DB Subnet Group",
            positionX: 420,
            positionY: 280,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "Application Database",
            positionX: 620,
            positionY: 280,
            config: {
              multiAz: true
            }
          }
        ],
        edges: [
          {
            id: "vpc-main-to-public-subnet-a",
            sourceId: "vpc-main",
            targetId: "public-subnet-a",
            label: "contains"
          },
          {
            id: "cdn-to-spa-bucket",
            sourceId: "cdn",
            targetId: "spa-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: [
        ...sampleRequirementCoverage(["web-server", "spa-bucket", "cdn", "database", "db-subnet-group"]),
        {
          answer: "database required",
          status: "satisfied",
          capability: "relational_database_multi_az",
          nodes: ["database", "db-subnet-group"],
          assumption: "RDS Multi-AZ is represented for availability-sensitive database requirements."
        }
      ]
    });
  });

  const prompt = [
    "어떤 종류의 웹사이트인가요? API 서버 (모바일 앱 백엔드)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스가 필요한가요? 간단한 데이터 (사용자 정보, 게시글 등 < 10GB)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드가 필요한가요? 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10-50만원 (적당한 성능)입니다.",
    "SSL 인증서(HTTPS)가 필요한가요? 필수 (보안 중요)입니다.",
    "파일 업로드 기능이 있나요? 없음 (텍스트만)입니다.",
    "실시간 기능이 필요한가요? 필요 없음입니다.",
    "관리 복잡도 선호도는 반관리형 (일부 서버 관리)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB-100MB (일반적인 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /Layout rules: VPC, SUBNET, and SECURITY_GROUP/);
  assert.match(requestedPrompts[1] ?? "", /failed SketchCatch self-validation/);
  assert.match(requestedPrompts[1] ?? "", /fully inside parent area/);
  assert.match(requestedPrompts[1] ?? "", /overlap without full containment/);
  assert.equal(response.title, "Clean Area Layout Draft");
  assert.deepEqual(
    response.architectureJson.nodes.find((node) => node.id === "web-server")?.config,
    {
      subnetId: "public-subnet-a"
    }
  );
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with arrows crossing unrelated resources", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Blocked Edge Draft",
        architectureJson: {
          nodes: [
            {
              id: "app-server",
              type: "EC2",
              label: "App Server",
              positionX: 100,
              positionY: 100,
              config: {}
            },
            {
              id: "database",
              type: "RDS",
              label: "Database",
              positionX: 500,
              positionY: 100,
              config: {}
            },
            {
              id: "asset-bucket",
              type: "S3",
              label: "Asset Bucket",
              positionX: 300,
              positionY: 110,
              config: {}
            }
          ],
          edges: [
            {
              id: "app-server-to-database",
              sourceId: "app-server",
              targetId: "database",
              label: "writes"
            }
          ]
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Clear Edge Draft",
      architectureJson: {
        nodes: [
          {
            id: "app-server",
            type: "EC2",
            label: "App Server",
            positionX: 100,
            positionY: 100,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "Database",
            positionX: 500,
            positionY: 100,
            config: {}
          },
          {
            id: "asset-bucket",
            type: "S3",
            label: "Asset Bucket",
            positionX: 300,
            positionY: 260,
            config: {}
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 100,
            positionY: 420,
            config: {}
          }
        ],
        edges: [
          {
            id: "app-server-to-database",
            sourceId: "app-server",
            targetId: "database",
            label: "writes"
          },
          {
            id: "cdn-to-asset-bucket",
            sourceId: "cdn",
            targetId: "asset-bucket",
            label: "origin"
          }
        ]
      },
      requirementCoverage: sampleRequirementCoverage(["app-server", "database", "asset-bucket", "cdn"])
    });
  });

  const prompt = [
    "?대뼡 醫낅쪟???뱀궗?댄듃?멸??? API ?쒕쾭 (紐⑤컮????諛깆뿏???낅땲??",
    "?덉긽 ?몃옒??洹쒕え??以묎컙 洹쒕え (??1,000紐? ?숈떆 50紐??낅땲?? daily traffic 1000 concurrent users 50",
    "?곗씠?곕쿋?댁뒪媛 ?꾩슂?쒓??? 媛꾨떒???곗씠??(?ъ슜???뺣낫, 寃뚯떆湲 ??< 10GB)?낅땲??",
    "?꾨줎?몄뿏??湲곗닠? React/Vue/Angular (SPA ?꾨젅?꾩썙???낅땲??",
    "諛깆뿏?쒓? ?꾩슂?쒓??? 媛꾨떒??API (Node.js, Python Flask ???낅땲??",
    "二쇱슂 ?ъ슜??吏??? ?쒓뎅留?(?쒖슱 由ъ쟾)?낅땲?? korea seoul region",
    "???덉궛 踰붿쐞??10-50留뚯썝 (?곷떦???깅뒫)?낅땲?? budget cost 100000 KRW",
    "SSL ?몄쬆??HTTPS)媛 ?꾩슂?쒓??? ?꾩닔 (蹂댁븞 以묒슂)?낅땲??",
    "?뚯씪 ?낅줈??湲곕뒫???덈굹?? ?놁쓬 (?띿뒪?몃쭔)?낅땲??",
    "?ㅼ떆媛?湲곕뒫???꾩슂?쒓??? ?꾩슂 ?놁쓬?낅땲?? no realtime chat notification",
    "愿由?蹂듭옟???좏샇?꾨뒗 諛섍?由ы삎 (?쇰? ?쒕쾭 愿由??낅땲?? managed operations",
    "?섏씠吏 濡쒕뵫 ?쒓컙 紐⑺몴??3珥??대궡 (?곷떦???낅땲?? loading time 3 seconds",
    "?꾩껜 ?뱀궗?댄듃 ?ш린??10MB-100MB (?쇰컲?곸씤 ?ъ씠???낅땲??",
    "?몃옒???⑦꽩? ?쇱젙??(?섎（ 醫낆씪 鍮꾩듂)?낅땲?? traffic pattern steady",
    "?쒕퉬??以묐떒 ?덉슜 ?쒓컙? ??1?쒓컙 ?대궡 (99.9% 媛?⑹꽦)?낅땲??"
  ].join("\n");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /do not route visible arrows through unrelated resources/);
  assert.match(requestedPrompts[1] ?? "", /edge path crosses unrelated resource/);
  assert.equal(response.title, "Clear Edge Draft");
  assert.equal(response.architectureJson.nodes.find((node) => node.id === "asset-bucket")?.positionY, 260);
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with overlapping node labels", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Cramped Label Draft",
        architectureJson: {
          nodes: [
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Public Entry",
              positionX: 280,
              positionY: 120,
              config: {}
            },
            {
              id: "logs",
              type: "CLOUDWATCH_LOG_GROUP",
              label: "Lambda Logs",
              positionX: 350,
              positionY: 125,
              config: {}
            },
            {
              id: "bucket",
              type: "S3",
              label: "Static Content Bucket",
              positionX: 430,
              positionY: 120,
              config: {}
            }
          ],
          edges: []
        },
        requirementCoverage: sampleRequirementCoverage(["cdn", "logs", "bucket"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Readable Label Draft",
      architectureJson: {
        nodes: [
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Public Entry",
            positionX: 120,
            positionY: 120,
            config: {}
          },
          {
            id: "logs",
            type: "CLOUDWATCH_LOG_GROUP",
            label: "Lambda Logs",
            positionX: 420,
            positionY: 120,
            config: {}
          },
          {
            id: "bucket",
            type: "S3",
            label: "Static Content Bucket",
            positionX: 720,
            positionY: 120,
            config: {}
          }
        ],
        edges: []
      },
      requirementCoverage: sampleRequirementCoverage(["cdn", "logs", "bucket"])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createStaticWebsiteCompletePrompt("file upload: none no file upload text only")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /overlapping visual or label bounds/);
  assert.equal(response.title, "Readable Label Draft");
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with an S3 node fully overlapping another resource", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Overlapped S3 Draft",
        architectureJson: {
          nodes: [
            {
              id: "cdn",
              type: "CLOUDFRONT",
              label: "CloudFront Public Entry",
              positionX: 240,
              positionY: 120,
              config: {}
            },
            {
              id: "site-bucket",
              type: "S3",
              label: "Static Content Bucket",
              positionX: 240,
              positionY: 120,
              config: {}
            }
          ],
          edges: []
        },
        requirementCoverage: sampleRequirementCoverage(["cdn", "site-bucket"])
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Separated S3 Draft",
      architectureJson: {
        nodes: [
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront Public Entry",
            positionX: 120,
            positionY: 120,
            config: {}
          },
          {
            id: "site-bucket",
            type: "S3",
            label: "Static Content Bucket",
            positionX: 420,
            positionY: 120,
            config: {}
          }
        ],
        edges: []
      },
      requirementCoverage: sampleRequirementCoverage(["cdn", "site-bucket"])
    });
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: createStaticWebsiteCompletePrompt("file upload: none no file upload text only")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /site-bucket \(S3\).*overlapping visual or label bounds/);
  assert.equal(response.title, "Separated S3 Draft");
});

test("createAmazonQArchitectureDraftResponse asks the global deployment scope question with readable Korean text", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "website type: dynamic SPA website",
        "traffic: medium daily traffic 1000 concurrent users 50",
        "database: PostgreSQL database required",
        "frontend: React/Vue/Angular SPA framework",
        "backend: simple API Node.js",
        "region: global users including US and Europe",
        "budget cost: 100 monthly",
        "SSL HTTPS: required",
        "file upload: none no file upload text only",
        "realtime: none no realtime features",
        "management preference: semi-managed operations",
        "loading time: 1 second",
        "website size: 10MB-100MB",
        "traffic pattern: steady traffic",
        "downtime tolerance: 99.9% availability"
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "글로벌 사용자와 1초 로딩 목표를 어떤 범위로 설계할까요?");
  assert.deepEqual(response.suggestions, [
    "CloudFront 글로벌 + API/RDS는 단일 리전",
    "다중 리전 API까지 포함",
    "MVP는 단일 리전, 추후 다중 리전 확장 경고 표시"
  ]);
});

test("createAmazonQArchitectureDraftResponse asks the realtime implementation question with readable Korean text", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "website type: dynamic SPA website",
        "traffic: medium daily traffic 1000 concurrent users 50",
        "database: PostgreSQL database required",
        "frontend: React/Vue/Angular SPA framework",
        "backend: simple API Node.js",
        "region: Korea only Seoul region ap-northeast-2",
        "budget cost: 100 monthly",
        "SSL HTTPS: required",
        "file upload: none no file upload text only",
        "realtime: real-time notification",
        "management preference: semi-managed operations",
        "loading time: 1 second",
        "website size: 10MB-100MB",
        "traffic pattern: steady traffic",
        "downtime tolerance: 99.9% availability"
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "실시간 알림은 어떤 방식으로 표현할까요?");
  assert.deepEqual(response.suggestions, [
    "WebSocket 연결 경로",
    "SSE 단방향 알림 경로",
    "간단 폴링 방식과 비용 절감 경고"
  ]);
});

function createKoreaNoUploadNoRealtimePrompt(): string {
  return [
    "website type: dynamic SPA website with simple API and DB",
    "traffic: small daily traffic under 100 concurrent users under 10",
    "database: PostgreSQL database required",
    "frontend: React/Vue/Angular SPA framework",
    "backend: simple API Node.js or Python Flask",
    "region: Korea only Seoul region ap-northeast-2",
    "budget cost: 100 monthly",
    "SSL HTTPS: optional HTTP is acceptable",
    "file upload: none no file upload text only",
    "realtime: none no realtime features",
    "management preference: semi-managed operations",
    "loading time: 1 second",
    "website size: 10MB-100MB",
    "traffic pattern: steady traffic",
    "downtime tolerance: 99.99% availability",
    "tradeoff: target architecture with cost warning",
    "global deployment: CloudFront for static assets only, API and RDS single Seoul region",
    "database budget decision: include database"
  ].join("\n");
}

function createSketchCatchReferenceSelectionPrompt(): string {
  return [
    "웹서비스를 배포하고 싶어",
    "어떤 종류의 웹사이트인가요? 동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스가 필요한가요? 간단한 데이터 (사용자 정보, 게시글 등 < 10GB)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드가 필요한가요? 복잡한 비즈니스 로직 (Spring Boot, Django 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 50-200만원 (고성능)입니다.",
    "SSL 인증서(HTTPS)가 필요한가요? 선택사항 (HTTP도 괜찮음)입니다.",
    "파일 업로드 기능이 있나요? 없음 (텍스트만)입니다.",
    "실시간 기능이 필요한가요? 필요 없음입니다.",
    "관리 복잡도 선호도는 반관리형 (일부 서버 관리)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB-100MB (일반적인 사이트)입니다.",
    "트래픽 패턴은 시간대별 차이 (낮에 많음)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
  ].join("\n");
}

function createStaticWebsiteCompletePrompt(uploadAnswer: string): string {
  return [
    "website type: static website blog portfolio",
    "traffic: medium daily traffic 1000 concurrent users 50",
    "database: none no database static content only",
    "frontend: HTML/CSS/JS only pure web",
    "backend: none no backend static site",
    "region: Korea only Seoul region ap-northeast-2",
    "budget cost: 100 monthly minimum cost",
    "SSL HTTPS: optional HTTP is acceptable",
    uploadAnswer,
    "realtime: none no realtime features",
    "management preference: fully managed serverless",
    "loading time: 3 seconds",
    "website size: under 10MB",
    "traffic pattern: steady traffic",
    "downtime tolerance: 99.9% availability"
  ].join("\n");
}

function createStaticPreview(nodes: string[]): {
  status: "preview";
  title: string;
  architectureJson: {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      positionX: number;
      positionY: number;
      config: Record<string, unknown>;
    }>;
    edges: Array<{ id: string; sourceId: string; targetId: string; label: string }>;
  };
  requirementCoverage: ReturnType<typeof sampleRequirementCoverage>;
} {
  return {
    status: "preview",
    title: "Static Website",
    architectureJson: {
      nodes: [
        {
          id: "site-bucket",
          type: "S3",
          label: "Static Site Bucket",
          positionX: 120,
          positionY: 180,
          config: {}
        },
        {
          id: "cdn",
          type: "CLOUDFRONT",
          label: "CloudFront CDN",
          positionX: 360,
          positionY: 180,
          config: {}
        }
      ],
      edges: [
        {
          id: "cdn-to-site",
          sourceId: "cdn",
          targetId: "site-bucket",
          label: "origin"
        }
      ]
    },
    requirementCoverage: sampleRequirementCoverage(nodes)
  };
}

function readDecisionSpace(payload: unknown): {
  answerProfile: { upload?: string };
  preferredPatterns: Array<{ id?: string }>;
} {
  const decisionSpace = (payload as { architectureDecisionSpace?: unknown }).architectureDecisionSpace;

  assert.ok(decisionSpace && typeof decisionSpace === "object");

  return decisionSpace as {
    answerProfile: { upload?: string };
    preferredPatterns: Array<{ id?: string }>;
  };
}

function sampleRequirementCoverage(nodes: string[] = []): Array<{
  answer: string;
  status: string;
  capability: string;
  nodes: string[];
  assumption: string;
}> {
  return [
    {
      answer: "baseline selected answers",
      status: "satisfied",
      capability: "selectedPattern: baseline_architecture; rejectedPatterns: not applicable",
      nodes,
      assumption: "Selected answers are represented by the listed topology nodes with pattern trade-off rationale."
    }
  ];
}

function createFakeAmazonQProvider(generate: (request: Parameters<AiTextProvider["generate"]>[0]) => string): AiTextProvider {
  return {
    provider: "amazon_q",
    service: "amazon_q_business",
    model: "fake-q-application",
    generate: async (request) => {
      const text = generate(request);

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}
