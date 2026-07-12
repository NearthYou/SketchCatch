import "../config/load-env.js";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ResourceType } from "@sketchcatch/types";
import type { AiTextProvider } from "./aiLlmExplanation.js";
import {
  SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG,
  SUPPORTED_ARCHITECTURE_RESOURCE_TYPES
} from "./aiArchitectureResourceCatalog.js";
import { maskSecretsForAi } from "./aiProviderSafety.js";

const ARCHITECTURE_REQUIREMENT_NORMALIZATION_TARGET = "architecture_requirement_normalization";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_TIMEOUT_MS = 30_000;
const OPENAI_MAX_RETRIES = 0;
const MAX_TEXT_ITEMS = 16;
const MAX_TEXT_LENGTH = 240;
const SUPPORTED_RESOURCE_TYPE_SET = new Set<ResourceType>(SUPPORTED_ARCHITECTURE_RESOURCE_TYPES);

export const ARCHITECTURE_PATTERN_IDS = [
  "alb-asg-ec2",
  "serverless-api",
  "spa-cloudfront-s3",
  "ecs-fargate",
  "github-cicd-codedeploy",
  "multi-az-rds"
] as const;

export type ArchitecturePatternId = (typeof ARCHITECTURE_PATTERN_IDS)[number];

const ARCHITECTURE_PATTERN_ID_SET = new Set<string>(ARCHITECTURE_PATTERN_IDS);

const runtimeTopologySchema = z.object({
  trafficEntry: z.string().optional(),
  compute: z.string().optional(),
  computeCount: z.number().int().positive().max(200).optional(),
  placement: z.string().optional(),
  spreadAcrossPrivateSubnets: z.boolean().optional(),
  autoScaling: z.boolean().optional()
});

const openAiRuntimeTopologySchema = z.object({
  trafficEntry: z.string().nullable(),
  compute: z.string().nullable(),
  computeCount: z.number().int().positive().max(200).nullable(),
  placement: z.string().nullable(),
  spreadAcrossPrivateSubnets: z.boolean().nullable(),
  autoScaling: z.boolean().nullable()
});

const openAiResourceQuantitySchema = z.object({
  resourceType: z.string(),
  quantity: z.number().int().positive().max(200)
});

const architectureIntentPlanSchema = z.object({
  intent: z.string().optional(),
  region: z.string().optional(),
  patternIds: z.array(z.string()).optional(),
  requiredResources: z.array(z.string()).optional(),
  resourceQuantities: z.record(z.string(), z.number().int().positive().max(200)).optional(),
  forbiddenCapabilities: z.array(z.string()).optional(),
  runtimeTopology: runtimeTopologySchema.optional(),
  database: z.string().optional(),
  availability: z.string().optional(),
  amazonQBrief: z.array(z.string()).optional()
});

const openAiArchitectureIntentPlanSchema = z.object({
  intent: z.string().nullable(),
  region: z.string().nullable(),
  patternIds: z.array(z.string()).nullable(),
  requiredResources: z.array(z.string()).nullable(),
  resourceQuantities: z.array(openAiResourceQuantitySchema).nullable(),
  forbiddenCapabilities: z.array(z.string()).nullable(),
  runtimeTopology: openAiRuntimeTopologySchema.nullable(),
  database: z.string().nullable(),
  availability: z.string().nullable(),
  amazonQBrief: z.array(z.string()).nullable()
});

export type ArchitectureIntentPlan = z.infer<typeof architectureIntentPlanSchema>;
type OpenAiArchitectureIntentPlan = z.infer<typeof openAiArchitectureIntentPlanSchema>;

type OpenAiRequirementNormalizerClient = {
  readonly responses: {
    readonly parse: (request: {
      readonly model: string;
      readonly instructions: string;
      readonly input: string;
      readonly text: { readonly format: unknown; readonly verbosity?: "low" | "medium" | "high" };
      readonly store?: boolean;
    }) => Promise<{ readonly output_parsed: OpenAiArchitectureIntentPlan | null }>;
  };
};

export function createOpenAiRequirementNormalizerProviderFromEnv(): AiTextProvider | undefined {
  if (process.env.AI_ARCHITECTURE_REQUIREMENT_NORMALIZER !== "openai") {
    return undefined;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }

  const model = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const client = createDefaultOpenAiRequirementNormalizerClient({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES
  });

  return createOpenAiRequirementNormalizerProvider({
    client,
    model
  });
}

