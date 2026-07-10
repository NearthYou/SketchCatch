import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatSyncCommand, ChatSyncCommandInput } from "@aws-sdk/client-qbusiness";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import {
  createAmazonQArchitectureDraftProvider,
  createArchitecturePatternAttributeFilter,
  resolveArchitecturePatternIds,
  warmAmazonQArchitectureDraftProvider
} from "./aiArchitectureQBusiness.js";
import {
  createAmazonQArchitectureDraftResponse,
  createDeterministicArchitectureIntentPlan
} from "./aiArchitectureDrafts.js";

test("OpenAI-normalized pattern ids become an Amazon Q attribute filter", () => {
  assert.deepEqual(
    createArchitecturePatternAttributeFilter({
      patternIds: ["alb-asg-ec2", "github-cicd-codedeploy"]
    }),
    {
      orAllFilters: [
        {
          equalsTo: {
            name: "pattern_id",
            value: { stringValue: "alb-asg-ec2" }
          }
        },
        {
          equalsTo: {
            name: "pattern_id",
            value: { stringValue: "github-cicd-codedeploy" }
          }
        }
      ]
    }
  );
});

test("pattern selection covers compute, serverless, SPA, ECS, CI/CD, and database requests", () => {
  const cases = [
    [{ requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2"] }, "alb-asg-ec2"],
    [{ requiredResources: ["API_GATEWAY_REST_API", "LAMBDA"] }, "serverless-api"],
    [{ intent: "spa", requiredResources: ["CLOUDFRONT", "S3"] }, "spa-cloudfront-s3"],
    [{ requiredResources: ["ECS_SERVICE", "ECS_TASK_DEFINITION"] }, "ecs-fargate"],
    [{ requiredResources: ["CODEPIPELINE", "CODEDEPLOY_APP"] }, "github-cicd-codedeploy"],
    [{ requiredResources: ["RDS", "DB_SUBNET_GROUP"] }, "multi-az-rds"]
  ] as const;

  for (const [plan, expectedPatternId] of cases) {
    assert.equal(resolveArchitecturePatternIds(plan).includes(expectedPatternId), true);
  }
});

test("project answers exclude contradictory EC2 patterns and recognize Fargate", () => {
  const serverless = createDeterministicArchitectureIntentPlan([
    "Use API Gateway and Lambda only. Serverless runtime, no EC2.",
    "management preference: fully managed serverless",
    "backend: simple API"
  ].join("\n"));
  const fargate = createDeterministicArchitectureIntentPlan([
    "Use ECS Fargate service and task definition behind ALB. No EC2 capacity.",
    "management preference: semi-managed operations",
    "backend: complex business logic"
  ].join("\n"));

  assert.deepEqual(resolveArchitecturePatternIds(serverless), ["serverless-api"]);
  assert.equal(serverless?.requiredResources?.includes("EC2"), false);
  assert.deepEqual(resolveArchitecturePatternIds(fargate), ["ecs-fargate"]);
  assert.equal(fargate?.requiredResources?.includes("EC2"), false);
  assert.equal(fargate?.requiredResources?.includes("ECS_SERVICE"), true);
  assert.equal(fargate?.requiredResources?.includes("ECS_TASK_DEFINITION"), true);
});

test("architecture provider warm-up verifies every indexed pattern before user traffic", async () => {
  let patternIds: readonly string[] = [];

  await warmAmazonQArchitectureDraftProvider({
    provider: "amazon_q",
    service: "amazon_q_business",
    model: "retrieval-app",
    generate: async (request) => {
      const payload = request.payload as {
        normalizedRequirement?: { patternIds?: readonly string[] };
      };
      patternIds = payload.normalizedRequirement?.patternIds ?? [];
      return { text: "{}", outputCharacters: 2 };
    }
  });

  assert.deepEqual(patternIds, [
    "alb-asg-ec2",
    "serverless-api",
    "spa-cloudfront-s3",
    "ecs-fargate",
    "github-cicd-codedeploy",
    "multi-az-rds"
  ]);
});

test("architecture provider retrieves each selected pattern and returns a canonical plan", async () => {
  const retrievalInputs: ChatSyncCommandInput[] = [];
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async (command: ChatSyncCommand) => {
        retrievalInputs.push(command.input);
        const patternIds = readFilteredPatternIds(command);

        return {
          systemMessage: `Verified ${patternIds.join(", ")} knowledge.`,
          sourceAttributions: patternIds.map((patternId) => ({
            title: patternId,
            documentId: `sketchcatch-pattern-${patternId}-v1`,
            snippet: `Verified ${patternId} pattern.`
          }))
        };
      }
    }
  });

  const response = await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a highly available web runtime.",
    payload: {
      normalizedRequirement: {
        patternIds: ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"],
        requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2", "CODEPIPELINE", "RDS"],
        resourceQuantities: { EC2: 3 },
        runtimeTopology: {
          trafficEntry: "LOAD_BALANCER",
          compute: "EC2",
          computeCount: 3,
          placement: "private_subnets",
          spreadAcrossPrivateSubnets: true,
          autoScaling: true
        }
      },
      supportedResourceTypes: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2", "CODEPIPELINE", "RDS"]
    }
  });

  assert.equal(retrievalInputs.length, 1);
  assert.deepEqual(
    readFilteredPatternIds({ input: retrievalInputs[0]! }),
    ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]
  );
  assert.equal(retrievalInputs.every((input) => input.applicationId === "retrieval-app"), true);
  assert.equal(retrievalInputs.every((input) => input.chatMode === "RETRIEVAL_MODE"), true);
  const plan = JSON.parse(response.text) as {
    status?: string;
    patternIds?: string[];
    requiredResources?: string[];
  };
  assert.equal(plan.status, "plan");
  assert.deepEqual(plan.patternIds, ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]);
  assert.equal(plan.requiredResources?.includes("LOAD_BALANCER_TARGET_GROUP"), true);
  assert.equal(plan.requiredResources?.includes("CODEDEPLOY_DEPLOYMENT_GROUP"), true);
  assert.equal(plan.requiredResources?.includes("DB_SUBNET_GROUP"), true);

  await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create the same verified architecture again.",
    payload: {
      normalizedRequirement: {
        patternIds: ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]
      }
    }
  });

  assert.equal(retrievalInputs.length, 1, "verified pattern citations should be reused within the TTL");
});

