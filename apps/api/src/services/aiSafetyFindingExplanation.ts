import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  AiProviderMetadata,
  AiSafetyExplanation,
  CheckFinding,
  LlmExplanationFallbackReason
} from "@sketchcatch/types";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";

const SAFETY_EXPLANATION_ROUTE_TARGET = "safety_finding_explanation";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_TIMEOUT_MS = 10_000;
const OPENAI_MAX_RETRIES = 0;
const SAFETY_EXPLANATION_MAX_LENGTH = 700;
const SAFETY_EXPLANATION_STEP_MAX_COUNT = 5;

const aiSafetyExplanationSchema = z.object({
  riskSummary: z.string(),
  whyDangerous: z.string(),
  recommendedFix: z.string(),
  terraformHint: z.string().nullable(),
  verificationSteps: z.array(z.string()),
  fallbackUsed: z.literal(false)
});

const aiSafetyExplanationTextFormat = zodTextFormat(
  aiSafetyExplanationSchema,
  "ai_safety_explanation"
);

export type OpenAiSafetyParseRequest = {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly text: {
    readonly format: unknown;
  };
};

export type OpenAiSafetyParseResponse = {
  readonly output_parsed: unknown;
};

export type OpenAiSafetyResponsesClient = {
  readonly responses: {
    readonly parse: (request: OpenAiSafetyParseRequest) => Promise<OpenAiSafetyParseResponse>;
  };
};

export type OpenAiSafetyClientOptions = {
  readonly apiKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
};

export type CreateConfiguredOpenAiSafetyFindingExplanationOptions = {
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
  readonly createClient?: ((options: OpenAiSafetyClientOptions) => OpenAiSafetyResponsesClient) | undefined;
};

export type CreateOpenAiSafetyFindingExplanationOptions = {
  readonly apiKey?: string | undefined;
  readonly client: OpenAiSafetyResponsesClient;
  readonly model?: string | undefined;
};

export type CreateSafetyFindingExplanation = (
  finding: CheckFinding
) => Promise<AiSafetyExplanation>;

type SafetyFindingTemplate = {
  readonly keywords: readonly string[];
  readonly riskSummary: string;
  readonly whyDangerous: string;
  readonly recommendedFix: string;
  readonly terraformHint?: string | undefined;
  readonly verificationSteps: readonly string[];
};

const SAFETY_FINDING_TEMPLATES: readonly SafetyFindingTemplate[] = [
  {
    keywords: ["public_ssh", "open-ssh", "ssh", "0.0.0.0/0", "::/0"],
    riskSummary: "SSH access is exposed to the public internet.",
    whyDangerous:
      "Anyone on the internet can attempt SSH login against the instance. If a key, user, or host configuration is weak, the server can be compromised before deployment review catches it.",
    recommendedFix:
      "Restrict SSH ingress to a trusted administrator CIDR or remove SSH and use AWS Systems Manager Session Manager.",
    terraformHint:
      "In the aws_security_group ingress rule, replace cidr_blocks = [\"0.0.0.0/0\"] with a trusted CIDR or remove the SSH rule.",
    verificationSteps: [
      "Confirm port 22 is not open to 0.0.0.0/0 or ::/0.",
      "Run Terraform validation and pre-deployment check again.",
      "Confirm the finding disappears before starting deployment review."
    ]
  },
  {
    keywords: ["public_rds", "public-rds", "rds", "publiclyaccessible", "database"],
    riskSummary: "The database can be reachable from a public network path.",
    whyDangerous:
      "A public database endpoint increases the attack surface for credential stuffing, brute force attempts, and accidental data exposure.",
    recommendedFix:
      "Disable public accessibility and place the database in private subnets with security group access limited to the application tier.",
    terraformHint:
      "Set publicly_accessible = false and ensure DB subnet groups use private subnets.",
    verificationSteps: [
      "Confirm publicly_accessible is false.",
      "Confirm the DB subnet group uses private subnets.",
      "Run the pre-deployment check again."
    ]
  },
  {
    keywords: ["public_s3", "public-s3", "s3", "bucket policy", "acl"],
    riskSummary: "The S3 bucket can expose objects publicly.",
    whyDangerous:
      "Public ACLs or permissive bucket policies can leak uploaded assets, Terraform exports, or user content to anonymous internet users.",
    recommendedFix:
      "Remove public ACLs and public bucket policy statements, then enable S3 Block Public Access.",
    terraformHint:
      "Use aws_s3_bucket_public_access_block with block_public_acls, block_public_policy, ignore_public_acls, and restrict_public_buckets set to true.",
    verificationSteps: [
      "Confirm no public ACL or Principal \"*\" allow policy remains.",
      "Confirm S3 Block Public Access is enabled.",
      "Run the pre-deployment check again."
    ]
  },
  {
    keywords: ["iam_wildcard", "iam", "wildcard", "permission"],
    riskSummary: "The IAM policy grants overly broad permissions.",
    whyDangerous:
      "Wildcard actions or resources can allow the workload to change unrelated cloud resources if the role is misused or compromised.",
    recommendedFix:
      "Replace wildcard actions and resources with the smallest action list and resource ARNs needed for this architecture.",
    terraformHint:
      "Avoid Action = \"*\" and Resource = \"*\" in aws_iam_policy_document or inline policy JSON.",
    verificationSteps: [
      "Confirm IAM policy actions are explicit.",
      "Confirm resource scope is limited to required ARNs.",
      "Run the pre-deployment check again."
    ]
  },
  {
    keywords: ["cost", "expensive", "비용"],
    riskSummary: "The resource can increase monthly practice cost.",
    whyDangerous:
      "A larger instance class or always-on managed service can create unexpected spend during repeated practice deployments.",
    recommendedFix:
      "Use the smallest supported instance class, prefer free-tier friendly defaults, and destroy unused environments after validation.",
    verificationSteps: [
      "Review the cost estimate and fallback assumptions.",
      "Confirm the selected instance class is intentional.",
      "Run cost review again after the change."
    ]
  }
];