export function createOpenAiRequirementNormalizerProvider(input: {
  readonly client: OpenAiRequirementNormalizerClient;
  readonly model?: string | undefined;
}): AiTextProvider {
  const model = input.model ?? DEFAULT_OPENAI_MODEL;

  return {
    provider: "openai",
    service: "openai_responses",
    model,
    generate: async (request) => {
      const response = await input.client.responses.parse({
        model,
        instructions: request.instructions,
        input: request.prompt,
        text: {
          format: zodTextFormat(openAiArchitectureIntentPlanSchema, "architecture_requirement_normalization"),
          verbosity: "low"
        },
        store: false
      });
      const normalized = parseArchitectureIntentPlan(response.output_parsed);
      const text = normalized === null ? "{}" : JSON.stringify(normalized);

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}

function createDefaultOpenAiRequirementNormalizerClient(input: {
  readonly apiKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
}): OpenAiRequirementNormalizerClient {
  const client = new OpenAI({
    apiKey: input.apiKey,
    timeout: input.timeout,
    maxRetries: input.maxRetries
  });

  return {
    responses: {
      parse: async (request) => {
        const response = await client.responses.parse({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: zodTextFormat(openAiArchitectureIntentPlanSchema, "architecture_requirement_normalization"),
            verbosity: "low"
          },
          store: false
        });

        return { output_parsed: response.output_parsed as OpenAiArchitectureIntentPlan | null };
      }
    }
  };
}

export async function createNormalizedArchitectureIntentPlan(input: {
  readonly prompt: string;
  readonly provider?: AiTextProvider | undefined;
}): Promise<ArchitectureIntentPlan | null> {
  if (input.provider === undefined) {
    return null;
  }

  try {
    const response = await input.provider.generate({
      target: ARCHITECTURE_REQUIREMENT_NORMALIZATION_TARGET,
      instructions: createArchitectureRequirementNormalizerInstructions(),
      prompt: createArchitectureRequirementNormalizerPrompt(input.prompt),
      payload: maskSecretsForAi({
        prompt: input.prompt,
        supportedResourceTypes: SUPPORTED_ARCHITECTURE_RESOURCE_TYPES,
        supportedResourceCatalog: SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG
      })
    });

    return parseArchitectureIntentPlan(parseJsonObject(response.text));
  } catch {
    return null;
  }
}

export function createArchitectureRequirementNormalizerInstructions(): string {
  return [
    "You are SketchCatch's Requirement Normalizer.",
    "Convert the user's architecture request into a compact ArchitectureIntentPlan JSON object.",
    "Do not create a diagram. Do not invent unsupported ResourceNode.type values.",
    `patternIds must contain only applicable verified pattern IDs: ${ARCHITECTURE_PATTERN_IDS.join(", ")}.`,
    "requiredResources must use only supported ResourceNode.type values from the resource panel catalog.",
    "resourceQuantities must capture explicit counts such as EC2 3 instances.",
    "forbiddenCapabilities must capture explicit exclusions such as no file upload or no realtime.",
    "runtimeTopology must capture hard topology constraints such as ALB -> ASG -> EC2, private subnet placement, and spread requirements.",
    "amazonQBrief must be short imperative English lines for Amazon Q. Preserve explicit user constraints more strongly than questionnaire defaults.",
    "Return JSON only."
  ].join("\n");
}

function createArchitectureRequirementNormalizerPrompt(prompt: string): string {
  return [
    "Supported resource panel catalog:",
    JSON.stringify(SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG, null, 2),
    "ArchitectureIntentPlan JSON shape:",
    '{"intent":"dynamic_web_application","region":"ap-northeast-2","patternIds":["alb-asg-ec2"],"requiredResources":["EC2"],"resourceQuantities":[{"resourceType":"EC2","quantity":3}],"forbiddenCapabilities":["file_upload"],"runtimeTopology":{"trafficEntry":"LOAD_BALANCER","compute":"EC2","computeCount":3,"placement":"private_subnets","spreadAcrossPrivateSubnets":true,"autoScaling":true},"database":"simple","availability":"99.9","amazonQBrief":["short imperative line"]}',
    "User requirement prompt:",
    prompt
  ].join("\n\n");
}

export function parseArchitectureIntentPlan(value: unknown): ArchitectureIntentPlan | null {
  const parsed = architectureIntentPlanSchema.safeParse(normalizeOpenAiResourceQuantities(removeNullObjectFields(value)));

  if (!parsed.success) {
    return null;
  }

  const requiredResources = normalizeResourceTypes(parsed.data.requiredResources);
  const patternIds = normalizePatternIds(parsed.data.patternIds);
  const resourceQuantities = normalizeResourceQuantities(parsed.data.resourceQuantities);
  const forbiddenCapabilities = normalizeTextItems(parsed.data.forbiddenCapabilities);
  const amazonQBrief = normalizeTextItems(parsed.data.amazonQBrief);
  const runtimeTopology = normalizeRuntimeTopology(parsed.data.runtimeTopology);
  const region = normalizeAwsRegion(parsed.data.region);
  const plan: ArchitectureIntentPlan = {
    ...(normalizeText(parsed.data.intent) === undefined ? {} : { intent: normalizeText(parsed.data.intent) }),
    ...(region === undefined ? {} : { region }),
    ...(patternIds.length === 0 ? {} : { patternIds }),
    ...(requiredResources.length === 0 ? {} : { requiredResources }),
    ...(Object.keys(resourceQuantities).length === 0 ? {} : { resourceQuantities }),
    ...(forbiddenCapabilities.length === 0 ? {} : { forbiddenCapabilities }),
    ...(runtimeTopology === undefined ? {} : { runtimeTopology }),
    ...(normalizeText(parsed.data.database) === undefined ? {} : { database: normalizeText(parsed.data.database) }),
    ...(normalizeText(parsed.data.availability) === undefined ? {} : { availability: normalizeText(parsed.data.availability) }),
    ...(amazonQBrief.length === 0 ? {} : { amazonQBrief })
  };

  return Object.keys(plan).length === 0 ? null : plan;
}

function normalizeAwsRegion(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)?.toLowerCase();

  return normalized !== undefined &&
    /^(?:af|ap|ca|cn|eu|il|me|mx|sa|us|us-gov)-[a-z]+(?:-[a-z]+)*-\d$/u.test(normalized)
    ? normalized
    : undefined;
}