test("architecture provider retrieves all selected patterns in one Q request", async () => {
  let startedRequestCount = 0;
  let requestedPatternIds: string[] = [];
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async (command) => {
        startedRequestCount += 1;
        requestedPatternIds = readFilteredPatternIds(command);

        return {
          systemMessage: `Verified ${requestedPatternIds.join(", ")}.`,
          sourceAttributions: requestedPatternIds.map((patternId) => ({
            documentId: `sketchcatch-pattern-${patternId}-v1`
          }))
        };
      }
    }
  });

  await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a highly available web runtime with CI/CD and RDS.",
    payload: {
      normalizedRequirement: {
        patternIds: [
          "alb-asg-ec2",
          "spa-cloudfront-s3",
          "github-cicd-codedeploy",
          "multi-az-rds"
        ]
      }
    }
  });

  assert.equal(startedRequestCount, 1);
  assert.deepEqual(requestedPatternIds, [
    "alb-asg-ec2",
    "spa-cloudfront-s3",
    "github-cicd-codedeploy",
    "multi-az-rds"
  ]);
});

test("architecture provider retries only pattern citations omitted from a batched Q response", async () => {
  const requestedPatternIds: string[][] = [];
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async (command) => {
        const patternIds = readFilteredPatternIds(command);
        requestedPatternIds.push(patternIds);
        const citedPatternIds = requestedPatternIds.length === 1
          ? patternIds.filter((patternId) => patternId !== "multi-az-rds")
          : patternIds;

        return {
          systemMessage: `Verified ${citedPatternIds.join(", ")}.`,
          sourceAttributions: citedPatternIds.map((patternId) => ({
            documentId: `sketchcatch-pattern-${patternId}-v1`
          }))
        };
      }
    }
  });

  const response = await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a highly available web runtime with CI/CD and RDS.",
    payload: {
      normalizedRequirement: {
        patternIds: ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]
      }
    }
  });

  assert.equal(JSON.parse(response.text).status, "plan");
  assert.deepEqual(requestedPatternIds, [
    ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"],
    ["multi-az-rds"]
  ]);
});

