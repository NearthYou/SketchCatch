import { z } from "zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  BRAINBOARD_TEMPLATE_IDS,
  brainboardTemplateManifest,
  REPOSITORY_ANALYSIS_TEMPLATE_IDS,
  templateDefinitions,
  type RepositoryAnalysisAnswer,
  type RepositoryAnalysisQuestion,
  type RepositoryAnalysisTemplateId,
  type RepositoryDeploymentType,
  type RepositoryTemplateRecommendationCandidate,
  type RepositoryTemplateRecommendationResult
} from "@sketchcatch/types";
import type {
  GitHubRepositoryEvidenceFile,
  GitHubRepositoryEvidenceSnapshot
} from "./github-app-client.js";
import type {
  RepositoryTemplateSelectionInput
} from "./repository-template-selection.js";

export type RepositoryTemplateRecommendationInput = RepositoryTemplateSelectionInput & {
  readonly deploymentType: RepositoryDeploymentType;
  readonly usesCiCd: boolean;
  readonly answers: readonly RepositoryAnalysisAnswer[];
};

export type RepositoryTemplateRecommendationProfile = {
  readonly deploymentTypeDefault: RepositoryDeploymentType | null;
  readonly usesCiCdDefault: boolean | null;
  readonly questions: readonly RepositoryAnalysisQuestion[];
  readonly recommendation: RepositoryTemplateRecommendationResult | null;
};

type CandidateSetItem = {
  readonly templateId: RepositoryAnalysisTemplateId;
  readonly baseConfidence: number;
  readonly reasons: readonly string[];
  readonly tradeoffs: readonly string[];
};

type RepositoryTemplateRankingClient = {
  readonly responses: {
    readonly parse: (request: {
      readonly model: string;
      readonly instructions: string;
      readonly input: string;
      readonly text: {
        readonly format: ReturnType<typeof zodTextFormat>;
        readonly verbosity: "low" | "medium" | "high";
      };
      readonly reasoning: { readonly effort: "minimal" };
      readonly store: false;
    }) => Promise<{ readonly output_parsed: unknown }>;
  };
};

export type RepositoryTemplateAiRankingOptions = {
  readonly client?: RepositoryTemplateRankingClient | undefined;
  readonly model?: string | undefined;
};

const DEFAULT_REPOSITORY_TEMPLATE_RANKING_MODEL = "gpt-5-nano";
const REPOSITORY_TEMPLATE_RANKING_TIMEOUT_MS = 15_000;
const REPOSITORY_TEMPLATE_RANKING_MAX_RETRIES = 0;
const EVIDENCE_ANCHORED_MIN_CONFIDENCE = 0.85;
const EVIDENCE_ANCHORED_MIN_CONFIDENCE_GAP = 0.2;

const templateIdSchema = z.enum(REPOSITORY_ANALYSIS_TEMPLATE_IDS);
const aiCandidateSchema = z.object({
  templateId: templateIdSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().trim().min(1)).min(2).max(4),
  tradeoffs: z.array(z.string().trim().min(1)).min(2).max(4),
  questions: z.array(z.object({
    id: z.enum(["primary_runtime", "include_frontend", "include_database"]),
    prompt: z.string().trim().min(1),
    reason: z.string().trim().min(1)
  })).max(5)
});
const aiRecommendationSchema = z.object({
  candidates: z.array(aiCandidateSchema).min(1).max(3)
});

const templateById = new Map(templateDefinitions.map((definition) => [definition.id, definition]));
const brainboardTemplateById = new Map(brainboardTemplateManifest.map((entry) => [entry.id, entry]));
const templateDisplayTitles: Partial<Record<RepositoryAnalysisTemplateId, string>> = {
  "ecs-fargate-container-app": "ECS Fargate container app",
  "eks-container-app": "EKS container app",
  "full-serverless-web-app": "Full serverless web app",
  "minimal-serverless-api": "Minimal serverless API",
  "static-web-hosting": "Static web hosting",
  "three-tier-web-app": "Three-tier web app"
};

export function createRepositoryTemplateRecommendationProfile(
  input: RepositoryTemplateSelectionInput
): RepositoryTemplateRecommendationProfile {
  const deploymentTypeDefault = inferRepositoryDeploymentType(input);
  const usesCiCdDefault = true;
  const questions = createRepositoryAnalysisQuestions(input).slice(0, 5);
  const recommendation = deploymentTypeDefault
    ? recommendRepositoryTemplates({
        ...input,
        deploymentType: deploymentTypeDefault,
        usesCiCd: true,
        answers: []
      })
    : null;

  return {
    deploymentTypeDefault,
    usesCiCdDefault,
    questions,
    recommendation
  };
}

