import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";

const architectureDraftResponseSchema = z.object({
  architectureJson: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        config: z.record(z.string(), z.unknown())
      })
    ),
    edges: z.array(
      z.object({
        id: z.string(),
        sourceId: z.string(),
        targetId: z.string()
      })
    )
  }),
  title: z.string(),
  metadata: z.object({
    source: z.string(),
    confidence: z.string(),
    assumptions: z.array(z.string()),
    explanations: z.array(z.string()),
    selectedDraftPattern: z.string().optional(),
    requirementFacts: z.array(z.string()).optional(),
    operatingProfile: z
      .object({
        budgetLevel: z.string(),
        securityPriority: z.string(),
        trafficLevel: z.string()
      })
      .optional(),
    guardrailWarnings: z
      .array(
        z.object({
          code: z.string(),
          message: z.string()
        })
      )
      .optional()
  })
});

const apiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string()
});

const preDeploymentAnalysisResponseSchema = z.object({
  summary: z.string(),
  totalMonthlyEstimate: z.object({
    amount: z.number(),
    currency: z.string(),
    pricingAssumption: z.string()
  }),
  resourceCostEstimates: z.array(z.object({ resourceId: z.string() })),
  findings: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      severity: z.string(),
      resourceId: z.string().optional(),
      title: z.string()
    })
  ),
  checklist: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.string(),
      relatedFindingIds: z.array(z.string())
    })
  )
});

const terraformErrorExplanationResponseSchema = z.object({
  stage: z.string(),
  category: z.string(),
  severity: z.string(),
  rawMessage: z.string(),
  summary: z.string(),
  likelyCause: z.string(),
  nextActions: z.array(z.string()),
  relatedResourceId: z.string().optional()
});

const terraformPreviewExplanationResponseSchema = z.object({
  summary: z.string(),
  detectedResources: z.array(
    z.object({
      terraformType: z.string(),
      label: z.string(),
      explanation: z.string()
    })
  ),
  findings: z.array(
    z.object({
      category: z.string(),
      severity: z.string(),
      title: z.string()
    })
  ),
  checklist: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.string()
    })
  )
});

type ArchitectureDraftResponse = z.infer<typeof architectureDraftResponseSchema>;

function findDraftNode(body: ArchitectureDraftResponse, nodeId: string) {
  return body.architectureJson.nodes.find((node) => node.id === nodeId);
}

function assertDraftHasNodeTypes(
  body: ArchitectureDraftResponse,
  expectedNodeTypes: readonly string[]
): void {
  const nodeTypes = new Set(body.architectureJson.nodes.map((node) => node.type));

  for (const expectedNodeType of expectedNodeTypes) {
    assert.ok(nodeTypes.has(expectedNodeType), `Expected draft to include ${expectedNodeType}`);
  }
}

function assertDraftHasEdge(
  body: ArchitectureDraftResponse,
  expectedEdge: { readonly id: string; readonly sourceId: string; readonly targetId: string }
): void {
  assert.ok(
    body.architectureJson.edges.some(
      (edge) =>
        edge.id === expectedEdge.id &&
        edge.sourceId === expectedEdge.sourceId &&
        edge.targetId === expectedEdge.targetId
    ),
    `Expected edge ${expectedEdge.id} from ${expectedEdge.sourceId} to ${expectedEdge.targetId}`
  );
}

test("POST /api/ai/architecture-draft returns a board-ready ArchitectureJson for a static website request", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "정적 웹사이트를 S3와 CloudFront로 배포하고 싶어"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());
  const nodeTypes = body.architectureJson.nodes.map((node) => node.type);

  assert.equal(body.title, "정적 웹사이트 Practice Architecture");
  assert.ok(nodeTypes.includes("S3"));
  assert.ok(nodeTypes.includes("CLOUDFRONT"));
  assert.equal(body.metadata.source, "template_fallback");

  await app.close();
});

test("POST /api/ai/architecture-draft selects API server and database backend templates", async () => {
  const app = buildApp();

  const apiServerResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "외부 요청을 받는 API 서버를 EC2로 만들고 싶어"
    }
  });

  assert.equal(apiServerResponse.statusCode, 200);

  const apiServerBody = architectureDraftResponseSchema.parse(apiServerResponse.json());
  const apiServerNodeTypes = apiServerBody.architectureJson.nodes.map((node) => node.type);

  assert.equal(apiServerBody.title, "API 서버 Practice Architecture");
  assert.ok(apiServerNodeTypes.includes("VPC"));
  assert.ok(apiServerNodeTypes.includes("SUBNET"));
  assertDraftHasNodeTypes(apiServerBody, [
    "INTERNET_GATEWAY",
    "ROUTE_TABLE",
    "ROUTE_TABLE_ASSOCIATION",
    "AMI",
    "SECURITY_GROUP",
    "EC2"
  ]);
  assert.equal(apiServerNodeTypes.includes("IAM_ROLE"), false);
  assert.equal(apiServerNodeTypes.includes("CLOUDWATCH_LOG_GROUP"), false);
  assert.equal(apiServerNodeTypes.includes("S3"), false);
  assertDraftHasEdge(apiServerBody, {
    id: "app-ami-to-app-server",
    sourceId: "app-ami",
    targetId: "app-server"
  });
  assertDraftHasEdge(apiServerBody, {
    id: "public-subnet-a-to-app-server",
    sourceId: "public-subnet-a",
    targetId: "app-server"
  });
  assertDraftHasEdge(apiServerBody, {
    id: "public-route-table-to-internet-gateway",
    sourceId: "public-route-table",
    targetId: "internet-gateway"
  });

  const databaseBackendResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "DB가 포함된 백엔드 서버를 만들고 싶어"
    }
  });

  assert.equal(databaseBackendResponse.statusCode, 200);

  const databaseBackendBody = architectureDraftResponseSchema.parse(databaseBackendResponse.json());
  const databaseBackendNodeTypes = databaseBackendBody.architectureJson.nodes.map((node) => node.type);

  assert.equal(databaseBackendBody.title, "DB 포함 백엔드 Practice Architecture");
  assert.ok(databaseBackendNodeTypes.includes("EC2"));
  assert.ok(databaseBackendNodeTypes.includes("RDS"));
  assertDraftHasNodeTypes(databaseBackendBody, [
    "AMI",
    "IAM_ROLE",
    "IAM_POLICY",
    "IAM_INSTANCE_PROFILE",
    "KMS_KEY",
    "CLOUDWATCH_LOG_GROUP",
    "CLOUDWATCH_METRIC_ALARM",
    "SECURITY_GROUP"
  ]);

  const databaseNode = findDraftNode(databaseBackendBody, "app-database");

  assert.equal(databaseNode?.config.storageEncrypted, true);
  assert.equal(databaseNode?.config.backupRetentionPeriod, 7);
  assert.equal(databaseNode?.config.kmsKeyId, "aws_kms_key.data_encryption_key.arn");
  assertDraftHasEdge(databaseBackendBody, {
    id: "data-encryption-key-to-app-database",
    sourceId: "data-encryption-key",
    targetId: "app-database"
  });

  await app.close();
});