test("architecture provider reuses verified citations across provider restarts", async () => {
  const runtimeCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  let retrievalCount = 0;
  const createProvider = () => createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    runtimeCache,
    retrievalClient: {
      send: async (command) => {
        retrievalCount += 1;
        const patternIds = readFilteredPatternIds(command);

        return {
          systemMessage: `Verified ${patternIds.join(", ")}.`,
          sourceAttributions: patternIds.map((patternId) => ({
            documentId: `sketchcatch-pattern-${patternId}-v1`
          }))
        };
      }
    }
  });
  const request = {
    target: "architecture_draft" as const,
    instructions: "Return a plan.",
    prompt: "Create an ALB fleet.",
    payload: { normalizedRequirement: { patternIds: ["alb-asg-ec2"] } }
  };

  await createProvider().generate(request);
  await createProvider().generate(request);

  assert.equal(retrievalCount, 1);
});

test("architecture provider reads persistent verification cache without connection races", async () => {
  const cachedDocumentIds = [
    "sketchcatch-pattern-alb-asg-ec2-v1",
    "sketchcatch-pattern-github-cicd-codedeploy-v1",
    "sketchcatch-pattern-multi-az-rds-v1"
  ];
  let activeReads = 0;
  let maxConcurrentReads = 0;
  let nextCachedDocumentIndex = 0;
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    runtimeCache: {
      get: async <TValue>() => {
        const documentId = cachedDocumentIds[nextCachedDocumentIndex]!;
        nextCachedDocumentIndex += 1;
        activeReads += 1;
        maxConcurrentReads = Math.max(maxConcurrentReads, activeReads);

        try {
          if (activeReads > 1) {
            throw new Error("Concurrent cache connection race");
          }
          await new Promise<void>((resolve) => setImmediate(resolve));
          return { documentId } as TValue;
        } finally {
          activeReads -= 1;
        }
      },
      set: async () => undefined,
      delete: async () => false
    },
    retrievalClient: {
      send: async () => assert.fail("Q retrieval must not run when every citation is cached")
    }
  });

  await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a highly available web runtime with CI/CD and RDS.",
    payload: {
      normalizedRequirement: {
        patternIds: ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]
      }
    }
  });

  assert.equal(maxConcurrentReads, 1);
});

test("architecture provider keeps verified Q citations in persistent cache for seven days", async () => {
  let persistedTtlMs = 0;
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    runtimeCache: {
      get: async () => null,
      set: async (_key, _value, options) => {
        persistedTtlMs = options?.ttlMs ?? 0;
      },
      delete: async () => false
    },
    retrievalClient: {
      send: async (command) => {
        const patternIds = readFilteredPatternIds(command);
        return {
          systemMessage: "Verified exact pattern.",
          sourceAttributions: patternIds.map((patternId) => ({
            documentId: `sketchcatch-pattern-${patternId}-v1`
          }))
        };
      }
    }
  });

  await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a private Multi-AZ RDS architecture.",
    payload: { normalizedRequirement: { patternIds: ["multi-az-rds"] } }
  });

  assert.equal(persistedTtlMs, 7 * 24 * 60 * 60 * 1000);
});

test("architecture provider recovers from a transient batched Q request failure", async () => {
  const requestedPatternIds: string[][] = [];
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async (command) => {
        const patternIds = readFilteredPatternIds(command);
        requestedPatternIds.push(patternIds);

        if (requestedPatternIds.length === 1) {
          throw new Error("Transient Q request failure");
        }

        return {
          systemMessage: `Verified ${patternIds.join(", ")}.`,
          sourceAttributions: patternIds.map((patternId) => ({
            documentId: `sketchcatch-pattern-${patternId}-v1`
          }))
        };
      }
    }
  });

  const response = await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a highly available web runtime with CI/CD and RDS.",
    payload: {
      normalizedRequirement: {
        patternIds: ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"]
      }
    }
  });

  assert.equal(JSON.parse(response.text).status, "plan");
  assert.deepEqual(requestedPatternIds, [
    ["alb-asg-ec2", "github-cicd-codedeploy", "multi-az-rds"],
    ["alb-asg-ec2"],
    ["github-cicd-codedeploy"],
    ["multi-az-rds"]
  ]);
});

