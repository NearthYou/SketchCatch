import {
  ChatSyncCommand,
  QBusinessClient,
  type AttributeFilter,
  type ChatSyncOutput
} from "@aws-sdk/client-qbusiness";
import type { ResourceType } from "@sketchcatch/types";
import {
  ARCHITECTURE_PATTERN_IDS,
  parseArchitectureIntentPlan,
  type ArchitectureIntentPlan,
  type ArchitecturePatternId
} from "./aiArchitectureRequirementNormalizer.js";
import type { AiTextProvider } from "./aiLlmExplanation.js";

const AMAZON_Q_MESSAGE_MAX_LENGTH = 2_048;
const PATTERN_ID_SET = new Set<string>(ARCHITECTURE_PATTERN_IDS);

type AmazonQBusinessArchitectureClient = {
  readonly send: (command: ChatSyncCommand) => Promise<Pick<ChatSyncOutput, "systemMessage" | "sourceAttributions">>;
};

type ArchitecturePatternPlan = {
  readonly intent?: string | undefined;
  readonly patternIds?: readonly string[] | undefined;
  readonly requiredResources?: readonly string[] | undefined;
  readonly resourceQuantities?: Readonly<Record<string, number>> | undefined;
  readonly forbiddenCapabilities?: readonly string[] | undefined;
  readonly runtimeTopology?: ArchitectureIntentPlan["runtimeTopology"];
  readonly region?: string | undefined;
  readonly database?: string | undefined;
  readonly availability?: string | undefined;
  readonly amazonQBrief?: readonly string[] | undefined;
};

type CanonicalPatternDefinition = {
  readonly documentId: string;
  readonly requiredResources: readonly ResourceType[];
};

const CANONICAL_PATTERNS: Record<ArchitecturePatternId, CanonicalPatternDefinition> = {
  "alb-asg-ec2": {
    documentId: "sketchcatch-pattern-alb-asg-ec2-v1",
    requiredResources: [
      "VPC",
      "SUBNET",
      "INTERNET_GATEWAY",
      "ROUTE_TABLE",
      "ROUTE_TABLE_ASSOCIATION",
      "SECURITY_GROUP",
      "LOAD_BALANCER",
      "LOAD_BALANCER_LISTENER",
      "LOAD_BALANCER_TARGET_GROUP",
      "LAUNCH_TEMPLATE",
      "AUTO_SCALING_GROUP",
      "EC2"
    ]
  },
  "serverless-api": {
    documentId: "sketchcatch-pattern-serverless-api-v1",
    requiredResources: [
      "API_GATEWAY_REST_API",
      "API_GATEWAY_RESOURCE",
      "API_GATEWAY_METHOD",
      "API_GATEWAY_INTEGRATION",
      "API_GATEWAY_DEPLOYMENT",
      "API_GATEWAY_STAGE",
      "LAMBDA",
      "LAMBDA_PERMISSION",
      "IAM_ROLE",
      "CLOUDWATCH_LOG_GROUP"
    ]
  },
  "spa-cloudfront-s3": {
    documentId: "sketchcatch-pattern-spa-cloudfront-s3-v1",
    requiredResources: ["S3", "CLOUDFRONT"]
  },
  "ecs-fargate": {
    documentId: "sketchcatch-pattern-ecs-fargate-v1",
    requiredResources: [
      "VPC",
      "SUBNET",
      "INTERNET_GATEWAY",
      "ROUTE_TABLE",
      "ROUTE_TABLE_ASSOCIATION",
      "SECURITY_GROUP",
      "LOAD_BALANCER",
      "LOAD_BALANCER_LISTENER",
      "LOAD_BALANCER_TARGET_GROUP",
      "ECR_REPOSITORY",
      "ECS_CLUSTER",
      "ECS_TASK_DEFINITION",
      "ECS_SERVICE",
      "IAM_ROLE",
      "CLOUDWATCH_LOG_GROUP"
    ]
  },
  "github-cicd-codedeploy": {
    documentId: "sketchcatch-pattern-github-cicd-codedeploy-v1",
    requiredResources: [
      "CODESTAR_CONNECTION",
      "CODEPIPELINE",
      "CODEBUILD_PROJECT",
      "CODEDEPLOY_APP",
      "CODEDEPLOY_DEPLOYMENT_GROUP",
      "S3",
      "IAM_ROLE"
    ]
  },
  "multi-az-rds": {
    documentId: "sketchcatch-pattern-multi-az-rds-v1",
    requiredResources: [
      "VPC",
      "SUBNET",
      "SECURITY_GROUP",
      "DB_SUBNET_GROUP",
      "RDS",
      "SECRETS_MANAGER_SECRET",
      "CLOUDWATCH_METRIC_ALARM"
    ]
  }
};

