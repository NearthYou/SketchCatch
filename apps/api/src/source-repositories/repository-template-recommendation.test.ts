import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepositoryTemplateRecommendationInput } from "./repository-template-recommendation.js";
import {
  recommendRepositoryTemplates,
  recommendRepositoryTemplatesWithAi
} from "./repository-template-recommendation.js";

test("AI ranks only supported repository templates and generates template-specific questions", async () => {
  let capturedInput = "";
  const input = createInput();
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async (request) => {
          capturedInput = request.input;
          return {
            output_parsed: {
              candidates: [
                {
                  templateId: "eks-container-app",
                  confidence: 0.88,
                  reasons: ["Kubernetes 운영 확장성을 우선할 수 있습니다."],
                  tradeoffs: ["클러스터 운영 복잡도가 증가합니다."],
                  questions: [
                    {
                      id: "include_database",
                      prompt: "PostgreSQL 계층도 EKS 아키텍처에 포함할까요?",
                      reason: "저장소에서 PostgreSQL 사용 근거를 확인했습니다."
                    }
                  ]
                },
                {
                  templateId: "ecs-fargate-container-app",
                  confidence: 0.82,
                  reasons: ["Docker 기반 서비스를 가장 단순하게 운영할 수 있습니다."],
                  tradeoffs: ["Kubernetes 이식성은 제공하지 않습니다."],
                  questions: [
                    {
                      id: "include_frontend",
                      prompt: "React 프론트엔드를 같은 배포 흐름에 포함할까요?",
                      reason: "React 애플리케이션이 함께 감지되었습니다."
                    },
                    {
                      id: "include_database",
                      prompt: "PostgreSQL 계층을 관리형 데이터베이스로 포함할까요?",
                      reason: "데이터베이스 사용 근거가 있습니다."
                    }
                  ]
                }
              ]
            }
          };
        }
      }
    },
    model: "test-repository-ranker"
  });

  assert.match(capturedInput, /ecs-fargate-container-app/);
  assert.match(capturedInput, /allowedQuestionIds/);
  assert.deepEqual(
    recommendation.candidates.map((candidate) => candidate.templateId),
    ["eks-container-app", "ecs-fargate-container-app"]
  );
  assert.equal(recommendation.candidates[0]?.displayTitle, "EKS 컨테이너 앱");
  assert.deepEqual(
    recommendation.candidates[1]?.questions?.map((question) => question.id),
    ["include_frontend", "include_database"]
  );
  assert.equal(recommendation.candidates[1]?.questions?.[0]?.answerType, "boolean");
});

test("AI ranking falls back when it returns a template outside the supported candidate set", async () => {
  const input = createInput();
  const fallback = recommendRepositoryTemplates(input);
  assert.match(fallback.candidates[0]?.reasons[0] ?? "", /[가-힣]/);
  assert.match(fallback.candidates[0]?.tradeoffs[0] ?? "", /[가-힣]/);
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async () => ({
          output_parsed: {
            candidates: [
              {
                templateId: "static-web-hosting",
                confidence: 0.99,
                reasons: ["허용되지 않은 후보입니다."],
                tradeoffs: ["컨테이너 근거를 반영하지 못합니다."],
                questions: []
              }
            ]
          }
        })
      }
    }
  });

  assert.deepEqual(recommendation, fallback);
});

test("AI ranking falls back when the provider fails", async () => {
  const input = createInput();
  const fallback = recommendRepositoryTemplates(input);
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async () => {
          throw new Error("provider unavailable");
        }
      }
    }
  });

  assert.deepEqual(recommendation, fallback);
});

test("AI ranking falls back when user-facing explanations are not Korean", async () => {
  const input = createInput();
  const fallback = recommendRepositoryTemplates(input);
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async () => ({
          output_parsed: {
            candidates: fallback.candidates.map((candidate) => ({
              templateId: candidate.templateId,
              confidence: candidate.confidence,
              reasons: ["English reason"],
              tradeoffs: ["English tradeoff"],
              questions: (candidate.questions ?? []).map((question) => ({
                id: question.id,
                prompt: "English question",
                reason: "English reason"
              }))
            }))
          }
        })
      }
    }
  });

  assert.deepEqual(recommendation, fallback);
});

function createInput(): RepositoryTemplateRecommendationInput {
  return {
    snapshot: {
      revision: "commit-sha",
      treePaths: ["apps/web/package.json", "apps/api/package.json", "Dockerfile", "docker-compose.yml"],
      files: [
        {
          path: "apps/web/package.json",
          content: '{"dependencies":{"react":"latest"}}'
        },
        {
          path: "apps/api/package.json",
          content: '{"dependencies":{"@nestjs/core":"latest","typeorm":"latest"}}'
        },
        {
          path: "Dockerfile",
          content: "FROM node:24"
        },
        {
          path: "docker-compose.yml",
          content: "services:\n  db:\n    image: postgres:16"
        }
      ]
    },
    applicationUnits: [
      {
        id: "web",
        rootPath: "apps/web",
        kind: "frontend",
        frameworks: ["React"],
        evidencePaths: ["apps/web/package.json"]
      },
      {
        id: "api",
        rootPath: "apps/api",
        kind: "backend",
        frameworks: ["NestJS"],
        evidencePaths: ["apps/api/package.json", "Dockerfile"]
      }
    ],
    evidence: [],
    missingEvidence: [],
    deploymentType: "container",
    usesCiCd: true,
    answers: []
  };
}