test("architecture provider retries transient Q failures until verified evidence arrives", async () => {
  let callCount = 0;
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retryDelay: async () => undefined,
    retrievalClient: {
      send: async (command) => {
        callCount += 1;

        if (callCount < 3) {
          throw Object.assign(new Error("Amazon Q temporarily unavailable"), {
            name: "ServiceUnavailableException",
            $metadata: { httpStatusCode: 503 }
          });
        }

        const patternIds = readFilteredPatternIds(command);
        return {
          systemMessage: `Verified ${patternIds.join(", ")}.`,
          sourceAttributions: patternIds.map((patternId) => ({
            documentId: `sketchcatch-pattern-${patternId}-v1`
          }))
        };
      }
    }
  });

  const response = await provider.generate({
    target: "architecture_draft",
    instructions: "Return a plan.",
    prompt: "Create a private Multi-AZ RDS architecture.",
    payload: { normalizedRequirement: { patternIds: ["multi-az-rds"] } }
  });

  assert.equal(JSON.parse(response.text).status, "plan");
  assert.equal(callCount, 3);
});

test("architecture provider rejects retrieval evidence from the wrong document", async () => {
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async () => ({
        systemMessage: "Wrong pattern.",
        sourceAttributions: [{ documentId: "sketchcatch-pattern-serverless-api-v1" }]
      })
    }
  });

  await assert.rejects(
    provider.generate({
      target: "architecture_draft",
      instructions: "Return a plan.",
      prompt: "Create an ALB fleet.",
      payload: { normalizedRequirement: { patternIds: ["alb-asg-ec2"] } }
    }),
    /citation/i
  );
});

test("canonical Q plans materialize serverless, Fargate, and composed deployment diagrams", async () => {
  const cases = [
    {
      id: "serverless",
      requirement: "Use API Gateway and Lambda only. Serverless runtime, no EC2.",
      database: "database: none no database static content only",
      management: "management preference: fully managed serverless",
      required: ["API_GATEWAY_REST_API", "LAMBDA", "LAMBDA_PERMISSION"],
      forbidden: ["EC2", "AMI", "AUTO_SCALING_GROUP"]
    },
    {
      id: "fargate",
      requirement: "Use ECS Fargate service and task definition behind ALB. No EC2 capacity.",
      database: "database: none no database static content only",
      management: "management preference: semi-managed operations",
      required: ["LOAD_BALANCER", "ECS_CLUSTER", "ECS_TASK_DEFINITION", "ECS_SERVICE"],
      forbidden: ["EC2", "AMI", "IAM_INSTANCE_PROFILE", "ECS_CAPACITY_PROVIDER"]
    },
    {
      id: "composed",
      requirement: [
        "GitHub main deploys with CodeStar Connection, CodePipeline, CodeBuild Project, CodeDeploy App and Deployment Group.",
        "Runtime is ALB, Auto Scaling Group and EC2 3 instances in private subnets.",
        "Use private Multi-AZ RDS."
      ].join(" "),
      database: "database: simple data user posts under 10GB",
      management: "management preference: self-managed operations",
      required: [
        "LOAD_BALANCER",
        "AUTO_SCALING_GROUP",
        "EC2",
        "CODESTAR_CONNECTION",
        "CODEPIPELINE",
        "CODEBUILD_PROJECT",
        "CODEDEPLOY_APP",
        "CODEDEPLOY_DEPLOYMENT_GROUP",
        "S3",
        "IAM_ROLE",
        "RDS",
        "DB_SUBNET_GROUP"
      ],
      forbidden: []
    }
  ] as const;

  for (const scenario of cases) {
    const provider = createAmazonQArchitectureDraftProvider({
      region: "ap-southeast-2",
      retrievalApplicationId: "retrieval-app",
      retrievalClient: {
        send: async (command) => {
          const patternIds = readFilteredPatternIds(command);

          return {
            systemMessage: `Verified ${patternIds.join(", ")}.`,
            sourceAttributions: patternIds.map((patternId) => ({
              documentId: `sketchcatch-pattern-${patternId}-v1`
            }))
          };
        }
      }
    });
    const response = await createAmazonQArchitectureDraftResponse(
      {
        prompt: createCompleteProjectPrompt(
          scenario.requirement,
          scenario.database,
          scenario.management
        )
      },
      {
        provider,
        creditPolicy: {
          bedrock: false,
          amazonQ: true,
          transcribe: false,
          billingMode: "aws_credit_only"
        }
      }
    );

    if ("status" in response) {
      assert.fail(`${scenario.id}: expected diagram, got clarification ${response.question}`);
    }

    const nodeTypes = response.architectureJson.nodes.map((node) => node.type);
    assert.equal(response.metadata.source, "amazon_q", `${scenario.id}: must use the verified Q plan`);

    for (const requiredType of scenario.required) {
      assert.equal(nodeTypes.includes(requiredType), true, `${scenario.id}: missing ${requiredType}`);
    }

    for (const forbiddenType of scenario.forbidden) {
      assert.equal(nodeTypes.includes(forbiddenType), false, `${scenario.id}: contains ${forbiddenType}`);
    }

    if (scenario.id === "composed") {
      assert.equal(nodeTypes.filter((nodeType) => nodeType === "EC2").length, 3);
    }

    const connectedNodeIds = new Set(
      response.architectureJson.edges.flatMap((edge) => [edge.sourceId, edge.targetId])
    );
    const orphanNodeIds = response.architectureJson.nodes
      .filter((node) => !connectedNodeIds.has(node.id))
      .map((node) => node.id);
    assert.deepEqual(orphanNodeIds, [], `${scenario.id}: orphan nodes`);
  }
});

