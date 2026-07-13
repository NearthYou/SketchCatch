import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRepositoryEvidence } from "./repository-analysis.js";

test("selects static web hosting for a Vite frontend in a monorepo", () => {
  // Given
  const snapshot = {
    revision: "static-revision",
    treePaths: [
      "apps/web/package.json",
      "apps/web/src/main.tsx",
      "apps/web/vite.config.ts",
      "package.json",
      "pnpm-lock.yaml"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
      },
      {
        path: "apps/web/package.json",
        content: JSON.stringify({
          name: "web",
          scripts: { build: "vite build" },
          dependencies: { react: "19.0.0" },
          devDependencies: { vite: "7.0.0" }
        })
      },
      {
        path: "apps/web/vite.config.ts",
        content: "export default {}"
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selected");
  assert.equal(result.templateId, "static-web-hosting");
  assert.deepEqual(result.applicationUnits, [
    {
      id: "apps/web",
      rootPath: "apps/web",
      kind: "frontend",
      frameworks: ["React", "Vite"],
      evidencePaths: ["apps/web/package.json", "apps/web/vite.config.ts"]
    }
  ]);
  assert.equal(result.deploymentTypeDefault, "serverless");
  assert.equal(result.usesCiCdDefault, null);
  assert.ok((result.questions ?? []).length <= 5);
  assert.equal(result.recommendation?.candidates[0]?.templateId, "static-web-hosting");
});

test("selects minimal serverless API for a backend with Lambda and API Gateway evidence", () => {
  // Given
  const snapshot = {
    revision: "serverless-api-revision",
    treePaths: ["package.json", "serverless.yml", "src/handler.ts", "yarn.lock"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { fastify: "5.0.0", serverless: "4.0.0" }
        })
      },
      {
        path: "serverless.yml",
        content: "provider: aws\nfunctions:\n  api:\n    events:\n      - httpApi: '*'\nresources:\n  DynamoDB: true"
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selected");
  assert.equal(result.templateId, "minimal-serverless-api");
  assert.deepEqual(
    result.evidence.find((evidence) => evidence.path === "serverless.yml"),
    {
      kind: "framework_config",
      path: "serverless.yml",
      applicationUnitId: ".",
      signals: ["serverless.yml"]
    }
  );
  assert.equal(result.missingEvidence.includes("framework_config"), false);
});

test("selects full serverless web app for frontend backend API and Cognito evidence", () => {
  // Given
  const snapshot = {
    revision: "full-serverless-revision",
    treePaths: [
      "apps/api/package.json",
      "apps/api/serverless.yml",
      "apps/web/package.json",
      "apps/web/vite.config.ts",
      "package.json",
      "pnpm-lock.yaml"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
      },
      {
        path: "apps/web/package.json",
        content: JSON.stringify({ dependencies: { react: "19.0.0", vite: "7.0.0" } })
      },
      { path: "apps/web/vite.config.ts", content: "export default {}" },
      {
        path: "apps/api/package.json",
        content: JSON.stringify({ dependencies: { fastify: "5.0.0", serverless: "4.0.0" } })
      },
      {
        path: "apps/api/serverless.yml",
        content:
          "provider: aws\nfunctions:\n  api:\n    events:\n      - httpApi: '*'\nresources:\n  CognitoUserPool: true\n  DynamoDB: true"
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selected");
  assert.equal(result.templateId, "full-serverless-web-app");
  assert.deepEqual(
    result.applicationUnits.map((unit) => unit.rootPath),
    ["apps/api", "apps/web"]
  );
});

test("detects NestJS packages and FastAPI Docker applications as backend units", () => {
  const snapshot = {
    revision: "mixed-backend-revision",
    treePaths: [
      "apps/fastapi-api/Dockerfile",
      "apps/fastapi-api/README.md",
      "apps/nest-api/Dockerfile",
      "apps/nest-api/package.json",
      "package.json"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
      },
      {
        path: "apps/nest-api/package.json",
        content: JSON.stringify({ dependencies: { "@nestjs/core": "11.0.0" } })
      },
      {
        path: "apps/nest-api/Dockerfile",
        content: "FROM node:24"
      },
      {
        path: "apps/fastapi-api/Dockerfile",
        content: "FROM python:3.13\nCMD [\"uvicorn\", \"app.main:app\"]"
      },
      {
        path: "apps/fastapi-api/README.md",
        content: "FastAPI recommendation service"
      }
    ]
  } as const;

  const result = analyzeRepositoryEvidence(snapshot);

  assert.deepEqual(result.applicationUnits, [
    {
      id: "apps/fastapi-api",
      rootPath: "apps/fastapi-api",
      kind: "backend",
      frameworks: ["FastAPI"],
      evidencePaths: ["apps/fastapi-api/Dockerfile"]
    },
    {
      id: "apps/nest-api",
      rootPath: "apps/nest-api",
      kind: "backend",
      frameworks: ["NestJS"],
      evidencePaths: ["apps/nest-api/package.json"]
    }
  ]);
});

test("selects three tier web app only with explicit VPC ALB ASG and RDS evidence", () => {
  // Given
  const snapshot = {
    revision: "three-tier-revision",
    treePaths: [
      "README.md",
      "apps/api/package.json",
      "apps/web/package.json",
      "package.json",
      "pnpm-lock.yaml"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
      },
      {
        path: "apps/web/package.json",
        content: JSON.stringify({ dependencies: { react: "19.0.0", vite: "7.0.0" } })
      },
      {
        path: "apps/api/package.json",
        content: JSON.stringify({ dependencies: { fastify: "5.0.0", pg: "8.0.0" } })
      },
      {
        path: "README.md",
        content: "AWS VPC 안에서 ALB가 Auto Scaling Group으로 요청을 보내고 RDS PostgreSQL을 사용합니다."
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selected");
  assert.equal(result.templateId, "three-tier-web-app");
});

test("selects ECS Fargate container app with Docker ECS and Fargate evidence", () => {
  // Given
  const snapshot = {
    revision: "ecs-revision",
    treePaths: ["Dockerfile", "README.md", "package.json", "src/server.ts"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { fastify: "5.0.0" } })
      },
      { path: "Dockerfile", content: "FROM node:24-alpine" },
      {
        path: "README.md",
        content: "이 container는 Amazon ECS의 Fargate launch type으로 배포합니다."
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selected");
  assert.equal(result.templateId, "ecs-fargate-container-app");
  assert.equal(result.deploymentTypeDefault, "container");
  assert.equal(result.recommendation?.candidates[0]?.templateId, "ecs-fargate-container-app");
});

test("extracts an evidence-backed minimal Fargate deployment contract", () => {
  const snapshot = {
    revision: "fargate-contract-revision",
    treePaths: [
      ".github/workflows/deploy.yml",
      "README.md",
      "apps/api/Dockerfile",
      "apps/api/package.json",
      "apps/web/package.json",
      "package.json"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
      },
      {
        path: "apps/web/package.json",
        content: JSON.stringify({ dependencies: { react: "19", vite: "7" } })
      },
      {
        path: "apps/api/package.json",
        content: JSON.stringify({ dependencies: { express: "5" } })
      },
      {
        path: "apps/api/Dockerfile",
        content: [
          "FROM node:22-alpine",
          "ENV PORT=8080",
          "EXPOSE 8080",
          "HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/health || exit 1"
        ].join("\n")
      },
      {
        path: "README.md",
        content: [
          "Deploy apps/web as a Vite static build with S3 and CloudFront.",
          "Push the API image to ECR and run one ECS Fargate task behind an ALB.",
          "The ALB terminates TLS and checks /health.",
          "CloudWatch collects ECS and ALB logs and metrics.",
          "GitHub Actions builds, pushes to ECR, and deploys the ECS service.",
          "Database, Redis, WebSocket, and authentication are not required.",
          "Terraform and AWS resource definitions are not included in this repository."
        ].join("\n")
      }
    ]
  } as const;

  const result = analyzeRepositoryEvidence(snapshot);
  const facts = new Set(
    (result.architectureFacts ?? []).map((fact) => `${fact.kind}:${fact.value}`)
  );

  assert.ok(facts.has("frontend_delivery:s3_cloudfront_static"));
  assert.ok(facts.has("backend_runtime:ecs_fargate_service"));
  assert.ok(facts.has("container_registry:ecr"));
  assert.ok(facts.has("traffic_entry:application_load_balancer"));
  assert.ok(facts.has("observability:cloudwatch"));
  assert.ok(facts.has("ci_cd:github_actions"));
  assert.ok(facts.has("health_check:http:8080/health"));
  assert.ok(facts.has("transport_security:alb_tls_termination"));
  assert.ok(facts.has("runtime_scale:single_task"));
  assert.ok(facts.has("excluded_capability:database"));
  assert.ok(facts.has("excluded_capability:redis"));
  assert.ok(facts.has("excluded_capability:websocket"));
  assert.ok(facts.has("excluded_capability:authentication"));
  assert.ok(facts.has("infrastructure_definition:not_in_repository"));
});

test("selects EKS container app with Docker Kubernetes and EKS evidence", () => {
  // Given
  const snapshot = {
    revision: "eks-revision",
    treePaths: [
      "Dockerfile",
      "README.md",
      "deploy/eks/deployment.yaml",
      "deploy/eks/kustomization.yaml",
      "package.json"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { fastify: "5.0.0" } })
      },
      { path: "Dockerfile", content: "FROM node:24-alpine" },
      {
        path: "deploy/eks/kustomization.yaml",
        content: "resources:\n  - deployment.yaml"
      },
      {
        path: "README.md",
        content: "Kubernetes workload를 Amazon EKS managed node group에 배포합니다."
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selected");
  assert.equal(result.templateId, "eks-container-app");
  assert.deepEqual(
    result.evidence.find((evidence) => evidence.path === "deploy/eks/kustomization.yaml"),
    {
      kind: "framework_config",
      path: "deploy/eks/kustomization.yaml",
      applicationUnitId: ".",
      signals: ["kustomization.yaml"]
    }
  );
});
