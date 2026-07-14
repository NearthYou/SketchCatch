import { z } from "zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  REPOSITORY_TEMPLATE_IDS,
  templateDefinitions,
  type RepositoryAnalysisAnswer,
  type RepositoryAnalysisQuestion,
  type RepositoryDeploymentType,
  type RepositoryTemplateId,
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
  readonly templateId: RepositoryTemplateId;
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

const templateIdSchema = z.enum(REPOSITORY_TEMPLATE_IDS);
const aiCandidateSchema = z.object({
  templateId: templateIdSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().trim().min(1)).min(1).max(4),
  tradeoffs: z.array(z.string().trim().min(1)).min(1).max(4),
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
const templateDisplayTitles: Readonly<Record<RepositoryTemplateId, string>> = {
  "ecs-fargate-container-app": "ECS Fargate 컨테이너 앱",
  "eks-container-app": "EKS 컨테이너 앱",
  "full-serverless-web-app": "전체 서버리스 웹 앱",
  "minimal-serverless-api": "최소 서버리스 API",
  "static-web-hosting": "정적 웹사이트",
  "three-tier-web-app": "3계층 웹 서비스"
};

export function createRepositoryTemplateRecommendationProfile(
  input: RepositoryTemplateSelectionInput
): RepositoryTemplateRecommendationProfile {
  const deploymentTypeDefault = inferRepositoryDeploymentType(input);
  const usesCiCdDefault = inferRepositoryCiCdUsage(input);
  const questions = createRepositoryAnalysisQuestions(input).slice(0, 5);
  const recommendation = deploymentTypeDefault
    ? recommendRepositoryTemplates({
        ...input,
        deploymentType: deploymentTypeDefault,
        usesCiCd: usesCiCdDefault ?? false,
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
    candidates: rankedCandidates,
    rankingSource: "deterministic"
  };
}

export async function recommendRepositoryTemplatesWithAi(
  input: RepositoryTemplateRecommendationInput,
  options: RepositoryTemplateAiRankingOptions = {}
): Promise<RepositoryTemplateRecommendationResult> {
  const fallback = recommendRepositoryTemplates(input);
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
      input: createRepositoryTemplateRankingInput(input, fallback.candidates),
      text: {
        format: zodTextFormat(aiRecommendationSchema, "repository_template_recommendation"),
        verbosity: "low"
      },
      reasoning: { effort: "minimal" },
      store: false
    });
    const parsed = aiRecommendationSchema.parse(response.output_parsed);
    const hydrated = hydrateAiRecommendation(input, fallback, parsed);

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
    "당신은 소스 저장소 근거를 바탕으로 IaC Practice Architecture 템플릿을 추천합니다.",
    "입력에 제공된 후보만 사용하고 모든 후보를 정확히 한 번씩 반환하세요.",
    "confidence는 저장소의 애플리케이션 단위, 데이터 계층, 프레임워크, 운영 근거를 비교해 독립적으로 산정하세요.",
    "서로 다른 저장소에 정형화된 고정 점수를 반복하지 말고 근거 강도에 맞춰 후보 간 차이를 표현하세요.",
    "추천 이유와 고려할 점은 저장소에서 확인된 구체적인 구성에 맞는 한국어로 작성하세요.",
    "각 후보의 allowedQuestionIds를 빠짐없이 정확히 한 번씩 사용해 한국어 질문을 작성하세요.",
    "근거에 없는 클라우드 구성이나 요구사항을 단정하지 마세요."
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
      title: templateById.get(candidate.templateId)?.title,
      description: templateById.get(candidate.templateId)?.description,
      tags: templateById.get(candidate.templateId)?.tags,
      allowedQuestionIds: (candidate.questions ?? []).map((question) => question.id)
    }))
  });
}