test("page selections adapt verified patterns with explicit supplemental resources", async () => {
  const cases = [
    {
      id: "generic-shop",
      request: "회원과 주문 기능이 있는 쇼핑몰을 만들고 싶어.",
      choices: {},
      required: ["S3", "CLOUDFRONT", "API_GATEWAY_REST_API", "LAMBDA", "RDS"],
      forbidden: ["KMS_KEY", "WAF_WEB_ACL"]
    },
    {
      id: "event-serverless",
      request: "S3 객체 생성 이벤트가 Lambda를 호출하고 결과를 SQS와 DynamoDB에 기록해줘. EC2는 사용하지 않아.",
      choices: {
        website: "API 서버 (모바일 앱 백엔드)",
        traffic: "급변동 (평상시 적지만 이벤트 시 급증)",
        frontend: "모바일 앱 (웹뷰 또는 네이티브)",
        upload: "다양한 파일 (문서, 동영상 포함)",
        management: "완전 관리형 (서버리스, 관리 최소화)",
        trafficPattern: "이벤트성 급증 (특정 시기에만)"
      },
      required: ["S3", "LAMBDA", "SQS_QUEUE", "DYNAMODB_TABLE"],
      forbidden: ["EC2", "RDS"]
    },
    {
      id: "replace-ec2-with-serverless",
      request: "기존 EC2 구성 대신 완전 관리형 서버리스 API로 바꿔줘. EC2는 사용하지 않아.",
      choices: {
        website: "API 서버 (모바일 앱 백엔드)",
        database: "필요 없음 (정적 콘텐츠만)",
        frontend: "모바일 앱 (웹뷰 또는 네이티브)",
        management: "완전 관리형 (서버리스, 관리 최소화)"
      },
      required: ["API_GATEWAY_REST_API", "LAMBDA", "ACM_CERTIFICATE"],
      forbidden: ["EC2", "AUTO_SCALING_GROUP", "LOAD_BALANCER"]
    },
    {
      id: "scheduled-fargate",
      request: "EventBridge가 매일 ECS Fargate 배치 작업을 실행하게 해줘. 외부 트래픽과 ALB, EC2는 필요 없어.",
      choices: {
        website: "API 서버 (모바일 앱 백엔드)",
        traffic: "소규모 (일 100명 미만, 동시 10명 미만)",
        database: "필요 없음 (정적 콘텐츠만)",
        frontend: "HTML/CSS/JS만 (순수 웹)",
        backend: "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
        budget: "10-50만원 (적당한 성능)",
        ssl: "선택사항 (HTTP도 괜찮음)",
        management: "반관리형 (일부 서버 관리)",
        loading: "5초 이내 (느려도 괜찮음)",
        size: "10MB 미만 (간단한 사이트)",
        trafficPattern: "일정함 (하루 종일 비슷)",
        downtime: "월 8시간 이내 (99% 가용성)"
      },
      required: ["EVENTBRIDGE_RULE", "EVENTBRIDGE_TARGET", "ECS_TASK_DEFINITION", "ECS_SERVICE"],
      forbidden: ["LOAD_BALANCER", "EC2"]
    },
    {
      id: "eks-platform",
      request: "EKS 클러스터와 managed node group에 Kubernetes API 서버를 배포하고 AWS Load Balancer Controller로 노출해줘.",
      choices: {
        website: "API 서버 (모바일 앱 백엔드)",
        traffic: "대규모 (일 10,000명 이상, 동시 500명 이상)",
        database: "필요 없음 (정적 콘텐츠만)",
        frontend: "모바일 앱 (웹뷰 또는 네이티브)",
        backend: "마이크로서비스 (여러 서비스 분리)",
        budget: "200만원 이상 (엔터프라이즈급)",
        management: "직접 관리 (서버 직접 운영)"
      },
      required: ["EKS_CLUSTER", "EKS_NODE_GROUP", "LOAD_BALANCER", "WAF_WEB_ACL", "ACM_CERTIFICATE"],
      forbidden: ["EC2", "ECS_SERVICE", "ECS_TASK_DEFINITION"]
    },
    {
      id: "static-waf",
      request: "회사 문서 정적 사이트를 private S3와 CloudFront로 제공하고 WAF Web ACL을 연결해줘.",
      choices: {
        website: "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)",
        traffic: "소규모 (일 100명 미만, 동시 10명 미만)",
        database: "필요 없음 (정적 콘텐츠만)",
        frontend: "HTML/CSS/JS만 (순수 웹)",
        backend: "필요 없음 (정적 사이트)",
        budget: "10-50만원 (적당한 성능)",
        management: "완전 관리형 (서버리스, 관리 최소화)",
        size: "10MB 미만 (간단한 사이트)",
        trafficPattern: "일정함 (하루 종일 비슷)"
      },
      required: ["S3", "CLOUDFRONT", "WAF_WEB_ACL", "WAF_WEB_ACL_ASSOCIATION"],
      forbidden: ["EC2", "LAMBDA", "RDS"]
    },
    {
      id: "enterprise-security",
      request: "민감한 주문 데이터를 처리하는 엔터프라이즈 쇼핑몰을 만들어줘.",
      choices: {
        traffic: "대규모 (일 10,000명 이상, 동시 500명 이상)",
        database: "중간 규모 데이터 (10GB ~ 100GB)",
        backend: "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
        budget: "200만원 이상 (엔터프라이즈급)",
        downtime: "절대 안됨 (99.99% 가용성)"
      },
      required: ["IAM_POLICY", "KMS_KEY", "WAF_WEB_ACL", "SECRETS_MANAGER_SECRET"],
      forbidden: []
    }
  ] as const;

  for (const scenario of cases) {
    let response: Awaited<ReturnType<typeof materializePageSelectionScenario>>;
    try {
      response = await materializePageSelectionScenario(
        scenario.request,
        scenario.choices
      );
    } catch (error) {
      throw new Error(`${scenario.id}: materialization failed`, { cause: error });
    }
    const nodeTypes = response.architectureJson.nodes.map((node) => node.type);

    assert.equal(response.metadata.source, "amazon_q", `${scenario.id}: Q evidence was not used`);
    for (const requiredType of scenario.required) {
      assert.equal(nodeTypes.includes(requiredType), true, `${scenario.id}: missing ${requiredType}`);
    }
    for (const forbiddenType of scenario.forbidden) {
      assert.equal(nodeTypes.includes(forbiddenType), false, `${scenario.id}: contains ${forbiddenType}`);
    }

    const connectedNodeIds = new Set(
      response.architectureJson.edges.flatMap((edge) => [edge.sourceId, edge.targetId])
    );
    assert.deepEqual(
      response.architectureJson.nodes
        .filter((node) => !connectedNodeIds.has(node.id))
        .map((node) => node.id),
      [],
      `${scenario.id}: orphan nodes`
    );
  }
});

