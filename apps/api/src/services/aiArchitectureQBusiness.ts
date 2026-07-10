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
const LOAD_BALANCER_RESOURCE_TYPES = new Set<ResourceType>([
  "LOAD_BALANCER",
  "LOAD_BALANCER_LISTENER",
  "LOAD_BALANCER_TARGET_GROUP"
]);
const ECS_RUNTIME_RESOURCE_TYPES = new Set<ResourceType>([
  "ECR_REPOSITORY",
  "ECS_CLUSTER",
  "ECS_TASK_DEFINITION",
  "ECS_SERVICE"
]);
const EC2_RUNTIME_RESOURCE_TYPES = new Set<ResourceType>([
  "EC2",
  "AMI",
  "IAM_INSTANCE_PROFILE",
  "LAUNCH_TEMPLATE",
  "AUTO_SCALING_GROUP",
  "AUTO_SCALING_POLICY",
  "ECS_CAPACITY_PROVIDER"
]);

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

type ArchitecturePageAnswerProfile = {
  readonly availability?: string | undefined;
  readonly backend?: string | undefined;
  readonly budget?: string | undefined;
  readonly frontend?: string | undefined;
  readonly management?: string | undefined;
  readonly realtime?: string | undefined;
  readonly traffic?: string | undefined;
  readonly upload?: string | undefined;
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

      const normalizedRequirement = createRetrievalArchitectureRequirement(request.payload);
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
      const governanceNotes = createSecurityAndCostNotes(normalizedRequirement);
      const text = JSON.stringify({
        status: "plan",
        title: createCanonicalPlanTitle(patternIds),
        ...plan,
        assumptions: [
          "Only verified, cited SketchCatch pattern templates are materialized.",
          ...governanceNotes
        ],
        explanations: [
          ...patternIds.map((patternId) => `Verified pattern selected: ${patternId}.`),
          ...governanceNotes
        ]
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
    resources.has("EKS_CLUSTER") ||
    resources.has("EKS_NODE_GROUP") ||
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
  const forbiddenCapabilities = new Set(normalizedRequirement?.forbiddenCapabilities ?? []);
  const normalizedForbiddenCapabilities = new Set(
    [...forbiddenCapabilities].map((capability) => capability.toLowerCase())
  );
  const usesEksRuntime =
    normalizedRequirement?.requiredResources?.some((resourceType) =>
      resourceType === "EKS_CLUSTER" || resourceType === "EKS_NODE_GROUP"
    ) ?? false;
  const shouldExcludeResource = (resourceType: ResourceType): boolean =>
    (normalizedForbiddenCapabilities.has("load_balancer") &&
      LOAD_BALANCER_RESOURCE_TYPES.has(resourceType)) ||
    (usesEksRuntime && ECS_RUNTIME_RESOURCE_TYPES.has(resourceType));

  for (const patternId of patternIds) {
    for (const resourceType of CANONICAL_PATTERNS[patternId].requiredResources) {
      if (!shouldExcludeResource(resourceType)) {
        requiredResources.add(resourceType);
      }
    }
  }

  for (const resourceType of normalizedRequirement?.requiredResources ?? []) {
    if (!shouldExcludeResource(resourceType as ResourceType)) {
      requiredResources.add(resourceType as ResourceType);
    }
  }

  const resourceQuantities: Record<string, number> = {
    ...(normalizedRequirement?.resourceQuantities ?? {})
  };

  for (const resourceType of Object.keys(resourceQuantities) as ResourceType[]) {
    if (shouldExcludeResource(resourceType)) {
      delete resourceQuantities[resourceType];
    }
  }

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

function createRetrievalArchitectureRequirement(payload: unknown): ArchitectureIntentPlan | null {
  const normalizedRequirement = readNormalizedRequirement(payload);

  if (!isRecord(payload)) {
    return normalizedRequirement;
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const answerProfile = readPageAnswerProfile(payload.architectureDecisionSpace);
  const explicitResourceTypes = new Set<ResourceType>(findSupplementalExplicitResourceTypes(prompt));
  const requiredResources = new Set<ResourceType>(
    (normalizedRequirement?.requiredResources ?? []) as ResourceType[]
  );
  const patternIds = new Set<ArchitecturePatternId>(
    (normalizedRequirement?.patternIds ?? []).filter((patternId): patternId is ArchitecturePatternId =>
      PATTERN_ID_SET.has(patternId)
    )
  );
  const forbiddenCapabilities = new Set(normalizedRequirement?.forbiddenCapabilities ?? []);
  const resourceQuantities: Record<string, number> = {
    ...(normalizedRequirement?.resourceQuantities ?? {})
  };

  for (const resourceType of explicitResourceTypes) {
    requiredResources.add(resourceType);
  }

  const forbidsLoadBalancer = promptForbidsLoadBalancer(prompt);
  const forbidsEc2 = promptForbidsEc2(prompt);
  const usesEks =
    explicitResourceTypes.has("EKS_CLUSTER") || explicitResourceTypes.has("EKS_NODE_GROUP");
  const usesEcs =
    requiredResources.has("ECS_SERVICE") || requiredResources.has("ECS_TASK_DEFINITION");
  const usesLambda = requiredResources.has("LAMBDA");
  const usesEc2 = requiredResources.has("EC2") || requiredResources.has("AUTO_SCALING_GROUP");

  if (forbidsLoadBalancer) {
    forbiddenCapabilities.add("load_balancer");
    for (const resourceType of LOAD_BALANCER_RESOURCE_TYPES) {
      requiredResources.delete(resourceType);
      delete resourceQuantities[resourceType];
    }
  }

  if (forbidsEc2 || usesEks || usesEcs || usesLambda) {
    forbiddenCapabilities.add("ec2_runtime");
    for (const resourceType of EC2_RUNTIME_RESOURCE_TYPES) {
      requiredResources.delete(resourceType);
      delete resourceQuantities[resourceType];
    }
    patternIds.delete("alb-asg-ec2");
  }

  if (usesEks) {
    patternIds.add("ecs-fargate");
    if (!forbidsLoadBalancer && explicitResourceTypes.has("LOAD_BALANCER")) {
      requiredResources.add("LOAD_BALANCER");
    }
  } else if (usesEcs) {
    patternIds.add("ecs-fargate");
  } else if (usesLambda) {
    patternIds.add("serverless-api");
  } else if (usesEc2) {
    patternIds.add("alb-asg-ec2");
  }

  const hasRuntime = usesEks || usesEcs || usesLambda || (usesEc2 && !forbidsEc2);

  if (answerProfile.backend === "none") {
    patternIds.add("spa-cloudfront-s3");
    requiredResources.add("S3");
    requiredResources.add("CLOUDFRONT");
  } else if (answerProfile.frontend === "spa" || answerProfile.frontend === "ssr") {
    patternIds.add("spa-cloudfront-s3");
    requiredResources.add("S3");
    requiredResources.add("CLOUDFRONT");
  }

  if (!hasRuntime && answerProfile.backend !== "none") {
    if (answerProfile.backend === "microservices") {
      patternIds.add("ecs-fargate");
      requiredResources.add("ECS_CLUSTER");
      requiredResources.add("ECS_TASK_DEFINITION");
      requiredResources.add("ECS_SERVICE");
      requiredResources.add("ECR_REPOSITORY");
      if (!forbidsLoadBalancer) {
        requiredResources.add("LOAD_BALANCER");
      }
      forbiddenCapabilities.add("ec2_runtime");
    } else if (
      answerProfile.backend === "simple_api" ||
      answerProfile.management === "fully_managed"
    ) {
      patternIds.add("serverless-api");
      requiredResources.add("API_GATEWAY_REST_API");
      requiredResources.add("LAMBDA");
      forbiddenCapabilities.add("ec2_runtime");
    } else if (answerProfile.backend === "complex") {
      patternIds.add("alb-asg-ec2");
      requiredResources.add("LOAD_BALANCER");
      requiredResources.add("AUTO_SCALING_GROUP");
      requiredResources.add("EC2");
      if (answerProfile.availability === "99.9" || answerProfile.availability === "99.99") {
        resourceQuantities.EC2 = Math.max(resourceQuantities.EC2 ?? 0, 2);
      }
    }
  }

  if (answerProfile.upload !== undefined && answerProfile.upload !== "none") {
    requiredResources.add("S3");
  }

  if (
    answerProfile.realtime !== undefined &&
    answerProfile.realtime !== "none" &&
    !["alb-asg-ec2", "serverless-api", "ecs-fargate"].some((patternId) =>
      patternIds.has(patternId as ArchitecturePatternId)
    )
  ) {
    patternIds.add("serverless-api");
    requiredResources.add("API_GATEWAY_REST_API");
    requiredResources.add("LAMBDA");
    forbiddenCapabilities.add("ec2_runtime");
  }

  let database = normalizedRequirement?.database;
  if (explicitResourceTypes.has("DYNAMODB_TABLE") && !explicitResourceTypes.has("RDS")) {
    database = "dynamodb";
    requiredResources.delete("RDS");
    requiredResources.delete("DB_SUBNET_GROUP");
    patternIds.delete("multi-az-rds");
  } else if (database !== "none" && answerProfile.backend !== "none") {
    patternIds.add("multi-az-rds");
    requiredResources.add("RDS");
  }

  applySecurityAndCostResourcePolicy({
    answerProfile,
    forbiddenCapabilities,
    patternIds,
    prompt,
    requiredResources
  });

  const finalPatternIds = ARCHITECTURE_PATTERN_IDS.filter((patternId) =>
    patternIds.has(patternId)
  );
  const finalRequiredResources = [...requiredResources];
  const plan: ArchitectureIntentPlan = {
    ...(normalizedRequirement?.intent === undefined ? {} : { intent: normalizedRequirement.intent }),
    ...(normalizedRequirement?.region === undefined ? {} : { region: normalizedRequirement.region }),
    patternIds: finalPatternIds,
    requiredResources: finalRequiredResources,
    ...(Object.keys(resourceQuantities).length === 0 ? {} : { resourceQuantities }),
    ...(forbiddenCapabilities.size === 0
      ? {}
      : { forbiddenCapabilities: [...forbiddenCapabilities] }),
    ...(normalizedRequirement?.runtimeTopology === undefined
      ? {}
      : { runtimeTopology: normalizedRequirement.runtimeTopology }),
    ...(database === undefined ? {} : { database }),
    ...(normalizedRequirement?.availability === undefined
      ? {}
      : { availability: normalizedRequirement.availability }),
    ...(normalizedRequirement?.amazonQBrief === undefined
      ? {}
      : { amazonQBrief: normalizedRequirement.amazonQBrief })
  };

  return finalPatternIds.length === 0 && finalRequiredResources.length === 0
    ? normalizedRequirement
    : plan;
}

function readPageAnswerProfile(value: unknown): ArchitecturePageAnswerProfile {
  if (!isRecord(value) || !isRecord(value.answerProfile)) {
    return {};
  }

  const answerProfile = value.answerProfile;
  const readText = (key: string): string | undefined =>
    typeof answerProfile[key] === "string" ? answerProfile[key] : undefined;

  return {
    availability: readText("availability"),
    backend: readText("backend"),
    budget: readText("budget"),
    frontend: readText("frontend"),
    management: readText("management"),
    realtime: readText("realtime"),
    traffic: readText("traffic"),
    upload: readText("upload")
  };
}

function applySecurityAndCostResourcePolicy(input: {
  readonly answerProfile: ArchitecturePageAnswerProfile;
  readonly forbiddenCapabilities: ReadonlySet<string>;
  readonly patternIds: ReadonlySet<ArchitecturePatternId>;
  readonly prompt: string;
  readonly requiredResources: Set<ResourceType>;
}): void {
  const { answerProfile, forbiddenCapabilities, patternIds, prompt, requiredResources } = input;
  const normalizedForbiddenCapabilities = new Set(
    [...forbiddenCapabilities].map((capability) => capability.toLowerCase())
  );
  const hasRuntime = ["alb-asg-ec2", "serverless-api", "ecs-fargate"].some((patternId) =>
    patternIds.has(patternId as ArchitecturePatternId)
  );
  const hasPublicEntry =
    !normalizedForbiddenCapabilities.has("load_balancer") &&
    ["alb-asg-ec2", "serverless-api", "spa-cloudfront-s3", "ecs-fargate"].some(
      (patternId) => patternIds.has(patternId as ArchitecturePatternId)
    );

  if (hasRuntime) {
    requiredResources.add("IAM_ROLE");
    requiredResources.add("IAM_POLICY");
    requiredResources.add("CLOUDWATCH_LOG_GROUP");
  }

  if (patternIds.has("multi-az-rds")) {
    requiredResources.add("SECRETS_MANAGER_SECRET");
    requiredResources.add("CLOUDWATCH_METRIC_ALARM");
  }

  if (hasPublicEntry && promptRequiresSsl(prompt)) {
    requiredResources.add("ACM_CERTIFICATE");
    requiredResources.add("ACM_CERTIFICATE_VALIDATION");
  }

  const needsCustomerManagedEncryption =
    answerProfile.budget === "enterprise" || /customer[-\s]*managed\s+kms|고객\s*관리형\s*kms/iu.test(prompt);
  if (
    needsCustomerManagedEncryption &&
    ["S3", "RDS", "DYNAMODB_TABLE"].some((resourceType) =>
      requiredResources.has(resourceType as ResourceType)
    )
  ) {
    requiredResources.add("KMS_KEY");
  }

  const shouldAddManagedWaf =
    hasPublicEntry &&
    answerProfile.budget === "enterprise" &&
    (answerProfile.traffic === "large" || answerProfile.traffic === "bursty");
  if (shouldAddManagedWaf) {
    requiredResources.add("WAF_WEB_ACL");
    requiredResources.add("WAF_WEB_ACL_ASSOCIATION");
  }
}

function findSupplementalExplicitResourceTypes(prompt: string): ResourceType[] {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const resourceTypes = new Set<ResourceType>();

  if (/(?:^|[^a-z0-9])eks(?:[^a-z0-9]|$)|kubernetes|쿠버네티스/iu.test(normalizedPrompt)) {
    resourceTypes.add("EKS_CLUSTER");
  }

  if (/managed\s+node\s+group|eks\s+node\s+group|노드\s*그룹/iu.test(normalizedPrompt)) {
    resourceTypes.add("EKS_NODE_GROUP");
  }

  if (/eks\s+add-?on|애드온/iu.test(normalizedPrompt)) {
    resourceTypes.add("EKS_ADDON");
  }

  if (/(?:^|[^a-z0-9])sqs(?:[^a-z0-9]|$)|simple\s+queue\s+service/iu.test(normalizedPrompt)) {
    resourceTypes.add("SQS_QUEUE");
  }

  if (/dynamodb/iu.test(normalizedPrompt)) {
    resourceTypes.add("DYNAMODB_TABLE");
  }

  if (/eventbridge/iu.test(normalizedPrompt)) {
    resourceTypes.add("EVENTBRIDGE_RULE");
    resourceTypes.add("EVENTBRIDGE_TARGET");
    resourceTypes.add("EVENTBRIDGE_PERMISSION");
  }

  if (/(?:^|[^a-z0-9])waf(?:[^a-z0-9]|$)|web\s+acl/iu.test(normalizedPrompt)) {
    resourceTypes.add("WAF_WEB_ACL");

    if (/association|연결|연동|적용/iu.test(normalizedPrompt)) {
      resourceTypes.add("WAF_WEB_ACL_ASSOCIATION");
    }
  }

  if (/secrets?\s+manager/iu.test(normalizedPrompt)) {
    resourceTypes.add("SECRETS_MANAGER_SECRET");
  }

  return [...resourceTypes];
}

function promptRequiresSsl(prompt: string): boolean {
  return /(?:ssl|https)[\s\S]{0,80}(?:required|security\s+important|필수|보안\s*중요)/iu.test(prompt);
}

function createSecurityAndCostNotes(
  requirement: ArchitectureIntentPlan | null
): string[] {
  const resources = new Set(requirement?.requiredResources ?? []);
  const notes = [
    "Security guardrail: use least-privilege IAM, private placement where supported, encrypted storage, secret-managed credentials, and bounded log retention.",
    "Cost guardrail: add redundancy and paid security services only when traffic, availability, security, or explicit requirements justify them."
  ];

  if (resources.has("ACM_CERTIFICATE")) {
    notes.push("Terminate public traffic with an ACM-managed TLS certificate and validate the certificate before deployment.");
  }

  if (resources.has("KMS_KEY")) {
    notes.push("A customer-managed KMS key is included because the enterprise security posture justifies its recurring key cost.");
  }

  if (resources.has("WAF_WEB_ACL")) {
    notes.push("WAF is included for a high-risk public entry path; account for Web ACL and request-processing charges.");
  }

  return notes;
}

function promptForbidsEc2(prompt: string): boolean {
  return /(?:(?:\b(?:no|without|exclude)\b)|do\s+not\s+use)[^.\n]{0,80}ec2|ec2[^.\n]{0,96}(?:not\s+needed|exclude|do\s+not\s+use|필요\s*없|사용하지\s*않|제외)/iu.test(
    prompt
  );
}

function promptForbidsLoadBalancer(prompt: string): boolean {
  return (
    /(?:(?:\b(?:no|without|exclude)\b)|do\s+not\s+use)[^.\n]{0,80}(?:alb|load\s+balancer)/iu.test(prompt) ||
    /(?:alb|load\s+balancer|로드\s*밸런서|외부\s*트래픽)[^.\n]{0,96}(?:not\s+needed|exclude|do\s+not\s+use|필요\s*없|사용하지\s*않|제외)/iu.test(
      prompt
    )
  );
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
