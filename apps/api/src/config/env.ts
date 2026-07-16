import "./load-env.js";
import {
  createLiveObservationCapability,
  type LiveObservationCapabilityKeyring
} from "../live-observations/live-observation-capability.js";

export type RuntimeEnv = {
  aiArchitectureRequirementNormalizer?: string | undefined;
  aiBillingMode?: string | undefined;
  aiDailyCallLimit?: string | undefined;
  aiRateLimitPerMinute?: string | undefined;
  amazonQApplicationId?: string | undefined;
  amazonQCreditConfirmed?: string | undefined;
  amazonQEnabled?: string | undefined;
  amazonQRegion?: string | undefined;
  amazonQRetrievalApplicationId?: string | undefined;
  amazonQUserId?: string | undefined;
  awsRegion: string;
  authTokenSecret: string | undefined;
  bedrockCreditConfirmed?: string | undefined;
  bedrockModelId?: string | undefined;
  cloudFormationTemplateTokenSecret: string | undefined;
  databaseUrl: string | undefined;
  databaseSsl: boolean;
  deploymentWorkerMode?: string | undefined;
  ecsWorkerAssignPublicIp?: string | undefined;
  ecsWorkerCluster?: string | undefined;
  ecsWorkerCommand?: string | undefined;
  ecsWorkerContainerName?: string | undefined;
  ecsWorkerEnvironment?: string | undefined;
  ecsWorkerSecurityGroupIds?: string | undefined;
  ecsWorkerSubnets?: string | undefined;
  ecsWorkerTaskDefinition?: string | undefined;
  githubOauthClientId: string | undefined;
  githubOauthClientSecret: string | undefined;
  githubAppId?: string | undefined;
  githubAppClientId?: string | undefined;
  githubAppClientSecret?: string | undefined;
  githubAppSlug?: string | undefined;
  githubAppPrivateKeyBase64?: string | undefined;
  githubAppCallbackUrl?: string | undefined;
  githubAppStateSecret?: string | undefined;
  kakaoOauthClientId: string | undefined;
  kakaoOauthClientSecret: string | undefined;
  liveObservationCapabilityCurrentKid?: string | undefined;
  liveObservationCapabilityCurrentSecret?: string | undefined;
  liveObservationCapabilityPreviousKid?: string | undefined;
  liveObservationCapabilityPreviousSecret?: string | undefined;
  liveObservationCapabilityPreviousStoppedIssuingAt?: string | undefined;
  liveObservationEnabled?: string | undefined;
  naverOauthClientId: string | undefined;
  naverOauthClientSecret: string | undefined;
  nodeEnv?: string | undefined;
  oauthRedirectBaseUrl: string | undefined;
  projectAssetStorageBackend?: string | undefined;
  projectAssetStorageRoot?: string | undefined;
  redisUrl?: string | undefined;
  s3BucketName: string | undefined;
  sketchcatchAwsCallerPrincipalArn: string | undefined;
  sketchcatchAwsCallerPrincipalArns?: string | undefined;
  sketchcatchPublicBaseUrl: string | undefined;
  transcribeCreditConfirmed?: string | undefined;
  transcribeLanguageCode?: string | undefined;
  transcribeMediaBucket?: string | undefined;
  webPushSubscriptionEncryptionKey?: string | undefined;
  webPushSubscriptionKeyId?: string | undefined;
  webPushVapidPrivateKey?: string | undefined;
  webPushVapidPublicKey?: string | undefined;
  webPushVapidSubject?: string | undefined;
};

const AUTH_TOKEN_SECRET_PLACEHOLDER = "replace-with-a-local-secret-of-at-least-32-characters";
const staticAwsCredentialEnvKeys = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN"
] as const;