test("POST /api/ai/architecture-draft selects a Lambda draft from serverless prompt keywords", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "간단한 Lambda 함수 기반 서버리스 구조를 만들어줘"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());

  assert.equal(body.title, "Lambda 함수 Practice Architecture");
  assert.equal(body.metadata.selectedDraftPattern, "serverless_function");
  assertDraftHasNodeTypes(body, [
    "API_GATEWAY_REST_API",
    "IAM_ROLE",
    "IAM_POLICY",
    "KMS_KEY",
    "CLOUDWATCH_LOG_GROUP",
    "CLOUDWATCH_METRIC_ALARM",
    "LAMBDA_PERMISSION",
    "LAMBDA"
  ]);
  assertDraftHasEdge(body, {
    id: "api-gateway-to-lambda-function",
    sourceId: "api-gateway",
    targetId: "lambda-function"
  });
  assertDraftHasEdge(body, {
    id: "lambda-execution-role-to-lambda-function",
    sourceId: "lambda-execution-role",
    targetId: "lambda-function"
  });
  assertDraftHasEdge(body, {
    id: "lambda-function-to-lambda-log-group",
    sourceId: "lambda-function",
    targetId: "lambda-log-group"
  });

  await app.close();
});

test("POST /api/ai/architecture-draft composes resources from natural language facts instead of choosing one fixed preset", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt:
        "로그인 있는 웹사이트를 배포하고 싶어. 사용자가 이미지도 업로드해야 하고 처음엔 저렴하게 시작하되 개인정보는 보호해줘."
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());

  assert.match(body.title, /웹서비스|Practice Architecture/);
  assertDraftHasNodeTypes(body, [
    "CLOUDFRONT",
    "S3",
    "EC2",
    "RDS",
    "IAM_ROLE",
    "IAM_POLICY",
    "IAM_INSTANCE_PROFILE",
    "KMS_KEY",
    "CLOUDWATCH_LOG_GROUP",
    "CLOUDWATCH_METRIC_ALARM",
    "SECURITY_GROUP"
  ]);
  assert.ok(findDraftNode(body, "web-assets-bucket"), "Expected a frontend asset bucket");
  assert.ok(findDraftNode(body, "upload-bucket"), "Expected a separate upload bucket");
  assert.ok(findDraftNode(body, "app-database"), "Expected a database for login/user data");
  assertDraftHasEdge(body, {
    id: "app-server-to-upload-bucket",
    sourceId: "app-server",
    targetId: "upload-bucket"
  });
  assertDraftHasEdge(body, {
    id: "app-runtime-policy-to-upload-bucket",
    sourceId: "app-runtime-policy",
    targetId: "upload-bucket"
  });
  assertDraftHasEdge(body, {
    id: "app-server-to-app-database",
    sourceId: "app-server",
    targetId: "app-database"
  });
  assert.ok(
    body.metadata.explanations.some((explanation) => explanation.includes("요구사항 단서")),
    "Expected metadata to explain natural-language facts"
  );

  await app.close();
});

test("POST /api/ai/architecture-draft warns when unsupported resources are omitted", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "API 서버에 Redis 캐시와 SQS 메시지 큐를 붙여줘"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());

  assert.equal(body.metadata.selectedDraftPattern, "api_server");
  assert.ok(body.metadata.guardrailWarnings?.some((warning) => warning.code === "unsupported_resource_omitted"));
  assert.ok(body.metadata.guardrailWarnings?.some((warning) => warning.code === "partial_generation"));
  assert.equal(body.architectureJson.nodes.some((node) => node.type === "UNKNOWN"), false);

  await app.close();
});

test("POST /api/ai/architecture-draft keeps a minimal API server small but container-based", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "최소한의 API 서버 만들어줘"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());
  const nodeIds = body.architectureJson.nodes.map((node) => node.id);
  const nodeTypes = body.architectureJson.nodes.map((node) => node.type);
  const appServer = findDraftNode(body, "app-server");

  assert.equal(body.metadata.selectedDraftPattern, "api_server");
  assert.deepEqual(nodeIds, [
    "vpc-main",
    "public-subnet-a",
    "internet-gateway",
    "public-route-table",
    "public-route-table-association",
    "app-security-group",
    "app-ami",
    "app-server"
  ]);
  assert.equal(nodeTypes.includes("CLOUDFRONT"), false);
  assert.equal(nodeTypes.includes("S3"), false);
  assert.equal(nodeTypes.includes("IAM_ROLE"), false);
  assert.equal(nodeTypes.includes("CLOUDWATCH_LOG_GROUP"), false);
  assert.equal(appServer?.config.associatePublicIpAddress, true);
  assert.equal(appServer?.config.subnetId, "aws_subnet.public_subnet_a.id");
  assertDraftHasEdge(body, {
    id: "vpc-main-to-public-subnet-a",
    sourceId: "vpc-main",
    targetId: "public-subnet-a"
  });
  assertDraftHasEdge(body, {
    id: "public-subnet-a-to-app-server",
    sourceId: "public-subnet-a",
    targetId: "app-server"
  });
  assertDraftHasEdge(body, {
    id: "app-security-group-to-app-server",
    sourceId: "app-security-group",
    targetId: "app-server"
  });

  await app.close();
});