export function recommendRepositoryTemplates(
  input: RepositoryTemplateRecommendationInput
): RepositoryTemplateRecommendationResult {
  const deterministicCandidates = createSupportedCandidateSet(input);
  const rankedCandidates = rankSupportedCandidates(input, deterministicCandidates);

  return {
    deploymentType: input.deploymentType,
    usesCiCd: input.usesCiCd,
    candidates: rankedCandidates.slice(0, 3),
    rankingSource: "deterministic"
  };
}

export async function recommendRepositoryTemplatesWithAi(
  input: RepositoryTemplateRecommendationInput,
  options: RepositoryTemplateAiRankingOptions = {}
): Promise<RepositoryTemplateRecommendationResult> {
  const fallback = recommendRepositoryTemplates(input);
  const rankingCandidates = rankSupportedCandidates(input, createSupportedCandidateSet(input));
  const client = options.client ?? createConfiguredRepositoryTemplateRankingClient();

  if (!client) {
    return { ...fallback, fallbackReason: "not_configured" };
  }

  try {
    const response = await client.responses.parse({
      model: options.model
        ?? process.env.OPENAI_REPOSITORY_TEMPLATE_MODEL
        ?? DEFAULT_REPOSITORY_TEMPLATE_RANKING_MODEL,
      instructions: createRepositoryTemplateRankingInstructions(),
      input: createRepositoryTemplateRankingInput(input, rankingCandidates),
      text: {
        format: zodTextFormat(aiRecommendationSchema, "repository_template_recommendation"),
        verbosity: "low"
      },
      reasoning: { effort: "minimal" },
      store: false
    });
    const parsed = aiRecommendationSchema.parse(response.output_parsed);
    const hydrated = hydrateAiRecommendation(input, fallback, rankingCandidates, parsed);

    return hydrated
      ? { ...hydrated, rankingSource: "ai" }
      : { ...fallback, fallbackReason: "invalid_response" };
  } catch {
    return { ...fallback, fallbackReason: "provider_error" };
  }
}

function createConfiguredRepositoryTemplateRankingClient(): RepositoryTemplateRankingClient | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!isRepositoryTemplateAiRankingConfigured(process.env) || !apiKey) {
    return undefined;
  }

  const client = new OpenAI({
    apiKey,
    timeout: REPOSITORY_TEMPLATE_RANKING_TIMEOUT_MS,
    maxRetries: REPOSITORY_TEMPLATE_RANKING_MAX_RETRIES
  });

  return {
    responses: {
      parse: async (request) => {
        const response = await client.responses.parse({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          text: request.text,
          reasoning: request.reasoning,
          store: request.store
        });

        return { output_parsed: response.output_parsed };
      }
    }
  };
}

export function isRepositoryTemplateAiRankingConfigured(
  environment: Readonly<Record<string, string | undefined>>
): boolean {
  return Boolean(environment.OPENAI_API_KEY?.trim());
}

function createRepositoryTemplateRankingInstructions(): string {
  return [
    "당신은 Source Repository 증거를 근거로 Terraform 기반 infrastructure design 템플릿을 비교하는 아키텍트입니다.",
    "모든 사용자 표시 문구(reasons, tradeoffs, question prompt와 reason)는 자연스러운 한국어로 작성하세요.",
    "각 후보의 reasons와 tradeoffs는 각각 2개 이상 4개 이하로 작성하세요.",
    "추천 이유에는 감지된 Application Unit, framework, Dockerfile, 데이터 계층 또는 배포 파일처럼 실제 저장소 근거를 구체적으로 연결하세요.",
    "고려할 점에는 비용, 운영 복잡도, 확장 방식, 가용성, 이식성 중 해당 템플릿에서 실제 검토할 항목을 구체적으로 설명하세요. 막연한 표현만 사용하지 마세요.",
    "confidence는 저장소 증거가 해당 템플릿의 런타임과 리소스 경계에 얼마나 직접 맞는지 평가한 값이어야 합니다.",
    "질문은 candidates[].allowedQuestionIds 안에서만 만들고, 해당 템플릿의 Architecture Draft를 실제로 바꾸는 질문만 포함하세요.",
    "저장소에서 확인되지 않은 사실을 단정하지 말고 불확실한 내용은 고려할 점이나 질문으로 남기세요."
  ].join("\n");
}