export function getRuntimeEnv(): RuntimeEnv {
  return {
    aiArchitectureRequirementNormalizer: process.env.AI_ARCHITECTURE_REQUIREMENT_NORMALIZER,
    aiBillingMode: process.env.AI_BILLING_MODE,
    aiDailyCallLimit: process.env.AI_DAILY_CALL_LIMIT,
    aiRateLimitPerMinute: process.env.AI_RATE_LIMIT_PER_MINUTE,
    amazonQApplicationId: process.env.AMAZON_Q_APPLICATION_ID,
    amazonQCreditConfirmed: process.env.AMAZON_Q_CREDIT_CONFIRMED,
    amazonQEnabled: process.env.AMAZON_Q_ENABLED,
    amazonQRegion: process.env.AMAZON_Q_REGION,
    amazonQRetrievalApplicationId: process.env.AMAZON_Q_RETRIEVAL_APPLICATION_ID,
    amazonQUserId: process.env.AMAZON_Q_USER_ID,
    awsRegion: process.env.AWS_REGION ?? "ap-northeast-2",
    authTokenSecret: process.env.AUTH_TOKEN_SECRET,
    bedrockCreditConfirmed: process.env.BEDROCK_CREDIT_CONFIRMED,
    bedrockModelId: process.env.BEDROCK_MODEL_ID,
    cloudFormationTemplateTokenSecret: process.env.CLOUDFORMATION_TEMPLATE_TOKEN_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL === "true",
    deploymentWorkerMode: process.env.DEPLOYMENT_WORKER_MODE,
    ecsWorkerAssignPublicIp: process.env.ECS_WORKER_ASSIGN_PUBLIC_IP,
    ecsWorkerCluster: process.env.ECS_WORKER_CLUSTER,
    ecsWorkerCommand: process.env.ECS_WORKER_COMMAND,
    ecsWorkerContainerName: process.env.ECS_WORKER_CONTAINER_NAME,
    ecsWorkerEnvironment: process.env.ECS_WORKER_ENVIRONMENT,
    ecsWorkerSecurityGroupIds: process.env.ECS_WORKER_SECURITY_GROUP_IDS,
    ecsWorkerSubnets: process.env.ECS_WORKER_SUBNETS,
    ecsWorkerTaskDefinition: process.env.ECS_WORKER_TASK_DEFINITION,
    githubOauthClientId: process.env.GIT_OAUTH_CLIENT_ID,
    githubOauthClientSecret: process.env.GIT_OAUTH_CLIENT_SECRET,
    githubAppId: process.env.GIT_APP_ID,
    githubAppClientId: process.env.GIT_APP_CLIENT_ID,
    githubAppClientSecret: process.env.GIT_APP_CLIENT_SECRET,
    githubAppSlug: process.env.GIT_APP_SLUG,
    githubAppPrivateKeyBase64: process.env.GIT_APP_PRIVATE_KEY_BASE64,
    githubAppCallbackUrl: process.env.GIT_APP_CALLBACK_URL,
    githubAppStateSecret: process.env.GIT_APP_STATE_SECRET,
    kakaoOauthClientId: process.env.KAKAO_OAUTH_CLIENT_ID,
    kakaoOauthClientSecret: process.env.KAKAO_OAUTH_CLIENT_SECRET,
    liveObservationCapabilityCurrentKid:
      process.env.LIVE_OBSERVATION_CAPABILITY_CURRENT_KID,
    liveObservationCapabilityCurrentSecret:
      process.env.LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET,
    liveObservationCapabilityPreviousKid:
      process.env.LIVE_OBSERVATION_CAPABILITY_PREVIOUS_KID,
    liveObservationCapabilityPreviousSecret:
      process.env.LIVE_OBSERVATION_CAPABILITY_PREVIOUS_SECRET,
    liveObservationCapabilityPreviousStoppedIssuingAt:
      process.env.LIVE_OBSERVATION_CAPABILITY_PREVIOUS_STOPPED_ISSUING_AT,
    liveObservationEnabled: process.env.LIVE_OBSERVATION_ENABLED,
    naverOauthClientId: process.env.NAVER_OAUTH_CLIENT_ID,
    naverOauthClientSecret: process.env.NAVER_OAUTH_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    oauthRedirectBaseUrl: process.env.OAUTH_REDIRECT_BASE_URL,
    projectAssetStorageBackend: process.env.PROJECT_ASSET_STORAGE_BACKEND,
    projectAssetStorageRoot: process.env.PROJECT_ASSET_STORAGE_ROOT,
    redisUrl: process.env.REDIS_URL,
    s3BucketName: process.env.S3_BUCKET_NAME,
    sketchcatchAwsCallerPrincipalArn: process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN,
    sketchcatchAwsCallerPrincipalArns: process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARNS,
    sketchcatchPublicBaseUrl: process.env.SKETCHCATCH_PUBLIC_BASE_URL,
    transcribeCreditConfirmed: process.env.TRANSCRIBE_CREDIT_CONFIRMED,
    transcribeLanguageCode: process.env.TRANSCRIBE_LANGUAGE_CODE,
    transcribeMediaBucket: process.env.TRANSCRIBE_MEDIA_BUCKET,
    webPushSubscriptionEncryptionKey: process.env.WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY,
    webPushSubscriptionKeyId: process.env.WEB_PUSH_SUBSCRIPTION_KEY_ID,
    webPushVapidPrivateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    webPushVapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    webPushVapidSubject: process.env.WEB_PUSH_VAPID_SUBJECT
  };
}

