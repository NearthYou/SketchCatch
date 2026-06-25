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
        type: z.string()
      })
    ),
    edges: z.array(z.object({ id: z.string() }))
  }),
  title: z.string(),
  metadata: z.object({
    source: z.string(),
    confidence: z.string(),
    assumptions: z.array(z.string()),
    explanations: z.array(z.string()),
    selectedScenario: z.string().optional(),
    scenarioScores: z
      .array(
        z.object({
          scenario: z.string(),
          score: z.number(),
          reasons: z.array(z.string())
        })
      )
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
  assert.ok(apiServerNodeTypes.includes("EC2"));
  assert.ok(apiServerNodeTypes.includes("SECURITY_GROUP"));

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
  assert.ok(databaseBackendNodeTypes.includes("SECURITY_GROUP"));

	await app.close();
});

test("POST /api/ai/architecture-draft uses guardrail choices before prompt keywords", async () => {
	const app = buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/api/ai/architecture-draft",
		payload: {
			prompt: "DB가 포함된 백엔드 서버를 만들고 싶어",
			scenarioHint: "static_site",
			budgetLevel: "low",
			trafficLevel: "small",
			securityPriority: "high"
		}
	});

	assert.equal(response.statusCode, 200);

	const body = architectureDraftResponseSchema.parse(response.json());
	const nodeTypes = body.architectureJson.nodes.map((node) => node.type);

	assert.equal(body.title, "정적 웹사이트 Practice Architecture");
	assert.ok(nodeTypes.includes("S3"));
	assert.equal(nodeTypes.includes("RDS"), false);
  assert.equal(body.metadata.selectedScenario, "static_site");
  assert.ok(body.metadata.guardrailWarnings?.some((warning) => warning.code === "scenario_conflict"));
	assert.ok(body.metadata.assumptions.some((item) => item.includes("낮은 예산")));
	assert.ok(body.metadata.assumptions.some((item) => item.includes("작은 트래픽")));
	assert.ok(body.metadata.assumptions.some((item) => item.includes("보안 우선순위")));

	await app.close();
});

test("POST /api/ai/architecture-draft returns auto scenario scores and fallback warning metadata", async () => {
  const app = buildApp();

  const scoredResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "Next 프론트엔드 정적 웹사이트를 만들고 싶어",
      scenarioHint: "auto",
      budgetLevel: "normal",
      trafficLevel: "normal",
      securityPriority: "basic"
    }
  });

  assert.equal(scoredResponse.statusCode, 200);

  const scoredBody = architectureDraftResponseSchema.parse(scoredResponse.json());
  const staticSiteScore = scoredBody.metadata.scenarioScores?.find((score) => score.scenario === "static_site");

  assert.equal(scoredBody.metadata.selectedScenario, "static_site");
  assert.ok(staticSiteScore !== undefined);
  assert.ok(staticSiteScore.score > 0);
  assert.ok(staticSiteScore.reasons.length > 0);

  const unsupportedResponse = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "멀티 리전 EKS 기반 금융권 서비스를 자동 설계하고 싶어",
      scenarioHint: "auto",
      budgetLevel: "normal",
      trafficLevel: "normal",
      securityPriority: "basic"
    }
  });

  assert.equal(unsupportedResponse.statusCode, 200);

  const unsupportedBody = architectureDraftResponseSchema.parse(unsupportedResponse.json());

  assert.equal(unsupportedBody.metadata.selectedScenario, "static_site");
  assert.ok(unsupportedBody.metadata.guardrailWarnings?.some((warning) => warning.code === "unsupported_requirement"));

  await app.close();
});

test("POST /api/ai/architecture-draft rejects invalid guardrail choices", async () => {
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

	assert.equal(response.statusCode, 400);

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
            id: "backend-server",
            type: "EC2",
            label: "Backend Server",
            positionX: 120,
            positionY: 180,
            config: {
              subnetId: "app-subnet"
            }
          },
          {
            id: "backend-database",
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
  const databaseEstimate = body.resourceCostEstimates.find((item) => item.resourceId === "backend-database");

  assert.equal(costFinding?.resourceId, "backend-database");
  assert.equal(costFinding?.severity, "medium");
  assert.equal(configurationFinding?.resourceId, "backend-server");
  assert.equal(configurationFinding?.severity, "medium");
  assert.equal(databaseEstimate?.resourceId, "backend-database");
  assert.equal(body.summary.includes("Security Risk"), false);
  assert.equal(body.checklist.some((item) => item.id === "required-config-check" && item.status === "fail"), true);

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
