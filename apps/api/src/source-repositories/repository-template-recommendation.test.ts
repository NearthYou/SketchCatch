import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepositoryTemplateRecommendationInput } from "./repository-template-recommendation.js";
import {
  createRepositoryTemplateRecommendationProfile,
  isRepositoryTemplateAiRankingConfigured,
  recommendRepositoryTemplates,
  recommendRepositoryTemplatesWithAi
} from "./repository-template-recommendation.js";

test("Repository AI ranking is enabled by an OpenAI API key without a provider flag", () => {
  assert.equal(isRepositoryTemplateAiRankingConfigured({ OPENAI_API_KEY: "test-key" }), true);
  assert.equal(isRepositoryTemplateAiRankingConfigured({ OPENAI_API_KEY: "  " }), false);
  assert.equal(isRepositoryTemplateAiRankingConfigured({}), false);
});

test("every deployment type returns at most three ranked templates with non-duplicated relevant questions", () => {
  for (const deploymentType of ["ec2_vm", "container", "serverless"] as const) {
    const recommendation = recommendRepositoryTemplates({
      ...createInput(),
      deploymentType
    });

    assert.ok(recommendation.candidates.length > 0, deploymentType);
    assert.ok(recommendation.candidates.length <= 3, deploymentType);
    assert.equal(
      new Set(recommendation.candidates.map((candidate) => candidate.templateId)).size,
      recommendation.candidates.length,
      deploymentType
    );

    for (const candidate of recommendation.candidates) {
      const questions = candidate.questions ?? [];
      assert.ok(questions.length <= 5, candidate.templateId);
      assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
      assert.equal(new Set(questions.map((question) => question.prompt)).size, questions.length);
      assert.ok(questions.every((question) => question.required));
    }
  }
});

test("Repository Draft recommendations always use the required CI/CD path", () => {
  const { answers: _answers, deploymentType: _deploymentType, usesCiCd: _usesCiCd, ...selectionInput } = createInput();
  const profile = createRepositoryTemplateRecommendationProfile(selectionInput);

  assert.equal(profile.usesCiCdDefault, true);
  assert.equal(profile.recommendation?.usesCiCd, true);
});

test("deterministic recommendations provide detailed Korean explanations and questions", () => {
  const recommendation = recommendRepositoryTemplates(createInput());

  for (const candidate of recommendation.candidates) {
    assert.ok(candidate.reasons.length >= 2, `${candidate.templateId} 추천 이유`);
    assert.ok(candidate.tradeoffs.length >= 2, `${candidate.templateId} 고려할 점`);
    assert.ok(candidate.reasons.every(containsKorean), `${candidate.templateId} 추천 이유 한국어`);
    assert.ok(candidate.tradeoffs.every(containsKorean), `${candidate.templateId} 고려할 점 한국어`);

    for (const question of candidate.questions ?? []) {
      assert.equal(containsKorean(question.prompt), true, `${question.id} 질문`);
      assert.equal(containsKorean(question.reason), true, `${question.id} 질문 이유`);
      assert.equal(
        question.options?.every((option) => containsKorean(option.label)) ?? true,
        true,
        `${question.id} 선택지`
      );
    }
  }
});

test("container recommendations reflect repository topology instead of returning fixed ECS and EKS scores", () => {
  const singleService = recommendRepositoryTemplates(createSingleServiceContainerInput());
  const multiService = recommendRepositoryTemplates(createInput());

  assert.deepEqual(
    singleService.candidates.map((candidate) => candidate.templateId).slice(0, 2),
    ["ecs-fargate-container-app", "eks-container-app"]
  );
  assert.deepEqual(
    multiService.candidates.map((candidate) => candidate.templateId).slice(0, 3),
    ["ecs-fargate-container-app", "three-tier-web-app", "eks-container-app"]
  );
  assert.notDeepEqual(
    singleService.candidates.map((candidate) => candidate.confidence),
    multiService.candidates.map((candidate) => candidate.confidence)
  );
  assert.match(singleService.candidates[0]?.reasons.join(" ") ?? "", /single|단일|하나/iu);
  assert.match(multiService.candidates[0]?.reasons.join(" ") ?? "", /frontend|backend|database|프론트엔드|백엔드|데이터베이스/iu);
});