export type WebPushRuntimeConfig = {
  subscriptionEncryptionKey: string;
  subscriptionKeyId: string;
  vapidPrivateKey: string;
  vapidPublicKey: string;
  vapidSubject: string;
};

export function getWebPushRuntimeConfig(
  env: RuntimeEnv = getRuntimeEnv()
): WebPushRuntimeConfig | null {
  const values = [
    env.webPushSubscriptionEncryptionKey,
    env.webPushVapidPrivateKey,
    env.webPushVapidPublicKey,
    env.webPushVapidSubject
  ];
  if (values.every((value) => !value?.trim())) return null;
  if (values.some((value) => !value?.trim())) {
    throw new Error("Web Push configuration must be complete");
  }
  const subscriptionKeyId = env.webPushSubscriptionKeyId?.trim() || "v1";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(subscriptionKeyId)) {
    throw new Error("WEB_PUSH_SUBSCRIPTION_KEY_ID is invalid");
  }
  return {
    subscriptionEncryptionKey: env.webPushSubscriptionEncryptionKey!.trim(),
    subscriptionKeyId,
    vapidPrivateKey: env.webPushVapidPrivateKey!.trim(),
    vapidPublicKey: env.webPushVapidPublicKey!.trim(),
    vapidSubject: env.webPushVapidSubject!.trim()
  };
}

export type DeploymentWorkerMode = "in_process" | "ecs";

export function isLiveObservationEnabled(env: RuntimeEnv = getRuntimeEnv()): boolean {
  return env.liveObservationEnabled?.trim().toLowerCase() === "true";
}

export function requireLiveObservationCapabilityKeyring(
  env: RuntimeEnv = getRuntimeEnv()
): LiveObservationCapabilityKeyring {
  try {
    const currentKid = requireCapabilityValue(env.liveObservationCapabilityCurrentKid);
    const currentSecret = requireCapabilityValue(env.liveObservationCapabilityCurrentSecret);
    const previousValues = [
      env.liveObservationCapabilityPreviousKid,
      env.liveObservationCapabilityPreviousSecret,
      env.liveObservationCapabilityPreviousStoppedIssuingAt
    ];
    const configuredPreviousValues = previousValues.map(isConfiguredCapabilityValue);
    const hasPrevious = configuredPreviousValues.some(Boolean);

    if (hasPrevious && !configuredPreviousValues.every(Boolean)) {
      throw capabilityConfigurationError();
    }

    const keyring: LiveObservationCapabilityKeyring = {
      current: {
        kid: currentKid,
        secret: currentSecret
      },
      ...(hasPrevious
        ? {
            previous: {
              kid: requireCapabilityValue(env.liveObservationCapabilityPreviousKid),
              secret: requireCapabilityValue(env.liveObservationCapabilityPreviousSecret),
              stoppedIssuingAt: requireCapabilityValue(
                env.liveObservationCapabilityPreviousStoppedIssuingAt
              )
            }
          }
        : {})
    };

    createLiveObservationCapability({ keyring });
    return keyring;
  } catch {
    throw capabilityConfigurationError();
  }
}

export type EcsWorkerDispatcherConfig = {
  assignPublicIp: "ENABLED" | "DISABLED";
  cluster: string;
  command: string[];
  containerName: string;
  environment: Record<string, string>;
  securityGroupIds: string[];
  subnetIds: string[];
  taskDefinition: string;
};

export function getDeploymentWorkerMode(env: RuntimeEnv = getRuntimeEnv()): DeploymentWorkerMode {
  const mode = env.deploymentWorkerMode?.trim() || "in_process";

  if (mode === "in_process" || mode === "ecs") {
    return mode;
  }

  throw new Error("DEPLOYMENT_WORKER_MODE must be one of: in_process, ecs");
}