function createRepositoryTemplateRankingInput(
  input: RepositoryTemplateRecommendationInput,
  candidates: readonly RepositoryTemplateRecommendationCandidate[]
): string {
  const evidence = input.snapshot.files
    .slice(0, 10)
    .map((file) => ({ path: file.path, content: file.content.slice(0, 600) }));

  return JSON.stringify({
    deploymentType: input.deploymentType,
    usesCiCd: input.usesCiCd,
    repositoryProfile: createRepositoryProfile(input),
    applicationUnits: input.applicationUnits.slice(0, 20).map((unit) => ({
      rootPath: unit.rootPath,
      kind: unit.kind,
      frameworks: unit.frameworks
    })),
    treePaths: input.snapshot.treePaths.slice(0, 100),
    evidence,
    answers: input.answers,
    candidates: candidates.map((candidate) => ({
      templateId: candidate.templateId,
      title: getRepositoryAnalysisTemplateTitle(candidate.templateId),
      description: templateById.get(candidate.templateId as Parameters<typeof templateById.get>[0])?.description,
      tags: templateById.get(candidate.templateId as Parameters<typeof templateById.get>[0])?.tags,
      allowedQuestionIds: (candidate.questions ?? []).map((question) => question.id)
    }))
  });
}

function hydrateAiRecommendation(
  input: RepositoryTemplateRecommendationInput,
  fallback: RepositoryTemplateRecommendationResult,
  rankingCandidates: readonly RepositoryTemplateRecommendationCandidate[],
  parsed: z.infer<typeof aiRecommendationSchema>
): RepositoryTemplateRecommendationResult | null {
  const rankingCandidateById = new Map(rankingCandidates.map((candidate) => [candidate.templateId, candidate]));
  const candidates: RepositoryTemplateRecommendationCandidate[] = [];
  const acceptedTemplateIds = new Set<RepositoryAnalysisTemplateId>();

  for (const candidate of parsed.candidates) {
    const fallbackCandidate = rankingCandidateById.get(candidate.templateId);

    if (!fallbackCandidate || acceptedTemplateIds.has(candidate.templateId)) {
      continue;
    }

    const canUseAiExplanations = [...candidate.reasons, ...candidate.tradeoffs]
      .every(containsKorean);

    const supportedQuestions = createTemplateSpecificQuestions(input, candidate.templateId);
    const supportedById = new Map(supportedQuestions.map((question) => [question.id, question]));
    const questionIds = candidate.questions.map((question) => question.id);
    const normalizedPrompts = candidate.questions.map((question) => normalizeQuestionPrompt(question.prompt));

    const canUseAiQuestions = questionIds.length === supportedQuestions.length
      && new Set(questionIds).size === questionIds.length
      && new Set(normalizedPrompts).size === normalizedPrompts.length
      && questionIds.every((questionId) => supportedById.has(questionId))
      && candidate.questions.every(
        (question) =>
          containsKorean(question.prompt)
          && containsKorean(question.reason)
          && isQuestionPromptAligned(question.id, question.prompt)
      );

    candidates.push({
      templateId: candidate.templateId,
      displayTitle: fallbackCandidate.displayTitle,
      confidence: candidate.confidence,
      reasons: canUseAiExplanations ? candidate.reasons : fallbackCandidate.reasons,
      tradeoffs: canUseAiExplanations ? candidate.tradeoffs : fallbackCandidate.tradeoffs,
      questions: canUseAiQuestions
        ? candidate.questions.map((question) => ({
            ...supportedById.get(question.id)!,
            prompt: question.prompt,
            reason: question.reason
          }))
        : supportedQuestions
    } satisfies RepositoryTemplateRecommendationCandidate);
    acceptedTemplateIds.add(candidate.templateId);
  }

  if (acceptedTemplateIds.size === 0) {
    return null;
  }

  const includedTemplateIds = new Set(candidates.map((candidate) => candidate.templateId));
  for (const fallbackCandidate of fallback.candidates) {
    if (!includedTemplateIds.has(fallbackCandidate.templateId)) {
      candidates.push(fallbackCandidate);
    }
  }

  const evidenceAnchoredPrimary = getEvidenceAnchoredPrimary(fallback);
  const highestCandidateConfidence = Math.max(...candidates.map((candidate) => candidate.confidence));
  const normalizedCandidates = evidenceAnchoredPrimary
    ? candidates.map((candidate) => candidate.templateId === evidenceAnchoredPrimary.templateId
      ? {
          ...candidate,
          confidence: Math.max(
            candidate.confidence,
            evidenceAnchoredPrimary.confidence,
            highestCandidateConfidence
          )
        }
      : candidate)
    : candidates;

  return {
    deploymentType: fallback.deploymentType,
    usesCiCd: fallback.usesCiCd,
    candidates: normalizedCandidates
      .sort((left, right) => {
        const leftIsAnchored = left.templateId === evidenceAnchoredPrimary?.templateId;
        const rightIsAnchored = right.templateId === evidenceAnchoredPrimary?.templateId;

        if (leftIsAnchored !== rightIsAnchored) return leftIsAnchored ? -1 : 1;
        return right.confidence - left.confidence;
      })
      .slice(0, 3)
  };
}

