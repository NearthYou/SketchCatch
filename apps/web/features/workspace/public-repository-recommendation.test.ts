import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceRepositoryAnalysisResult } from "@sketchcatch/types";
import {
  createPublicRepositoryArchitectureDraftRequest,
  createPublicRepositoryRecommendation,
  getPublicRepositoryDeploymentDefault,
  getPublicRepositoryTemplateDeploymentType,
  shouldAskPublicRepositoryDeploymentType
} from "./public-repository-recommendation";

test("public repository AI draft keeps the selected Template and includes follow-up answers", () => {
  const analysis = createAnalysisWithChoiceQuestions();
  const relationalRequest = createPublicRepositoryArchitectureDraftRequest({
    analysis,
    answers: {
      "application-scope": "api",
      "data-persistence": "relational",
      "operations-preference": "ec2"
    },
    deploymentType: "container",
    templateId: "ecs-fargate-container-app",
    usesCiCd: false
  });
  const noPersistenceRequest = createPublicRepositoryArchitectureDraftRequest({
    analysis,
    answers: {
      "application-scope": "api",
      "data-persistence": "none",
      "operations-preference": "managed"
    },
    deploymentType: "container",
    templateId: "ecs-fargate-container-app",
    usesCiCd: false
  });

  assert.equal(relationalRequest.templateId, "ecs-fargate-container-app");
  assert.match(relationalRequest.prompt, /selected Template is the highest-priority constraint/i);
  assert.match(relationalRequest.prompt, /Which data store should be included\?/);
  assert.match(relationalRequest.prompt, /Relational database/);
  assert.match(relationalRequest.prompt, /API backend/);
  assert.match(relationalRequest.prompt, /direct host operations/i);
  assert.match(relationalRequest.prompt, /Application type: API server/i);
  assert.match(relationalRequest.prompt, /Required Components:/);
  assert.notEqual(relationalRequest.prompt, noPersistenceRequest.prompt);
});

test("public repository AI draft carries authoritative deployment facts without generic scaling assumptions", () => {
  const analysis = createAnalysisWithChoiceQuestions();
  analysis.detectedSignals = [...analysis.detectedSignals, "Auto Scaling"];
  analysis.recommendationReason = "Use multiple containers and add a shared session store.";
  analysis.aiHandoff = {
    ...analysis.aiHandoff!,
    applicationUnits: [
      { id: "apps/api", rootPath: "apps/api", kind: "backend", frameworks: ["Express"], evidencePaths: [] },
      { id: "apps/web", rootPath: "apps/web", kind: "frontend", frameworks: ["React", "Vite"], evidencePaths: [] }
    ],
    architectureFacts: [
      { kind: "frontend_delivery", value: "s3_cloudfront_static", sourcePath: "README.md" },
      { kind: "backend_runtime", value: "ecs_fargate_service", sourcePath: "README.md" },
      { kind: "ci_cd", value: "github_actions", sourcePath: "README.md" },
      { kind: "runtime_scale", value: "single_task", sourcePath: "README.md" },
      { kind: "excluded_capability", value: "database", sourcePath: "README.md" }
    ]
  };

  const request = createPublicRepositoryArchitectureDraftRequest({
    analysis,
    answers: {},
    deploymentType: "container",
    templateId: "ecs-fargate-container-app",
    usesCiCd: true
  });

  assert.equal(request.repositoryEvidence?.mode, "strict");
  assert.equal(request.repositoryEvidence?.facts.length, 5);
  assert.equal(request.repositoryEvidence?.repositoryName, "Jungle_DB_API_W8");
  assert.match(request.prompt, /web frontend and API backend detected as separate application units/i);
  assert.match(request.prompt, /one runtime task; do not add dynamic task scaling/i);
  assert.match(request.prompt, /GitHub Actions builds and deploys; do not substitute CodePipeline/i);
  assert.match(request.prompt, /no persistent database required by explicit repository evidence/i);
  assert.doesNotMatch(request.prompt, /horizontal scaling readiness/i);
  assert.doesNotMatch(request.prompt, /mostly steady with occasional bursts/i);
  assert.doesNotMatch(request.prompt, /Availability target: 99\.9%/i);
  assert.doesNotMatch(request.prompt, /Auto Scaling/i);
  assert.doesNotMatch(request.prompt, /multiple containers|shared session store/i);
});