function normalizePatternIds(values: readonly string[] | undefined): ArchitecturePatternId[] {
  if (values === undefined) {
    return [];
  }

  const normalized: ArchitecturePatternId[] = [];

  for (const value of values) {
    const candidate = value.trim().toLowerCase();

    if (ARCHITECTURE_PATTERN_ID_SET.has(candidate) && !normalized.includes(candidate as ArchitecturePatternId)) {
      normalized.push(candidate as ArchitecturePatternId);
    }
  }

  return normalized;
}

function normalizeOpenAiResourceQuantities(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const candidate = value as Record<string, unknown>;

  if (!Array.isArray(candidate.resourceQuantities)) {
    return value;
  }

  const resourceQuantities = Object.fromEntries(
    candidate.resourceQuantities.flatMap((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }

      const quantityEntry = entry as Record<string, unknown>;

      return typeof quantityEntry.resourceType === "string" && typeof quantityEntry.quantity === "number"
        ? [[quantityEntry.resourceType, quantityEntry.quantity]]
        : [];
    })
  );

  return {
    ...candidate,
    resourceQuantities
  };
}

function removeNullObjectFields(value: unknown): unknown {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== null)
      .map(([key, fieldValue]) => [key, removeNullObjectFields(fieldValue)])
  );
}

function normalizeRuntimeTopology(value: ArchitectureIntentPlan["runtimeTopology"]): ArchitectureIntentPlan["runtimeTopology"] {
  if (value === undefined) {
    return undefined;
  }

  const normalized = {
    ...(normalizeText(value.trafficEntry) === undefined ? {} : { trafficEntry: normalizeText(value.trafficEntry) }),
    ...(normalizeText(value.compute) === undefined ? {} : { compute: normalizeText(value.compute) }),
    ...(value.computeCount === undefined ? {} : { computeCount: value.computeCount }),
    ...(normalizeText(value.placement) === undefined ? {} : { placement: normalizeText(value.placement) }),
    ...(value.spreadAcrossPrivateSubnets === undefined
      ? {}
      : { spreadAcrossPrivateSubnets: value.spreadAcrossPrivateSubnets }),
    ...(value.autoScaling === undefined ? {} : { autoScaling: value.autoScaling })
  };

  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

function normalizeResourceTypes(values: readonly string[] | undefined): ResourceType[] {
  if (values === undefined) {
    return [];
  }

  const normalized: ResourceType[] = [];

  for (const value of values) {
    const candidate = value.trim().toUpperCase() as ResourceType;

    if (SUPPORTED_RESOURCE_TYPE_SET.has(candidate) && !normalized.includes(candidate)) {
      normalized.push(candidate);
    }
  }

  return normalized;
}

function normalizeResourceQuantities(value: Record<string, number> | undefined): Record<string, number> {
  if (value === undefined) {
    return {};
  }

  const normalized: Record<string, number> = {};

  for (const [key, quantity] of Object.entries(value)) {
    const resourceType = key.trim().toUpperCase() as ResourceType;

    if (SUPPORTED_RESOURCE_TYPE_SET.has(resourceType)) {
      normalized[resourceType] = quantity;
    }
  }

  return normalized;
}

function normalizeTextItems(values: readonly string[] | undefined): string[] {
  if (values === undefined) {
    return [];
  }

  const normalized: string[] = [];

  for (const value of values) {
    const text = normalizeText(value);

    if (text !== undefined && !normalized.includes(text)) {
      normalized.push(text);
    }

    if (normalized.length >= MAX_TEXT_ITEMS) {
      break;
    }
  }

  return normalized;
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > MAX_TEXT_LENGTH ? `${trimmed.slice(0, MAX_TEXT_LENGTH - 3)}...` : trimmed;
}

function parseJsonObject(text: string): unknown {
  try {
    const parsed = JSON.parse(text);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