export function createAmazonQArchitectureDraftProviderFromEnv(input: {
  readonly region: string;
}): AiTextProvider | undefined {
  if (process.env.AMAZON_Q_ENABLED !== "true") {
    return undefined;
  }

  const retrievalApplicationId =
    process.env.AMAZON_Q_RETRIEVAL_APPLICATION_ID?.trim() ||
    process.env.AMAZON_Q_APPLICATION_ID?.trim();

  if (!retrievalApplicationId) {
    return undefined;
  }

  return createAmazonQArchitectureDraftProvider({
    region: input.region,
    retrievalApplicationId
  });
}

export function createAmazonQArchitectureDraftProvider(input: {
  readonly region: string;
  readonly retrievalApplicationId: string;
  readonly retrievalClient?: AmazonQBusinessArchitectureClient | undefined;
}): AiTextProvider {
  const retrievalClient = input.retrievalClient ?? createDefaultAmazonQClient(input.region);

  return {
    provider: "amazon_q",
    service: "amazon_q_business",
    model: input.retrievalApplicationId,
    generate: async (request) => {
      if (request.target !== "architecture_draft") {
        throw new Error("The Amazon Q architecture provider only supports architecture_draft");
      }

      const normalizedRequirement = readNormalizedRequirement(request.payload);
      const patternIds = resolveArchitecturePatternIds(normalizedRequirement);

      if (patternIds.length === 0) {
        throw new Error("No verified architecture pattern could be selected from the normalized requirement");
      }

      for (const patternId of patternIds) {
        const response = await retrievalClient.send(
          new ChatSyncCommand({
            applicationId: input.retrievalApplicationId,
            chatMode: "RETRIEVAL_MODE",
            attributeFilter: createSinglePatternAttributeFilter(patternId),
            userMessage: createArchitectureKnowledgeRetrievalPrompt(patternId, normalizedRequirement)
          })
        );

        assertExpectedPatternCitation(patternId, response);
      }

      const plan = createCanonicalArchitecturePlan(patternIds, normalizedRequirement);
      const text = JSON.stringify({
        status: "plan",
        title: createCanonicalPlanTitle(patternIds),
        ...plan,
        assumptions: ["Only verified, cited SketchCatch pattern templates are materialized."],
        explanations: patternIds.map((patternId) => `Verified pattern selected: ${patternId}.`)
      });

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}

export function resolveArchitecturePatternIds(
  plan: ArchitecturePatternPlan | null
): ArchitecturePatternId[] {
  if (plan === null) {
    return [];
  }

  const selected = new Set<ArchitecturePatternId>();

  for (const patternId of plan.patternIds ?? []) {
    if (PATTERN_ID_SET.has(patternId)) {
      selected.add(patternId as ArchitecturePatternId);
    }
  }

  const resources = new Set(plan.requiredResources ?? []);
  const compute = plan.runtimeTopology?.compute?.toUpperCase();
  const intent = plan.intent?.toLowerCase() ?? "";
  const database = plan.database?.toLowerCase() ?? "";
  const forbidsEc2Runtime = (plan.forbiddenCapabilities ?? []).some(
    (capability) => capability.toLowerCase() === "ec2_runtime"
  );
  const hasEcsRuntime =
    resources.has("ECS_SERVICE") ||
    resources.has("ECS_TASK_DEFINITION") ||
    /ecs|fargate/.test(compute ?? "");
  const hasServerlessRuntime =
    resources.has("LAMBDA") ||
    resources.has("API_GATEWAY_REST_API") ||
    compute === "LAMBDA";

  if (resources.has("EC2") || resources.has("AUTO_SCALING_GROUP") || compute === "EC2") {
    selected.add("alb-asg-ec2");
  }

  if (hasServerlessRuntime) {
    selected.add("serverless-api");
  }

  if (resources.has("CLOUDFRONT") || (resources.has("S3") && /spa|static/.test(intent))) {
    selected.add("spa-cloudfront-s3");
  }

  if (hasEcsRuntime) {
    selected.add("ecs-fargate");
  }

  if (
    resources.has("CODESTAR_CONNECTION") ||
    resources.has("CODEPIPELINE") ||
    resources.has("CODEBUILD_PROJECT") ||
    resources.has("CODEDEPLOY_APP") ||
    resources.has("CODEDEPLOY_DEPLOYMENT_GROUP")
  ) {
    selected.add("github-cicd-codedeploy");
  }

  if (resources.has("RDS") || resources.has("DB_SUBNET_GROUP") || /simple|medium|large|rds|required/.test(database)) {
    selected.add("multi-az-rds");
  }

  if (forbidsEc2Runtime) {
    selected.delete("alb-asg-ec2");
  }

  return ARCHITECTURE_PATTERN_IDS.filter((patternId) => selected.has(patternId));
}

export function createArchitecturePatternAttributeFilter(
  plan: ArchitecturePatternPlan | null
): AttributeFilter | undefined {
  const patternIds = resolveArchitecturePatternIds(plan);
  const filters = patternIds.map(createSinglePatternAttributeFilter);

  if (filters.length === 0) {
    return undefined;
  }

  return filters.length === 1 ? filters[0] : { orAllFilters: filters };
}

function createSinglePatternAttributeFilter(patternId: ArchitecturePatternId): AttributeFilter {
  return {
    equalsTo: {
      name: "pattern_id",
      value: { stringValue: patternId }
    }
  };
}

function createCanonicalArchitecturePlan(
  patternIds: readonly ArchitecturePatternId[],
  normalizedRequirement: ArchitectureIntentPlan | null
): ArchitectureIntentPlan {
  const requiredResources = new Set<ResourceType>();

  for (const patternId of patternIds) {
    for (const resourceType of CANONICAL_PATTERNS[patternId].requiredResources) {
      requiredResources.add(resourceType);
    }
  }

  const forbiddenCapabilities = new Set(normalizedRequirement?.forbiddenCapabilities ?? []);
  const resourceQuantities: Record<string, number> = {
    ...(normalizedRequirement?.resourceQuantities ?? {})
  };

  if (patternIds.includes("alb-asg-ec2") || patternIds.includes("ecs-fargate")) {
    resourceQuantities.SUBNET = Math.max(resourceQuantities.SUBNET ?? 0, 4);
  } else if (patternIds.includes("multi-az-rds")) {
    resourceQuantities.SUBNET = Math.max(resourceQuantities.SUBNET ?? 0, 2);
  }

  const s3PatternCount = patternIds.filter((patternId) =>
    patternId === "spa-cloudfront-s3" || patternId === "github-cicd-codedeploy"
  ).length;

  if (s3PatternCount > 0) {
    resourceQuantities.S3 = Math.max(resourceQuantities.S3 ?? 0, s3PatternCount);
  }

  if (patternIds.includes("serverless-api") || patternIds.includes("ecs-fargate")) {
    forbiddenCapabilities.add("ec2_runtime");
  }

  return {
    ...(normalizedRequirement?.intent === undefined ? {} : { intent: normalizedRequirement.intent }),
    ...(normalizedRequirement?.region === undefined ? {} : { region: normalizedRequirement.region }),
    patternIds: [...patternIds],
    requiredResources: [...requiredResources],
    ...(Object.keys(resourceQuantities).length === 0 ? {} : { resourceQuantities }),
    ...(forbiddenCapabilities.size === 0
      ? {}
      : { forbiddenCapabilities: [...forbiddenCapabilities] }),
    ...(normalizedRequirement?.runtimeTopology === undefined
      ? {}
      : { runtimeTopology: normalizedRequirement.runtimeTopology }),
    ...(normalizedRequirement?.database === undefined ? {} : { database: normalizedRequirement.database }),
    ...(normalizedRequirement?.availability === undefined
      ? {}
      : { availability: normalizedRequirement.availability }),
    ...(normalizedRequirement?.amazonQBrief === undefined
      ? {}
      : { amazonQBrief: normalizedRequirement.amazonQBrief })
  };
}

function assertExpectedPatternCitation(
  patternId: ArchitecturePatternId,
  response: Pick<ChatSyncOutput, "sourceAttributions">
): void {
  const expectedDocumentId = CANONICAL_PATTERNS[patternId].documentId;
  const hasExpectedCitation = (response.sourceAttributions ?? []).some(
    (source) => source?.documentId === expectedDocumentId
  );

  if (!hasExpectedCitation) {
    throw new Error(`Amazon Q retrieval citation did not include the expected pattern document: ${expectedDocumentId}`);
  }
}

function readNormalizedRequirement(payload: unknown): ArchitectureIntentPlan | null {
  if (!isRecord(payload)) {
    return null;
  }

  return parseArchitectureIntentPlan(payload.normalizedRequirement);
}

function createArchitectureKnowledgeRetrievalPrompt(
  patternId: ArchitecturePatternId,
  normalizedRequirement: ArchitectureIntentPlan | null
): string {
  return fitText(
    [
      `Retrieve only the verified SketchCatch pattern with pattern_id=${patternId}.`,
      "Summarize its required resources, connection order, placement, deployable parameters, validation gates, and forbidden structures.",
      `Normalized project requirement: ${JSON.stringify(normalizedRequirement ?? {})}`
    ].join("\n"),
    AMAZON_Q_MESSAGE_MAX_LENGTH
  );
}

function createCanonicalPlanTitle(patternIds: readonly ArchitecturePatternId[]): string {
  return patternIds.length === 1
    ? `${patternIds[0]} Architecture Draft`
    : `${patternIds.join(" + ")} Architecture Draft`;
}

function createDefaultAmazonQClient(region: string): AmazonQBusinessArchitectureClient {
  const client = new QBusinessClient({ region });

  return {
    send: (command) => client.send(command)
  };
}

function fitText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