export function requireEcsWorkerDispatcherConfig(
  env: RuntimeEnv = getRuntimeEnv()
): EcsWorkerDispatcherConfig {
  return {
    assignPublicIp: parseAssignPublicIp(env.ecsWorkerAssignPublicIp),
    cluster: requireNonEmptyEnv(env.ecsWorkerCluster, "ECS_WORKER_CLUSTER"),
    command: parseJsonStringArray(env.ecsWorkerCommand, "ECS_WORKER_COMMAND"),
    containerName: requireNonEmptyEnv(env.ecsWorkerContainerName, "ECS_WORKER_CONTAINER_NAME"),
    environment: parseJsonStringRecord(env.ecsWorkerEnvironment, "ECS_WORKER_ENVIRONMENT"),
    securityGroupIds: parseCommaSeparatedEnv(
      env.ecsWorkerSecurityGroupIds,
      "ECS_WORKER_SECURITY_GROUP_IDS"
    ),
    subnetIds: parseCommaSeparatedEnv(env.ecsWorkerSubnets, "ECS_WORKER_SUBNETS"),
    taskDefinition: requireNonEmptyEnv(
      env.ecsWorkerTaskDefinition,
      "ECS_WORKER_TASK_DEFINITION"
    )
  };
}

export function requireAuthTokenSecret(): string {
  const authTokenSecret = process.env.AUTH_TOKEN_SECRET;

  if (!authTokenSecret) {
    throw new Error("AUTH_TOKEN_SECRET is required");
  }

  if (authTokenSecret.length < 32) {
    throw new Error("AUTH_TOKEN_SECRET must be at least 32 characters");
  }

  if (authTokenSecret === AUTH_TOKEN_SECRET_PLACEHOLDER) {
    throw new Error("AUTH_TOKEN_SECRET must be changed from the example placeholder");
  }

  return authTokenSecret;
}

export function requireGitHubAppConfig(): {
  appId: string;
  appSlug: string;
  privateKey: string;
  callbackUrl: string;
} {
  const appId = process.env.GIT_APP_ID?.trim();
  const appSlug = process.env.GIT_APP_SLUG?.trim();
  const privateKeyBase64 = process.env.GIT_APP_PRIVATE_KEY_BASE64?.trim();
  const callbackUrl = process.env.GIT_APP_CALLBACK_URL?.trim();

  if (!appId) {
    throw new Error("GIT_APP_ID is required");
  }

  if (!appSlug) {
    throw new Error("GIT_APP_SLUG is required");
  }

  if (!privateKeyBase64) {
    throw new Error("GIT_APP_PRIVATE_KEY_BASE64 is required");
  }

  if (!callbackUrl) {
    throw new Error("GIT_APP_CALLBACK_URL is required");
  }

  let privateKey: string;

  try {
    privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");
  } catch {
    throw new Error("GIT_APP_PRIVATE_KEY_BASE64 must be valid base64");
  }

  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    throw new Error("GIT_APP_PRIVATE_KEY_BASE64 must decode to a PEM private key");
  }

  return { appId, appSlug, privateKey, callbackUrl };
}

export function requireGitHubAppStateSecret(): string {
  const stateSecret = process.env.GIT_APP_STATE_SECRET?.trim() || requireAuthTokenSecret();

  if (stateSecret.length < 32) {
    throw new Error("GIT_APP_STATE_SECRET must be at least 32 characters");
  }

  return stateSecret;
}

export function requireGitHubAppUserAuthorizationConfig(
  env: RuntimeEnv = getRuntimeEnv()
): { clientId: string; clientSecret: string; callbackUrl: string } {
  const clientId = env.githubAppClientId?.trim();
  const clientSecret = env.githubAppClientSecret?.trim();
  const setupCallbackUrl = env.githubAppCallbackUrl?.trim();

  if (!clientId) {
    throw new Error("GIT_APP_CLIENT_ID is required");
  }
  if (!clientSecret) {
    throw new Error("GIT_APP_CLIENT_SECRET is required");
  }
  if (!setupCallbackUrl) {
    throw new Error("GIT_APP_CALLBACK_URL is required");
  }

  let callbackUrl: string;
  try {
    callbackUrl = new URL(
      "/api/source-repositories/github/user-authorization/callback",
      setupCallbackUrl
    ).toString();
  } catch {
    throw new Error("GIT_APP_CALLBACK_URL must be a valid absolute URL");
  }
  return { clientId, clientSecret, callbackUrl };
}

export function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

export function requireS3BucketName(): string {
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME is required");
  }

  return bucketName;
}