test("public repository recommendation returns multiple candidates and follow-up questions", () => {
  const analysis = createAnalysis();
  const deploymentType = getPublicRepositoryDeploymentDefault(analysis);
  const recommendation = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType,
    selectedTemplateId: "ecs-fargate-container-app"
  });

  assert.equal(deploymentType, "container");
  assert.equal(shouldAskPublicRepositoryDeploymentType(analysis), false);
  assert.equal(recommendation.candidates.length, 2);
  assert.equal(recommendation.candidates[0]?.templateId, "ecs-fargate-container-app");
  assert.deepEqual(
    recommendation.questions.map((question) => question.id),
    ["include_frontend", "include_database"]
  );
  assert.equal(recommendation.questions[0]?.prompt, "AI가 생성한 프론트엔드 확인 질문");
});

test("follow-up questions change with the selected template", () => {
  const analysis = createAnalysis();
  const serverless = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType: "serverless",
    selectedTemplateId: "full-serverless-web-app"
  });
  const staticSite = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType: "serverless",
    selectedTemplateId: "static-web-hosting"
  });

  assert.deepEqual(
    serverless.questions.map((question) => question.id),
    ["primary_runtime", "include_database"]
  );
  assert.deepEqual(staticSite.questions, []);
  assert.ok(serverless.questions.length <= 5);
});

test("repository recommendation uses backend-ranked candidates without synthesizing extras", () => {
  const analysis: SourceRepositoryAnalysisResult = {
    ...createAnalysis(),
    detectedSignals: ["Container"]
  };
  const recommendation = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType: "container"
  });

  assert.equal(recommendation.candidates.length, 2);
  assert.equal(recommendation.candidates[0]?.templateId, "ecs-fargate-container-app");
  assert.deepEqual(
    new Set(recommendation.candidates.map((candidate) => candidate.templateId)),
    new Set(["ecs-fargate-container-app", "eks-container-app"])
  );
});

test("repository recommendation falls back to handoff questions when ranked candidates have none", () => {
  const analysis: SourceRepositoryAnalysisResult = {
    ...createAnalysis(),
    detectedSignals: ["Container"],
    repositoryUrl: "https://github.com/chaekang/Jungle_DB_API_W8",
    aiHandoff: {
      ...createAnalysis().aiHandoff!,
      questions: [
        {
          id: "data-persistence",
          prompt: "Should this service include persistent storage?",
          answerType: "boolean",
          required: true,
          reason: "Repository evidence does not prove whether runtime data must persist."
        },
        {
          id: "application-scope",
          prompt: "Which runtime components should be deployed?",
          answerType: "free_text",
          required: true,
          reason: "Container evidence was found, but the deployable unit is ambiguous."
        },
        {
          id: "operations-preference",
          prompt: "Do you prefer simpler ECS operations or Kubernetes control?",
          answerType: "single_select",
          options: [
            { label: "ECS Fargate", value: "ecs" },
            { label: "EKS", value: "eks" }
          ],
          required: true,
          reason: "Both ECS and EKS are plausible container targets."
        }
      ],
      recommendation: {
        deploymentType: "container",
        usesCiCd: true,
        candidates: [
          {
            templateId: "ecs-fargate-container-app",
            displayTitle: "ECS Fargate container app",
            confidence: 0.87,
            reasons: ["Dockerfile evidence matches a managed container service."],
            tradeoffs: ["Less Kubernetes control than EKS."],
            questions: []
          },
          {
            templateId: "eks-container-app",
            displayTitle: "EKS container app",
            confidence: 0.67,
            reasons: ["Container evidence could run on Kubernetes."],
            tradeoffs: ["Higher operational complexity."]
          }
        ]
      }
    }
  };

  const recommendation = createPublicRepositoryRecommendation({
    analysis,
    answers: {},
    deploymentType: "container",
    selectedTemplateId: "ecs-fargate-container-app"
  });

  assert.deepEqual(
    recommendation.questions.map((question) => question.id),
    ["data-persistence", "application-scope", "operations-preference"]
  );
});

test("legacy public analysis fallback still returns at least two comparison candidates", () => {
  for (const deploymentType of ["ec2_vm", "container", "serverless"] as const) {
    const recommendation = createPublicRepositoryRecommendation({
      analysis: {
        ...createAnalysis(),
        aiHandoff: undefined,
        detectedSignals: [],
        recommendedTemplateId: null
      },
      answers: {},
      deploymentType
    });

    assert.ok(recommendation.candidates.length >= 2, deploymentType);
    assert.equal(
      new Set(recommendation.candidates.map((candidate) => candidate.templateId)).size,
      recommendation.candidates.length,
      deploymentType
    );
    assert.equal(
      recommendation.candidates.every(
        (candidate) => candidate.reasons.length > 0 && candidate.tradeoffs.length > 0
      ),
      true,
      deploymentType
    );
  }
});