test("POST /api/ai/architecture-draft derives operating profile from natural language", async () => {
	const app = buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/api/ai/architecture-draft",
		payload: {
			prompt: "DB가 포함된 백엔드 API 서버를 저렴하게 만들고 개인정보는 보호해줘"
		}
	});

	assert.equal(response.statusCode, 200);

	const body = architectureDraftResponseSchema.parse(response.json());
	const nodeTypes = body.architectureJson.nodes.map((node) => node.type);

	assert.equal(body.title, "DB 포함 백엔드 Practice Architecture");
	assert.ok(nodeTypes.includes("RDS"));
	assert.equal(nodeTypes.includes("CLOUDFRONT"), true);
  assert.equal(body.metadata.selectedDraftPattern, "backend_with_db");
  assert.ok(body.metadata.guardrailWarnings?.some((warning) => warning.code === "guardrail_adjusted_config"));
  assert.ok(body.metadata.guardrailWarnings?.some((warning) => warning.code === "low_budget_rds_cost"));
	assert.ok(body.metadata.assumptions.some((item) => item.includes("낮은 예산")));
	assert.ok(body.metadata.assumptions.some((item) => item.includes("작은 트래픽")));
	assert.ok(body.metadata.assumptions.some((item) => item.includes("보안 우선순위")));

	await app.close();
});

test("POST /api/ai/architecture-draft returns requirement facts and unsupported substitution warning metadata", async () => {
  const app = buildApp();

  const scoredResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "Next 프론트엔드 정적 웹사이트를 만들고 싶어"
    }
  });

  assert.equal(scoredResponse.statusCode, 200);

  const scoredBody = architectureDraftResponseSchema.parse(scoredResponse.json());

  assert.equal(scoredBody.metadata.selectedDraftPattern, "static_site");
  assert.ok(scoredBody.metadata.requirementFacts?.includes("web_frontend"));
  assert.ok(scoredBody.metadata.requirementFacts?.includes("static_delivery"));

  const unsupportedResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "멀티 리전 EKS 기반 금융권 서비스를 자동 설계하고 싶어"
    }
  });

  assert.equal(unsupportedResponse.statusCode, 200);

  const unsupportedBody = architectureDraftResponseSchema.parse(unsupportedResponse.json());

  assert.equal(unsupportedBody.metadata.selectedDraftPattern, "api_server");
  assert.equal(unsupportedBody.architectureJson.nodes.some((node) => node.type === "UNKNOWN"), false);
  assert.ok(
    unsupportedBody.metadata.guardrailWarnings?.some(
      (warning) => warning.code === "unsupported_requirement_substituted"
    )
  );
  assert.ok(unsupportedBody.metadata.requirementFacts?.includes("server_runtime"));

  const partialResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "EKS 기반 API 서버를 연습용으로 설계하고 싶어"
    }
  });

  assert.equal(partialResponse.statusCode, 200);

  const partialBody = architectureDraftResponseSchema.parse(partialResponse.json());

  assert.equal(partialBody.metadata.selectedDraftPattern, "api_server");
  assert.ok(
    partialBody.metadata.guardrailWarnings?.some(
      (warning) => warning.code === "unsupported_requirement_substituted"
    )
  );
  assert.ok(partialBody.metadata.guardrailWarnings?.some((warning) => warning.code === "partial_generation"));

  await app.close();
});

test("POST /api/ai/architecture-draft understands beginner-friendly prompt wording", async () => {
  const app = buildApp();
  const promptCases = [
    {
      prompt: "소개용 랜딩 웹사이트를 배포하고 싶어",
      draftPattern: "static_site",
      expectedFacts: ["web_frontend"]
    },
    {
      prompt: "파일 업로드 페이지가 필요해",
      draftPattern: "server_storage",
      expectedFacts: ["file_upload"]
    },
    {
      prompt: "로그인 있는 작은 웹서비스가 필요해",
      draftPattern: "backend_with_db",
      expectedFacts: ["auth_or_user_data"]
    },
    {
      prompt: "예약/신청을 관리하는 웹사이트가 필요해",
      draftPattern: "backend_with_db",
      expectedFacts: ["auth_or_user_data", "database", "server_runtime"]
    }
  ] as const;

  for (const promptCase of promptCases) {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-draft",
      payload: {
        prompt: promptCase.prompt
      }
    });

    assert.equal(response.statusCode, 200);

    const body = architectureDraftResponseSchema.parse(response.json());

    assert.equal(body.metadata.selectedDraftPattern, promptCase.draftPattern);
    for (const expectedFact of promptCase.expectedFacts) {
      assert.ok(body.metadata.requirementFacts?.includes(expectedFact));
    }
  }

  await app.close();
});

test("POST /api/ai/architecture-draft rejects generic website prompts until clarified", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "웹사이트 하나 배포하고 싶어"
    }
  });

  assert.equal(response.statusCode, 400);

  const body = apiErrorResponseSchema.parse(response.json());

  assert.equal(body.error, "bad_request");
  assert.match(body.message, /웹사이트/);
  assert.match(body.message, /파일|로그인|방문자/);
  assert.match(body.message, /먼저|확인/);

  await app.close();
});

test("POST /api/ai/architecture-draft ignores legacy helper fields for generic website prompts", async () => {
  const app = buildApp();
  const prompt = "웹사이트 하나 배포하고 싶어";

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt,
      scenarioHint: "api_server",
      budgetLevel: "normal",
      trafficLevel: "normal",
      securityPriority: "basic"
    }
  });

  assert.equal(response.statusCode, 400);

  const body = apiErrorResponseSchema.parse(response.json());

  assert.match(body.message, /먼저 확인|파일|로그인/);

  await app.close();
});

test("POST /api/ai/architecture-draft rejects ambiguous prompts instead of creating a fallback draft", async () => {
  const app = buildApp();

  const helperChoiceResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "연습용 구조를 하나 만들어줘"
    }
  });

  assert.equal(helperChoiceResponse.statusCode, 400);

  const helperChoiceBody = apiErrorResponseSchema.parse(helperChoiceResponse.json());

  assert.equal(helperChoiceBody.error, "bad_request");
  assert.match(helperChoiceBody.message, /명확한 아키텍처 단서/);
  assert.match(helperChoiceBody.message, /웹사이트|파일 업로드|로그인/);

  const fallbackResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "연습용 구조를 하나 만들어줘"
    }
  });

  assert.equal(fallbackResponse.statusCode, 400);

  const fallbackBody = apiErrorResponseSchema.parse(fallbackResponse.json());

  assert.equal(fallbackBody.error, "bad_request");
  assert.match(fallbackBody.message, /명확한 아키텍처 단서/);

  await app.close();
});