const DEFAULT_SAFETY_FINDING_TEMPLATE: SafetyFindingTemplate = {
  keywords: [],
  riskSummary: "This finding needs manual review before deployment.",
  whyDangerous:
    "The deterministic safety rules found a condition that can affect security, reliability, configuration, or cost.",
  recommendedFix: "Review the finding description and recommendation, then update Terraform or the architecture before redeploying.",
  verificationSteps: [
    "Apply the recommended change.",
    "Run Terraform validation.",
    "Run the pre-deployment check again."
  ]
};

export function createConfiguredOpenAiSafetyFindingExplanation(
  options: CreateConfiguredOpenAiSafetyFindingExplanationOptions = {}
): CreateSafetyFindingExplanation {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return async (finding) => createFallbackSafetyFindingExplanation(finding, "missing_api_key");
  }

  const createClient = options.createClient ?? createDefaultOpenAiSafetyResponsesClient;
  const client = createClient({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES
  });

  return createOpenAiSafetyFindingExplanation({
    apiKey,
    client,
    model: options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  });
}

export function createOpenAiSafetyFindingExplanation(
  options: CreateOpenAiSafetyFindingExplanationOptions
): CreateSafetyFindingExplanation {
  return async (finding) => {
    if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
      return createFallbackSafetyFindingExplanation(finding, "missing_api_key");
    }

    const payload = createSafetyFindingPayload(finding);
    const model = options.model ?? DEFAULT_OPENAI_MODEL;

    try {
      const response = await options.client.responses.parse({
        model,
        instructions: createSafetyFindingInstructions(),
        input: JSON.stringify(payload),
        text: {
          format: aiSafetyExplanationTextFormat
        }
      });

      return validateOpenAiSafetyExplanation(finding, payload, model, response.output_parsed);
    } catch (error) {
      return createFallbackSafetyFindingExplanation(finding, classifyOpenAiError(error));
    }
  };
}

export function createFallbackSafetyFindingExplanation(
  finding: CheckFinding,
  fallbackReason: LlmExplanationFallbackReason = "missing_api_key"
): AiSafetyExplanation {
  const template = selectSafetyFindingTemplate(finding);
  const output = {
    riskSummary: template.riskSummary,
    whyDangerous: template.whyDangerous,
    recommendedFix: template.recommendedFix,
    terraformHint: template.terraformHint,
    verificationSteps: [...template.verificationSteps]
  };

  return {
    ...output,
    fallbackUsed: true,
    fallbackReason,
    providerMetadata: createFallbackProviderMetadata(finding, output)
  };
}

function createDefaultOpenAiSafetyResponsesClient(options: OpenAiSafetyClientOptions): OpenAiSafetyResponsesClient {
  const client = new OpenAI({
    apiKey: options.apiKey,
    timeout: options.timeout,
    maxRetries: options.maxRetries
  });

  return {
    responses: {
      parse: async (request) => {
        const response = await client.responses.parse({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: aiSafetyExplanationTextFormat,
            verbosity: "low"
          },
          store: false
        });

        return { output_parsed: response.output_parsed };
      }
    }
  };
}

function createSafetyFindingInstructions(): string {
  return [
    "You explain deployment safety findings for SketchCatch.",
    "Respond in Korean.",
    "Do not decide severity, approval, blocked state, or whether deployment can continue.",
    "Only explain why the deterministic finding is risky and how to fix it.",
    "Do not claim deployment is safe or guaranteed.",
    "Do not include secrets or account-specific values."
  ].join("\n");
}

function createSafetyFindingPayload(finding: CheckFinding) {
  return maskSecretsForAi({
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    resourceId: finding.resourceId ?? null,
    title: finding.title,
    description: finding.description,
    recommendation: finding.recommendation,
    sourceLocation: finding.sourceLocation ?? null
  });
}

