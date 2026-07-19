import type {
  AiArchitectureDraftResult,
  AiBillingMode,
  AiProviderMetadata,
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot,
  ArchitectureDraftClarification,
  ArchitectureJson,
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse,
  LlmExplanation,
  LlmExplanationFallbackReason,
  ResourceType,
  TemplateDefinition,
  TemplateId
} from "@sketchcatch/types";
import { getTemplateDefinitionById } from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import type { RuntimeCache } from "../runtime-cache/index.js";
import { applyGuardrailMetadata } from "./aiArchitectureDraftMetadata.js";
import {
  createNormalizedArchitectureIntentPlan,
  createOpenAiRequirementNormalizerProviderFromEnv,
  parseArchitectureIntentPlan,
  type ArchitectureIntentPlan
} from "./aiArchitectureRequirementNormalizer.js";
import {
  createArchitectureResourceDeploymentConfig,
  SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG,
  SUPPORTED_ARCHITECTURE_RESOURCE_TYPES
} from "./aiArchitectureResourceCatalog.js";
import { planPracticeArchitecture } from "./aiArchitectureRequirementDraftBuilder.js";
import { applyOperatingConditionConfig } from "./aiArchitectureOperatingConditions.js";
import {
  ArchitectureDraftGenerationError,
  createInternalArchitectureGenerationError,
  createProviderResponseInvalidError,
  createProviderUnavailableError,
  createRequirementsUnsatisfiedError
} from "./aiArchitectureDraftGenerationErrors.js";
import {
  applyArchitectureOperationalPolicy,
  resolveArchitectureOperationalRequirements,
  validateArchitectureOperationalRequirements
} from "./aiArchitectureOperationalRequirements.js";
import { resolveArchitectureResourceQuantities } from "./aiArchitectureResourceQuantities.js";
import { resolveArchitectureRequirement } from "./aiArchitectureRequirementResolution.js";
import { createArchitectureDraftFallbackExplanation } from "./aiLlmExplanationFallbacks.js";
import {
  createAmazonQArchitectureDraftProviderFromEnv,
  warmAmazonQArchitectureDraftProvider
} from "./aiArchitectureQBusiness.js";
import {
  createAwsArchitectureReferenceKnowledgePayload,
  createAwsArchitectureReferenceKnowledgePrompt
} from "./awsArchitectureReferenceKnowledge.js";
import { resolveAiProviderRegions, type AiCreditPolicy, type AiTextProvider } from "./aiLlmExplanation.js";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";

const ARCHITECTURE_DRAFT_TARGET = "architecture_draft";

export { ArchitectureDraftGenerationError } from "./aiArchitectureDraftGenerationErrors.js";

const SUPPORTED_RESOURCE_TYPES = SUPPORTED_ARCHITECTURE_RESOURCE_TYPES;
const SUPPORTED_RESOURCE_CATALOG = SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG;
type FixedTemplateSelection = TemplateDefinition;

const SUPPORTED_RESOURCE_TYPE_SET = new Set<ResourceType>(SUPPORTED_RESOURCE_TYPES);
const DEFAULT_PREVIEW_NODE_SIZE = { width: 124, height: 96 } as const;
const PREVIEW_LABEL_CHARACTER_WIDTH = 7;
const PREVIEW_LABEL_HORIZONTAL_PADDING = 32;
const PREVIEW_LABEL_MAX_WIDTH = 260;
const PREVIEW_LABEL_HEIGHT = 28;
const PREVIEW_VISUAL_BOUNDS_HORIZONTAL_MARGIN = 20;
const PREVIEW_VISUAL_BOUNDS_VERTICAL_MARGIN = 8;
const PREVIEW_NODE_LAYOUT_SIZES: Partial<Record<ResourceType, LayoutSize>> = {
  VPC: { width: 240, height: 160 },
  SUBNET: { width: 180, height: 120 }
};
const PREVIEW_AREA_RESOURCE_TYPES = new Set<ResourceType>(["VPC", "SUBNET"]);
const PREVIEW_BOUNDARY_RESOURCE_TYPES = new Set<ResourceType>(["INTERNET_GATEWAY"]);
const EXCLUDABLE_CANDIDATE_RESOURCE_TYPES = new Set<ResourceType>([
  "S3",
  "CLOUDFRONT",
  "CLOUDWATCH_LOG_GROUP",
  "CLOUDWATCH_METRIC_ALARM",
  "CLOUDWATCH_DASHBOARD",
  "CLOUDTRAIL",
  "XRAY_GROUP",
  "XRAY_SAMPLING_RULE",
  "SNS_TOPIC",
  "SQS_QUEUE",
  "EVENTBRIDGE_RULE",
  "SCHEDULER_SCHEDULE",
  "CODEBUILD_PROJECT",
  "CODEDEPLOY_APP",
  "CODEPIPELINE",
  "CODESTAR_CONNECTION",
  "ECR_REPOSITORY",
  "CONFIG_RULE",
  "SHIELD_PROTECTION",
  "GUARDDUTY_DETECTOR"
]);
const PREVIEW_PARENT_EDGE_LABELS = new Set(["contains", "hosts"]);
const TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES = ["id", "arn", "name", "execution_arn"] as const;
const RESOURCE_TYPE_TERRAFORM_NAMES: Partial<Record<ResourceType, string>> = {
  VPC: "aws_vpc",
  SUBNET: "aws_subnet",
  SECURITY_GROUP: "aws_security_group"
};
const SECURITY_GROUP_REFERENCE_KEYS = ["securityGroupIds", "vpcSecurityGroupIds", "securityGroupId"] as const;
type RequiredArchitectureQuestion = {
  readonly id: string;
  readonly question: string;
  readonly suggestions: string[];
  readonly isAnswered: (prompt: string) => boolean;
};

type LayoutSize = {
  readonly width: number;
  readonly height: number;
};

type LayoutRect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

type AmazonQArchitectureDraftPreview = {
  readonly status: "preview";
  readonly title: string;
  readonly architectureJson: ArchitectureJson;
  readonly requirementCoverage?: readonly AmazonQRequirementCoverage[] | undefined;
  readonly assumptions?: readonly string[] | undefined;
  readonly explanations?: readonly string[] | undefined;
  readonly summary?: string | undefined;
  readonly highlights?: readonly string[] | undefined;
  readonly nextActions?: readonly string[] | undefined;
};

type AmazonQRequirementCoverage = {
  readonly answer: string;
  readonly status: string;
  readonly capability?: string | undefined;
  readonly nodes?: readonly string[] | undefined;
  readonly assumption?: string | undefined;
};

type ArchitectureAnswerProfile = {
  readonly traffic?: "small" | "medium" | "large" | "bursty" | undefined;
  readonly frontend?: "static" | "spa" | "ssr" | "mobile" | undefined;
  readonly backend?: "none" | "simple_api" | "complex" | "microservices" | undefined;
  readonly region?: "korea" | "apac" | "global" | "specific" | undefined;
  readonly upload?: "none" | "image" | "mixed" | "large" | undefined;
  readonly realtime?: "none" | "chat" | "notification" | "data_updates" | undefined;
  readonly management?: "fully_managed" | "semi_managed" | "self_managed" | "unknown" | undefined;
  readonly latency?: "one_second" | "three_seconds" | "five_seconds" | "none" | undefined;
  readonly availability?: "99.99" | "99.9" | "99" | "none" | undefined;
  readonly budget?: "low" | "normal" | "high" | "enterprise" | undefined;
};

type ArchitectureDecisionPattern = {
  readonly id: string;
  readonly when: string;
  readonly typicalNodeTypes: readonly ResourceType[];
  readonly tradeoffs: readonly string[];
};

type UnsupportedSubstitution = {
  readonly requestedService: string;
  readonly supportedRepresentation: string;
  readonly requiredExplanation: string;
};

type ArchitectureDecisionSpace = {
  readonly answerProfile: ArchitectureAnswerProfile;
  readonly hardConstraints: readonly string[];
  readonly preferredPatterns: readonly ArchitectureDecisionPattern[];
  readonly discouragedPatterns: readonly { readonly id: string; readonly reason: string }[];
  readonly evaluationCriteria: readonly string[];
  readonly unsupportedSubstitutions: readonly UnsupportedSubstitution[];
  readonly coverageRequirements: readonly string[];
};

type AmazonQArchitectureDraftClarification = {
  readonly status: "needs_clarification";
  readonly question: string;
  readonly suggestions?: readonly string[] | undefined;
};

type AmazonQArchitectureDraftPlan = {
  readonly status: "plan";
  readonly title: string;
  readonly plan: ArchitectureIntentPlan;
  readonly assumptions?: readonly string[] | undefined;
  readonly explanations?: readonly string[] | undefined;
};

type AmazonQArchitectureDraftResponse =
  | AmazonQArchitectureDraftPreview
  | AmazonQArchitectureDraftClarification
  | AmazonQArchitectureDraftPlan;

export type CreateArchitectureDraftResponseFactory = (
  request: CreateArchitectureDraftRequest,
  options?: {
    readonly onProgress?: ((snapshot: ArchitectureDraftProgressSnapshot) => void) | undefined;
  }
) => Promise<CreateArchitectureDraftResponse> | CreateArchitectureDraftResponse;

export type CreateAmazonQArchitectureDraftResponseOptions = {
  readonly provider?: AiTextProvider | undefined;
  readonly requirementNormalizerProvider?: AiTextProvider | undefined;
  readonly creditPolicy?: AiCreditPolicy | undefined;
  readonly onProgress?: ((snapshot: ArchitectureDraftProgressSnapshot) => void) | undefined;
};

// 자연어 요청을 보드가 열 수 있는 ArchitectureJson 초안으로 바꾸는 1차 진입점입니다.
export function createArchitectureDraft(input: string | CreateArchitectureDraftRequest): AiArchitectureDraftResult {
  const request = normalizeArchitectureDraftRequest(input);
  const candidateDraft = createArchitectureDraftCandidateProjection(request);

  return applyArchitectureDraftCandidateExclusions(
    candidateDraft,
    resolveAuthorizedCandidateExclusions(
      candidateDraft.architectureJson,
      request.candidateExclusions
    )
  );
}

function createArchitectureDraftCandidateProjection(
  request: CreateArchitectureDraftRequest
): AiArchitectureDraftResult {
  const resolution = resolveArchitectureRequirement(request);
  const resourceQuantities = resolveArchitectureResourceQuantities(request.prompt);
  const draft = planPracticeArchitecture(resolution, resourceQuantities);
  const configuredDraft = applyOperatingConditionConfig(draft, resolution.operatingProfile);

  return applyArchitectureDraftBaseRequestPolicies(
    applyGuardrailMetadata(configuredDraft, request, resolution),
    request
  );
}

function authorizeArchitectureDraftRequest(
  request: CreateArchitectureDraftRequest
): CreateArchitectureDraftRequest {
  if (request.candidateExclusions === undefined) {
    return request;
  }

  try {
    const candidateDraft = createArchitectureDraftCandidateProjection(request);
    return {
      ...request,
      candidateExclusions:
        resolveAuthorizedCandidateExclusions(
          candidateDraft.architectureJson,
          request.candidateExclusions
        ) ?? []
    };
  } catch {
    return { ...request, candidateExclusions: [] };
  }
}

// GitHub 링크 요청도 결국 가벼운 텍스트 근거를 모아 자연어 초안 생성 흐름을 재사용합니다.
export function createArchitectureDraftFromRepositoryEvidence(
  repositoryUrl: string,
  evidence: readonly string[]
): AiArchitectureDraftResult {
  const evidenceText = evidence.join("\n").toLowerCase();
  const draft = createArchitectureDraft(evidenceText || repositoryUrl);

  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      source: "github",
      assumptions: [
        ...draft.metadata.assumptions,
        "Source Repository의 README와 package metadata만 근거로 Architecture Draft를 추론했습니다."
      ]
    }
  };
}

export function createConfiguredAmazonQArchitectureDraftResponse(input: {
  readonly onWarmupError?: ((error: unknown) => void) | undefined;
  readonly runtimeCache?: RuntimeCache | undefined;
} = {}): CreateArchitectureDraftResponseFactory {
  const regions = resolveAiProviderRegions(process.env);
  const creditPolicy = readAiCreditPolicyFromEnv();
  const provider =
    process.env.NODE_ENV === "test"
      ? undefined
      : createAmazonQArchitectureDraftProviderFromEnv({
          region: regions.amazonQRegion,
          ...(input.runtimeCache === undefined ? {} : { runtimeCache: input.runtimeCache })
        });
  const requirementNormalizerProvider =
    process.env.NODE_ENV === "test" ? undefined : createOpenAiRequirementNormalizerProviderFromEnv();

  if (
    provider !== undefined
    && shouldWarmConfiguredAmazonQArchitectureDraftProvider(creditPolicy)
  ) {
    void warmAmazonQArchitectureDraftProvider(provider).catch((error: unknown) => {
      input.onWarmupError?.(error);
    });
  }

  return (request, operationOptions) =>
    createAmazonQArchitectureDraftResponse(request, {
      provider,
      requirementNormalizerProvider,
      creditPolicy,
      onProgress: operationOptions?.onProgress
    });
}

export function shouldWarmConfiguredAmazonQArchitectureDraftProvider(
  creditPolicy: AiCreditPolicy
): boolean {
  return creditPolicy.billingMode === "aws_credit_only" && creditPolicy.amazonQ;
}

// 선택된 Template이 있으면 Amazon Q payload와 prompt에 고정 결정으로 함께 전달합니다.
export async function createAmazonQArchitectureDraftResponse(
  input: string | CreateArchitectureDraftRequest,
  options: CreateAmazonQArchitectureDraftResponseOptions = {}
): Promise<CreateArchitectureDraftResponse> {
  let request = authorizeArchitectureDraftRequest(
    normalizeArchitectureDraftRequest(input)
  );
  const creditPolicy = options.creditPolicy ?? readAiCreditPolicyFromEnv();
  const provider = options.provider;
  const progressReporter = createArchitectureDraftProgressReporter(request, options.onProgress);

  const missingQuestion = findMissingRequiredQuestion(request);

  if (missingQuestion !== null) {
    return createArchitectureDraftClarification(
      missingQuestion.question,
      request,
      creditPolicy.billingMode,
      missingQuestion.invalidAnswer
    );
  }

  request = withAcceptedArchitectureClarificationAnswers(request);
  const conditionalQuestion = findConditionalArchitectureQuestion(request.prompt);

  if (conditionalQuestion !== null) {
    return createArchitectureDraftClarification(
      conditionalQuestion,
      request,
      creditPolicy.billingMode,
      request.clarificationAnswers?.some((answer) => answer.questionId === conditionalQuestion.id) ?? false
    );
  }

  if (creditPolicy.billingMode !== "aws_credit_only" || !creditPolicy.amazonQ) {
    await reportFallbackDraftProgress(progressReporter, options.onProgress);
    return createFallbackArchitectureDraftResponse(request, "credit_not_confirmed", creditPolicy.billingMode);
  }

  if (provider === undefined) {
    await reportFallbackDraftProgress(progressReporter, options.onProgress);
    return createFallbackArchitectureDraftResponse(request, "provider_not_configured", creditPolicy.billingMode);
  }

  progressReporter.reportCandidates();
  const architectureDecisionSpace = createArchitectureDecisionSpace(request.prompt);
  const providerNormalizedRequirement = await createNormalizedArchitectureIntentPlan({
    prompt: request.prompt,
    provider: options.requirementNormalizerProvider
  });
  const normalizedRequirement = applyRepositoryEvidencePriorityToRequirementPlan(
    applyFixedTemplatePriorityToRequirementPlan(
      mergeArchitectureIntentPlans(
        providerNormalizedRequirement,
        createDeterministicArchitectureIntentPlan(request.prompt)
      ),
      request.templateId
    ),
    request
  );
  const architectureBrief = createAmazonQArchitectureBrief(request.prompt);
  const fixedTemplateSelection = createFixedTemplateSelection(request.templateId);
  const referenceKnowledge = createAwsArchitectureReferenceKnowledgePayload();
  const payload = maskSecretsForAi({
    architectureBrief,
    architectureDecisionSpace,
    ...(request.clarificationAnswers === undefined
      ? {}
      : { clarificationAnswers: request.clarificationAnswers }),
    ...(request.candidateExclusions === undefined
      ? {}
      : { candidateExclusions: request.candidateExclusions }),
    ...(normalizedRequirement === null ? {} : { normalizedRequirement }),
    fixedTemplateSelection,
    prompt: request.prompt,
    referenceKnowledge,
    supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
    supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
  });

  try {
    let activePayload = payload;
    let retryUsed = false;
    progressReporter.reportCandidates();
    let response = await generateArchitectureDraftProviderResponse(provider, {
      target: ARCHITECTURE_DRAFT_TARGET,
      instructions: createAmazonQArchitectureDraftInstructions(),
      prompt: createAmazonQArchitectureDraftPrompt(
        request.prompt,
        architectureDecisionSpace,
        normalizedRequirement,
        fixedTemplateSelection,
        request.candidateExclusions
      ),
      payload: activePayload
    });
    progressReporter.reportCandidates();
    let parsedResponse = applyOperationalPolicyToProviderResponse(
      parseArchitectureDraftProviderResponse(response.text),
      request.prompt,
      normalizedRequirement
    );

    if (parsedResponse.status === "preview") {
      const validationIssues = findAmazonQPreviewValidationIssues(
        request.prompt,
        parsedResponse,
        normalizedRequirement,
        request.candidateExclusions
      );

      if (validationIssues.length > 0) {
        retryUsed = true;
        activePayload = maskSecretsForAi({
          architectureBrief,
          architectureDecisionSpace,
          ...(request.candidateExclusions === undefined
            ? {}
            : { candidateExclusions: request.candidateExclusions }),
          ...(normalizedRequirement === null ? {} : { normalizedRequirement }),
          fixedTemplateSelection,
          prompt: request.prompt,
          referenceKnowledge,
          validationIssues,
          previousArchitectureJson: parsedResponse.architectureJson,
          supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
          supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
        });
        progressReporter.reportCandidates();
        response = await generateArchitectureDraftProviderResponse(provider, {
          target: ARCHITECTURE_DRAFT_TARGET,
          instructions: createAmazonQArchitectureDraftInstructions(),
          prompt: createAmazonQArchitectureDraftRepairPrompt(
            request.prompt,
            architectureDecisionSpace,
            normalizedRequirement,
            fixedTemplateSelection,
            request.candidateExclusions,
            validationIssues,
            parsedResponse.architectureJson
          ),
          payload: activePayload
        });
        progressReporter.reportCandidates();
        parsedResponse = applyOperationalPolicyToProviderResponse(
          parseArchitectureDraftProviderResponse(response.text),
          request.prompt,
          normalizedRequirement
        );

        const retryValidationIssues =
          parsedResponse.status === "preview"
            ? findAmazonQPreviewValidationIssues(
                request.prompt,
                parsedResponse,
                normalizedRequirement,
                request.candidateExclusions
              )
            : [];

        if (parsedResponse.status === "preview" && retryValidationIssues.length > 0) {
          if (!isUsableCandidateArchitecture(parsedResponse.architectureJson)) {
            await reportFallbackDraftProgress(progressReporter, options.onProgress);
            return createFallbackArchitectureDraftResponse(
              request,
              "invalid_response",
              creditPolicy.billingMode
            );
          }
          throw createRequirementsUnsatisfiedError(retryValidationIssues);
        }
      }
    }

    let providerMetadata = createAiProviderMetadata({
      provider,
      billingMode: creditPolicy.billingMode,
      payload: activePayload,
      outputCharacters: response.outputCharacters ?? response.text.length
    });

    if (parsedResponse.status === "needs_clarification") {
      return {
        status: "needs_clarification",
        questionId: createProviderClarificationQuestionId(parsedResponse.question),
        question: parsedResponse.question,
        suggestions: [...(parsedResponse.suggestions ?? [])],
        providerMetadata
      };
    }

    if (parsedResponse.status === "plan") {
      try {
        progressReporter.reportCandidates();
        return applyArchitectureDraftRequestPolicies(
          createAmazonQPlanDraftResult(
            parsedResponse,
            request,
            normalizedRequirement,
            providerMetadata
          ),
          request
        );
      } catch (error) {
        if (retryUsed) {
          throw error;
        }

        const validationIssues = [
          `Architecture plan materialization validation failed: ${readArchitectureDraftErrorMessage(error)}`
        ];
        const previousPlan = {
          title: parsedResponse.title,
          ...parsedResponse.plan
        };
        activePayload = maskSecretsForAi({
          architectureBrief,
          architectureDecisionSpace,
          ...(request.candidateExclusions === undefined
            ? {}
            : { candidateExclusions: request.candidateExclusions }),
          ...(normalizedRequirement === null ? {} : { normalizedRequirement }),
          fixedTemplateSelection,
          prompt: request.prompt,
          referenceKnowledge,
          validationIssues,
          previousPlan,
          supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
          supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
        });
        progressReporter.reportCandidates();
        response = await generateArchitectureDraftProviderResponse(provider, {
          target: ARCHITECTURE_DRAFT_TARGET,
          instructions: createAmazonQArchitectureDraftInstructions(),
          prompt: createAmazonQArchitecturePlanRepairPrompt(
            request.prompt,
            architectureDecisionSpace,
            normalizedRequirement,
            fixedTemplateSelection,
            request.candidateExclusions,
            validationIssues,
            previousPlan
          ),
          payload: activePayload
        });
        progressReporter.reportCandidates();
        parsedResponse = parseArchitectureDraftProviderResponse(response.text);

        if (parsedResponse.status !== "plan") {
          throw createProviderResponseInvalidError(
            new Error(
              "Amazon Q must return a corrected architecture plan after materialization validation fails",
              { cause: error }
            )
          );
        }

        providerMetadata = createAiProviderMetadata({
          provider,
          billingMode: creditPolicy.billingMode,
          payload: activePayload,
          outputCharacters: response.outputCharacters ?? response.text.length
        });

        progressReporter.reportCandidates();
        return applyArchitectureDraftRequestPolicies(
          createAmazonQPlanDraftResult(
            parsedResponse,
            request,
            normalizedRequirement,
            providerMetadata
          ),
          request
        );
      }
    }

    progressReporter.reportCandidates();
    return applyArchitectureDraftRequestPolicies(
      createAmazonQDraftResult(parsedResponse, providerMetadata),
      request
    );
  } catch (error) {
    if (
      error instanceof ArchitectureDraftGenerationError &&
      error.kind === "requirements_unsatisfied"
    ) {
      return createAmazonQRequirementConflictClarification({
        architectureDecisionSpace,
        billingMode: creditPolicy.billingMode,
        fixedTemplateSelection,
        normalizedRequirement,
        provider,
        request,
        validationIssues: error.issues
      });
    }

    if (error instanceof ArchitectureDraftGenerationError) {
      throw error;
    }

    throw createInternalArchitectureGenerationError(error);
  }
}

async function createAmazonQRequirementConflictClarification(input: {
  readonly architectureDecisionSpace: ArchitectureDecisionSpace;
  readonly billingMode: AiBillingMode;
  readonly fixedTemplateSelection: FixedTemplateSelection | null;
  readonly normalizedRequirement: ArchitectureIntentPlan | null;
  readonly provider: AiTextProvider;
  readonly request: CreateArchitectureDraftRequest;
  readonly validationIssues: readonly string[];
}): Promise<ArchitectureDraftClarification> {
  const payload = maskSecretsForAi({
    architectureDecisionSpace: input.architectureDecisionSpace,
    ...(input.request.clarificationAnswers === undefined
      ? {}
      : { clarificationAnswers: input.request.clarificationAnswers }),
    fixedTemplateSelection: input.fixedTemplateSelection,
    normalizedRequirement: input.normalizedRequirement,
    prompt: input.request.prompt,
    task: "requirement_conflict_clarification",
    validationIssues: input.validationIssues
  });
  const response = await generateArchitectureDraftProviderResponse(input.provider, {
    target: ARCHITECTURE_DRAFT_TARGET,
    instructions: createAmazonQRequirementConflictInstructions(),
    prompt: createAmazonQRequirementConflictPrompt(
      input.request.prompt,
      input.architectureDecisionSpace,
      input.normalizedRequirement,
      input.fixedTemplateSelection,
      input.validationIssues
    ),
    payload
  });
  const parsedResponse = parseArchitectureDraftProviderResponse(response.text);

  if (parsedResponse.status !== "needs_clarification") {
    throw createProviderResponseInvalidError(
      new Error("Amazon Q must return a requirement conflict clarification")
    );
  }

  return {
    status: "needs_clarification",
    questionId: createProviderClarificationQuestionId(parsedResponse.question),
    question: parsedResponse.question,
    suggestions: [...(parsedResponse.suggestions ?? [])],
    providerMetadata: createAiProviderMetadata({
      provider: input.provider,
      billingMode: input.billingMode,
      payload,
      outputCharacters: response.outputCharacters ?? response.text.length
    })
  };
}

async function generateArchitectureDraftProviderResponse(
  provider: AiTextProvider,
  input: Parameters<AiTextProvider["generate"]>[0]
): Promise<Awaited<ReturnType<AiTextProvider["generate"]>>> {
  try {
    return await provider.generate(input);
  } catch (error) {
    if (error instanceof ArchitectureDraftGenerationError) {
      throw error;
    }

    throw createProviderUnavailableError(error);
  }
}

function parseArchitectureDraftProviderResponse(text: string): AmazonQArchitectureDraftResponse {
  try {
    return parseAmazonQArchitectureDraftResponse(text);
  } catch (error) {
    throw createProviderResponseInvalidError(error);
  }
}

function applyOperationalPolicyToProviderResponse(
  response: AmazonQArchitectureDraftResponse,
  prompt: string,
  normalizedRequirement: ArchitectureIntentPlan | null
): AmazonQArchitectureDraftResponse {
  if (response.status !== "preview") {
    return response;
  }

  const securedArchitectureJson = configureRequiredHttpsTransport(
    response.architectureJson,
    prompt
  );
  const requirementSanitizedArchitectureJson = sanitizeArchitecturePreviewForRequirement(
    securedArchitectureJson,
    normalizedRequirement
  );

  return {
    ...response,
    architectureJson: applyArchitectureParameterCompletenessDefaults(
      applyArchitectureOperationalPolicy(
        requirementSanitizedArchitectureJson,
        resolveArchitectureOperationalRequirements(prompt)
      )
    )
  };
}

const SERVERLESS_ORPHAN_NETWORK_RESOURCE_TYPES = new Set<ResourceType>([
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "NAT_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "ELASTIC_IP",
  "SECURITY_GROUP"
]);

function sanitizeArchitecturePreviewForRequirement(
  architectureJson: ArchitectureJson,
  normalizedRequirement: ArchitectureIntentPlan | null
): ArchitectureJson {
  if (normalizedRequirement === null) {
    return architectureJson;
  }

  const forbiddenCapabilities = new Set(
    (normalizedRequirement.forbiddenCapabilities ?? []).map((capability) => capability.toLowerCase())
  );
  const patternIds = new Set(normalizedRequirement.patternIds ?? []);
  const requiredResources = new Set(normalizedRequirement.requiredResources ?? []);
  const previewResourceTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const hasServerlessRuntimePreview = hasAnyNodeType(previewResourceTypes, [
    "API_GATEWAY_REST_API",
    "LAMBDA"
  ]);
  const hasVpcBoundRuntimePreview = hasAnyNodeType(previewResourceTypes, [
    "EC2",
    "LOAD_BALANCER",
    "LOAD_BALANCER_LISTENER",
    "LOAD_BALANCER_TARGET_GROUP",
    "ECS_CLUSTER",
    "ECS_SERVICE",
    "ECS_TASK_DEFINITION",
    "EKS_CLUSTER",
    "EKS_NODE_GROUP",
    "RDS",
    "DB_SUBNET_GROUP"
  ]);
  const serverlessOnly =
    patternIds.has("serverless-api") ||
    (forbiddenCapabilities.has("database") && hasServerlessRuntimePreview && !hasVpcBoundRuntimePreview) ||
    (forbiddenCapabilities.has("ec2_runtime") &&
      forbiddenCapabilities.has("load_balancer") &&
      (requiredResources.has("LAMBDA") || requiredResources.has("API_GATEWAY_REST_API")));

  const nodes = architectureJson.nodes.filter((node) => {
    if (serverlessOnly && SERVERLESS_ORPHAN_NETWORK_RESOURCE_TYPES.has(node.type)) {
      return false;
    }

    if (forbiddenCapabilities.has("database") && isForbiddenDatabaseArchitectureNode(node)) {
      return false;
    }

    return true;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: architectureJson.edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
  };
}

function applyArchitectureParameterCompletenessDefaults(
  architectureJson: ArchitectureJson
): ArchitectureJson {
  const staticBucket = architectureJson.nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
  ) ?? architectureJson.nodes.find((node) => node.type === "S3");
  const staticOriginId = staticBucket?.id ?? "web-assets-bucket";
  const lambdaRole = architectureJson.nodes.find((node) => node.type === "IAM_ROLE");
  const lambdaRoleArn =
    lambdaRole === undefined
      ? "var.lambda_execution_role_arn"
      : canonicalTerraformReference("aws_iam_role", lambdaRole.id, "arn");

  const nodes = architectureJson.nodes.map((node) => {
    if (node.type === "LAMBDA") {
      return {
        ...node,
        config: {
          ...node.config,
          functionName: node.config.functionName ?? "practice-api-handler",
          role: node.config.role ?? lambdaRoleArn,
          handler: node.config.handler ?? "index.handler",
          runtime: node.config.runtime ?? "nodejs20.x"
        }
      };
    }

    if (node.type === "CLOUDFRONT") {
      const originResourceId =
        typeof node.config.originResourceId === "string" && node.config.originResourceId.length > 0
          ? node.config.originResourceId
          : staticOriginId;

      return {
        ...node,
        config: {
          ...node.config,
          enabled: node.config.enabled ?? true,
          originResourceId,
          origin: node.config.origin ?? {
            domainName: `${originResourceId}.s3.amazonaws.com`,
            originId: "static-assets"
          },
          defaultCacheBehavior: node.config.defaultCacheBehavior ?? {
            allowedMethods: ["GET", "HEAD", "OPTIONS"],
            cachedMethods: ["GET", "HEAD"],
            targetOriginId: "static-assets",
            viewerProtocolPolicy: "redirect-to-https"
          },
          restrictions: node.config.restrictions ?? {
            geoRestriction: [{ restrictionType: "none" }]
          },
          viewerCertificate: node.config.viewerCertificate ?? {
            cloudfrontDefaultCertificate: true
          }
        }
      };
    }

    if (node.type === "RDS") {
      return {
        ...node,
        config: {
          ...node.config,
          allocatedStorage: node.config.allocatedStorage ?? 20,
          engine: node.config.engine ?? "postgres",
          instanceClass: node.config.instanceClass ?? "db.t4g.micro",
          username: node.config.username ?? "admin",
          password: node.config.password ?? "var.db_password",
          dbName: node.config.dbName ?? "appdb",
          publiclyAccessible: node.config.publiclyAccessible ?? false,
          storageEncrypted: node.config.storageEncrypted ?? true,
          storageType: node.config.storageType ?? "gp3",
          backupRetentionPeriod: node.config.backupRetentionPeriod ?? 7,
          deletionProtection: node.config.deletionProtection ?? true,
          skipFinalSnapshot: node.config.skipFinalSnapshot ?? false
        }
      };
    }

    if (node.type === "DYNAMODB_TABLE") {
      return {
        ...node,
        config: {
          ...node.config,
          name: node.config.name ?? "practice-board-data",
          billingMode: node.config.billingMode ?? "PAY_PER_REQUEST",
          hashKey: node.config.hashKey ?? "pk",
          rangeKey: node.config.rangeKey ?? "sk",
          attribute: node.config.attribute ?? [
            { name: "pk", type: "S" },
            { name: "sk", type: "S" }
          ]
        }
      };
    }

    return node;
  });

  return {
    ...architectureJson,
    nodes
  };
}

type ArchitectureDraftProgressReporter = {
  readonly reportCandidates: () => void;
};

async function reportFallbackDraftProgress(
  progressReporter: ArchitectureDraftProgressReporter,
  onProgress: ((snapshot: ArchitectureDraftProgressSnapshot) => void) | undefined
): Promise<void> {
  progressReporter.reportCandidates();
  if (onProgress !== undefined) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function createArchitectureDraftProgressReporter(
  request: CreateArchitectureDraftRequest,
  onProgress: ((snapshot: ArchitectureDraftProgressSnapshot) => void) | undefined
): ArchitectureDraftProgressReporter {
  let sequence = 0;
  let reported = false;

  function reportCandidates(): void {
    if (onProgress === undefined || reported) {
      return;
    }

    try {
      const provisionalArchitectureJson = structuredClone(
        createArchitectureDraft(request).architectureJson
      );
      const snapshot: ArchitectureDraftProgressSnapshot = {
        sequence: ++sequence,
        provisionalArchitectureJson,
        excludableCandidateIds: resolveExcludableCandidateIds(
          provisionalArchitectureJson
        )
      };

      reported = true;
      onProgress(snapshot);
    } catch {
      // Candidate reporting is observational and must never interrupt final generation.
    }
  }

  return { reportCandidates };
}

function readArchitectureDraftErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message.trim()
    : "Unknown deterministic validation error";
}

// 문자열 입력과 요청 객체를 자연어 prompt 전용 계약으로 맞춥니다.
function normalizeArchitectureDraftRequest(input: string | CreateArchitectureDraftRequest): CreateArchitectureDraftRequest {
  if (typeof input !== "string") {
    return input;
  }

  return {
    prompt: input
  };
}

function createAmazonQDraftResult(
  response: AmazonQArchitectureDraftPreview,
  providerMetadata: AiProviderMetadata
): AiArchitectureDraftResult {
  const title = createKoreanArchitectureDraftTitle(response.title, response.architectureJson);
  const highlights = createKoreanArchitectureDraftHighlights(
    response.highlights ?? response.explanations ?? [],
    response.architectureJson
  );
  const nextActions = [...(response.nextActions ?? [])].slice(0, 5);
  const llmExplanation: LlmExplanation = {
    target: ARCHITECTURE_DRAFT_TARGET,
    summary: createKoreanArchitectureDraftSummary(response.summary, title),
    highlights,
    nextActions,
    fallbackUsed: false,
    providerMetadata
  };

  return {
    architectureJson: response.architectureJson,
    title,
    metadata: {
      source: "amazon_q",
      confidence: "medium",
      assumptions: [...(response.assumptions ?? [])],
      explanations: [...(response.explanations ?? [])]
    },
    llmExplanation
  };
}

function createKoreanArchitectureDraftTitle(
  title: string,
  _architectureJson: ArchitectureJson
): string {
  const localizedArchitectureDraft = title
    .trim()
    .replace(/\bArchitecture\s+Draft\b/giu, "아키텍처 초안");

  return localizedArchitectureDraft || "클라우드 아키텍처 초안";
}

function createKoreanArchitectureDraftSummary(
  summary: string | undefined,
  localizedTitle: string
): string {
  const trimmedSummary = summary?.trim();
  if (
    trimmedSummary
    && !/\bArchitecture\s+Draft\b/iu.test(trimmedSummary)
    && (
      /[가-힣]/u.test(trimmedSummary)
      || !/[가-힣]/u.test(localizedTitle)
    )
  ) {
    return trimmedSummary;
  }

  return `${localizedTitle}을 생성했습니다.`;
}

function createKoreanArchitectureDraftHighlights(
  highlights: readonly string[],
  architectureJson: ArchitectureJson
): string[] {
  const localizedHighlights = highlights.flatMap((highlight) => {
    const trimmedHighlight = highlight.trim();
    const selectedPattern = trimmedHighlight.match(
      /^Verified pattern selected:\s*(.+?)\.?$/iu
    )?.[1];

    if (selectedPattern) {
      return [`검증된 아키텍처 패턴을 선택했습니다: ${selectedPattern}.`];
    }
    if (/^Security guardrail:/iu.test(trimmedHighlight)) {
      return [
        "보안 기준: 최소 권한 IAM, 지원되는 리소스의 프라이빗 배치, 저장 데이터 암호화, 비밀 관리형 자격 증명과 제한된 로그 보존 기간을 적용합니다."
      ];
    }
    if (/^Cost guardrail:/iu.test(trimmedHighlight)) {
      return [
        "비용 기준: 트래픽, 가용성, 보안 또는 명시적인 요구사항에 필요한 경우에만 이중화와 유료 보안 서비스를 추가합니다."
      ];
    }
    if (/^Terminate public traffic with an ACM-managed TLS certificate/iu.test(trimmedHighlight)) {
      return [
        "공개 트래픽은 ACM 관리형 TLS 인증서에서 종료하고 배포 전에 인증서를 검증합니다."
      ];
    }
    if (/[가-힣]/u.test(trimmedHighlight)) {
      return [trimmedHighlight];
    }

    return [];
  });

  if (localizedHighlights.length > 0) {
    return localizedHighlights.slice(0, 5);
  }

  const resourceTypes = [...new Set(architectureJson.nodes.map(({ type }) => type))].slice(0, 6);
  return [
    resourceTypes.length > 0
      ? `요구사항을 반영해 ${resourceTypes.join(", ")} 리소스 중심의 아키텍처를 구성했습니다.`
      : "입력한 요구사항을 반영해 클라우드 아키텍처를 구성했습니다."
  ];
}

function createFallbackArchitectureDraftResponse(
  request: CreateArchitectureDraftRequest,
  fallbackReason: LlmExplanationFallbackReason,
  billingMode: AiBillingMode
): AiArchitectureDraftResult {
  const draft = createArchitectureDraft(request);
  const llmExplanation = createArchitectureDraftFallbackExplanation(draft, fallbackReason);

  return {
    ...draft,
    llmExplanation: {
      ...llmExplanation,
      providerMetadata: createFallbackProviderMetadata(request, billingMode)
    }
  };
}

const REQUIRED_ARCHITECTURE_QUESTIONS: readonly RequiredArchitectureQuestion[] = [
  {
    id: "website_type",
    question: "어떤 종류의 웹사이트인가요?",
    suggestions: [
      "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)",
      "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)",
      "SPA (Single Page Application) (React/Vue 등)",
      "API 서버 (모바일 앱 백엔드)"
    ],
    isAnswered: isWebsiteTypeAnswered
  },
  {
    id: "traffic",
    question: "예상 트래픽 규모는?",
    suggestions: [
      "소규모 (일 100명 미만, 동시 10명 미만)",
      "중간 규모 (일 1,000명, 동시 50명)",
      "대규모 (일 10,000명 이상, 동시 500명 이상)",
      "급변동 (평상시 적지만 이벤트 시 급증)"
    ],
    isAnswered: isTrafficAnswered
  },
  {
    id: "database",
    question: "데이터베이스가 필요한가요?",
    suggestions: [
      "필요 없음 (정적 콘텐츠만)",
      "간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
      "중간 규모 데이터 (10GB ~ 100GB)",
      "대용량 데이터 (100GB 이상, 복잡한 쿼리)"
    ],
    isAnswered: isDatabaseAnswered
  },
  {
    id: "frontend",
    question: "프론트엔드 기술은?",
    suggestions: [
      "HTML/CSS/JS만 (순수 웹)",
      "React/Vue/Angular (SPA 프레임워크)",
      "Next.js/Nuxt.js (SSR 필요)",
      "모바일 앱 (웹뷰 또는 네이티브)"
    ],
    isAnswered: isFrontendAnswered
  },
  {
    id: "backend",
    question: "백엔드가 필요한가요?",
    suggestions: [
      "필요 없음 (정적 사이트)",
      "간단한 API (Node.js, Python Flask 등)",
      "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
      "마이크로서비스 (여러 서비스 분리)"
    ],
    isAnswered: isBackendAnswered
  },
  {
    id: "region",
    question: "주요 사용자 지역은?",
    suggestions: [
      "한국만 (서울 리전)",
      "아시아 태평양 (도쿄, 싱가포르 포함)",
      "글로벌 (미국, 유럽 포함)",
      "특정 지역 (중국, 일본 등)"
    ],
    isAnswered: isRegionAnswered
  },
  {
    id: "budget",
    question: "월 예산 범위는?",
    suggestions: [
      "10만원 미만 (최소 비용)",
      "10-50만원 (적당한 성능)",
      "50-200만원 (고성능)",
      "200만원 이상 (엔터프라이즈급)"
    ],
    isAnswered: isBudgetAnswered
  },
  {
    id: "ssl",
    question: "SSL 인증서(HTTPS)가 필요한가요?",
    suggestions: [
      "필수 (보안 중요)",
      "선택사항 (HTTP도 괜찮음)",
      "모르겠음 (추천해주세요)"
    ],
    isAnswered: isSslAnswered
  },
  {
    id: "file_upload",
    question: "파일 업로드 기능이 있나요? (이미지, 문서 등)",
    suggestions: [
      "없음 (텍스트만)",
      "이미지만 (프로필, 게시글 이미지)",
      "다양한 파일 (문서, 동영상 포함)",
      "대용량 파일 (100MB 이상)"
    ],
    isAnswered: isFileUploadAnswered
  },
  {
    id: "realtime",
    question: "실시간 기능이 필요한가요? (채팅, 알림 등)",
    suggestions: [
      "필요 없음",
      "실시간 채팅",
      "실시간 알림",
      "실시간 데이터 업데이트 (주식, 게임 등)"
    ],
    isAnswered: isRealtimeAnswered
  },
  {
    id: "management_preference",
    question: "관리 복잡도 선호도는?",
    suggestions: [
      "완전 관리형 (서버리스, 관리 최소화)",
      "반관리형 (일부 서버 관리)",
      "직접 관리 (서버 직접 운영)",
      "모르겠음 (추천해주세요)"
    ],
    isAnswered: isManagementPreferenceAnswered
  },
  {
    id: "page_loading_time",
    question: "페이지 로딩 시간 목표는?",
    suggestions: [
      "1초 이내 (매우 빠름)",
      "3초 이내 (적당함)",
      "5초 이내 (느려도 괜찮음)",
      "상관없음"
    ],
    isAnswered: isPageLoadingTimeAnswered
  },
  {
    id: "website_size",
    question: "전체 웹사이트 크기는?",
    suggestions: [
      "10MB 미만 (간단한 사이트)",
      "10MB-100MB (일반적인 사이트)",
      "100MB-1GB (이미지 많은 사이트)",
      "1GB 이상 (동영상 포함)"
    ],
    isAnswered: isWebsiteSizeAnswered
  },
  {
    id: "traffic_pattern",
    question: "트래픽 패턴은?",
    suggestions: [
      "일정함 (하루 종일 비슷)",
      "시간대별 차이 (낮에 많음)",
      "이벤트성 급증 (특정 시기에만)",
      "예측 불가"
    ],
    isAnswered: isTrafficPatternAnswered
  },
  {
    id: "downtime_tolerance",
    question: "서비스 중단 허용 시간은?",
    suggestions: [
      "절대 안됨 (99.99% 가용성)",
      "월 1시간 이내 (99.9% 가용성)",
      "월 8시간 이내 (99% 가용성)",
      "상관없음"
    ],
    isAnswered: isDowntimeToleranceAnswered
  }
];
function isWebsiteTypeAnswered(prompt: string): boolean {
  return (
    hasPromptTerm(prompt, ["static", "dynamic", "spa", "single page", "api server", "api 서버", "정적", "동적", "블로그", "포트폴리오", "회사", "소개", "쇼핑몰", "게시판", "회원", "?뺤쟻", "?숈쟻", "釉붾줈", "寃뚯떆", "?뚯썝"]) ||
    isMobileAppPrompt(prompt)
  );
}

function isMobileAppPrompt(prompt: string): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  return (
    /(?:mobile\s+app|app\s+store|play\s*store|google\s*play|모바일\s*앱|네이티브|웹뷰|플레이스토어|구글\s*플레이|앱\s*스토어)/iu.test(
      normalizedPrompt
    ) || hasStandaloneMobileAppCreationPrompt(normalizedPrompt)
  );
}

function hasStandaloneMobileAppCreationPrompt(normalizedPrompt: string): boolean {
  for (const match of normalizedPrompt.matchAll(/앱\s*하나/giu)) {
    const prefix = normalizedPrompt.slice(Math.max(0, match.index - 2), match.index).replace(/\s+/g, "");

    if (!prefix.endsWith("웹")) {
      return true;
    }
  }

  return false;
}

function isTrafficAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["traffic", "concurrent", "daily", "트래픽", "소규모", "중간 규모", "대규모", "급변동", "동시", "동접", "?몃옒", "?뚭퇋", "以묎컙", "?洹", "湲됰", "?숈떆", "?숈젒"]) || /\b(?:100|1,000|1000|10,000|10000|50|500)\b/iu.test(prompt);
}

function isDatabaseAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["database", " db", "rds", "postgres", "postgresql", "mysql", "dynamodb", "데이터베이스", "간단한 데이터", "중간 규모 데이터", "대용량 데이터", "정적 콘텐츠", "사용자 정보", "게시글", "?곗씠", "肄섑뀗", "寃뚯떆", "10gb", "100gb"]);
}

function isFrontendAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["frontend", "html", "css", "javascript", " js", "react", "vue", "angular", "next.js", "nuxt", "ssr", "프론트엔드", "순수 웹", "모바일", "웹뷰", "네이티브", "?꾨줎", "?쒖닔", "?밸럭"]);
}

function isBackendAnswered(prompt: string): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  if (resolveBackendProfile(normalizedPrompt) !== undefined) {
    return true;
  }

  return hasPromptTerm(prompt, ["backend", "api", "node.js", "nodejs", "python", "flask", "spring", "django", "microservice", "백엔드", "간단한 api", "복잡한 비즈니스", "마이크로서비스", "諛깆뿏", "媛꾨떒", "蹂듭옟", "留덉씠"]);
}

function isRegionAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["region", "korea", "seoul", "ap-northeast-2", "asia", "global", "worldwide", "us", "europe", "한국", "서울", "아시아", "태평양", "글로벌", "미국", "유럽", "중국", "일본", "?쒓뎅", "?쒖슱", "?꾩떆", "湲濡", "誘멸뎅", "?좊읇", "以묎뎅", "?쇰낯"]);
}

function isBudgetAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["budget", "cost", "krw", "usd", "monthly", "예산", "비용", "만원", "최소 비용", "적당한 성능", "고성능", "?덉궛", "鍮꾩슜", "留뚯썝", "理쒖냼", "怨좎꽦"]) || /\$\s*\d+|\b\d+\s*(?:usd|krw|monthly)\b/iu.test(prompt);
}

function isSslAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["ssl", "https", "http", "domain", "인증서", "보안", "선택사항", "?몄쬆", "蹂댁븞", "?좏깮"]);
}

function isFileUploadAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["file upload", "upload", "image", "document", "file", "100mb", "파일", "업로드", "이미지", "문서", "동영상", "텍스트만", "?뚯씪", "?낅줈", "?띿뒪?몃쭔", "?대?吏", "臾몄꽌", "?숈쁺"]);
}

function isRealtimeAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["realtime", "real-time", "chat", "notification", "websocket", "sse", "실시간", "채팅", "알림", "데이터 업데이트", "?ㅼ떆", "梨꾪똿", "?뚮┝", "?낅뜲"]);
}

function isManagementPreferenceAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["managed", "serverless", "management", "operations", "관리", "서버리스", "완전 관리형", "반관리형", "직접 관리", "愿由", "?쒕쾭由", "諛섍?由", "吏곸젒"]);
}

function isPageLoadingTimeAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["loading time", "loading", "로딩", "1초", "3초", "5초", "?섏씠吏", "濡쒕뵫", "1珥", "3珥", "5珥"]) || /\b[135]\s*seconds?\b/iu.test(prompt);
}

function isWebsiteSizeAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["10mb", "100mb", "1gb", "website size", "웹사이트 크기", "간단한 사이트", "일반적인 사이트", "이미지 많은", "동영상 포함", "?뱀궗?댄듃", "?ш린", "媛꾨떒", "?쇰컲", "?대?吏", "?숈쁺"]);
}

function isTrafficPatternAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["traffic pattern", "steady", "time of day", "event spike", "unpredictable", "트래픽 패턴", "일정함", "시간대별", "이벤트성", "예측 불가", "?몃옒", "?⑦꽩", "?쇱젙", "?쒓컙", "?대깽", "?덉륫"]);
}

function isDowntimeToleranceAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["downtime", "availability", "99.99", "99.9", "99%", "서비스 중단", "허용 시간", "절대 안됨", "가용성", "상관없음", "?쒕퉬", "以묐떒", "?덈?", "?곴??놁쓬"]);
}

function hasPromptTerm(prompt: string, terms: readonly string[]): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  return terms.some((term) => normalizedPrompt.includes(term.normalize("NFKC").toLowerCase()));
}

function createProviderClarificationQuestionId(question: string): string {
  let hash = 2_166_136_261;
  for (const character of question.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `amazon_q_follow_up_${(hash >>> 0).toString(36)}`;
}

function withAcceptedArchitectureClarificationAnswers(
  request: CreateArchitectureDraftRequest
): CreateArchitectureDraftRequest {
  const answers = request.clarificationAnswers;
  if (answers === undefined || answers.length === 0) return request;
  return {
    ...request,
    prompt: `${request.prompt}\n\nAccepted architecture clarification answers:\n${answers
      .map((answer) => `- ${answer.questionId}: ${formatAcceptedArchitectureClarificationAnswer(answer)}`)
      .join("\n")}`
  };
}

function formatAcceptedArchitectureClarificationAnswer(
  answer: NonNullable<CreateArchitectureDraftRequest["clarificationAnswers"]>[number]
): string {
  const trimmedAnswer = answer.answer.trim();
  const canonicalSuggestion = findCanonicalClarificationSuggestion(
    answer.questionId,
    trimmedAnswer
  );
  if (canonicalSuggestion !== undefined) return canonicalSuggestion;
  if (answer.questionId !== "budget") return trimmedAnswer;

  const monthlyBudgetManwon = resolveConversationalMonthlyBudgetManwon(trimmedAnswer);
  if (monthlyBudgetManwon === undefined || /(?:원|만원|krw|usd|달러)/iu.test(trimmedAnswer)) {
    return trimmedAnswer;
  }

  return `${trimmedAnswer} (월 ${monthlyBudgetManwon}만원으로 해석)`;
}

function findCanonicalClarificationSuggestion(
  questionId: string,
  answer: string
): string | undefined {
  const question = REQUIRED_ARCHITECTURE_QUESTIONS.find(({ id }) => id === questionId);
  if (question === undefined) return undefined;

  const normalizedAnswer = answer.normalize("NFKC").trim().toLowerCase();
  const exactSuggestion = question.suggestions.find(
    (suggestion) => suggestion.normalize("NFKC").trim().toLowerCase() === normalizedAnswer
  );
  if (exactSuggestion !== undefined) return exactSuggestion;

  if (questionId === "traffic") {
    const trafficProfile = resolveExplicitTrafficProfile(normalizedAnswer);
    if (trafficProfile !== undefined) {
      const profilePattern = trafficProfile === "small"
        ? /(?:small|소규모)/iu
        : trafficProfile === "medium"
          ? /(?:medium|중간\s*규모)/iu
          : /(?:large|대규모)/iu;
      return question.suggestions.find((suggestion) => profilePattern.test(suggestion));
    }
  }
  if (questionId === "backend" && /(?:spring\s*boot|스프링\s*부트|django|장고)/iu.test(normalizedAnswer)) {
    return question.suggestions.find((suggestion) =>
      /(?:complex\s*business|복잡한\s*비즈니스\s*로직)/iu.test(suggestion)
    );
  }
  if (questionId === "region" && /(?:hong\s*kong|홍콩)/iu.test(normalizedAnswer)) {
    return question.suggestions.find((suggestion) =>
      /(?:asia\s*pacific|아시아\s*태평양)/iu.test(suggestion)
    );
  }
  if (
    questionId === "website_size"
    && /(?:간단|단순)(?:한)?\s*(?:웹)?사이트/u.test(normalizedAnswer)
  ) {
    return question.suggestions.find((suggestion) => /10mb\s*미만/iu.test(suggestion));
  }
  if (
    (questionId === "file_upload" || questionId === "realtime")
    && isNaturalNegativeClarificationAnswer(normalizedAnswer)
  ) {
    return question.suggestions.find((suggestion) =>
      /^(?:없음|필요\s*없음)/u.test(suggestion)
    );
  }

  return undefined;
}

type MissingRequiredArchitectureQuestion = {
  readonly question: RequiredArchitectureQuestion;
  readonly invalidAnswer: boolean;
};

function findMissingRequiredQuestion(
  request: CreateArchitectureDraftRequest
): MissingRequiredArchitectureQuestion | null {
  if (hasExplicitArchitectureBrief(request.prompt)) return null;
  const answersByQuestionId = new Map(
    (request.clarificationAnswers ?? []).map((answer) => [answer.questionId, answer.answer])
  );
  for (const question of REQUIRED_ARCHITECTURE_QUESTIONS) {
    if (isRequiredArchitectureQuestionAnswered(question, request.prompt)) continue;
    const answer = answersByQuestionId.get(question.id);
    if (answer !== undefined && isClarificationAnswerValid(question, answer)) continue;
    return { question, invalidAnswer: answer !== undefined };
  }
  return null;
}

function isClarificationAnswerValid(
  question: RequiredArchitectureQuestion,
  answer: string
): boolean {
  const normalizedAnswer = answer.normalize("NFKC").trim().toLowerCase();
  if (normalizedAnswer.length === 0 || isClearlyUnrelatedClarificationAnswer(normalizedAnswer)) {
    return false;
  }
  if (question.suggestions.some(
    (suggestion) => suggestion.normalize("NFKC").trim().toLowerCase() === normalizedAnswer
  )) {
    return true;
  }
  if (isClarificationInformationRequest(normalizedAnswer)) {
    return false;
  }
  if (question.id === "backend") {
    return isBackendClarificationAnswerValid(normalizedAnswer);
  }
  switch (question.id) {
    case "website_type":
      return hasPromptTerm(normalizedAnswer, [
        "static", "dynamic", "single page", "spa", "api server", "api 서버",
        "정적", "동적", "블로그", "포트폴리오", "회사 소개", "웹 애플리케이션",
        "쇼핑", "커머스", "마켓", "포털", "검색", "커뮤니티", "소셜", "예약",
        "배달", "교육", "강의", "스트리밍", "대시보드", "관리자", "saas",
        "네이버", "쿠팡", "당근", "카카오", "유튜브"
      ]);
    case "traffic":
      return hasTrafficClarificationEvidence(normalizedAnswer);
    case "database":
      return isNaturalBooleanAnswer(normalizedAnswer) || hasPromptTerm(normalizedAnswer, [
        "database", "postgres", "postgresql", "mysql", "dynamodb", "rds", "db를", "db가",
        "데이터베이스", "사용자 정보", "회원가입", "회원 정보", "주문 내역", "결제 내역",
        "데이터 저장", "저장해야", "게시글"
      ]);
    case "ssl":
      return isNaturalBooleanAnswer(normalizedAnswer)
        || hasPromptTerm(normalizedAnswer, ["ssl", "https", "http", "인증서", "도메인"])
        || /보안(?:이|은|을| 때문에)?\s*(?:중요|필수|필요)/u.test(normalizedAnswer);
    case "file_upload":
      return isNaturalBooleanAnswer(normalizedAnswer)
        || hasPromptTerm(normalizedAnswer, [
          "file upload", "upload", "파일 업로드", "이미지 업로드", "문서 업로드", "동영상 업로드",
          "대용량 파일", "텍스트만", "프로필 사진", "사진을 올", "파일을 올", "문서를 올",
          "영상을 올", "첨부"
        ]);
    case "realtime":
      return isNaturalBooleanAnswer(normalizedAnswer)
        || hasPromptTerm(normalizedAnswer, ["realtime", "real-time", "실시간", "채팅", "알림", "websocket", "sse", "데이터 업데이트"]);
    case "frontend":
      return hasPromptTerm(normalizedAnswer, [
        "html", "css", "javascript", "react", "vue", "angular", "next.js", "nuxt",
        "리액트", "뷰", "앵귤러", "넥스트", "일반 웹", "순수 자바스크립트",
        "모바일 앱", "웹뷰", "네이티브"
      ]) || hasUncertainPreferenceAnswer(normalizedAnswer);
    case "region":
      return hasPromptTerm(normalizedAnswer, [
        "국내", "해외", "전 세계", "전세계", "가까운 곳", "한국", "서울", "일본", "도쿄",
        "싱가포르", "홍콩", "hong kong", "중국", "미국", "유럽", "아시아"
      ])
        || hasUncertainPreferenceAnswer(normalizedAnswer);
    case "budget":
      return hasBudgetClarificationEvidence(normalizedAnswer)
        || hasUncertainPreferenceAnswer(normalizedAnswer);
    case "management_preference":
      return hasPromptTerm(normalizedAnswer, [
        "managed", "serverless", "완전 관리", "반관리", "서버리스", "관리 맡",
        "운영 맡", "관리 신경", "운영 신경", "직접 관리", "직접 운영", "서버 직접"
      ]) || hasUncertainPreferenceAnswer(normalizedAnswer);
    case "page_loading_time":
      return hasPageLoadingClarificationEvidence(normalizedAnswer)
        || hasUncertainPreferenceAnswer(normalizedAnswer);
    case "website_size":
      return hasWebsiteSizeClarificationEvidence(normalizedAnswer)
        || hasUncertainPreferenceAnswer(normalizedAnswer);
    case "traffic_pattern":
      return hasPromptTerm(normalizedAnswer, [
        "traffic pattern", "steady", "time of day", "event spike", "unpredictable",
        "트래픽 패턴", "일정", "낮에", "낮 시간", "밤에", "저녁에", "주말",
        "이벤트", "특정 시기", "몰려", "예측 불가"
      ]) || hasUncertainPreferenceAnswer(normalizedAnswer);
    case "downtime_tolerance":
      return hasDowntimeClarificationEvidence(normalizedAnswer)
        || hasUncertainPreferenceAnswer(normalizedAnswer);
    default:
      return false;
  }
}

function hasTrafficClarificationEvidence(answer: string): boolean {
  return hasPromptTerm(answer, [
    "traffic", "concurrent", "daily", "트래픽", "소규모", "중간 규모", "대규모",
    "급변동", "동시 사용자", "동접", "방문자", "사용자가 적", "이용자가 적",
    "적게", "적은", "많지", "보통", "많은", "몰릴", "초기", "처음"
  ]) || /\d[\d,]*\s*(?:명|users?|visitors?|requests?)/iu.test(answer);
}

function hasBudgetClarificationEvidence(answer: string): boolean {
  return hasPromptTerm(answer, [
    "budget", "cost", "monthly", "예산", "비용", "월 비용", "저렴", "싸게",
    "최소 비용", "넉넉한 예산", "비용은 보통", "적당한 비용"
  ])
    || /(?:\$\s*\d|\d[\d,.]*\s*(?:원|만원|달러|usd|krw))/iu.test(answer)
    || resolveConversationalMonthlyBudgetManwon(answer) !== undefined;
}

function resolveConversationalMonthlyBudgetManwon(answer: string): number | undefined {
  const normalizedAnswer = answer.normalize("NFKC").toLowerCase();
  const monthlyAmountPattern = /(?:한\s*달|매달|매월|월간|월)(?:에|마다)?(?:\s*(?:예산|비용)(?:은|이|을|으로)?)?\s*(?:약|한)?\s*(\d+(?:[,.]\d+)?)/giu;

  for (const match of normalizedAnswer.matchAll(monthlyAmountPattern)) {
    if (match.index === undefined) continue;
    const amountText = match[1];
    if (amountText === undefined) continue;
    const trailingText = normalizedAnswer.slice(match.index + match[0].length);
    if (/^\s*(?:명|사용자|시간|분|초|일|회|건|gb|mb|tb|%|퍼센트)/iu.test(trailingText)) {
      continue;
    }

    const amount = Number(amountText.replaceAll(",", ""));
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }

  return undefined;
}

function hasPageLoadingClarificationEvidence(answer: string): boolean {
  return hasPromptTerm(answer, [
    "loading", "load time", "로딩", "페이지 속도", "페이지가 빠", "빠르게 열",
    "빨랐", "느려도", "즉시 열"
  ]) || /\d+(?:\.\d+)?\s*(?:초|seconds?|ms|milliseconds?)(?:\s*이내)?/iu.test(answer);
}

function hasWebsiteSizeClarificationEvidence(answer: string): boolean {
  return hasPromptTerm(answer, [
    "website size", "site size", "웹사이트 크기", "사이트 크기", "사이트 용량",
    "콘텐츠 용량", "작은 사이트", "간단한 사이트", "간단한 웹사이트", "단순한 사이트",
    "크지 않은 사이트", "이미지가 많", "사진이 많",
    "동영상이 많", "영상이 많", "콘텐츠가 많"
  ]) || /\d+(?:\.\d+)?\s*(?:kb|mb|gb|tb)\b/iu.test(answer);
}

function hasDowntimeClarificationEvidence(answer: string): boolean {
  return hasPromptTerm(answer, [
    "downtime", "availability", "서비스 중단", "중단 허용", "가용성", "무중단",
    "중단되면 안", "중단되면 큰일", "잠깐 중단", "중단돼도", "중단되어도"
  ]) || /(?:99(?:\.\d+)?\s*%|(?:월|한 달)\s*\d+\s*시간)/u.test(answer);
}

function isClarificationInformationRequest(answer: string): boolean {
  return /(?:무엇인지|뭐야|뭔지|무슨 뜻|설명(?:해|해줘|해주세요)|알려\s*(?:줘|주세요)|what\s+is|tell\s+me|explain)/iu.test(answer);
}
function isBackendClarificationAnswerValid(answer: string): boolean {
  if (hasUncertainPreferenceAnswer(answer)) {
    return true;
  }

  if (/(?:무엇인지|뭐야|뭔지|알려 *줘|설명해|what +is|tell +me|explain)/iu.test(answer)) {
    return false;
  }

  if (isNaturalBooleanAnswer(answer)) {
    return true;
  }

  if (hasPromptTerm(answer, [
    "no backend",
    "backend not required",
    "static site",
    "simple api",
    "complex business logic",
    "microservice",
    "node.js",
    "nodejs",
    "python flask",
    "spring boot",
    "스프링 boot",
    "스프링 부트",
    "스프링부트",
    "django",
    "백엔드 필요 없음",
    "정적 사이트",
    "간단한 api",
    "복잡한 비즈니스 로직",
    "마이크로서비스"
  ])) {
    return true;
  }

  const hasBackendSubject = hasPromptTerm(answer, ["backend", "api", "server", "백엔드", "서버"]);
  const hasBackendDecision = /(?:필요|사용|쓰|선택|구현|만들|넣|빼|제외|없이|원해|해 *줘)/u.test(answer);
  return hasBackendSubject && hasBackendDecision;
}

function isNaturalBooleanAnswer(answer: string): boolean {
  return /^(?:(?:네|예|응|맞아|맞아요)(?:[\s,.!]|$)|(?:아니|아니요)(?:[\s,.!]|$)|(?:필요(?:해|해요|합니다|하지\s*않(?:아|아요)?|없(?:어|어요)?)|안\s*필요(?:해|해요)?|없어|없어요|있어|있어요|있음|없음)(?:[\s,.!]|$))/u.test(answer)
    || hasUncertainPreferenceAnswer(answer);
}

function isNaturalNegativeClarificationAnswer(answer: string): boolean {
  return /^(?:(?:아니|아니요)|(?:필요\s*)?없(?:어|어요|음)|안\s*필요(?:해|해요)?)(?:[\s,.!]|$)/u.test(answer);
}

function hasUncertainPreferenceAnswer(answer: string): boolean {
  return /^(?:(?:잘\s*)?모르겠|추천(?:해\s*줘|해주세요|해줘)?|상관\s*없|아무거나)(?:[\s,.!]|$)/u.test(answer);
}

function isClearlyUnrelatedClarificationAnswer(answer: string): boolean {
  return hasPromptTerm(answer, ["김치찌개", "된장찌개", "부대찌개", "날씨", "점심 메뉴"]);
}


function findConditionalArchitectureQuestion(prompt: string): RequiredArchitectureQuestion | null {
  if (hasExplicitArchitectureBrief(prompt)) {
    return null;
  }

  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  if (hasBudgetAvailabilityConflict(normalizedPrompt) && !hasBudgetAvailabilityResolution(normalizedPrompt)) {
    return {
      id: "budget_availability_tradeoff",
      question: "월 $100 예산과 99.99% 가용성은 충돌할 수 있습니다. 어떤 기준으로 설계할까요?",
      suggestions: [
        "월 $100 예산을 유지하고 99.9% 수준으로 완화",
        "99.99% 가용성을 우선하고 예산 초과 허용",
        "목표 아키텍처는 99.99%로 그리고 비용 초과 경고 표시"
      ],
      isAnswered: () => true
    };
  }

  if (requiresGlobalDeploymentScopeDecision(normalizedPrompt) && !hasGlobalDeploymentDecision(normalizedPrompt)) {
    return {
      id: "global_deployment_scope",
      question: "글로벌 사용자와 1초 로딩 목표를 어떤 범위로 설계할까요?",
      suggestions: [
        "CloudFront 글로벌 + API/RDS는 단일 리전",
        "다중 리전 API까지 포함",
        "MVP는 단일 리전, 추후 다중 리전 확장 경고 표시"
      ],
      isAnswered: () => true
    };
  }

  if (
    hasUnsupportedMultiRegionExecutionRequest(normalizedPrompt) &&
    !hasMultiRegionExecutionBoundaryResolution(normalizedPrompt)
  ) {
    return {
      id: "multi_region_execution_boundary",
      question: "현재 Terraform Preview와 배포 실행은 단일 AWS 리전만 지원합니다. 어떤 지원 범위로 생성할까요?",
      suggestions: [
        "지원 범위: CloudFront 글로벌 + API/RDS 단일 리전으로 생성",
        "지원 범위: 단일 리전 MVP + 다중 리전 확장 경고 표시",
        "지원 범위: 다중 리전은 별도 설계 작업으로 전환"
      ],
      isAnswered: () => true
    };
  }

  if (requiresRealtime(normalizedPrompt) && !hasRealtimeImplementationDecision(normalizedPrompt)) {
    const realtimeProfile = resolveRealtimeProfile(normalizedPrompt);

    return {
      id: "realtime_implementation",
      question:
        realtimeProfile === "chat"
          ? "실시간 채팅 연결은 어떤 방식으로 표현할까요?"
          : "실시간 알림은 어떤 방식으로 표현할까요?",
      suggestions:
        realtimeProfile === "chat"
          ? [
              "WebSocket 양방향 연결 경로",
              "HTTP 메시지 전송 + SSE 수신 경로",
              "간단 폴링 방식과 비용 절감 경고"
            ]
          : [
              "WebSocket 연결 경로",
              "SSE 단방향 알림 경로",
              "간단 폴링 방식과 비용 절감 경고"
            ],
      isAnswered: () => true
    };
  }

  return null;
}

function isRequiredArchitectureQuestionAnswered(question: RequiredArchitectureQuestion, prompt: string): boolean {
  if (question.isAnswered(prompt)) {
    return true;
  }

  if (question.id === "traffic_pattern") {
    return /(traffic\s*pattern|steady|time\s*of\s*day|event\s*spike|unpredictable)/i.test(prompt);
  }

  return false;
}

function createArchitectureDraftClarification(
  question: RequiredArchitectureQuestion,
  request: CreateArchitectureDraftRequest,
  billingMode: AiBillingMode,
  invalidAnswer = false
): ArchitectureDraftClarification {
  return {
    status: "needs_clarification",
    question: question.question,
    questionId: question.id,
    suggestions: question.suggestions,
    ...(invalidAnswer
      ? {
          validationMessage:
            "입력하신 답변이 현재 질문과 관련이 없어 반영하지 않았어요. 질문에 맞게 다시 답해주세요."
        }
      : {}),
    providerMetadata: createFallbackProviderMetadata(request, billingMode)
  };
}

function createArchitectureDecisionSpace(prompt: string): ArchitectureDecisionSpace {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const answerProfile = createArchitectureAnswerProfile(normalizedPrompt);

  return {
    answerProfile,
    hardConstraints: createArchitectureHardConstraints(answerProfile, normalizedPrompt),
    preferredPatterns: createPreferredArchitecturePatterns(answerProfile, normalizedPrompt),
    discouragedPatterns: createDiscouragedArchitecturePatterns(answerProfile),
    evaluationCriteria: createArchitectureEvaluationCriteria(answerProfile),
    unsupportedSubstitutions: createUnsupportedSubstitutions(answerProfile, normalizedPrompt),
    coverageRequirements: createArchitectureCoverageRequirements(answerProfile, normalizedPrompt)
  };
}

function createArchitectureAnswerProfile(normalizedPrompt: string): ArchitectureAnswerProfile {
  return {
    traffic: resolveTrafficProfile(normalizedPrompt),
    frontend: resolveFrontendProfile(normalizedPrompt),
    backend: resolveBackendProfile(normalizedPrompt),
    region: resolveRegionProfile(normalizedPrompt),
    upload: resolveUploadProfile(normalizedPrompt),
    realtime: resolveRealtimeProfile(normalizedPrompt),
    management: resolveManagementProfile(normalizedPrompt),
    latency: resolveLatencyProfile(normalizedPrompt),
    availability: resolveAvailabilityProfile(normalizedPrompt),
    budget: resolveBudgetProfile(normalizedPrompt)
  };
}

function createArchitectureHardConstraints(answerProfile: ArchitectureAnswerProfile, normalizedPrompt: string): string[] {
  const constraints: string[] = [];

  if (answerProfile.backend === "none") {
    constraints.push(
      "Backend not required: forbid backend-only EC2, LAMBDA, API_GATEWAY_REST_API, LOAD_BALANCER, and LOAD_BALANCER_LISTENER unless another explicit accepted answer creates an API requirement."
    );
  }

  if (requiresNoDatabase(normalizedPrompt)) {
    constraints.push("Database not required: forbid RDS, DB_SUBNET_GROUP, and database-specific labels/config.");
  }

  if (answerProfile.upload === "none") {
    constraints.push(
      "File upload not required: forbid upload/media/presigned/file-processing resources, labels, flows, and upload-specific IAM paths."
    );
  }

  if (answerProfile.realtime === "none") {
    constraints.push(
      "Realtime not required: forbid WebSocket, SSE, realtime notification, chat, push, SNS, SQS, EventBridge, and notification-path labels/coverage."
    );
  }

  if (answerProfile.region === "korea") {
    constraints.push("Korea-only scope: forbid multi-region API/RDS wording or topology; CloudFront may be used only for static or CDN acceleration assumptions.");
  }

  if (hasCostSensitiveAvailabilityConflict(normalizedPrompt)) {
    constraints.push("Cost-sensitive budget and high-availability or microservices conflict: do not claim both are satisfied without explicit cost-warning coverage.");
  }

  return constraints;
}

function createPreferredArchitecturePatterns(
  answerProfile: ArchitectureAnswerProfile,
  normalizedPrompt: string
): ArchitectureDecisionPattern[] {
  const patterns: ArchitectureDecisionPattern[] = [];

  if (answerProfile.backend === "none" || answerProfile.frontend === "static") {
    patterns.push({
      id: "static_cdn_site",
      when: "Use for static or mostly static websites with no accepted backend/database requirement.",
      typicalNodeTypes: ["S3", "CLOUDFRONT", "ROUTE53_RECORD"],
      tradeoffs: ["Low operational burden and cost.", "Dynamic behavior needs a separate API pattern."]
    });
  }

  if (answerProfile.frontend === "spa" && answerProfile.backend === "simple_api") {
    patterns.push({
      id: "spa_with_serverless_api",
      when: "Use when SPA delivery needs a small managed API and low operational burden.",
      typicalNodeTypes: ["S3", "CLOUDFRONT", "API_GATEWAY_REST_API", "LAMBDA", "IAM_ROLE", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Simple scaling and lower operations.", "Long-running or complex backend logic may need a different runtime pattern."]
    });
  }

  if (answerProfile.backend === "microservices" && (answerProfile.management === "fully_managed" || answerProfile.management === "semi_managed")) {
    patterns.push({
      id: "ecs_fargate_microservices",
      when: "Use when microservices need separated deployable services with managed container operations.",
      typicalNodeTypes: ["VPC", "SUBNET", "SECURITY_GROUP", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "ECS_CLUSTER", "ECS_SERVICE", "ECS_TASK_DEFINITION", "ECR_REPOSITORY", "APPLICATION_AUTO_SCALING_TARGET", "APPLICATION_AUTO_SCALING_POLICY"],
      tradeoffs: ["Separates service ownership and scaling without EC2 capacity management.", "Multiple services, target groups, and scaling policies raise cost and diagram complexity."]
    });
  } else if (answerProfile.backend === "complex" || answerProfile.backend === "microservices") {
    patterns.push({
      id: "load_balanced_app_tier",
      when: "Use when backend logic, traffic, or availability makes an explicit app entry and runtime tier useful.",
      typicalNodeTypes: ["VPC", "SUBNET", "SECURITY_GROUP", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "EC2", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Clearer operational control and scaling path.", "Higher cost and operational burden than serverless/simple API patterns."]
    });
  }

  if (!requiresNoDatabase(normalizedPrompt) && answerProfile.backend !== "none") {
    patterns.push({
      id: "managed_relational_data",
      when: "Use when accepted answers require relational or durable application data.",
      typicalNodeTypes: ["RDS", "DB_SUBNET_GROUP", "KMS_KEY", "CLOUDWATCH_METRIC_ALARM"],
      tradeoffs: ["Managed persistence and backup posture.", "RDS and Multi-AZ can dominate low-budget designs."]
    });
  }

  if (answerProfile.region === "global" || answerProfile.latency === "one_second") {
    patterns.push({
      id: "global_static_delivery_single_region_api",
      when: "Use when users are global or latency-sensitive but API/database can remain in one region with a clear warning.",
      typicalNodeTypes: ["CLOUDFRONT", "ROUTE53_RECORD", "S3", "LOAD_BALANCER", "API_GATEWAY_REST_API"],
      tradeoffs: ["Fast static/media delivery.", "Single-region API/RDS latency must be disclosed for distant users."]
    });
  }

  if (answerProfile.availability === "99.99") {
    patterns.push({
      id: "high_availability_multi_az_target",
      when: "Use when the accepted availability target is 99.99% or no-downtime.",
      typicalNodeTypes: ["SUBNET", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "EC2", "RDS", "DB_SUBNET_GROUP", "CLOUDWATCH_METRIC_ALARM"],
      tradeoffs: ["Better redundancy and failure isolation.", "May conflict with low budgets and needs explicit cost-warning coverage."]
    });
  }

  if (answerProfile.upload && answerProfile.upload !== "none") {
    patterns.push({
      id: "direct_media_upload",
      when: "Use when accepted answers include image, mixed, or large file upload.",
      typicalNodeTypes: ["S3", "IAM_ROLE", "IAM_POLICY", "KMS_KEY", "CLOUDFRONT"],
      tradeoffs: ["Avoids proxying large files through app compute.", "Requires clear object access, lifecycle, and validation assumptions."]
    });
  }

  if (answerProfile.realtime && answerProfile.realtime !== "none") {
    patterns.push({
      id: "supported_realtime_notification_path",
      when: "Use when accepted answers include chat, notifications, or data updates.",
      typicalNodeTypes: ["API_GATEWAY_REST_API", "LAMBDA", "EC2", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Represents realtime capability with supported nodes.", "Dedicated WebSocket/SNS/SQS/EventBridge nodes require future ResourceType expansion."]
    });
  }

  if (patterns.length === 0) {
    patterns.push({
      id: "minimal_reviewable_architecture",
      when: "Use when requirements are complete but do not strongly select a specialized pattern.",
      typicalNodeTypes: ["S3", "CLOUDFRONT", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Keeps the draft concise and reviewable.", "May need follow-up before Terraform/deployment handoff."]
    });
  }

  return patterns;
}

function createDiscouragedArchitecturePatterns(answerProfile: ArchitectureAnswerProfile): {
  readonly id: string;
  readonly reason: string;
}[] {
  const patterns: { readonly id: string; readonly reason: string }[] = [];

  if (answerProfile.budget === "low") {
    patterns.push({
      id: "enterprise_resilience_by_default",
      reason: "Low-budget answers should not silently add expensive HA/global patterns unless availability or latency explicitly requires them."
    });
  }

  if (answerProfile.management === "fully_managed") {
    patterns.push({
      id: "self_managed_ec2_first",
      reason: "Fully managed preference should lower the priority of manually operated EC2-first designs when a supported managed pattern can satisfy the same capability."
    });
  }

  if (answerProfile.region === "korea") {
    patterns.push({
      id: "multi_region_api_database",
      reason: "Korea-only scope makes multi-region API/database topology inappropriate unless the user changes the region requirement."
    });
  }

  if (answerProfile.upload === "none") {
    patterns.push({
      id: "media_upload_pipeline",
      reason: "The user selected no file upload, so upload/media/presigned-file patterns must not be selected."
    });
  }

  if (answerProfile.realtime === "none") {
    patterns.push({
      id: "realtime_notification_stack",
      reason: "The user selected no realtime feature, so notification/chat/update-stream patterns must not be selected."
    });
  }

  return patterns;
}

function createArchitectureEvaluationCriteria(answerProfile: ArchitectureAnswerProfile): string[] {
  const criteria = ["cost", "availability", "latency", "operational burden", "diagram clarity", "supported ResourceType"];

  if (answerProfile.budget === "low") {
    criteria.push("budget conflict visibility");
  }

  if (answerProfile.region === "global" || answerProfile.latency === "one_second") {
    criteria.push("global/static delivery signal", "single-region API latency warning when applicable");
  }

  if (answerProfile.availability === "99.99") {
    criteria.push("redundancy and high-availability signal");
  }

  if (answerProfile.upload && answerProfile.upload !== "none") {
    criteria.push("upload/media capability signal");
  }

  if (answerProfile.realtime && answerProfile.realtime !== "none") {
    criteria.push("notification/realtime capability signal");
  }

  return criteria;
}

function createUnsupportedSubstitutions(
  _answerProfile: ArchitectureAnswerProfile,
  _normalizedPrompt: string
): UnsupportedSubstitution[] {
  return [];
}

function createArchitectureCoverageRequirements(
  answerProfile: ArchitectureAnswerProfile,
  normalizedPrompt: string
): string[] {
  const requirements = [
    "Record selectedPattern id and why it was chosen.",
    "Record rejectedPatterns or lower-priority patterns with short reasons.",
    "Map every selected answer to a capability signal and node ids when a node represents that capability.",
    "Record unsupported substitutions and limitations when a requested service cannot be drawn directly."
  ];

  if (answerProfile.frontend === "spa" || answerProfile.frontend === "static") {
    requirements.push("Frontend/static delivery coverage must explain how users receive the site or app shell.");
  }

  if (answerProfile.backend && answerProfile.backend !== "none") {
    requirements.push("Backend/API coverage must explain the request entry path and runtime choice.");
  }

  if (!requiresNoDatabase(normalizedPrompt) && answerProfile.backend !== "none") {
    requirements.push("Data persistence coverage must explain database/storage assumptions or explicitly say why durable storage is not selected.");
  }

  if (answerProfile.upload && answerProfile.upload !== "none") {
    requirements.push("Upload/media coverage must mention direct upload, media storage, validation, lifecycle, or the chosen supported substitute.");
  }

  if (answerProfile.realtime && answerProfile.realtime !== "none") {
    requirements.push("Realtime/notification coverage must mention WebSocket, SSE, notification, polling, or the chosen supported substitute.");
  }

  if (answerProfile.region === "global" || answerProfile.latency === "one_second") {
    requirements.push("Global/latency coverage must mention global/static delivery or warn about single-region API/database latency.");
  }

  if (answerProfile.availability === "99.99") {
    requirements.push("High-availability coverage must mention redundancy, Multi-AZ, failover, or another explicit availability trade-off.");
  }

  if (hasCostSensitiveAvailabilityConflict(normalizedPrompt)) {
    requirements.push("Cost-warning coverage must mention the budget versus high-availability, Multi-AZ, or microservices cost risk.");
  }

  return requirements;
}

function createAmazonQArchitectureDraftInstructions(): string {
  return [
    "You are Amazon Q assisting SketchCatch, an IaC operations service.",
    "Return JSON only. Do not wrap the response in markdown.",
    "Write every user-facing string in Korean, including title, question, suggestions, summary, highlights, nextActions, assumptions, explanations, and requirementCoverage prose.",
    "Technical identifiers and AWS service names may remain in English, but explanatory sentences must be Korean.",
    "Choose a cost- and security-conscious Practice Architecture from the provided ArchitectureDecisionSpace.",
    "SketchCatch is provider-neutral, AWS-first for the MVP, and Terraform-first.",
    "Do not perform deployment, apply, update, delete, or destroy actions.",
    "All architecture changes must remain user-accepted previews.",
    `Use only these ResourceNode.type values: ${SUPPORTED_RESOURCE_TYPES.join(", ")}.`,
    "The visible left resource panel is represented by supportedResourceCatalog. When the user asks for a specific panel Terraform resource, create a ResourceNode whose type is the catalog nodeType and include config.terraformResourceType with the catalog terraformResourceType. Include config.terraformBlockType when terraformBlockType is data.",
    "Use the persistent compact AWS/Terraform referenceKnowledge payload as design precedent. Do not request or quote the full source documents; apply the compact guidance only when it fits the user's selected constraints.",
    "The ArchitectureDecisionSpace is not a fixed skeleton. hardConstraints are binding only for explicit none choices or clear contradictions; preferredPatterns are candidate patterns you may choose, adapt, or combine.",
    "Select the preferredPattern that best fits the answerProfile and evaluationCriteria. If you choose a lower-priority or combined pattern, explain why in requirementCoverage.",
    "Record the selected pattern id, rejected pattern ids, and trade-off rationale in requirementCoverage, assumptions, highlights, or nextActions.",
    "Use evaluationCriteria and coverageRequirements as capability signals. Do not force a specific resource solely to make diagrams look different.",
    "Use unsupportedSubstitutions when a requested AWS service has no supported ResourceNode.type. Do not invent unsupported ResourceNode.type values.",
    "Do not artificially limit the architecture to one resource per type. If the selected pattern justifies it, use multiple EC2, SUBNET, S3, or other supported resources.",
    "Layout rules: VPC and SUBNET nodes are area boxes. SECURITY_GROUP nodes are regular VPC-scoped resource icons, not containers. Nodes related by contains/hosts edges or config references such as vpcId or subnetId must be fully inside their parent area box. Workload placement must prioritize subnetId or explicit subnet references over securityGroupIds or vpcSecurityGroupIds.",
    "Unrelated area boxes must not overlap. If an area belongs inside another area, place it fully inside and include the containment relationship. Boundary resources such as INTERNET_GATEWAY may sit on an area edge, but must not float half-overlapping unrelated areas.",
    "Keep diagram labels readable: non-area nodes must be spaced generously so icons, node labels, and edge labels do not overlap or crowd each other. Prefer at least 240px horizontal spacing or 150px vertical spacing between separate non-area resources.",
    "Layering and edge routing rules: list area/container nodes before their children so containers render behind resources, and do not route visible arrows through unrelated resources or place unrelated resources between connected nodes.",
    "If required information is missing, return a needs_clarification response with exactly one question.",
    "Do not include secrets, account IDs, credentials, ARNs, or private tokens.",
    "Before finalizing the diagram, derive selected capabilities from every answered clarification choice. The architectureJson must visibly satisfy those capabilities, not only mention them in prose.",
    "Every preview response must include requirementCoverage. Each entry must name the selected answer, whether it is satisfied, the capability it drives, the node ids that satisfy it, and any assumption or trade-off.",
    "If a selected answer cannot be represented with supported ResourceNode.type values, represent the closest supported topology and explain the limitation in requirementCoverage and assumptions.",
    "The preview JSON shape is:",
    '{"status":"preview","title":"string","architectureJson":{"nodes":[{"id":"string","type":"S3","label":"string","positionX":0,"positionY":0,"config":{}}],"edges":[{"id":"string","sourceId":"string","targetId":"string","label":"string"}]},"requirementCoverage":[{"answer":"string","status":"satisfied","capability":"string","nodes":["node-id"],"assumption":"string"}],"assumptions":["string"],"explanations":["string"],"summary":"string","highlights":["string"],"nextActions":["string"]}',
    "The clarification JSON shape is:",
    '{"status":"needs_clarification","question":"string","suggestions":["string"]}'
  ].join("\n");
}

// 최초 Architecture Draft 요청에 고정 Template과 사용자 요구를 함께 구성합니다.
function createAmazonQArchitectureDraftPrompt(
  prompt: string,
  architectureDecisionSpace: ArchitectureDecisionSpace,
  normalizedRequirement: ArchitectureIntentPlan | null,
  fixedTemplateSelection: FixedTemplateSelection | null,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    createAwsArchitectureReferenceKnowledgePrompt(),
    createAmazonQArchitectureBrief(prompt),
    createNormalizedArchitectureIntentPlanPromptSection(normalizedRequirement),
    "Supported resource panel catalog:",
    JSON.stringify(SUPPORTED_RESOURCE_CATALOG, null, 2),
    "ArchitectureDecisionSpace:",
    JSON.stringify(architectureDecisionSpace, null, 2),
    createFixedTemplateSelectionPrompt(fixedTemplateSelection),
    createCandidateExclusionPromptSection(candidateExclusions),
    "User requirement prompt:",
    prompt
  ].join("\n\n");
}

function createAmazonQRequirementConflictInstructions(): string {
  return [
    "You are Amazon Q diagnosing why SketchCatch could not produce a valid architecture.",
    "Return JSON only in the needs_clarification shape. Do not wrap the response in markdown.",
    "Write every user-facing string in Korean. AWS service names and technical identifiers may remain in English.",
    "Use only the supplied original requirement, accepted answers, and SketchCatch validation issues as evidence.",
    "Do not invent a conflict or decide which requirement to discard on the user's behalf.",
    "Explain the concrete requirements that conflict, or explicitly say when the evidence only proves an implementation or representation failure rather than a logical conflict.",
    "Ask exactly one question that lets the user choose which requirement to preserve.",
    "Return 2 to 4 suggestions. Each suggestion must state what will be preserved and what will be relaxed or retried.",
    "Do not generate an architecture, plan, deployment action, or explanatory fields outside the clarification shape.",
    'The required JSON shape is: {"status":"needs_clarification","question":"string","suggestions":["string"]}'
  ].join("\n");
}

function createAmazonQRequirementConflictPrompt(
  prompt: string,
  architectureDecisionSpace: ArchitectureDecisionSpace,
  normalizedRequirement: ArchitectureIntentPlan | null,
  fixedTemplateSelection: FixedTemplateSelection | null,
  validationIssues: readonly string[]
): string {
  return [
    createAmazonQRequirementConflictInstructions(),
    "Original user requirement prompt:",
    prompt,
    createNormalizedArchitectureIntentPlanPromptSection(normalizedRequirement),
    "ArchitectureDecisionSpace:",
    JSON.stringify(architectureDecisionSpace, null, 2),
    createFixedTemplateSelectionPrompt(fixedTemplateSelection),
    "SketchCatch validation issues from the failed architecture attempts:",
    ...validationIssues.map((issue) => `- ${issue}`)
  ].join("\n\n");
}

// 재생성 요청에서도 고정 Template 경계가 사라지지 않도록 같은 선택을 반복합니다.
function createAmazonQArchitectureDraftRepairPrompt(
  prompt: string,
  architectureDecisionSpace: ArchitectureDecisionSpace,
  normalizedRequirement: ArchitectureIntentPlan | null,
  fixedTemplateSelection: FixedTemplateSelection | null,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined,
  validationIssues: readonly string[],
  previousArchitectureJson: ArchitectureJson
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    "The previous preview failed SketchCatch self-validation.",
    "Regenerate the full Architecture Draft JSON. Do not patch partially.",
    "Do not return the same topology. Add or remove nodes and edges needed to satisfy the failed requirement coverage checks.",
    "The regenerated response must include requirementCoverage entries proving how every selected answer is represented.",
    createAwsArchitectureReferenceKnowledgePrompt(),
    createAmazonQArchitectureBrief(prompt),
    createNormalizedArchitectureIntentPlanPromptSection(normalizedRequirement),
    "ArchitectureDecisionSpace:",
    JSON.stringify(architectureDecisionSpace, null, 2),
    createFixedTemplateSelectionPrompt(fixedTemplateSelection),
    createCandidateExclusionPromptSection(candidateExclusions),
    "Validation issues:",
    ...validationIssues.map((issue) => `- ${issue}`),
    "Original user requirement prompt:",
    prompt,
    "Previous invalid architectureJson:",
    JSON.stringify(previousArchitectureJson)
  ].join("\n\n");
}

function createAmazonQArchitecturePlanRepairPrompt(
  prompt: string,
  architectureDecisionSpace: ArchitectureDecisionSpace,
  normalizedRequirement: ArchitectureIntentPlan | null,
  fixedTemplateSelection: FixedTemplateSelection | null,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined,
  validationIssues: readonly string[],
  previousPlan: Record<string, unknown>
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    "The previous compact architecture plan failed deterministic SketchCatch materialization validation.",
    "Return a complete corrected plan JSON. Do not return a preview and do not repeat the invalid plan.",
    createAmazonQArchitectureBrief(prompt),
    createNormalizedArchitectureIntentPlanPromptSection(normalizedRequirement),
    "ArchitectureDecisionSpace:",
    JSON.stringify(architectureDecisionSpace, null, 2),
    createFixedTemplateSelectionPrompt(fixedTemplateSelection),
    createCandidateExclusionPromptSection(candidateExclusions),
    "Validation issues:",
    ...validationIssues.map((issue) => `- ${issue}`),
    "Previous invalid plan:",
    JSON.stringify(previousPlan),
    "Original user requirement prompt:",
    prompt
  ].join("\n\n");
}

function createCandidateExclusionPromptSection(
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined
): string {
  if (candidateExclusions === undefined || candidateExclusions.length === 0) {
    return "";
  }

  return [
    "Server-authorized Draft Candidate Exclusions:",
    "These exclusions are binding and supersede matching earlier resource requirements.",
    "Do not include any ResourceNode whose type matches an excluded candidate. Choose a valid alternative topology or return needs_clarification when no valid alternative exists.",
    JSON.stringify(candidateExclusions, null, 2)
  ].join("\n");
}

function createNormalizedArchitectureIntentPlanPromptSection(
  normalizedRequirement: ArchitectureIntentPlan | null
): string {
  if (normalizedRequirement === null) {
    return "";
  }

  const briefLines = (normalizedRequirement.amazonQBrief ?? []).map((line) => `- ${line}`);

  return [
    "Normalized Architecture Intent Plan:",
    JSON.stringify(normalizedRequirement, null, 2),
    ...(briefLines.length === 0 ? [] : ["Normalizer-to-Amazon-Q imperative brief:", ...briefLines])
  ].join("\n");
}

// gg가 고른 Template ID와 기본 resource를 AI가 교체하지 못하는 고정 입력으로 만듭니다.
function createFixedTemplateSelection(templateId: TemplateId | undefined): FixedTemplateSelection | null {
  if (templateId === undefined) {
    return null;
  }

  return getTemplateDefinitionById(templateId);
}

// AI prompt에 선택 Template을 기본 결정으로 유지하고 부족한 요구만 보완하라고 명시합니다.
function createFixedTemplateSelectionPrompt(selection: FixedTemplateSelection | null): string {
  if (selection === null) {
    return "Fixed Template Selection: none";
  }

  return [
    "Fixed Template Selection:",
    JSON.stringify(selection, null, 2),
    "Keep this Template as the base decision. Do not replace it with another Template.",
    "Only add requirements that the fixed Template does not already cover."
  ].join("\n");
}

// 선택 Template의 핵심 리소스를 유지하면서 AI가 답변에 맞춰 만든 호환 리소스와 연결을 보강합니다.
function applyFixedTemplatePriorityToRequirementPlan(
  plan: ArchitectureIntentPlan | null,
  templateId: TemplateId | undefined
): ArchitectureIntentPlan | null {
  if (plan === null || templateId === undefined) {
    return plan;
  }

  const allowedPatternIds: Readonly<Record<TemplateId, ReadonlySet<string>>> = {
    "ecs-fargate-container-app": new Set([
      "ecs-fargate",
      "multi-az-rds",
      "spa-cloudfront-s3"
    ]),
    "eks-container-app": new Set([
      "multi-az-rds",
      "spa-cloudfront-s3"
    ]),
    "full-serverless-web-app": new Set([
      "serverless-api",
      "multi-az-rds",
      "spa-cloudfront-s3"
    ]),
    "minimal-serverless-api": new Set([
      "serverless-api",
      "multi-az-rds"
    ]),
    "static-web-hosting": new Set(["spa-cloudfront-s3"]),
    "three-tier-web-app": new Set([
      "alb-asg-ec2",
      "github-cicd-codedeploy",
      "multi-az-rds",
      "spa-cloudfront-s3"
    ])
  };
  const fixedCompute: Readonly<Record<TemplateId, string | undefined>> = {
    "ecs-fargate-container-app": "ECS_FARGATE",
    "eks-container-app": "EKS_CLUSTER",
    "full-serverless-web-app": "LAMBDA",
    "minimal-serverless-api": "LAMBDA",
    "static-web-hosting": undefined,
    "three-tier-web-app": "EC2"
  };
  const requiredResources = (plan.requiredResources ?? []).filter((resourceType) =>
    SUPPORTED_RESOURCE_TYPE_SET.has(resourceType as ResourceType)
      && isCompatibleTemplateAddition(templateId, resourceType as ResourceType)
  );
  const resourceQuantities = Object.fromEntries(
    Object.entries(plan.resourceQuantities ?? {}).filter(([resourceType]) =>
      SUPPORTED_RESOURCE_TYPE_SET.has(resourceType as ResourceType)
        && isCompatibleTemplateAddition(templateId, resourceType as ResourceType)
    )
  );
  const patternIds = (plan.patternIds ?? []).filter((patternId) =>
    allowedPatternIds[templateId].has(patternId)
  );
  const templateForbidsEc2Runtime = templateId !== "three-tier-web-app";
  const forbiddenCapabilities = mergeUniqueTextItems(
    (plan.forbiddenCapabilities ?? []).filter((capability) => {
      const normalizedCapability = capability.toLowerCase();

      if (normalizedCapability === "load_balancer" && templateId === "ecs-fargate-container-app") {
        return false;
      }
      if (normalizedCapability === "database" && templateId === "three-tier-web-app") {
        return false;
      }
      if (normalizedCapability === "ec2_runtime" && templateId === "three-tier-web-app") {
        return false;
      }

      return true;
    }),
    templateForbidsEc2Runtime ? ["ec2_runtime"] : []
  );
  const compute = fixedCompute[templateId];
  const runtimeTopology = compute === undefined
    ? undefined
    : {
        ...(plan.runtimeTopology ?? {}),
        compute,
        ...(templateId === "ecs-fargate-container-app" ? { trafficEntry: "LOAD_BALANCER" } : {}),
        ...(compute === "EC2"
          ? {}
          : { computeCount: undefined, spreadAcrossPrivateSubnets: undefined })
      };

  return {
    ...plan,
    ...(patternIds.length === 0 ? { patternIds: undefined } : { patternIds }),
    ...(requiredResources.length === 0 ? { requiredResources: undefined } : { requiredResources }),
    ...(Object.keys(resourceQuantities).length === 0
      ? { resourceQuantities: undefined }
      : { resourceQuantities }),
    ...(forbiddenCapabilities.length === 0
      ? { forbiddenCapabilities: undefined }
      : { forbiddenCapabilities }),
    runtimeTopology,
    amazonQBrief: mergeUniqueTextItems(plan.amazonQBrief, [
      `The selected Template ${templateId} is authoritative. Treat conflicting runtime or operations answers as advisory assumptions instead of replacing its compute model.`
    ])
  };
}

function applyFixedTemplateSelection(
  draft: AiArchitectureDraftResult,
  templateId: TemplateId | undefined
): AiArchitectureDraftResult {
  if (templateId === undefined) {
    return draft;
  }

  const definition = getTemplateDefinitionById(templateId);
  const fixedNodes = definition.resources.map((resource) => {
    const resourceDefinition = resourceDefinitions.find(
      (candidate) => candidate.terraform.resourceType === resource.terraformResourceType
    );

    if (!resourceDefinition || resourceDefinition.resourceType === "UNKNOWN") {
      throw new Error(
        `Template resource is not supported by Architecture Draft: ${resource.terraformResourceType}`
      );
    }

    const resolvedValues = resolveFixedTemplateValue(resource.values, definition);
    if (!isObjectRecord(resolvedValues)) {
      throw new Error(`Template resource values must be an object: ${resource.id}`);
    }

    return {
      id: `fixed-template-${definition.id}-${resource.id}`,
      type: resourceDefinition.resourceType,
      label: resource.label,
      positionX: resource.position.x,
      positionY: resource.position.y,
      config: {
        ...resolvedValues,
        templateId: definition.id,
        templateResourceId: resource.id,
        terraformBlockType: resource.terraformBlockType,
        terraformResourceType: resource.terraformResourceType
      }
    };
  });
  const fixedEdges = definition.relationships.map((relationship) => ({
    id: `fixed-template-${definition.id}-${relationship.id}`,
    sourceId: `fixed-template-${definition.id}-${relationship.sourceResourceId}`,
    targetId: `fixed-template-${definition.id}-${relationship.targetResourceId}`,
    label: relationship.label
  }));
  const availableFixedNodeIdsByType = new Map<ResourceType, string[]>();
  const mergedNodeIds = new Set(fixedNodes.map((node) => node.id));
  const draftNodeIdMap = new Map<string, string>();
  const additionalNodes: ArchitectureJson["nodes"] = [];

  for (const node of fixedNodes) {
    if (!TEMPLATE_CORE_DEDUPE_RESOURCE_TYPES.has(node.type)) {
      continue;
    }

    const ids = availableFixedNodeIdsByType.get(node.type) ?? [];
    ids.push(node.id);
    availableFixedNodeIdsByType.set(node.type, ids);
  }

  for (const node of draft.architectureJson.nodes) {
    const matchingFixedIds = availableFixedNodeIdsByType.get(node.type);
    const matchingFixedId =
      findSemanticFixedTemplateMergeTarget(templateId, node, fixedNodes) ??
      matchingFixedIds?.shift();

    if (matchingFixedId) {
      draftNodeIdMap.set(node.id, matchingFixedId);
      continue;
    }

    if (!isCompatibleTemplateAddition(templateId, node.type)) {
      continue;
    }

    const mergedNodeId = createUniqueTemplateMergeId(node.id, mergedNodeIds);
    mergedNodeIds.add(mergedNodeId);
    draftNodeIdMap.set(node.id, mergedNodeId);
    additionalNodes.push({ ...node, id: mergedNodeId });
  }

  const mergedEdgeIds = new Set(fixedEdges.map((edge) => edge.id));
  const mergedEdgePairs = new Set(
    fixedEdges.map((edge) => `${edge.sourceId}->${edge.targetId}`)
  );
  const remappedAdditionalNodes = additionalNodes.map((node) => ({
    ...node,
    config: remapMergedArchitectureReferences(
      node.config,
      draft.architectureJson.nodes,
      draftNodeIdMap
    )
  }));
  const additionalEdges: ArchitectureJson["edges"] = [];

  for (const edge of draft.architectureJson.edges) {
    const sourceId = draftNodeIdMap.get(edge.sourceId);
    const targetId = draftNodeIdMap.get(edge.targetId);

    if (!sourceId || !targetId || sourceId === targetId) continue;

    const edgePair = `${sourceId}->${targetId}`;
    if (mergedEdgePairs.has(edgePair)) continue;

    const mergedEdgeId = createUniqueTemplateMergeId(edge.id, mergedEdgeIds);
    mergedEdgeIds.add(mergedEdgeId);
    mergedEdgePairs.add(edgePair);
    additionalEdges.push({ ...edge, id: mergedEdgeId, sourceId, targetId });
  }

  const fixedWorkloadNode = findFixedTemplateWorkloadNode(templateId, fixedNodes);
  if (fixedWorkloadNode) {
    for (const dataNode of remappedAdditionalNodes.filter((node) => TEMPLATE_DATA_RESOURCE_TYPES.has(node.type))) {
      const hasWorkloadDataEdge = [...fixedEdges, ...additionalEdges].some((edge) =>
        (edge.sourceId === fixedWorkloadNode.id && edge.targetId === dataNode.id)
        || (edge.sourceId === dataNode.id && edge.targetId === fixedWorkloadNode.id)
      );
      if (hasWorkloadDataEdge) continue;

      const edgeId = createUniqueTemplateMergeId(
        `fixed-template-${definition.id}-${fixedWorkloadNode.id}-${dataNode.id}`,
        mergedEdgeIds
      );
      mergedEdgeIds.add(edgeId);
      additionalEdges.push({
        id: edgeId,
        sourceId: fixedWorkloadNode.id,
        targetId: dataNode.id,
        label: "reads/writes"
      });
    }
  }

  return {
    ...draft,
    diagramJson: undefined,
    architectureJson: {
      nodes: [...fixedNodes, ...remappedAdditionalNodes],
      edges: [...fixedEdges, ...additionalEdges]
    },
    metadata: {
      ...draft.metadata,
      assumptions: [
        ...draft.metadata.assumptions,
        `Repository Analysis가 선택한 ${definition.title} (${definition.id}) Template을 기본 결정으로 유지했습니다.`
      ]
    }
  };
}

function applyRepositoryEvidencePriorityToRequirementPlan(
  plan: ArchitectureIntentPlan | null,
  request: CreateArchitectureDraftRequest
): ArchitectureIntentPlan | null {
  const evidence = request.repositoryEvidence;

  if (plan === null || evidence === undefined || !usesStrictEcsRepositoryEvidence(request)) {
    return plan;
  }

  const factKeys = new Set(evidence.facts.map((fact) => `${fact.kind}:${fact.value}`));
  const hasFact = (kind: string, value: string): boolean => factKeys.has(`${kind}:${value}`);
  const requiredResources = new Set<string>();
  const resourceQuantities: Record<string, number> = {};
  for (const resourceType of [
    "ECS_CLUSTER",
    "ECS_SERVICE",
    "ECS_TASK_DEFINITION",
    "LOAD_BALANCER",
    "LOAD_BALANCER_LISTENER",
    "LOAD_BALANCER_TARGET_GROUP"
  ] as const) {
    requiredResources.add(resourceType);
  }

  if (hasFact("frontend_delivery", "s3_cloudfront_static")) {
    requiredResources.add("S3");
    requiredResources.add("CLOUDFRONT");
  }
  if (hasFact("container_registry", "ecr")) {
    requiredResources.add("ECR_REPOSITORY");
  }
  if (hasFact("observability", "cloudwatch")) {
    requiredResources.add("CLOUDWATCH_LOG_GROUP");
  }
  if (hasFact("excluded_capability", "database")) {
    requiredResources.delete("RDS");
  }
  if (hasFact("runtime_scale", "single_task")) {
    resourceQuantities.ECS_SERVICE = 1;
    resourceQuantities.ECS_TASK_DEFINITION = 1;
    resourceQuantities.LOAD_BALANCER_TARGET_GROUP = 1;
  }

  return {
    ...plan,
    patternIds: undefined,
    requiredResources: [...requiredResources],
    resourceQuantities,
    runtimeTopology: {
      ...(plan.runtimeTopology ?? {}),
      trafficEntry: "LOAD_BALANCER",
      compute: "ECS_FARGATE",
      ...(hasFact("runtime_scale", "single_task") ? { computeCount: 1 } : {}),
      placement: "private_subnets",
      spreadAcrossPrivateSubnets: true,
      autoScaling: false
    },
    forbiddenCapabilities: mergeUniqueTextItems(plan.forbiddenCapabilities, [
      "ec2_runtime",
      ...(hasFact("excluded_capability", "database") ? ["database"] : []),
      ...(hasFact("excluded_capability", "websocket") ? ["realtime"] : [])
    ]),
    ...(hasFact("excluded_capability", "database") ? { database: "none" } : {}),
    availability: undefined,
    amazonQBrief: mergeUniqueTextItems(plan.amazonQBrief, [
      "Repository evidence is authoritative: keep one Fargate task unless the user explicitly overrides it.",
      "Use GitHub Actions as an external delivery actor; do not add AWS-native CI/CD pipeline resources.",
      "Place the internet-facing ALB in two public subnets and the Fargate service in two private app subnets.",
      "Use one cost-conscious NAT gateway for private task image pulls and log delivery; do not add autoscaling or persistence."
    ])
  };
}

function usesStrictEcsRepositoryEvidence(request: CreateArchitectureDraftRequest): boolean {
  return request.repositoryEvidence?.mode === "strict"
    && request.templateId === "ecs-fargate-container-app"
    && request.repositoryEvidence.facts.some(
      (fact) => fact.kind === "backend_runtime" && fact.value === "ecs_fargate_service"
    );
}

function createStrictRepositoryDeploymentName(repositoryName: string | undefined): string {
  const normalized = (repositoryName ?? "application")
    .toLowerCase()
    .replace(/\.git$/u, "")
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 20)
    .replace(/-+$/u, "");

  return normalized || "application";
}

function applyArchitectureDraftRequestPolicies(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest
): AiArchitectureDraftResult {
  const policyDraft = applyArchitectureDraftBaseRequestPolicies(draft, request);
  let authorizedCandidateExclusions:
    | readonly ArchitectureDraftCandidateExclusion[]
    | undefined;

  try {
    const candidateDraft = createArchitectureDraftCandidateProjection(request);
    authorizedCandidateExclusions = resolveAuthorizedCandidateExclusions(
      candidateDraft.architectureJson,
      request.candidateExclusions
    );
  } catch {
    // Candidate authorization is observational and must not interrupt final generation.
  }

  return applyArchitectureDraftCandidateExclusions(
    policyDraft,
    authorizedCandidateExclusions
  );
}

function applyArchitectureDraftBaseRequestPolicies(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest
): AiArchitectureDraftResult {
  return applyStrictRepositoryEvidencePolicy(
    applyFixedTemplateSelection(draft, request.templateId),
    request
  );
}

function resolveAuthorizedCandidateExclusions(
  candidateArchitectureJson: ArchitectureJson,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined
): readonly ArchitectureDraftCandidateExclusion[] | undefined {
  if (candidateExclusions === undefined) {
    return undefined;
  }

  try {
    const excludableCandidateIds = new Set(
      resolveExcludableCandidateIds(candidateArchitectureJson)
    );
    const candidateById = new Map(
      candidateArchitectureJson.nodes.map((node) => [node.id, node] as const)
    );

    return candidateExclusions.filter((exclusion) => {
      if (!excludableCandidateIds.has(exclusion.candidateId)) {
        return false;
      }

      const candidate = candidateById.get(exclusion.candidateId);
      return candidate !== undefined
        && candidate.type === exclusion.resourceType
        && readArchitectureCandidateLabel(candidate) === exclusion.label;
    });
  } catch {
    return undefined;
  }
}

function resolveExcludableCandidateIds(
  architectureJson: ArchitectureJson
): string[] {
  return architectureJson.nodes
    .filter((candidate) => {
      if (!EXCLUDABLE_CANDIDATE_RESOURCE_TYPES.has(candidate.type)) {
        return false;
      }

      const architectureWithoutCandidateType = excludeArchitectureResourceTypes(
        architectureJson,
        new Set([candidate.type])
      );
      return isUsableCandidateArchitecture(
        architectureWithoutCandidateType,
        architectureJson
      );
    })
    .map(({ id }) => id);
}

function readArchitectureCandidateLabel(
  candidate: ArchitectureJson["nodes"][number]
): string {
  return candidate.label?.trim() || candidate.type;
}

function excludeArchitectureResourceTypes(
  architectureJson: ArchitectureJson,
  excludedResourceTypes: ReadonlySet<ResourceType>
): ArchitectureJson {
  const nodes = architectureJson.nodes.filter(
    (node) => !excludedResourceTypes.has(node.type)
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = architectureJson.edges.filter(
    (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
  );

  return { nodes, edges };
}

function isUsableCandidateArchitecture(
  architectureJson: ArchitectureJson,
  sourceArchitectureJson: ArchitectureJson = architectureJson
): boolean {
  if (architectureJson.nodes.length === 0) {
    return false;
  }

  const nodeIds = new Set(architectureJson.nodes.map(({ id }) => id));
  if (
    nodeIds.size !== architectureJson.nodes.length
    || !architectureJson.edges.every(
      ({ sourceId, targetId }) => nodeIds.has(sourceId) && nodeIds.has(targetId)
    )
  ) {
    return false;
  }

  const removedCandidates = sourceArchitectureJson.nodes.filter(
    ({ id }) => !nodeIds.has(id)
  );
  if (removedCandidates.length === 0) {
    return true;
  }

  const removedCandidateIds = new Set(removedCandidates.map(({ id }) => id));
  if (
    sourceArchitectureJson.edges.some(
      ({ sourceId, targetId }) => nodeIds.has(sourceId) && removedCandidateIds.has(targetId)
    )
  ) {
    return false;
  }

  return !architectureJson.nodes.some((node) =>
    readNestedConfigStringValues(node.config).some((value) =>
      removedCandidates.some((candidate) =>
        matchesArchitectureCandidateConfigReference(value, candidate)
      )
    )
  );
}

function readNestedConfigStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim().length === 0 ? [] : [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(readNestedConfigStringValues);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.values(value).flatMap(readNestedConfigStringValues);
}

function matchesArchitectureCandidateConfigReference(
  rawReferenceValue: string,
  candidate: ArchitectureJson["nodes"][number]
): boolean {
  const referenceValue = normalizeReferenceValue(rawReferenceValue);
  if (referenceValue === candidate.id) {
    return true;
  }

  const configuredTerraformResourceType = candidate.config.terraformResourceType;
  const terraformResourceType =
    typeof configuredTerraformResourceType === "string"
      ? configuredTerraformResourceType
      : resourceDefinitions.find(
        (definition) => definition.resourceType === candidate.type
      )?.terraform.resourceType;
  if (!terraformResourceType) {
    return false;
  }

  const configuredTerraformResourceName = candidate.config.terraformResourceName;
  const resourceNames = new Set([
    candidate.id,
    candidate.id.replace(/-/gu, "_"),
    ...(typeof configuredTerraformResourceName === "string"
      ? [configuredTerraformResourceName]
      : [])
  ]);

  return [...resourceNames].some((resourceName) => {
    const resourceAddress = `${terraformResourceType}.${resourceName}`;
    const dataAddress = `data.${resourceAddress}`;
    return referenceValue === resourceAddress
      || referenceValue.startsWith(`${resourceAddress}.`)
      || referenceValue === dataAddress
      || referenceValue.startsWith(`${dataAddress}.`);
  });
}

function applyArchitectureDraftCandidateExclusions(
  draft: AiArchitectureDraftResult,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined
): AiArchitectureDraftResult {
  if (candidateExclusions === undefined) {
    return draft;
  }

  try {
    const excludedResourceTypes = new Set(
      candidateExclusions.map(({ resourceType }) => resourceType)
    );
    if (excludedResourceTypes.size === 0) {
      return draft;
    }
    const architectureJson = excludeArchitectureResourceTypes(
      draft.architectureJson,
      excludedResourceTypes
    );
    if (!isUsableCandidateArchitecture(architectureJson, draft.architectureJson)) {
      return appendCandidateExclusionMetadata(draft, candidateExclusions, false);
    }

    return appendCandidateExclusionMetadata({
      ...draft,
      architectureJson
    }, candidateExclusions, true);
  } catch {
    return draft;
  }
}

function appendCandidateExclusionMetadata(
  draft: AiArchitectureDraftResult,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[],
  applied: boolean
): AiArchitectureDraftResult {
  const candidates = candidateExclusions.map(
    ({ candidateId, resourceType, label }) =>
      `${label.trim() || resourceType} (${resourceType}, ${candidateId})`
  );
  if (candidates.length === 0) {
    return draft;
  }

  const constraintDescription = candidates.join(", ");
  const assumption = applied
    ? `진행 프리뷰에서 승인된 후보 제외 제약을 반영했습니다: ${constraintDescription}`
    : `후보 제외 제약은 남은 구조를 사용할 수 없게 만들어 적용하지 않았습니다: ${constraintDescription}`;
  const explanation = applied
    ? `서버가 발급한 후보 id/type/label을 확인한 뒤 Resource 유형 제외를 적용했습니다: ${constraintDescription}`
    : `서버가 발급한 후보 제외를 확인했지만 빈 구조 또는 끊어진 참조를 피하기 위해 적용하지 않았습니다: ${constraintDescription}`;

  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      assumptions: [...new Set([...draft.metadata.assumptions, assumption])],
      explanations: [...new Set([...draft.metadata.explanations, explanation])]
    }
  };
}

function applyStrictRepositoryEvidencePolicy(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest
): AiArchitectureDraftResult {
  const evidence = request.repositoryEvidence;

  if (!usesStrictEcsRepositoryEvidence(request) || evidence === undefined) {
    return draft;
  }

  const factKeys = new Set(evidence.facts.map((fact) => `${fact.kind}:${fact.value}`));
  const hasFact = (kind: string, value: string): boolean => factKeys.has(`${kind}:${value}`);
  const templatePrefix = "fixed-template-ecs-fargate-container-app-";
  const fixedTemplateDraft = applyFixedTemplateSelection(
    { ...draft, architectureJson: { nodes: [], edges: [] } },
    request.templateId
  );
  const strictEvidenceManagedTemplateResourceIds = new Set(["repository", "log-group"]);
  const coreNodes = fixedTemplateDraft.architectureJson.nodes.filter(
    (node) =>
      node.id.startsWith(templatePrefix) &&
      !strictEvidenceManagedTemplateResourceIds.has(String(node.config.templateResourceId ?? ""))
  );
  const nodeByTemplateResourceId = new Map(
    coreNodes.flatMap((node) =>
      typeof node.config.templateResourceId === "string"
        ? [[node.config.templateResourceId, node] as const]
        : []
    )
  );
  const coreNodeId = (resourceId: string): string =>
    nodeByTemplateResourceId.get(resourceId)?.id ?? `${templatePrefix}${resourceId}`;
  const staticDelivery = hasFact("frontend_delivery", "s3_cloudfront_static");
  const usesEcr = hasFact("container_registry", "ecr");
  const usesCloudWatch = hasFact("observability", "cloudwatch");
  const usesGitHubActions = hasFact("ci_cd", "github_actions");
  const requiresTlsAtAlb = hasFact("transport_security", "alb_tls_termination");
  const singleTask = hasFact("runtime_scale", "single_task");
  const healthCheck = evidence.facts.find((fact) => fact.kind === "health_check")?.value;
  const healthMatch = /^http:(\d{2,5})(\/[a-z0-9_./-]+)$/iu.exec(healthCheck ?? "");
  const containerPort = healthMatch ? Number(healthMatch[1]) : 80;
  const healthCheckPath = healthMatch?.[2] ?? "/";
  const deploymentName = createStrictRepositoryDeploymentName(evidence.repositoryName);
  const apiName = `${deploymentName}-api`;
  const logGroupName = `/ecs/${apiName}`;
  const managedServicesAreaId = "repository-managed-services";
  const hasManagedServices = staticDelivery || usesEcr || usesCloudWatch;
  const vpcId = coreNodeId("vpc");
  const publicSubnetAId = coreNodeId("subnet-a");
  const publicSubnetBId = coreNodeId("subnet-b");
  const privateAppSubnetAId = "repository-private-app-subnet-a";
  const privateAppSubnetBId = "repository-private-app-subnet-b";
  const natEipId = "repository-nat-eip";
  const natGatewayId = "repository-nat-gateway";
  const privateRouteTableId = "repository-private-route-table";
  const privateRouteAssociationAId = "repository-private-route-association-a";
  const privateRouteAssociationBId = "repository-private-route-association-b";
  const fargateRuntimeId = "repository-fargate-runtime";
  const webAssetsId = "repository-web-assets";
  const webPublicAccessId = "repository-web-public-access";
  const webBootstrapObjectId = "repository-web-bootstrap-index";
  const cloudFrontOacId = "repository-cloudfront-oac";
  const cloudFrontId = "repository-cloudfront";
  const webBucketPolicyId = "repository-web-bucket-policy";
  const ecrId = "repository-ecr";
  const logGroupId = "repository-ecs-logs";
  const vpcRef = `aws_vpc.${vpcId}.id`;
  const publicSubnetRefs = [publicSubnetAId, publicSubnetBId].map(
    (id) => `aws_subnet.${id}.id`
  );
  const privateAppSubnetRefs = [privateAppSubnetAId, privateAppSubnetBId].map(
    (id) => `aws_subnet.${id}.id`
  );
  const additionalNodes: ArchitectureJson["nodes"] = [];

  additionalNodes.push(
    {
      id: privateAppSubnetAId,
      type: "SUBNET",
      label: "Private App Subnet A",
      positionX: 360,
      positionY: 1010,
      config: {
        terraformResourceName: "private_app_a",
        parentAreaNodeId: vpcId,
        vpcId: vpcRef,
        cidrBlock: "10.30.11.0/24",
        availabilityZone: "ap-northeast-2a",
        tier: "private_app",
        mapPublicIpOnLaunch: false,
        diagramWidth: 420,
        diagramHeight: 300
      }
    },
    {
      id: privateAppSubnetBId,
      type: "SUBNET",
      label: "Private App Subnet B",
      positionX: 840,
      positionY: 1010,
      config: {
        terraformResourceName: "private_app_b",
        parentAreaNodeId: vpcId,
        vpcId: vpcRef,
        cidrBlock: "10.30.12.0/24",
        availabilityZone: "ap-northeast-2b",
        tier: "private_app",
        mapPublicIpOnLaunch: false,
        diagramWidth: 420,
        diagramHeight: 300
      }
    },
    {
      id: natEipId,
      type: "ELASTIC_IP",
      label: "NAT Elastic IP",
      positionX: 900,
      positionY: 690,
      config: {
        terraformResourceName: "nat",
        parentAreaNodeId: publicSubnetAId,
        domain: "vpc"
      }
    },
    {
      id: natGatewayId,
      type: "NAT_GATEWAY",
      label: "NAT Gateway (private egress)",
      positionX: 1080,
      positionY: 690,
      config: {
        terraformResourceName: "private_egress",
        parentAreaNodeId: publicSubnetAId,
        allocationId: `aws_eip.${natEipId}.id`,
        subnetId: `aws_subnet.${publicSubnetAId}.id`
      }
    },
    {
      id: privateRouteTableId,
      type: "ROUTE_TABLE",
      label: "Private App Route Table",
      positionX: 1360,
      positionY: 1080,
      config: {
        terraformResourceName: "private_app",
        parentAreaNodeId: vpcId,
        vpcId: vpcRef,
        route: [{
          cidrBlock: "0.0.0.0/0",
          natGatewayId: `aws_nat_gateway.${natGatewayId}.id`
        }]
      }
    },
    {
      id: privateRouteAssociationAId,
      type: "ROUTE_TABLE_ASSOCIATION",
      label: "Private Route A",
      positionX: 1580,
      positionY: 1080,
      config: {
        terraformResourceName: "private_app_a",
        parentAreaNodeId: vpcId,
        subnetId: `aws_subnet.${privateAppSubnetAId}.id`,
        routeTableId: `aws_route_table.${privateRouteTableId}.id`
      }
    },
    {
      id: privateRouteAssociationBId,
      type: "ROUTE_TABLE_ASSOCIATION",
      label: "Private Route B",
      positionX: 1800,
      positionY: 1080,
      config: {
        terraformResourceName: "private_app_b",
        parentAreaNodeId: vpcId,
        subnetId: `aws_subnet.${privateAppSubnetBId}.id`,
        routeTableId: `aws_route_table.${privateRouteTableId}.id`
      }
    }
  );

  if (hasManagedServices) {
    additionalNodes.push({
      id: managedServicesAreaId,
      type: "UNKNOWN",
      label: "AWS Managed Services",
      positionX: 260,
      positionY: 40,
      config: {
        diagramKind: "design",
        diagramType: "design_group",
        diagramWidth: 1800,
        diagramHeight: 400
      }
    });
  }

  if (staticDelivery) {
    additionalNodes.push(
      {
        id: webAssetsId,
        type: "S3",
        label: "Static Web Assets",
        positionX: 580,
        positionY: 140,
        config: {
          terraformResourceName: "web_assets",
          parentAreaNodeId: managedServicesAreaId,
          bucketPrefix: `${deploymentName}-web-`,
          bucketPurpose: "static_website_origin",
          publicAccessBlock: true,
          versioningEnabled: true,
          forceDestroy: true
        }
      },
      {
        id: webPublicAccessId,
        type: "S3",
        label: "S3 Public Access Block",
        positionX: 560,
        positionY: 280,
        config: {
          terraformResourceType: "aws_s3_bucket_public_access_block",
          terraformResourceName: "web_public_access",
          parentAreaNodeId: managedServicesAreaId,
          bucket: `aws_s3_bucket.${webAssetsId}.id`,
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true
        }
      },
      {
        id: webBootstrapObjectId,
        type: "S3",
        label: "Bootstrap Index (release in progress)",
        positionX: 760,
        positionY: 280,
        config: {
          terraformResourceType: "aws_s3_object",
          terraformResourceName: "web_bootstrap_index",
          parentAreaNodeId: managedServicesAreaId,
          bucket: `aws_s3_bucket.${webAssetsId}.id`,
          key: "index.html",
          contentType: "text/html; charset=utf-8",
          releaseManagedContent: true,
          content: "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Application deployment is in progress</title><body><main><h1>Application deployment is in progress</h1><p>SketchCatch is deploying the approved application release.</p></main></body></html>"
        }
      },
      {
        id: cloudFrontOacId,
        type: "CLOUDFRONT",
        label: "CloudFront Origin Access Control",
        positionX: 300,
        positionY: 280,
        config: {
          terraformResourceType: "aws_cloudfront_origin_access_control",
          terraformResourceName: "web_oac",
          parentAreaNodeId: managedServicesAreaId,
          name: `${deploymentName}-web-oac`,
          originAccessControlOriginType: "s3",
          signingBehavior: "always",
          signingProtocol: "sigv4"
        }
      },
      {
        id: cloudFrontId,
        type: "CLOUDFRONT",
        label: "CloudFront Web Entry",
        positionX: 340,
        positionY: 140,
        config: {
          terraformResourceName: "web_cdn",
          parentAreaNodeId: managedServicesAreaId,
          enabled: true,
          defaultRootObject: "index.html",
          priceClass: "PriceClass_100",
          origin: [
            {
              domainName: `aws_s3_bucket.${webAssetsId}.bucket_regional_domain_name`,
              originId: "web-assets",
              originAccessControlId: `aws_cloudfront_origin_access_control.${cloudFrontOacId}.id`
            },
            {
              domainName: `aws_lb.${coreNodeId("load-balancer")}.dns_name`,
              originId: "api-alb",
              customOriginConfig: [{
                httpPort: 80,
                httpsPort: 443,
                originProtocolPolicy: "http-only",
                originSslProtocols: ["TLSv1.2"]
              }]
            }
          ],
          defaultCacheBehavior: [{
            targetOriginId: "web-assets",
            viewerProtocolPolicy: "redirect-to-https",
            allowedMethods: ["GET", "HEAD"],
            cachedMethods: ["GET", "HEAD"],
            cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6"
          }],
          orderedCacheBehavior: ["/api/*", "/health"].map((pathPattern) => ({
            pathPattern,
            targetOriginId: "api-alb",
            viewerProtocolPolicy: "redirect-to-https",
            allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
            cachedMethods: ["GET", "HEAD"],
            cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
            originRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac"
          })),
          restrictions: [{ geoRestriction: [{ restrictionType: "none" }] }],
          viewerCertificate: [{ cloudfrontDefaultCertificate: true }]
        }
      },
      {
        id: webBucketPolicyId,
        type: "S3",
        label: "CloudFront Read-only Bucket Policy",
        positionX: 980,
        positionY: 280,
        config: {
          terraformResourceType: "aws_s3_bucket_policy",
          terraformResourceName: "web_cloudfront_read",
          parentAreaNodeId: managedServicesAreaId,
          bucket: `aws_s3_bucket.${webAssetsId}.id`,
          dependsOn: [`aws_s3_bucket_public_access_block.${webPublicAccessId}`],
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
              Sid: "AllowCloudFrontServicePrincipalReadOnly",
              Effect: "Allow",
              Principal: { Service: "cloudfront.amazonaws.com" },
              Action: "s3:GetObject",
              Resource: `\${aws_s3_bucket.${webAssetsId}.arn}/*`,
              Condition: {
                StringEquals: {
                  "AWS:SourceArn": `\${aws_cloudfront_distribution.${cloudFrontId}.arn}`
                }
              }
            }]
          })
        }
      }
    );
  }

  if (usesEcr) {
    additionalNodes.push({
      id: ecrId,
      type: "ECR_REPOSITORY",
      label: "ECR API Image Repository",
      positionX: 820,
      positionY: 140,
      config: {
        terraformResourceName: "api_image",
        parentAreaNodeId: managedServicesAreaId,
        name: apiName,
        imageTagMutability: "IMMUTABLE",
        forceDelete: true,
        imageScanningConfiguration: { scanOnPush: true }
      }
    });
  }

  if (usesCloudWatch) {
    additionalNodes.push({
      id: logGroupId,
      type: "CLOUDWATCH_LOG_GROUP",
      label: "CloudWatch ECS Container Logs",
      positionX: 1300,
      positionY: 140,
      config: {
        terraformResourceName: "ecs_logs",
        parentAreaNodeId: managedServicesAreaId,
        name: logGroupName,
        retentionInDays: 30
      }
    });
  }

  additionalNodes.push({
    id: "repository-browser",
    type: "UNKNOWN",
    label: "Browser",
    positionX: 40,
    positionY: 680,
    config: {
      diagramKind: "design",
      diagramType: "client",
      diagramWidth: 140,
      diagramHeight: 80
    }
  });

  additionalNodes.push({
    id: fargateRuntimeId,
    type: "UNKNOWN",
    label: "Fargate Task (1, Private App A/B)",
    positionX: 460,
    positionY: 1140,
    config: {
      diagramKind: "design",
      diagramType: "aws_ecs_task_definition",
      diagramWidth: 260,
      diagramHeight: 96,
      parentAreaNodeId: coreNodeId("task-security-group"),
      sketchcatchReferenceTerraform: true
    }
  });

  if (usesGitHubActions) {
    additionalNodes.push({
      id: "repository-github-actions",
      type: "UNKNOWN",
      label: "GitHub Actions",
      positionX: 40,
      positionY: 180,
      config: {
        diagramKind: "design",
        diagramType: "github_actions",
        diagramWidth: 160,
        diagramHeight: 80
      }
    });
  }

  const updatedCoreNodes = coreNodes.map((node) => {
    switch (node.config.templateResourceId) {
      case "vpc":
        return {
          ...node,
          positionX: 260,
          positionY: 500,
          config: {
            ...node.config,
            diagramWidth: 1800,
            diagramHeight: 900
          }
        };
      case "subnet-a":
        return {
          ...node,
          label: "Public Subnet A",
          positionX: 360,
          positionY: 620,
          config: {
            ...node.config,
            parentAreaNodeId: vpcId,
            tier: "public",
            mapPublicIpOnLaunch: true,
            diagramWidth: 420,
            diagramHeight: 280
          }
        };
      case "subnet-b":
        return {
          ...node,
          label: "Public Subnet B",
          positionX: 840,
          positionY: 620,
          config: {
            ...node.config,
            parentAreaNodeId: vpcId,
            tier: "public",
            mapPublicIpOnLaunch: true,
            diagramWidth: 420,
            diagramHeight: 280
          }
        };
      case "alb-security-group":
        return {
          ...node,
          positionX: 420,
          positionY: 680,
          config: {
            ...node.config,
            name: `${deploymentName}-alb-sg`,
            parentAreaNodeId: publicSubnetAId,
            diagramWidth: 300,
            diagramHeight: 160,
            description: requiresTlsAtAlb && staticDelivery
              ? "Allow CloudFront origin HTTP while CloudFront terminates public TLS"
              : requiresTlsAtAlb
                ? "Allow HTTP for deployment validation until an ALB certificate is confirmed"
              : "Allow public HTTP to the Application Load Balancer",
            ingress: [{
              fromPort: 80,
              toPort: 80,
              protocol: "tcp",
              cidrBlocks: ["0.0.0.0/0"]
            }]
          }
        };
      case "task-security-group":
        return {
          ...node,
          positionX: 420,
          positionY: 1070,
          config: {
            ...node.config,
            name: `${deploymentName}-task-sg`,
            parentAreaNodeId: privateAppSubnetAId,
            diagramWidth: 340,
            diagramHeight: 180,
            description: `Allow ALB traffic to the API on port ${containerPort}`,
            ingress: [{
              fromPort: containerPort,
              toPort: containerPort,
              protocol: "tcp",
              securityGroups: [`aws_security_group.${coreNodeId("alb-security-group")}.id`]
            }]
          }
        };
      case "cluster":
        return {
          ...node,
          positionX: 1540,
          positionY: 140,
          config: {
            ...node.config,
            name: `${deploymentName}-cluster`,
            parentAreaNodeId: vpcId
          }
        };
      case "load-balancer":
        return {
          ...node,
          label: "Internet-facing ALB (Public A/B)",
          positionX: 500,
          positionY: 730,
          config: {
            ...node.config,
            name: `${deploymentName.slice(0, 24)}-alb`,
            parentAreaNodeId: coreNodeId("alb-security-group"),
            subnets: publicSubnetRefs
          }
        };
      case "target-group":
        return {
          ...node,
          label: "API Target Group",
          positionX: 1360,
          positionY: 700,
          config: {
            ...node.config,
            name: `${deploymentName.slice(0, 24)}-api`,
            parentAreaNodeId: vpcId,
            port: containerPort,
            healthCheck: { path: healthCheckPath, matcher: "200-399" }
          }
        };
      case "listener":
        return {
          ...node,
          label: requiresTlsAtAlb && staticDelivery
            ? "CloudFront Origin HTTP Listener"
            : requiresTlsAtAlb
              ? "HTTP Listener (TLS Pending)"
              : "HTTP Listener",
          positionX: 1560,
          positionY: 700,
          config: {
            ...node.config,
            parentAreaNodeId: vpcId,
            port: 80,
            protocol: "HTTP"
          }
        };
      case "task":
        return {
          ...node,
          label: "API Task Definition (control plane)",
          positionX: 1060,
          positionY: 140,
          config: {
            ...node.config,
            ...(hasManagedServices ? { parentAreaNodeId: managedServicesAreaId } : {}),
            family: apiName,
            dependsOn: usesCloudWatch
              ? [`aws_cloudwatch_log_group.${logGroupId}`]
              : undefined,
            containerDefinitions: JSON.stringify([{
              name: "api",
              image: "public.ecr.aws/docker/library/nginx:1.27-alpine",
              essential: true,
              entryPoint: ["/bin/sh", "-c"],
              command: [
                "printf '%s\\n' 'server {' '  listen 8080;' '  default_type text/plain;' '  location = /health { return 200 ok; }' '  location / { return 200 SketchCatch-deployment-smoke; }' '}' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"
              ],
              portMappings: [{ containerPort, hostPort: containerPort, protocol: "tcp" }],
              environment: [
                { name: "PORT", value: String(containerPort) },
                ...(staticDelivery
                  ? [{
                      name: "WEB_ORIGIN",
                      value: `https://\${aws_cloudfront_distribution.${cloudFrontId}.domain_name}`
                    }]
                  : []),
                { name: "INSTANCE_ID", value: "fargate" }
              ],
              ...(usesCloudWatch
                ? {
                    logConfiguration: {
                      logDriver: "awslogs",
                      options: {
                        "awslogs-group": logGroupName,
                        "awslogs-region": "ap-northeast-2",
                        "awslogs-stream-prefix": "api"
                      }
                    }
                  }
                : {})
            }])
          }
        };
      case "service":
        return {
          ...node,
          label: "API Fargate Service",
          positionX: 1780,
          positionY: 140,
          config: {
            ...node.config,
            name: `${deploymentName}-service`,
            parentAreaNodeId: coreNodeId("task-security-group"),
            desiredCount: singleTask ? 1 : node.config.desiredCount,
            networkConfiguration: {
              subnets: privateAppSubnetRefs,
              securityGroups: [`aws_security_group.${coreNodeId("task-security-group")}.id`],
              assignPublicIp: false
            },
            loadBalancer: {
              targetGroupArn: `aws_lb_target_group.${coreNodeId("target-group")}.arn`,
              containerName: "api",
              containerPort
            }
          }
        };
      case "internet-gateway":
        return {
          ...node,
          positionX: 1800,
          positionY: 620,
          config: { ...node.config, parentAreaNodeId: vpcId }
        };
      case "route-table":
        return {
          ...node,
          positionX: 1800,
          positionY: 780,
          config: { ...node.config, parentAreaNodeId: vpcId }
        };
      case "route-a":
        return {
          ...node,
          positionX: 1580,
          positionY: 920,
          config: { ...node.config, parentAreaNodeId: vpcId }
        };
      case "route-b":
        return {
          ...node,
          positionX: 1800,
          positionY: 920,
          config: { ...node.config, parentAreaNodeId: vpcId }
        };
      case "execution-role":
        return {
          ...node,
          positionX: 820,
          positionY: 300,
          config: {
            ...node.config,
            name: `${deploymentName}-ecs-execution`,
            ...(hasManagedServices ? { parentAreaNodeId: managedServicesAreaId } : {})
          }
        };
      case "execution-policy":
        return {
          ...node,
          positionX: 1060,
          positionY: 300,
          config: {
            ...node.config,
            ...(hasManagedServices ? { parentAreaNodeId: managedServicesAreaId } : {})
          }
        };
      case "task-role":
        return {
          ...node,
          positionX: 1300,
          positionY: 300,
          config: {
            ...node.config,
            name: `${deploymentName}-ecs-task`,
            ...(hasManagedServices ? { parentAreaNodeId: managedServicesAreaId } : {})
          }
        };
      default:
        return node;
    }
  });
  const nodes = [...updatedCoreNodes, ...additionalNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: ArchitectureJson["edges"] = [];
  const edgePairs = new Set(edges.map((edge) => `${edge.sourceId}->${edge.targetId}`));
  const connect = (sourceId: string, targetId: string, label: string): void => {
    const pair = `${sourceId}->${targetId}`;
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return;

    if (edgePairs.has(pair)) {
      const edgeIndex = edges.findIndex(
        (edge) => edge.sourceId === sourceId && edge.targetId === targetId
      );
      if (edgeIndex >= 0) {
        edges[edgeIndex] = { ...edges[edgeIndex]!, label };
      }
      return;
    }

    edgePairs.add(pair);
    edges.push({
      id: `repository-evidence-${sourceId}-${targetId}`,
      sourceId,
      targetId,
      label
    });
  };

  if (staticDelivery) {
    connect("repository-browser", cloudFrontId, "HTTPS web and /api entry");
    connect(cloudFrontId, webAssetsId, "private OAC origin");
    connect(webAssetsId, webPublicAccessId, "blocks public access");
    connect(webAssetsId, webBootstrapObjectId, "stores bootstrap index");
    connect(cloudFrontOacId, cloudFrontId, "signs S3 origin requests");
    connect(webBucketPolicyId, webAssetsId, "allows CloudFront read-only access");
    connect(
      cloudFrontId,
      coreNodeId("alb-security-group"),
      "proxies /api/* and /health to ALB over HTTP"
    );
  } else {
    connect("repository-browser", coreNodeId("alb-security-group"), "API -> ALB SG: TCP 80");
  }
  connect(coreNodeId("alb-security-group"), coreNodeId("load-balancer"), "attached to public ALB");
  connect(
    coreNodeId("alb-security-group"),
    coreNodeId("task-security-group"),
    `ALB SG -> Task SG: TCP ${containerPort} only`
  );
  connect(coreNodeId("load-balancer"), coreNodeId("listener"), "accepts CloudFront origin HTTP");
  connect(coreNodeId("listener"), coreNodeId("target-group"), "forwards API traffic");
  connect(coreNodeId("target-group"), coreNodeId("service"), `health checks ${healthCheckPath}`);
  connect(coreNodeId("cluster"), coreNodeId("service"), "runs the API service");
  connect(coreNodeId("task"), coreNodeId("service"), "defines the deployed revision");
  connect(coreNodeId("service"), fargateRuntimeId, "schedules desired task in private app subnets");
  if (usesEcr) {
    connect(ecrId, fargateRuntimeId, "application revisions pull API image from ECR");
  }
  if (usesCloudWatch) {
    connect(fargateRuntimeId, logGroupId, "writes ECS container logs via awslogs");
  }
  connect(natEipId, natGatewayId, "allocates public address");
  connect(privateRouteTableId, natGatewayId, "routes private egress through NAT");
  connect(privateRouteAssociationAId, privateRouteTableId, "associates private app subnet A");
  connect(privateRouteAssociationBId, privateRouteTableId, "associates private app subnet B");
  if (usesGitHubActions) {
    if (usesEcr) {
      connect("repository-github-actions", ecrId, "builds and pushes API image");
    }
    if (staticDelivery) {
      connect("repository-github-actions", webAssetsId, "uploads apps/web/dist");
      connect("repository-github-actions", cloudFrontId, "invalidates updated static assets");
    }
    connect("repository-github-actions", coreNodeId("service"), "deploys task revision");
  }

  return {
    ...draft,
    diagramJson: undefined,
    architectureJson: { nodes, edges },
    metadata: {
      ...draft.metadata,
      assumptions: [
        ...draft.metadata.assumptions,
        "Repository evidence strict mode kept only explicitly supported deployment resources.",
        ...(requiresTlsAtAlb && staticDelivery
          ? ["CloudFront terminates public HTTPS and routes /api/* to the ALB HTTP origin, so the web application does not make mixed-content API requests."]
          : requiresTlsAtAlb
            ? ["The repository requires ALB TLS termination; the initial deployment uses HTTP until the domain and certificate are user-confirmed."]
          : []),
        ...(usesEcr
          ? ["The initial Terraform apply uses a public 8080 /health smoke image because the new ECR repository is empty; the first application release registers the repository image as a new ECS task definition revision."]
          : []),
        ...(staticDelivery
          ? ["Terraform uploads a bootstrap index.html so the CloudFront URL is immediately healthy; CI/CD replaces it with apps/web/dist and invalidates CloudFront."]
          : []),
        "The two private app subnets use one NAT gateway for cost-conscious ECR image pulls and CloudWatch log delivery; this is a single-AZ egress tradeoff."
      ]
    }
  };
}

function resolveFixedTemplateValue(value: unknown, definition: TemplateDefinition): unknown {
  if (typeof value === "string") {
    const referenceMatch = /^@ref:([^.]+)\.(.+)$/u.exec(value);
    const addressMatch = /^@address:(.+)$/u.exec(value);
    const targetResourceId = referenceMatch?.[1] ?? addressMatch?.[1];

    if (!targetResourceId) {
      return value;
    }

    const targetResource = definition.resources.find((resource) => resource.id === targetResourceId);
    if (!targetResource) {
      throw new Error(`Template reference target is missing: ${targetResourceId}`);
    }

    const targetNodeId = `fixed-template-${definition.id}-${targetResource.id}`;
    const address = `${targetResource.terraformBlockType === "data" ? "data." : ""}${targetResource.terraformResourceType}.${targetNodeId}`;
    return referenceMatch ? `${address}.${referenceMatch[2]}` : address;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveFixedTemplateValue(item, definition));
  }

  if (!isObjectRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      resolveFixedTemplateValue(entryValue, definition)
    ])
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const TEMPLATE_CORE_DEDUPE_RESOURCE_TYPES = new Set<ResourceType>([
  "AMPLIFY_APP",
  "API_GATEWAY_REST_API",
  "CLOUDFRONT",
  "EC2",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "ECS_TASK_DEFINITION",
  "EKS_CLUSTER",
  "KUBERNETES_DEPLOYMENT",
  "KUBERNETES_NAMESPACE",
  "KUBERNETES_SERVICE",
  "LAMBDA",
  "LOAD_BALANCER",
  "LOAD_BALANCER_LISTENER",
  "LOAD_BALANCER_TARGET_GROUP",
  "VPC"
]);

const ECS_FARGATE_TEMPLATE_SEMANTIC_MERGE_TARGETS: Readonly<Record<string, string>> = {
  "public-subnet-a": "subnet-a",
  "public-subnet-b": "subnet-b",
  "internet-gateway": "internet-gateway",
  "public-route-table": "route-table",
  "public-route-association-a": "route-a",
  "public-route-association-b": "route-b",
  "alb-security-group": "alb-security-group",
  "app-security-group": "task-security-group",
  "ecs-execution-role": "execution-role",
  "ecs-task-role": "task-role"
};

function findSemanticFixedTemplateMergeTarget(
  templateId: TemplateId,
  draftNode: ArchitectureJson["nodes"][number],
  fixedNodes: readonly ArchitectureJson["nodes"][number][]
): string | undefined {
  if (templateId !== "ecs-fargate-container-app") {
    return undefined;
  }

  const targetTemplateResourceId = ECS_FARGATE_TEMPLATE_SEMANTIC_MERGE_TARGETS[draftNode.id];
  if (!targetTemplateResourceId) {
    return undefined;
  }

  return fixedNodes.find(
    (node) => node.config.templateResourceId === targetTemplateResourceId
  )?.id;
}

function remapMergedArchitectureReferences(
  value: unknown,
  draftNodes: readonly ArchitectureJson["nodes"][number][],
  draftNodeIdMap: ReadonlyMap<string, string>
): ArchitectureJson["nodes"][number]["config"] {
  const replacements = draftNodes.flatMap((draftNode) => {
    const mergedNodeId = draftNodeIdMap.get(draftNode.id);
    const terraformResourceType = resourceDefinitions.find(
      (definition) => definition.resourceType === draftNode.type
    )?.terraform.resourceType;

    if (!mergedNodeId || !terraformResourceType || mergedNodeId === draftNode.id) {
      return [];
    }

    const sourceNames = new Set([
      draftNode.id,
      draftNode.id.replaceAll("-", "_"),
      typeof draftNode.config.terraformResourceName === "string"
        ? draftNode.config.terraformResourceName
        : undefined
    ].filter((name): name is string => Boolean(name)));
    const prefix = draftNode.config.terraformBlockType === "data" ? "data." : "";

    return [...sourceNames].map((sourceName) => ({
      from: `${prefix}${terraformResourceType}.${sourceName}`,
      to: `${prefix}${terraformResourceType}.${mergedNodeId}`
    }));
  });
  const remapValue = (entryValue: unknown): unknown => {
    if (typeof entryValue === "string") {
      let remappedValue = entryValue;
      for (const replacement of replacements) {
        remappedValue = remappedValue.replaceAll(replacement.from, replacement.to);
      }
      return remappedValue;
    }

    if (Array.isArray(entryValue)) {
      return entryValue.map(remapValue);
    }

    if (!isObjectRecord(entryValue)) {
      return entryValue;
    }

    return Object.fromEntries(
      Object.entries(entryValue).map(([key, nestedValue]) => [key, remapValue(nestedValue)])
    );
  };
  const remapped = remapValue(value);

  return isObjectRecord(remapped) ? remapped : {};
}

function isCompatibleTemplateAddition(templateId: TemplateId, resourceType: ResourceType): boolean {
  // 정적 호스팅 Template은 S3·CloudFront 경계 자체가 완결된 배포 단위입니다.
  // 상충하는 자연어 요구로 VPC/DB 보조 리소스가 붙으면 선택한 Template이
  // 다른 아키텍처로 변질되므로, 추가 Resource를 허용하지 않습니다.
  if (templateId === "static-web-hosting") {
    return false;
  }

  const incompatibleComputeTypes = new Set<ResourceType>([
    "AMPLIFY_APP",
    "AMI",
    "API_GATEWAY_REST_API",
    "AUTO_SCALING_GROUP",
    "EC2",
    "ECS_CLUSTER",
    "ECS_SERVICE",
    "ECS_TASK_DEFINITION",
    "EKS_CLUSTER",
    "KUBERNETES_DEPLOYMENT",
    "KUBERNETES_NAMESPACE",
    "KUBERNETES_SERVICE",
    "LAMBDA",
    "IAM_INSTANCE_PROFILE"
  ]);
  const allowedComputeTypes: Readonly<Record<TemplateId, ReadonlySet<ResourceType>>> = {
    "ecs-fargate-container-app": new Set([
      "ECS_CLUSTER",
      "ECS_SERVICE",
      "ECS_TASK_DEFINITION"
    ]),
    "eks-container-app": new Set([
      "EKS_CLUSTER",
      "KUBERNETES_DEPLOYMENT",
      "KUBERNETES_NAMESPACE",
      "KUBERNETES_SERVICE"
    ]),
    "full-serverless-web-app": new Set(["AMPLIFY_APP", "API_GATEWAY_REST_API", "LAMBDA"]),
    "minimal-serverless-api": new Set(["API_GATEWAY_REST_API", "LAMBDA"]),
    "static-web-hosting": new Set(),
    "three-tier-web-app": new Set(["AMI", "AUTO_SCALING_GROUP", "EC2", "IAM_INSTANCE_PROFILE"])
  };

  if (
    templateId !== "three-tier-web-app"
    && (resourceType === "CODEDEPLOY_APP" || resourceType === "CODEDEPLOY_DEPLOYMENT_GROUP")
  ) {
    return false;
  }

  return !incompatibleComputeTypes.has(resourceType) || allowedComputeTypes[templateId].has(resourceType);
}

const TEMPLATE_DATA_RESOURCE_TYPES = new Set<ResourceType>([
  "DYNAMODB_TABLE",
  "RDS",
  "RDS_CLUSTER"
]);

function findFixedTemplateWorkloadNode(
  templateId: TemplateId,
  fixedNodes: ArchitectureJson["nodes"]
): ArchitectureJson["nodes"][number] | undefined {
  const workloadTypes: Readonly<Record<TemplateId, readonly ResourceType[]>> = {
    "ecs-fargate-container-app": ["ECS_SERVICE", "ECS_TASK_DEFINITION"],
    "eks-container-app": ["KUBERNETES_DEPLOYMENT", "KUBERNETES_SERVICE"],
    "full-serverless-web-app": ["LAMBDA"],
    "minimal-serverless-api": ["LAMBDA"],
    "static-web-hosting": [],
    "three-tier-web-app": ["EC2", "AUTO_SCALING_GROUP"]
  };

  for (const resourceType of workloadTypes[templateId]) {
    const node = fixedNodes.find((candidate) => candidate.type === resourceType);
    if (node) return node;
  }

  return undefined;
}

function createUniqueTemplateMergeId(baseId: string, occupiedIds: ReadonlySet<string>): string {
  if (!occupiedIds.has(baseId)) return baseId;

  let suffix = 2;
  while (occupiedIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

function createAmazonQArchitectureBrief(prompt: string): string {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const intent = ["Architecture Intent:"];
  const requirements = ["Derived Architecture Requirements:"];
  const flows = ["Required Architecture Flows:"];
  const validation = ["Validation Checklist:"];
  const tradeoffs = ["Trade-off Notes:"];

  if (hasExplicitArchitectureBrief(prompt)) {
    intent.push("- User supplied a detailed architecture brief with explicit required components, flows, and validation criteria. Preserve those requirements unless a listed component is unsupported.");
  }

  if (requiresSpaFrontend(normalizedPrompt)) {
    intent.push("- React/Vue/Angular SPA or single-page frontend.");
    requirements.push("- Capability signal needed: frontend/app-shell delivery. S3 plus CLOUDFRONT is a supported candidate, but the selected pattern must explain the delivery choice.");
    flows.push("- User -> selected frontend/static delivery path -> app shell/assets.");
    validation.push("- requirementCoverage must explain the frontend delivery capability instead of relying on prose-only claims.");
  }

  if (hasExplicitComplexBackendMarker(normalizedPrompt) && requiresComplexBackend(normalizedPrompt)) {
    intent.push("- Backend requires complex business logic.");
    requirements.push("- Capability signal needed: backend/API entry path and runtime choice. LOAD_BALANCER/LOAD_BALANCER_LISTENER or API_GATEWAY_REST_API/LAMBDA are supported candidates depending on the selected pattern.");
    flows.push("- User/API traffic -> selected API/backend entry -> selected runtime.");
    validation.push("- requirementCoverage must explain why the backend pattern fits the business logic and operations profile.");
  }

  if (hasExplicitDatabaseMarker(normalizedPrompt) && requiresDatabase(normalizedPrompt)) {
    requirements.push("- Capability signal needed: durable data persistence. RDS/DB_SUBNET_GROUP is the supported relational representation when the selected pattern needs relational storage.");
    flows.push("- Backend/runtime -> selected durable data store.");
  }

  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    requirements.push("- ABSOLUTE CONSTRAINT: The user selected no file upload. Do not create upload/media buckets, presigned URL flows, file-processing resources, or upload-specific IAM policies.");
    validation.push("- Any S3 bucket or IAM path named upload, media, image, attachment, presigned, or file upload violates the selected no-upload answer.");
  } else if (requiresUploadStorage(normalizedPrompt)) {
    requirements.push("- Capability signal needed: upload/file handling with validation, access, lifecycle, and direct-upload assumptions when selected.");
    flows.push("- Client -> selected upload path -> selected private object storage representation.");
    validation.push("- requirementCoverage must name upload/file handling and the supported node ids or limitation.");
  }

  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    requirements.push("- ABSOLUTE CONSTRAINT: The user selected no realtime feature. Do not create WebSocket, SSE, realtime notification, or realtime processing resources.");
    validation.push("- Any WebSocket/SSE/realtime/notification-specific node, coverage entry, or assumption violates the selected no-realtime answer.");
  } else if (requiresRealtime(normalizedPrompt)) {
    requirements.push("- Capability signal needed: realtime/notification path. Use API_GATEWAY_REST_API/LAMBDA or the backend tier as the supported representation if dedicated messaging nodes are unavailable.");
    flows.push("- Client -> selected realtime/notification entry -> selected backend or serverless notification path.");
    validation.push("- requirementCoverage must name WebSocket, SSE, notification, or realtime and map it to node ids.");
  }

  if (requiresKoreaOnlyRegion(normalizedPrompt)) {
    requirements.push("- Region scope is Korea only. Keep regional API and database assumptions in Seoul/ap-northeast-2; CloudFront is allowed only as a static/performance CDN, not as a multi-region API design.");
    validation.push("- Do not ask for or imply multi-region/global-user deployment when the user selected Korea only.");
  }

  if (requiresGlobalOrFastFrontend(normalizedPrompt)) {
    requirements.push("- Capability signal needed: global/static delivery or a clear warning that API/database latency remains single-region.");
    validation.push("- Do not claim global 1-second dynamic API latency from a single region without requirementCoverage or nextActions warning.");
  }

  if (requiresVeryHighAvailability(normalizedPrompt)) {
    requirements.push("- Capability signal needed: redundancy/high availability. Use Multi-AZ, failover, redundant compute, or an explicit trade-off depending on the selected pattern.");
    validation.push("- requirementCoverage must explain the high-availability signal or an explicit reason the selected pattern cannot fully meet 99.99%.");
  }

  if (hasBudgetAvailabilityConflict(normalizedPrompt)) {
    tradeoffs.push("- Monthly $100 budget conflicts with 99.99% availability, ALB, redundant compute, and RDS Multi-AZ. Keep the selected design target and add explicit cost-warning assumptions unless the user chose to relax availability.");
  } else if (hasCostSensitiveAvailabilityConflict(normalizedPrompt)) {
    tradeoffs.push("- The selected budget is cost-sensitive for 99.99% availability, ALB, redundant Fargate services, autoscaling, and RDS Multi-AZ. Keep the selected design target and add explicit cost-warning assumptions unless the user chose to relax availability or split the rollout.");
  }

  if (mentionsAutoScalingGroup(normalizedPrompt)) {
    requirements.push("- AUTO_SCALING_GROUP is a supported ResourceNode.type. Include it directly when the user requests an Auto Scaling Group and explain its scaling role in requirementCoverage.");
  }

  return [
    "Amazon Q Architecture Brief:",
    ...dedupeNonEmptyLines(intent),
    ...dedupeNonEmptyLines(requirements),
    ...dedupeNonEmptyLines(flows),
    ...dedupeNonEmptyLines(validation),
    ...dedupeNonEmptyLines(tradeoffs)
  ].join("\n");
}

function findAmazonQPreviewValidationIssues(
  prompt: string,
  preview: AmazonQArchitectureDraftPreview,
  normalizedRequirement: ArchitectureIntentPlan | null,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined
): string[] {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const architectureJson = preview.architectureJson;
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const excludedResourceTypes = new Set(
    (candidateExclusions ?? []).map(({ resourceType }) => resourceType)
  );
  const issues: string[] = [];

  if (!isUsableCandidateArchitecture(architectureJson)) {
    issues.push(
      "The preview must contain at least one usable ResourceNode with unique ids and no dangling edges. Regenerate a non-empty valid topology or return needs_clarification."
    );
  }

  if (requiresServerlessOnlyArchitecture(normalizedPrompt) && nodeTypes.has("EC2")) {
    issues.push("The user requested serverless or no EC2, but the preview includes EC2. Regenerate without EC2 and use serverless supported resources such as LAMBDA and API_GATEWAY_REST_API when compute is needed.");
  }

  issues.push(
    ...findCandidateExclusionValidationIssues(
      architectureJson,
      candidateExclusions
    )
  );
  issues.push(
    ...findRequirementCoverageValidationIssues(
      normalizedPrompt,
      preview,
      normalizedRequirement,
      excludedResourceTypes
    )
  );
  issues.push(...findArchitectureLayoutValidationIssues(architectureJson));

  return issues;
}

function findCandidateExclusionValidationIssues(
  architectureJson: ArchitectureJson,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined
): string[] {
  if (candidateExclusions === undefined || candidateExclusions.length === 0) {
    return [];
  }

  const includedResourceTypes = new Set(
    architectureJson.nodes.map(({ type }) => type)
  );
  const violatedExclusions = candidateExclusions.filter(({ resourceType }) =>
    includedResourceTypes.has(resourceType)
  );
  if (violatedExclusions.length === 0) {
    return [];
  }

  return [
    `The preview violates the server-authorized candidate exclusion: ${violatedExclusions
      .map(({ candidateId, resourceType, label }) =>
        `${label.trim() || resourceType} (${resourceType}, ${candidateId})`
      )
      .join(", ")}. Regenerate without those ResourceNode types or return needs_clarification when no valid alternative exists.`
  ];
}

function findRequirementCoverageValidationIssues(
  normalizedPrompt: string,
  preview: AmazonQArchitectureDraftPreview,
  normalizedRequirement: ArchitectureIntentPlan | null,
  excludedResourceTypes: ReadonlySet<ResourceType> = new Set<ResourceType>()
): string[] {
  const issues: string[] = [];
  const architectureJson = preview.architectureJson;
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const coverageText = createCoverageSearchText(preview);

  if ((preview.requirementCoverage ?? []).length === 0) {
    issues.push(
      "Requirement coverage missing: every Amazon Q preview must include requirementCoverage entries that map selected answers to capabilities and node ids."
    );
  }

  issues.push(...findRequirementCoverageNodeValidationIssues(preview));

  if (!mentionsPatternDecisionCoverage(coverageText)) {
    issues.push("Requirement coverage missing: Amazon Q must record the selected pattern and rejected/alternative pattern rationale.");
  }

  issues.push(
    ...findExplicitResourceTypeValidationIssues(
      normalizedPrompt,
      architectureJson,
      excludedResourceTypes
    )
  );
  issues.push(
    ...findRequestedResourceQuantityValidationIssues(
      normalizedPrompt,
      architectureJson,
      excludedResourceTypes
    )
  );
  issues.push(...findRuntimeTopologyValidationIssues(normalizedPrompt, architectureJson));
  issues.push(
    ...findNormalizedRequirementValidationIssues(normalizedRequirement, architectureJson, {
      excludedResourceTypes,
      validateSubnetSpread: false,
      validateVisualSpread: false
    })
  );
  issues.push(...findOperationalRequirementTopologyValidationIssues(normalizedPrompt, architectureJson));

  if (requiresNoDatabase(normalizedPrompt) && (nodeTypes.has("RDS") || nodeTypes.has("DB_SUBNET_GROUP") || hasForbiddenDatabaseResource(architectureJson))) {
    issues.push("The user selected no database, but the preview includes database resources or database-specific labels/config. Regenerate without database resources.");
  }

  if (hasExplicitDatabaseMarker(normalizedPrompt) && requiresDatabase(normalizedPrompt) && !mentionsDataPersistenceCoverage(coverageText)) {
    issues.push("The user selected a data/database requirement, but requirementCoverage does not prove a data persistence capability or limitation.");
  }

  if (requiresNoBackend(normalizedPrompt) && hasAnyNodeType(nodeTypes, ["EC2", "LAMBDA", "API_GATEWAY_REST_API", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER"])) {
    issues.push("The user selected no backend, but the preview includes backend compute or API entry resources. Remove backend-only resources unless another selected answer explicitly requires them.");
  }

  if (hasNoFileUploadRequirement(normalizedPrompt) && hasForbiddenUploadResource(architectureJson)) {
    issues.push("The user selected no file upload, but the preview includes upload/media/file-upload resources. Remove upload buckets, presigned URL flows, and upload-specific IAM policies.");
  }

  if (hasNoRealtimeRequirement(normalizedPrompt) && hasForbiddenRealtimeResource(preview)) {
    issues.push("The user selected no realtime feature, but the preview includes WebSocket/SSE/realtime/notification-specific resources or coverage. Remove realtime-specific nodes, flows, assumptions, and coverage entries.");
  }

  if (requiresSpaFrontend(normalizedPrompt) && !mentionsFrontendDeliveryCoverage(coverageText)) {
    issues.push("The user selected an SPA frontend, but requirementCoverage does not explain the frontend/static delivery capability.");
  }

  if (hasExplicitComplexBackendMarker(normalizedPrompt) && requiresComplexBackend(normalizedPrompt)) {
    if (!mentionsBackendEntryCoverage(coverageText)) {
      issues.push("The user selected complex backend/business logic, but requirementCoverage does not explain the backend/API entry path and runtime choice.");
    }
  }

  if (requiresGlobalOrFastFrontend(normalizedPrompt) && !mentionsGlobalDeliveryOrLatencyWarning(coverageText)) {
    issues.push("The user selected global users, HTTPS-sensitive delivery, or a 1-second loading goal, but requirementCoverage does not mention global/static delivery or single-region latency warning.");
  }

  if (requiresUploadStorage(normalizedPrompt) && !mentionsUploadCoverage(coverageText)) {
    issues.push("The user selected file upload, but requirementCoverage does not prove upload/file handling or a supported substitute.");
  }

  if (requiresRealtime(normalizedPrompt) && !mentionsRealtimePath(coverageText)) {
    issues.push("The user selected realtime chat/notification/data updates, but requirementCoverage does not name a WebSocket, SSE, notification, or realtime path. Add a supported backend/API notification path and coverage entry.");
  }

  if (requiresVeryHighAvailability(normalizedPrompt)) {
    if (!mentionsHighAvailabilityCoverage(coverageText)) {
      issues.push("The user selected 99.99% availability/no downtime, but requirementCoverage does not prove redundancy, high availability, Multi-AZ, failover, or a clear availability trade-off.");
    }
  }

  if (hasCostSensitiveAvailabilityConflict(normalizedPrompt) && !mentionsCostWarningCoverage(coverageText)) {
    issues.push("The user selected a cost-sensitive budget with high-availability or microservices requirements, but requirementCoverage does not include a cost warning or budget-risk trade-off.");
  }

  if (requiresKoreaOnlyRegion(normalizedPrompt) && mentionsForbiddenMultiRegionScope(coverageText)) {
    issues.push("The user selected Korea-only scope, but the preview claims or implies multi-region API/database coverage.");
  }

  return issues;
}

function findOperationalRequirementTopologyValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson
): string[] {
  const result = validateArchitectureOperationalRequirements(
    resolveArchitectureOperationalRequirements(normalizedPrompt),
    architectureJson
  );

  return result.ok ? [] : [...result.issues];
}

function findNormalizedRequirementValidationIssues(
  normalizedRequirement: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson,
  options: {
    readonly excludedResourceTypes?: ReadonlySet<ResourceType>;
    readonly validateSubnetSpread?: boolean;
    readonly validateVisualSpread?: boolean;
  } = {}
): string[] {
  if (normalizedRequirement === null) {
    return [];
  }

  const issues: string[] = [];
  const actualResourceTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const excludedResourceTypes = options.excludedResourceTypes ?? new Set<ResourceType>();
  const missingResourceTypes = (normalizedRequirement.requiredResources ?? []).filter(
    (resourceType) =>
      !excludedResourceTypes.has(resourceType as ResourceType) &&
      !isResourceTypeForbiddenByPlan(normalizedRequirement, resourceType as ResourceType) &&
      !actualResourceTypes.has(resourceType as ResourceType)
  );

  if (missingResourceTypes.length > 0) {
    issues.push(
      `The normalized requirement plan requires supported ResourceNode types that are missing from the preview: ${missingResourceTypes.join(", ")}. Regenerate with visible nodes for each required normalized resource.`
    );
  }

  for (const [resourceType, quantity] of Object.entries(normalizedRequirement.resourceQuantities ?? {})) {
    const requiredResourceType = resourceType as ResourceType;

    if (
      excludedResourceTypes.has(requiredResourceType)
      || isResourceTypeForbiddenByPlan(normalizedRequirement, requiredResourceType)
    ) {
      continue;
    }

    const actualCount = architectureJson.nodes.filter((node) => node.type === requiredResourceType).length;

    if (actualCount < quantity) {
      issues.push(
        `The normalized requirement plan requires ${quantity} ${resourceType} node(s), but the preview includes ${actualCount}. Regenerate with enough visible ${resourceType} nodes.`
      );
    }
  }

  const forbiddenCapabilities = new Set(
    (normalizedRequirement.forbiddenCapabilities ?? []).map((capability) => capability.toLowerCase())
  );

  if (forbiddenCapabilities.has("file_upload") && hasForbiddenUploadResource(architectureJson)) {
    issues.push(
      "The normalized requirement plan forbids file upload, but the preview includes upload/media/file-upload resources. Remove upload buckets, media buckets, presigned URL flows, and upload-specific IAM paths."
    );
  }

  if (forbiddenCapabilities.has("realtime") && hasForbiddenRealtimeArchitectureNodes(architectureJson)) {
    issues.push(
      "The normalized requirement plan forbids realtime features, but the preview includes realtime/notification-specific resources, coverage, or assumptions. Remove realtime-specific paths."
    );
  }

  const topology = normalizedRequirement.runtimeTopology;

  if (topology !== undefined) {
    const trafficEntry = topology.trafficEntry?.toUpperCase();
    const compute = topology.compute?.toUpperCase();

    if (trafficEntry === "LOAD_BALANCER" && compute === "EC2" && !hasAlbToEc2TrafficPath(architectureJson)) {
      issues.push(
        "The normalized requirement plan requires ALB traffic to reach EC2 runtime nodes, but the preview does not show a connected ALB/listener -> ASG/target -> EC2 path."
      );
    }

    if (topology.autoScaling === true && compute === "EC2" && !hasAutoScalingGroupToEc2Path(architectureJson)) {
      issues.push(
        "The normalized requirement plan requires Auto Scaling for EC2, but the preview does not connect AUTO_SCALING_GROUP to the EC2 fleet."
      );
    }

    if (compute === "EC2" && topology.computeCount !== undefined) {
      const actualCount = architectureJson.nodes.filter((node) => node.type === "EC2").length;

      if (actualCount < topology.computeCount) {
        issues.push(
          `The normalized requirement plan requires ${topology.computeCount} EC2 runtime node(s), but the preview includes ${actualCount}. Regenerate with enough visible EC2 nodes.`
        );
      }
    }

    if (topology.spreadAcrossPrivateSubnets === true && compute === "EC2" && options.validateSubnetSpread !== false) {
      const spread = getEc2SubnetSpread(architectureJson);
      const visualSpread = getEc2VisualPrivateSubnetSpread(architectureJson);

      if (spread.privateSubnetCount < 2 || spread.ec2SubnetCount < 2) {
        issues.push(
          `The normalized requirement plan requires EC2 spread across private subnets, but the preview shows ${spread.ec2SubnetCount} private subnet placement(s) across ${spread.privateSubnetCount} private subnet node(s).`
        );
      }

      if (
        options.validateVisualSpread !== false &&
        visualSpread.privateSubnetCount >= 2 &&
        visualSpread.ec2SubnetCount < 2
      ) {
        issues.push(
          `The normalized requirement plan requires EC2 to be visually spread across private subnets, but the preview places EC2 nodes across only ${visualSpread.ec2SubnetCount} private subnet box(es).`
        );
      }
    }
  }

  return issues;
}

export function createDeterministicArchitectureIntentPlan(prompt: string): ArchitectureIntentPlan | null {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const requiredResources = new Set<ResourceType>(findExplicitResourceTypesInPrompt(normalizedPrompt));
  const resourceQuantities: Record<string, number> = {};
  const forbiddenCapabilities = new Set<string>();
  const patternIds = new Set<string>();
  const amazonQBrief: string[] = [];
  const quantities = resolveArchitectureResourceQuantities(prompt);
  const fargateRuntime = requiresFargateArchitecture(normalizedPrompt);
  const selfManagedRuntime = requiresSelfManagedEc2Architecture(normalizedPrompt);
  const ssrFrontend = requiresSsrFrontend(normalizedPrompt);
  const uploadStorageRequired = requiresUploadStorage(normalizedPrompt);
  const forbidsEc2Runtime = explicitlyForbidsEc2Runtime(normalizedPrompt) || fargateRuntime;
  const fargateServiceCount = resolveFargateServiceCount(normalizedPrompt);
  const lowBudgetDbFreeApi = requiresLowBudgetDbFreeApi(normalizedPrompt);
  const cloudFrontStaticDeliveryRequired = requiresCloudFrontStaticDelivery(normalizedPrompt);
  const serverlessApiRuntime = requiresServerlessApiArchitecture(normalizedPrompt);
  const staticDeliveryRequired = requiresStaticDeliveryArchitecture(normalizedPrompt);
  const awsNativeCiCdPipelineRequired = requiresAwsNativeCiCdPipeline(normalizedPrompt);

  if (staticDeliveryRequired) {
    patternIds.add("spa-cloudfront-s3");
    requiredResources.add("CLOUDFRONT");
    requiredResources.add("S3");
    amazonQBrief.push("Use a CloudFront plus S3 static delivery path because the user selected a static site with no backend.");
  } else if (lowBudgetDbFreeApi) {
    patternIds.add("serverless-api");
    requiredResources.add("API_GATEWAY_REST_API");
    requiredResources.add("LAMBDA");
    requiredResources.add("LAMBDA_PERMISSION");
    requiredResources.add("IAM_ROLE");
    requiredResources.add("IAM_POLICY");
    requiredResources.add("CLOUDWATCH_LOG_GROUP");
    requiredResources.add("CLOUDWATCH_METRIC_ALARM");
    forbiddenCapabilities.add("ec2_runtime");
    forbiddenCapabilities.add("load_balancer");
    amazonQBrief.push("Use a low-cost API Gateway plus Lambda API path because the final budget decision excludes the database.");
  } else if (serverlessApiRuntime) {
    patternIds.add("serverless-api");
    requiredResources.add("API_GATEWAY_REST_API");
    requiredResources.add("LAMBDA");
    forbiddenCapabilities.add("ec2_runtime");
    forbiddenCapabilities.add("load_balancer");

    if (requiresSpaFrontend(normalizedPrompt)) {
      patternIds.add("spa-cloudfront-s3");
      requiredResources.add("CLOUDFRONT");
      requiredResources.add("S3");
    }

    if (requiresDatabase(normalizedPrompt)) {
      requiredResources.add("DYNAMODB_TABLE");
    }

    amazonQBrief.push("Use API Gateway plus Lambda for the fully managed simple API runtime.");
  } else if (selfManagedRuntime) {
    patternIds.add("alb-asg-ec2");
    if (requiresSpaFrontend(normalizedPrompt)) {
      patternIds.add("spa-cloudfront-s3");
      if (cloudFrontStaticDeliveryRequired) {
        requiredResources.add("CLOUDFRONT");
        requiredResources.add("S3");
      }
    }
    if (requiresDatabase(normalizedPrompt)) {
      patternIds.add("multi-az-rds");
    }
    resourceQuantities.EC2 = Math.max(
      resourceQuantities.EC2 ?? 0,
      resolveEc2FleetCapacity(normalizedPrompt)
    );
    amazonQBrief.push("Use an ALB to EC2 Auto Scaling Group runtime because the user selected direct server management.");
  } else if (fargateRuntime) {
    patternIds.add("ecs-fargate");
    if (requiresSpaFrontend(normalizedPrompt)) {
      patternIds.add("spa-cloudfront-s3");
      if (cloudFrontStaticDeliveryRequired) {
        requiredResources.add("CLOUDFRONT");
        requiredResources.add("S3");
      }
    } else if (ssrFrontend) {
      requiredResources.add("CLOUDFRONT");
      amazonQBrief.push("Use CloudFront as an HTTPS/CDN entry to the ALB for SSR, not as an S3 static-site origin.");
    }
    if (requiresDatabase(normalizedPrompt)) {
      patternIds.add("multi-az-rds");
    }
    requiredResources.add("ECS_CLUSTER");
    requiredResources.add("ECS_SERVICE");
    requiredResources.add("ECS_TASK_DEFINITION");
    requiredResources.add("ECR_REPOSITORY");
    requiredResources.add("LOAD_BALANCER");
    requiredResources.add("LOAD_BALANCER_TARGET_GROUP");
    forbiddenCapabilities.add("ec2_runtime");
    amazonQBrief.push("Use ECS Fargate tasks in private subnets without EC2 capacity resources.");

    if (fargateServiceCount > 1) {
      requiredResources.add("APPLICATION_AUTO_SCALING_TARGET");
      requiredResources.add("APPLICATION_AUTO_SCALING_POLICY");
      resourceQuantities.ECS_SERVICE = fargateServiceCount;
      resourceQuantities.ECS_TASK_DEFINITION = fargateServiceCount;
      resourceQuantities.LOAD_BALANCER_TARGET_GROUP = fargateServiceCount;
      resourceQuantities.APPLICATION_AUTO_SCALING_TARGET = fargateServiceCount;
      resourceQuantities.APPLICATION_AUTO_SCALING_POLICY = fargateServiceCount;
      resourceQuantities.CLOUDWATCH_LOG_GROUP = fargateServiceCount;
      amazonQBrief.push("Represent microservices as separate Fargate services, task definitions, target groups, and autoscaling policies.");
    }
  } else if (forbidsEc2Runtime) {
    forbiddenCapabilities.add("ec2_runtime");
  }

  if (uploadStorageRequired) {
    requiredResources.add("S3");
    resourceQuantities.S3 = Math.max(resourceQuantities.S3 ?? 0, requiresSpaFrontend(normalizedPrompt) ? 2 : 1);
  }

  if (requiresAlbEc2TrafficPath(normalizedPrompt)) {
    requiredResources.add("LOAD_BALANCER");
    requiredResources.add("EC2");
    amazonQBrief.push("Route user traffic through a visible load balancer path to the EC2 runtime.");
  }

  if (mentionsAutoScalingGroup(normalizedPrompt)) {
    requiredResources.add("AUTO_SCALING_GROUP");
    amazonQBrief.push("Include a visible Auto Scaling Group when autoscaling is requested.");
  }

  if (requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt)) {
    requiredResources.add("AUTO_SCALING_GROUP");
    requiredResources.add("EC2");
  }

  if (requiresEc2PrivateSubnetSplit(normalizedPrompt)) {
    requiredResources.add("EC2");
    amazonQBrief.push("Place EC2 runtime nodes across at least two private subnet boxes, not visually grouped into one subnet.");
  }

  if (awsNativeCiCdPipelineRequired) {
    patternIds.add("github-cicd-codedeploy");
    requiredResources.add("CODESTAR_CONNECTION");
    requiredResources.add("CODEPIPELINE");
    requiredResources.add("CODEBUILD_PROJECT");
    requiredResources.add("CODEDEPLOY_APP");
    requiredResources.add("CODEDEPLOY_DEPLOYMENT_GROUP");
    requiredResources.add("S3");
    requiredResources.add("IAM_ROLE");
    amazonQBrief.push("Include a Git/CI/CD handoff path with CodeStar Connection, CodePipeline, CodeBuild, CodeDeploy, and an S3 artifact bucket.");
  } else {
    for (const resourceType of [
      "CODESTAR_CONNECTION",
      "CODEPIPELINE",
      "CODEBUILD_PROJECT",
      "CODEDEPLOY_APP",
      "CODEDEPLOY_DEPLOYMENT_GROUP"
    ] as const) {
      requiredResources.delete(resourceType);
    }
  }

  if (forbidsEc2Runtime) {
    for (const resourceType of [
      "EC2",
      "AMI",
      "IAM_INSTANCE_PROFILE",
      "LAUNCH_TEMPLATE",
      "AUTO_SCALING_GROUP",
      "AUTO_SCALING_POLICY",
      "ECS_CAPACITY_PROVIDER"
    ] as const) {
      requiredResources.delete(resourceType);
    }
  }

  if (quantities.ec2Instances > 1 || requiredResources.has("EC2")) {
    resourceQuantities.EC2 = Math.max(resourceQuantities.EC2 ?? 0, quantities.ec2Instances);
  }

  if (quantities.s3Buckets > 1 && requiredResources.has("S3")) {
    resourceQuantities.S3 = Math.max(resourceQuantities.S3 ?? 0, quantities.s3Buckets);
  }

  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    forbiddenCapabilities.add("file_upload");
    amazonQBrief.push("Do not include upload/media/file-upload resources when file upload is excluded.");
  }

  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    forbiddenCapabilities.add("realtime");
    amazonQBrief.push("Do not include realtime, notification, WebSocket, or SSE-specific resources when realtime is excluded.");
  }

  if (requiresNoDatabase(normalizedPrompt)) {
    forbiddenCapabilities.add("database");
    amazonQBrief.push("The final answer excludes the database. Do not include RDS, DB subnet groups, database subnets, database security groups, Secrets Manager database credentials, or database-specific labels.");
  }

  if (forbiddenCapabilities.has("database")) {
    patternIds.delete("multi-az-rds");
    for (const resourceType of [
      "RDS",
      "DB_SUBNET_GROUP",
      "SECRETS_MANAGER_SECRET"
    ] as const) {
      requiredResources.delete(resourceType);
      delete resourceQuantities[resourceType];
    }
  }

  const runtimeTopology = createDeterministicRuntimeTopology(normalizedPrompt, quantities.ec2Instances);
  const plan: ArchitectureIntentPlan = {
    ...(patternIds.size === 0 ? {} : { patternIds: [...patternIds] }),
    ...(requiredResources.size === 0 ? {} : { requiredResources: [...requiredResources] }),
    ...(Object.keys(resourceQuantities).length === 0 ? {} : { resourceQuantities }),
    ...(forbiddenCapabilities.size === 0 ? {} : { forbiddenCapabilities: [...forbiddenCapabilities] }),
    ...(runtimeTopology === undefined ? {} : { runtimeTopology }),
    ...(requiresKoreaOnlyRegion(normalizedPrompt)
      ? { region: "ap-northeast-2" }
      : requiresApacRegion(normalizedPrompt)
        ? { region: "ap-northeast-1" }
        : {}),
    ...(requiresNoDatabase(normalizedPrompt) ? { database: "none" } : requiresDatabase(normalizedPrompt) ? { database: "required" } : {}),
    ...(requiresVeryHighAvailability(normalizedPrompt) ? { availability: "99.99" } : {}),
    ...(amazonQBrief.length === 0 ? {} : { amazonQBrief })
  };

  return Object.keys(plan).length === 0 ? null : plan;
}

function createDeterministicRuntimeTopology(
  normalizedPrompt: string,
  ec2Count: number
): ArchitectureIntentPlan["runtimeTopology"] {
  const topology: NonNullable<ArchitectureIntentPlan["runtimeTopology"]> = {};

  if (requiresLowBudgetDbFreeApi(normalizedPrompt) || requiresServerlessApiArchitecture(normalizedPrompt)) {
    return {
      trafficEntry: "API_GATEWAY_REST_API",
      compute: "LAMBDA"
    };
  }

  if (requiresSelfManagedEc2Architecture(normalizedPrompt)) {
    return {
      trafficEntry: "LOAD_BALANCER",
      compute: "EC2",
      placement: "private_subnets",
      spreadAcrossPrivateSubnets: true,
      autoScaling: true,
      computeCount: Math.max(ec2Count, resolveEc2FleetCapacity(normalizedPrompt))
    };
  }

  if (requiresFargateArchitecture(normalizedPrompt)) {
    return {
      trafficEntry: "LOAD_BALANCER",
      compute: "ECS_FARGATE",
      placement: "private_subnets",
      autoScaling: true
    };
  }

  if (explicitlyForbidsEc2Runtime(normalizedPrompt) && hasPromptTerm(normalizedPrompt, ["lambda", "serverless", "람다", "서버리스"])) {
    return {
      trafficEntry: "API_GATEWAY_REST_API",
      compute: "LAMBDA"
    };
  }

  if (requiresAlbEc2TrafficPath(normalizedPrompt)) {
    topology.trafficEntry = "LOAD_BALANCER";
    topology.compute = "EC2";
  }

  if (requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt)) {
    topology.compute = "EC2";
    topology.autoScaling = true;
  }

  if (requiresEc2PrivateSubnetSplit(normalizedPrompt)) {
    topology.compute = "EC2";
    topology.placement = "private_subnets";
    topology.spreadAcrossPrivateSubnets = true;
  }

  if (topology.compute === "EC2" && ec2Count > 1) {
    topology.computeCount = ec2Count;
  }

  return Object.keys(topology).length === 0 ? undefined : topology;
}

function mergeArchitectureIntentPlans(
  providerPlan: ArchitectureIntentPlan | null,
  deterministicPlan: ArchitectureIntentPlan | null
): ArchitectureIntentPlan | null {
  if (providerPlan === null) {
    return deterministicPlan;
  }

  if (deterministicPlan === null) {
    return providerPlan;
  }

  const requiredResources = mergeUniqueTextItems(providerPlan.requiredResources, deterministicPlan.requiredResources);
  const patternIds = mergeUniqueTextItems(providerPlan.patternIds, deterministicPlan.patternIds);
  const forbiddenCapabilities = mergeUniqueTextItems(
    providerPlan.forbiddenCapabilities,
    deterministicPlan.forbiddenCapabilities
  );
  const amazonQBrief = mergeUniqueTextItems(providerPlan.amazonQBrief, deterministicPlan.amazonQBrief);
  const resourceQuantities = mergeResourceQuantityPlans(
    providerPlan.resourceQuantities,
    deterministicPlan.resourceQuantities
  );
  const runtimeTopology = sanitizeMergedRuntimeTopology(
    mergeRuntimeTopologyPlans(providerPlan.runtimeTopology, deterministicPlan.runtimeTopology),
    requiredResources,
    forbiddenCapabilities
  );
  const merged: ArchitectureIntentPlan = {
    ...(providerPlan.intent === undefined ? {} : { intent: providerPlan.intent }),
    ...(providerPlan.region === undefined && deterministicPlan.region === undefined
      ? {}
      : { region: deterministicPlan.region ?? providerPlan.region }),
    ...(patternIds.length === 0 ? {} : { patternIds }),
    ...(requiredResources.length === 0 ? {} : { requiredResources }),
    ...(Object.keys(resourceQuantities).length === 0 ? {} : { resourceQuantities }),
    ...(forbiddenCapabilities.length === 0 ? {} : { forbiddenCapabilities }),
    ...(runtimeTopology === undefined ? {} : { runtimeTopology }),
    ...(providerPlan.database === undefined && deterministicPlan.database === undefined
      ? {}
      : { database: deterministicPlan.database ?? providerPlan.database }),
    ...(providerPlan.availability === undefined && deterministicPlan.availability === undefined
      ? {}
      : { availability: deterministicPlan.availability ?? providerPlan.availability }),
    ...(amazonQBrief.length === 0 ? {} : { amazonQBrief })
  };

  return Object.keys(merged).length === 0 ? null : merged;
}

function mergeUniqueTextItems(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): string[] {
  const items = new Set<string>();

  for (const item of [...(left ?? []), ...(right ?? [])]) {
    const trimmed = item.trim();

    if (trimmed.length > 0) {
      items.add(trimmed);
    }
  }

  return [...items];
}

function mergeResourceQuantityPlans(
  providerQuantities: Record<string, number> | undefined,
  deterministicQuantities: Record<string, number> | undefined
): Record<string, number> {
  const merged: Record<string, number> = {};

  for (const [resourceType, quantity] of Object.entries(providerQuantities ?? {})) {
    merged[resourceType] = quantity;
  }

  for (const [resourceType, quantity] of Object.entries(deterministicQuantities ?? {})) {
    merged[resourceType] = Math.max(merged[resourceType] ?? 0, quantity);
  }

  return merged;
}

function mergeRuntimeTopologyPlans(
  providerTopology: ArchitectureIntentPlan["runtimeTopology"],
  deterministicTopology: ArchitectureIntentPlan["runtimeTopology"]
): ArchitectureIntentPlan["runtimeTopology"] {
  if (providerTopology === undefined) {
    return deterministicTopology;
  }

  if (deterministicTopology === undefined) {
    return providerTopology;
  }

  return {
    ...providerTopology,
    ...deterministicTopology,
    computeCount:
      providerTopology.computeCount === undefined && deterministicTopology.computeCount === undefined
        ? undefined
        : Math.max(providerTopology.computeCount ?? 0, deterministicTopology.computeCount ?? 0)
  };
}

function sanitizeMergedRuntimeTopology(
  topology: ArchitectureIntentPlan["runtimeTopology"],
  requiredResources: readonly string[],
  forbiddenCapabilities: readonly string[]
): ArchitectureIntentPlan["runtimeTopology"] {
  if (topology === undefined) {
    return undefined;
  }

  const forbidden = new Set(forbiddenCapabilities.map((capability) => capability.toLowerCase()));
  const resources = new Set(requiredResources);
  const sanitized: NonNullable<ArchitectureIntentPlan["runtimeTopology"]> = { ...topology };

  if (forbidden.has("load_balancer") && sanitized.trafficEntry?.toUpperCase() === "LOAD_BALANCER") {
    delete sanitized.trafficEntry;
  }

  if (forbidden.has("ec2_runtime") && sanitized.compute?.toUpperCase() === "EC2") {
    if (resources.has("EKS_CLUSTER")) {
      sanitized.compute = "EKS_CLUSTER";
    } else if (resources.has("ECS_SERVICE") || resources.has("ECS_TASK_DEFINITION")) {
      sanitized.compute = "ECS_FARGATE";
    } else if (resources.has("LAMBDA")) {
      sanitized.compute = "LAMBDA";
    } else {
      delete sanitized.compute;
    }
    delete sanitized.computeCount;
    delete sanitized.spreadAcrossPrivateSubnets;
  }

  return Object.keys(sanitized).length === 0 ? undefined : sanitized;
}

function createAmazonQPlanDraftResult(
  response: AmazonQArchitectureDraftPlan,
  request: CreateArchitectureDraftRequest,
  normalizedRequirement: ArchitectureIntentPlan | null,
  providerMetadata: AiProviderMetadata
): AiArchitectureDraftResult {
  const providerPlanIsCanonical = (response.plan.patternIds?.length ?? 0) > 0;
  const plan = applyRepositoryEvidencePriorityToRequirementPlan(
    applyFixedTemplatePriorityToRequirementPlan(
      normalizeArchitecturePlanTopologyInvariants(
        reconcileCanonicalProviderPlan(
          providerPlanIsCanonical
            ? response.plan
            : mergeArchitectureIntentPlans(response.plan, normalizedRequirement),
          response.plan
        ),
        request.prompt
      ),
      request.templateId
    ),
    request
  );
  const requestDraft = createArchitectureDraft(request);
  const draft = createArchitectureDraft({
    ...request,
    prompt: createArchitecturePlanMaterializationPrompt(request.prompt, plan)
  });
  const sanitizedArchitectureJson = applyArchitecturePlanExclusions(draft.architectureJson, plan);
  const roleSanitizedArchitectureJson = removeConflictingCanonicalPatternResources(
    sanitizedArchitectureJson,
    plan
  );
  const canonicalArchitectureJson = configureCanonicalPatternResources(
    ensureCanonicalPlanResources(roleSanitizedArchitectureJson, plan),
    plan,
    request.prompt
  );
  const securedCanonicalArchitectureJson = configureRequiredHttpsTransport(
    canonicalArchitectureJson,
    request.prompt
  );
  const connectedCanonicalArchitectureJson = connectCanonicalPatternTopologies(
    securedCanonicalArchitectureJson,
    plan?.patternIds ?? [],
    request.prompt
  );
  const topologyConnectedArchitectureJson = connectArchitecturePlanRuntimeTopology(
    connectedCanonicalArchitectureJson,
    plan?.runtimeTopology
  );
  const materializedArchitectureJson = applyArchitectureParameterCompletenessDefaults(applyArchitectureOperationalPolicy(
    topologyConnectedArchitectureJson,
    resolveArchitectureOperationalRequirements(request.prompt)
  ));
  const architectureJson = applyStrictRepositoryEvidencePolicy(
    {
      architectureJson: materializedArchitectureJson,
      title: response.title,
      metadata: requestDraft.metadata
    },
    request
  ).architectureJson;
  const validationIssues = [
    ...(usesStrictEcsRepositoryEvidence(request)
      ? findStrictRepositoryEvidenceValidationIssues(request, architectureJson)
      : findMaterializedArchitecturePlanValidationIssues(
          request.prompt,
          plan,
          architectureJson,
          request.candidateExclusions
        )),
    ...(usesStrictEcsRepositoryEvidence(request)
      ? findCandidateExclusionValidationIssues(
          architectureJson,
          request.candidateExclusions
        )
      : [])
  ];

  if (validationIssues.length > 0) {
    throw createRequirementsUnsatisfiedError(validationIssues);
  }

  const assumptions = mergeUniqueTextItems(
    response.assumptions,
    createDeterministicArchitectureAssumptions(request.prompt)
  );
  const explanations = [...(response.explanations ?? [])];
  const title = createKoreanArchitectureDraftTitle(response.title, architectureJson);

  return {
    architectureJson,
    title,
    metadata: {
      ...requestDraft.metadata,
      source: "amazon_q",
      assumptions: assumptions.length === 0 ? requestDraft.metadata.assumptions : assumptions,
      explanations: explanations.length === 0 ? requestDraft.metadata.explanations : explanations
    },
    llmExplanation: {
      target: ARCHITECTURE_DRAFT_TARGET,
      summary: `${title}을 생성했습니다.`,
      highlights: createKoreanArchitectureDraftHighlights(explanations, architectureJson),
      nextActions: ["Terraform IaC Preview에서 생성 가능한 설정과 참조를 검토하세요."],
      fallbackUsed: false,
      providerMetadata
    }
  };
}

function createDeterministicArchitectureAssumptions(prompt: string): string[] {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const assumptions: string[] = [];

  if (requiresNoDatabase(normalizedPrompt)) {
    assumptions.push("Database is excluded by the final DB-free answer; use API/storage assumptions until the user accepts a database-backed design.");
  }

  if (resolveRealtimeTransport(normalizedPrompt) === "polling") {
    assumptions.push("Polling is represented as periodic HTTPS API requests; validate interval, cache headers, and client backoff because polling can increase API Gateway, Lambda, or backend cost during traffic spikes.");
  }

  return assumptions;
}

// 최종 `직접 관리` 선택은 Provider plan의 EC2 금지보다 우선하도록 맞춥니다.
function normalizeArchitecturePlanTopologyInvariants(
  plan: ArchitectureIntentPlan | null,
  prompt: string
): ArchitectureIntentPlan | null {
  if (plan === null) {
    return plan;
  }

  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const patternIds = new Set(plan.patternIds ?? []);
  const usesEksRuntime = (plan.requiredResources ?? []).some(
    (resourceType) => resourceType === "EKS_CLUSTER" || resourceType === "EKS_NODE_GROUP"
  );
  const usesSelfManagedEc2 =
    !usesEksRuntime && requiresSelfManagedEc2Architecture(normalizedPrompt);
  const forbiddenCapabilities = usesSelfManagedEc2
    ? plan.forbiddenCapabilities?.filter(
        (capability) => capability.toLowerCase() !== "ec2_runtime"
      )
    : plan.forbiddenCapabilities;

  if (usesSelfManagedEc2) {
    patternIds.delete("ecs-fargate");
    patternIds.delete("serverless-api");
    patternIds.add("alb-asg-ec2");
    if (requiresSpaFrontend(normalizedPrompt)) {
      patternIds.add("spa-cloudfront-s3");
    }
    if (requiresDatabase(normalizedPrompt)) {
      patternIds.add("multi-az-rds");
    }
  }

  const usesEc2Pattern = patternIds.has("alb-asg-ec2");
  const usesFargatePattern =
    !usesEksRuntime &&
    patternIds.has("ecs-fargate") &&
    !patternIds.has("serverless-api");
  const operationalRequirements = resolveArchitectureOperationalRequirements(prompt);
  const topology = plan.runtimeTopology;
  const requiresEc2Spread =
    topology?.compute?.toUpperCase() === "EC2" &&
    topology.spreadAcrossPrivateSubnets === true;

  if (
    !usesEc2Pattern &&
    !usesFargatePattern &&
    !requiresEc2Spread &&
    !operationalRequirements.voiceTranscription
  ) {
    return plan;
  }

  const hasDatabase = patternIds.has("multi-az-rds");
  const hasSpaStaticDelivery = patternIds.has("spa-cloudfront-s3");
  const cloudFrontStaticDeliveryRequired = hasSpaStaticDelivery && requiresCloudFrontStaticDelivery(normalizedPrompt);
  const loadBalancerForbidden = (plan.forbiddenCapabilities ?? []).some(
    (capability) => capability.toLowerCase() === "load_balancer"
  );
  const requiredResources = new Set(plan.requiredResources ?? []);
  const resourceQuantities = { ...(plan.resourceQuantities ?? {}) };
  const hasCiCdHandoff =
    patternIds.has("github-cicd-codedeploy") ||
    requiredResources.has("CODEBUILD_PROJECT") ||
    requiredResources.has("CODEPIPELINE") ||
    requiredResources.has("CODESTAR_CONNECTION");
  const fargateServiceCount = usesFargatePattern ? resolveFargateServiceCount(normalizedPrompt) : 1;

  if (usesSelfManagedEc2) {
    for (const resourceType of [
      "ECS_CLUSTER",
      "ECS_SERVICE",
      "ECS_TASK_DEFINITION",
      "ECR_REPOSITORY",
      "APPLICATION_AUTO_SCALING_TARGET",
      "APPLICATION_AUTO_SCALING_POLICY",
      "API_GATEWAY_REST_API",
      "API_GATEWAY_RESOURCE",
      "API_GATEWAY_METHOD",
      "API_GATEWAY_INTEGRATION",
      "API_GATEWAY_DEPLOYMENT",
      "API_GATEWAY_STAGE",
      "LAMBDA",
      "LAMBDA_PERMISSION"
    ]) {
      requiredResources.delete(resourceType as ResourceType);
      delete resourceQuantities[resourceType];
    }
  }

  if (operationalRequirements.voiceTranscription) {
    requiredResources.add("S3");
    requiredResources.add("IAM_POLICY");
    resourceQuantities.S3 = Math.max(resourceQuantities.S3 ?? 0, 1);
  }
  if (resolveRealtimeTransport(normalizedPrompt) === "websocket") {
    requiredResources.add("API_GATEWAY_WEBSOCKET_API");
    requiredResources.add("API_GATEWAY_V2_ROUTE");
    requiredResources.add("API_GATEWAY_V2_INTEGRATION");
    requiredResources.add("API_GATEWAY_V2_STAGE");
  }
  const computeCount = Math.max(
    2,
    topology?.computeCount ?? 0,
    resourceQuantities.EC2 ?? 0
  );

  if (usesEc2Pattern) {
    for (const resourceType of [
      "VPC",
      "SUBNET",
      "INTERNET_GATEWAY",
      "ELASTIC_IP",
      "NAT_GATEWAY",
      "ROUTE_TABLE",
      "ROUTE_TABLE_ASSOCIATION",
      "SECURITY_GROUP",
      "LOAD_BALANCER",
      "LOAD_BALANCER_LISTENER",
      "LOAD_BALANCER_TARGET_GROUP",
      "AMI",
      "IAM_ROLE",
      "IAM_POLICY",
      "IAM_INSTANCE_PROFILE",
      "LAUNCH_TEMPLATE",
      "AUTO_SCALING_GROUP",
      "AUTO_SCALING_POLICY",
      "EC2",
      "CLOUDWATCH_LOG_GROUP",
      "CLOUDWATCH_METRIC_ALARM"
    ]) {
      requiredResources.add(resourceType);
    }

    if (hasDatabase) {
      requiredResources.add("DB_SUBNET_GROUP");
      requiredResources.add("RDS");
      requiredResources.add("SECRETS_MANAGER_SECRET");
    }

    if (cloudFrontStaticDeliveryRequired) {
      requiredResources.add("CLOUDFRONT");
      requiredResources.add("S3");
    }

    resourceQuantities.SUBNET = Math.max(resourceQuantities.SUBNET ?? 0, hasDatabase ? 6 : 4);
    resourceQuantities.ELASTIC_IP = Math.max(resourceQuantities.ELASTIC_IP ?? 0, 2);
    resourceQuantities.NAT_GATEWAY = Math.max(resourceQuantities.NAT_GATEWAY ?? 0, 2);
    resourceQuantities.ROUTE_TABLE = Math.max(resourceQuantities.ROUTE_TABLE ?? 0, 3);
    resourceQuantities.ROUTE_TABLE_ASSOCIATION = Math.max(
      resourceQuantities.ROUTE_TABLE_ASSOCIATION ?? 0,
      hasDatabase ? 6 : 4
    );
    resourceQuantities.SECURITY_GROUP = Math.max(
      resourceQuantities.SECURITY_GROUP ?? 0,
      hasDatabase ? 3 : 2
    );
    resourceQuantities.CLOUDWATCH_METRIC_ALARM = Math.max(
      resourceQuantities.CLOUDWATCH_METRIC_ALARM ?? 0,
      hasDatabase ? 2 : 1
    );

    if (requiresUploadStorage(normalizedPrompt)) {
      requiredResources.add("S3");
      resourceQuantities.S3 = Math.max(
        resourceQuantities.S3 ?? 0,
        patternIds.has("spa-cloudfront-s3") ? 2 : 1
      );
    }

    if (requiresHttpsTransport(normalizedPrompt)) {
      requiredResources.add("ACM_CERTIFICATE");
    }
  }

  if (usesFargatePattern) {
    const usesEcsAutoScaling =
      topology?.autoScaling === true ||
      resolveTrafficProfile(normalizedPrompt) === "bursty" ||
      requiresTimeVaryingTraffic(normalizedPrompt) ||
      fargateServiceCount > 1;

    for (const resourceType of [
      "VPC",
      "SUBNET",
      "INTERNET_GATEWAY",
      "ELASTIC_IP",
      "NAT_GATEWAY",
      "ROUTE_TABLE",
      "ROUTE_TABLE_ASSOCIATION",
      "SECURITY_GROUP",
      "LOAD_BALANCER",
      "LOAD_BALANCER_LISTENER",
      "LOAD_BALANCER_TARGET_GROUP",
      "ECR_REPOSITORY",
      "ECS_CLUSTER",
      "ECS_SERVICE",
      "ECS_TASK_DEFINITION",
      "IAM_ROLE",
      "IAM_POLICY",
      "CLOUDWATCH_LOG_GROUP",
      "CLOUDWATCH_METRIC_ALARM"
    ] as const) {
      if (
        loadBalancerForbidden &&
        ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP"].includes(
          resourceType
        )
      ) {
        continue;
      }
      requiredResources.add(resourceType);
    }

    if (usesEcsAutoScaling) {
      requiredResources.add("APPLICATION_AUTO_SCALING_TARGET");
      requiredResources.add("APPLICATION_AUTO_SCALING_POLICY");
    }

    if (!loadBalancerForbidden && requiresHttpsTransport(normalizedPrompt)) {
      requiredResources.add("ACM_CERTIFICATE");
    }

    if (hasDatabase) {
      requiredResources.add("DB_SUBNET_GROUP");
      requiredResources.add("RDS");
      requiredResources.add("SECRETS_MANAGER_SECRET");
    }

    if (cloudFrontStaticDeliveryRequired) {
      requiredResources.add("CLOUDFRONT");
      requiredResources.add("S3");
    }

    resourceQuantities.SUBNET = Math.max(resourceQuantities.SUBNET ?? 0, hasDatabase ? 6 : 4);
    resourceQuantities.ELASTIC_IP = Math.max(resourceQuantities.ELASTIC_IP ?? 0, 2);
    resourceQuantities.NAT_GATEWAY = Math.max(resourceQuantities.NAT_GATEWAY ?? 0, 2);
    resourceQuantities.ROUTE_TABLE = Math.max(resourceQuantities.ROUTE_TABLE ?? 0, 3);
    resourceQuantities.ROUTE_TABLE_ASSOCIATION = Math.max(
      resourceQuantities.ROUTE_TABLE_ASSOCIATION ?? 0,
      hasDatabase ? 6 : 4
    );
    const requiredSecurityGroupCount =
      (loadBalancerForbidden ? 1 : 2) + (hasDatabase ? 1 : 0);
    resourceQuantities.SECURITY_GROUP = loadBalancerForbidden
      ? requiredSecurityGroupCount
      : Math.max(resourceQuantities.SECURITY_GROUP ?? 0, requiredSecurityGroupCount);
    resourceQuantities.IAM_ROLE = Math.max(
      resourceQuantities.IAM_ROLE ?? 0,
      hasCiCdHandoff ? 4 : 2
    );
    resourceQuantities.CLOUDWATCH_METRIC_ALARM = Math.max(
      resourceQuantities.CLOUDWATCH_METRIC_ALARM ?? 0,
      hasDatabase ? 2 : 1
    );

    resourceQuantities.ECS_SERVICE = Math.max(resourceQuantities.ECS_SERVICE ?? 0, fargateServiceCount);
    resourceQuantities.ECS_TASK_DEFINITION = Math.max(resourceQuantities.ECS_TASK_DEFINITION ?? 0, fargateServiceCount);
    if (!loadBalancerForbidden) {
      resourceQuantities.LOAD_BALANCER_TARGET_GROUP = Math.max(
        resourceQuantities.LOAD_BALANCER_TARGET_GROUP ?? 0,
        fargateServiceCount
      );
    }
    resourceQuantities.CLOUDWATCH_LOG_GROUP = Math.max(
      resourceQuantities.CLOUDWATCH_LOG_GROUP ?? 0,
      fargateServiceCount
    );
    resourceQuantities.CLOUDWATCH_METRIC_ALARM = Math.max(
      resourceQuantities.CLOUDWATCH_METRIC_ALARM ?? 0,
      fargateServiceCount + (hasDatabase ? 1 : 0)
    );

    if (usesEcsAutoScaling) {
      resourceQuantities.APPLICATION_AUTO_SCALING_TARGET = Math.max(
        resourceQuantities.APPLICATION_AUTO_SCALING_TARGET ?? 0,
        fargateServiceCount
      );
      resourceQuantities.APPLICATION_AUTO_SCALING_POLICY = Math.max(
        resourceQuantities.APPLICATION_AUTO_SCALING_POLICY ?? 0,
        fargateServiceCount
      );
    }

    if (requiresUploadStorage(normalizedPrompt)) {
      requiredResources.add("S3");
      resourceQuantities.S3 = Math.max(
        resourceQuantities.S3 ?? 0,
        patternIds.has("spa-cloudfront-s3") ? 2 : 1
      );
    }
  }

  if (usesEc2Pattern || requiresEc2Spread) {
    resourceQuantities.EC2 = computeCount;
  }

  return {
    ...plan,
    ...(forbiddenCapabilities === undefined ? {} : { forbiddenCapabilities }),
    patternIds: [...patternIds],
    requiredResources: [...requiredResources],
    resourceQuantities,
    runtimeTopology: {
      ...topology,
      ...(usesEc2Pattern
        ? {
            trafficEntry: "LOAD_BALANCER",
            compute: "EC2",
            placement: "private_subnets",
            spreadAcrossPrivateSubnets: true,
            autoScaling: true
          }
        : usesFargatePattern
          ? {
              trafficEntry: "LOAD_BALANCER",
              compute: "ECS_FARGATE",
              placement: "private_subnets",
              autoScaling:
                topology?.autoScaling === true ||
                resolveTrafficProfile(normalizedPrompt) === "bursty" ||
                requiresTimeVaryingTraffic(normalizedPrompt) ||
                fargateServiceCount > 1
            }
          : {}),
      ...(usesEc2Pattern || requiresEc2Spread ? { computeCount } : {})
    }
  };
}

function reconcileCanonicalProviderPlan(
  mergedPlan: ArchitectureIntentPlan | null,
  providerPlan: ArchitectureIntentPlan
): ArchitectureIntentPlan | null {
  if (mergedPlan === null || (providerPlan.patternIds?.length ?? 0) === 0) {
    return mergedPlan;
  }

  const providerPatternIds = new Set(providerPlan.patternIds ?? []);
  const providerSelectedFargate =
    providerPatternIds.has("ecs-fargate") && !providerPatternIds.has("serverless-api");

  if (!providerSelectedFargate) {
    return mergedPlan;
  }

  const resourceQuantities = { ...(mergedPlan.resourceQuantities ?? {}) };
  for (const resourceType of [
    "API_GATEWAY_REST_API",
    "API_GATEWAY_RESOURCE",
    "API_GATEWAY_METHOD",
    "API_GATEWAY_INTEGRATION",
    "API_GATEWAY_DEPLOYMENT",
    "API_GATEWAY_STAGE",
    "LAMBDA",
    "LAMBDA_PERMISSION"
  ]) {
    delete resourceQuantities[resourceType];
  }

  return {
    ...mergedPlan,
    patternIds: (mergedPlan.patternIds ?? []).filter(
      (patternId) => patternId !== "serverless-api"
    ),
    requiredResources: (mergedPlan.requiredResources ?? []).filter(
      (resourceType) => ![
        "API_GATEWAY_REST_API",
        "API_GATEWAY_RESOURCE",
        "API_GATEWAY_METHOD",
        "API_GATEWAY_INTEGRATION",
        "API_GATEWAY_DEPLOYMENT",
        "API_GATEWAY_STAGE",
        "LAMBDA",
        "LAMBDA_PERMISSION"
      ].includes(resourceType)
    ),
    resourceQuantities,
    runtimeTopology: providerPlan.runtimeTopology ?? mergedPlan.runtimeTopology
  };
}

function applyArchitecturePlanExclusions(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null
): ArchitectureJson {
  const forbiddenCapabilities = new Set(
    (plan?.forbiddenCapabilities ?? []).map((capability) => capability.toLowerCase())
  );
  const canonicalResourceTypes =
    (plan?.patternIds?.length ?? 0) > 0
      ? new Set(plan?.requiredResources ?? [])
      : null;
  const canonicalNodeCounts = new Map<ResourceType, number>();
  const nodes = architectureJson.nodes.filter((node) => {
    if (canonicalResourceTypes !== null && !canonicalResourceTypes.has(node.type)) {
      return false;
    }

    if (
      forbiddenCapabilities.has("ec2_runtime") &&
      hasAnyNodeType(
        new Set([node.type]),
        [
          "EC2",
          "AMI",
          "IAM_INSTANCE_PROFILE",
          "LAUNCH_TEMPLATE",
          "AUTO_SCALING_GROUP",
          "AUTO_SCALING_POLICY",
          "ECS_CAPACITY_PROVIDER"
        ]
      )
    ) {
      return false;
    }

    if (
      forbiddenCapabilities.has("load_balancer") &&
      ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP"].includes(
        node.type
      )
    ) {
      return false;
    }

    if (forbiddenCapabilities.has("file_upload") && isForbiddenUploadResourceNode(node)) {
      return false;
    }

    if (forbiddenCapabilities.has("realtime") && isForbiddenRealtimeArchitectureNode(node)) {
      return false;
    }

    if (forbiddenCapabilities.has("database") && isForbiddenDatabaseArchitectureNode(node)) {
      return false;
    }

    if (canonicalResourceTypes !== null) {
      const count = canonicalNodeCounts.get(node.type) ?? 0;
      const maxCount = getCanonicalPlanResourceMaxCount(plan, node.type);

      if (count >= maxCount) {
        return false;
      }

      canonicalNodeCounts.set(node.type, count + 1);
    }

    return true;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: architectureJson.edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
    )
  };
}

function findMaterializedArchitecturePlanValidationIssues(
  prompt: string,
  plan: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson,
  candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] | undefined
): string[] {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const excludedResourceTypes = new Set(
    (candidateExclusions ?? []).map(({ resourceType }) => resourceType)
  );
  const materializedPatternIds = new Set(plan?.patternIds ?? []);
  const planForbidsEc2Runtime = (plan?.forbiddenCapabilities ?? []).some(
    (capability) => capability.toLowerCase() === "ec2_runtime"
  );
  const issues = [
    ...findCandidateExclusionValidationIssues(
      architectureJson,
      candidateExclusions
    ),
    ...findExplicitResourceTypeValidationIssues(
      normalizedPrompt,
      architectureJson,
      excludedResourceTypes
    ),
    ...findRequestedResourceQuantityValidationIssues(
      normalizedPrompt,
      architectureJson,
      excludedResourceTypes
    ),
    ...(planForbidsEc2Runtime
      ? []
      : findRuntimeTopologyValidationIssues(normalizedPrompt, architectureJson, {
          validateVisualSpread: false
        })),
    ...(materializedPatternIds.has("alb-asg-ec2")
      ? []
      : findNormalizedRequirementValidationIssues(plan, architectureJson, {
          excludedResourceTypes,
          validateVisualSpread: false
        })),
    ...findOperationalRequirementTopologyValidationIssues(normalizedPrompt, architectureJson),
    ...findCanonicalPatternMaterializationIssues(normalizedPrompt, plan, architectureJson)
  ];

  if (requiresServerlessOnlyArchitecture(normalizedPrompt) && nodeTypes.has("EC2")) {
    issues.push("The user requested serverless or no EC2, but the materialized plan includes EC2.");
  }

  if (requiresNoDatabase(normalizedPrompt) && hasAnyNodeType(nodeTypes, ["RDS", "DB_SUBNET_GROUP"])) {
    issues.push("The user selected no database, but the materialized plan includes database resources.");
  }

  if (requiresNoBackend(normalizedPrompt) && hasAnyNodeType(nodeTypes, ["EC2", "LAMBDA", "API_GATEWAY_REST_API", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER"])) {
    issues.push("The user selected no backend, but the materialized plan includes backend resources.");
  }

  if (hasNoFileUploadRequirement(normalizedPrompt) && hasForbiddenUploadResource(architectureJson)) {
    issues.push("The user selected no file upload, but the materialized plan includes upload resources.");
  }

  return issues;
}

function findStrictRepositoryEvidenceValidationIssues(
  request: CreateArchitectureDraftRequest,
  architectureJson: ArchitectureJson
): string[] {
  const facts = request.repositoryEvidence?.facts ?? [];
  const factKeys = new Set(facts.map((fact) => `${fact.kind}:${fact.value}`));
  const hasFact = (kind: string, value: string): boolean => factKeys.has(`${kind}:${value}`);
  const issues: string[] = [];
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const requiredTypes = new Set<ResourceType>([
    "ECS_CLUSTER",
    "ECS_SERVICE",
    "ECS_TASK_DEFINITION",
    "LOAD_BALANCER",
    "LOAD_BALANCER_LISTENER",
    "LOAD_BALANCER_TARGET_GROUP"
  ]);

  if (hasFact("frontend_delivery", "s3_cloudfront_static")) {
    requiredTypes.add("S3");
    requiredTypes.add("CLOUDFRONT");
  }
  if (hasFact("container_registry", "ecr")) requiredTypes.add("ECR_REPOSITORY");
  if (hasFact("observability", "cloudwatch")) requiredTypes.add("CLOUDWATCH_LOG_GROUP");

  const missingTypes = [...requiredTypes].filter((resourceType) => !nodeTypes.has(resourceType));
  if (missingTypes.length > 0) {
    issues.push(`Strict repository evidence is missing required resources: ${missingTypes.join(", ")}.`);
  }

  const forbiddenTypes = new Set<ResourceType>([
    "APPLICATION_AUTO_SCALING_TARGET",
    "APPLICATION_AUTO_SCALING_POLICY",
    "CODESTAR_CONNECTION",
    "CODEPIPELINE",
    "CODEBUILD_PROJECT",
    "CODEDEPLOY_APP",
    "CODEDEPLOY_DEPLOYMENT_GROUP"
  ]);
  if (hasFact("excluded_capability", "database")) {
    forbiddenTypes.add("RDS");
    forbiddenTypes.add("RDS_CLUSTER");
    forbiddenTypes.add("DB_SUBNET_GROUP");
    forbiddenTypes.add("DYNAMODB_TABLE");
  }
  if (hasFact("excluded_capability", "redis")) {
    forbiddenTypes.add("ELASTICACHE_REDIS");
    forbiddenTypes.add("ELASTICACHE_SUBNET_GROUP");
    forbiddenTypes.add("ELASTICACHE_PARAMETER_GROUP");
  }
  if (hasFact("excluded_capability", "websocket")) {
    forbiddenTypes.add("API_GATEWAY_WEBSOCKET_API");
    forbiddenTypes.add("API_GATEWAY_V2_ROUTE");
    forbiddenTypes.add("API_GATEWAY_V2_INTEGRATION");
    forbiddenTypes.add("API_GATEWAY_V2_STAGE");
  }
  if (hasFact("excluded_capability", "authentication")) {
    forbiddenTypes.add("COGNITO_USER_POOL");
    forbiddenTypes.add("COGNITO_USER_POOL_CLIENT");
  }

  const unexpectedTypes = [...forbiddenTypes].filter((resourceType) => nodeTypes.has(resourceType));
  if (unexpectedTypes.length > 0) {
    issues.push(`Strict repository evidence contains unsupported inferred resources: ${unexpectedTypes.join(", ")}.`);
  }

  if (hasFact("runtime_scale", "single_task")) {
    const services = architectureJson.nodes.filter((node) => node.type === "ECS_SERVICE");
    if (services.length !== 1 || services[0]?.config.desiredCount !== 1) {
      issues.push("Strict repository evidence requires exactly one ECS service with desiredCount 1.");
    }
  }

  const publicSubnets = architectureJson.nodes.filter(
    (node) => node.type === "SUBNET" && node.config.mapPublicIpOnLaunch === true
  );
  const privateAppSubnets = architectureJson.nodes.filter(
    (node) =>
      node.type === "SUBNET" &&
      node.config.mapPublicIpOnLaunch === false &&
      node.config.tier === "private_app"
  );
  const loadBalancer = architectureJson.nodes.find((node) => node.type === "LOAD_BALANCER");
  const service = architectureJson.nodes.find((node) => node.type === "ECS_SERVICE");
  const loadBalancerSubnetRefs = Array.isArray(loadBalancer?.config.subnets)
    ? loadBalancer.config.subnets
    : [];
  const serviceNetworkConfiguration = isObjectRecord(service?.config.networkConfiguration)
    ? service.config.networkConfiguration
    : undefined;
  const serviceSubnetRefs = Array.isArray(serviceNetworkConfiguration?.subnets)
    ? serviceNetworkConfiguration.subnets
    : [];

  if (
    publicSubnets.length !== 2 ||
    !publicSubnets.every((subnet) =>
      loadBalancerSubnetRefs.includes(`aws_subnet.${subnet.id}.id`)
    )
  ) {
    issues.push("Strict repository evidence requires the internet-facing ALB in two public subnets.");
  }
  if (
    privateAppSubnets.length !== 2 ||
    !privateAppSubnets.every((subnet) =>
      serviceSubnetRefs.includes(`aws_subnet.${subnet.id}.id`)
    ) ||
    serviceNetworkConfiguration?.assignPublicIp !== false
  ) {
    issues.push("Strict repository evidence requires Fargate tasks in two private app subnets without public IP assignment.");
  }
  if (
    architectureJson.nodes.filter((node) => node.type === "NAT_GATEWAY").length !== 1 ||
    architectureJson.nodes.filter((node) => node.type === "ELASTIC_IP").length !== 1
  ) {
    issues.push("Strict repository evidence requires one cost-conscious NAT egress path for private Fargate tasks.");
  }

  const healthCheck = facts.find((fact) => fact.kind === "health_check")?.value;
  const healthMatch = /^http:(\d{2,5})(\/[a-z0-9_./-]+)$/iu.exec(healthCheck ?? "");
  if (healthMatch) {
    const expectedPort = Number(healthMatch[1]);
    const expectedPath = healthMatch[2];
    const targetGroup = architectureJson.nodes.find(
      (node) => node.type === "LOAD_BALANCER_TARGET_GROUP"
    );
    const targetHealthCheck = isObjectRecord(targetGroup?.config.healthCheck)
      ? targetGroup.config.healthCheck
      : undefined;
    const taskDefinition = architectureJson.nodes.find(
      (node) => node.type === "ECS_TASK_DEFINITION"
    );
    const containerDefinitions = taskDefinition?.config.containerDefinitions;
    const serializedContainerDefinitions = typeof containerDefinitions === "string"
      ? containerDefinitions
      : JSON.stringify(containerDefinitions ?? "");
    if (targetGroup?.config.port !== expectedPort || targetHealthCheck?.path !== expectedPath) {
      issues.push(`Strict repository evidence requires target group health checks on ${expectedPort}${expectedPath}.`);
    }
    if (!serializedContainerDefinitions.includes(`"containerPort":${expectedPort}`)) {
      issues.push(`Strict repository evidence requires the API task container port ${expectedPort}.`);
    }
  }

  if (hasFact("transport_security", "alb_tls_termination")) {
    const listener = architectureJson.nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
    if (listener?.config.port !== 80 || listener.config.protocol !== "HTTP") {
      issues.push("Strict repository evidence without a confirmed certificate requires an explicit HTTP deployment-validation listener.");
    }
  }

  if (hasFact("ci_cd", "github_actions")) {
    const hasGitHubActionsActor = architectureJson.nodes.some(
      (node) => node.type === "UNKNOWN" && node.config.diagramType === "github_actions"
    );
    if (!hasGitHubActionsActor) {
      issues.push("Strict repository evidence requires GitHub Actions as an external delivery actor.");
    }
  }

  return issues;
}

function findCanonicalPatternMaterializationIssues(
  normalizedPrompt: string,
  plan: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson
): string[] {
  const patternIds = new Set(plan?.patternIds ?? []);
  const usesRoleAwareEcs =
    patternIds.has("ecs-fargate") &&
    !patternIds.has("serverless-api") &&
    !patternIds.has("alb-asg-ec2") &&
    architectureJson.nodes.some(
      (node) => node.type === "ECS_SERVICE" || node.type === "ECS_TASK_DEFINITION"
    );
  const usesRoleAwareEc2 =
    patternIds.has("alb-asg-ec2") &&
    !patternIds.has("serverless-api");

  if (usesRoleAwareEc2) {
    return findCanonicalEc2PatternMaterializationIssues(normalizedPrompt, plan, architectureJson);
  }

  if (!usesRoleAwareEcs) {
    return [];
  }

  const issues: string[] = [];
  const nodes = architectureJson.nodes;
  const serializedArchitecture = JSON.stringify(architectureJson).toLowerCase();
  const subnets = nodes.filter((node) => node.type === "SUBNET");
  const publicSubnets = subnets.filter((node) => node.config.tier === "public");
  const privateAppSubnets = subnets.filter((node) => node.config.tier === "private_app");
  const privateDbSubnets = subnets.filter((node) => node.config.tier === "private_db");
  const serviceProfiles = resolveFargateServiceProfiles(normalizedPrompt, resolveFrontendProfile(normalizedPrompt));
  const ecsServices = nodes.filter((node) => node.type === "ECS_SERVICE");
  const ecsTaskDefinitions = nodes.filter((node) => node.type === "ECS_TASK_DEFINITION");
  const targetGroups = nodes.filter((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const ecsService = nodes.find((node) => node.id === serviceProfiles[0]?.serviceId) ?? ecsServices[0];
  const targetGroup = nodes.find((node) => node.id === serviceProfiles[0]?.targetGroupId) ?? targetGroups[0];
  const hasLoadBalancer = nodes.some((node) => node.type === "LOAD_BALANCER");
  const ecsRoles = nodes.filter(
    (node) =>
      node.type === "IAM_ROLE" &&
      JSON.stringify(node.config).includes("ecs-tasks.amazonaws.com")
  );

  if (serializedArchitecture.includes("lambda")) {
    issues.push("The Fargate plan contains Lambda-specific resources or configuration.");
  }
  if (
    publicSubnets.length !== 2 ||
    publicSubnets.some((node) => node.config.mapPublicIpOnLaunch !== true)
  ) {
    issues.push("The Fargate ALB requires two correctly configured public subnets.");
  }
  if (
    privateAppSubnets.length !== 2 ||
    privateAppSubnets.some((node) => node.config.mapPublicIpOnLaunch !== false)
  ) {
    issues.push("The Fargate service requires two private application subnets.");
  }
  if (hasLoadBalancer && targetGroups.some((node) => node.config.targetType !== "ip")) {
    issues.push("Every Fargate target group must use targetType ip.");
  }
  if (
    ecsServices.length < serviceProfiles.length ||
    ecsTaskDefinitions.length < serviceProfiles.length ||
    (hasLoadBalancer && targetGroups.length < serviceProfiles.length)
  ) {
    issues.push("The Fargate plan must materialize each required service with its own service, task definition, and target group.");
  }

  for (const profile of serviceProfiles) {
    const service = nodes.find((node) => node.id === profile.serviceId && node.type === "ECS_SERVICE");
    const taskDefinition = nodes.find((node) => node.id === profile.taskDefinitionId && node.type === "ECS_TASK_DEFINITION");
    const serviceLoadBalancer = isArchitectureConfigRecord(service?.config.loadBalancer)
      ? service.config.loadBalancer
      : undefined;

    if (
      service?.config.desiredCount !== 2 ||
      !isArchitectureConfigRecord(service.config.networkConfiguration) ||
      service.config.networkConfiguration.assignPublicIp !== false ||
      !Array.isArray(service.config.networkConfiguration.subnets) ||
      service.config.networkConfiguration.subnets.length !== 2 ||
      (hasLoadBalancer &&
        (serviceLoadBalancer === undefined ||
          serviceLoadBalancer.containerName !== profile.containerName ||
          serviceLoadBalancer.containerPort !== 8080))
    ) {
      issues.push(`The Fargate service ${profile.serviceId} must run two private tasks without public IPs.`);
    }

    if (
      taskDefinition?.config.networkMode !== "awsvpc" ||
      !Array.isArray(taskDefinition.config.requiresCompatibilities) ||
      !taskDefinition.config.requiresCompatibilities.includes("FARGATE")
    ) {
      issues.push(`The task definition ${profile.taskDefinitionId} is not configured for Fargate awsvpc mode.`);
    }
  }
  if (ecsRoles.length < 2) {
    issues.push("The Fargate plan requires separate execution and task IAM roles.");
  }

  if (
    plan?.runtimeTopology?.autoScaling === true ||
    resolveTrafficProfile(normalizedPrompt) === "bursty" ||
    requiresTimeVaryingTraffic(normalizedPrompt) ||
    serviceProfiles.length > 1
  ) {
    for (const profile of serviceProfiles) {
      const scalingTarget = nodes.find(
        (node) => node.id === profile.scalingTargetId && node.type === "APPLICATION_AUTO_SCALING_TARGET"
      );
      const scalingPolicy = nodes.find(
        (node) => node.id === profile.scalingPolicyId && node.type === "APPLICATION_AUTO_SCALING_POLICY"
      );

      if (
        scalingTarget?.config.serviceNamespace !== "ecs" ||
        scalingTarget?.config.scalableDimension !== "ecs:service:DesiredCount" ||
        scalingTarget?.config.minCapacity !== 2 ||
        typeof scalingTarget?.config.maxCapacity !== "number" ||
        scalingPolicy?.config.policyType !== "TargetTrackingScaling"
      ) {
        issues.push(`The Fargate service ${profile.serviceId} requires deployable ECS target-tracking auto scaling.`);
      }
    }
  }

  if (resolveRealtimeTransport(normalizedPrompt) === "sse") {
    const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
    const database = nodes.find((node) => node.type === "RDS");
    const expectedSsePathPattern =
      resolveRealtimeProfile(normalizedPrompt) === "notification"
        ? /sse \/events notification stream/iu
        : /post \/messages \+ sse \/events/iu;

    if (
      listener === undefined ||
      targetGroup === undefined ||
      !architectureJson.edges.some(
        (edge) =>
          edge.sourceId === listener.id &&
          edge.targetId === targetGroup.id &&
          expectedSsePathPattern.test(edge.label ?? "")
      )
    ) {
      issues.push(
        resolveRealtimeProfile(normalizedPrompt) === "notification"
          ? "SSE notifications require an explicit listener-to-target event stream path."
          : "SSE requires an explicit POST message and listener-to-target event stream path."
      );
    }

    if (
      resolveRealtimeProfile(normalizedPrompt) === "chat" &&
      database !== undefined &&
      ecsService !== undefined &&
      !architectureJson.edges.some(
        (edge) =>
          edge.sourceId === ecsService.id &&
          edge.targetId === database.id &&
          /listen\/notify/iu.test(edge.label ?? "")
      )
    ) {
      issues.push("Multi-task SSE chat requires a shared message and fan-out path.");
    }
  }

  if (patternIds.has("multi-az-rds")) {
    const dbSubnetGroup = nodes.find((node) => node.type === "DB_SUBNET_GROUP");
    if (
      privateDbSubnets.length !== 2 ||
      privateDbSubnets.some((node) => node.config.mapPublicIpOnLaunch !== false)
    ) {
      issues.push("The Multi-AZ RDS plan requires two private database subnets.");
    }
    if (
      !Array.isArray(dbSubnetGroup?.config.subnetIds) ||
      dbSubnetGroup.config.subnetIds.length !== 2
    ) {
      issues.push("The DB subnet group must reference both private database subnets.");
    }
  }

  return issues;
}

function findCanonicalEc2PatternMaterializationIssues(
  normalizedPrompt: string,
  plan: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson
): string[] {
  const issues: string[] = [];
  const patternIds = new Set(plan?.patternIds ?? []);
  const nodes = architectureJson.nodes;
  const edges = architectureJson.edges;
  const subnets = nodes.filter((node) => node.type === "SUBNET");
  const publicSubnets = subnets.filter((node) => node.config.tier === "public");
  const privateAppSubnets = subnets.filter((node) => node.config.tier === "private_app");
  const privateDbSubnets = subnets.filter((node) => node.config.tier === "private_db");
  const loadBalancer = nodes.find((node) => node.type === "LOAD_BALANCER");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const launchTemplate = nodes.find((node) => node.type === "LAUNCH_TEMPLATE");
  const cloudFront = nodes.find((node) => node.type === "CLOUDFRONT");
  const expectedPublicSubnetRefs = publicSubnets.map((node) =>
    canonicalTerraformReference("aws_subnet", node.id)
  );
  const expectedPrivateAppSubnetRefs = privateAppSubnets.map((node) =>
    canonicalTerraformReference("aws_subnet", node.id)
  );

  if (
    publicSubnets.length !== 2 ||
    publicSubnets.some(
      (node) =>
        node.config.mapPublicIpOnLaunch !== true ||
        typeof node.config.availabilityZone !== "string"
    ) ||
    new Set(publicSubnets.map((node) => node.config.availabilityZone)).size !== 2
  ) {
    issues.push("The EC2 ALB pattern requires two public subnets in distinct Availability Zones.");
  }
  if (
    privateAppSubnets.length !== 2 ||
    privateAppSubnets.some(
      (node) =>
        node.config.mapPublicIpOnLaunch !== false ||
        typeof node.config.availabilityZone !== "string"
    ) ||
    new Set(privateAppSubnets.map((node) => node.config.availabilityZone)).size !== 2
  ) {
    issues.push("The EC2 ASG pattern requires two private application subnets in distinct Availability Zones.");
  }
  if (nodes.filter((node) => node.type === "NAT_GATEWAY").length !== 2) {
    issues.push("The multi-AZ EC2 pattern requires one NAT Gateway per public Availability Zone.");
  }
  if (
    loadBalancer === undefined ||
    !Array.isArray(loadBalancer.config.subnets) ||
    JSON.stringify(loadBalancer.config.subnets) !== JSON.stringify(expectedPublicSubnetRefs)
  ) {
    issues.push("The internet-facing ALB must use both public subnets.");
  }
  if (
    autoScalingGroup === undefined ||
    !Array.isArray(autoScalingGroup.config.vpcZoneIdentifier) ||
    JSON.stringify(autoScalingGroup.config.vpcZoneIdentifier) !==
      JSON.stringify(expectedPrivateAppSubnetRefs) ||
    !Array.isArray(autoScalingGroup.config.targetGroupArns) ||
    autoScalingGroup.config.targetGroupArns.length !== 1
  ) {
    issues.push("The ASG must span both private application subnets and register with the target group.");
  }
  if (
    launchTemplate === undefined ||
    !isArchitectureConfigRecord(launchTemplate.config.iamInstanceProfile) ||
    !isArchitectureConfigRecord(launchTemplate.config.metadataOptions) ||
    launchTemplate.config.metadataOptions.httpTokens !== "required"
  ) {
    issues.push("The EC2 Launch Template requires an instance profile and IMDSv2.");
  }
  if (
    loadBalancer === undefined ||
    listener === undefined ||
    targetGroup === undefined ||
    autoScalingGroup === undefined ||
    !edges.some((edge) => edge.sourceId === loadBalancer.id && edge.targetId === listener.id) ||
    !edges.some((edge) => edge.sourceId === listener.id && edge.targetId === targetGroup.id) ||
    !edges.some((edge) => edge.sourceId === targetGroup.id && edge.targetId === autoScalingGroup.id)
  ) {
    issues.push("The ALB, listener, target group, and ASG must form one connected traffic path.");
  }
  if (
    cloudFront !== undefined &&
    nodes.some(
      (node) =>
        node.type === "EC2" &&
        edges.some((edge) => edge.sourceId === cloudFront.id && edge.targetId === node.id)
    )
  ) {
    issues.push("CloudFront must not bypass the ALB and route directly to EC2 fleet nodes.");
  }
  if (
    cloudFront !== undefined &&
    loadBalancer !== undefined &&
    edges.some((edge) => edge.sourceId === cloudFront.id && edge.targetId === loadBalancer.id) &&
    cloudFront.config.originResourceId !== loadBalancer.id
  ) {
    issues.push("CloudFront must not show an ALB origin that is absent from its deployable configuration.");
  }
  if (resolveRealtimeTransport(normalizedPrompt) === "sse") {
    if (
      typeof loadBalancer?.config.idleTimeout !== "number" ||
      loadBalancer.config.idleTimeout < 120
    ) {
      issues.push("SSE requires an ALB idle timeout of at least 120 seconds.");
    }
    if (
      listener === undefined ||
      targetGroup === undefined ||
      !edges.some(
        (edge) =>
          edge.sourceId === listener.id &&
          edge.targetId === targetGroup.id &&
          /sse/iu.test(edge.label ?? "")
      )
    ) {
      issues.push("SSE requires an explicit listener-to-target streaming path.");
    }
    const database = nodes.find((node) => node.type === "RDS");
    if (
      resolveRealtimeProfile(normalizedPrompt) === "chat" &&
      database !== undefined &&
      autoScalingGroup !== undefined &&
      !edges.some(
        (edge) =>
          edge.sourceId === autoScalingGroup.id &&
          edge.targetId === database.id &&
          /listen\/notify/iu.test(edge.label ?? "")
      )
    ) {
      issues.push("Multi-instance SSE chat requires a shared message and fan-out path.");
    }
  }
  const forbidsUpload = (plan?.forbiddenCapabilities ?? []).some(
    (capability) => capability.toLowerCase() === "file_upload"
  );
  const uploadProfile = resolveUploadProfile(normalizedPrompt);
  if (uploadProfile !== undefined && uploadProfile !== "none" && !forbidsUpload) {
    const uploadBucket = nodes.find(
      (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
    );
    if (uploadBucket === undefined || uploadBucket.config.publicAccessBlock !== true) {
      issues.push("Image upload requires a private upload-purpose S3 bucket.");
    }

    const runtimePolicy = nodes.find((node) => node.type === "IAM_POLICY");
    if (hasWildcardPolicyResourceForAction(runtimePolicy?.config.policy, "s3:")) {
      issues.push("Image upload permissions must scope S3 access to the upload bucket.");
    }
  }
  if (patternIds.has("multi-az-rds")) {
    const database = nodes.find((node) => node.type === "RDS");
    const dbSubnetGroup = nodes.find((node) => node.type === "DB_SUBNET_GROUP");
    if (
      privateDbSubnets.length !== 2 ||
      new Set(privateDbSubnets.map((node) => node.config.availabilityZone)).size !== 2 ||
      !Array.isArray(dbSubnetGroup?.config.subnetIds) ||
      dbSubnetGroup.config.subnetIds.length !== 2 ||
      database?.config.multiAz !== true ||
      database.config.publiclyAccessible !== false
    ) {
      issues.push("The RDS tier must use two private DB subnets and Multi-AZ without public access.");
    }
  }

  return issues;
}

function isArchitectureConfigRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasWildcardPolicyResourceForAction(policy: unknown, actionPrefix: string): boolean {
  if (typeof policy !== "string") {
    return false;
  }

  try {
    const document = JSON.parse(policy) as { Statement?: unknown[] };

    return (document.Statement ?? []).some((statement) => {
      if (!isArchitectureConfigRecord(statement)) {
        return false;
      }

      const actions = Array.isArray(statement.Action)
        ? statement.Action
        : [statement.Action];

      return (
        actions.some((action) =>
          typeof action === "string" && action.toLowerCase().startsWith(actionPrefix)
        ) && statement.Resource === "*"
      );
    });
  } catch {
    return false;
  }
}

function createArchitecturePlanMaterializationPrompt(
  prompt: string,
  plan: ArchitectureIntentPlan | null
): string {
  if (plan === null) {
    return prompt;
  }

  const requiredResources = plan.requiredResources ?? [];
  const quantities = Object.entries(plan.resourceQuantities ?? {});
  const topology = plan.runtimeTopology;
  const lines = [prompt, "Amazon Q selected architecture plan:"];

  if (requiredResources.length > 0) {
    lines.push(`Required resources: ${requiredResources.join(", ")}.`);
  }

  for (const [resourceType, quantity] of quantities) {
    lines.push(`${resourceType} ${quantity} instances required.`);
  }

  if (topology?.compute?.toUpperCase() === "EC2") {
    lines.push("EC2 server runtime required.");
  }

  if (topology !== undefined) {
    lines.push(`Runtime topology: ${JSON.stringify(topology)}.`);
  }

  for (const capability of plan.forbiddenCapabilities ?? []) {
    if (capability.toLowerCase() === "file_upload") {
      lines.push("File upload: none; no file upload resources.");
    } else if (capability.toLowerCase() === "realtime") {
      lines.push("Realtime: none; no realtime resources.");
    }
  }

  if (plan.region !== undefined) {
    lines.push(`Region: ${plan.region}.`);
  }

  if (plan.database !== undefined) {
    lines.push(`Database: ${plan.database}.`);
  }

  if (plan.availability !== undefined) {
    lines.push(`Availability: ${plan.availability}.`);
  }

  return lines.join("\n");
}

function connectArchitecturePlanRuntimeTopology(
  architectureJson: ArchitectureJson,
  topology: ArchitectureIntentPlan["runtimeTopology"]
): ArchitectureJson {
  if (topology === undefined) {
    return architectureJson;
  }

  const edges = [...architectureJson.edges];
  let nodes = [...architectureJson.nodes];
  const loadBalancer = nodes.find((node) => node.type === "LOAD_BALANCER");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const loadBalancerListener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const loadBalancerTargetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  let computeNodes = nodes.filter(
    (node) => node.type === topology.compute?.toUpperCase()
  );

  if (topology.compute?.toUpperCase() === "EC2" && topology.spreadAcrossPrivateSubnets === true) {
    const subnets = nodes
      .filter((node) => node.type === "SUBNET" && /\bprivate\b/iu.test(createNodeSearchText(node)))
      .slice(0, 2);
    const placements = new Map(
      computeNodes.map((node, index) => [node.id, subnets[index % subnets.length]?.id])
    );

    nodes = nodes.map((node) => {
      const subnetId = placements.get(node.id);

      return subnetId === undefined
        ? node
        : { ...node, config: { ...node.config, subnetId } };
    });
    computeNodes = nodes.filter((node) => node.type === "EC2");

    for (const computeNode of computeNodes) {
      const subnetId = typeof computeNode.config.subnetId === "string"
        ? computeNode.config.subnetId
        : undefined;

      if (subnetId !== undefined) {
        addArchitectureEdge(
          edges,
          `canonical-${subnetId}-to-${computeNode.id}`,
          subnetId,
          computeNode.id,
          "contains"
        );
      }
    }
  }

  if (topology.trafficEntry?.toUpperCase() === "LOAD_BALANCER" && loadBalancer !== undefined) {
    if (autoScalingGroup !== undefined && topology.autoScaling === true) {
      const hasStructuredAlbPath =
        loadBalancerListener !== undefined &&
        loadBalancerTargetGroup !== undefined &&
        edges.some(
          (edge) => edge.sourceId === loadBalancer.id && edge.targetId === loadBalancerListener.id
        ) &&
        edges.some(
          (edge) => edge.sourceId === loadBalancerListener.id && edge.targetId === loadBalancerTargetGroup.id
        ) &&
        edges.some(
          (edge) => edge.sourceId === loadBalancerTargetGroup.id && edge.targetId === autoScalingGroup.id
        );

      if (!hasStructuredAlbPath) {
        if (loadBalancerListener !== undefined && loadBalancerTargetGroup !== undefined) {
          addArchitectureEdge(
            edges,
            `amazon-q-${loadBalancer.id}-to-${loadBalancerListener.id}`,
            loadBalancer.id,
            loadBalancerListener.id,
            "listens"
          );
          addArchitectureEdge(
            edges,
            `amazon-q-${loadBalancerListener.id}-to-${loadBalancerTargetGroup.id}`,
            loadBalancerListener.id,
            loadBalancerTargetGroup.id,
            "forwards"
          );
          addArchitectureEdge(
            edges,
            `amazon-q-${loadBalancerTargetGroup.id}-to-${autoScalingGroup.id}`,
            loadBalancerTargetGroup.id,
            autoScalingGroup.id,
            "targets fleet"
          );
        } else {
          addArchitectureEdge(edges, "amazon-q-load-balancer-to-auto-scaling-group", loadBalancer.id, autoScalingGroup.id, "routes traffic");
        }
      }
    } else {
      for (const computeNode of computeNodes) {
        addArchitectureEdge(edges, `amazon-q-load-balancer-to-${computeNode.id}`, loadBalancer.id, computeNode.id, "routes traffic");
      }
    }
  }

  if (autoScalingGroup !== undefined && topology.autoScaling === true) {
    for (const computeNode of computeNodes) {
      addArchitectureEdge(edges, `amazon-q-auto-scaling-group-to-${computeNode.id}`, autoScalingGroup.id, computeNode.id, "manages fleet");
    }
  }

  return {
    nodes,
    edges
  };
}

function addArchitectureEdge(
  edges: ArchitectureJson["edges"],
  id: string,
  sourceId: string,
  targetId: string,
  label: string
): void {
  const existingEdge = edges.find((edge) => edge.sourceId === sourceId && edge.targetId === targetId);

  if (existingEdge !== undefined) {
    if (/cost warning/iu.test(label) && !/cost warning/iu.test(existingEdge.label ?? "")) {
      existingEdge.label = label;
    }
    return;
  }

  edges.push({ id, sourceId, targetId, label });
}

function findRuntimeTopologyValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson,
  options: { readonly validateVisualSpread?: boolean } = {}
): string[] {
  const issues: string[] = [];

  if (
    !explicitlyForbidsEc2Runtime(normalizedPrompt) &&
    requiresAlbEc2TrafficPath(normalizedPrompt) &&
    !hasAlbToEc2TrafficPath(architectureJson)
  ) {
    issues.push(
      "The user requested EC2 runtime behind an ALB, but the preview does not connect LOAD_BALANCER/LOAD_BALANCER_LISTENER through Auto Scaling or target resources to EC2 nodes. Regenerate with a visible ALB -> ASG/target group -> EC2 traffic path."
    );
  }

  if (
    !explicitlyForbidsEc2Runtime(normalizedPrompt) &&
    requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt) &&
    !hasAutoScalingGroupToEc2Path(architectureJson)
  ) {
    issues.push(
      "The user requested an Auto Scaling Group, but the preview does not connect AUTO_SCALING_GROUP to the EC2 fleet. Regenerate with ASG visibly managing or scaling the EC2 nodes."
    );
  }

  if (!explicitlyForbidsEc2Runtime(normalizedPrompt) && requiresEc2PrivateSubnetSplit(normalizedPrompt)) {
    const spread = getEc2SubnetSpread(architectureJson);
    const visualSpread = getEc2VisualPrivateSubnetSpread(architectureJson);

    if (spread.privateSubnetCount < 2 || spread.ec2SubnetCount < 2) {
      issues.push(
        `The user requested EC2 instances split across two private subnets, but the preview shows ${spread.ec2SubnetCount} private subnet placement(s) for EC2 across ${spread.privateSubnetCount} private subnet node(s). Regenerate with EC2 nodes distributed across at least two private app subnets.`
      );
    }

    if (
      options.validateVisualSpread !== false &&
      visualSpread.privateSubnetCount >= 2 &&
      visualSpread.ec2SubnetCount < 2
    ) {
      issues.push(
        `The user requested EC2 instances split across two private subnets, but the preview visually places EC2 nodes across only ${visualSpread.ec2SubnetCount} private subnet box(es). Regenerate with EC2 nodes visually placed across at least two private app subnets, not grouped inside one subnet/security-group area.`
      );
    }
  }

  return issues;
}

function findExplicitResourceTypeValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson,
  excludedResourceTypes: ReadonlySet<ResourceType> = new Set<ResourceType>()
): string[] {
  const requestedResourceTypes = findExplicitResourceTypesInPrompt(normalizedPrompt).filter(
    (resourceType) =>
      !excludedResourceTypes.has(resourceType)
      && (
        !explicitlyForbidsEc2Runtime(normalizedPrompt)
        || ![
          "EC2",
          "AMI",
          "IAM_INSTANCE_PROFILE",
          "LAUNCH_TEMPLATE",
          "AUTO_SCALING_GROUP",
          "AUTO_SCALING_POLICY",
          "ECS_CAPACITY_PROVIDER"
        ].includes(resourceType)
      )
  );
  const actualResourceTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const missingResourceTypes = requestedResourceTypes.filter((resourceType) => !actualResourceTypes.has(resourceType));

  if (missingResourceTypes.length === 0) {
    return [];
  }

  return [
    `The user explicitly requested supported resource-panel types that are missing from the preview: ${missingResourceTypes.join(", ")}. Regenerate with visible ResourceNode entries for each missing type.`
  ];
}

function findRequestedResourceQuantityValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson,
  excludedResourceTypes: ReadonlySet<ResourceType> = new Set<ResourceType>()
): string[] {
  if (excludedResourceTypes.has("EC2")) {
    return [];
  }

  const requestedQuantities = resolveArchitectureResourceQuantities(normalizedPrompt);
  const ec2NodeCount = architectureJson.nodes.filter((node) => node.type === "EC2").length;

  if (requestedQuantities.ec2Instances <= 1 || ec2NodeCount >= requestedQuantities.ec2Instances) {
    return [];
  }

  return [
    `The user requested ${requestedQuantities.ec2Instances} EC2 instances, but the preview includes only ${ec2NodeCount}. Regenerate with at least ${requestedQuantities.ec2Instances} visible EC2 ResourceNode entries.`
  ];
}

function hasAlbToEc2TrafficPath(architectureJson: ArchitectureJson): boolean {
  return hasPathBetweenNodeTypes(
    architectureJson,
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER"],
    ["EC2"],
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT", "AUTO_SCALING_GROUP", "EC2"],
    4
  );
}

function hasAutoScalingGroupToEc2Path(architectureJson: ArchitectureJson): boolean {
  return hasPathBetweenNodeTypes(
    architectureJson,
    ["AUTO_SCALING_GROUP"],
    ["EC2"],
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT", "AUTO_SCALING_GROUP", "EC2", "LAUNCH_TEMPLATE"],
    3
  );
}

function hasPathBetweenNodeTypes(
  architectureJson: ArchitectureJson,
  sourceTypes: readonly ResourceType[],
  targetTypes: readonly ResourceType[],
  allowedTypes: readonly ResourceType[],
  maxDepth: number
): boolean {
  const allowedTypeSet = new Set(allowedTypes);
  const targetTypeSet = new Set(targetTypes);
  const nodesById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const adjacency = createUndirectedAdjacency(architectureJson.edges);
  const startNodeIds = architectureJson.nodes
    .filter((node) => sourceTypes.includes(node.type))
    .map((node) => node.id);

  for (const startNodeId of startNodeIds) {
    const queue: Array<{ readonly nodeId: string; readonly depth: number }> = [{ nodeId: startNodeId, depth: 0 }];
    const visited = new Set<string>([startNodeId]);

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      const currentNode = nodesById.get(current.nodeId);

      if (current.depth > 0 && currentNode && targetTypeSet.has(currentNode.type)) {
        return true;
      }

      if (current.depth >= maxDepth) {
        continue;
      }

      for (const nextNodeId of adjacency.get(current.nodeId) ?? []) {
        if (visited.has(nextNodeId)) {
          continue;
        }

        const nextNode = nodesById.get(nextNodeId);

        if (!nextNode || !allowedTypeSet.has(nextNode.type)) {
          continue;
        }

        visited.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  return false;
}

function createUndirectedAdjacency(
  edges: readonly ArchitectureJson["edges"][number][]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    addAdjacentNode(adjacency, edge.sourceId, edge.targetId);
    addAdjacentNode(adjacency, edge.targetId, edge.sourceId);
  }

  return adjacency;
}

function addAdjacentNode(adjacency: Map<string, Set<string>>, sourceId: string, targetId: string): void {
  const adjacentNodeIds = adjacency.get(sourceId) ?? new Set<string>();

  adjacentNodeIds.add(targetId);
  adjacency.set(sourceId, adjacentNodeIds);
}

function getEc2SubnetSpread(architectureJson: ArchitectureJson): {
  readonly ec2SubnetCount: number;
  readonly privateSubnetCount: number;
} {
  const nodesById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const privateSubnetIds = new Set(
    architectureJson.nodes
      .filter((node) => node.type === "SUBNET" && /\bprivate\b|프라이빗|사설/iu.test(createNodeSearchText(node)))
      .map((node) => node.id)
  );
  const ec2SubnetIds = new Set<string>();

  for (const node of architectureJson.nodes) {
    if (node.type !== "EC2") {
      continue;
    }

    for (const subnetId of findAssociatedSubnetIds(node, architectureJson, nodesById)) {
      if (privateSubnetIds.has(subnetId)) {
        ec2SubnetIds.add(subnetId);
      }
    }
  }

  return {
    ec2SubnetCount: ec2SubnetIds.size,
    privateSubnetCount: privateSubnetIds.size
  };
}

function getEc2VisualPrivateSubnetSpread(architectureJson: ArchitectureJson): {
  readonly ec2SubnetCount: number;
  readonly privateSubnetCount: number;
} {
  const privateSubnetNodes = architectureJson.nodes.filter(
    (node) => node.type === "SUBNET" && /\bprivate\b|프라이빗|사설/iu.test(createNodeSearchText(node))
  );
  const ec2SubnetIds = new Set<string>();

  for (const node of architectureJson.nodes) {
    if (node.type !== "EC2") {
      continue;
    }

    const center = getPreviewNodeCenter(node);

    for (const subnetNode of privateSubnetNodes) {
      if (pointInRect(center, createPreviewNodeRect(subnetNode))) {
        ec2SubnetIds.add(subnetNode.id);
      }
    }
  }

  return {
    ec2SubnetCount: ec2SubnetIds.size,
    privateSubnetCount: privateSubnetNodes.length
  };
}

function findAssociatedSubnetIds(
  node: ArchitectureJson["nodes"][number],
  architectureJson: ArchitectureJson,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): string[] {
  const subnetIds = new Set<string>();
  const configSubnetNode = findConfigAreaNodeByKey(node, "subnetId", nodesById);

  if (configSubnetNode?.type === "SUBNET") {
    subnetIds.add(configSubnetNode.id);
  }

  for (const edge of architectureJson.edges) {
    const candidateNodeId =
      edge.sourceId === node.id ? edge.targetId : edge.targetId === node.id ? edge.sourceId : null;

    if (!candidateNodeId) {
      continue;
    }

    const candidateNode = nodesById.get(candidateNodeId);

    if (candidateNode?.type === "SUBNET") {
      subnetIds.add(candidateNode.id);
    }
  }

  const nodeRect = createPreviewNodeRect(node);

  for (const candidateNode of nodesById.values()) {
    if (candidateNode.type !== "SUBNET") {
      continue;
    }

    if (rectContains(createPreviewNodeRect(candidateNode), nodeRect)) {
      subnetIds.add(candidateNode.id);
    }
  }

  return [...subnetIds];
}

function findExplicitResourceTypesInPrompt(normalizedPrompt: string): ResourceType[] {
  const normalizedSearchText = normalizeResourceSearchText(normalizedPrompt);
  const compactSearchText = normalizedSearchText.replaceAll(" ", "");
  const resourceTypes = new Set<ResourceType>();

  for (const definition of SUPPORTED_RESOURCE_CATALOG) {
    if (
      createResourcePromptAliases(definition).some(
        (alias) =>
          !resourcePromptExplicitlyForbidsType(normalizedPrompt, definition.nodeType) &&
          resourceSearchTextIncludesAlias(normalizedSearchText, compactSearchText, alias)
      )
    ) {
      resourceTypes.add(definition.nodeType);
    }
  }

  return [...resourceTypes];
}

function resourcePromptExplicitlyForbidsType(
  normalizedPrompt: string,
  resourceType: ResourceType
): boolean {
  if (
    [
      "CODESTAR_CONNECTION",
      "CODEPIPELINE",
      "CODEBUILD_PROJECT",
      "CODEDEPLOY_APP",
      "CODEDEPLOY_DEPLOYMENT_GROUP"
    ].includes(resourceType)
  ) {
    return /(?:do not|don't|without|exclude|omit|not required)[^.\n]{0,160}(?:codestar|codepipeline|code\s*pipeline|codebuild|code\s*build|codedeploy|code\s*deploy)/iu.test(
      normalizedPrompt
    );
  }

  if (resourceType === "EC2") {
    return (
      /(?:(?:\b(?:no|without|exclude)\b)|do\s+not\s+use)[^.\n]{0,48}ec2/iu.test(normalizedPrompt) ||
      /ec2[^.\n]{0,96}(?:not\s+needed|do\s+not\s+use|필요\s*없|사용하지\s*않|제외)/iu.test(
        normalizedPrompt
      )
    );
  }

  return (
    resourceType === "LOAD_BALANCER" &&
    (/(?:(?:\b(?:no|without|exclude)\b)|do\s+not\s+use)[^.\n]{0,48}(?:alb|load\s+balancer)/iu.test(
      normalizedPrompt
    ) ||
      /(?:alb|load\s+balancer|로드\s*밸런서|외부\s*트래픽)[^.\n]{0,96}(?:not\s+needed|do\s+not\s+use|필요\s*없|사용하지\s*않|제외)/iu.test(
        normalizedPrompt
      ))
  );
}

function resourceSearchTextIncludesAlias(
  normalizedSearchText: string,
  compactSearchText: string,
  alias: string
): boolean {
  const normalizedAlias = normalizeResourceSearchText(alias);

  if (normalizedAlias.length === 0) {
    return false;
  }

  if (normalizedAlias === "s3") {
    return new RegExp("(^|\\s)s3($|\\s)", "u").test(normalizedSearchText);
  }

  if (!normalizedAlias.includes(" ") && normalizedAlias.length <= 3) {
    return new RegExp(`(^|\\s)${escapeRegExp(normalizedAlias)}($|\\s)`, "u").test(normalizedSearchText);
  }

  return (
    normalizedSearchText.includes(normalizedAlias) ||
    compactSearchText.includes(normalizedAlias.replaceAll(" ", ""))
  );
}

function createResourcePromptAliases(definition: (typeof SUPPORTED_RESOURCE_CATALOG)[number]): string[] {
  const terraformName = definition.terraformResourceType.replace(/^aws_/u, "").replaceAll("_", " ");
  const catalogName = definition.id.replace(/^aws-/u, "").replaceAll("-", " ");
  const aliases = [
    definition.displayName,
    definition.id,
    catalogName,
    definition.nodeType,
    definition.nodeType.replaceAll("_", " "),
    definition.terraformResourceType,
    terraformName
  ];

  switch (definition.nodeType) {
    case "S3":
      aliases.push("s3", "s3 bucket", "artifact bucket");
      break;
    case "IAM_ROLE":
      aliases.push("iam role", "service role");
      break;
    case "EC2":
      aliases.push("ec2", "ec2 instance", "ec2 instances");
      break;
    case "AUTO_SCALING_GROUP":
      aliases.push("auto scaling group", "autoscaling group", "asg");
      break;
    case "LOAD_BALANCER":
      aliases.push("application load balancer", "load balancer", "alb");
      break;
    case "API_GATEWAY_REST_API":
      aliases.push("api gateway", "rest api gateway");
      break;
    case "ECR_REPOSITORY":
      aliases.push("ecr", "ecr repository", "container registry");
      break;
    case "ECS_CLUSTER":
      aliases.push("ecs cluster", "fargate cluster");
      break;
    case "ECS_SERVICE":
      aliases.push("ecs service", "fargate service", "ecs fargate", "fargate runtime");
      break;
    case "ECS_TASK_DEFINITION":
      aliases.push("ecs task definition", "task definition", "fargate task");
      break;
    case "CODEBUILD_PROJECT":
      aliases.push("codebuild project", "code build project");
      break;
    case "CODEDEPLOY_APP":
      aliases.push("codedeploy app", "code deploy app");
      break;
    case "CODEDEPLOY_DEPLOYMENT_GROUP":
      aliases.push("codedeploy deployment group", "code deploy deployment group");
      break;
    case "CODEPIPELINE":
      aliases.push("codepipeline", "code pipeline");
      break;
    case "CODESTAR_CONNECTION":
      aliases.push("codestar connection", "code star connection", "codestarconnections connection");
      break;
    default:
      break;
  }

  return aliases;
}

function normalizeResourceSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/[^a-z0-9가-힣]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findArchitectureLayoutValidationIssues(architectureJson: ArchitectureJson): string[] {
  const nodesById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const rectsByNodeId = new Map(architectureJson.nodes.map((node) => [node.id, createPreviewNodeRect(node)]));
  const parentAreaNodeIds = new Map<string, string>();
  const issues: string[] = [];

  for (const node of architectureJson.nodes) {
    const parentAreaNodeId = findExpectedParentAreaNodeId(node, nodesById, architectureJson.edges);

    if (parentAreaNodeId) {
      parentAreaNodeIds.set(node.id, parentAreaNodeId);
    }
  }

  for (const [nodeId, parentAreaNodeId] of parentAreaNodeIds) {
    const node = nodesById.get(nodeId);
    const parentNode = nodesById.get(parentAreaNodeId);
    const nodeRect = rectsByNodeId.get(nodeId);
    const parentRect = rectsByNodeId.get(parentAreaNodeId);

    if (!node || !parentNode || !nodeRect || !parentRect || rectContains(parentRect, nodeRect)) {
      continue;
    }

    issues.push(
      `Layout violation: ${node.id} (${node.type}) must be fully inside parent area ${parentNode.id} (${parentNode.type}), but its coordinates are outside or only partially inside.`
    );
  }

  const areaNodes = architectureJson.nodes.filter((node) => PREVIEW_AREA_RESOURCE_TYPES.has(node.type));

  for (let leftIndex = 0; leftIndex < areaNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < areaNodes.length; rightIndex += 1) {
      const leftNode = areaNodes[leftIndex];
      const rightNode = areaNodes[rightIndex];

      if (!leftNode || !rightNode) {
        continue;
      }

      const leftRect = rectsByNodeId.get(leftNode.id);
      const rightRect = rectsByNodeId.get(rightNode.id);

      if (!leftRect || !rightRect || !rectsOverlap(leftRect, rightRect)) {
        continue;
      }

      if (rectContains(leftRect, rightRect)) {
        if (!hasAncestorAreaNode(leftNode.id, rightNode.id, parentAreaNodeIds)) {
          issues.push(
            `Layout violation: area box ${rightNode.id} (${rightNode.type}) is visually inside ${leftNode.id} (${leftNode.type}) without a containment relationship. Add the correct parent reference or separate the areas.`
          );
        }

        continue;
      }

      if (rectContains(rightRect, leftRect)) {
        if (!hasAncestorAreaNode(rightNode.id, leftNode.id, parentAreaNodeIds)) {
          issues.push(
            `Layout violation: area box ${leftNode.id} (${leftNode.type}) is visually inside ${rightNode.id} (${rightNode.type}) without a containment relationship. Add the correct parent reference or separate the areas.`
          );
        }

        continue;
      }

      issues.push(
        `Layout violation: area boxes ${leftNode.id} (${leftNode.type}) and ${rightNode.id} (${rightNode.type}) overlap without full containment. Make one fully contain the other only when semantically related, otherwise separate them.`
      );
    }
  }

  for (const node of architectureJson.nodes) {
    if (PREVIEW_AREA_RESOURCE_TYPES.has(node.type) || PREVIEW_BOUNDARY_RESOURCE_TYPES.has(node.type)) {
      continue;
    }

    const nodeRect = rectsByNodeId.get(node.id);

    if (!nodeRect) {
      continue;
    }

    for (const areaNode of areaNodes) {
      if (hasAncestorAreaNode(areaNode.id, node.id, parentAreaNodeIds)) {
        continue;
      }

      const areaRect = rectsByNodeId.get(areaNode.id);

      if (!areaRect || !rectsOverlap(areaRect, nodeRect)) {
        continue;
      }

      if (rectContains(areaRect, nodeRect)) {
        issues.push(
          `Layout violation: ${node.id} (${node.type}) is visually inside area ${areaNode.id} (${areaNode.type}) without a containment reference. Add the correct parent reference or place it outside.`
        );

        continue;
      }

      issues.push(
        `Layout violation: ${node.id} (${node.type}) partially overlaps area ${areaNode.id} (${areaNode.type}) without being contained. Place it fully outside that area or add the correct containment reference.`
      );
    }
  }

  const readableNodes = architectureJson.nodes.filter((node) => !PREVIEW_AREA_RESOURCE_TYPES.has(node.type));
  const visualRectsByNodeId = new Map(
    readableNodes.map((node) => [node.id, createPreviewNodeVisualBoundsRect(node)])
  );

  for (let leftIndex = 0; leftIndex < readableNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < readableNodes.length; rightIndex += 1) {
      const leftNode = readableNodes[leftIndex];
      const rightNode = readableNodes[rightIndex];

      if (!leftNode || !rightNode) {
        continue;
      }

      const leftRect = visualRectsByNodeId.get(leftNode.id);
      const rightRect = visualRectsByNodeId.get(rightNode.id);

      if (!leftRect || !rightRect || !rectsOverlap(leftRect, rightRect)) {
        continue;
      }

      issues.push(
        `Layout violation: nodes ${leftNode.id} (${leftNode.type}) and ${rightNode.id} (${rightNode.type}) have overlapping visual or label bounds. Separate their coordinates so icons, labels, and edge labels remain readable.`
      );
    }
  }

  for (const edge of architectureJson.edges) {
    if (isPreviewParentEdge(edge)) {
      continue;
    }

    const sourceNode = nodesById.get(edge.sourceId);
    const targetNode = nodesById.get(edge.targetId);

    if (!sourceNode || !targetNode) {
      continue;
    }

    const sourceCenter = getPreviewNodeCenter(sourceNode);
    const targetCenter = getPreviewNodeCenter(targetNode);

    for (const node of architectureJson.nodes) {
      if (node.id === sourceNode.id || node.id === targetNode.id || PREVIEW_AREA_RESOURCE_TYPES.has(node.type)) {
        continue;
      }

      const nodeRect = rectsByNodeId.get(node.id);

      if (!nodeRect || !lineSegmentIntersectsRect(sourceCenter, targetCenter, nodeRect)) {
        continue;
      }

      issues.push(
        `Layout violation: visible edge ${edge.id} from ${sourceNode.id} to ${targetNode.id} has an edge path crosses unrelated resource ${node.id} (${node.type}). Move unrelated resources away from the arrow path or reroute by changing coordinates.`
      );
    }
  }

  return issues.slice(0, 8);
}

function hasAncestorAreaNode(
  ancestorAreaNodeId: string,
  nodeId: string,
  parentAreaNodeIds: ReadonlyMap<string, string>
): boolean {
  let parentAreaNodeId = parentAreaNodeIds.get(nodeId);
  const visitedNodeIds = new Set<string>();

  while (parentAreaNodeId) {
    if (parentAreaNodeId === ancestorAreaNodeId) {
      return true;
    }

    if (visitedNodeIds.has(parentAreaNodeId)) {
      return false;
    }

    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = parentAreaNodeIds.get(parentAreaNodeId);
  }

  return false;
}

function findExpectedParentAreaNodeId(
  node: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>,
  edges: readonly ArchitectureJson["edges"][number][]
): string | undefined {
  if (node.type === "SECURITY_GROUP") {
    const protectedSubnet = findProtectedSubnetAreaNode(node, nodesById);

    if (protectedSubnet) {
      return protectedSubnet.id;
    }
  }

  const securityGroupParent = findReferencedSecurityGroupAreaNodes(node, nodesById)[0];

  if (securityGroupParent) {
    return securityGroupParent.id;
  }

  const subnetParent = findConfigAreaNodeByKey(node, "subnetId", nodesById);

  if (subnetParent && subnetParent.id !== node.id) {
    return subnetParent.id;
  }

  const vpcParent = findConfigAreaNodeByKey(node, "vpcId", nodesById);

  if (vpcParent && vpcParent.id !== node.id) {
    return vpcParent.id;
  }

  return findEdgeParentAreaNode(node, nodesById, edges)?.id;
}

function findProtectedSubnetAreaNode(
  securityGroupNode: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  for (const node of nodesById.values()) {
    if (node.id === securityGroupNode.id || !referencesSecurityGroup(node, securityGroupNode, nodesById)) {
      continue;
    }

    const subnetNode = findConfigAreaNodeByKey(node, "subnetId", nodesById);

    if (subnetNode) {
      return subnetNode;
    }
  }

  return undefined;
}

function referencesSecurityGroup(
  node: ArchitectureJson["nodes"][number],
  securityGroupNode: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): boolean {
  return SECURITY_GROUP_REFERENCE_KEYS.flatMap((key) => getStringConfigValues(node, key)).some((referenceValue) => {
    const referencedNode = findReferencedArchitectureNode(referenceValue, nodesById);

    return referencedNode?.id === securityGroupNode.id;
  });
}

function findReferencedSecurityGroupAreaNodes(
  node: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number][] {
  return SECURITY_GROUP_REFERENCE_KEYS.flatMap((key) => getStringConfigValues(node, key))
    .map((referenceValue) => findReferencedArchitectureNode(referenceValue, nodesById))
    .filter((referencedNode): referencedNode is ArchitectureJson["nodes"][number] => {
      return referencedNode !== undefined && referencedNode.type === "SECURITY_GROUP";
    });
}

function findConfigAreaNodeByKey(
  node: ArchitectureJson["nodes"][number],
  key: string,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  const referencedNode = findConfigNodeByKey(node, key, nodesById);

  return referencedNode && PREVIEW_AREA_RESOURCE_TYPES.has(referencedNode.type) ? referencedNode : undefined;
}

function findConfigNodeByKey(
  node: ArchitectureJson["nodes"][number],
  key: string,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  const referenceValue = getStringConfigValue(node, key);

  return referenceValue ? findReferencedArchitectureNode(referenceValue, nodesById) : undefined;
}

function findReferencedArchitectureNode(
  rawReferenceValue: string,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  const referenceValue = normalizeReferenceValue(rawReferenceValue);
  const directNode = nodesById.get(referenceValue);

  if (directNode) {
    return directNode;
  }

  for (const node of nodesById.values()) {
    if (matchesTerraformArchitectureNodeReference(referenceValue, node)) {
      return node;
    }
  }

  return undefined;
}

function matchesTerraformArchitectureNodeReference(
  referenceValue: string,
  node: ArchitectureJson["nodes"][number]
): boolean {
  const terraformResourceType = RESOURCE_TYPE_TERRAFORM_NAMES[node.type];

  if (!terraformResourceType) {
    return false;
  }

  const resourceNames = new Set([node.id, getStringConfigValue(node, "terraformResourceName")].filter(Boolean));
  const references = [...resourceNames].flatMap((resourceName) => {
    return TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES.map((suffix) => `${terraformResourceType}.${resourceName}.${suffix}`);
  });

  return references.includes(referenceValue);
}

function findEdgeParentAreaNode(
  node: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>,
  edges: readonly ArchitectureJson["edges"][number][]
): ArchitectureJson["nodes"][number] | undefined {
  for (const edge of edges) {
    if (edge.targetId !== node.id || !isPreviewParentEdge(edge)) {
      continue;
    }

    const sourceNode = nodesById.get(edge.sourceId);

    if (sourceNode && sourceNode.id !== node.id && PREVIEW_AREA_RESOURCE_TYPES.has(sourceNode.type)) {
      return sourceNode;
    }
  }

  return undefined;
}

function isPreviewParentEdge(edge: ArchitectureJson["edges"][number]): boolean {
  return typeof edge.label === "string" && PREVIEW_PARENT_EDGE_LABELS.has(edge.label.trim().toLowerCase());
}

function createPreviewNodeRect(node: ArchitectureJson["nodes"][number]): LayoutRect {
  const size = PREVIEW_NODE_LAYOUT_SIZES[node.type] ?? DEFAULT_PREVIEW_NODE_SIZE;

  return {
    left: node.positionX,
    top: node.positionY,
    right: node.positionX + size.width,
    bottom: node.positionY + size.height
  };
}

function createPreviewNodeVisualBoundsRect(node: ArchitectureJson["nodes"][number]): LayoutRect {
  const iconRect = createPreviewNodeRect(node);
  const label = typeof node.label === "string" && node.label.trim() ? node.label.trim() : node.id;
  const labelWidth = Math.min(
    PREVIEW_LABEL_MAX_WIDTH,
    Math.max(iconRect.right - iconRect.left, label.length * PREVIEW_LABEL_CHARACTER_WIDTH + PREVIEW_LABEL_HORIZONTAL_PADDING)
  );
  const centerX = (iconRect.left + iconRect.right) / 2;

  return {
    left: centerX - labelWidth / 2 - PREVIEW_VISUAL_BOUNDS_HORIZONTAL_MARGIN,
    top: iconRect.top - PREVIEW_VISUAL_BOUNDS_VERTICAL_MARGIN,
    right: centerX + labelWidth / 2 + PREVIEW_VISUAL_BOUNDS_HORIZONTAL_MARGIN,
    bottom: iconRect.bottom + PREVIEW_LABEL_HEIGHT + PREVIEW_VISUAL_BOUNDS_VERTICAL_MARGIN
  };
}

function getPreviewNodeCenter(node: ArchitectureJson["nodes"][number]): { readonly x: number; readonly y: number } {
  const size = PREVIEW_NODE_LAYOUT_SIZES[node.type] ?? DEFAULT_PREVIEW_NODE_SIZE;

  return {
    x: node.positionX + size.width / 2,
    y: node.positionY + size.height / 2
  };
}

function rectContains(parent: LayoutRect, child: LayoutRect): boolean {
  return (
    child.left >= parent.left &&
    child.top >= parent.top &&
    child.right <= parent.right &&
    child.bottom <= parent.bottom
  );
}

function rectsOverlap(left: LayoutRect, right: LayoutRect): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function lineSegmentIntersectsRect(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  rect: LayoutRect
): boolean {
  if (pointInRect(start, rect) || pointInRect(end, rect)) {
    return true;
  }

  return (
    lineSegmentsIntersect(start, end, { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }) ||
    lineSegmentsIntersect(start, end, { x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }) ||
    lineSegmentsIntersect(start, end, { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }) ||
    lineSegmentsIntersect(start, end, { x: rect.left, y: rect.bottom }, { x: rect.left, y: rect.top })
  );
}

function pointInRect(point: { readonly x: number; readonly y: number }, rect: LayoutRect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function lineSegmentsIntersect(
  aStart: { readonly x: number; readonly y: number },
  aEnd: { readonly x: number; readonly y: number },
  bStart: { readonly x: number; readonly y: number },
  bEnd: { readonly x: number; readonly y: number }
): boolean {
  const denominator =
    (aStart.x - aEnd.x) * (bStart.y - bEnd.y) - (aStart.y - aEnd.y) * (bStart.x - bEnd.x);

  if (denominator === 0) {
    return false;
  }

  const aNumerator =
    (aStart.x - bStart.x) * (bStart.y - bEnd.y) - (aStart.y - bStart.y) * (bStart.x - bEnd.x);
  const bNumerator =
    (aStart.x - bStart.x) * (aStart.y - aEnd.y) - (aStart.y - bStart.y) * (aStart.x - aEnd.x);
  const aRatio = aNumerator / denominator;
  const bRatio = bNumerator / denominator;

  return aRatio >= 0 && aRatio <= 1 && bRatio >= 0 && bRatio <= 1;
}

function normalizeReferenceValue(value: string): string {
  return value.trim().replace(/^\$\{(.+)\}$/u, "$1");
}

function hasAnyNodeType(nodeTypes: ReadonlySet<ResourceType>, expectedTypes: readonly ResourceType[]): boolean {
  return expectedTypes.some((type) => nodeTypes.has(type));
}

function findRequirementCoverageNodeValidationIssues(preview: AmazonQArchitectureDraftPreview): string[] {
  const nodeIds = new Set(preview.architectureJson.nodes.map((node) => node.id));
  const missingNodeIds = new Set<string>();

  for (const coverage of preview.requirementCoverage ?? []) {
    for (const nodeId of coverage.nodes ?? []) {
      if (!nodeIds.has(nodeId)) {
        missingNodeIds.add(nodeId);
      }
    }
  }

  return [...missingNodeIds].map(
    (nodeId) => `Requirement coverage references missing node id '${nodeId}'. Use only node ids present in architectureJson.`
  );
}

function hasForbiddenDatabaseResource(architectureJson: ArchitectureJson): boolean {
  return architectureJson.nodes.some(isForbiddenDatabaseArchitectureNode);
}

function isForbiddenDatabaseArchitectureNode(node: ArchitectureJson["nodes"][number]): boolean {
  if (hasAnyNodeType(new Set([node.type]), ["RDS", "DB_SUBNET_GROUP", "SECRETS_MANAGER_SECRET"])) {
    return true;
  }

  return /(database|\bdb\b|rds|postgres|postgresql|mysql|db\s*subnet|secretsmanager.*credential|\uB370\uC774\uD130\uBCA0\uC774\uC2A4)/iu.test(
    createNodeSearchText(node)
  );
}

function hasForbiddenUploadResource(architectureJson: ArchitectureJson): boolean {
  return architectureJson.nodes.some(isForbiddenUploadResourceNode);
}

function isForbiddenUploadResourceNode(node: ArchitectureJson["nodes"][number]): boolean {
  const nodeText = createNodeSearchText(node);

  if (node.type === "S3") {
    return /upload|media|image|profile\s*image|post\s*image|attachment|presigned/iu.test(nodeText);
  }

  if (hasAnyNodeType(new Set([node.type]), ["IAM_POLICY", "IAM_ROLE", "LAMBDA", "KMS_KEY"])) {
    return /upload|media|presigned|file\s*processing|image\s*processing/iu.test(nodeText);
  }

  return /presigned\s*url|file\s*upload\s*flow|direct[-\s]*to[-\s]*s3\s*upload/iu.test(nodeText);
}

function hasForbiddenRealtimeResource(preview: AmazonQArchitectureDraftPreview): boolean {
  if (hasForbiddenRealtimeArchitectureNodes(preview.architectureJson)) {
    return true;
  }

  return (preview.requirementCoverage ?? []).some((coverage) =>
    hasPositiveRealtimeSignal(
      [
        coverage.answer,
        coverage.status,
        coverage.capability ?? "",
        coverage.assumption ?? "",
        ...(coverage.nodes ?? [])
      ].join(" ")
    )
  );
}

function hasForbiddenRealtimeArchitectureNodes(architectureJson: ArchitectureJson): boolean {
  return architectureJson.nodes.some(isForbiddenRealtimeArchitectureNode);
}

function isForbiddenRealtimeArchitectureNode(node: ArchitectureJson["nodes"][number]): boolean {
  const nodeText = createNodeSearchText(node);

  if (hasPositiveRealtimeSignal(nodeText)) {
    return true;
  }

  return (
    hasAnyNodeType(new Set([node.type]), ["API_GATEWAY_REST_API", "LAMBDA", "EC2"]) &&
    /(user|client|push|message|event|realtime|real-time|websocket|web\s*socket|\bsse\b|notification|notify|\uC2E4\uC2DC\uAC04|\uC54C\uB9BC|\uCC44\uD305)/iu.test(
      nodeText
    )
  );
}

function hasPositiveRealtimeSignal(text: string): boolean {
  const normalizedText = text.normalize("NFKC").toLowerCase();

  if (/(no\s+realtime|no\s+real-time|no\s+real\s*time|realtime:\s*(none|no)|real-time:\s*(none|no)|\uD544\uC694\s*\uC5C6\uC74C|\uC5C6\uC74C)/iu.test(normalizedText)) {
    return false;
  }

  return /(websocket|web\s*socket|server-sent|\bsse\b|realtime|real-time|realtime\s+notification|notification\s+api|push\s+notification|chat|\uC2E4\uC2DC\uAC04|\uCC44\uD305)/iu.test(
    normalizedText
  );
}

function mentionsDataPersistenceCoverage(text: string): boolean {
  return /(data\s*persistence|durable\s*(data|storage)|database|relational|rds|storage\s*assumption|\uB370\uC774\uD130|\uC800\uC7A5)/iu.test(
    text
  );
}

function mentionsPatternDecisionCoverage(text: string): boolean {
  return /(selected\s*pattern|chosen\s*pattern|pattern\s*id|rejected\s*pattern|alternative\s*pattern|preferred\s*pattern|trade[-\s]*off|선택.*패턴|거부.*패턴|대안.*패턴)/iu.test(
    text
  );
}

function mentionsFrontendDeliveryCoverage(text: string): boolean {
  return /(frontend|static\s*delivery|app\s*shell|spa|cdn|cloudfront|s3|asset\s*delivery|\uC815\uC801|\uD504론트엔드)/iu.test(
    text
  );
}

function mentionsBackendEntryCoverage(text: string): boolean {
  return /(backend|api\s*entry|runtime|load\s*balancer|alb|api\s*gateway|lambda|ec2|request\s*entry|\uBC31\uC5D4\uB4DC|api)/iu.test(
    text
  );
}

function mentionsGlobalDeliveryOrLatencyWarning(text: string): boolean {
  return /(global|worldwide|cdn|cloudfront|static\s*delivery|edge|single[-\s]*region.*latency|latency.*single[-\s]*region|api.*latency.*warning|database.*latency.*warning|\uAE00\uB85C\uBC8C|\uC9C0연|\uB2E8\uC77C\s*\uB9AC\uC804)/iu.test(
    text
  );
}

function mentionsUploadCoverage(text: string): boolean {
  return /(upload|media|image|presigned|direct[-\s]*to[-\s]*s3|file\s*handling|lifecycle|\uC5C5\uB85C\uB4DC|\uC774\uBBF8\uC9C0|\uBBF8\uB514\uC5B4)/iu.test(
    text
  );
}

function mentionsHighAvailabilityCoverage(text: string): boolean {
  return /(high\s*availability|redundan|multi[-\s]*az|failover|99\.99|no[-\s]*downtime|availability\s*trade[-\s]*off|\uAC00\uC6A9\uC131|\uB2E4\uC911\s*az|\uC911\uBCF5|\uC774\uC911화)/iu.test(
    text
  );
}

function mentionsCostWarningCoverage(text: string): boolean {
  return /(cost\s*warning|budget\s*risk|budget.*conflict|cost.*trade[-\s]*off|over\s*budget|exceed.*budget|\uBE44\uC6A9\s*\uACBD\uACE0|\uC608\uC0B0.*(\uCD08\uACFC|\uCDA9돌|\uC704험))/iu.test(
    text
  );
}

function mentionsForbiddenMultiRegionScope(text: string): boolean {
  return /(multi[-\s]*region\s*(api|database|rds)|api\/rds.*multi[-\s]*region|\uB2E4\uC911\s*\uB9AC\uC804.*(api|rds|\uB370\uC774\uD130\uBCA0\uC774\uC2A4))/iu.test(
    text
  );
}

function createCoverageSearchText(preview: AmazonQArchitectureDraftPreview): string {
  return [
    ...(preview.requirementCoverage ?? []).flatMap((coverage) => [
      coverage.answer,
      coverage.status,
      coverage.capability ?? "",
      coverage.assumption ?? "",
      ...(coverage.nodes ?? [])
    ]),
    ...(preview.assumptions ?? []),
    ...(preview.explanations ?? []),
    ...(preview.highlights ?? []),
    ...(preview.nextActions ?? []),
    preview.summary ?? "",
    ...preview.architectureJson.nodes.map(createNodeSearchText)
  ]
    .join("\n")
    .normalize("NFKC")
    .toLowerCase();
}

function createNodeSearchText(node: ArchitectureJson["nodes"][number]): string {
  return [node.id, node.label ?? "", node.type, JSON.stringify(node.config)].join(" ").normalize("NFKC").toLowerCase();
}

function getStringConfigValue(node: ArchitectureJson["nodes"][number], key: string): string | undefined {
  const value = node.config[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getStringConfigValues(node: ArchitectureJson["nodes"][number], key: string): string[] {
  const value = node.config[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function requiresServerlessOnlyArchitecture(normalizedPrompt: string): boolean {
  return hasPromptTerm(normalizedPrompt, ["serverless", "lambda", "without ec2", "no ec2", "ec2 without", "ec2 excluded", "ec2 not allowed", "\uC11C\uBC84\uB9AC\uC2A4", "\uB78C\uB2E4"]);
}

function getCanonicalPlanResourceMaxCount(
  plan: ArchitectureIntentPlan | null,
  resourceType: ResourceType
): number {
  const requestedQuantity = plan?.resourceQuantities?.[resourceType];

  if (requestedQuantity !== undefined) {
    return requestedQuantity;
  }

  if (resourceType === "S3") {
    return Math.max(
      1,
      (plan?.patternIds ?? []).filter((patternId) =>
        ["spa-cloudfront-s3", "github-cicd-codedeploy"].includes(patternId)
      ).length
    );
  }

  if (["SUBNET", "SECURITY_GROUP", "ROUTE_TABLE", "ROUTE_TABLE_ASSOCIATION", "IAM_ROLE"].includes(resourceType)) {
    return Number.POSITIVE_INFINITY;
  }

  return 1;
}

const ECS_ROLE_SENSITIVE_RESOURCE_TYPES = new Set<ResourceType>([
  "SUBNET",
  "ELASTIC_IP",
  "NAT_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "SECURITY_GROUP",
  "IAM_ROLE",
  "IAM_POLICY",
  "CLOUDWATCH_LOG_GROUP",
  "CLOUDWATCH_METRIC_ALARM",
  "DB_SUBNET_GROUP"
]);

function removeConflictingCanonicalPatternResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null
): ArchitectureJson {
  const patternIds = new Set(plan?.patternIds ?? []);
  const requiredResources = new Set(plan?.requiredResources ?? []);
  const hasEcsRuntime = (plan?.requiredResources ?? []).some(
    (resourceType) => resourceType === "ECS_SERVICE" || resourceType === "ECS_TASK_DEFINITION"
  );

  if (!patternIds.has("ecs-fargate") || patternIds.has("serverless-api") || !hasEcsRuntime) {
    return architectureJson;
  }

  const keepsObjectStorage =
    requiredResources.has("S3") ||
    patternIds.has("spa-cloudfront-s3") ||
    patternIds.has("github-cicd-codedeploy");
  const nodes = architectureJson.nodes.filter((node) => {
    if (ECS_ROLE_SENSITIVE_RESOURCE_TYPES.has(node.type)) {
      return false;
    }

    return node.type !== "S3" || keepsObjectStorage;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: architectureJson.edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
    )
  };
}

type CanonicalNodeSpec = {
  readonly id: string;
  readonly label: string;
  readonly config: Record<string, unknown>;
  readonly positionX: number;
  readonly positionY: number;
};

type UploadBucketProfile = Exclude<ArchitectureAnswerProfile["upload"], undefined | "none">;

type FargateServiceProfile = {
  readonly serviceId: string;
  readonly serviceLabel: string;
  readonly serviceName: string;
  readonly taskDefinitionId: string;
  readonly taskDefinitionLabel: string;
  readonly taskFamily: string;
  readonly containerName: string;
  readonly targetGroupId: string;
  readonly targetGroupLabel: string;
  readonly targetGroupName: string;
  readonly listenerLabel: string;
  readonly logGroupId: string;
  readonly logGroupName: string;
  readonly scalingTargetId: string;
  readonly scalingPolicyId: string;
  readonly cpuAlarmId: string;
  readonly positionY: number;
};

function resolveFargateServiceCount(normalizedPrompt: string): number {
  return resolveBackendProfile(normalizedPrompt) === "microservices" ? 3 : 1;
}

function resolveFargateServiceProfiles(
  normalizedPrompt: string,
  frontendProfile: ArchitectureAnswerProfile["frontend"]
): readonly FargateServiceProfile[] {
  const containerName = frontendProfile === "ssr" ? "web" : "app";
  const taskDefinitionLabel = frontendProfile === "ssr"
    ? "SSR Fargate Task Definition"
    : "Fargate Task Definition";

  if (resolveBackendProfile(normalizedPrompt) !== "microservices") {
    return [{
      serviceId: "ecs-service",
      serviceLabel: "Fargate Application Service",
      serviceName: "sketchcatch-app",
      taskDefinitionId: "ecs-task-definition",
      taskDefinitionLabel,
      taskFamily: "sketchcatch-app",
      containerName,
      targetGroupId: "app-target-group",
      targetGroupLabel: "Fargate Target Group",
      targetGroupName: "sketchcatch-app",
      listenerLabel: resolveRealtimeForwardLabel(normalizedPrompt),
      logGroupId: "ecs-log-group",
      logGroupName: "/ecs/sketchcatch-app",
      scalingTargetId: "ecs-scaling-target",
      scalingPolicyId: "ecs-scaling-policy",
      cpuAlarmId: "app-cpu-alarm",
      positionY: 700
    }];
  }

  return [
    {
      serviceId: "auth-member-service",
      serviceLabel: "Fargate Auth / Member Service",
      serviceName: "sketchcatch-auth-member",
      taskDefinitionId: "auth-member-task-definition",
      taskDefinitionLabel: "Auth / Member Task Definition",
      taskFamily: "sketchcatch-auth-member",
      containerName: "auth-member",
      targetGroupId: "auth-member-target-group",
      targetGroupLabel: "Auth / Member Target Group",
      targetGroupName: "sc-auth-member",
      listenerLabel: "/members/* + /auth/*",
      logGroupId: "auth-member-log-group",
      logGroupName: "/ecs/sketchcatch-auth-member",
      scalingTargetId: "auth-member-scaling-target",
      scalingPolicyId: "auth-member-scaling-policy",
      cpuAlarmId: "auth-member-cpu-alarm",
      positionY: 620
    },
    {
      serviceId: "commerce-board-service",
      serviceLabel: "Fargate Commerce / Board Service",
      serviceName: "sketchcatch-commerce-board",
      taskDefinitionId: "commerce-board-task-definition",
      taskDefinitionLabel: "Commerce / Board Task Definition",
      taskFamily: "sketchcatch-commerce-board",
      containerName: "commerce-board",
      targetGroupId: "commerce-board-target-group",
      targetGroupLabel: "Commerce / Board Target Group",
      targetGroupName: "sc-commerce-board",
      listenerLabel: "/commerce/* + /board/*",
      logGroupId: "commerce-board-log-group",
      logGroupName: "/ecs/sketchcatch-commerce-board",
      scalingTargetId: "commerce-board-scaling-target",
      scalingPolicyId: "commerce-board-scaling-policy",
      cpuAlarmId: "commerce-board-cpu-alarm",
      positionY: 760
    },
    {
      serviceId: "upload-service",
      serviceLabel: "Fargate Upload Service",
      serviceName: "sketchcatch-upload-api",
      taskDefinitionId: "upload-task-definition",
      taskDefinitionLabel: "Upload API Task Definition",
      taskFamily: "sketchcatch-upload-api",
      containerName: "upload-api",
      targetGroupId: "upload-target-group",
      targetGroupLabel: "Upload API Target Group",
      targetGroupName: "sc-upload-api",
      listenerLabel: "/uploads/*",
      logGroupId: "upload-log-group",
      logGroupName: "/ecs/sketchcatch-upload-api",
      scalingTargetId: "upload-scaling-target",
      scalingPolicyId: "upload-scaling-policy",
      cpuAlarmId: "upload-cpu-alarm",
      positionY: 900
    }
  ];
}

function createUploadBucketSpec(
  uploadProfile: UploadBucketProfile,
  positionX: number,
  positionY: number
): CanonicalNodeSpec {
  const bucketConfig = resolveUploadBucketConfig(uploadProfile);

  return canonicalNodeSpec(bucketConfig.id, bucketConfig.label, positionX, positionY, {
    bucketPrefix: bucketConfig.bucketPrefix,
    bucketPurpose: "user_uploads",
    publicAccessBlock: true,
    forceDestroy: false
  });
}

function resolveUploadBucketConfig(uploadProfile: UploadBucketProfile): {
  readonly id: string;
  readonly label: string;
  readonly bucketPrefix: string;
  readonly policyResourceArn: string;
} {
  switch (uploadProfile) {
    case "image":
      return {
        id: "image-upload-bucket",
        label: "Private Image Upload Bucket",
        bucketPrefix: "sketchcatch-image-uploads-",
        policyResourceArn: "arn:aws:s3:::sketchcatch-image-uploads-*/*"
      };
    case "large":
      return {
        id: "large-file-upload-bucket",
        label: "Private Large File Upload Bucket",
        bucketPrefix: "sketchcatch-large-file-uploads-",
        policyResourceArn: "arn:aws:s3:::sketchcatch-large-file-uploads-*/*"
      };
    case "mixed":
      return {
        id: "mixed-file-upload-bucket",
        label: "Private Mixed File Upload Bucket",
        bucketPrefix: "sketchcatch-file-uploads-",
        policyResourceArn: "arn:aws:s3:::sketchcatch-file-uploads-*/*"
      };
  }
}

function configureCanonicalPatternResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null,
  prompt: string
): ArchitectureJson {
  const patternIds = new Set(plan?.patternIds ?? []);
  const hasCiCdHandoff =
    patternIds.has("github-cicd-codedeploy") ||
    (plan?.requiredResources ?? []).some((resourceType) =>
      ["CODEBUILD_PROJECT", "CODEPIPELINE", "CODESTAR_CONNECTION"].includes(resourceType)
    );
  const hasEcsRuntime = architectureJson.nodes.some(
    (node) => node.type === "ECS_SERVICE" || node.type === "ECS_TASK_DEFINITION"
  );
  const usesRoleAwareEc2 =
    patternIds.has("alb-asg-ec2") &&
    !patternIds.has("serverless-api");

  if (usesRoleAwareEc2) {
    return configureCanonicalEc2PatternResources(architectureJson, plan, prompt);
  }

  if (patternIds.has("serverless-api")) {
    return configureCanonicalServerlessApiResources(architectureJson, prompt);
  }

  if (!patternIds.has("ecs-fargate") || patternIds.has("serverless-api") || !hasEcsRuntime) {
    return architectureJson;
  }

  const hasDatabase = patternIds.has("multi-az-rds");
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const realtimeTransport = resolveRealtimeTransport(normalizedPrompt);
  const frontendProfile = resolveFrontendProfile(normalizedPrompt);
  const uploadProfile = resolveUploadProfile(normalizedPrompt);
  const uploadBucketProfile = uploadProfile === undefined || uploadProfile === "none" ? undefined : uploadProfile;
  const taskSizing = resolveFargateTaskSizing(normalizedPrompt);
  const databaseAllocatedStorage = resolveDatabaseAllocatedStorage(normalizedPrompt);
  const databaseInstanceClass = resolveDatabaseInstanceClass(normalizedPrompt);
  const usesHttps = requiresHttpsTransport(normalizedPrompt);
  const serviceProfiles = resolveFargateServiceProfiles(normalizedPrompt, frontendProfile);
  const primaryServiceProfile = serviceProfiles[0]!;
  const usesEcsAutoScaling =
    plan?.runtimeTopology?.autoScaling === true ||
    resolveTrafficProfile(normalizedPrompt) === "bursty" ||
    requiresTimeVaryingTraffic(normalizedPrompt) ||
    serviceProfiles.length > 1;
  const hasLoadBalancer = architectureJson.nodes.some(
    (node) => node.type === "LOAD_BALANCER"
  );
  const staticWebsiteOriginEnabled = patternIds.has("spa-cloudfront-s3") && frontendProfile !== "ssr";
  const region = plan?.region ?? "ap-northeast-2";
  const vpcId = "vpc-main";
  const vpcRef = canonicalTerraformReference("aws_vpc", vpcId);
  const uploadBucketConfig = uploadBucketProfile === undefined ? undefined : resolveUploadBucketConfig(uploadBucketProfile);
  const subnetSpecs: CanonicalNodeSpec[] = [
    canonicalSubnetSpec("public-subnet-a", "Public Subnet A", "10.0.0.0/24", `${region}a`, "public", true, 180, 480, vpcRef),
    canonicalSubnetSpec("public-subnet-b", "Public Subnet B", "10.0.1.0/24", `${region}b`, "public", true, 420, 480, vpcRef),
    canonicalSubnetSpec("private-app-subnet-a", "Private App Subnet A", "10.0.10.0/24", `${region}a`, "private_app", false, 180, 700, vpcRef),
    canonicalSubnetSpec("private-app-subnet-b", "Private App Subnet B", "10.0.11.0/24", `${region}b`, "private_app", false, 420, 700, vpcRef),
    ...(hasDatabase
      ? [
          canonicalSubnetSpec("private-db-subnet-a", "Private DB Subnet A", "10.0.20.0/24", `${region}a`, "private_db", false, 180, 920, vpcRef),
          canonicalSubnetSpec("private-db-subnet-b", "Private DB Subnet B", "10.0.21.0/24", `${region}b`, "private_db", false, 420, 920, vpcRef)
        ]
      : [])
  ];
  const routeTableSpecs: CanonicalNodeSpec[] = [
    canonicalNodeSpec("public-route-table", "Public Route Table", 680, 480, {
      vpcId: vpcRef,
      route: [{ cidrBlock: "0.0.0.0/0", gatewayId: canonicalTerraformReference("aws_internet_gateway", "internet-gateway") }]
    }),
    canonicalNodeSpec("private-route-table-a", "Private Route Table A", 680, 700, {
      vpcId: vpcRef,
      route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-a") }]
    }),
    canonicalNodeSpec("private-route-table-b", "Private Route Table B", 900, 700, {
      vpcId: vpcRef,
      route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-b") }]
    })
  ];
  const associationSpecs = createCanonicalRouteAssociationSpecs(hasDatabase);
  const securityGroupSpecs: CanonicalNodeSpec[] = [
    ...(hasLoadBalancer
      ? [canonicalNodeSpec("alb-security-group", "ALB Security Group", 930, 480, {
          name: "sketchcatch-alb",
          description: usesHttps
            ? "Public HTTPS ingress through CloudFront or clients"
            : "Public HTTP ingress through CloudFront or clients",
          vpcId: vpcRef,
          ingress: [{
            protocol: "tcp",
            fromPort: usesHttps ? 443 : 80,
            toPort: usesHttps ? 443 : 80,
            cidrBlocks: ["0.0.0.0/0"]
          }]
        })]
      : []),
    canonicalNodeSpec("app-security-group", "Fargate App Security Group", 930, 700, {
      name: "sketchcatch-app",
      description: hasLoadBalancer
        ? "Application traffic from the ALB only"
        : "Private application task traffic",
      vpcId: vpcRef,
      ingress: hasLoadBalancer
        ? [{ protocol: "tcp", fromPort: 8080, toPort: 8080, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] }]
        : []
    }),
    ...(hasDatabase
      ? [canonicalNodeSpec("db-security-group", "Database Security Group", 930, 920, {
          name: "sketchcatch-db",
          description: "PostgreSQL traffic from Fargate tasks only",
          vpcId: vpcRef,
          ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, securityGroups: [canonicalTerraformReference("aws_security_group", "app-security-group")] }]
        })]
      : [])
  ];
  const roleTrustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  const codeBuildTrustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "codebuild.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  const codePipelineTrustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "codepipeline.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  const publicSubnetRefs = ["public-subnet-a", "public-subnet-b"].map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const privateAppSubnetRefs = ["private-app-subnet-a", "private-app-subnet-b"].map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const specsByType = new Map<ResourceType, readonly CanonicalNodeSpec[]>([
    ["SUBNET", subnetSpecs],
    ["ELASTIC_IP", [
      canonicalNodeSpec("nat-eip-a", "NAT Elastic IP A", 680, 350, { domain: "vpc" }),
      canonicalNodeSpec("nat-eip-b", "NAT Elastic IP B", 900, 350, { domain: "vpc" })
    ]],
    ["NAT_GATEWAY", [
      canonicalNodeSpec("nat-gateway-a", "NAT Gateway A", 680, 580, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-a"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-a")
      }),
      canonicalNodeSpec("nat-gateway-b", "NAT Gateway B", 900, 580, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-b"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-b")
      })
    ]],
    ["ROUTE_TABLE", routeTableSpecs],
    ["ROUTE_TABLE_ASSOCIATION", associationSpecs],
    ["SECURITY_GROUP", securityGroupSpecs],
    ["IAM_ROLE", [
      canonicalNodeSpec("ecs-execution-role", "ECS Task Execution Role", 1180, 700, { assumeRolePolicy: roleTrustPolicy }),
      canonicalNodeSpec("ecs-task-role", "ECS Task Role", 1380, 700, { assumeRolePolicy: roleTrustPolicy }),
      ...(hasCiCdHandoff
        ? [
            canonicalNodeSpec("codebuild-service-role", "CodeBuild Service Role", 1580, 700, {
              terraformResourceName: "codebuild_service_role",
              assumeRolePolicy: codeBuildTrustPolicy
            }),
            canonicalNodeSpec("codepipeline-service-role", "CodePipeline Service Role", 1780, 700, {
              terraformResourceName: "codepipeline_service_role",
              assumeRolePolicy: codePipelineTrustPolicy
            })
          ]
        : [])
    ]],
    ["IAM_POLICY", [canonicalNodeSpec("ecs-task-policy", "ECS Task Policy", 1380, 840, {
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Resource: `arn:aws:logs:${region}:*:log-group:/ecs/sketchcatch-*:*` },
          ...(uploadBucketConfig === undefined
            ? []
            : [{ Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject"], Resource: uploadBucketConfig.policyResourceArn }])
        ]
      })
    })]],
    ["CLOUDWATCH_LOG_GROUP", serviceProfiles.map((profile, index) => canonicalNodeSpec(profile.logGroupId, `${profile.serviceLabel} Logs`, 1180, profile.positionY + 80 + index * 20, {
      name: profile.logGroupName,
      retentionInDays: 30
    }))],
    ...(usesHttps
      ? [["ACM_CERTIFICATE", [canonicalNodeSpec("application-certificate", "Application TLS Certificate", 1180, 560, {
          domainName: "app.example.com",
          validationMethod: "DNS"
        })]] as const]
      : []),
    ...(usesEcsAutoScaling
      ? [
          ["APPLICATION_AUTO_SCALING_TARGET", serviceProfiles.map((profile) => canonicalNodeSpec(profile.scalingTargetId, `${profile.serviceLabel} Scaling Target`, 1780, profile.positionY, {
            minCapacity: taskSizing.desiredCount,
            maxCapacity: taskSizing.maxCapacity,
            resourceId: `service/${canonicalTerraformReference("aws_ecs_cluster", "ecs-cluster", "name")}/${canonicalTerraformReference("aws_ecs_service", profile.serviceId, "name")}`,
            scalableDimension: "ecs:service:DesiredCount",
            serviceNamespace: "ecs"
          }))] as const,
          ["APPLICATION_AUTO_SCALING_POLICY", serviceProfiles.map((profile) => canonicalNodeSpec(profile.scalingPolicyId, `${profile.serviceLabel} CPU Target Tracking`, 1980, profile.positionY, {
            name: `${profile.serviceName}-cpu-target`,
            policyType: "TargetTrackingScaling",
            resourceId: canonicalTerraformReference("aws_appautoscaling_target", profile.scalingTargetId, "resource_id"),
            scalableDimension: canonicalTerraformReference("aws_appautoscaling_target", profile.scalingTargetId, "scalable_dimension"),
            serviceNamespace: canonicalTerraformReference("aws_appautoscaling_target", profile.scalingTargetId, "service_namespace"),
            targetTrackingScalingPolicyConfiguration: {
              targetValue: 60,
              scaleInCooldown: 60,
              scaleOutCooldown: 30,
              predefinedMetricSpecification: [{
                predefinedMetricType: "ECSServiceAverageCPUUtilization"
              }]
            }
          }))] as const
        ]
      : []),
    ["CLOUDWATCH_METRIC_ALARM", [
      ...serviceProfiles.map((profile) =>
        canonicalNodeSpec(profile.cpuAlarmId, `${profile.serviceLabel} CPU Alarm`, 1180, profile.positionY + 240, createCanonicalMetricAlarmConfig(`${profile.serviceName}-cpu`, "AWS/ECS", "CPUUtilization", { ClusterName: canonicalTerraformReference("aws_ecs_cluster", "ecs-cluster", "name"), ServiceName: canonicalTerraformReference("aws_ecs_service", profile.serviceId, "name") }))
      ),
      ...(hasDatabase
        ? [canonicalNodeSpec("db-cpu-alarm", "Database CPU Alarm", 1380, 980, createCanonicalMetricAlarmConfig("sketchcatch-rds-cpu", "AWS/RDS", "CPUUtilization", { DBInstanceIdentifier: canonicalTerraformReference("aws_db_instance", "app-database", "id") }))]
        : [])
    ]],
    ["LOAD_BALANCER_TARGET_GROUP", serviceProfiles.map((profile) => canonicalNodeSpec(profile.targetGroupId, profile.targetGroupLabel, 1580, profile.positionY, {
      name: profile.targetGroupName,
      port: 8080,
      protocol: "HTTP",
      targetType: "ip",
      vpcId: vpcRef,
      healthCheck: { path: "/health", matcher: "200-399" }
    }))],
    ["API_GATEWAY_WEBSOCKET_API", [canonicalNodeSpec("api-gateway-websocket-api", "API Gateway WebSocket API", 1580, 1140, {
      name: "sketchcatch-realtime-updates",
      protocolType: "WEBSOCKET",
      routeSelectionExpression: "$request.body.action"
    })]],
    ["API_GATEWAY_V2_ROUTE", [canonicalNodeSpec("api-gateway-v2-route", "API Gateway WebSocket Default Route", 1780, 1140, {
      apiId: canonicalTerraformReference("aws_apigatewayv2_api", "api-gateway-websocket-api"),
      routeKey: "$default",
      target: `integrations/${canonicalTerraformReference("aws_apigatewayv2_integration", "api-gateway-v2-integration")}`
    })]],
    ["API_GATEWAY_V2_INTEGRATION", [canonicalNodeSpec("api-gateway-v2-integration", "API Gateway WebSocket ALB Integration", 1980, 1140, {
      apiId: canonicalTerraformReference("aws_apigatewayv2_api", "api-gateway-websocket-api"),
      integrationType: "HTTP_PROXY",
      integrationMethod: "ANY",
      integrationUri: canonicalTerraformReference("aws_lb_listener", usesHttps ? "https-listener" : "http-listener", "arn"),
      payloadFormatVersion: "1.0"
    })]],
    ["API_GATEWAY_V2_STAGE", [canonicalNodeSpec("api-gateway-v2-stage", "API Gateway WebSocket Stage", 2180, 1140, {
      apiId: canonicalTerraformReference("aws_apigatewayv2_api", "api-gateway-websocket-api"),
      name: "prod",
      autoDeploy: true
    })]],
    ["ECS_TASK_DEFINITION", serviceProfiles.map((profile) => canonicalNodeSpec(profile.taskDefinitionId, profile.taskDefinitionLabel, 1180, profile.positionY, {
      family: profile.taskFamily,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: taskSizing.cpu,
      memory: taskSizing.memory,
      executionRoleArn: canonicalTerraformReference("aws_iam_role", "ecs-execution-role", "arn"),
      taskRoleArn: canonicalTerraformReference("aws_iam_role", "ecs-task-role", "arn"),
      applicationFramework: frontendProfile === "ssr" ? "next_nuxt_ssr" : undefined,
      containerDefinitions: JSON.stringify([{ name: profile.containerName, image: "public.ecr.aws/docker/library/nginx:1.27-alpine", essential: true, portMappings: [{ containerPort: 8080, protocol: "tcp" }], logConfiguration: { logDriver: "awslogs", options: { "awslogs-group": profile.logGroupName, "awslogs-region": region, "awslogs-stream-prefix": profile.containerName } } }])
    }))],
    ["ECS_SERVICE", serviceProfiles.map((profile) => canonicalNodeSpec(profile.serviceId, profile.serviceLabel, 1380, profile.positionY, {
      name: profile.serviceName,
      cluster: canonicalTerraformReference("aws_ecs_cluster", "ecs-cluster"),
      taskDefinition: canonicalTerraformReference("aws_ecs_task_definition", profile.taskDefinitionId, "arn"),
      desiredCount: taskSizing.desiredCount,
      launchType: "FARGATE",
      ...(hasLoadBalancer ? { healthCheckGracePeriodSeconds: 60 } : {}),
      deploymentMinimumHealthyPercent: 100,
      deploymentMaximumPercent: 200,
      deploymentCircuitBreaker: { enable: true, rollback: true },
      networkConfiguration: { assignPublicIp: false, subnets: privateAppSubnetRefs, securityGroups: [canonicalTerraformReference("aws_security_group", "app-security-group")] },
      ...(hasLoadBalancer
        ? {
            loadBalancer: {
              targetGroupArn: canonicalTerraformReference(
                "aws_lb_target_group",
                profile.targetGroupId,
                "arn"
              ),
              containerName: profile.containerName,
              containerPort: 8080
            }
          }
        : {})
    }))],
    ...(hasDatabase
      ? [["DB_SUBNET_GROUP", [canonicalNodeSpec("db-subnet-group", "DB Subnet Group", 680, 920, {
          name: "sketchcatch-db-subnets",
          subnetIds: [
            canonicalTerraformReference("aws_subnet", "private-db-subnet-a"),
            canonicalTerraformReference("aws_subnet", "private-db-subnet-b")
          ]
        })]] as const]
      : []),
    ["S3", [
      ...(staticWebsiteOriginEnabled
        ? [canonicalNodeSpec("web-assets-bucket", "Web Assets Bucket", 180, 100, {
            bucketPurpose: "static_website_origin",
            publicAccessBlock: true,
            forceDestroy: false
          })]
        : []),
      ...(uploadBucketProfile === undefined
        ? []
        : [createUploadBucketSpec(uploadBucketProfile, staticWebsiteOriginEnabled ? 380 : 180, 100)])
    ]]
  ]);
  const replacementById = new Map<string, ArchitectureJson["nodes"][number]>();

  for (const [resourceType, specs] of specsByType) {
    const matchingNodes = architectureJson.nodes.filter((node) => node.type === resourceType);
    specs.forEach((spec, index) => {
      const node = matchingNodes[index];
      if (node !== undefined) {
        replacementById.set(node.id, { ...node, ...spec });
      }
    });
  }

  const staticBucket = architectureJson.nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
  ) ?? architectureJson.nodes.find((node) => node.type === "S3");
  const nodes = architectureJson.nodes.map((node) => {
    const replacement = replacementById.get(node.id);
    if (replacement !== undefined) {
      return replacement;
    }

    switch (node.type) {
      case "VPC":
        return { ...node, id: vpcId, label: "Main VPC", config: { cidrBlock: "10.0.0.0/16", enableDnsHostnames: true, enableDnsSupport: true } };
      case "INTERNET_GATEWAY":
        return { ...node, id: "internet-gateway", label: "Internet Gateway", config: { vpcId: vpcRef } };
      case "LOAD_BALANCER":
        return { ...node, id: "application-load-balancer", label: "Application Load Balancer", config: { name: "sketchcatch-app", internal: false, idleTimeout: realtimeTransport === "sse" ? 120 : 60, loadBalancerType: "application", subnets: publicSubnetRefs, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] } };
      case "LOAD_BALANCER_TARGET_GROUP":
        return { ...node, id: primaryServiceProfile.targetGroupId, label: primaryServiceProfile.targetGroupLabel, config: { name: primaryServiceProfile.targetGroupName, port: 8080, protocol: "HTTP", targetType: "ip", vpcId: vpcRef, healthCheck: { path: "/health", matcher: "200-399" } } };
      case "LOAD_BALANCER_LISTENER":
        return usesHttps
          ? { ...node, id: "https-listener", label: "ALB HTTPS Listener", config: { loadBalancerArn: canonicalTerraformReference("aws_lb", "application-load-balancer", "arn"), port: 443, protocol: "HTTPS", sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06", certificateArn: canonicalTerraformReference("aws_acm_certificate", "application-certificate", "arn"), defaultAction: [{ type: "forward", targetGroupArn: canonicalTerraformReference("aws_lb_target_group", primaryServiceProfile.targetGroupId, "arn") }] } }
          : { ...node, id: "http-listener", label: "ALB HTTP Listener", config: { loadBalancerArn: canonicalTerraformReference("aws_lb", "application-load-balancer", "arn"), port: 80, protocol: "HTTP", defaultAction: [{ type: "forward", targetGroupArn: canonicalTerraformReference("aws_lb_target_group", primaryServiceProfile.targetGroupId, "arn") }] } };
      case "ECR_REPOSITORY":
        return { ...node, id: "app-repository", label: "Application ECR Repository", config: { name: "sketchcatch-app", imageTagMutability: "IMMUTABLE", imageScanningConfiguration: { scanOnPush: true } } };
      case "ECS_CLUSTER":
        return { ...node, id: "ecs-cluster", label: "Fargate ECS Cluster", config: { name: "sketchcatch-app" } };
      case "ECS_TASK_DEFINITION":
        return { ...node, id: primaryServiceProfile.taskDefinitionId, label: primaryServiceProfile.taskDefinitionLabel, config: { family: primaryServiceProfile.taskFamily, networkMode: "awsvpc", requiresCompatibilities: ["FARGATE"], cpu: taskSizing.cpu, memory: taskSizing.memory, executionRoleArn: canonicalTerraformReference("aws_iam_role", "ecs-execution-role", "arn"), taskRoleArn: canonicalTerraformReference("aws_iam_role", "ecs-task-role", "arn"), applicationFramework: frontendProfile === "ssr" ? "next_nuxt_ssr" : undefined, containerDefinitions: JSON.stringify([{ name: primaryServiceProfile.containerName, image: "public.ecr.aws/docker/library/nginx:1.27-alpine", essential: true, portMappings: [{ containerPort: 8080, protocol: "tcp" }], logConfiguration: { logDriver: "awslogs", options: { "awslogs-group": primaryServiceProfile.logGroupName, "awslogs-region": region, "awslogs-stream-prefix": primaryServiceProfile.containerName } } }]) } };
      case "ECS_SERVICE":
        return {
          ...node,
          id: primaryServiceProfile.serviceId,
          label: primaryServiceProfile.serviceLabel,
          config: {
            name: primaryServiceProfile.serviceName,
            cluster: canonicalTerraformReference("aws_ecs_cluster", "ecs-cluster"),
            taskDefinition: canonicalTerraformReference(
              "aws_ecs_task_definition",
              primaryServiceProfile.taskDefinitionId,
              "arn"
            ),
            desiredCount: taskSizing.desiredCount,
            launchType: "FARGATE",
            ...(hasLoadBalancer ? { healthCheckGracePeriodSeconds: 60 } : {}),
            deploymentMinimumHealthyPercent: 100,
            deploymentMaximumPercent: 200,
            deploymentCircuitBreaker: { enable: true, rollback: true },
            networkConfiguration: {
              assignPublicIp: false,
              subnets: privateAppSubnetRefs,
              securityGroups: [
                canonicalTerraformReference("aws_security_group", "app-security-group")
              ]
            },
            ...(hasLoadBalancer
              ? {
                  loadBalancer: {
                    targetGroupArn: canonicalTerraformReference(
                      "aws_lb_target_group",
                      primaryServiceProfile.targetGroupId,
                      "arn"
                    ),
                    containerName: primaryServiceProfile.containerName,
                    containerPort: 8080
                  }
                }
              : {})
          }
        };
      case "CLOUDFRONT":
        return { ...node, config: { ...node.config, originResourceId: frontendProfile === "ssr" ? "application-load-balancer" : staticBucket?.id, originType: frontendProfile === "ssr" ? "application" : "static", enabled: true, viewerProtocolPolicy: "redirect-to-https" } };
      case "RDS":
        return { ...node, id: "app-database", label: "Multi-AZ Application Database", config: { engine: "postgres", instanceClass: databaseInstanceClass, allocatedStorage: databaseAllocatedStorage, multiAz: true, publiclyAccessible: false, storageEncrypted: true, backupRetentionPeriod: 7, deletionProtection: true, skipFinalSnapshot: false, finalSnapshotIdentifier: "sketchcatch-app-final", dbSubnetGroupName: canonicalTerraformReference("aws_db_subnet_group", "db-subnet-group", "name"), vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "db-security-group")] } };
      case "SECRETS_MANAGER_SECRET":
        return { ...node, id: "database-secret", label: "Database Credentials Secret", config: { name: "sketchcatch/database/credentials", recoveryWindowInDays: 7 } };
      default:
        return node;
    }
  });

  return {
    nodes: applyCanonicalCiCdTerraformNames(nodes, hasCiCdHandoff),
    edges: architectureJson.edges
  };
}

function applyCanonicalCiCdTerraformNames(
  nodes: readonly ArchitectureJson["nodes"][number][],
  hasCiCdHandoff: boolean
): ArchitectureJson["nodes"] {
  if (!hasCiCdHandoff) {
    return [...nodes];
  }

  const artifactBucket = [...nodes].reverse().find(
    (node) => node.type === "S3" && node.config.bucketPurpose !== "static_website_origin"
  );

  return nodes.map((node) => {
    const terraformResourceName = (() => {
      switch (node.type) {
        case "CODEBUILD_PROJECT":
          return "build";
        case "CODEPIPELINE":
          return "pipeline";
        case "CODESTAR_CONNECTION":
          return "github";
        case "S3":
          return node.id === artifactBucket?.id ? "codepipeline_artifacts" : undefined;
        case "VPC":
          return "vpc_main";
        default:
          return undefined;
      }
    })();

    return terraformResourceName === undefined
      ? node
      : { ...node, config: { ...node.config, terraformResourceName } };
  });
}

function configureCanonicalServerlessApiResources(
  architectureJson: ArchitectureJson,
  prompt: string
): ArchitectureJson {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const uploadProfile = resolveUploadProfile(normalizedPrompt);
  const uploadBucketProfile = uploadProfile === undefined || uploadProfile === "none" ? undefined : uploadProfile;
  const uploadBucketConfig = uploadBucketProfile === undefined ? undefined : resolveUploadBucketConfig(uploadBucketProfile);
  const hasCloudFront = architectureJson.nodes.some((node) => node.type === "CLOUDFRONT");
  const staticBucket = hasCloudFront
    ? architectureJson.nodes.find(
        (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
      ) ?? architectureJson.nodes.find((node) => node.type === "S3")
    : undefined;
  const staticOriginId = staticBucket?.id ?? "web-assets-bucket";
  let uploadS3Index = 0;

  const nodes = architectureJson.nodes.map((node) => {
    switch (node.type) {
      case "API_GATEWAY_REST_API":
        return {
          ...node,
          id: "api-gateway",
          label: "Practice REST API",
          config: {
            ...node.config,
            name: "practice-api",
            description: "Low-cost API entry point for the mobile backend Lambda function"
          }
        };
      case "LAMBDA":
        return {
          ...node,
          id: "lambda-function",
          label: "Lambda Function",
          config: {
            ...node.config,
            functionName: "practice-function",
            handler: "index.handler",
            runtime: "nodejs20.x",
            timeout: 20,
            memorySize: 128
          }
        };
      case "S3":
        if (hasCloudFront && node.id === staticBucket?.id) {
          return {
            ...node,
            id: staticOriginId,
            label: node.label ?? "Web Assets Bucket",
            config: {
              ...node.config,
              bucketPurpose: "static_website_origin",
              publicAccessBlock: true,
              forceDestroy: false
            }
          };
        }

        uploadS3Index += 1;
        if (uploadBucketConfig === undefined || uploadS3Index > 1) {
          return {
            ...node,
            config: {
              ...node.config,
              ...(node.config.bucketPurpose === undefined ? { bucketPurpose: "user_uploads" } : {}),
              publicAccessBlock: true,
              forceDestroy: false
            }
          };
        }

        return {
          ...node,
          id: uploadBucketConfig.id,
          label: uploadBucketConfig.label,
          config: {
            ...node.config,
            bucketPrefix: uploadBucketConfig.bucketPrefix,
            bucketPurpose: "user_uploads",
            publicAccessBlock: true,
            forceDestroy: false,
            servicePurpose: "file_upload_service"
          }
        };
      case "CLOUDFRONT":
        return {
          ...node,
          id: "cloudfront-distribution",
          label: "CloudFront Public Entry",
          config: {
            ...node.config,
            enabled: true,
            originResourceId: staticOriginId,
            origin: {
              domainName: `${staticOriginId}.s3.amazonaws.com`,
              originId: "static-assets"
            },
            defaultCacheBehavior: {
              allowedMethods: ["GET", "HEAD", "OPTIONS"],
              cachedMethods: ["GET", "HEAD"],
              targetOriginId: "static-assets",
              viewerProtocolPolicy: "redirect-to-https"
            },
            restrictions: {
              geoRestriction: [{ restrictionType: "none" }]
            },
            viewerCertificate: {
              cloudfrontDefaultCertificate: true
            },
            priceClass: "PriceClass_100"
          }
        };
      case "RDS":
        return {
          ...node,
          id: "app-database",
          label: "Application Database",
          config: {
            ...node.config,
            identifier: "practice-db",
            allocatedStorage: node.config.allocatedStorage ?? 20,
            engine: node.config.engine ?? "postgres",
            instanceClass: node.config.instanceClass ?? "db.t4g.micro",
            username: "admin",
            password: "var.db_password",
            dbName: "appdb",
            publiclyAccessible: false,
            storageEncrypted: true,
            storageType: node.config.storageType ?? "gp3",
            backupRetentionPeriod: node.config.backupRetentionPeriod ?? 7,
            deletionProtection: node.config.deletionProtection ?? true,
            skipFinalSnapshot: node.config.skipFinalSnapshot ?? false
          }
        };
      case "DYNAMODB_TABLE":
        return {
          ...node,
          id: "app-data-table",
          label: "Application Data Table",
          config: {
            ...node.config,
            name: "practice-board-data",
            billingMode: "PAY_PER_REQUEST",
            hashKey: "pk",
            rangeKey: "sk",
            attribute: [
              { name: "pk", type: "S" },
              { name: "sk", type: "S" }
            ]
          }
        };
      case "CLOUDWATCH_LOG_GROUP":
        {
          const logGroupConfig = { ...node.config };
          delete logGroupConfig.kmsKeyId;

          return {
            ...node,
            id: "lambda-log-group",
            label: "Lambda Logs",
            config: {
              ...logGroupConfig,
              name: "/aws/lambda/practice-function",
              retentionInDays: 30
            }
          };
        }
      case "CLOUDWATCH_METRIC_ALARM":
        return {
          ...node,
          id: "lambda-error-alarm",
          label: "Lambda Error Alarm",
          config: {
            ...node.config,
            alarmName: "practice-lambda-errors",
            namespace: "AWS/Lambda",
            metricName: "Errors",
            comparisonOperator: "GreaterThanThreshold",
            threshold: 0
          }
        };
      default:
        return node;
    }
  });

  if (!nodes.some((node) => node.type === "IAM_ROLE")) {
    nodes.push({
      id: "lambda-execution-role",
      type: "IAM_ROLE",
      label: "Lambda Execution Role",
      positionX: 420,
      positionY: 360,
      config: {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole"
            }
          ]
        })
      }
    });
  }

  return { nodes, edges: architectureJson.edges };
}

function configureRequiredHttpsTransport(
  architectureJson: ArchitectureJson,
  prompt: string
): ArchitectureJson {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  if (!requiresHttpsTransport(normalizedPrompt)) {
    return architectureJson;
  }

  const publicLoadBalancer = architectureJson.nodes.find(
    (node) => node.type === "LOAD_BALANCER" && node.config.internal !== true
  );
  const existingListener = architectureJson.nodes.find(
    (node) => node.type === "LOAD_BALANCER_LISTENER"
  );
  if (publicLoadBalancer === undefined) {
    return architectureJson;
  }

  const existingTargetGroup = architectureJson.nodes.find(
    (node) => node.type === "LOAD_BALANCER_TARGET_GROUP"
  );
  const listenerId = existingListener?.id ?? createUniqueCanonicalNodeId(
    architectureJson.nodes,
    "application-https-listener"
  );
  const targetGroupId = existingTargetGroup?.id ?? createUniqueCanonicalNodeId(
    architectureJson.nodes,
    "application-target-group"
  );

  const existingCertificate = architectureJson.nodes.find(
    (node) => node.type === "ACM_CERTIFICATE"
  );
  const certificateId = existingCertificate?.id ?? createUniqueCanonicalNodeId(
    architectureJson.nodes,
    "application-certificate"
  );
  const certificateNode = existingCertificate ?? {
    id: certificateId,
    type: "ACM_CERTIFICATE" as const,
    label: "Application TLS Certificate",
    positionX: (existingListener?.positionX ?? publicLoadBalancer.positionX) - 180,
    positionY: (existingListener?.positionY ?? publicLoadBalancer.positionY) + 180,
    config: {
      domainName: "app.example.com",
      validationMethod: "DNS"
    }
  };
  const targetGroupNode = existingTargetGroup ?? {
    id: targetGroupId,
    type: "LOAD_BALANCER_TARGET_GROUP" as const,
    label: "Application Target Group",
    positionX: publicLoadBalancer.positionX + 480,
    positionY:
      Math.max(...architectureJson.nodes.map((node) => node.positionY)) + 160,
    config: {
      name: "sketchcatch-app",
      port: 8080,
      protocol: "HTTP",
      targetType: architectureJson.nodes.some((node) => node.type === "ECS_SERVICE")
        ? "ip"
        : "instance",
      ...(architectureJson.nodes.find((node) => node.type === "VPC") === undefined
        ? {}
        : {
            vpcId: canonicalTerraformReference(
              "aws_vpc",
              architectureJson.nodes.find((node) => node.type === "VPC")!.id
            )
          })
    }
  };
  const listenerNode = {
    ...(existingListener ?? {
      id: listenerId,
      type: "LOAD_BALANCER_LISTENER" as const,
      label: "ALB HTTPS Listener",
      positionX: publicLoadBalancer.positionX,
      positionY: publicLoadBalancer.positionY + 180,
      config: {}
    }),
    label: "ALB HTTPS Listener",
    config: {
      ...(existingListener?.config ?? {}),
      loadBalancerArn: canonicalTerraformReference("aws_lb", publicLoadBalancer.id, "arn"),
      port: 443,
      protocol: "HTTPS",
      sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      certificateArn: canonicalTerraformReference(
        "aws_acm_certificate",
        certificateId,
        "arn"
      ),
      defaultAction: [{
        type: "forward",
        targetGroupArn: canonicalTerraformReference(
          "aws_lb_target_group",
          targetGroupId,
          "arn"
        )
      }]
    }
  };
  const nodes = architectureJson.nodes
    .map((node) =>
      node.id === existingListener?.id
        ? {
            ...listenerNode
          }
        : node
    );

  if (existingListener === undefined) {
    nodes.push(listenerNode);
  }
  if (existingCertificate === undefined) {
    nodes.push(certificateNode);
  }
  if (existingTargetGroup === undefined) {
    nodes.push(targetGroupNode);
  }

  const edges = [...architectureJson.edges];
  addArchitectureEdge(
    edges,
    `canonical-${publicLoadBalancer.id}-to-${listenerId}`,
    publicLoadBalancer.id,
    listenerId,
    "listens"
  );
  addArchitectureEdge(
    edges,
    `canonical-${listenerId}-to-${targetGroupId}`,
    listenerId,
    targetGroupId,
    resolveRealtimeForwardLabel(normalizedPrompt)
  );
  addArchitectureEdge(
    edges,
    `canonical-${certificateId}-to-${listenerId}`,
    certificateId,
    listenerId,
    "TLS certificate"
  );

  return { nodes, edges };
}

function configureCanonicalEc2PatternResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null,
  prompt: string
): ArchitectureJson {
  const patternIds = new Set(plan?.patternIds ?? []);
  const hasDatabase = patternIds.has("multi-az-rds");
  const region = plan?.region ?? "ap-northeast-2";
  const vpcId = "vpc-main";
  const vpcRef = canonicalTerraformReference("aws_vpc", vpcId);
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const computeCount = Math.max(
    2,
    resolveEc2FleetCapacity(normalizedPrompt),
    plan?.runtimeTopology?.computeCount ?? 0,
    plan?.resourceQuantities?.EC2 ?? 0
  );
  const publicSubnetIds = ["public-subnet-a", "public-subnet-b"];
  const privateAppSubnetIds = ["private-app-subnet-a", "private-app-subnet-b"];
  const privateDbSubnetIds = ["private-db-subnet-a", "private-db-subnet-b"];
  const publicSubnetRefs = publicSubnetIds.map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const privateAppSubnetRefs = privateAppSubnetIds.map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const subnetSpecs: CanonicalNodeSpec[] = [
    canonicalSubnetSpec("public-subnet-a", "Public Subnet A", "10.0.0.0/24", `${region}a`, "public", true, 180, 480, vpcRef),
    canonicalSubnetSpec("public-subnet-b", "Public Subnet B", "10.0.1.0/24", `${region}b`, "public", true, 850, 480, vpcRef),
    canonicalSubnetSpec("private-app-subnet-a", "Private App Subnet A", "10.0.10.0/24", `${region}a`, "private_app", false, 180, 760, vpcRef),
    canonicalSubnetSpec("private-app-subnet-b", "Private App Subnet B", "10.0.11.0/24", `${region}b`, "private_app", false, 850, 760, vpcRef),
    ...(hasDatabase
      ? [
          canonicalSubnetSpec("private-db-subnet-a", "Private DB Subnet A", "10.0.20.0/24", `${region}a`, "private_db", false, 180, 1040, vpcRef),
          canonicalSubnetSpec("private-db-subnet-b", "Private DB Subnet B", "10.0.21.0/24", `${region}b`, "private_db", false, 850, 1040, vpcRef)
        ]
      : [])
  ];
  const ec2TrustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  const uploadProfile = resolveUploadProfile(normalizedPrompt);
  const uploadBucketProfile = uploadProfile === undefined || uploadProfile === "none" ? undefined : uploadProfile;
  const uploadBucketConfig = uploadBucketProfile === undefined ? undefined : resolveUploadBucketConfig(uploadBucketProfile);
  const realtimeTransport = resolveRealtimeTransport(normalizedPrompt);
  const usesHttps = requiresHttpsTransport(normalizedPrompt);
  const staticWebsiteOriginEnabled = patternIds.has("spa-cloudfront-s3");
  const ec2InstanceType = resolveEc2InstanceType(normalizedPrompt);
  const ec2ScalingPolicyConfig = resolveEc2AutoScalingPolicyConfig(normalizedPrompt);
  const databaseAllocatedStorage = resolveDatabaseAllocatedStorage(
    normalizedPrompt
  );
  const databaseInstanceClass = resolveDatabaseInstanceClass(normalizedPrompt);
  const specsByType = new Map<ResourceType, readonly CanonicalNodeSpec[]>([
    ["SUBNET", subnetSpecs],
    ["ELASTIC_IP", [
      canonicalNodeSpec("nat-eip-a", "NAT Elastic IP A", 80, 260, { domain: "vpc" }),
      canonicalNodeSpec("nat-eip-b", "NAT Elastic IP B", 260, 260, { domain: "vpc" })
    ]],
    ["NAT_GATEWAY", [
      canonicalNodeSpec("nat-gateway-a", "NAT Gateway A", 220, 540, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-a"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-a")
      }),
      canonicalNodeSpec("nat-gateway-b", "NAT Gateway B", 890, 540, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-b"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-b")
      })
    ]],
    ["ROUTE_TABLE", [
      canonicalNodeSpec("public-route-table", "Public Route Table", 1380, 480, {
        vpcId: vpcRef,
        route: [{ cidrBlock: "0.0.0.0/0", gatewayId: canonicalTerraformReference("aws_internet_gateway", "internet-gateway") }]
      }),
      canonicalNodeSpec("private-route-table-a", "Private Route Table A", 1380, 700, {
        vpcId: vpcRef,
        route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-a") }]
      }),
      canonicalNodeSpec("private-route-table-b", "Private Route Table B", 1580, 700, {
        vpcId: vpcRef,
        route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-b") }]
      })
    ]],
    ["ROUTE_TABLE_ASSOCIATION", createCanonicalRouteAssociationSpecs(hasDatabase)],
    ["SECURITY_GROUP", [
      canonicalNodeSpec("alb-security-group", "ALB Security Group", 1180, 480, {
        name: "sketchcatch-alb",
        description: usesHttps
          ? "Public HTTPS ingress to the application load balancer"
          : "Public HTTP ingress to the application load balancer",
        vpcId: vpcRef,
        ingress: [{ protocol: "tcp", fromPort: usesHttps ? 443 : 80, toPort: usesHttps ? 443 : 80, cidrBlocks: ["0.0.0.0/0"] }],
        egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }]
      }),
      canonicalNodeSpec("app-security-group", "EC2 App Security Group", 1180, 760, {
        name: "sketchcatch-app",
        description: "Application traffic from the ALB only",
        vpcId: vpcRef,
        ingress: [{ protocol: "tcp", fromPort: 8080, toPort: 8080, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] }],
        egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }]
      }),
      ...(hasDatabase
        ? [canonicalNodeSpec("db-security-group", "Database Security Group", 680, 1040, {
            name: "sketchcatch-db",
            description: "PostgreSQL traffic from the EC2 application tier only",
            vpcId: vpcRef,
            ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, securityGroups: [canonicalTerraformReference("aws_security_group", "app-security-group")] }]
          })]
        : [])
    ]],
    ["AMI", [canonicalNodeSpec("app-ami", "Amazon Linux 2023 AMI", 620, 100, {
      mostRecent: true,
      owners: ["amazon"],
      filter: [
        { name: "name", values: ["al2023-ami-2023.*-x86_64"] },
        { name: "virtualization-type", values: ["hvm"] }
      ]
    })]],
    ["IAM_ROLE", [canonicalNodeSpec("app-runtime-role", "EC2 Runtime Role", 820, 100, {
      assumeRolePolicy: ec2TrustPolicy
    })]],
    ["IAM_POLICY", [canonicalNodeSpec("app-runtime-policy", "EC2 Runtime Policy", 1020, 100, {
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
            Resource: `arn:aws:logs:${region}:*:log-group:/sketchcatch/ec2/app:*`
          },
          {
            Effect: "Allow",
            Action: ["cloudwatch:PutMetricData", "ssm:UpdateInstanceInformation"],
            Resource: "*"
          },
          ...(uploadBucketConfig === undefined
            ? []
            : [{
                Effect: "Allow",
                Action: ["s3:GetObject", "s3:PutObject"],
                Resource: uploadBucketConfig.policyResourceArn
              }]
            )
        ]
      })
    })]],
    ["IAM_INSTANCE_PROFILE", [canonicalNodeSpec("app-instance-profile", "EC2 Instance Profile", 1220, 100, {
      name: "sketchcatch-app",
      role: canonicalTerraformReference("aws_iam_role", "app-runtime-role", "name")
    })]],
    ["CLOUDWATCH_LOG_GROUP", [canonicalNodeSpec("app-log-group", "Application Logs", 1420, 100, {
      name: "/sketchcatch/ec2/app",
      retentionInDays: 30
    })]],
    ...(usesHttps
      ? [["ACM_CERTIFICATE", [canonicalNodeSpec("application-certificate", "Application TLS Certificate", 1620, 260, {
          domainName: "app.example.com",
          validationMethod: "DNS"
        })]] as const]
      : []),
    ["CLOUDWATCH_METRIC_ALARM", [
      canonicalNodeSpec("app-cpu-alarm", "ASG CPU Alarm", 1620, 100, {
        ...createCanonicalMetricAlarmConfig("sketchcatch-ec2-cpu", "AWS/EC2", "CPUUtilization", {
          AutoScalingGroupName: canonicalTerraformReference("aws_autoscaling_group", "app-auto-scaling-group", "name")
        }),
        alarmActions: [canonicalTerraformReference("aws_autoscaling_policy", "app-scaling-policy", "arn")]
      }),
      ...(hasDatabase
        ? [canonicalNodeSpec("db-cpu-alarm", "Database CPU Alarm", 1820, 100, createCanonicalMetricAlarmConfig("sketchcatch-rds-cpu", "AWS/RDS", "CPUUtilization", {
            DBInstanceIdentifier: canonicalTerraformReference("aws_db_instance", "app-database", "id")
          }))]
        : [])
    ]],
    ["DB_SUBNET_GROUP", hasDatabase
      ? [canonicalNodeSpec("db-subnet-group", "DB Subnet Group", 580, 1040, {
          name: "sketchcatch-db-subnets",
          subnetIds: privateDbSubnetIds.map((id) => canonicalTerraformReference("aws_subnet", id))
        })]
      : []],
    ["API_GATEWAY_WEBSOCKET_API", [canonicalNodeSpec("api-gateway-websocket-api", "API Gateway WebSocket API", 1380, 1040, {
      name: "sketchcatch-realtime-updates",
      protocolType: "WEBSOCKET",
      routeSelectionExpression: "$request.body.action"
    })]],
    ["API_GATEWAY_V2_ROUTE", [canonicalNodeSpec("api-gateway-v2-route", "API Gateway WebSocket Default Route", 1580, 1040, {
      apiId: canonicalTerraformReference("aws_apigatewayv2_api", "api-gateway-websocket-api"),
      routeKey: "$default",
      target: `integrations/${canonicalTerraformReference("aws_apigatewayv2_integration", "api-gateway-v2-integration")}`
    })]],
    ["API_GATEWAY_V2_INTEGRATION", [canonicalNodeSpec("api-gateway-v2-integration", "API Gateway WebSocket ALB Integration", 1780, 1040, {
      apiId: canonicalTerraformReference("aws_apigatewayv2_api", "api-gateway-websocket-api"),
      integrationType: "HTTP_PROXY",
      integrationMethod: "ANY",
      integrationUri: canonicalTerraformReference("aws_lb_listener", usesHttps ? "https-listener" : "http-listener", "arn"),
      payloadFormatVersion: "1.0"
    })]],
    ["API_GATEWAY_V2_STAGE", [canonicalNodeSpec("api-gateway-v2-stage", "API Gateway WebSocket Stage", 1980, 1040, {
      apiId: canonicalTerraformReference("aws_apigatewayv2_api", "api-gateway-websocket-api"),
      name: "prod",
      autoDeploy: true
    })]],
    ["S3", [
      ...(staticWebsiteOriginEnabled
        ? [canonicalNodeSpec("web-assets-bucket", "Web Assets Bucket", 180, 100, {
            bucketPurpose: "static_website_origin",
            publicAccessBlock: true,
            forceDestroy: false
          })]
        : []),
      ...(uploadBucketProfile === undefined
        ? []
        : [createUploadBucketSpec(uploadBucketProfile, staticWebsiteOriginEnabled ? 380 : 180, 100)])
    ]],
    ["EC2", Array.from({ length: computeCount }, (_, index) =>
      canonicalNodeSpec(
        `app-server-${index + 1}`,
        `EC2 Fleet Instance ${index + 1}`,
        index % 2 === 0 ? 260 : 930,
        820 + Math.floor(index / 2) * 120,
        {
          ami: canonicalTerraformReference("data.aws_ami", "app-ami"),
          iamInstanceProfile: canonicalTerraformReference("aws_iam_instance_profile", "app-instance-profile", "name"),
          instanceType: ec2InstanceType,
          associatePublicIpAddress: false,
          managedByAutoScalingGroup: "app-auto-scaling-group",
          sketchcatchReferenceTerraform: true,
          subnetId: canonicalTerraformReference("aws_subnet", privateAppSubnetIds[index % privateAppSubnetIds.length]!),
          vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "app-security-group")]
        }
      )
    )]
  ]);
  const replacementById = new Map<string, ArchitectureJson["nodes"][number]>();

  for (const [resourceType, specs] of specsByType) {
    const matchingNodes = architectureJson.nodes.filter((node) => node.type === resourceType);
    specs.forEach((spec, index) => {
      const node = matchingNodes[index];
      if (node !== undefined) {
        replacementById.set(node.id, { ...node, ...spec });
      }
    });
  }

  const nodes = architectureJson.nodes.map((node) => {
    const replacement = replacementById.get(node.id);
    if (replacement !== undefined) {
      return replacement;
    }

    switch (node.type) {
      case "VPC":
        return { ...node, id: vpcId, label: "Main VPC", positionX: 60, positionY: 380, config: { cidrBlock: "10.0.0.0/16", enableDnsHostnames: true, enableDnsSupport: true } };
      case "INTERNET_GATEWAY":
        return { ...node, id: "internet-gateway", label: "Internet Gateway", positionX: 80, positionY: 420, config: { vpcId: vpcRef } };
      case "LOAD_BALANCER":
        return { ...node, id: "application-load-balancer", label: "Application Load Balancer", positionX: 570, positionY: 480, config: { name: "sketchcatch-app", internal: false, idleTimeout: realtimeTransport === "sse" ? 120 : 60, loadBalancerType: "application", subnets: publicSubnetRefs, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] } };
      case "LOAD_BALANCER_TARGET_GROUP":
        return { ...node, id: "app-target-group", label: "EC2 Target Group", positionX: 570, positionY: 760, config: { name: "sketchcatch-app", port: 8080, protocol: "HTTP", targetType: "instance", vpcId: vpcRef, healthCheck: { path: "/health", matcher: "200-399" } } };
      case "LOAD_BALANCER_LISTENER":
        return usesHttps
          ? { ...node, id: "https-listener", label: "ALB HTTPS Listener", positionX: 570, positionY: 620, config: { loadBalancerArn: canonicalTerraformReference("aws_lb", "application-load-balancer", "arn"), port: 443, protocol: "HTTPS", sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06", certificateArn: canonicalTerraformReference("aws_acm_certificate", "application-certificate", "arn"), defaultAction: [{ type: "forward", targetGroupArn: canonicalTerraformReference("aws_lb_target_group", "app-target-group", "arn") }] } }
          : { ...node, id: "http-listener", label: "ALB HTTP Listener", positionX: 570, positionY: 620, config: { loadBalancerArn: canonicalTerraformReference("aws_lb", "application-load-balancer", "arn"), port: 80, protocol: "HTTP", defaultAction: [{ type: "forward", targetGroupArn: canonicalTerraformReference("aws_lb_target_group", "app-target-group", "arn") }] } };
      case "LAUNCH_TEMPLATE":
        return { ...node, id: "app-launch-template", label: "EC2 Launch Template", positionX: 620, positionY: 260, config: { namePrefix: "sketchcatch-app-", imageId: canonicalTerraformReference("data.aws_ami", "app-ami"), instanceType: ec2InstanceType, vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "app-security-group")], iamInstanceProfile: { name: canonicalTerraformReference("aws_iam_instance_profile", "app-instance-profile", "name") }, metadataOptions: { httpEndpoint: "enabled", httpTokens: "required" }, monitoring: { enabled: true } } };
      case "AUTO_SCALING_GROUP":
        return { ...node, id: "app-auto-scaling-group", label: "Application Auto Scaling Group", positionX: 840, positionY: 260, config: { name: "sketchcatch-app", minSize: 2, desiredCapacity: computeCount, maxSize: resolveEc2AutoScalingMaxSize(normalizedPrompt, computeCount), vpcZoneIdentifier: privateAppSubnetRefs, targetGroupArns: [canonicalTerraformReference("aws_lb_target_group", "app-target-group", "arn")], healthCheckType: "ELB", healthCheckGracePeriod: 120, launchTemplate: [{ id: canonicalTerraformReference("aws_launch_template", "app-launch-template"), version: "$Latest" }] } };
      case "AUTO_SCALING_POLICY":
        return { ...node, id: "app-scaling-policy", label: ec2ScalingPolicyConfig.label, positionX: 1060, positionY: 260, config: { name: ec2ScalingPolicyConfig.name, autoscalingGroupName: canonicalTerraformReference("aws_autoscaling_group", "app-auto-scaling-group", "name"), ...ec2ScalingPolicyConfig.config } };
      case "CLOUDFRONT":
        return { ...node, id: "cloudfront-distribution", label: "CloudFront Public Entry", positionX: 80, positionY: 100, config: { ...node.config, originResourceId: "web-assets-bucket", enabled: true, viewerProtocolPolicy: "redirect-to-https" } };
      case "RDS":
        return { ...node, id: "app-database", label: "Multi-AZ Application Database", positionX: 730, positionY: 1120, config: { engine: "postgres", instanceClass: databaseInstanceClass, allocatedStorage: databaseAllocatedStorage, multiAz: true, publiclyAccessible: false, storageEncrypted: true, backupRetentionPeriod: 7, deletionProtection: true, skipFinalSnapshot: false, finalSnapshotIdentifier: "sketchcatch-app-final", dbSubnetGroupName: canonicalTerraformReference("aws_db_subnet_group", "db-subnet-group", "name"), vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "db-security-group")] } };
      case "SECRETS_MANAGER_SECRET":
        return { ...node, id: "database-secret", label: "Database Credentials Secret", positionX: 1280, positionY: 260, config: { name: "sketchcatch/database/credentials", recoveryWindowInDays: 7 } };
      default:
        return node;
    }
  });

  return { nodes, edges: [] };
}

function canonicalSubnetSpec(
  id: string,
  label: string,
  cidrBlock: string,
  availabilityZone: string,
  tier: "public" | "private_app" | "private_db",
  mapPublicIpOnLaunch: boolean,
  positionX: number,
  positionY: number,
  vpcId: string
): CanonicalNodeSpec {
  return canonicalNodeSpec(id, label, positionX, positionY, {
    availabilityZone,
    cidrBlock,
    mapPublicIpOnLaunch,
    tier,
    vpcId
  });
}

function canonicalNodeSpec(
  id: string,
  label: string,
  positionX: number,
  positionY: number,
  config: Record<string, unknown>
): CanonicalNodeSpec {
  return { id, label, positionX, positionY, config };
}

function createCanonicalRouteAssociationSpecs(hasDatabase: boolean): CanonicalNodeSpec[] {
  const pairs = [
    ["public-route-association-a", "Public Route Association A", "public-route-table", "public-subnet-a"],
    ["public-route-association-b", "Public Route Association B", "public-route-table", "public-subnet-b"],
    ["private-app-route-association-a", "Private App Route Association A", "private-route-table-a", "private-app-subnet-a"],
    ["private-app-route-association-b", "Private App Route Association B", "private-route-table-b", "private-app-subnet-b"],
    ...(hasDatabase
      ? [
          ["private-db-route-association-a", "Private DB Route Association A", "private-route-table-a", "private-db-subnet-a"],
          ["private-db-route-association-b", "Private DB Route Association B", "private-route-table-b", "private-db-subnet-b"]
        ]
      : [])
  ];

  return pairs.map(([id, label, routeTableId, subnetId], index) =>
    canonicalNodeSpec(id!, label!, 1780 + (index % 2) * 180, 480 + Math.floor(index / 2) * 280, {
      routeTableId: canonicalTerraformReference("aws_route_table", routeTableId!),
      subnetId: canonicalTerraformReference("aws_subnet", subnetId!)
    })
  );
}

function createCanonicalMetricAlarmConfig(
  alarmName: string,
  namespace: string,
  metricName: string,
  dimensions: Record<string, string>
): Record<string, unknown> {
  return {
    alarmName,
    comparisonOperator: "GreaterThanThreshold",
    dimensions,
    evaluationPeriods: 2,
    metricName,
    namespace,
    period: 300,
    statistic: "Average",
    threshold: 80
  };
}

function resolveDatabaseAllocatedStorage(normalizedPrompt: string): number {
  if (requiresLargeDatabaseProfile(normalizedPrompt)) {
    return 200;
  }

  if (
    requiresLargeTrafficCapacity(normalizedPrompt) ||
    resolveBudgetProfile(normalizedPrompt) === "enterprise" ||
    resolveLatencyProfile(normalizedPrompt) === "one_second"
  ) {
    return 50;
  }

  if (/(10gb\s*[~-]\s*100gb|10gb\s*~\s*100gb|10gb\s+to\s+100gb|중간\s*규모\s*데이터|medium\s+database)/iu.test(normalizedPrompt)) {
    return 50;
  }

  return 20;
}

function resolveDatabaseInstanceClass(normalizedPrompt: string): string {
  if (requiresLargeDatabaseProfile(normalizedPrompt) || requiresLargeTrafficCapacity(normalizedPrompt)) {
    return "db.r6g.large";
  }

  return "db.t4g.small";
}

function requiresLargeDatabaseProfile(normalizedPrompt: string): boolean {
  return /(100gb\s*(이상|or\s*more)|대용량\s*데이터|복잡한\s*쿼리|large\s+database|complex\s+quer)/iu.test(
    normalizedPrompt
  );
}

function resolveEc2FleetCapacity(normalizedPrompt: string): number {
  if (requiresLargeTrafficCapacity(normalizedPrompt) || requiresVeryHighAvailability(normalizedPrompt)) {
    return 4;
  }

  return 2;
}

function resolveEc2InstanceType(normalizedPrompt: string): string {
  if (requiresLargeTrafficCapacity(normalizedPrompt) || requiresComplexBackend(normalizedPrompt)) {
    return "m7i.large";
  }

  return "t3.small";
}

function requiresLargeTrafficCapacity(normalizedPrompt: string): boolean {
  return /(large\s+traffic|10,?000|500\+|concurrent\s+500|daily\s+10000|10000\s+concurrent\s+500)/iu.test(
    normalizedPrompt
  );
}

function requiresAggressiveEc2ScalingProfile(normalizedPrompt: string): boolean {
  return (
    requiresLargeTrafficCapacity(normalizedPrompt) &&
    (resolveTrafficProfile(normalizedPrompt) === "bursty" ||
      requiresTimeVaryingTraffic(normalizedPrompt) ||
      resolveLatencyProfile(normalizedPrompt) === "one_second" ||
      resolveBudgetProfile(normalizedPrompt) === "enterprise")
  );
}

function resolveEc2AutoScalingMaxSize(normalizedPrompt: string, computeCount: number): number {
  if (requiresAggressiveEc2ScalingProfile(normalizedPrompt)) {
    return Math.max(12, computeCount * 3);
  }

  return Math.max(4, computeCount * 2);
}

function resolveEc2AutoScalingPolicyConfig(normalizedPrompt: string): {
  readonly label: string;
  readonly name: string;
  readonly config: Record<string, unknown>;
} {
  if (!requiresAggressiveEc2ScalingProfile(normalizedPrompt)) {
    return {
      label: "CPU Scaling Policy",
      name: "sketchcatch-cpu-scale-out",
      config: {
        policyType: "SimpleScaling",
        adjustmentType: "ChangeInCapacity",
        scalingAdjustment: 1,
        cooldown: 120
      }
    };
  }

  return {
    label: "CPU Target Tracking Scaling Policy",
    name: "sketchcatch-cpu-target-tracking",
    config: {
      policyType: "TargetTrackingScaling",
      targetTrackingConfiguration: {
        targetValue: 55,
        disableScaleIn: false,
        predefinedMetricSpecification: {
          predefinedMetricType: "ASGAverageCPUUtilization"
        }
      },
      estimatedInstanceWarmup: 120
    }
  };
}

function resolveFargateTaskSizing(normalizedPrompt: string): {
  readonly cpu: string;
  readonly memory: string;
  readonly desiredCount: number;
  readonly maxCapacity: number;
} {
  if (resolveTrafficProfile(normalizedPrompt) === "large") {
    return { cpu: "1024", memory: "2048", desiredCount: 4, maxCapacity: 20 };
  }

  return { cpu: "512", memory: "1024", desiredCount: 2, maxCapacity: 10 };
}

function canonicalTerraformReference(
  resourceType: string,
  nodeId: string,
  attribute = "id"
): string {
  return `${resourceType}.${nodeId.replaceAll("-", "_")}.${attribute}`;
}

function ensureCanonicalPlanResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null
): ArchitectureJson {
  if ((plan?.patternIds?.length ?? 0) === 0) {
    return architectureJson;
  }

  const nodes = [...architectureJson.nodes];
  const edges = [...architectureJson.edges];
  const requiredQuantities = new Map<ResourceType, number>();

  for (const resourceType of plan?.requiredResources ?? []) {
    if (!isResourceTypeForbiddenByPlan(plan, resourceType as ResourceType)) {
      requiredQuantities.set(resourceType as ResourceType, 1);
    }
  }

  for (const [resourceType, quantity] of Object.entries(plan?.resourceQuantities ?? {})) {
    if (!isResourceTypeForbiddenByPlan(plan, resourceType as ResourceType)) {
      requiredQuantities.set(
        resourceType as ResourceType,
        Math.max(requiredQuantities.get(resourceType as ResourceType) ?? 0, quantity)
      );
    }
  }

  for (const [resourceType, quantity] of requiredQuantities) {
    let actualCount = nodes.filter((node) => node.type === resourceType).length;

    while (actualCount < quantity) {
      const definition = SUPPORTED_RESOURCE_CATALOG.find(
        (candidate) => candidate.nodeType === resourceType
      );

      if (definition === undefined) {
        break;
      }

      const sequence = actualCount + 1;
      const index = nodes.length;
      nodes.push({
        id: createUniqueCanonicalNodeId(nodes, `${resourceType.toLowerCase()}-${sequence}`),
        type: resourceType,
        label: `${definition.displayName}${quantity > 1 ? ` ${sequence}` : ""}`,
        positionX: 120 + (index % 6) * 180,
        positionY: 120 + Math.floor(index / 6) * 140,
        config: createArchitectureResourceDeploymentConfig(definition.terraformResourceType)
      });
      actualCount += 1;
    }
  }

  const hasPublicIngressPattern =
    !(plan?.forbiddenCapabilities ?? []).some(
      (capability) => capability.toLowerCase() === "load_balancer"
    ) &&
    (plan?.patternIds ?? []).some(
      (patternId) => patternId === "alb-asg-ec2" || patternId === "ecs-fargate"
    );
  let subnetIndex = 0;
  const labeledNodes = nodes.map((node) => {
    if (node.type !== "SUBNET") {
      return node;
    }

    const isPublic = hasPublicIngressPattern && subnetIndex < 2;
    const zoneLabel = subnetIndex % 2 === 0 ? "A" : "B";
    subnetIndex += 1;

    return {
      ...node,
      label: isPublic ? `Public Subnet ${zoneLabel}` : `Private Subnet ${zoneLabel}`,
      config: { ...node.config, tier: isPublic ? "public" : "private" }
    };
  });

  return { nodes: labeledNodes, edges };
}

function isResourceTypeForbiddenByPlan(
  plan: ArchitectureIntentPlan | null,
  resourceType: ResourceType
): boolean {
  const forbiddenCapabilities = new Set(
    (plan?.forbiddenCapabilities ?? []).map((capability) => capability.toLowerCase())
  );

  if (
    forbiddenCapabilities.has("load_balancer") &&
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP"].includes(
      resourceType
    )
  ) {
    return true;
  }

  if (
    forbiddenCapabilities.has("database") &&
    ["RDS", "DB_SUBNET_GROUP", "SECRETS_MANAGER_SECRET"].includes(resourceType)
  ) {
    return true;
  }

  return (
    forbiddenCapabilities.has("ec2_runtime") &&
    [
      "EC2",
      "AMI",
      "IAM_INSTANCE_PROFILE",
      "LAUNCH_TEMPLATE",
      "AUTO_SCALING_GROUP",
      "AUTO_SCALING_POLICY",
      "ECS_CAPACITY_PROVIDER"
    ].includes(resourceType)
  );
}

function createUniqueCanonicalNodeId(
  nodes: readonly ArchitectureJson["nodes"][number][],
  baseId: string
): string {
  const ids = new Set(nodes.map((node) => node.id));
  let candidate = `canonical-${baseId}`;
  let suffix = 2;

  while (ids.has(candidate)) {
    candidate = `canonical-${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function connectCanonicalPatternTopologies(
  architectureJson: ArchitectureJson,
  patternIds: readonly string[],
  prompt: string
): ArchitectureJson {
  const edges = [...architectureJson.edges];
  const nodesByType = new Map<ResourceType, ArchitectureJson["nodes"]>();
  const nodeById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const usesRoleAwareEcs =
    patternIds.includes("ecs-fargate") &&
    !patternIds.includes("serverless-api") &&
    !patternIds.includes("alb-asg-ec2") &&
    architectureJson.nodes.some(
      (node) => node.type === "ECS_SERVICE" || node.type === "ECS_TASK_DEFINITION"
    );
  const usesRoleAwareEc2 =
    patternIds.includes("alb-asg-ec2") &&
    !patternIds.includes("serverless-api");
  const usesRoleAwareNetwork = usesRoleAwareEcs || usesRoleAwareEc2;
  const roleAwarePrivateAppSubnetIds = ["private-app-subnet-a", "private-app-subnet-b"];
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const realtimeTransport = resolveRealtimeTransport(normalizedPrompt);
  const realtimeProfile = resolveRealtimeProfile(normalizedPrompt);
  const frontendProfile = resolveFrontendProfile(normalizedPrompt);
  const serviceProfiles = resolveFargateServiceProfiles(normalizedPrompt, frontendProfile);
  const canonicalListenerId = requiresHttpsTransport(normalizedPrompt)
    ? "https-listener"
    : "http-listener";
  const forwardLabel = resolveRealtimeForwardLabel(normalizedPrompt);

  for (const node of architectureJson.nodes) {
    nodesByType.set(node.type, [...(nodesByType.get(node.type) ?? []), node]);
  }

  const connect = (sourceType: ResourceType, targetType: ResourceType, label: string): void => {
    const source = nodesByType.get(sourceType)?.[0];
    const target = nodesByType.get(targetType)?.[0];

    if (source === undefined || target === undefined) {
      return;
    }

    addArchitectureEdge(
      edges,
      `canonical-${source.id}-to-${target.id}`,
      source.id,
      target.id,
      label
    );
  };
  const connectOneToAll = (sourceType: ResourceType, targetType: ResourceType, label: string): void => {
    const source = nodesByType.get(sourceType)?.[0];

    if (source === undefined) {
      return;
    }

    for (const target of nodesByType.get(targetType) ?? []) {
      addArchitectureEdge(
        edges,
        `canonical-${source.id}-to-${target.id}`,
        source.id,
        target.id,
        label
      );
    }
  };
  const connectAllToOne = (sourceType: ResourceType, targetType: ResourceType, label: string): void => {
    const target = nodesByType.get(targetType)?.[0];

    if (target === undefined) {
      return;
    }

    for (const source of nodesByType.get(sourceType) ?? []) {
      addArchitectureEdge(
        edges,
        `canonical-${source.id}-to-${target.id}`,
        source.id,
        target.id,
        label
      );
    }
  };
  const connectIds = (sourceId: string, targetId: string, label: string): void => {
    if (!nodeById.has(sourceId) || !nodeById.has(targetId)) {
      return;
    }

    addArchitectureEdge(
      edges,
      `canonical-${sourceId}-to-${targetId}`,
      sourceId,
      targetId,
      label
    );
  };

  if (patternIds.includes("alb-asg-ec2") || patternIds.includes("ecs-fargate") || patternIds.includes("multi-az-rds")) {
    if (usesRoleAwareNetwork) {
      for (const subnet of nodesByType.get("SUBNET") ?? []) {
        connectIds("vpc-main", subnet.id, "contains");
      }
      connectIds("vpc-main", "internet-gateway", "attaches");
      connectIds("nat-eip-a", "nat-gateway-a", "allocates");
      connectIds("nat-eip-b", "nat-gateway-b", "allocates");
      connectIds("public-subnet-a", "nat-gateway-a", "hosts");
      connectIds("public-subnet-b", "nat-gateway-b", "hosts");
      const routeAssociations = [
        ["public-route-table", "public-route-association-a", "public-subnet-a"],
        ["public-route-table", "public-route-association-b", "public-subnet-b"],
        ["private-route-table-a", "private-app-route-association-a", "private-app-subnet-a"],
        ["private-route-table-b", "private-app-route-association-b", "private-app-subnet-b"],
        ["private-route-table-a", "private-db-route-association-a", "private-db-subnet-a"],
        ["private-route-table-b", "private-db-route-association-b", "private-db-subnet-b"]
      ] as const;
      for (const [routeTableId, associationId, subnetId] of routeAssociations) {
        connectIds(routeTableId, associationId, "associates");
        connectIds(associationId, subnetId, "binds");
      }
    } else {
      connectOneToAll("VPC", "SUBNET", "contains");
      connect("VPC", "INTERNET_GATEWAY", "attaches");
      connectOneToAll("INTERNET_GATEWAY", "ROUTE_TABLE", "routes");
      connectAllToOne("ROUTE_TABLE", "ROUTE_TABLE_ASSOCIATION", "associates");
      connect("ROUTE_TABLE_ASSOCIATION", "SUBNET", "binds");
    }
  }

  if (patternIds.includes("alb-asg-ec2")) {
    if (usesRoleAwareEc2) {
      connectIds("public-subnet-a", "application-load-balancer", "hosts ALB");
      connectIds("public-subnet-b", "application-load-balancer", "hosts ALB");
      connectIds("application-load-balancer", canonicalListenerId, "listens");
      connectIds(canonicalListenerId, "app-target-group", forwardLabel);
      connectIds("application-certificate", canonicalListenerId, "TLS certificate");
      connectIds(
        "app-target-group",
        "app-auto-scaling-group",
        realtimeTransport === "sse" ? "streams to fleet" : "targets fleet"
      );
      connectIds("app-auto-scaling-group", "app-launch-template", "launches");
      connectIds("app-ami", "app-launch-template", "machine image");
      connectIds("app-instance-profile", "app-launch-template", "instance identity");
      connectIds("app-instance-profile", "app-runtime-role", "uses role");
      connectIds("app-runtime-role", "app-runtime-policy", "attaches policy");
      connectIds("app-runtime-policy", "app-log-group", "writes logs");
      connectIds("app-scaling-policy", "app-auto-scaling-group", "scales fleet");
      connectIds("app-auto-scaling-group", "app-cpu-alarm", "monitors CPU");
      connectIds("alb-security-group", "application-load-balancer", "protects");
      connectIds("app-security-group", "app-auto-scaling-group", "protects instances");
      for (const [index, instance] of (nodesByType.get("EC2") ?? []).entries()) {
        connectIds("app-auto-scaling-group", instance.id, "manages fleet");
        connectIds(
          roleAwarePrivateAppSubnetIds[index % roleAwarePrivateAppSubnetIds.length]!,
          instance.id,
          "hosts private instance"
        );
      }
      for (const bucket of nodesByType.get("S3") ?? []) {
        if (bucket.config.bucketPurpose === "user_uploads") {
          connectIds("app-auto-scaling-group", bucket.id, "stores uploads");
        }
      }
      if (realtimeTransport === "sse" && realtimeProfile === "chat") {
        connectIds("app-auto-scaling-group", "app-database", "messages + PostgreSQL LISTEN/NOTIFY");
      }
    } else {
      connect("LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "listens");
      connect("LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "forwards");
      connect("LOAD_BALANCER_TARGET_GROUP", "AUTO_SCALING_GROUP", "targets");
      connect("AUTO_SCALING_GROUP", "LAUNCH_TEMPLATE", "launches");
      connectOneToAll("AUTO_SCALING_GROUP", "EC2", "manages");
      connectAllToOne("SECURITY_GROUP", "LOAD_BALANCER", "protects");
    }
  }

  if (patternIds.includes("serverless-api")) {
    connect(
      "API_GATEWAY_REST_API",
      "LAMBDA",
      resolveRealtimeTransport(normalizedPrompt) === "polling"
        ? "polling API requests (cost warning)"
        : "invokes"
    );
    connect("API_GATEWAY_REST_API", "API_GATEWAY_RESOURCE", "contains");
    connect("API_GATEWAY_RESOURCE", "API_GATEWAY_METHOD", "exposes");
    connect("API_GATEWAY_METHOD", "API_GATEWAY_INTEGRATION", "integrates");
    connect("API_GATEWAY_INTEGRATION", "LAMBDA", "invokes");
    connect("LAMBDA_PERMISSION", "LAMBDA", "allows invoke");
    connect("API_GATEWAY_DEPLOYMENT", "API_GATEWAY_STAGE", "publishes");
    connect("IAM_ROLE", "LAMBDA", "authorizes");
    connect("LAMBDA", "CLOUDWATCH_LOG_GROUP", "logs");
    connect("LAMBDA", "S3", "image upload objects");
  }

  if (patternIds.includes("spa-cloudfront-s3")) {
    const cloudFront = nodesByType.get("CLOUDFRONT")?.[0];
    const staticBucket = (nodesByType.get("S3") ?? []).find(
      (node) => node.config.bucketPurpose === "static_website_origin"
    ) ?? nodesByType.get("S3")?.[0];
    if (cloudFront !== undefined && staticBucket !== undefined) {
      connectIds(cloudFront.id, staticBucket.id, "private origin");
    }
  }

  if (patternIds.includes("ecs-fargate")) {
    if (usesRoleAwareEcs) {
      connectIds("application-load-balancer", canonicalListenerId, "listens");
      connectIds("alb-security-group", "application-load-balancer", "protects");
      connectIds("ecs-task-policy", "ecs-task-role", "least privilege");
      connectIds("application-certificate", canonicalListenerId, "TLS certificate");
      for (const [index, profile] of serviceProfiles.entries()) {
        connectIds("app-repository", profile.taskDefinitionId, "image");
        connectIds("ecs-cluster", profile.serviceId, "runs");
        connectIds(profile.taskDefinitionId, profile.serviceId, "defines");
        connectIds(
          canonicalListenerId,
          profile.targetGroupId,
          index === 0 && serviceProfiles.length === 1 ? forwardLabel : profile.listenerLabel
        );
        connectIds(profile.targetGroupId, profile.serviceId, "targets ip");
        connectIds("app-security-group", profile.serviceId, "protects");
        connectIds("ecs-execution-role", profile.taskDefinitionId, "pulls image and logs");
        connectIds("ecs-task-role", profile.taskDefinitionId, "application permissions");
        connectIds(profile.taskDefinitionId, profile.logGroupId, "logs");
        connectIds(profile.serviceId, profile.cpuAlarmId, "monitors");
        connectIds(profile.serviceId, profile.scalingTargetId, "scales desired count");
        connectIds(profile.scalingTargetId, profile.scalingPolicyId, "target tracking");
        connectIds("private-app-subnet-a", profile.serviceId, "places tasks");
        connectIds("private-app-subnet-b", profile.serviceId, "places tasks");
      }
      for (const bucket of nodesByType.get("S3") ?? []) {
        if (bucket.config.bucketPurpose !== "static_website_origin") {
          const uploadService = serviceProfiles.find((profile) => /upload/iu.test(profile.serviceId)) ?? serviceProfiles[0];
          if (uploadService !== undefined) {
            connectIds(uploadService.serviceId, bucket.id, "stores uploads");
          }
        }
      }
      if (realtimeTransport === "sse" && realtimeProfile === "chat") {
        connectIds(serviceProfiles[0]!.serviceId, "app-database", "messages + PostgreSQL LISTEN/NOTIFY");
      }
    } else {
      connect("ECR_REPOSITORY", "ECS_TASK_DEFINITION", "image");
      connect("ECS_CLUSTER", "ECS_SERVICE", "runs");
      connect("ECS_TASK_DEFINITION", "ECS_SERVICE", "defines");
      connect("LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "listens");
      connect("LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "forwards");
      connect("LOAD_BALANCER_TARGET_GROUP", "ECS_SERVICE", "targets ip");
      connect("IAM_ROLE", "ECS_TASK_DEFINITION", "authorizes");
      connect("ECS_TASK_DEFINITION", "CLOUDWATCH_LOG_GROUP", "logs");
      connectAllToOne("SECURITY_GROUP", "ECS_SERVICE", "protects");
    }
  }

  if (patternIds.includes("github-cicd-codedeploy")) {
    connect("CODESTAR_CONNECTION", "CODEPIPELINE", "sources");
    connect("CODEPIPELINE", "CODEBUILD_PROJECT", "builds");
    connectOneToAll("CODEBUILD_PROJECT", "S3", "stores artifact");
    connect("S3", "CODEDEPLOY_APP", "releases");
    connect("CODEDEPLOY_APP", "CODEDEPLOY_DEPLOYMENT_GROUP", "deploys");
    connect("IAM_ROLE", "CODEPIPELINE", "authorizes");
    connect("IAM_ROLE", "CODEBUILD_PROJECT", "authorizes");
    connect("IAM_ROLE", "CODEDEPLOY_DEPLOYMENT_GROUP", "authorizes");
  }

  if (patternIds.includes("multi-az-rds")) {
    if (usesRoleAwareNetwork) {
      connectIds("private-db-subnet-a", "db-subnet-group", "member");
      connectIds("private-db-subnet-b", "db-subnet-group", "member");
      connectIds("db-subnet-group", "app-database", "places");
      connectIds("db-security-group", "app-database", "protects");
      connectIds("app-security-group", "db-security-group", "allows PostgreSQL");
      connectIds("database-secret", "app-database", "credentials");
      connectIds("app-database", "db-cpu-alarm", "monitors");
    } else {
      connectOneToAll("SUBNET", "DB_SUBNET_GROUP", "members");
      connect("DB_SUBNET_GROUP", "RDS", "places");
      connectAllToOne("SECURITY_GROUP", "RDS", "protects");
      connect("SECRETS_MANAGER_SECRET", "RDS", "credentials");
      connect("RDS", "CLOUDWATCH_METRIC_ALARM", "monitors");
    }
  }

  connect("S3", "LAMBDA", "object event");
  connect("LAMBDA", "SQS_QUEUE", "enqueues");
  connect("LAMBDA", "DYNAMODB_TABLE", "writes");
  connect("SQS_QUEUE", "ECS_SERVICE", "work queue");
  connect("EVENTBRIDGE_PERMISSION", "EVENTBRIDGE_RULE", "authorizes");
  connect("EVENTBRIDGE_RULE", "EVENTBRIDGE_TARGET", "triggers");
  connect("EVENTBRIDGE_TARGET", "ECS_TASK_DEFINITION", "runs task");
  connect("EVENTBRIDGE_TARGET", "LAMBDA", "invokes");
  connectOneToAll("SUBNET", "EKS_CLUSTER", "places");
  connectAllToOne("SECURITY_GROUP", "EKS_CLUSTER", "protects");
  connect("EKS_CLUSTER", "EKS_NODE_GROUP", "manages");
  connectOneToAll("EKS_CLUSTER", "EKS_ADDON", "installs");
  connect("LOAD_BALANCER", "EKS_CLUSTER", "routes");
  connect("LOAD_BALANCER_TARGET_GROUP", "EKS_CLUSTER", "targets");
  connect("IAM_ROLE", "EKS_CLUSTER", "authorizes");
  connect("EKS_CLUSTER", "CLOUDWATCH_LOG_GROUP", "logs");
  connect("WAF_WEB_ACL", "WAF_WEB_ACL_ASSOCIATION", "associates");
  connect("WAF_WEB_ACL_ASSOCIATION", "CLOUDFRONT", "protects");
  connect("WAF_WEB_ACL_ASSOCIATION", "LOAD_BALANCER", "protects");

  if ((nodesByType.get("WAF_WEB_ACL_ASSOCIATION")?.length ?? 0) === 0) {
    connect("WAF_WEB_ACL", "CLOUDFRONT", "protects");
    connect("WAF_WEB_ACL", "LOAD_BALANCER", "protects");
  }

  connect("API_GATEWAY_WEBSOCKET_API", "API_GATEWAY_V2_ROUTE", "routes");
  connect("API_GATEWAY_V2_ROUTE", "API_GATEWAY_V2_INTEGRATION", "integrates");
  connect("API_GATEWAY_V2_INTEGRATION", "LOAD_BALANCER_LISTENER", "WebSocket proxy");
  connect("API_GATEWAY_V2_INTEGRATION", "LAMBDA", "invokes");
  connect("API_GATEWAY_V2_STAGE", "API_GATEWAY_V2_ROUTE", "publishes");
  if (!usesRoleAwareNetwork) {
    connect("IAM_POLICY", "IAM_ROLE", "least privilege");
  }
  connect("ACM_CERTIFICATE", "ACM_CERTIFICATE_VALIDATION", "validates");
  connect("ACM_CERTIFICATE_VALIDATION", "CLOUDFRONT", "secures");
  connect("ACM_CERTIFICATE_VALIDATION", "LOAD_BALANCER_LISTENER", "secures");
  connect("ACM_CERTIFICATE_VALIDATION", "API_GATEWAY_REST_API", "secures");
  connectOneToAll("KMS_KEY", "S3", "encrypts");
  connectOneToAll("KMS_KEY", "RDS", "encrypts");
  connectOneToAll("KMS_KEY", "DYNAMODB_TABLE", "encrypts");
  connectAllToOne("EC2", "CLOUDWATCH_LOG_GROUP", "logs");
  if (!usesRoleAwareEcs) {
    connect("ECS_SERVICE", "CLOUDWATCH_METRIC_ALARM", "monitors");
  }
  connect("LAMBDA", "CLOUDWATCH_METRIC_ALARM", "monitors");

  return {
    nodes: architectureJson.nodes,
    edges
  };
}

function requiresFargateArchitecture(normalizedPrompt: string): boolean {
  return (
    hasPromptTerm(normalizedPrompt, ["ecs fargate", "fargate service", "fargate task", "fargate runtime"]) ||
    prefersQuestionnaireFargateArchitecture(normalizedPrompt)
  );
}

function requiresServerlessApiArchitecture(normalizedPrompt: string): boolean {
  return (
    resolveManagementProfile(normalizedPrompt) === "fully_managed" &&
    resolveBackendProfile(normalizedPrompt) === "simple_api" &&
    resolveFrontendProfile(normalizedPrompt) !== "static" &&
    !requiresSsrFrontend(normalizedPrompt) &&
    !hasPromptTerm(normalizedPrompt, ["ecs fargate", "fargate service", "fargate task", "fargate runtime"])
  );
}

function requiresSelfManagedEc2Architecture(normalizedPrompt: string): boolean {
  const managementProfile = resolveManagementProfile(normalizedPrompt);
  const backendProfile = resolveBackendProfile(normalizedPrompt);

  return (
    managementProfile === "self_managed" &&
    backendProfile !== "none" &&
    backendProfile !== undefined &&
    !explicitlyForbidsEc2Runtime(normalizedPrompt)
  );
}

function prefersQuestionnaireFargateArchitecture(normalizedPrompt: string): boolean {
  const trafficProfile = resolveTrafficProfile(normalizedPrompt);
  const backendProfile = resolveBackendProfile(normalizedPrompt);
  const frontendProfile = resolveFrontendProfile(normalizedPrompt);
  const managementProfile = resolveManagementProfile(normalizedPrompt);
  const hasFargateFriendlyTraffic =
    trafficProfile === "bursty" ||
    trafficProfile === "medium" ||
    requiresTimeVaryingTraffic(normalizedPrompt);
  const hasSimpleApiFargateBackend =
    backendProfile === "simple_api" &&
    managementProfile === "semi_managed" &&
    requiresDatabase(normalizedPrompt) &&
    hasFargateFriendlyTraffic;
  const hasManagedMicroservicesBackend =
    backendProfile === "microservices" &&
    (managementProfile === "fully_managed" || managementProfile === "semi_managed") &&
    requiresDatabase(normalizedPrompt) &&
    hasFargateFriendlyTraffic;
  const hasFargateFriendlyBackend = hasSimpleApiFargateBackend || hasManagedMicroservicesBackend;

  return (
    (requiresApacRegion(normalizedPrompt) &&
      (requiresSpaFrontend(normalizedPrompt) || frontendProfile === "mobile") &&
      hasFargateFriendlyBackend) ||
    (requiresSsrFrontend(normalizedPrompt) && hasFargateFriendlyBackend)
  );
}

function requiresStaticDeliveryArchitecture(normalizedPrompt: string): boolean {
  return (
    (resolveFrontendProfile(normalizedPrompt) === "static" || requiresNoBackend(normalizedPrompt)) &&
    requiresNoDatabase(normalizedPrompt) &&
    !requiresUploadStorage(normalizedPrompt) &&
    !requiresRealtime(normalizedPrompt)
  );
}

function requiresAwsNativeCiCdPipeline(normalizedPrompt: string): boolean {
  const excludesAwsNativePipeline = /(?:do not|don't|without|exclude|omit|not required)[^\n.]{0,120}(?:codepipeline|code\s*pipeline|codebuild|code\s*build|codedeploy|code\s*deploy|codestar)/iu.test(
    normalizedPrompt
  );
  const awsNativePrompt = excludesAwsNativePipeline ? "" : (normalizedPrompt.match(
    /codepipeline|code\s*pipeline|codebuild|code\s*build|codedeploy|code\s*deploy|codestar/giu
  ) ?? []).join(" ");

  return /(\bgit\b|github|ci\/cd|cicd|codepipeline|code\s*pipeline|codebuild|code\s*build|codedeploy|code\s*deploy|deployment\s+handoff|git\/ci\/cd|배포\s*핸드오프)/iu.test(
    awsNativePrompt
  );
}

function explicitlyForbidsEc2Runtime(normalizedPrompt: string): boolean {
  return hasPromptTerm(normalizedPrompt, [
    "without ec2",
    "no ec2",
    "do not use ec2",
    "don't use ec2",
    "not using ec2",
    "exclude ec2",
    "omit ec2",
    "no ec2 capacity",
    "ec2 excluded",
    "ec2 is excluded",
    "ec2 not allowed",
    "serverless runtime",
    "lambda only",
    "ec2 없이",
    "ec2 사용 안",
    "ec2 안 씀",
    "ec2 안씀",
    "ec2 쓰지 않",
    "ec2는 사용하지 않",
    "ec2 필요 없",
    "ec2는 필요 없",
    "ec2 제외"
  ]);
}

function resolveTrafficProfile(normalizedPrompt: string): ArchitectureAnswerProfile["traffic"] {
  if (/(bursty|event\s+(?:spike|burst)|burst\s+spikes?|unpredictable|급변동|이벤트성\s*급증)/iu.test(normalizedPrompt)) {
    return "bursty";
  }

  if (/(large\s+traffic|대규모)/iu.test(normalizedPrompt)) return "large";
  if (/(medium\s+traffic|중간\s*규모)/iu.test(normalizedPrompt)) return "medium";
  if (/(small\s+traffic|소규모)/iu.test(normalizedPrompt)) return "small";

  const explicitTrafficProfile = resolveExplicitTrafficProfile(normalizedPrompt);
  if (explicitTrafficProfile !== undefined) return explicitTrafficProfile;

  if (/(10,?000|500\+|일\s*10,?000|동시\s*500)/iu.test(normalizedPrompt)) return "large";
  if (/(1,?000|concurrent\s+50|일\s*1,?000|동시\s*50|동접자?\s*1000)/iu.test(normalizedPrompt)) return "medium";
  if (/(under\s+10|100명\s*미만|동시\s*10명\s*미만)/iu.test(normalizedPrompt)) return "small";

  return undefined;
}

function resolveExplicitTrafficProfile(
  value: string
): Exclude<ArchitectureAnswerProfile["traffic"], "bursty" | undefined> | undefined {
  const dailyCount = extractTrafficCount(
    value,
    /(?:일일|하루|daily|일(?=\s*\d))[^\d]{0,20}(\d[\d,]*)(?:\s*명)?(?:\s*(미만|이하|이상|\+))?/iu
  );
  const concurrentCount = extractTrafficCount(
    value,
    /(?:동시|동접|concurrent)[^\d]{0,20}(\d[\d,]*)(?:\s*명)?(?:\s*(미만|이하|이상|\+))?/iu
  );
  const profiles = [
    dailyCount === undefined ? undefined : classifyTrafficCount(dailyCount, 100, 10_000),
    concurrentCount === undefined ? undefined : classifyTrafficCount(concurrentCount, 10, 500)
  ].filter((profile): profile is "small" | "medium" | "large" => profile !== undefined);

  if (profiles.includes("large")) return "large";
  if (profiles.includes("medium")) return "medium";
  return profiles.includes("small") ? "small" : undefined;
}

function extractTrafficCount(value: string, pattern: RegExp): number | undefined {
  const match = value.match(pattern);
  const countText = match?.[1];
  if (countText === undefined) return undefined;
  const count = Number(countText.replaceAll(",", ""));
  if (!Number.isFinite(count)) return undefined;
  return match?.[2] === "미만" || match?.[2] === "이하" ? Math.max(0, count - 1) : count;
}

function classifyTrafficCount(
  count: number,
  smallUpperBound: number,
  largeLowerBound: number
): "small" | "medium" | "large" {
  if (count < smallUpperBound) return "small";
  return count < largeLowerBound ? "medium" : "large";
}

function resolveFrontendProfile(normalizedPrompt: string): ArchitectureAnswerProfile["frontend"] {
  if (isMobileAppPrompt(normalizedPrompt)) {
    return "mobile";
  }

  if (/(next\.?js|nuxt|ssr|server\s*side|서버\s*사이드)/iu.test(normalizedPrompt)) {
    return "ssr";
  }

  if (/(spa|single\s*page|react|vue|angular)/iu.test(normalizedPrompt)) {
    return "spa";
  }

  if (/(static\s+site|html\/css\/js|pure\s+web|정적\s*사이트|순수\s*웹|회사\s*소개|포트폴리오|블로그)/iu.test(normalizedPrompt)) {
    return "static";
  }

  return undefined;
}

function resolveBackendProfile(normalizedPrompt: string): ArchitectureAnswerProfile["backend"] {
  if (requiresNoBackend(normalizedPrompt)) {
    return "none";
  }

  if (/(microservice|마이크로서비스)/iu.test(normalizedPrompt)) {
    return "microservices";
  }

  if (requiresComplexBackend(normalizedPrompt)) {
    return "complex";
  }

  if (/(simple\s+api|api\s+server|node\.?js|python\s*flask|간단\s*api|api\s*서버)/iu.test(normalizedPrompt)) {
    return "simple_api";
  }

  if (requiresInferredComplexBackend(normalizedPrompt)) {
    return "complex";
  }

  if (requiresInferredSimpleBackend(normalizedPrompt)) {
    return "simple_api";
  }

  return undefined;
}

function resolveRegionProfile(normalizedPrompt: string): ArchitectureAnswerProfile["region"] {
  if (requiresKoreaOnlyRegion(normalizedPrompt)) {
    return "korea";
  }

  if (/(global|worldwide|united\s+states|europe|글로벌|미국|유럽)/iu.test(normalizedPrompt)) {
    return "global";
  }

  if (/(asia\s*pacific|apac|tokyo|singapore|hong\s*kong|아시아\s*태평양|도쿄|싱가포르|홍콩)/iu.test(normalizedPrompt)) {
    return "apac";
  }

  if (/(specific\s+region|중국|일본|특정\s*지역)/iu.test(normalizedPrompt)) {
    return "specific";
  }

  return undefined;
}

function resolveUploadProfile(normalizedPrompt: string): ArchitectureAnswerProfile["upload"] {
  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    return "none";
  }

  if (/(mixed\s+files?|documents?|video)/iu.test(normalizedPrompt)) {
    return "mixed";
  }

  if (/(이미지만|이미지\s*업로드|프로필\s*이미지|게시글\s*이미지|images?\s+only|profile\s+image|post\s+image)/iu.test(normalizedPrompt)) {
    return "image";
  }

  if (/(large\s+file|100mb|대용량)/iu.test(normalizedPrompt)) {
    return "large";
  }

  if (/(mixed\s+files?|documents?|video|동영상|문서|다양한\s*파일)/iu.test(normalizedPrompt)) {
    return "mixed";
  }

  if (requiresImageUpload(normalizedPrompt)) {
    return "image";
  }

  return undefined;
}

function resolveRealtimeProfile(normalizedPrompt: string): ArchitectureAnswerProfile["realtime"] {
  if (/^실시간\s*채팅$/imu.test(normalizedPrompt)) {
    return "chat";
  }

  if (/^실시간\s*알림$/imu.test(normalizedPrompt)) {
    return "notification";
  }

  if (/(실시간[\s\S]{0,80}(필요\s*없음|없음)|no\s+real[-\s]*time|realtime:\s*(none|no))/iu.test(normalizedPrompt)) {
    return "none";
  }

  if (/(notification|notify|알림)/iu.test(normalizedPrompt)) {
    return "notification";
  }

  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    return "none";
  }

  if (/(chat|채팅)/iu.test(normalizedPrompt)) {
    return "chat";
  }

  if (/(data\s+updates?|주식|게임|데이터\s*업데이트)/iu.test(normalizedPrompt)) {
    return "data_updates";
  }

  if (/(notification|notify|알림)/iu.test(normalizedPrompt)) {
    return "notification";
  }

  return undefined;
}

function resolveManagementProfile(normalizedPrompt: string): ArchitectureAnswerProfile["management"] {
  if (/(직접\s*관리|서버\s*직접\s*운영|self[-\s]*managed|direct\s+management)/iu.test(normalizedPrompt)) {
    return "self_managed";
  }

  if (/(fully\s*managed|serverless|관리\s*최소|완전\s*관리형|서버리스)/iu.test(normalizedPrompt)) {
    return "fully_managed";
  }

  if (/(semi[-\s]*managed|some\s+server|반관리|semi-managed)/iu.test(normalizedPrompt)) {
    return "semi_managed";
  }

  if (/(self[-\s]*managed|direct\s+management|직접\s*관리|셀프)/iu.test(normalizedPrompt)) {
    return "self_managed";
  }

  if (/(unknown|모르겠|상관없|추천)/iu.test(normalizedPrompt)) {
    return "unknown";
  }

  return undefined;
}

function resolveLatencyProfile(normalizedPrompt: string): ArchitectureAnswerProfile["latency"] {
  if (/(1\s*second|under\s*1\s*(second|sec|s)\b|1초|1\s*초)/iu.test(normalizedPrompt)) {
    return "one_second";
  }

  if (/(3\s*seconds?|under\s*3\s*(seconds?|sec|s)\b|3초|3\s*초)/iu.test(normalizedPrompt)) {
    return "three_seconds";
  }

  if (/(5\s*seconds?|under\s*5\s*(seconds?|sec|s)\b|5초|5\s*초)/iu.test(normalizedPrompt)) {
    return "five_seconds";
  }

  if (/(loading\s*time:\s*(no\s+preference|none)|latency:\s*(no\s+preference|none)|로딩\s*시간[\s\S]{0,20}(상관없|선호\s*없음))/iu.test(normalizedPrompt)) {
    return "none";
  }

  return undefined;
}

function resolveAvailabilityProfile(normalizedPrompt: string): ArchitectureAnswerProfile["availability"] {
  if (requiresVeryHighAvailability(normalizedPrompt)) {
    return "99.99";
  }

  if (/(99\.9|월\s*1시간|1\s*hour)/iu.test(normalizedPrompt)) {
    return "99.9";
  }

  if (/(99%|하루\s*몇\s*시간|few\s+hours)/iu.test(normalizedPrompt)) {
    return "99";
  }

  if (/(downtime\s+tolerance:\s*(no\s+preference|none)|availability:\s*(no\s+preference|none)|가용성[\s\S]{0,20}(상관없|선호\s*없음)|중단[\s\S]{0,20}(상관없|선호\s*없음))/iu.test(normalizedPrompt)) {
    return "none";
  }

  return undefined;
}

function resolveBudgetProfile(normalizedPrompt: string): ArchitectureAnswerProfile["budget"] {
  const conversationalMonthlyBudgetManwon = resolveConversationalMonthlyBudgetManwon(normalizedPrompt);
  if (conversationalMonthlyBudgetManwon !== undefined) {
    if (conversationalMonthlyBudgetManwon < 10) return "low";
    if (conversationalMonthlyBudgetManwon <= 50) return "normal";
    if (conversationalMonthlyBudgetManwon < 200) return "high";
    return "enterprise";
  }

  if (hasLowMonthlyBudget(normalizedPrompt) || /(minimum\s+cost|very\s+low|10만원\s*미만|최소\s*비용)/iu.test(normalizedPrompt)) {
    return "low";
  }

  if (/(10-50만원|moderate|normal|적당한\s*성능)/iu.test(normalizedPrompt)) {
    return "normal";
  }

  if (/(50\s*-\s*200\s*(?:manwon|만원)|high\s+(?:budget|performance)|고성능)/iu.test(normalizedPrompt)) {
    return "high";
  }

  if (/(enterprise|200만원\s*이상|엔터프라이즈)/iu.test(normalizedPrompt)) {
    return "enterprise";
  }

  return undefined;
}

function hasExplicitArchitectureBrief(prompt: string): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  if (
    /(?:required\s+components|architecture\s+flow|validation\s+checklist|\uD544\uC218\s*\uD3EC\uD568\s*\uCEF4\uD3EC\uB10C\uD2B8|\uD575\uC2EC\s*\uC694\uAD6C\uC0AC\uD56D|\uC544\uD0A4\uD14D\uCC98\s*\uD50C\uB85C\uC6B0|\uAC80\uC99D\s*\uAC00\uB2A5\uD55C\s*\uAE30\uC900)/iu.test(
      normalizedPrompt
    )
  ) {
    return true;
  }

  const explicitComponentMentions = [
    /cloudfront/iu,
    /\bs3\b|simple\s*storage|\uC774\uBBF8\uC9C0\s*\uC800\uC7A5|\uC815\uC801\s*\uC790\uC0B0/iu,
    /application\s*load\s*balancer|\balb\b|load\s*balancer/iu,
    /rds|multi-az|db\s*subnet/iu,
    /websocket|sse|api\s*gateway|\uC2E4\uC2DC\uAC04\s*\uC54C\uB9BC/iu,
    /vpc|subnet|\uC11C\uBE0C\uB137/iu,
    /cloudwatch/iu,
    /iam/iu
  ].filter((pattern) => pattern.test(normalizedPrompt)).length;

  const explicitFlowMentions = [
    /user[\s\S]{0,40}cloudfront|\uC0AC\uC6A9\uC790[\s\S]{0,40}cloudfront/iu,
    /cloudfront[\s\S]{0,40}s3/iu,
    /cloudfront[\s\S]{0,80}(load\s*balancer|alb)/iu,
    /(ec2|backend)[\s\S]{0,40}rds/iu,
    /presigned\s*url|\uC0AC\uC804\s*\uC11C\uBA85|\uD504\uB9AC\uC0AC\uC778/iu
  ].filter((pattern) => pattern.test(normalizedPrompt)).length;

  return explicitComponentMentions >= 5 && explicitFlowMentions >= 2;
}

function hasBudgetAvailabilityConflict(normalizedPrompt: string): boolean {
  return hasLowMonthlyBudget(normalizedPrompt) && requiresVeryHighAvailability(normalizedPrompt);
}

function hasCostSensitiveAvailabilityConflict(normalizedPrompt: string): boolean {
  const budgetProfile = resolveBudgetProfile(normalizedPrompt);

  return (
    (hasBudgetAvailabilityConflict(normalizedPrompt) ||
      ((budgetProfile === "low" || budgetProfile === "normal") &&
        requiresDatabase(normalizedPrompt) &&
        (requiresVeryHighAvailability(normalizedPrompt) || resolveBackendProfile(normalizedPrompt) === "microservices")))
  );
}

function hasLowMonthlyBudget(normalizedPrompt: string): boolean {
  return /(\$\s*100|100\s*(usd|dollars?|monthly)|monthly\s*100|budget\s*cost:\s*100|\uC6D4\s*\$?\s*100|\uC608\uC0B0[\s\S]{0,20}100)/iu.test(
    normalizedPrompt
  );
}

function requiresTimeVaryingTraffic(normalizedPrompt: string): boolean {
  return /(time[-\s]*of[-\s]*day|daytime\s+peak|daytime|business\s+hours|traffic\s+pattern:\s*time|\uC2DC\uAC04\uB300\uBCC4|\uB0AE\uC5D0\s*\uB9CE\uC74C|\uC8FC간\s*\uD53C\uD06C)/iu.test(
    normalizedPrompt
  );
}

function hasBudgetAvailabilityResolution(normalizedPrompt: string): boolean {
  return /(99\.9%|relax\s*availability|cost\s*warning|target\s*architecture|keep\s*99\.99|\uAC00\uC6A9\uC131[\s\S]{0,20}\uC644\uD654|\uBE44\uC6A9[\s\S]{0,20}\uACBD\uACE0|\uC608\uC0B0[\s\S]{0,20}\uCD08\uACFC|\uBAA9\uD45C\s*\uC544\uD0A4\uD14D\uCC98)/iu.test(
    normalizedPrompt
  );
}

function hasGlobalDeploymentDecision(normalizedPrompt: string): boolean {
  return /(cloudfront[\s\S]{0,30}(global|\uAE00\uB85C\uBC8C)|api\/rds[\s\S]{0,30}(single|\uB2E8\uC77C)|single\s*(?:primary\s*)?(?:aws\s*)?region|cdn\s+warning|multi[-\s]*region|future\s*multi[-\s]*region|\uB2E8\uC77C\s*\uB9AC\uC804|\uB2E4\uC911\s*\uB9AC\uC804)/iu.test(
    normalizedPrompt
  );
}

function hasUnsupportedMultiRegionExecutionRequest(normalizedPrompt: string): boolean {
  return /(multi[-\s]*region|다중\s*리전|멀티\s*리전)[\s\S]{0,30}(api|rds|terraform|배포)|(?:api|rds)[\s\S]{0,30}(multi[-\s]*region|다중\s*리전|멀티\s*리전)/iu.test(
    normalizedPrompt
  );
}

function hasMultiRegionExecutionBoundaryResolution(normalizedPrompt: string): boolean {
  return /(지원\s*범위|supported\s*scope)[\s\S]{0,80}(단일\s*리전|single\s*region|별도\s*설계)/iu.test(
    normalizedPrompt
  );
}

function requiresGlobalDeploymentScopeDecision(normalizedPrompt: string): boolean {
  if (requiresKoreaOnlyRegion(normalizedPrompt)) {
    return false;
  }

  return /(global|worldwide|united\s+states|europe|\uAE00\uB85C\uBC8C|\uBBF8\uAD6D|\uC720\uB7FD|1\s*second|1\uCD08)/iu.test(
    normalizedPrompt
  );
}

function hasRealtimeImplementationDecision(normalizedPrompt: string): boolean {
  return /(websocket|web\s*socket|sse|server-sent\s*events|polling|api\s*gateway|\uC6F9\uC18C\uCF13|\uC5F0\uACB0\s*\uACBD\uB85C|\uD3F4\uB9C1)/iu.test(
    normalizedPrompt
  );
}

type RealtimeTransport = "polling" | "sse" | "websocket";

function requiresHttpsTransport(normalizedPrompt: string): boolean {
  if (
    /(https|ssl|tls)[\s\S]{0,80}(선택\s*사항|http도\s*괜찮음|optional|not\s+required)|(?:선택\s*사항|http도\s*괜찮음|optional|not\s+required)[\s\S]{0,80}(https|ssl|tls)/iu.test(
      normalizedPrompt
    )
  ) {
    return false;
  }

  return /(?:https|ssl|tls|인증서)[\s\S]{0,40}(?:required|mandatory|필수|중요)|(?:필수|mandatory)[\s\S]{0,40}(?:https|ssl|tls|인증서)/iu.test(
    normalizedPrompt
  );
}

function resolveRealtimeTransport(normalizedPrompt: string): RealtimeTransport | undefined {
  if (/(\bsse\b|server-sent\s*events|http\s*메시지\s*전송\s*\+\s*sse)/iu.test(normalizedPrompt)) {
    return "sse";
  }

  if (/(websocket|web\s*socket|웹소켓)/iu.test(normalizedPrompt)) {
    return "websocket";
  }

  if (/(polling|폴링)/iu.test(normalizedPrompt)) {
    return "polling";
  }

  return undefined;
}

function resolveRealtimeForwardLabel(normalizedPrompt: string): string {
  const realtimeTransport = resolveRealtimeTransport(normalizedPrompt);

  if (realtimeTransport === "sse") {
    return resolveRealtimeProfile(normalizedPrompt) === "notification"
      ? "SSE /events notification stream"
      : "POST /messages + SSE /events";
  }

  if (realtimeTransport === "websocket") {
    return "WebSocket upgrade";
  }

  if (realtimeTransport === "polling") {
    return "polling API requests (cost warning)";
  }

  return "forwards";
}

function mentionsAutoScalingGroup(normalizedPrompt: string): boolean {
  return /(auto\s*scaling\s*group|\basg\b|autoscaling\s*group|\uC624\uD1A0\s*\uC2A4\uCF00\uC77C|\uC790\uB3D9\s*\uD655\uC7A5)/iu.test(
    normalizedPrompt
  );
}

function dedupeNonEmptyLines(lines: readonly string[]): string[] {
  const seenLines = new Set<string>();
  const dedupedLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || seenLines.has(trimmedLine)) {
      continue;
    }

    seenLines.add(trimmedLine);
    dedupedLines.push(trimmedLine);
  }

  return dedupedLines;
}

function requiresNoDatabase(normalizedPrompt: string): boolean {
  return /(database:\s*(none|no)|no\s+database|database\s+not\s+required|db\s*(without|free|none|no)|without\s+db|without\s+database|\bdb\s*없이|db\s*없이\s*만들기|\uB370\uC774\uD130\uBCA0\uC774\uC2A4[\s\S]{0,60}\uD544\uC694\s*\uC5C6\uC74C|\uD544\uC694\s*\uC5C6\uC74C[\s\S]{0,60}\uB370\uC774\uD130\uBCA0\uC774\uC2A4|\uB370\uC774\uD130\uBCA0\uC774\uC2A4\s*\uC5C6\uC774|\uB370\uC774\uD130\uBCA0\uC774\uC2A4\s*\uC81C\uC678|\uC815\uC801\s*\uCF58\uD150\uCE20\uB9CC)/iu.test(
    normalizedPrompt
  );
}

function requiresLowBudgetDbFreeApi(normalizedPrompt: string): boolean {
  return (
    requiresNoDatabase(normalizedPrompt) &&
    resolveBudgetProfile(normalizedPrompt) === "low" &&
    /api\s+server|mobile\s+app\s+backend|api\s*서버|모바일\s*앱\s*백엔드/iu.test(normalizedPrompt)
  );
}

function requiresDatabase(normalizedPrompt: string): boolean {
  if (requiresNoDatabase(normalizedPrompt)) {
    return false;
  }

  return /(database|\bdb\b|rds|postgres|postgresql|mysql|dynamodb|relational|\uB370\uC774\uD130\uBCA0\uC774\uC2A4|\uC0AC\uC6A9\uC790\s*\uC815\uBCF4|\uAC8C\uC2DC\uAE00)/iu.test(
    normalizedPrompt
  );
}

function requiresNoBackend(normalizedPrompt: string): boolean {
  return /(backend:\s*(none|no)|no\s+backend|backend\s+not\s+required|\uBC31\uC5D4\uB4DC[\s\S]{0,60}\uD544\uC694\s*\uC5C6\uC74C|\uD544\uC694\s*\uC5C6\uC74C[\s\S]{0,60}\uC815\uC801\s*\uC0AC\uC774\uD2B8)/iu.test(
    normalizedPrompt
  );
}

function requiresInferredComplexBackend(normalizedPrompt: string): boolean {
  if (requiresNoBackend(normalizedPrompt)) {
    return false;
  }

  const hasBackendWork =
    requiresDatabase(normalizedPrompt) ||
    requiresUploadStorage(normalizedPrompt) ||
    requiresRealtime(normalizedPrompt);

  return (
    hasBackendWork &&
    (resolveManagementProfile(normalizedPrompt) === "self_managed" ||
      resolveRealtimeTransport(normalizedPrompt) === "websocket" ||
      requiresLargeDatabaseProfile(normalizedPrompt) ||
      requiresLargeTrafficCapacity(normalizedPrompt))
  );
}

function requiresInferredSimpleBackend(normalizedPrompt: string): boolean {
  if (requiresNoBackend(normalizedPrompt) || requiresInferredComplexBackend(normalizedPrompt)) {
    return false;
  }

  return requiresSpaFrontend(normalizedPrompt) &&
    (requiresDatabase(normalizedPrompt) || requiresUploadStorage(normalizedPrompt) || requiresRealtime(normalizedPrompt));
}

function requiresSpaFrontend(normalizedPrompt: string): boolean {
  return /(spa|single\s*page|react|vue|angular)/iu.test(normalizedPrompt);
}

function requiresSsrFrontend(normalizedPrompt: string): boolean {
  return resolveFrontendProfile(normalizedPrompt) === "ssr";
}

function requiresUploadStorage(normalizedPrompt: string): boolean {
  const uploadProfile = resolveUploadProfile(normalizedPrompt);

  return uploadProfile !== undefined && uploadProfile !== "none";
}

function requiresComplexBackend(normalizedPrompt: string): boolean {
  return /(complex\s+backend|complex\s+business|business\s+logic|spring\s*boot|django|microservice|\uBCF5\uC7A1\s*(?:\uBE44\uC988\uB2C8\uC2A4|\uBC31\uC5D4\uB4DC)|\uBE44\uC988\uB2C8\uC2A4\s*\uB85C\uC9C1|\uB9C8\uC774\uD06C\uB85C\uC11C\uBE44\uC2A4)/iu.test(
    normalizedPrompt
  );
}

function requiresGlobalOrFastFrontend(normalizedPrompt: string): boolean {
  return /(global|worldwide|united\s+states|europe|\uAE00\uB85C\uBC8C|\uBBF8\uAD6D|\uC720\uB7FD|1\s*second|1\uCD08|https:\s*required|ssl:\s*required|https[\s\S]{0,30}\uD544\uC218|ssl[\s\S]{0,30}\uD544\uC218)/iu.test(
    normalizedPrompt
  );
}

function requiresCloudFrontStaticDelivery(normalizedPrompt: string): boolean {
  return /(global|worldwide|united\s+states|europe|cdn|cloudfront|edge|single\s*(?:primary\s*)?(?:aws\s*)?region|cdn\s+warning|1\s*second|1\uCD08|\uAE00\uB85C\uBC8C|\uBBF8\uAD6D|\uC720\uB7FD)/iu.test(
    normalizedPrompt
  );
}

function requiresImageUpload(normalizedPrompt: string): boolean {
  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    return false;
  }

  return /(image\s+upload|images?\s+only|profile\s+image|post\s+image|\uC774\uBBF8\uC9C0|\uC0AC\uC9C4)/iu.test(normalizedPrompt);
}

function requiresRealtime(normalizedPrompt: string): boolean {
  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    return false;
  }

  return /(realtime|real-time|notification|chat|websocket|\bsse\b|\uC2E4\uC2DC\uAC04\s*\uC54C\uB9BC|\uCC44\uD305)/iu.test(normalizedPrompt);
}

function requiresVeryHighAvailability(normalizedPrompt: string): boolean {
  return /(99\.99|no\s+downtime|zero\s+downtime|\uBB34\uC911\uB2E8|\uC808\uB300\s*\uC548\uB428)/iu.test(normalizedPrompt);
}

function mentionsRealtimePath(text: string): boolean {
  return /(realtime|real-time|notification|websocket|\bsse\b|notify|\uC2E4\uC2DC\uAC04\s*\uC54C\uB9BC|\uCC44\uD305)/iu.test(text);
}

function requiresAlbEc2TrafficPath(normalizedPrompt: string): boolean {
  return /((alb|application\s*load\s*balancer|load\s*balancer|로드\s*밸런서)[\s\S]{0,80}(ec2|auto\s*scaling|autoscaling|asg|인스턴스|서버|뒤|트래픽)|(ec2|인스턴스|서버)[\s\S]{0,80}(alb|application\s*load\s*balancer|load\s*balancer|로드\s*밸런서)\s*(뒤|behind)?)/iu.test(
    normalizedPrompt
  );
}

function requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt: string): boolean {
  return mentionsAutoScalingGroup(normalizedPrompt) && /(ec2|instance|instances|fleet|runtime|런타임|인스턴스|서버|alb|load\s*balancer|로드\s*밸런서)/iu.test(normalizedPrompt);
}

function requiresEc2PrivateSubnetSplit(normalizedPrompt: string): boolean {
  if (
    [
      /(ec2|instances?|servers?)[\s\S]{0,120}(split|spread|distribut|across|between)[\s\S]{0,80}(two|2)[\s\S]{0,30}private\s*subnets?/iu,
      /(ec2|instances?|servers?)[\s\S]{0,120}(two|2)[\s\S]{0,30}private\s*subnets?[\s\S]{0,80}(split|spread|distribut|across|between)/iu,
      /private\s*subnets?[\s\S]{0,40}(two|2)[\s\S]{0,120}(ec2|instances?|servers?)[\s\S]{0,80}(split|spread|distribut|across|between)/iu
    ].some((pattern) => pattern.test(normalizedPrompt))
  ) {
    return true;
  }

  return /((ec2|인스턴스|서버)[\s\S]{0,120}(private\s*subnets?\s*2|2\s*private\s*subnets|프라이빗\s*서브넷\s*2|서브넷\s*2개)[\s\S]{0,80}(split|spread|distribut|나눠|분산|배치)|(private\s*subnets?\s*2|2\s*private\s*subnets|프라이빗\s*서브넷\s*2|서브넷\s*2개)[\s\S]{0,120}(ec2|인스턴스|서버)[\s\S]{0,80}(split|spread|distribut|나눠|분산|배치))/iu.test(
    normalizedPrompt
  );
}

function requiresKoreaOnlyRegion(normalizedPrompt: string): boolean {
  return /(region:\s*(korea|seoul)|korea\s*only|seoul\s*region|ap-northeast-2|\uD55C\uAD6D\uB9CC|\uC11C\uC6B8\s*\uB9AC\uC804)/iu.test(
    normalizedPrompt
  );
}

function requiresApacRegion(normalizedPrompt: string): boolean {
  return (
    !requiresKoreaOnlyRegion(normalizedPrompt) &&
    /(asia\s*pacific|apac|tokyo|singapore|아시아\s*태평양|도쿄|싱가포르|ap-northeast-1|ap-southeast-1)/iu.test(
      normalizedPrompt
    )
  );
}

function hasNoFileUploadRequirement(normalizedPrompt: string): boolean {
  if (
    /(?:file\s*upload:\s*(?:none|no)|no\s+file\s+upload|upload:\s*none|text\s*only)/iu.test(
      normalizedPrompt
    )
  ) {
    return true;
  }

  const lines = normalizedPrompt.split(/\r?\n/u).map((line) => line.trim());
  const noUploadAnswer = /^(?:\uC5C6\uC74C(?:\s*\(\uD14D\uC2A4\uD2B8\uB9CC\))?|\uD14D\uC2A4\uD2B8\uB9CC)$/u;
  const sameLineNoUpload = /\uD30C\uC77C(?:\s*\uC5C5\uB85C\uB4DC)?[^\r\n]{0,40}(?:\uC5C6\uC74C|\uC5C6\uACE0|\uC5C6\uB2E4|\uC5C6\uAC8C|\uC5C6\uC774|\uC5C6\uB294|\uC81C\uC678)/u;

  for (const [index, line] of lines.entries()) {
    if (line.includes("?놁쓬") && line.includes("?띿뒪?몃쭔")) {
      return true;
    }

    if (sameLineNoUpload.test(line)) {
      return true;
    }

    if (/\uD30C\uC77C\s*\uC5C5\uB85C\uB4DC/u.test(line)) {
      for (const answerLine of lines.slice(index + 1, index + 7)) {
        if (answerLine === "\uC9C8\uBB38") {
          break;
        }

        if (noUploadAnswer.test(answerLine)) {
          return true;
        }
      }
    }
  }

  return lines.some((line) => noUploadAnswer.test(line) && lines.length === 1);
}

function hasNoRealtimeRequirement(normalizedPrompt: string): boolean {
  return /(?:realtime:\s*(?:none|no)|real-time:\s*(?:none|no)|no\s+realtime|no\s+real-time|no\s+real\s*time|\uC2E4\uC2DC\uAC04[\s\S]{0,80}(?:\uD544\uC694\s*\uC5C6\uC74C|\uC5C6\uC74C)|\uD544\uC694\s*\uC5C6\uC74C[\s\S]{0,80}\uC2E4\uC2DC\uAC04)/iu.test(
    normalizedPrompt
  );
}

function hasExplicitDatabaseMarker(normalizedPrompt: string): boolean {
  return /(database|db\b|rds|postgres|postgresql|mysql|dynamodb|relational|\uB370\uC774\uD130\uBCA0\uC774\uC2A4|\uC0AC\uC6A9\uC790\s*\uC815\uBCF4|\uAC8C\uC2DC\uAE00)/iu.test(
    normalizedPrompt
  );
}

function hasExplicitComplexBackendMarker(normalizedPrompt: string): boolean {
  return /(complex\s+backend|complex\s+business|business\s+logic|spring\s*boot|django|microservice|\uBCF5\uC7A1\s*(?:\uBE44\uC988\uB2C8\uC2A4|\uBC31\uC5D4\uB4DC)|\uBE44\uC988\uB2C8\uC2A4\s*\uB85C\uC9C1|\uB9C8\uC774\uD06C\uB85C\uC11C\uBE44\uC2A4)/iu.test(
    normalizedPrompt
  );
}

function parseAmazonQArchitectureDraftResponse(text: string): AmazonQArchitectureDraftResponse {
  const parsed = JSON.parse(extractJsonObject(text)) as unknown;

  if (!isObject(parsed) || typeof parsed.status !== "string") {
    throw new Error("Amazon Q architecture draft response must include a status");
  }

  if (parsed.status === "needs_clarification") {
    if (typeof parsed.question !== "string" || parsed.question.trim().length === 0) {
      throw new Error("Amazon Q clarification response must include a question");
    }

    return {
      status: "needs_clarification",
      question: parsed.question.trim(),
      suggestions: readStringArray(parsed.suggestions)
    };
  }

  if (parsed.status === "plan") {
    const plan = parseArchitectureIntentPlan(parsed);

    if (plan === null) {
      throw new Error("Amazon Q architecture plan must include supported planning fields");
    }

    return {
      status: "plan",
      title: typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : "Amazon Q Architecture Draft",
      plan,
      assumptions: readStringArray(parsed.assumptions),
      explanations: readStringArray(parsed.explanations)
    };
  }

  if (parsed.status !== "preview") {
    throw new Error("Amazon Q architecture draft response status is unsupported");
  }

  const architectureJson = parseArchitectureJson(parsed.architectureJson);
  assertEdgesReferenceExistingNodes(architectureJson);

  return {
    status: "preview",
    title: typeof parsed.title === "string" && parsed.title.trim().length > 0 ? parsed.title.trim() : "Amazon Q Architecture Draft",
    architectureJson,
    requirementCoverage: readRequirementCoverage(parsed.requirementCoverage),
    assumptions: readStringArray(parsed.assumptions),
    explanations: readStringArray(parsed.explanations),
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    highlights: readStringArray(parsed.highlights),
    nextActions: readStringArray(parsed.nextActions)
  };
}

function readRequirementCoverage(value: unknown): AmazonQRequirementCoverage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isObject(item) || typeof item.answer !== "string" || typeof item.status !== "string") {
      return [];
    }

    return [
      {
        answer: item.answer,
        status: item.status,
        ...(typeof item.capability === "string" ? { capability: item.capability } : {}),
        ...(Array.isArray(item.nodes) ? { nodes: item.nodes.filter((node): node is string => typeof node === "string") } : {}),
        ...(typeof item.assumption === "string" ? { assumption: item.assumption } : {})
      }
    ];
  });
}

function parseArchitectureJson(value: unknown): ArchitectureJson {
  if (!isObject(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("Amazon Q preview must include architectureJson nodes and edges");
  }

  return {
    nodes: value.nodes.map((node) => {
      if (!isObject(node) || typeof node.id !== "string" || !isSupportedResourceType(node.type)) {
        throw new Error("Amazon Q preview includes an unsupported node");
      }

      return {
        id: node.id,
        type: node.type,
        ...(typeof node.label === "string" && node.label.trim().length > 0 ? { label: node.label } : {}),
        positionX: typeof node.positionX === "number" ? node.positionX : 0,
        positionY: typeof node.positionY === "number" ? node.positionY : 0,
        config: isObject(node.config) ? node.config : {}
      };
    }),
    edges: value.edges.map((edge) => {
      if (
        !isObject(edge) ||
        typeof edge.id !== "string" ||
        typeof edge.sourceId !== "string" ||
        typeof edge.targetId !== "string"
      ) {
        throw new Error("Amazon Q preview includes an invalid edge");
      }

      return {
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        ...(typeof edge.label === "string" && edge.label.trim().length > 0 ? { label: edge.label } : {})
      };
    })
  };
}

function assertEdgesReferenceExistingNodes(architectureJson: ArchitectureJson): void {
  const nodeIds = new Set(architectureJson.nodes.map((node) => node.id));
  const hasInvalidEdge = architectureJson.edges.some(
    (edge) => !nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)
  );

  if (hasInvalidEdge) {
    throw new Error("Amazon Q preview includes an edge that references a missing node");
  }
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Amazon Q did not return a JSON object");
  }

  return text.slice(start, end + 1);
}

function isSupportedResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && SUPPORTED_RESOURCE_TYPE_SET.has(value as ResourceType);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createAiProviderMetadata(input: {
  readonly provider: AiTextProvider;
  readonly billingMode: AiBillingMode;
  readonly payload: unknown;
  readonly outputCharacters?: number | undefined;
}): AiProviderMetadata {
  const payload = maskSecretsForAi(input.payload);

  return {
    provider: input.provider.provider,
    service: input.provider.service,
    model: input.provider.model,
    routeTarget: ARCHITECTURE_DRAFT_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: input.provider.provider,
      model: input.provider.model,
      routeTarget: ARCHITECTURE_DRAFT_TARGET,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload, input.outputCharacters),
    billingMode: input.billingMode,
    generatedAt: new Date().toISOString()
  };
}

function createFallbackProviderMetadata(
  request: CreateArchitectureDraftRequest,
  billingMode: AiBillingMode
): AiProviderMetadata {
  const payload = maskSecretsForAi(request);

  return {
    provider: "fallback",
    service: "rule_fallback",
    routeTarget: ARCHITECTURE_DRAFT_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "fallback",
      routeTarget: ARCHITECTURE_DRAFT_TARGET,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload),
    billingMode,
    generatedAt: new Date().toISOString()
  };
}

function readAiCreditPolicyFromEnv(): AiCreditPolicy {
  return {
    bedrock: process.env.BEDROCK_CREDIT_CONFIRMED === "true",
    amazonQ: process.env.AMAZON_Q_CREDIT_CONFIRMED === "true",
    transcribe: process.env.TRANSCRIBE_CREDIT_CONFIRMED === "true",
    billingMode: readBillingMode()
  };
}

function readBillingMode(): AiBillingMode {
  switch (process.env.AI_BILLING_MODE) {
    case "aws_credit_only":
      return "aws_credit_only";
    case "standard":
      return "standard";
    case "disabled":
      return "disabled";
    default:
      return "disabled";
  }
}