test("POST /api/ai/architecture-draft generates only supported ResourceType values", async () => {
  const app = buildApp();
  const supportedResourceTypes = new Set([
    "VPC",
    "SUBNET",
    "INTERNET_GATEWAY",
    "ROUTE_TABLE",
    "ROUTE_TABLE_ASSOCIATION",
    "EC2",
    "RDS",
    "S3",
    "SECURITY_GROUP",
    "CLOUDFRONT",
    "LAMBDA",
    "AMI",
    "IAM_ROLE",
    "IAM_POLICY",
    "IAM_INSTANCE_PROFILE",
    "KMS_KEY",
    "CLOUDWATCH_LOG_GROUP",
    "CLOUDWATCH_METRIC_ALARM",
    "API_GATEWAY_REST_API",
    "LAMBDA_PERMISSION"
  ]);
  const payloads = [
    { prompt: "정적 웹사이트를 만들어줘" },
    { prompt: "API 서버를 만들어줘" },
    { prompt: "DB가 있는 백엔드를 만들어줘" },
    { prompt: "EC2 서버와 이미지 저장용 S3 버킷을 만들어줘" },
    { prompt: "Lambda 함수 기반 서버리스 구조를 만들어줘" },
    { prompt: "EKS 클러스터를 만들어줘" }
  ] as const;

  for (const payload of payloads) {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-draft",
      payload
    });

    assert.equal(response.statusCode, 200);

    const body = architectureDraftResponseSchema.parse(response.json());

    assert.ok(
      body.architectureJson.nodes.every((node) => supportedResourceTypes.has(node.type)),
      `Expected supported node types for prompt: ${payload.prompt}`
    );
    assert.equal(body.architectureJson.nodes.some((node) => node.type === "UNKNOWN"), false);
  }

  await app.close();
});

test("POST /api/ai/architecture-draft returns deterministic ArchitectureJson for the same request", async () => {
  const app = buildApp();
  const payload = {
    prompt: "작은 백엔드 API 서버와 PostgreSQL DB를 만들어줘"
  };

  const firstResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload
  });
  const secondResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);

  const firstBody = architectureDraftResponseSchema.parse(firstResponse.json());
  const secondBody = architectureDraftResponseSchema.parse(secondResponse.json());

  assert.deepEqual(firstBody.architectureJson, secondBody.architectureJson);

  await app.close();
});

test("POST /api/ai/architecture-draft returns the same ArchitectureJson for equivalent wording", async () => {
  const app = buildApp();
  const equivalentPrompts = [
    "EC2 서버 하나랑 이미지 저장용 S3 버킷이 있는 연습용 구조를 만들어줘",
    "연습용으로 서버 한 대에서 이미지 파일을 저장하는 구조를 만들어줘",
    "연습용 파일 업로드 서버 구조를 만들어줘",
    "연습용으로 서버가 파일을 받아 이미지 저장 공간에 보관하는 구조를 설계해줘",
    "연습용 작은 서버 서비스에서 사용자가 이미지를 올리는 구조를 만들어줘"
  ];
  const architectureJsonResults: ArchitectureDraftResponse["architectureJson"][] = [];

  for (const prompt of equivalentPrompts) {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-draft",
      payload: {
        prompt
      }
    });

    assert.equal(response.statusCode, 200);

    const body = architectureDraftResponseSchema.parse(response.json());

    assert.equal(body.metadata.selectedDraftPattern, "server_storage");
    assert.ok(body.metadata.requirementFacts?.includes("server_runtime"));
    assert.ok(body.metadata.requirementFacts?.includes("object_storage"));
    architectureJsonResults.push(body.architectureJson);
  }

  for (const architectureJson of architectureJsonResults.slice(1)) {
    assert.deepEqual(architectureJson, architectureJsonResults[0]);
  }

  await app.close();
});

test("POST /api/ai/architecture-draft uses readable resource ids in nodes, edges, and config references", async () => {
  const app = buildApp();

  const staticSiteResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "정적 웹사이트를 만들고 싶어"
    }
  });

  assert.equal(staticSiteResponse.statusCode, 200);

  const staticSiteBody = architectureDraftResponseSchema.parse(staticSiteResponse.json());
  const staticSiteNodeIds = staticSiteBody.architectureJson.nodes.map((node) => node.id);
  const cloudfrontNode = staticSiteBody.architectureJson.nodes.find((node) => node.id === "cloudfront-distribution");

  assert.ok(staticSiteNodeIds.includes("web-assets-bucket"));
  assert.ok(staticSiteNodeIds.includes("cloudfront-distribution"));
  assert.equal(cloudfrontNode?.config.originResourceId, "web-assets-bucket");
  assertDraftHasEdge(staticSiteBody, {
    id: "cloudfront-to-web-assets-bucket",
    sourceId: "cloudfront-distribution",
    targetId: "web-assets-bucket"
  });

  const apiServerResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "API 서버를 만들고 싶어"
    }
  });

  assert.equal(apiServerResponse.statusCode, 200);

  const apiServerBody = architectureDraftResponseSchema.parse(apiServerResponse.json());
  const apiServerNodeIds = apiServerBody.architectureJson.nodes.map((node) => node.id);
  const apiServerEdgeIds = apiServerBody.architectureJson.edges.map((edge) => edge.id);
  const apiServerNode = apiServerBody.architectureJson.nodes.find((node) => node.id === "app-server");

  for (const expectedNodeId of [
    "vpc-main",
    "public-subnet-a",
    "internet-gateway",
    "public-route-table",
    "public-route-table-association",
    "app-security-group",
    "app-ami",
    "app-server"
  ]) {
    assert.ok(apiServerNodeIds.includes(expectedNodeId), `Expected ${expectedNodeId}`);
  }
  for (const expectedEdgeId of [
    "vpc-main-to-public-subnet-a",
    "public-subnet-a-to-public-route-table-association",
    "public-route-table-association-to-public-route-table",
    "public-subnet-a-to-app-server",
    "app-security-group-to-app-server"
  ]) {
    assert.ok(apiServerEdgeIds.includes(expectedEdgeId), `Expected ${expectedEdgeId}`);
  }
  assert.equal(apiServerNode?.config.ami, "data.aws_ami.app_ami.id");
  assert.equal(apiServerNode?.config.associatePublicIpAddress, true);
  assert.equal(apiServerNode?.config.subnetId, "aws_subnet.public_subnet_a.id");
  assert.deepEqual(apiServerNode?.config.vpcSecurityGroupIds, ["aws_security_group.app_security_group.id"]);
  assert.equal(apiServerNode?.config.iamInstanceProfile, undefined);

  const databaseBackendResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "DB 포함 백엔드 API 서버를 만들고 싶어"
    }
  });

  assert.equal(databaseBackendResponse.statusCode, 200);

  const databaseBackendBody = architectureDraftResponseSchema.parse(databaseBackendResponse.json());
  const databaseBackendNodeIds = databaseBackendBody.architectureJson.nodes.map((node) => node.id);
  const databaseBackendEdgeIds = databaseBackendBody.architectureJson.edges.map((edge) => edge.id);
  const backendNode = databaseBackendBody.architectureJson.nodes.find((node) => node.id === "app-server");
  const databaseNode = databaseBackendBody.architectureJson.nodes.find((node) => node.id === "app-database");
  const databaseEdge = databaseBackendBody.architectureJson.edges.find((edge) => edge.id === "app-server-to-app-database");

  for (const expectedNodeId of [
    "private-db-subnet-a",
    "private-db-subnet-b",
    "app-database"
  ]) {
    assert.ok(databaseBackendNodeIds.includes(expectedNodeId), `Expected ${expectedNodeId}`);
  }
  for (const expectedEdgeId of [
    "private-db-subnet-a-to-app-database",
    "private-db-subnet-b-to-app-database",
    "db-cpu-alarm-to-app-database",
    "app-server-to-app-database"
  ]) {
    assert.ok(databaseBackendEdgeIds.includes(expectedEdgeId), `Expected ${expectedEdgeId}`);
  }
  assert.equal(backendNode?.config.ami, "data.aws_ami.app_ami.id");
  assert.equal(backendNode?.config.subnetId, "aws_subnet.private_app_subnet_a.id");
  assert.deepEqual(backendNode?.config.vpcSecurityGroupIds, ["aws_security_group.app_security_group.id"]);
  assert.equal(backendNode?.config.iamInstanceProfile, "aws_iam_instance_profile.app_instance_profile.name");
  assert.deepEqual(databaseNode?.config.subnetIds, [
    "aws_subnet.private_db_subnet_a.id",
    "aws_subnet.private_db_subnet_b.id"
  ]);
  assert.deepEqual(databaseNode?.config.vpcSecurityGroupIds, ["aws_security_group.db_security_group.id"]);
  assert.deepEqual(databaseEdge, {
    id: "app-server-to-app-database",
    sourceId: "app-server",
    targetId: "app-database"
  });

  await app.close();
});