function getEvidenceAnchoredPrimary(
  fallback: RepositoryTemplateRecommendationResult
): RepositoryTemplateRecommendationCandidate | undefined {
  const [primary, runnerUp] = fallback.candidates;

  if (!primary || primary.confidence < EVIDENCE_ANCHORED_MIN_CONFIDENCE) return undefined;
  if (
    runnerUp
    && primary.confidence - runnerUp.confidence < EVIDENCE_ANCHORED_MIN_CONFIDENCE_GAP
  ) return undefined;

  return primary;
}

function containsKorean(value: string): boolean {
  return /[\u3131-\u318e\uac00-\ud7a3]/u.test(value);
}

function normalizeQuestionPrompt(value: string): string {
  return value.toLowerCase().replace(/[\s?.!,]/g, "");
}

function isQuestionPromptAligned(questionId: string, prompt: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();

  if (questionId === "primary_runtime") {
    return /api|runtime|런타임|node|python|노드|파이썬/.test(normalizedPrompt);
  }

  if (questionId === "include_frontend") {
    return /frontend|프론트엔드|react|web|웹/.test(normalizedPrompt)
      && !/database|데이터베이스|db|postgres|mysql|dynamo|rds/.test(normalizedPrompt);
  }

  if (questionId === "include_database") {
    return /database|데이터베이스|db|postgres|mysql|dynamo|rds|data|데이터/.test(normalizedPrompt)
      && !/cluster|클러스터|pod|node group|노드 그룹/.test(normalizedPrompt);
  }

  return false;
}

function inferRepositoryDeploymentType(
  input: RepositoryTemplateSelectionInput
): RepositoryDeploymentType | null {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));

  if (/\beks\b|kubernetes|helm|kustomization|dockerfile|\becs\b|\bfargate\b/.test(text)) {
    return "container";
  }

  if (/serverless\.(?:yml|yaml)|lambda|api gateway|apigateway|amplify|dynamodb/.test(text)) {
    return "serverless";
  }

  if (/\bvpc\b|\balb\b|application load balancer|\basg\b|auto scaling|ec2|rds/.test(text)) {
    return "ec2_vm";
  }

  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  );
  const hasBackend = input.applicationUnits.some(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  );

  if (hasFrontend && !hasBackend) {
    return "serverless";
  }

  return null;
}

function createRepositoryAnalysisQuestions(
  input: RepositoryTemplateSelectionInput
): RepositoryAnalysisQuestion[] {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));
  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  );
  const hasBackend = input.applicationUnits.some(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  );
  const questions: RepositoryAnalysisQuestion[] = [];

  if (!/rds|dynamodb|postgres|mysql|prisma|typeorm|sequelize/.test(text)) {
    questions.push({
      id: "data-persistence",
      prompt: "이 애플리케이션에 영구 데이터 저장소가 필요한가요?",
      answerType: "single_select",
      options: [
        { value: "none", label: "영구 데이터 없음" },
        { value: "relational", label: "관계형 데이터베이스" },
        { value: "key_value", label: "키-값 또는 문서형 저장소" }
      ],
      required: true,
      reason: "저장소 근거만으로 데이터 영속성 계층을 확정할 수 없습니다."
    });
  }

  if (!hasFrontend || !hasBackend) {
    questions.push({
      id: "application-scope",
      prompt: "아키텍처에 먼저 포함할 애플리케이션 범위를 선택해주세요.",
      answerType: "single_select",
      options: [
        { value: "web", label: "공개 웹 프론트엔드" },
        { value: "api", label: "API 백엔드" },
        { value: "web_and_api", label: "웹 프론트엔드와 API 백엔드" }
      ],
      required: true,
      reason: "Repository Analysis만으로 모든 배포 대상 Application Unit의 경계를 확정할 수 없습니다."
    });
  }

  if (!/cognito|auth|oauth|login|session/.test(text)) {
    questions.push({
      id: "authentication",
      prompt: "초기 아키텍처에 관리형 사용자 인증을 포함할까요?",
      answerType: "boolean",
      required: true,
      reason: "저장소에서 사용자 인증 요구사항을 확인할 근거가 부족합니다."
    });
  }

  if (!/kubernetes|eks|ecs|fargate/.test(text)) {
    questions.push({
      id: "operations-preference",
      prompt: "첫 배포에서 선호하는 운영 방식을 선택해주세요.",
      answerType: "single_select",
      options: [
        { value: "managed", label: "관리형 서비스 우선" },
        { value: "container", label: "컨테이너 런타임" },
        { value: "self_managed_vm", label: "EC2/VM 직접 운영" }
      ],
      required: false,
      reason: "저장소 근거만으로 팀이 선호하는 운영 모델을 판단할 수 없습니다."
    });
  }

  return questions;
}