test("non-architecture targets never enter the architecture retrieval pipeline", async () => {
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: { send: async () => assert.fail("architecture retrieval must not run") }
  });

  await assert.rejects(
    provider.generate({
      target: "terraform_error_explanation",
      instructions: "Explain.",
      prompt: "Explain this error.",
      payload: {}
    }),
    /architecture_draft/
  );
});

test("Q-backed SPA Fargate RDS plans materialize deployable role-specific resources", async () => {
  const response = await materializePageSelectionScenario(
    "웹페이지 하나 배포하고 싶어 다시 만들어봐",
    {
      backend: "complex business logic Spring Boot Django",
      management: "fully managed serverless management minimum",
      upload: "images profile post images",
      trafficPattern: "event traffic spike",
      downtime: "99% availability monthly 8 hours"
    }
  );
  const { nodes } = response.architectureJson;
  const serializedArchitecture = JSON.stringify(response.architectureJson).toLowerCase();
  const subnets = nodes.filter((node) => node.type === "SUBNET");
  const publicSubnets = subnets.filter((node) => node.config.tier === "public");
  const privateAppSubnets = subnets.filter((node) => node.config.tier === "private_app");
  const privateDbSubnets = subnets.filter((node) => node.config.tier === "private_db");
  const ecsService = nodes.find((node) => node.type === "ECS_SERVICE");
  const ecsNetworkConfiguration = ecsService?.config.networkConfiguration as
    | Record<string, unknown>
    | undefined;
  const ecsTaskDefinition = nodes.find((node) => node.type === "ECS_TASK_DEFINITION");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const dbSubnetGroup = nodes.find((node) => node.type === "DB_SUBNET_GROUP");
  const ecsRoles = nodes.filter(
    (node) =>
      node.type === "IAM_ROLE" &&
      JSON.stringify(node.config).includes("ecs-tasks.amazonaws.com")
  );

  assert.equal(response.metadata.source, "amazon_q");
  assert.match(response.title, /spa-cloudfront-s3/);
  assert.match(response.title, /ecs-fargate/);
  assert.match(response.title, /multi-az-rds/);
  assert.equal(nodes.some((node) => node.type === "LAMBDA"), false);
  assert.equal(nodes.some((node) => node.type === "DYNAMODB_TABLE"), false);
  assert.equal(nodes.some((node) => node.type === "ACM_CERTIFICATE"), false);
  assert.equal(nodes.some((node) => node.type === "WAF_WEB_ACL"), false);
  assert.doesNotMatch(serializedArchitecture, /lambda/);
  assert.equal(publicSubnets.length, 2);
  assert.equal(privateAppSubnets.length, 2);
  assert.equal(privateDbSubnets.length, 2);
  assert.equal(publicSubnets.every((node) => node.config.mapPublicIpOnLaunch === true), true);
  assert.equal(
    [...privateAppSubnets, ...privateDbSubnets].every(
      (node) => node.config.mapPublicIpOnLaunch === false
    ),
    true
  );
  assert.deepEqual(
    dbSubnetGroup?.config.subnetIds,
    privateDbSubnets.map((node) => `aws_subnet.${node.id.replaceAll("-", "_")}.id`)
  );
  assert.equal(targetGroup?.config.targetType, "ip");
  assert.equal(ecsService?.config.desiredCount, 2);
  assert.equal(ecsNetworkConfiguration?.assignPublicIp, false);
  assert.deepEqual(
    ecsNetworkConfiguration?.subnets,
    privateAppSubnets.map((node) => `aws_subnet.${node.id.replaceAll("-", "_")}.id`)
  );
  assert.equal(ecsTaskDefinition?.config.networkMode, "awsvpc");
  assert.deepEqual(ecsTaskDefinition?.config.requiresCompatibilities, ["FARGATE"]);
  assert.equal(ecsRoles.length >= 2, true);
  assert.equal(
    (response.metadata.guardrailWarnings ?? []).some((warning) =>
      JSON.stringify(warning).includes("Auto Scaling")
    ),
    false
  );
  const connectedNodeIds = new Set(
    response.architectureJson.edges.flatMap((edge) => [edge.sourceId, edge.targetId])
  );
  assert.deepEqual(
    nodes.filter((node) => !connectedNodeIds.has(node.id)).map((node) => node.id),
    []
  );
});