test("POST /api/ai/architecture-draft creates a server and storage draft", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "EC2 서버와 S3 버킷을 같이 쓰는 구조를 만들고 싶어"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());
  const nodeIds = body.architectureJson.nodes.map((node) => node.id);
  const nodeTypes = body.architectureJson.nodes.map((node) => node.type);
  const edgeIds = body.architectureJson.edges.map((edge) => edge.id);
  const instanceNode = body.architectureJson.nodes.find((node) => node.id === "app-server");
  const routeTableNode = body.architectureJson.nodes.find((node) => node.id === "public-route-table");
  const internetRouteEdge = body.architectureJson.edges.find((edge) => edge.id === "public-route-table-to-internet-gateway");

  assert.equal(body.title, "서버+스토리지 Practice Architecture");
  assert.equal(body.metadata.selectedDraftPattern, "server_storage");
  assert.ok(nodeIds.includes("vpc-main"));
  assert.ok(nodeIds.includes("public-subnet-a"));
  assert.ok(nodeIds.includes("public-subnet-b"));
  assert.ok(nodeIds.includes("private-app-subnet-a"));
  assert.ok(nodeIds.includes("app-server"));
  assert.ok(nodeIds.includes("upload-bucket"));
  assert.ok(nodeTypes.includes("EC2"));
  assert.ok(nodeTypes.includes("S3"));
  assert.equal(nodeTypes.includes("RDS"), false);
  assert.ok(edgeIds.includes("app-ami-to-app-server"));
  assert.ok(edgeIds.includes("app-server-to-upload-bucket"));
  assert.ok(edgeIds.includes("app-runtime-policy-to-upload-bucket"));
  assert.ok(edgeIds.includes("public-route-table-to-internet-gateway"));
  assert.deepEqual(internetRouteEdge, {
    id: "public-route-table-to-internet-gateway",
    sourceId: "public-route-table",
    targetId: "internet-gateway"
  });
  assert.equal(instanceNode?.config.ami, "data.aws_ami.app_ami.id");
  assert.equal(instanceNode?.config.associatePublicIpAddress, false);
  assert.equal(instanceNode?.config.subnetId, "aws_subnet.private_app_subnet_a.id");
  assert.deepEqual(instanceNode?.config.vpcSecurityGroupIds, ["aws_security_group.app_security_group.id"]);
  assert.deepEqual(routeTableNode?.config.route, [
    {
      cidrBlock: "0.0.0.0/0",
      gatewayId: "aws_internet_gateway.internet_gateway.id"
    }
  ]);

  await app.close();
});

test("POST /api/ai/architecture-draft honors requested EC2 and S3 counts", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "있잖아 난 ec2 3개 정도 있는 서비스를 만들고 싶어. s3는 한 5개 정도 필요해."
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());
  const ec2Nodes = body.architectureJson.nodes.filter((node) => node.type === "EC2");
  const s3Nodes = body.architectureJson.nodes.filter((node) => node.type === "S3");
  const edgeIds = body.architectureJson.edges.map((edge) => edge.id);

  assert.equal(ec2Nodes.length, 3);
  assert.equal(s3Nodes.length, 5);
  assert.deepEqual(
    ec2Nodes.map((node) => node.id),
    ["app-server", "app-server-2", "app-server-3"]
  );
  assert.deepEqual(
    s3Nodes.map((node) => node.id),
    ["upload-bucket", "upload-bucket-2", "upload-bucket-3", "upload-bucket-4", "upload-bucket-5"]
  );
  assert.ok(edgeIds.includes("app-server-to-upload-bucket"));
  assert.ok(edgeIds.includes("app-runtime-policy-to-upload-bucket"));
  assert.ok(edgeIds.includes("app-server-3-to-upload-bucket-5"));
  assert.ok(edgeIds.includes("app-runtime-policy-to-upload-bucket-5"));

  await app.close();
});