function createSupportedCandidateSet(
  input: RepositoryTemplateRecommendationInput
): readonly CandidateSetItem[] {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));
  const repositoryProfile = createRepositoryProfile(input);
  const answers = createAnswerMap(input.answers);
  const applicationScope = answers.get("application-scope");
  const dataPersistence = answers.get("data-persistence");
  const authentication = answers.get("authentication");
  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  ) || applicationScope === "web" || applicationScope === "web_and_api";
  const hasBackend = input.applicationUnits.some(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  ) || applicationScope === "api" || applicationScope === "web_and_api";
  const hasRelationalData = repositoryProfile.hasRelationalDatabase || dataPersistence === "relational";
  const wantsAuth = authentication === true || /cognito|auth|oauth|login|session/.test(text);
  const wantsEks = /\beks\b|kubernetes|helm|kustomization/.test(text);

  if (input.deploymentType === "ec2_vm") {
    return [
      candidate("three-tier-web-app", 0.82, [
        "EC2/VM 실행 근거가 ALB, 애플리케이션 컴퓨팅, 데이터 계층을 분리하는 3계층 구성과 직접 맞습니다."
      ], [
        "Fargate나 서버리스 방식보다 운영체제 패치와 인스턴스 용량 관리 부담이 큽니다."
      ]),
      candidate(hasFrontend && hasBackend ? "ecs-fargate-container-app" : "minimal-serverless-api", 0.6, [
        "VM 직접 운영을 줄이려면 저장소의 실행 단위를 관리형 런타임으로 옮기는 대안도 검토할 수 있습니다."
      ], [
        "저장소가 전제로 둔 EC2/VM 배포 방식과 달라져 빌드와 운영 절차를 조정해야 합니다."
      ])
    ];
  }

  if (input.deploymentType === "container") {
    if (wantsEks) {
      return [
        candidate("eks-container-app", 0.9, [
          "Kubernetes 또는 EKS 구성 파일이 클러스터 기반 컨테이너 아키텍처와 직접 맞습니다."
        ], [
          "EKS 클러스터, 노드, 애드온과 Kubernetes 오브젝트를 함께 운영해야 합니다."
        ]),
        candidate("ecs-fargate-container-app", 0.78, [
          "컨테이너 워크로드를 ECS Fargate로 옮기면 클러스터 운영 없이 실행할 수 있습니다."
        ], [
          "기존 Kubernetes manifest를 ECS Task Definition과 Service 설정으로 변환해야 합니다."
        ])
      ];
    }

    if (hasFrontend && hasBackend && hasRelationalData) {
      return [
        candidate("ecs-fargate-container-app", 0.86, [
          "프론트엔드, 백엔드, 데이터베이스 근거를 ECS Fargate 서비스 중심의 분리된 계층으로 구성할 수 있습니다."
        ], [
          "서비스별 Task 경계와 데이터베이스 접근 경로를 추가 질문으로 확정해야 합니다."
        ]),
        candidate("three-tier-web-app", 0.79, [
          "웹, 애플리케이션, 데이터 계층이 분리된 저장소 구조를 전통적인 3계층 배치로 표현할 수 있습니다."
        ], [
          "컨테이너 실행 모델을 EC2 Auto Scaling 기반 호스트 운영으로 바꾸게 됩니다."
        ]),
        candidate("eks-container-app", 0.62, [
          "여러 컨테이너를 독립 워크로드로 분리해야 한다면 Kubernetes가 확장 대안이 될 수 있습니다."
        ], [
          "Kubernetes 근거가 없어 현재 저장소 규모에는 EKS 운영 복잡도가 과할 수 있습니다."
        ])
      ];
    }

    if (repositoryProfile.applicationUnitCount <= 1) {
      return [
        candidate("ecs-fargate-container-app", 0.9, [
          "단일 컨테이너 서비스는 VM 기반 3계층보다 ECS Fargate의 Task와 Service 구조에 더 직접 맞습니다."
        ], [
          "트래픽이 매우 적으면 ALB와 Fargate의 기본 비용이 소형 단일 VM보다 높을 수 있습니다."
        ]),
        candidate("eks-container-app", 0.54, [
          "향후 여러 워크로드와 복잡한 오케스트레이션이 필요해지면 Kubernetes로 확장할 수 있습니다."
        ], [
          "현재 단일 서비스에는 EKS 클러스터 운영과 고정 비용이 과도할 가능성이 큽니다."
        ])
      ];
    }

    return [
      candidate("ecs-fargate-container-app", 0.88, [
        "Docker와 컨테이너 실행 근거가 관리형 ECS Fargate Service 구성과 맞습니다."
      ], [
        "서비스별 Task Definition, 네트워크, 상태 확인 경로를 구체화해야 합니다."
      ]),
      candidate("eks-container-app", 0.64, [
        "여러 컨테이너를 Kubernetes Deployment와 Service 단위로 분리할 수 있습니다."
      ], [
        "Kubernetes 근거가 없다면 EKS가 불필요한 클러스터 운영 복잡도를 추가합니다."
      ])
    ];
  }

  if (hasFrontend && hasBackend && wantsAuth) {
    return [
      candidate("full-serverless-web-app", 0.86, [
        "웹, API, 사용자 인증 요구를 하나의 서버리스 웹 애플리케이션 흐름으로 연결할 수 있습니다."
      ], [
        "관계형 데이터 요구가 있으면 기본 서버리스 데이터 저장소를 RDS 계열로 조정해야 합니다."
      ]),
      candidate("minimal-serverless-api", 0.7, [
        "API Application Unit만 우선 배포한다면 더 작은 서버리스 API 구성으로 시작할 수 있습니다."
      ], [
        "프론트엔드 호스팅과 사용자 인증 리소스는 기본 범위에 포함되지 않습니다."
      ])
    ];
  }

  if (hasBackend && (hasRelationalData || dataPersistence === "key_value")) {
    return [
      candidate("minimal-serverless-api", 0.8, [
        "API와 데이터 저장 요구를 작은 서버리스 API 진입점에서 시작할 수 있습니다."
      ], [
        "관계형 영속성이 필요하면 기본 데이터 저장소와 Lambda 연결 방식을 조정해야 합니다."
      ]),
      candidate("full-serverless-web-app", 0.66, [
        "웹 프론트엔드가 추가될 가능성이 있다면 서버리스 웹 전체 흐름으로 확장할 수 있습니다."
      ], [
        "API 전용 서비스에는 불필요한 프론트엔드와 인증 리소스가 포함될 수 있습니다."
      ])
    ];
  }

  if (hasFrontend && !hasBackend) {
    return [
      candidate("static-web-hosting", 0.83, [
        "프론트엔드 전용 저장소 근거가 S3 정적 호스팅과 CloudFront 배포 흐름에 맞습니다."
      ], [
        "동적 API나 서버 렌더링이 필요하면 별도의 백엔드 런타임을 추가해야 합니다."
      ]),
      candidate("full-serverless-web-app", 0.62, [
        "향후 API가 추가되면 현재 프론트엔드를 서버리스 웹 애플리케이션으로 확장할 수 있습니다."
      ], [
        "정적 호스팅만 필요한 현재 범위에는 API와 인증 리소스가 과할 수 있습니다."
      ])
    ];
  }

  return [
    candidate("minimal-serverless-api", 0.72, [
      "제한된 저장소 근거에서 관리형 API 런타임을 가장 작은 범위로 시작할 수 있습니다."
    ], [
      "배포 전에 API 경계, 데이터 저장 방식, 트래픽 조건을 추가로 확인해야 합니다."
    ]),
    candidate("static-web-hosting", 0.6, [
      "저장소가 프론트엔드 전용이라면 정적 호스팅만으로 배포 요구를 충족할 수 있습니다."
    ], [
      "백엔드 컴퓨팅과 데이터 계층은 포함되지 않아 동적 기능을 처리할 수 없습니다."
    ])
  ];
}