test("audience-live-check style repository ranks Fargate before 3-tier", () => {
  const recommendation = recommendRepositoryTemplates(createAudienceLiveCheckContainerInput());

  assert.equal(recommendation.candidates.length, 3);
  assert.equal(recommendation.candidates[0]?.templateId, "ecs-fargate-container-app");
  assert.notEqual(recommendation.candidates[0]?.templateId, "three-tier-web-app");
});

test("AI cannot rank 3-tier before Fargate for the audience-live-check repository", async () => {
  const recommendation = await recommendRepositoryTemplatesWithAi(
    createAudienceLiveCheckContainerInput(),
    {
      client: {
        responses: {
          parse: async () => ({
            output_parsed: {
              candidates: [
                {
                  templateId: "three-tier-web-app",
                  confidence: 0.94,
                  reasons: [
                    "React와 Express를 웹 계층과 애플리케이션 계층으로 나눌 수 있습니다.",
                    "일반적인 웹 애플리케이션 확장 구조를 적용할 수 있습니다."
                  ],
                  tradeoffs: [
                    "단일 컨테이너라는 저장소 배포 근거를 직접 반영하지 못합니다.",
                    "EC2 패치와 Auto Scaling Group 운영이 추가됩니다."
                  ],
                  questions: []
                },
                {
                  templateId: "ecs-fargate-container-app",
                  confidence: 0.88,
                  reasons: [
                    "단일 Dockerfile이 ECS Fargate Task 경계와 직접 맞습니다.",
                    "React와 Express를 하나의 컨테이너 서비스로 배포할 수 있습니다."
                  ],
                  tradeoffs: [
                    "ALB와 Fargate의 기본 비용을 확인해야 합니다.",
                    "Task 네트워크와 상태 확인 경로를 정해야 합니다."
                  ],
                  questions: []
                }
              ]
            }
          })
        }
      }
    }
  );

  assert.equal(recommendation.candidates[0]?.templateId, "ecs-fargate-container-app");
  assert.notEqual(recommendation.candidates[0]?.templateId, "three-tier-web-app");
});