test("POST /api/ai/architecture-draft applies operating intent inside supported MVP config", async () => {
  const app = buildApp();

  const databaseBackendResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "DB 포함 백엔드 API 서버를 처음엔 저렴하게 만들고 개인정보 보호가 필요해. 방문자 증가에도 대비해줘."
    }
  });

  assert.equal(databaseBackendResponse.statusCode, 200);

  const databaseBackendBody = architectureDraftResponseSchema.parse(databaseBackendResponse.json());
  const databaseNode = databaseBackendBody.architectureJson.nodes.find((node) => node.id === "app-database");
  const databaseSecurityGroupNode = databaseBackendBody.architectureJson.nodes.find((node) => node.id === "db-security-group");

  assert.equal(databaseNode?.config.publiclyAccessible, false);
  assert.deepEqual(databaseSecurityGroupNode?.config.ingress, []);
  assert.ok(
    databaseBackendBody.metadata.guardrailWarnings?.some((warning) => warning.code === "low_budget_rds_cost")
  );
  assert.ok(databaseBackendBody.metadata.explanations.some((explanation) => explanation.includes("ALB")));

  const staticSiteResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "보호가 중요한 정적 웹사이트를 만들고 싶어"
    }
  });

  assert.equal(staticSiteResponse.statusCode, 200);

  const staticSiteBody = architectureDraftResponseSchema.parse(staticSiteResponse.json());
  const bucketNode = staticSiteBody.architectureJson.nodes.find((node) => node.id === "web-assets-bucket");

  assert.equal(bucketNode?.config.publicAccessBlock, true);

  await app.close();
});

test("POST /api/ai/architecture-draft changes backend parameters from natural language operating intent", async () => {
  const app = buildApp();

  const lowSmallBasicResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "처음엔 저렴하게 작은 API 백엔드와 PostgreSQL database를 만들어줘"
    }
  });
  const normalHighResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "방문자 증가에 대비하는 API 백엔드와 PostgreSQL database를 만들고 개인정보는 보호해줘"
    }
  });

  assert.equal(lowSmallBasicResponse.statusCode, 200);
  assert.equal(normalHighResponse.statusCode, 200);

  const lowSmallBasicBody = architectureDraftResponseSchema.parse(lowSmallBasicResponse.json());
  const normalHighBody = architectureDraftResponseSchema.parse(normalHighResponse.json());
  const lowBackendNode = findDraftNode(lowSmallBasicBody, "app-server");
  const normalBackendNode = findDraftNode(normalHighBody, "app-server");
  const lowDatabaseNode = findDraftNode(lowSmallBasicBody, "app-database");
  const normalDatabaseNode = findDraftNode(normalHighBody, "app-database");
  const lowLogNode = findDraftNode(lowSmallBasicBody, "app-log-group");
  const normalLogNode = findDraftNode(normalHighBody, "app-log-group");

  assert.equal(lowBackendNode?.config.instanceType, "t3.micro");
  assert.equal(normalBackendNode?.config.instanceType, "t3.small");
  assert.equal(lowDatabaseNode?.config.instanceClass, "db.t4g.micro");
  assert.equal(normalDatabaseNode?.config.instanceClass, "db.t3.small");
  assert.equal(lowDatabaseNode?.config.allocatedStorage, 20);
  assert.equal(normalDatabaseNode?.config.allocatedStorage, 50);
  assert.equal(lowDatabaseNode?.config.deletionProtection, true);
  assert.equal(normalDatabaseNode?.config.deletionProtection, true);
  assert.equal(lowLogNode?.config.retentionInDays, 30);
  assert.equal(normalLogNode?.config.retentionInDays, 30);

  await app.close();
});

test("POST /api/ai/architecture-draft uses production-shaped entry, private app, S3, and DB paths", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "로그인과 파일 업로드가 있는 백엔드 웹서비스를 개인정보 보호 우선으로 만들어줘"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());
  const appServer = findDraftNode(body, "app-server");
  const appDatabase = findDraftNode(body, "app-database");
  const edgeIds = new Set(body.architectureJson.edges.map((edge) => edge.id));

  assertDraftHasNodeTypes(body, [
    "CLOUDFRONT",
    "SUBNET",
    "EC2",
    "S3",
    "IAM_POLICY",
    "KMS_KEY",
    "CLOUDWATCH_LOG_GROUP",
    "CLOUDWATCH_METRIC_ALARM",
    "RDS"
  ]);
  assert.equal(appServer?.config.associatePublicIpAddress, false);
  assert.match(String(appServer?.config.subnetId), /private_app_subnet/);
  assert.equal(appDatabase?.config.multiAz, true);
  assert.deepEqual(appDatabase?.config.subnetIds, [
    "aws_subnet.private_db_subnet_a.id",
    "aws_subnet.private_db_subnet_b.id"
  ]);
  assert.equal(appDatabase?.config.storageEncrypted, true);
  assert.ok(edgeIds.has("cloudfront-to-app-server"));
  assert.ok(edgeIds.has("private-app-subnet-a-to-app-server"));
  assert.ok(edgeIds.has("app-server-to-upload-bucket"));
  assert.ok(edgeIds.has("app-runtime-policy-to-upload-bucket"));
  assert.ok(edgeIds.has("private-db-subnet-a-to-app-database"));
  assert.ok(edgeIds.has("private-db-subnet-b-to-app-database"));
  assert.ok(edgeIds.has("data-encryption-key-to-app-database"));

  await app.close();
});