function rankSupportedCandidates(
  input: RepositoryTemplateRecommendationInput,
  deterministicCandidates: readonly CandidateSetItem[]
): readonly RepositoryTemplateRecommendationCandidate[] {
  const candidatePool = includeEveryRepositoryAnalysisTemplate(deterministicCandidates);

  return candidatePool
    .map((candidate, index) => {
      return {
        templateId: candidate.templateId,
        displayTitle: getRepositoryAnalysisTemplateTitle(candidate.templateId),
        confidence: adjustConfidence(candidate.baseConfidence, input, index),
        reasons: ensureDetailedCandidateText(
          candidate.reasons,
          createRepositoryEvidenceDetail(input, candidate.templateId)
        ),
        tradeoffs: ensureDetailedCandidateText(
          candidate.tradeoffs,
          createTemplateTradeoffDetail(candidate.templateId)
        ),
        questions: createTemplateSpecificQuestions(input, candidate.templateId)
      } satisfies RepositoryTemplateRecommendationCandidate;
    })
    .sort((left, right) => right.confidence - left.confidence);
}

function createTemplateSpecificQuestions(
  input: RepositoryTemplateRecommendationInput,
  templateId: RepositoryAnalysisTemplateId
): readonly RepositoryAnalysisQuestion[] {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));
  const hasFrontend = input.applicationUnits.some(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  ) || /react|next\.js|vite/.test(text);
  const hasDatabase = /rds|dynamodb|postgres|mysql|prisma|typeorm|sequelize|pgvector/.test(text);
  const hasNodeApi = /nestjs|@nestjs|express|fastify|node api/.test(text);
  const hasPythonApi = /fastapi|uvicorn|django|flask|python api/.test(text);
  const questions: RepositoryAnalysisQuestion[] = [];

  if (
    hasNodeApi
    && hasPythonApi
    && ["three-tier-web-app", "full-serverless-web-app", "minimal-serverless-api"].includes(templateId)
  ) {
    questions.push({
      id: "primary_runtime",
      prompt: "아키텍처에서 우선할 API 런타임을 선택해주세요.",
      answerType: "single_select",
      options: [
        { value: "node", label: "Node API 우선" },
        { value: "python", label: "Python API 우선" },
        { value: "both", label: "두 API 모두 포함" }
      ],
      required: true,
      reason: "저장소에서 Node와 Python API 실행 근거가 모두 감지되었습니다."
    });
  }

  if (hasFrontend && ["ecs-fargate-container-app", "three-tier-web-app"].includes(templateId)) {
    questions.push({
      id: "include_frontend",
      prompt: "감지된 React 웹 프론트엔드를 이 아키텍처에 포함할까요?",
      answerType: "boolean",
      required: true,
      reason: "선택한 템플릿은 프론트엔드 전달 리소스를 함께 구성할 수 있습니다."
    });
  }

  if (hasDatabase && templateId !== "static-web-hosting") {
    questions.push({
      id: "include_database",
      prompt: "감지된 데이터베이스 계층을 이 아키텍처에 포함할까요?",
      answerType: "boolean",
      required: true,
      reason: "저장소에서 데이터베이스 사용 근거가 감지되었습니다."
    });
  }

  return questions.slice(0, 5);
}