function createCompleteProjectPrompt(
  requirement: string,
  database: string,
  management: string
): string {
  return [
    requirement,
    "website type: dynamic web application shopping board membership system",
    "traffic: medium daily traffic 1000 concurrent users 50",
    database,
    "frontend: React/Vue/Angular SPA framework",
    "backend: complex business logic Spring Boot Django",
    "region: Korea only Seoul region ap-northeast-2",
    "budget cost: 50-200 high performance",
    "SSL HTTPS: required security important",
    "file upload: none no file upload text only",
    "realtime: none no realtime features",
    management,
    "loading time: 3 seconds",
    "website size: 10MB-100MB",
    "traffic pattern: time-based daytime traffic",
    "downtime tolerance: 99.9% availability"
  ].join("\n");
}

type PageSelectionChoices = {
  readonly backend: string;
  readonly budget: string;
  readonly database: string;
  readonly downtime: string;
  readonly frontend: string;
  readonly loading: string;
  readonly management: string;
  readonly realtime: string;
  readonly region: string;
  readonly size: string;
  readonly ssl: string;
  readonly traffic: string;
  readonly trafficPattern: string;
  readonly upload: string;
  readonly website: string;
};

async function materializePageSelectionScenario(
  request: string,
  overrides: Readonly<Partial<PageSelectionChoices>>
) {
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-southeast-2",
    retrievalApplicationId: "retrieval-app",
    retrievalClient: {
      send: async (command) => {
        const patternIds = readFilteredPatternIds(command);

        return {
          systemMessage: `Verified ${patternIds.join(", ")}.`,
          sourceAttributions: patternIds.map((patternId) => ({
            documentId: `sketchcatch-pattern-${patternId}-v1`
          }))
        };
      }
    }
  });
  const response = await createAmazonQArchitectureDraftResponse(
    { prompt: createPageSelectionPrompt(request, overrides) },
    {
      provider,
      creditPolicy: {
        bedrock: false,
        amazonQ: true,
        transcribe: false,
        billingMode: "aws_credit_only"
      }
    }
  );

  if ("status" in response) {
    assert.fail(`Unexpected page follow-up: ${response.question}`);
  }

  return response;
}

