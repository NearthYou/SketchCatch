import assert from "node:assert/strict";
import test from "node:test";
import type {
  SourceRepository,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

import {
  createRepositoryEvidenceSummary,
  getRepositoryDisplayIdentity
} from "./repository-analysis-presentation";

const analysis: SourceRepositoryAnalysisResult = {
  repositoryUrl: "https://github.com/NearthYou/SketchCatch",
  repositoryRevision: "revision-1",
  defaultBranch: "dev",
  availableBranches: ["dev"],
  evidenceFiles: [],
  detectedSignals: ["Container", "Node API", "Database"],
  recommendedTemplateId: "ecs-fargate-container-app",
  recommendationReason: "컨테이너 런타임과 공개 API 진입점이 확인되었습니다.",
  aiHandoff: {
    status: "template_selected",
    templateId: "ecs-fargate-container-app",
    selectionReasons: ["컨테이너 런타임"],
    applicationUnits: [],
    evidence: [],
    missingEvidence: [],
    architectureFacts: [
      { kind: "backend_runtime", value: "ecs_fargate_service", sourcePath: "README.md" },
      { kind: "frontend_delivery", value: "s3_cloudfront_static", sourcePath: "README.md" },
      { kind: "traffic_entry", value: "application_load_balancer", sourcePath: "README.md" },
      { kind: "runtime_scale", value: "autoscaling_1_3", sourcePath: "README.md" }
    ]
  }
};

test("Repository evidence summary uses only mapped analysis facts and hides source paths", () => {
  assert.deepEqual(createRepositoryEvidenceSummary(analysis), [
    { label: "실행 방식", value: "ECS Fargate Service" },
    { label: "프론트엔드", value: "S3 · CloudFront" },
    { label: "공개 진입점", value: "Application Load Balancer" },
    { label: "확장", value: "1–3개 Task 자동 확장" }
  ]);
  assert.doesNotMatch(JSON.stringify(createRepositoryEvidenceSummary(analysis)), /README\.md/);
});

test("Repository display identity comes from the analyzed URL and branch", () => {
  assert.deepEqual(getRepositoryDisplayIdentity(analysis), {
    branch: "dev",
    name: "SketchCatch",
    owner: "NearthYou"
  });
});

test("connected Repository evidence remains visible without optional architecture facts", () => {
  const connectedRepository: SourceRepository = {
    id: "repository-1",
    projectId: "project-1",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "github-repository-1",
    owner: "NearthYou",
    name: "SketchCatch",
    defaultBranch: "dev",
    repositoryUrl: "https://github.com/NearthYou/SketchCatch",
    visibility: "private",
    archived: false,
    analysis: {
      repositoryRevision: "revision-1",
      analyzedAt: "2026-07-23T00:00:00.000Z",
      aiHandoff: {
        status: "template_selected",
        templateId: "ecs-fargate-container-app",
        selectionReasons: ["Dockerfile과 Fastify가 확인되었습니다."],
        applicationUnits: [],
        evidence: [
          {
            kind: "dockerfile",
            path: "apps/api/Dockerfile",
            applicationUnitId: null,
            signals: ["Dockerfile"]
          },
          {
            kind: "package_json",
            path: "apps/api/package.json",
            applicationUnitId: null,
            signals: ["Fastify"]
          },
          {
            kind: "static_output",
            path: "apps/web/dist",
            applicationUnitId: null,
            signals: ["Vite static build output"]
          }
        ],
        missingEvidence: []
      }
    },
    disconnectedAt: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z"
  };

  assert.deepEqual(createRepositoryEvidenceSummary(connectedRepository), [
    { label: "실행 방식", value: "Dockerfile" },
    { label: "백엔드", value: "Node.js API" },
    { label: "빌드 결과", value: "정적 웹 빌드" }
  ]);
  assert.doesNotMatch(
    JSON.stringify(createRepositoryEvidenceSummary(connectedRepository)),
    /apps\/api|apps\/web/
  );
});