function includeEveryRepositoryAnalysisTemplate(
  rankedCandidates: readonly CandidateSetItem[]
): readonly CandidateSetItem[] {
  const includedTemplateIds = new Set(rankedCandidates.map((candidate) => candidate.templateId));
  const supplementalCandidates = REPOSITORY_ANALYSIS_TEMPLATE_IDS
    .filter((templateId) => !includedTemplateIds.has(templateId))
    .map((templateId, index) =>
      candidate(templateId, getSupplementalTemplateConfidence(templateId, index), [
        "사용 가능한 템플릿의 리소스 구성을 저장소 Application Unit과 비교 후보로 검토했습니다."
      ], [
        "상위 추천보다 이 템플릿을 직접 뒷받침하는 저장소 근거가 적습니다."
      ])
    );

  return [...rankedCandidates, ...supplementalCandidates];
}

function getSupplementalTemplateConfidence(
  templateId: RepositoryAnalysisTemplateId,
  index: number
): number {
  const baseConfidence = (BRAINBOARD_TEMPLATE_IDS as readonly string[]).includes(templateId)
    ? 0.42
    : 0.5;

  return Math.max(0.18, roundConfidence(baseConfidence - index * 0.003));
}

function getRepositoryAnalysisTemplateTitle(templateId: RepositoryAnalysisTemplateId): string {
  return templateDisplayTitles[templateId]
    ?? templateById.get(templateId as Parameters<typeof templateById.get>[0])?.title
    ?? brainboardTemplateById.get(templateId as Parameters<typeof brainboardTemplateById.get>[0])?.title
    ?? templateId;
}

