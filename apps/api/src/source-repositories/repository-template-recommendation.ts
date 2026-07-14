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

const templateIdSchema = z.enum(REPOSITORY_ANALYSIS_TEMPLATE_IDS);
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
    "??????? ???獒????????????琉??⒲걫??袁⑸즴?濚???⑥??IaC Practice Architecture ?????뭇?繹먮냱?????⑤베毓???筌뤾퍓???",
    "????곸죷????癰궽블뀬????ш끽維亦낅쉥異???????寃뗏?癲ル슢?꾤땟?????ш끽維亦???嶺뚮쮳?곌섈?????類???승??袁⑸즵????筌뚯뼚???",
    "confidence????????????ャ뀖??域????⑤젰?????쒙쭕? ???Β??????節뚮쳮嶺? ??ш끽維???ш끽維??? ???⑤㈇猿 ?????琉??⒲걫??????????紐껊렊???ㅼ굣筌뤿뱶?????Β????筌뚯뼚???",
    "??筌먦끉큔 ????렺?????????嶺뚮쮳?⑤뜽??釉먮폇壤???關履?????????袁⑸즵????? 癲ル슢??슙???????琉???좊즴甕곗쥉???癲ル슢??????ш끽維亦???癲ル슓堉곁땟??リ랜??????猿??筌뚯뼚???",
    "??⑤베毓???????? ??關履?????? ???????????嶺뚮Ĳ?됮??????늄????ㅼ굣??????늄???癲ル슢??????癰궽살쐿???繞????????筌뚯뼚???",
    "????ш끽維亦??allowedQuestionIds????鴉딆눨????⑤챶???嶺뚮쮳?곌섈?????類???승????????癰궽살쐿??癲ル슣??袁ｋ즵?????????筌뚯뼚???",
    "?????琉??????몄툗 ???????ㅻ쿋??????늄????????釉먮윥????????????? 癲ル슢???삳빝??"
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

  return {
    deploymentType: fallback.deploymentType,
    usesCiCd: fallback.usesCiCd,
    candidates: candidates
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 3)
  };
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
    return /api|runtime|node|python/.test(normalizedPrompt);
  }

  if (questionId === "include_frontend") {
    return /frontend|react|web/.test(normalizedPrompt)
      && !/database|db|postgres|mysql|dynamo|rds/.test(normalizedPrompt);
  }

  if (questionId === "include_database") {
    return /database|db|postgres|mysql|dynamo|rds|data/.test(normalizedPrompt)
      && !/cluster|pod|node group/.test(normalizedPrompt);
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
      prompt: "Does this application need persistent data storage?",
      answerType: "single_select",
      options: [
        { value: "none", label: "No persistent data" },
        { value: "relational", label: "Relational database" },
        { value: "key_value", label: "Key-value or document store" }
      ],
      required: true,
      reason: "Repository evidence does not prove the persistence tier."
    });
  }

  if (!hasFrontend || !hasBackend) {
    questions.push({
      id: "application-scope",
      prompt: "Which application scope should the architecture prepare first?",
      answerType: "single_select",
      options: [
        { value: "web", label: "Public web frontend" },
        { value: "api", label: "API backend" },
        { value: "web_and_api", label: "Web frontend and API backend" }
      ],
      required: true,
      reason: "Repository analysis could not prove every deployable application boundary."
    });
  }

  if (!/cognito|auth|oauth|login|session/.test(text)) {
    questions.push({
      id: "authentication",
      prompt: "Should the initial architecture include managed user authentication?",
      answerType: "boolean",
      required: true,
      reason: "Repository evidence does not prove an authentication requirement."
    });
  }

  if (!/kubernetes|eks|ecs|fargate/.test(text)) {
    questions.push({
      id: "operations-preference",
      prompt: "Which operations model do you prefer for the first deployment?",
      answerType: "single_select",
      options: [
        { value: "managed", label: "Managed services first" },
        { value: "container", label: "Container runtime" },
        { value: "self_managed_vm", label: "EC2/VM self-managed" }
      ],
      required: false,
      reason: "Repository evidence does not prove the preferred operations model."
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
        "EC2/VM evidence fits an ALB, compute, and data-tier architecture."
      ], [
        "It has more host-level operational work than Fargate or serverless options."
      ]),
      candidate(hasFrontend && hasBackend ? "ecs-fargate-container-app" : "minimal-serverless-api", 0.6, [
        "A managed runtime is a plausible alternative if the team wants less VM operation."
      ], [
        "The selected deployment model would move away from the EC2/VM default."
      ])
    ];
  }

  if (input.deploymentType === "container") {
    if (wantsEks) {
      return [
        candidate("eks-container-app", 0.9, [
          "Kubernetes or EKS evidence directly matches an EKS architecture."
        ], [
          "EKS adds cluster and Kubernetes object operations."
        ]),
        candidate("ecs-fargate-container-app", 0.78, [
          "The container workload can also run on ECS Fargate with less cluster operation."
        ], [
          "Existing Kubernetes manifests would need translation."
        ])
      ];
    }

    if (hasFrontend && hasBackend && hasRelationalData) {
      return [
        candidate("ecs-fargate-container-app", 0.86, [
          "Frontend, backend, and database evidence can be modeled around ECS Fargate services."
        ], [
          "Database and service boundaries still need confirmation."
        ]),
        candidate("three-tier-web-app", 0.79, [
          "A traditional three-tier layout can represent web, app, and data tiers."
        ], [
          "It changes the runtime model from containers to EC2 Auto Scaling."
        ]),
        candidate("eks-container-app", 0.62, [
          "Kubernetes remains a scaling alternative for multiple containers."
        ], [
          "No Kubernetes evidence was found, so EKS may be more complex than needed."
        ])
      ];
    }

    if (repositoryProfile.applicationUnitCount <= 1) {
      return [
        candidate("ecs-fargate-container-app", 0.9, [
          "A single containerized service matches ECS Fargate better than a VM-based 3-tier template."
        ], [
          "ALB and Fargate cost can be higher than a tiny self-managed VM."
        ]),
        candidate("eks-container-app", 0.54, [
          "The container can run on Kubernetes if future orchestration needs grow."
        ], [
          "EKS is likely too complex for a single service today."
        ])
      ];
    }

    return [
      candidate("ecs-fargate-container-app", 0.88, [
        "Container evidence matches managed ECS Fargate services."
      ], [
        "Service-level task definitions and networking still need refinement."
      ]),
      candidate("eks-container-app", 0.64, [
        "Multiple containers can be separated into Kubernetes workloads."
      ], [
        "Without Kubernetes evidence, EKS adds avoidable operational complexity."
      ])
    ];
  }

  if (hasFrontend && hasBackend && wantsAuth) {
    return [
      candidate("full-serverless-web-app", 0.86, [
        "Web, API, and authentication needs fit a full serverless web app."
      ], [
        "Relational data requirements may need adaptation from the default data store."
      ]),
      candidate("minimal-serverless-api", 0.7, [
        "The API portion can start from a smaller serverless API template."
      ], [
        "Frontend hosting and authentication are not included by default."
      ])
    ];
  }

  if (hasBackend && (hasRelationalData || dataPersistence === "key_value")) {
    return [
      candidate("minimal-serverless-api", 0.8, [
        "API and data needs fit a compact serverless API starting point."
      ], [
        "The data store may need adjustment for relational persistence."
      ]),
      candidate("full-serverless-web-app", 0.66, [
        "The architecture can expand to include a web frontend later."
      ], [
        "It includes more frontend and auth resources than an API-only service may need."
      ])
    ];
  }

  if (hasFrontend && !hasBackend) {
    return [
      candidate("static-web-hosting", 0.83, [
        "Frontend-only evidence fits static hosting with CDN delivery."
      ], [
        "Dynamic API or server rendering needs would require backend resources."
      ]),
      candidate("full-serverless-web-app", 0.62, [
        "The frontend can grow into a serverless web app if APIs are added."
      ], [
        "It is heavier than a static hosting starting point."
      ])
    ];
  }

  return [
    candidate("minimal-serverless-api", 0.72, [
      "A minimal serverless API is the smallest managed starting point for limited evidence."
    ], [
      "Additional architecture details should be confirmed before deployment."
    ]),
    candidate("static-web-hosting", 0.6, [
      "If the repository is frontend-only, static hosting may be enough."
    ], [
      "Backend compute is not included."
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
        reasons: candidate.reasons,
        tradeoffs: candidate.tradeoffs,
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
      prompt: "Which API runtime should the architecture prioritize?",
      answerType: "single_select",
      options: [
        { value: "node", label: "Node API first" },
        { value: "python", label: "Python API first" },
        { value: "both", label: "Include both" }
      ],
      required: true,
      reason: "Repository evidence includes both Node and Python API signals."
    });
  }

  if (hasFrontend && ["ecs-fargate-container-app", "three-tier-web-app"].includes(templateId)) {
    questions.push({
      id: "include_frontend",
      prompt: "Should the detected frontend be included in this architecture?",
      answerType: "boolean",
      required: true,
      reason: "The selected template can include frontend delivery resources."
    });
  }

  if (hasDatabase && templateId !== "static-web-hosting") {
    questions.push({
      id: "include_database",
      prompt: "Should the detected data tier be included in this architecture?",
      answerType: "boolean",
      required: true,
      reason: "Repository evidence includes database-related signals."
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
        "This available template is included in the repository-analysis ranking pool."
      ], [
        "Repository evidence is weaker for this template than for the top recommendations."
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