test("POST /api/ai/architecture-draft changes delivery and serverless parameters from operating intent", async () => {
  const app = buildApp();

  const lowStaticResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "저렴하게 시작하는 static website를 만들어줘"
    }
  });
  const normalStaticResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "방문자 증가에 대비하고 보호가 중요한 static website를 만들어줘"
    }
  });
  const lowLambdaResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "저렴하게 시작하는 Lambda API를 만들어줘"
    }
  });
  const normalLambdaResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "방문자 증가에 대비하고 보호가 필요한 Lambda API를 만들어줘"
    }
  });

  assert.equal(lowStaticResponse.statusCode, 200);
  assert.equal(normalStaticResponse.statusCode, 200);
  assert.equal(lowLambdaResponse.statusCode, 200);
  assert.equal(normalLambdaResponse.statusCode, 200);

  const lowStaticBody = architectureDraftResponseSchema.parse(lowStaticResponse.json());
  const normalStaticBody = architectureDraftResponseSchema.parse(normalStaticResponse.json());
  const lowLambdaBody = architectureDraftResponseSchema.parse(lowLambdaResponse.json());
  const normalLambdaBody = architectureDraftResponseSchema.parse(normalLambdaResponse.json());
  const lowCloudFrontNode = findDraftNode(lowStaticBody, "cloudfront-distribution");
  const normalCloudFrontNode = findDraftNode(normalStaticBody, "cloudfront-distribution");
  const lowBucketNode = findDraftNode(lowStaticBody, "web-assets-bucket");
  const normalBucketNode = findDraftNode(normalStaticBody, "web-assets-bucket");
  const lowLambdaNode = findDraftNode(lowLambdaBody, "lambda-function");
  const normalLambdaNode = findDraftNode(normalLambdaBody, "lambda-function");
  const lowLambdaLogNode = findDraftNode(lowLambdaBody, "lambda-log-group");
  const normalLambdaLogNode = findDraftNode(normalLambdaBody, "lambda-log-group");

  assert.equal(lowCloudFrontNode?.config.priceClass, "PriceClass_100");
  assert.equal(normalCloudFrontNode?.config.priceClass, "PriceClass_200");
  assert.equal(lowBucketNode?.config.forceDestroy, true);
  assert.equal(normalBucketNode?.config.forceDestroy, false);
  assert.equal(normalBucketNode?.config.publicAccessBlock, true);
  assert.equal(lowLambdaNode?.config.memorySize, 128);
  assert.equal(normalLambdaNode?.config.memorySize, 256);
  assert.equal(lowLambdaNode?.config.timeout, 10);
  assert.equal(normalLambdaNode?.config.timeout, 20);
  assert.equal(lowLambdaLogNode?.config.retentionInDays, 7);
  assert.equal(normalLambdaLogNode?.config.retentionInDays, 30);

  await app.close();
});

test("POST /api/ai/architecture-draft ignores legacy guardrail choice fields", async () => {
	const app = buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/api/ai/architecture-draft",
		payload: {
			prompt: "API 서버를 만들고 싶어",
			scenarioHint: "serverless_app",
			budgetLevel: "low",
			trafficLevel: "small",
			securityPriority: "basic"
		}
	});

	assert.equal(response.statusCode, 200);

  const body = architectureDraftResponseSchema.parse(response.json());

  assert.equal(body.metadata.selectedDraftPattern, "api_server");
  assertDraftHasNodeTypes(body, ["EC2", "AMI", "SECURITY_GROUP"]);

	await app.close();
});

test("POST /api/ai/architecture-draft rejects an empty prompt", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: ""
    }
  });

  assert.equal(response.statusCode, 400);

  await app.close();
});

test("OPTIONS /api/ai/architecture-draft responds to browser CORS preflight", async () => {
  const app = buildApp();

  const response = await app.inject({
    headers: {
      "access-control-request-headers": "content-type",
      "access-control-request-method": "POST",
      origin: "http://localhost:3000"
    },
    method: "OPTIONS",
    url: "/api/ai/architecture-draft"
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.match(String(response.headers["access-control-allow-methods"]), /POST/);
  assert.match(String(response.headers["access-control-allow-headers"]), /content-type/);

  await app.close();
});

test("POST /api/ai/github-architecture-draft returns an Architecture Draft from public repository evidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.endsWith("/README.md")) {
      return new Response("Express API server with PostgreSQL database", { status: 200 });
    }

    if (url.endsWith("/package.json")) {
      return new Response('{"dependencies":{"express":"latest","pg":"latest"}}', { status: 200 });
    }

    return new Response("", { status: 404 });
  };

  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/github-architecture-draft",
      payload: {
        repositoryUrl: "https://github.com/example/backend-api"
      }
    });

    assert.equal(response.statusCode, 200);

    const body = architectureDraftResponseSchema.parse(response.json());
    const nodeTypes = body.architectureJson.nodes.map((node) => node.type);

    assert.equal(body.title, "DB 포함 백엔드 Practice Architecture");
    assert.equal(body.metadata.source, "github");
    assert.ok(nodeTypes.includes("EC2"));
    assert.ok(nodeTypes.includes("RDS"));
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("POST /api/ai/github-architecture-draft rejects non-GitHub repository URLs", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/github-architecture-draft",
    payload: {
      repositoryUrl: "https://example.com/not-a-github-repo"
    }
  });

  assert.equal(response.statusCode, 400);

  await app.close();
});

test("POST /api/ai/pre-deployment-check reports open SSH as a high Security Risk", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/pre-deployment-check",
    payload: {
      architectureJson: {
        nodes: [
          {
            id: "sg-public-ssh",
            type: "SECURITY_GROUP",
            label: "Public SSH",
            positionX: 120,
            positionY: 180,
            config: {
              ingress: [
                {
                  protocol: "tcp",
                  port: 22,
                  cidr: "0.0.0.0/0"
                }
              ]
            }
          }
        ],
        edges: []
      }
    }
  });

  assert.equal(response.statusCode, 200);

  const body = preDeploymentAnalysisResponseSchema.parse(response.json());
  const finding = body.findings.find((item) => item.resourceId === "sg-public-ssh");

  assert.equal(finding?.category, "security");
  assert.equal(finding?.severity, "high");
  assert.equal(body.checklist.some((item) => item.status === "fail"), true);

  await app.close();
});

test("POST /api/ai/pre-deployment-check reports cost and missing configuration risks", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/pre-deployment-check",
    payload: {
      architectureJson: {
        nodes: [
          {
            id: "ec2-backend",
            type: "EC2",
            label: "Backend Server",
            positionX: 120,
            positionY: 180,
            config: {
              subnetId: "subnet-app"
            }
          },
          {
            id: "rds-primary",
            type: "RDS",
            label: "Backend Database",
            positionX: 360,
            positionY: 180,
            config: {
              engine: "postgres",
              instanceClass: "db.t4g.micro"
            }
          }
        ],
        edges: []
      }
    }
  });

  assert.equal(response.statusCode, 200);

  const body = preDeploymentAnalysisResponseSchema.parse(response.json());
  const costFinding = body.findings.find((item) => item.category === "cost");
  const configurationFinding = body.findings.find((item) => item.category === "configuration");
  const databaseEstimate = body.resourceCostEstimates.find((item) => item.resourceId === "rds-primary");

  assert.equal(costFinding?.resourceId, "rds-primary");
  assert.equal(costFinding?.severity, "medium");
  assert.equal(configurationFinding?.resourceId, "ec2-backend");
  assert.equal(configurationFinding?.severity, "medium");
  assert.equal(databaseEstimate?.resourceId, "rds-primary");
  assert.equal(body.summary.includes("Security Risk"), false);
  assert.equal(body.checklist.some((item) => item.id === "required-config-check" && item.status === "fail"), true);

  await app.close();
});