function validateOpenAiSafetyExplanation(
  finding: CheckFinding,
  payload: unknown,
  model: string,
  value: unknown
): AiSafetyExplanation {
  const fallback = createFallbackSafetyFindingExplanation(finding, "invalid_response");
  const parsed = aiSafetyExplanationSchema.safeParse(value);

  if (!parsed.success) {
    return fallback;
  }

  const riskSummary = normalizeExplanationText(parsed.data.riskSummary);
  const whyDangerous = normalizeExplanationText(parsed.data.whyDangerous);
  const recommendedFix = normalizeExplanationText(parsed.data.recommendedFix);
  const terraformHint =
    parsed.data.terraformHint === null
      ? undefined
      : normalizeExplanationText(parsed.data.terraformHint);
  const verificationSteps = normalizeVerificationSteps(parsed.data.verificationSteps);

  if (
    riskSummary === null ||
    whyDangerous === null ||
    recommendedFix === null ||
    (parsed.data.terraformHint !== null && terraformHint === null) ||
    verificationSteps.length === 0
  ) {
    return fallback;
  }

  const normalizedTerraformHint: string | undefined = terraformHint ?? undefined;
  const output: Omit<AiSafetyExplanation, "fallbackUsed" | "fallbackReason" | "providerMetadata"> = {
    riskSummary,
    whyDangerous,
    recommendedFix,
    verificationSteps,
    ...(normalizedTerraformHint === undefined ? {} : { terraformHint: normalizedTerraformHint })
  };

  return {
    ...output,
    fallbackUsed: false,
    providerMetadata: createOpenAiProviderMetadata(finding, payload, output, model)
  };
}

function selectSafetyFindingTemplate(finding: CheckFinding): SafetyFindingTemplate {
  const normalizedFinding = [
    finding.id,
    finding.category,
    finding.severity,
    finding.resourceId ?? "",
    finding.title,
    finding.description,
    finding.recommendation
  ]
    .join(" ")
    .toLowerCase();

  return (
    SAFETY_FINDING_TEMPLATES.find((template) =>
      template.keywords.some((keyword) => normalizedFinding.includes(keyword))
    ) ?? DEFAULT_SAFETY_FINDING_TEMPLATE
  );
}

function normalizeExplanationText(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > SAFETY_EXPLANATION_MAX_LENGTH || containsBlockedGuarantee(trimmed)) {
    return null;
  }

  return trimmed;
}

function normalizeVerificationSteps(values: readonly string[]): string[] {
  const steps: string[] = [];

  for (const value of values) {
    const normalized = normalizeExplanationText(value);

    if (normalized === null) {
      continue;
    }

    steps.push(normalized);

    if (steps.length >= SAFETY_EXPLANATION_STEP_MAX_COUNT) {
      break;
    }
  }

  return steps;
}

function containsBlockedGuarantee(value: string): boolean {
  const normalized = value.toLowerCase();

  return [
    "deployment is guaranteed",
    "security is guaranteed",
    "safe to deploy",
    "배포가 보장",
    "보안이 보장",
    "배포해도 안전"
  ].some((phrase) => normalized.includes(phrase.toLowerCase()));
}

function createFallbackProviderMetadata(
  finding: CheckFinding,
  output: Omit<AiSafetyExplanation, "fallbackUsed" | "fallbackReason" | "providerMetadata">
): AiProviderMetadata {
  const payload = maskSecretsForAi({
    finding,
    output
  });

  return {
    provider: "fallback",
    service: "rule_fallback",
    routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "fallback",
      routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload, JSON.stringify(output).length),
    billingMode: "disabled",
    generatedAt: new Date().toISOString()
  };
}

function createOpenAiProviderMetadata(
  finding: CheckFinding,
  payload: unknown,
  output: Omit<AiSafetyExplanation, "fallbackUsed" | "fallbackReason" | "providerMetadata">,
  model: string
): AiProviderMetadata {
  const metadataPayload = {
    finding,
    payload,
    output
  };

  return {
    provider: "openai",
    service: "openai_responses",
    model,
    routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "openai",
      model,
      routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
      payload: metadataPayload
    }),
    estimatedUsage: estimateAiUsage(metadataPayload, JSON.stringify(output).length),
    billingMode: "standard",
    generatedAt: new Date().toISOString()
  };
}

function classifyOpenAiError(error: unknown): LlmExplanationFallbackReason {
  if (error instanceof Error && error.name === "APIConnectionTimeoutError") {
    return "timeout";
  }

  if (error instanceof Error && error.name === "RateLimitError") {
    return "rate_limited";
  }

  if (error instanceof Error && error.name === "BadRequestError") {
    return "invalid_request";
  }

  if (error instanceof Error && error.name === "AuthenticationError") {
    return "auth_error";
  }

  return "provider_error";
}