function hydrateAiRecommendation(
  input: RepositoryTemplateRecommendationInput,
  fallback: RepositoryTemplateRecommendationResult,
  parsed: z.infer<typeof aiRecommendationSchema>
): RepositoryTemplateRecommendationResult | null {
  const fallbackById = new Map(fallback.candidates.map((candidate) => [candidate.templateId, candidate]));
  const candidates: RepositoryTemplateRecommendationCandidate[] = [];
  const acceptedTemplateIds = new Set<RepositoryTemplateId>();

  for (const candidate of parsed.candidates) {
    const fallbackCandidate = fallbackById.get(candidate.templateId);

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

  return {
    deploymentType: fallback.deploymentType,
    usesCiCd: fallback.usesCiCd,
    candidates: candidates.sort((left, right) => right.confidence - left.confidence)
  };
}

function containsKorean(value: string): boolean {
  return /[가-힣]/.test(value);
}

function normalizeQuestionPrompt(value: string): string {
  return value.toLowerCase().replace(/[\s?.!,]/g, "");
}

function isQuestionPromptAligned(questionId: string, prompt: string): boolean {
  if (questionId === "primary_runtime") {
    return /api|런타임|node|python/i.test(prompt)
      && /어떤|무엇|선택|중심|포함/i.test(prompt);
  }

  if (questionId === "include_frontend") {
    return /프론트|react|웹/i.test(prompt)
      && /포함|사용|추가|배치/i.test(prompt)
      && /아키텍처|템플릿|구성/i.test(prompt)
      && !/데이터베이스|database|db/i.test(prompt);
  }

  if (questionId === "include_database") {
    return /데이터|database|db|저장소|postgres|mysql|dynamo|rds/i.test(prompt)
      && /포함|사용|추가|배치/i.test(prompt)
      && /아키텍처|템플릿|구성/i.test(prompt)
      && !/클러스터|pod|파드|컨테이너 내부|컨테이너에/i.test(prompt);
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

function inferRepositoryCiCdUsage(input: RepositoryTemplateSelectionInput): boolean | null {
  const text = createSearchableText(input.snapshot, input.evidence.map((item) => item.path));

  if (/\.github\/workflows|github actions|gitlab-ci|circleci|buildspec\.ya?ml|jenkinsfile/.test(text)) {
    return true;
  }

  if (/\bdeploy\b|\bpipeline\b|\bci\/cd\b|\bcicd\b/.test(text)) {
    return true;
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
        { value: "key_value", label: "키-값 또는 문서형 데이터" }
      ],
      required: true,
      reason: "저장소 근거에서 데이터 계층을 명확히 확인하지 못했습니다."
    });
  }

  if (!hasFrontend || !hasBackend) {
    questions.push({
      id: "application-scope",
      prompt: "템플릿에서 어떤 실행 영역을 우선 준비할까요?",
      answerType: "single_select",
      options: [
        { value: "web", label: "공개 웹 프론트엔드" },
        { value: "api", label: "API 백엔드" },
        { value: "web_and_api", label: "웹 프론트엔드와 API 백엔드" }
      ],
      required: true,
      reason: "저장소 분석만으로 모든 애플리케이션 영역을 확인하지 못했습니다."
    });
  }

  if (!/cognito|auth|oauth|login|session/.test(text)) {
    questions.push({
      id: "authentication",
      prompt: "초기 아키텍처에 관리형 사용자 인증을 포함할까요?",
      answerType: "boolean",
      required: true,
      reason: "저장소 근거에서 인증 요구사항을 명확히 확인하지 못했습니다."
    });
  }

  if (!/kubernetes|eks|ecs|fargate/.test(text)) {
    questions.push({
      id: "operations-preference",
      prompt: "첫 배포에서 선호하는 운영 방식은 무엇인가요?",
      answerType: "single_select",
      options: [
        { value: "managed", label: "관리형 서비스 우선" },
        { value: "container", label: "컨테이너 런타임" },
        { value: "self_managed_vm", label: "EC2/VM 직접 운영" }
      ],
      required: false,
      reason: "저장소에서 배포 운영 방식에 대한 선호를 확인하지 못했습니다."
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
  const hasRelationalData = repositoryProfile.hasRelationalDatabase ||
    dataPersistence === "relational";
  const wantsAuth = authentication === true || /cognito|auth|oauth|login|session/.test(text);
  const wantsEks = /\beks\b|kubernetes|helm|kustomization/.test(text);

  if (input.deploymentType === "ec2_vm") {
    const alternative = hasFrontend && hasBackend
      ? candidate("ecs-fargate-container-app", 0.6, [
          "동일한 웹과 API 구조를 컨테이너 운영 방식으로 전환할 때 비교할 수 있는 대안입니다."
        ], [
          "현재 EC2/VM 배포 근거를 직접 반영하려면 이미지 빌드와 컨테이너 배포 흐름을 추가해야 합니다."
        ])
      : candidate("minimal-serverless-api", 0.58, [
          "백엔드 API를 관리형 실행 환경으로 단순화할 때 비교할 수 있는 대안입니다."
        ], [
          "현재 EC2/VM 운영 방식과 달라 런타임과 데이터 계층을 서버리스 구조에 맞게 조정해야 합니다."
        ]);

    return [
      candidate("three-tier-web-app", 0.82, [
        "EC2/VM 배포 방식이 ALB, Auto Scaling, RDS로 구성된 지원 템플릿과 잘 맞습니다."
      ], [
        "서버리스나 Fargate 템플릿보다 직접 운영해야 하는 인프라가 많습니다."
      ]),
      alternative
    ];
  }

  if (input.deploymentType === "container") {
    if (wantsEks) {
      return [
        candidate("eks-container-app", 0.9, [
          "저장소에서 Kubernetes 또는 EKS 운영 근거가 확인되어 관리형 클러스터 템플릿과 직접 맞습니다."
        ], [
          "EKS는 클러스터 운영과 Kubernetes 오브젝트 관리가 추가로 필요합니다."
        ]),
        candidate("ecs-fargate-container-app", 0.78, [
          "컨테이너 워크로드를 클러스터 운영 부담이 적은 ECS Fargate로 단순화할 수 있습니다."
        ], [
          "기존 Kubernetes 오브젝트와 운영 도구를 그대로 사용할 수 없습니다."
        ])
      ];
    }

    if (hasFrontend && hasBackend && hasRelationalData) {
      return [
        candidate("ecs-fargate-container-app", 0.86, [
          "감지된 프론트엔드와 백엔드 컨테이너를 ECS Fargate 서비스로 운영하고 데이터베이스 계층을 분리할 수 있습니다."
        ], [
          "현재 템플릿은 여러 애플리케이션 서비스와 관계형 데이터베이스 구성을 추가로 조정해야 합니다."
        ]),
        candidate("three-tier-web-app", 0.79, [
          "프론트엔드, 백엔드, 관계형 데이터베이스가 분리된 저장소 구조를 웹, 애플리케이션, RDS 계층으로 대응할 수 있습니다."
        ], [
          "애플리케이션 실행 계층이 컨테이너가 아닌 EC2 Auto Scaling 기반이므로 배포 방식을 조정해야 합니다."
        ]),
        candidate("eks-container-app", 0.62, [
          "여러 애플리케이션 컨테이너를 Kubernetes 워크로드로 분리 운영할 수 있는 확장 대안입니다."
        ], [
          "저장소에 Kubernetes 운영 근거가 없어 클러스터 복잡도가 초기 요구보다 클 수 있습니다."
        ])
      ];
    }

    if (repositoryProfile.applicationUnitCount <= 1) {
      return [
        candidate("ecs-fargate-container-app", 0.9, [
          "단일 백엔드 컨테이너를 별도 클러스터 관리 없이 실행하는 구조가 ECS Fargate와 잘 맞습니다."
        ], [
          "작은 VM 한 대보다 ALB와 Fargate 운영 비용이 높을 수 있습니다."
        ]),
        candidate("eks-container-app", 0.54, [
          "단일 컨테이너도 Kubernetes 워크로드로 실행할 수 있어 향후 서비스 확장 대안이 됩니다."
        ], [
          "현재 단일 서비스 규모에는 EKS 클러스터 운영 복잡도가 과도할 수 있습니다."
        ])
      ];
    }

    return [
      candidate("ecs-fargate-container-app", 0.88, [
        "여러 컨테이너 애플리케이션 단위를 관리형 ECS Fargate 서비스로 분리 운영할 수 있습니다."
      ], [
        "서비스별 Task Definition, 네트워크, 로드 밸런싱 구성을 추가로 조정해야 합니다."
      ]),
      candidate("eks-container-app", 0.64, [
        "여러 컨테이너를 Kubernetes 워크로드로 분리할 수 있는 확장 대안입니다."
      ], [
        "저장소에 Kubernetes 근거가 없다면 초기 클러스터 운영 부담이 큽니다."
      ])
    ];
  }

  if (hasFrontend && hasBackend && wantsAuth) {
    return [
      candidate("full-serverless-web-app", 0.86, [
        "웹, API, 인증 요구가 전체 서버리스 웹 앱 템플릿과 잘 맞습니다."
      ], [
        "DynamoDB와 Cognito를 기본으로 사용하므로 관계형 데이터 요구가 있으면 조정이 필요합니다."
      ]),
      candidate("minimal-serverless-api", 0.7, [
        "API 영역은 최소 서버리스 API 템플릿으로 작게 시작할 수 있습니다."
      ], [
        "프론트엔드 호스팅과 Cognito는 기본 구성에 포함되지 않습니다."
      ])
    ];
  }

  if (hasBackend && (hasRelationalData || dataPersistence === "key_value")) {
    return [
      candidate("minimal-serverless-api", 0.8, [
        "API와 데이터 저장 요구가 Lambda API 시작 템플릿과 잘 맞습니다."
      ], [
        "관계형 데이터베이스가 필요하면 기본 DynamoDB 계층을 교체하거나 확장해야 합니다."
      ]),
      candidate("full-serverless-web-app", 0.66, [
        "웹과 API를 함께 운영하는 구조로 확장하기 좋습니다."
      ], [
        "API 전용 서비스에는 불필요할 수 있는 인증과 프론트엔드 리소스가 포함됩니다."
      ])
    ];
  }

  if (hasFrontend && !hasBackend) {
    return [
      candidate("static-web-hosting", 0.83, [
        "프론트엔드 전용 근거가 CloudFront와 S3 정적 호스팅 구성에 잘 맞습니다."
      ], [
        "동적 API, 인증, 서버 렌더링이 필요하면 백엔드 리소스를 추가해야 합니다."
      ]),
      candidate("full-serverless-web-app", 0.62, [
        "웹 앱이 성장할 때 API와 인증을 함께 확장할 수 있습니다."
      ], [
        "정적 웹사이트 시작 템플릿보다 초기 구성이 무겁습니다."
      ])
    ];
  }

  return [
    candidate("minimal-serverless-api", 0.72, [
      "서버리스 배포에서 가장 작게 시작할 수 있는 지원 API 템플릿입니다."
    ], [
      "저장소 근거가 제한적이므로 인계 전에 생성된 아키텍처를 검토해야 합니다."
    ]),
    candidate("static-web-hosting", 0.6, [
      "프론트엔드 전용 저장소라면 정적 호스팅 템플릿도 사용할 수 있습니다."
    ], [
      "백엔드 컴퓨팅 리소스는 포함하지 않습니다."
    ])
  ];
}

function rankSupportedCandidates(
  input: RepositoryTemplateRecommendationInput,
  deterministicCandidates: readonly CandidateSetItem[]
): readonly RepositoryTemplateRecommendationCandidate[] {
  return deterministicCandidates
    .slice(0, 3)
    .map((candidate, index) => {
      const definition = templateById.get(candidate.templateId);

      if (!definition) {
        throw new Error(`Unsupported TemplateId in repository recommendation: ${candidate.templateId}`);
      }

      return {
      templateId: candidate.templateId,
      displayTitle: templateDisplayTitles[candidate.templateId],
      confidence: adjustConfidence(candidate.baseConfidence, input, index),
      reasons: candidate.reasons,
      tradeoffs: candidate.tradeoffs,
      questions: createTemplateSpecificQuestions(input, candidate.templateId)
      } satisfies RepositoryTemplateRecommendationCandidate;
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

function createTemplateSpecificQuestions(
  input: RepositoryTemplateRecommendationInput,
  templateId: RepositoryTemplateId
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
      prompt: "어떤 API 런타임을 아키텍처에 포함할까요?",
      answerType: "single_select",
      options: [
        { value: "node", label: "Node API 중심" },
        { value: "python", label: "Python API 중심" },
        { value: "both", label: "둘 다 포함" }
      ],
      required: true,
      reason: "저장소에서 Node API와 Python API가 모두 감지되었습니다."
    });
  }

  if (hasFrontend && ["ecs-fargate-container-app", "three-tier-web-app"].includes(templateId)) {
    questions.push({
      id: "include_frontend",
      prompt: "감지된 프론트엔드를 이 아키텍처에 포함할까요?",
      answerType: "boolean",
      required: true,
      reason: "선택한 템플릿에서 프론트엔드 배치 여부를 결정해야 합니다."
    });
  }

  if (hasDatabase && templateId !== "static-web-hosting") {
    questions.push({
      id: "include_database",
      prompt: "감지된 데이터베이스 계층을 이 아키텍처에 포함할까요?",
      answerType: "boolean",
      required: true,
      reason: "선택한 템플릿에서 데이터 계층 포함 여부를 결정해야 합니다."
    });
  }

  return questions.slice(0, 5);
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
  templateId: RepositoryTemplateId,
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
