import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRepositoryEvidence } from "./repository-analysis.js";

test("returns selection failure when ECS and EKS signals are both explicit", () => {
  // Given
  const snapshot = {
    revision: "ambiguous-container-revision",
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
        path: "README.md",
        content:
          "Amazon ECS Fargate 배포와 Amazon EKS Kubernetes 배포 설정을 모두 유지합니다."
      },
      {
        path: "deploy/eks/kustomization.yaml",
        content: "resources:\n  - deployment.yaml"
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selection_failed");
  assert.equal(result.templateId, null);
  assert.match(result.mismatchReasons[0] ?? "", /둘 이상/);
});

test("detects common monorepo units but refuses a Template without deployment evidence", () => {
  // Given
  const snapshot = {
    revision: "unsupported-monorepo-revision",
    treePaths: [
      "apps/web/next.config.mjs",
      "apps/web/package.json",
      "package.json",
      "services/api/package.json"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({
          private: true,
          workspaces: { packages: ["apps/*", "services/*"] }
        })
      },
      {
        path: "apps/web/package.json",
        content: JSON.stringify({ dependencies: { next: "16.0.0", react: "19.0.0" } })
      },
      { path: "apps/web/next.config.mjs", content: "export default {}" },
      {
        path: "services/api/package.json",
        content: JSON.stringify({ dependencies: { express: "5.0.0" } })
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selection_failed");
  assert.deepEqual(result.applicationUnits, [
    {
      id: "apps/web",
      rootPath: "apps/web",
      kind: "fullstack",
      frameworks: ["React", "Next.js"],
      evidencePaths: ["apps/web/next.config.mjs", "apps/web/package.json"]
    },
    {
      id: "services/api",
      rootPath: "services/api",
      kind: "backend",
      frameworks: ["Express"],
      evidencePaths: ["services/api/package.json"]
    }
  ]);
});

test("ignores generated dependency evidence during Template Selection", () => {
  // Given
  const snapshot = {
    revision: "generated-dependency-revision",
    treePaths: [
      "node_modules/vendor/package.json",
      "node_modules/vendor/serverless.yml"
    ],
    files: [
      {
        path: "node_modules/vendor/package.json",
        content: JSON.stringify({
          dependencies: { fastify: "5.0.0", serverless: "4.0.0" }
        })
      },
      {
        path: "node_modules/vendor/serverless.yml",
        content: "functions:\n  api:\n    events:\n      - httpApi: '*'"
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selection_failed");
  assert.deepEqual(result.applicationUnits, []);
  assert.deepEqual(result.evidence, []);
});

test("keeps a Docker application as an unknown Application Unit", () => {
  // Given
  const snapshot = {
    revision: "docker-only-revision",
    treePaths: ["Dockerfile", "README.md"],
    files: [
      { path: "Dockerfile", content: "FROM nginx:stable" },
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
  assert.deepEqual(result.applicationUnits, [
    {
      id: ".",
      rootPath: ".",
      kind: "unknown",
      frameworks: [],
      evidencePaths: ["Dockerfile"]
    }
  ]);
});

test("ignores nested packages outside declared workspace patterns", () => {
  // Given
  const snapshot = {
    revision: "workspace-boundary-revision",
    treePaths: [
      "apps/web/package.json",
      "apps/web/vite.config.ts",
      "docs/example/package.json",
      "package.json"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
      },
      {
        path: "apps/web/package.json",
        content: JSON.stringify({
          scripts: { build: "vite build" },
          dependencies: { react: "19.0.0", vite: "7.0.0" }
        })
      },
      { path: "apps/web/vite.config.ts", content: "export default {}" },
      {
        path: "docs/example/package.json",
        content: JSON.stringify({ dependencies: { fastify: "5.0.0" } })
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selected");
  assert.equal(result.templateId, "static-web-hosting");
  assert.deepEqual(
    result.applicationUnits.map((unit) => unit.rootPath),
    ["apps/web"]
  );
});

test("does not attach a root README container signal to a nested Docker unit", () => {
  // Given
  const snapshot = {
    revision: "unrelated-readme-revision",
    treePaths: [
      "README.md",
      "apps/api/Dockerfile",
      "apps/api/package.json",
      "package.json"
    ],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
      },
      {
        path: "apps/api/package.json",
        content: JSON.stringify({ dependencies: { fastify: "5.0.0" } })
      },
      { path: "apps/api/Dockerfile", content: "FROM node:24-alpine" },
      {
        path: "README.md",
        content: "다른 서비스는 Amazon ECS의 Fargate launch type으로 배포합니다."
      }
    ]
  } as const;

  // When
  const result = analyzeRepositoryEvidence(snapshot);

  // Then
  assert.equal(result.status, "template_selection_failed");
  assert.equal(result.templateId, null);
});