test("AI ranks only supported repository templates and generates template-specific questions", async () => {
  let capturedInput = "";
  let capturedInstructions = "";
  const input = createInput();
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async (request) => {
          capturedInput = request.input;
          capturedInstructions = request.instructions;
          return {
            output_parsed: {
              candidates: [
                {
                  templateId: "eks-container-app",
                  confidence: 0.88,
                  reasons: [
                    "Kubernetes 운영 확장성을 우선할 수 있습니다.",
                    "저장소의 여러 Application Unit을 독립 워크로드로 나눌 수 있습니다."
                  ],
                  tradeoffs: [
                    "클러스터 운영 복잡도가 증가합니다.",
                    "EKS 제어 영역과 애드온의 고정 비용을 검토해야 합니다."
                  ],
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
                  reasons: [
                    "Docker 기반 서비스를 가장 단순하게 운영할 수 있습니다.",
                    "프론트엔드와 API를 Fargate Service 경계로 분리할 수 있습니다."
                  ],
                  tradeoffs: [
                    "Kubernetes 이식성은 제공하지 않습니다.",
                    "ALB와 Fargate의 기본 비용을 트래픽 규모와 비교해야 합니다."
                  ],
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
  assert.match(capturedInput, /brainboard-/);
  assert.match(capturedInput, /allowedQuestionIds/);
  assert.match(capturedInput, /repositoryProfile/);
  assert.doesNotMatch(capturedInput, /currentConfidence/);
  assert.match(capturedInstructions, /한국어/);
  assert.match(capturedInstructions, /2개 이상/);
  assert.match(capturedInstructions, /실제 저장소 근거/);
  assert.deepEqual(
    recommendation.candidates.map((candidate) => candidate.templateId).slice(0, 3),
    ["eks-container-app", "ecs-fargate-container-app", "three-tier-web-app"]
  );
  assert.equal(recommendation.rankingSource, "ai");
  assert.equal(recommendation.fallbackReason, undefined);
  assert.equal(recommendation.candidates[0]?.displayTitle, "EKS container app");
  assert.deepEqual(
    recommendation.candidates[1]?.questions?.map((question) => question.id),
    ["include_frontend", "include_database"]
  );
  assert.equal(recommendation.candidates[1]?.questions?.[0]?.answerType, "boolean");
});

test("AI ranking keeps a valid partial ranking and fills omitted candidates deterministically", async () => {
  const input = createInput();
  const fallback = recommendRepositoryTemplates(input);
  const [firstCandidate] = fallback.candidates;
  assert.ok(firstCandidate);

  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async () => ({
          output_parsed: {
            candidates: [
              {
                templateId: firstCandidate.templateId,
                confidence: 0.91,
                reasons: [
                  "AI가 Docker와 컨테이너 실행 근거를 다시 평가했습니다.",
                  "Application Unit 경계를 후보 템플릿의 런타임과 비교했습니다."
                ],
                tradeoffs: [
                  "대체 운영 방식과 이식성을 함께 검토해야 합니다.",
                  "상시 비용과 운영 복잡도를 배포 전에 확인해야 합니다."
                ],
                questions: (firstCandidate.questions ?? []).map((question) => ({
                  id: question.id,
                  prompt: question.prompt,
                  reason: question.reason
                }))
              }
            ]
          }
        })
      }
    }
  });

  assert.equal(recommendation.rankingSource, "ai");
  assert.equal(recommendation.fallbackReason, undefined);
  assert.equal(recommendation.candidates.length, fallback.candidates.length);
  assert.equal(recommendation.candidates[0]?.confidence, 0.91);
  assert.ok(recommendation.candidates.some(
    (candidate) => candidate.templateId === fallback.candidates[1]?.templateId
  ));
});

test("AI ranking falls back when it returns a template outside the supported candidate set", async () => {
  const input = createInput();
  const fallback = recommendRepositoryTemplates(input);
  assert.ok((fallback.candidates[0]?.reasons[0] ?? "").length > 0);
  assert.ok((fallback.candidates[0]?.tradeoffs[0] ?? "").length > 0);
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async () => ({
          output_parsed: {
            candidates: [
              {
                templateId: "brainboard-aws-instance-db-multiple-networks",
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

  assert.deepEqual(recommendation.candidates, fallback.candidates);
  assert.equal(recommendation.rankingSource, "deterministic");
  assert.equal(recommendation.fallbackReason, "provider_error");
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

  assert.deepEqual(recommendation.candidates, fallback.candidates);
  assert.equal(recommendation.rankingSource, "deterministic");
  assert.equal(recommendation.fallbackReason, "provider_error");
});

test("AI ranking keeps AI scores but replaces non-Korean explanations", async () => {
  const input = createInput();
  const fallback = recommendRepositoryTemplates(input);
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async () => ({
          output_parsed: {
            candidates: fallback.candidates.slice(0, 3).map((candidate) => ({
              templateId: candidate.templateId,
              confidence: Math.min(candidate.confidence + 0.01, 1),
              reasons: ["English reason", "Another English reason"],
              tradeoffs: ["English tradeoff", "Another English tradeoff"],
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

  assert.equal(recommendation.rankingSource, "ai");
  assert.equal(recommendation.fallbackReason, undefined);
  assert.equal(recommendation.candidates[0]?.confidence, fallback.candidates[0]!.confidence + 0.01);
  assert.deepEqual(recommendation.candidates[0]?.reasons, fallback.candidates[0]?.reasons);
  assert.deepEqual(recommendation.candidates[0]?.tradeoffs, fallback.candidates[0]?.tradeoffs);
});

test("AI ranking keeps valid AI explanations when its question set needs deterministic repair", async () => {
  const input = createInput();
  const fallback = recommendRepositoryTemplates(input);
  const recommendation = await recommendRepositoryTemplatesWithAi(input, {
    client: {
      responses: {
        parse: async () => ({
          output_parsed: {
            candidates: fallback.candidates.slice(0, 3).map((candidate) => ({
              templateId: candidate.templateId,
              confidence: candidate.confidence + 0.01,
              reasons: [
                "저장소의 컨테이너 근거를 AI가 다시 평가했습니다.",
                "Application Unit과 런타임 경계를 후보 템플릿에 대조했습니다."
              ],
              tradeoffs: [
                "운영 복잡도를 함께 검토해야 합니다.",
                "상시 비용과 확장 방식을 배포 전에 확인해야 합니다."
              ],
              questions: (candidate.questions ?? []).map((question) => ({
                id: question.id,
                prompt: question.id === "include_database"
                  ? "데이터베이스를 Kubernetes 클러스터 구성에 포함할까요?"
                  : "배포 색상은 무엇으로 할까요?",
                reason: "질문의 답변 방식이나 의미가 허용된 질문 ID와 맞지 않습니다."
              }))
            }))
          }
        })
      }
    }
  });

  assert.equal(recommendation.rankingSource, "ai");
  assert.equal(recommendation.fallbackReason, undefined);
  assert.deepEqual(
    recommendation.candidates.map((candidate) => candidate.questions),
    fallback.candidates.map((candidate) => candidate.questions)
  );
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
          content: '{"dependencies":{"@nestjs/core":"latest"}}'
        },
        {
          path: "Dockerfile",
          content: "FROM node:24"
        },
        {
          path: "docker-compose.yml",
          content: "services:\n  db:\n    image: pgvector/pgvector:pg16"
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

function createSingleServiceContainerInput(): RepositoryTemplateRecommendationInput {
  return {
    snapshot: {
      revision: "commit-sha",
      treePaths: ["src/server.c", "Dockerfile", "docker-compose.yml", "README.md"],
      files: [
        {
          path: "Dockerfile",
          content: "FROM alpine:3.20\nCOPY sql_processor /app/sql_processor"
        },
        {
          path: "docker-compose.yml",
          content: "services:\n  api:\n    build: .\n    volumes:\n      - db-data:/app/data"
        },
        {
          path: "README.md",
          content: "C99 single HTTP API container with CSV volume persistence for a small VM."
        }
      ]
    },
    applicationUnits: [
      {
        id: "api",
        rootPath: ".",
        kind: "backend",
        frameworks: [],
        evidencePaths: ["Dockerfile", "README.md"]
      }
    ],
    evidence: [],
    missingEvidence: [],
    deploymentType: "container",
    usesCiCd: false,
    answers: []
  };
}

function containsKorean(value: string): boolean {
  return /[\u3131-\u318e\uac00-\ud7a3]/u.test(value);
}

function createAudienceLiveCheckContainerInput(): RepositoryTemplateRecommendationInput {
  return {
    snapshot: {
      revision: "commit-sha",
      treePaths: [
        "apps/api/Dockerfile",
        "apps/api/package.json",
        "apps/web/package.json",
        "apps/web/vite.config.ts",
        "README.md"
      ],
      files: [
        {
          path: "apps/api/package.json",
          content: '{"scripts":{"start":"node dist/main.js"},"dependencies":{"express":"latest"}}'
        },
        {
          path: "apps/web/package.json",
          content: '{"scripts":{"build":"vite build"},"dependencies":{"react":"latest","vite":"latest"}}'
        },
        {
          path: "apps/api/Dockerfile",
          content: "FROM node:24\nEXPOSE 8080\nHEALTHCHECK CMD curl -f http://localhost:8080/health"
        },
        {
          path: "README.md",
          content: "apps/web은 S3와 CloudFront로 정적 배포합니다. apps/api는 Docker image를 ECR에 push한 뒤 ECS/Fargate Service로 실행합니다. 데이터베이스는 사용하지 않습니다."
        }
      ]
    },
    applicationUnits: [
      {
        id: "apps/api",
        rootPath: "apps/api",
        kind: "backend",
        frameworks: ["Express"],
        evidencePaths: ["apps/api/package.json", "apps/api/Dockerfile"]
      },
      {
        id: "apps/web",
        rootPath: "apps/web",
        kind: "frontend",
        frameworks: ["React", "Vite"],
        evidencePaths: ["apps/web/package.json", "apps/web/vite.config.ts"]
      }
    ],
    evidence: [],
    missingEvidence: [],
    deploymentType: "container",
    usesCiCd: true,
    answers: [
      {
        questionId: "data-persistence",
        value: "none"
      }
    ]
  };
}