test("deployment type is only requested when repository evidence cannot determine it", () => {
  const ambiguousAnalysis: SourceRepositoryAnalysisResult = {
    ...createAnalysis(),
    detectedSignals: ["Node API", "Database"]
  };

  assert.equal(shouldAskPublicRepositoryDeploymentType(ambiguousAnalysis), true);
  assert.equal(getPublicRepositoryTemplateDeploymentType("ecs-fargate-container-app"), "container");
  assert.equal(getPublicRepositoryTemplateDeploymentType("full-serverless-web-app"), "serverless");
  assert.equal(getPublicRepositoryTemplateDeploymentType("three-tier-web-app"), "ec2_vm");
});

function createAnalysis(): SourceRepositoryAnalysisResult {
  return {
    availableBranches: ["main", "develop"],
    defaultBranch: "main",
    detectedSignals: ["React", "Node API", "Python API", "Database", "Container"],
    evidenceFiles: [],
    recommendationReason: "React, Node API, Python API, Database, Container 신호가 있습니다.",
    recommendedTemplateId: "three-tier-web-app",
    repositoryUrl: "https://github.com/example/fullstack",
    aiHandoff: {
      status: "template_selection_failed",
      templateId: null,
      applicationUnits: [],
      evidence: [],
      missingEvidence: [],
      mismatchReasons: ["비교 후보 선택이 필요합니다."],
      deploymentTypeDefault: "container",
      usesCiCdDefault: false,
      questions: [],
      recommendation: {
        deploymentType: "container",
        usesCiCd: false,
        candidates: [
          {
            templateId: "ecs-fargate-container-app",
            displayTitle: "ECS Fargate 컨테이너 앱",
            confidence: 0.84,
            reasons: ["컨테이너 근거가 ECS Fargate와 맞습니다."],
            tradeoffs: ["Kubernetes 이식성은 EKS보다 낮습니다."],
            questions: [
              {
                id: "include_frontend",
                prompt: "AI가 생성한 프론트엔드 확인 질문",
                answerType: "boolean",
                required: true,
                reason: "React가 감지되었습니다."
              },
              {
                id: "include_database",
                prompt: "AI가 생성한 데이터베이스 확인 질문",
                answerType: "boolean",
                required: true,
                reason: "Database가 감지되었습니다."
              }
            ]
          },
          {
            templateId: "eks-container-app",
            displayTitle: "EKS 컨테이너 앱",
            confidence: 0.64,
            reasons: ["Kubernetes 운영 대안입니다."],
            tradeoffs: ["클러스터 운영 복잡도가 높습니다."]
          }
        ]
      }
    }
  };
}

function createAnalysisWithChoiceQuestions(): SourceRepositoryAnalysisResult {
  const analysis = createAnalysis();

  return {
    ...analysis,
    repositoryUrl: "https://github.com/chaekang/Jungle_DB_API_W8",
    aiHandoff: {
      ...analysis.aiHandoff!,
      questions: [
        {
          id: "data-persistence",
          prompt: "Which data store should be included?",
          answerType: "single_select",
          options: [
            { label: "No persistent data", value: "none" },
            { label: "Relational database", value: "relational" }
          ],
          required: true,
          reason: "Persistence is not explicit in repository evidence."
        },
        {
          id: "application-scope",
          prompt: "Which application scope should be deployed?",
          answerType: "single_select",
          options: [
            { label: "API backend", value: "api" },
            { label: "Web frontend and API backend", value: "web_and_api" }
          ],
          required: true,
          reason: "The deployable scope requires confirmation."
        },
        {
          id: "operations-preference",
          prompt: "Which operating model do you prefer?",
          answerType: "single_select",
          options: [
            { label: "Managed service first", value: "managed" },
            { label: "EC2/VM direct operation", value: "ec2" }
          ],
          required: true,
          reason: "The initial operating model requires confirmation."
        }
      ],
      recommendation: {
        ...analysis.aiHandoff!.recommendation!,
        candidates: analysis.aiHandoff!.recommendation!.candidates.map((candidate) => ({
          ...candidate,
          questions: []
        }))
      }
    }
  };
}