test("POST /api/ai/pre-deployment-check-from-diagram analyzes DiagramJson through the adapter", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/pre-deployment-check-from-diagram",
    payload: {
      diagramJson: {
        nodes: [
          {
            id: "sg-rule-ssh",
            type: "aws_security_group_rule",
            kind: "resource",
            position: { x: 120, y: 180 },
            size: { width: 160, height: 96 },
            label: "Public SSH",
            locked: false,
            zIndex: 0,
            parameters: {
              terraformBlockType: "resource",
              resourceType: "aws_security_group_rule",
              resourceName: "ssh",
              fileName: "main",
              values: {
                type: "ingress",
                fromPort: 22,
                toPort: 22,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"]
              }
            }
          },
          {
            id: "rds-primary",
            type: "aws_db_instance",
            kind: "resource",
            position: { x: 360, y: 180 },
            size: { width: 160, height: 96 },
            label: "Backend Database",
            locked: false,
            zIndex: 1,
            parameters: {
              terraformBlockType: "resource",
              resourceType: "aws_db_instance",
              resourceName: "primary",
              fileName: "main",
              values: {
                engine: "postgres",
                instanceClass: "db.t4g.micro"
              }
            }
          }
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    }
  });

  assert.equal(response.statusCode, 200);

  const body = preDeploymentAnalysisResponseSchema.parse(response.json());
  const securityFinding = body.findings.find((item) => item.resourceId === "sg-rule-ssh");
  const costFinding = body.findings.find((item) => item.resourceId === "rds-primary");

  assert.equal(securityFinding?.category, "security");
  assert.equal(securityFinding?.severity, "high");
  assert.equal(costFinding?.category, "cost");
  assert.equal(costFinding?.severity, "medium");
  assert.equal(body.checklist.some((item) => item.status === "fail"), true);

  await app.close();
});

test("POST /api/ai/terraform-error-explanation explains AccessDenied as a permission issue", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-error-explanation",
    payload: {
      stage: "plan",
      rawMessage: "Error: AccessDenied: User is not authorized to perform ec2:RunInstances",
      relatedResourceId: "ec2-web"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = terraformErrorExplanationResponseSchema.parse(response.json());

  assert.equal(body.stage, "plan");
  assert.equal(body.category, "permission");
  assert.equal(body.severity, "high");
  assert.equal(body.relatedResourceId, "ec2-web");
  assert.ok(body.summary.includes("권한"));
  assert.ok(body.nextActions.length > 0);

  await app.close();
});

test("POST /api/ai/terraform-error-explanation accepts export stage errors", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-error-explanation",
    payload: {
      stage: "export",
      rawMessage: "Error: Missing required argument on generated variables.tf"
    }
  });

  assert.equal(response.statusCode, 200);

  const body = terraformErrorExplanationResponseSchema.parse(response.json());

  assert.equal(body.stage, "export");
  assert.equal(body.category, "syntax");

  await app.close();
});

test("POST /api/ai/terraform-error-explanation classifies common Terraform error categories", async () => {
  const app = buildApp();

  const cases = [
    {
      rawMessage: "Error: NoCredentialProviders: no valid credential sources for Terraform AWS provider",
      expectedCategory: "credential"
    },
    {
      rawMessage: "Error: InvalidAMIID.NotFound: The image id does not exist in this region",
      expectedCategory: "region_or_resource"
    },
    {
      rawMessage: "Error: VcpuLimitExceeded: You have requested more vCPU capacity than your current limit",
      expectedCategory: "quota"
    },
    {
      rawMessage: "Error: Invalid expression on main.tf line 12",
      expectedCategory: "syntax"
    },
    {
      rawMessage: "Error: DependencyViolation: resource has a dependent object",
      expectedCategory: "dependency"
    }
  ];

  for (const item of cases) {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/terraform-error-explanation",
      payload: {
        stage: "validate",
        rawMessage: item.rawMessage
      }
    });

    assert.equal(response.statusCode, 200);

    const body = terraformErrorExplanationResponseSchema.parse(response.json());

    assert.equal(body.category, item.expectedCategory);
    assert.ok(body.summary.length > 0);
    assert.ok(body.likelyCause.length > 0);
    assert.ok(body.nextActions.length > 0);
  }

  await app.close();
});

test("POST /api/ai/terraform-preview-explanation explains IaC Preview resources and safety findings", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-preview-explanation",
    payload: {
      terraformCode: `
resource "aws_security_group_rule" "ssh" {
  type = "ingress"
  from_port = 22
  to_port = 22
  cidr_blocks = ["0.0.0.0/0"]
}

resource "aws_instance" "web" {
  instance_type = "t3.micro"
}

resource "aws_db_instance" "main" {
  instance_class = "db.t4g.micro"
}
`
    }
  });

  assert.equal(response.statusCode, 200);

  const body = terraformPreviewExplanationResponseSchema.parse(response.json());
  const detectedTypes = body.detectedResources.map((resource) => resource.terraformType);

  assert.ok(body.summary.includes("IaC Preview"));
  assert.ok(detectedTypes.includes("aws_instance"));
  assert.ok(detectedTypes.includes("aws_db_instance"));
  assert.equal(body.findings.some((finding) => finding.category === "security"), true);
  assert.equal(body.findings.some((finding) => finding.category === "cost"), true);
  assert.equal(body.checklist.some((item) => item.id === "terraform-review-check"), true);

  await app.close();
});

test("POST /api/ai/terraform-preview-explanation explains route table associations as subnet routing", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-preview-explanation",
    payload: {
      terraformCode: `
resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
`
    }
  });

  assert.equal(response.statusCode, 200);

  const body = terraformPreviewExplanationResponseSchema.parse(response.json());
  const routeTableAssociation = body.detectedResources.find(
    (resource) => resource.terraformType === "aws_route_table_association"
  );

  assert.ok(routeTableAssociation);
  assert.match(body.summary, /Route Table Association/);
  assert.doesNotMatch(body.summary, /감지했습니다/);
  assert.match(routeTableAssociation.explanation, /aws_subnet\.public\.id/);
  assert.match(routeTableAssociation.explanation, /aws_route_table\.public\.id/);
  assert.match(routeTableAssociation.explanation, /라우팅 규칙/);

  await app.close();
});