function createRepositoryEvidenceDetail(
  input: RepositoryTemplateRecommendationInput,
  templateId: RepositoryAnalysisTemplateId
): string {
  const profile = createRepositoryProfile(input);
  const frameworkSummary = profile.frameworks.length > 0
    ? profile.frameworks.join(", ")
    : "명시된 framework 없음";

  return `감지된 ${profile.applicationUnitCount}개 Application Unit과 ${frameworkSummary} 근거를 ${getRepositoryAnalysisTemplateTitle(templateId)}의 리소스 경계와 비교했습니다.`;
}

function createTemplateTradeoffDetail(templateId: RepositoryAnalysisTemplateId): string {
  const details: Partial<Record<RepositoryAnalysisTemplateId, string>> = {
    "ecs-fargate-container-app": "ALB, Fargate Task, VPC 네트워크의 기본 비용과 상태 확인 설정을 실제 트래픽 규모에 맞춰 검증해야 합니다.",
    "eks-container-app": "클러스터와 애드온의 고정 비용, Kubernetes 운영 역량, 업그레이드 책임을 배포 승인 전에 확인해야 합니다.",
    "full-serverless-web-app": "Lambda 콜드 스타트, 실행 시간 제한, 분산 로그 추적이 요청 지연과 운영 방식에 미치는 영향을 확인해야 합니다.",
    "minimal-serverless-api": "지속 부하나 장시간 작업에서는 Lambda 실행 제약과 요청당 비용이 컨테이너보다 불리할 수 있습니다.",
    "static-web-hosting": "CloudFront 캐시 무효화와 정적 빌드 산출물 배포 절차를 CI/CD 연결에 맞춰 정의해야 합니다.",
    "three-tier-web-app": "ALB, Auto Scaling Group, RDS를 함께 운영하므로 리소스 수와 상시 비용이 관리형 단일 런타임보다 커질 수 있습니다."
  };

  return details[templateId]
    ?? "템플릿의 기본 리소스 수, 네트워크 노출 범위, 상시 비용을 실제 요구사항과 대조한 뒤 선택해야 합니다.";
}

function ensureDetailedCandidateText(
  values: readonly string[],
  detail: string
): readonly string[] {
  return [...new Set([...values, detail])].slice(0, 4);
}

function adjustConfidence(
  baseConfidence: number,
  input: RepositoryTemplateRecommendationInput,
  index: number
): number {
  const ciCdBonus = input.usesCiCd ? 0.03 : 0;
  const answerBonus = input.answers.length > 0 ? 0.04 : 0;
  const orderPenalty = index * 0.04;

  return Math.max(0, Math.min(0.98, roundConfidence(baseConfidence + ciCdBonus + answerBonus - orderPenalty)));
}

function candidate(
  templateId: RepositoryAnalysisTemplateId,
  baseConfidence: number,
  reasons: readonly string[],
  tradeoffs: readonly string[]
): CandidateSetItem {
  return {
    templateId,
    baseConfidence,
    reasons,
    tradeoffs
  };
}

function createAnswerMap(answers: readonly RepositoryAnalysisAnswer[]): Map<string, string | boolean> {
  return new Map(answers.map((answer) => [answer.questionId, answer.value]));
}

function createSearchableText(
  snapshot: Pick<GitHubRepositoryEvidenceSnapshot, "treePaths" | "files">,
  extraPaths: readonly string[] = []
): string {
  return [
    ...snapshot.treePaths,
    ...extraPaths,
    ...snapshot.files.map((file: GitHubRepositoryEvidenceFile) => `${file.path}\n${file.content}`)
  ]
    .join("\n")
    .toLowerCase();
}

function createRepositoryProfile(input: RepositoryTemplateRecommendationInput) {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));
  const frontendUnitCount = input.applicationUnits.filter(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  ).length;
  const backendUnitCount = input.applicationUnits.filter(
    (unit) => unit.kind === "backend" || unit.kind === "fullstack"
  ).length;

  return {
    applicationUnitCount: input.applicationUnits.length,
    frontendUnitCount,
    backendUnitCount,
    frameworks: [...new Set(input.applicationUnits.flatMap((unit) => unit.frameworks))].sort(),
    hasRelationalDatabase: /rds|postgres|mysql|prisma|typeorm|sequelize|pgvector/.test(text),
    hasLocalPersistence: /csv|sqlite|docker volume|volume persistence|\/data\b/.test(text),
    hasKubernetesEvidence: /\beks\b|kubernetes|helm|kustomization/.test(text),
    hasExplicitVmTarget: /\b(?:ec2|vm|vps)\b|virtual machine/.test(text)
  };
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
