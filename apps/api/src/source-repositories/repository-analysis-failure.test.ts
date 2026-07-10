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