export function requireCloudFormationTemplateTokenSecret(): string {
  const cloudFormationTemplateTokenSecret = process.env.CLOUDFORMATION_TEMPLATE_TOKEN_SECRET;

  if (!cloudFormationTemplateTokenSecret) {
    throw new Error("CLOUDFORMATION_TEMPLATE_TOKEN_SECRET is required");
  }

  if (cloudFormationTemplateTokenSecret.length < 32) {
    throw new Error("CLOUDFORMATION_TEMPLATE_TOKEN_SECRET must be at least 32 characters");
  }

  return cloudFormationTemplateTokenSecret;
}

export function requireSketchCatchAwsCallerPrincipalArn(): string {
  const callerPrincipalArn = process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN?.trim();

  if (!callerPrincipalArn) {
    throw new Error("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN is required");
  }

  if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(callerPrincipalArn)) {
    throw new Error("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN must be an IAM Role ARN");
  }

  return callerPrincipalArn;
}

export function requireSketchCatchAwsCallerPrincipalArns(): readonly [string, ...string[]] {
  const configuredPrincipalArns = process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARNS
    ?.split(",")
    .map((callerPrincipalArn) => callerPrincipalArn.trim())
    .filter(Boolean);
  const callerPrincipalArns = [
    requireSketchCatchAwsCallerPrincipalArn(),
    ...(configuredPrincipalArns ?? [])
  ].filter((callerPrincipalArn, index, values) => values.indexOf(callerPrincipalArn) === index);

  for (const callerPrincipalArn of callerPrincipalArns) {
    if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(callerPrincipalArn)) {
      throw new Error("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARNS must contain only IAM Role ARNs");
    }
  }

  return callerPrincipalArns as [string, ...string[]];
}

export function assertNoStaticAwsCredentialsForApiServer(
  env: NodeJS.ProcessEnv = process.env
): void {
  const configuredKeys = staticAwsCredentialEnvKeys.filter((key) => env[key]?.trim());

  if (configuredKeys.length === 0) {
    return;
  }

  throw new Error(
    [
      "Static AWS credentials are not allowed in the SketchCatch API process.",
      `Remove ${configuredKeys.join(", ")} and use AWS_PROFILE with IAM Identity Center locally,`,
      "or an IAM role on deployed runtime infrastructure."
    ].join(" ")
  );
}

function requireNonEmptyEnv(value: string | undefined, name: string): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    throw new Error(`${name} is required when DEPLOYMENT_WORKER_MODE=ecs`);
  }

  return trimmedValue;
}

function isConfiguredCapabilityValue(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function requireCapabilityValue(value: string | undefined): string {
  if (!isConfiguredCapabilityValue(value)) {
    throw capabilityConfigurationError();
  }

  return value;
}

function capabilityConfigurationError(): Error {
  return new Error("Invalid Live Observation capability configuration");
}

function parseCommaSeparatedEnv(value: string | undefined, name: string): string[] {
  const values = requireNonEmptyEnv(value, name)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error(`${name} must contain at least one value`);
  }

  return values;
}

function parseJsonStringArray(value: string | undefined, name: string): string[] {
  const rawValue = requireNonEmptyEnv(value, name);
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    throw new Error(`${name} must be a JSON array of strings`);
  }

  if (
    !Array.isArray(parsedValue) ||
    parsedValue.length === 0 ||
    parsedValue.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    throw new Error(`${name} must be a non-empty JSON array of non-empty strings`);
  }

  const stringValues = parsedValue as string[];
  return stringValues.map((entry) => entry.trim());
}

function parseJsonStringRecord(value: string | undefined, name: string): Record<string, string> {
  const rawValue = value?.trim();

  if (!rawValue) {
    return {};
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    throw new Error(`${name} must be a JSON object with string values`);
  }

  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue) ||
    Object.values(parsedValue).some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${name} must be a JSON object with string values`);
  }

  const stringRecord = parsedValue as Record<string, string>;
  return Object.fromEntries(
    Object.entries(stringRecord).map(([key, entry]) => [key, entry.trim()])
  );
}

function parseAssignPublicIp(value: string | undefined): "ENABLED" | "DISABLED" {
  const normalizedValue = value?.trim().toUpperCase();

  if (!normalizedValue) {
    return "DISABLED";
  }

  if (normalizedValue === "TRUE" || normalizedValue === "ENABLED") {
    return "ENABLED";
  }

  if (normalizedValue === "FALSE" || normalizedValue === "DISABLED") {
    return "DISABLED";
  }

  throw new Error("ECS_WORKER_ASSIGN_PUBLIC_IP must be ENABLED or DISABLED");
}