function createPageSelectionPrompt(
  request: string,
  overrides: Readonly<Partial<PageSelectionChoices>>
): string {
  const choices: PageSelectionChoices = {
    website: "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)",
    traffic: "중간 규모 (일 1,000명, 동시 50명)",
    database: "간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
    frontend: "React/Vue/Angular (SPA 프레임워크)",
    backend: "간단한 API (Node.js, Python Flask 등)",
    region: "한국만 (서울 리전)",
    budget: "50-200만원 (고성능)",
    ssl: "필수 (보안 중요)",
    upload: "없음 (텍스트만)",
    realtime: "필요 없음",
    management: "반관리형 (일부 서버 관리)",
    loading: "3초 이내 (적당함)",
    size: "10MB-100MB (일반적인 사이트)",
    trafficPattern: "시간대별 차이 (낮에 많음)",
    downtime: "월 1시간 이내 (99.9% 가용성)",
    ...overrides
  };
  const answers = [
    ["어떤 종류의 웹사이트인가요?", choices.website],
    ["예상 트래픽 규모는?", choices.traffic],
    ["데이터베이스가 필요한가요?", choices.database],
    ["프론트엔드 기술은?", choices.frontend],
    ["백엔드가 필요한가요?", choices.backend],
    ["주요 사용자 지역은?", choices.region],
    ["월 예산 범위는?", choices.budget],
    ["SSL 인증서(HTTPS)가 필요한가요?", choices.ssl],
    ["파일 업로드 기능이 있나요? (이미지, 문서 등)", choices.upload],
    ["실시간 기능이 필요한가요? (채팅, 알림 등)", choices.realtime],
    ["관리 복잡도 선호도는?", choices.management],
    ["페이지 로딩 시간 목표는?", choices.loading],
    ["전체 웹사이트 크기는?", choices.size],
    ["트래픽 패턴은?", choices.trafficPattern],
    ["서비스 중단 허용 시간은?", choices.downtime]
  ];

  return [
    request,
    ...answers.map(([question, answer]) => `질문\n${question}\n\n나\n${answer}`)
  ].join("\n\n");
}

function readFilteredPatternIds(command: Pick<ChatSyncCommand, "input">): string[] {
  const filter = command.input.attributeFilter;
  const filters = filter?.orAllFilters ?? (filter === undefined ? [] : [filter]);

  return filters
    .map((item) => item.equalsTo?.value?.stringValue)
    .filter((patternId): patternId is string => patternId !== undefined);
}
