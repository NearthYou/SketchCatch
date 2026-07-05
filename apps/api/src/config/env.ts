import "./load-env.js";

export type RuntimeEnv = {
  aiBillingMode?: string | undefined;
  aiDailyCallLimit?: string | undefined;
  aiRateLimitPerMinute?: string | undefined;
  amazonQApplicationId?: string | undefined;
  amazonQCreditConfirmed?: string | undefined;
  amazonQEnabled?: string | undefined;
  amazonQRegion?: string | undefined;
  amazonQUserId?: string | undefined;
  awsRegion: string;
  authTokenSecret: string | undefined;
  bedrockCreditConfirmed?: string | undefined;
  bedrockModelId?: string | undefined;
  cloudFormationTemplateTokenSecret: string | undefined;
  databaseUrl: string | undefined;
  databaseSsl: boolean;
  githubOauthClientId: string | undefined;
  githubOauthClientSecret: string | undefined;
  kakaoOauthClientId: string | undefined;
  kakaoOauthClientSecret: string | undefined;
  naverOauthClientId: string | undefined;
  naverOauthClientSecret: string | undefined;
  nodeEnv?: string | undefined;
  oauthRedirectBaseUrl: string | undefined;
  redisUrl?: string | undefined;
  s3BucketName: string | undefined;
  sketchcatchAwsCallerPrincipalArn: string | undefined;
  sketchcatchPublicBaseUrl: string | undefined;
  transcribeCreditConfirmed?: string | undefined;
  transcribeLanguageCode?: string | undefined;
  transcribeMediaBucket?: string | undefined;
};

const AUTH_TOKEN_SECRET_PLACEHOLDER = "replace-with-a-local-secret-of-at-least-32-characters";
const staticAwsCredentialEnvKeys = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN"
] as const;

export function getRuntimeEnv(): RuntimeEnv {
  return {
    aiBillingMode: process.env.AI_BILLING_MODE,
    aiDailyCallLimit: process.env.AI_DAILY_CALL_LIMIT,
    aiRateLimitPerMinute: process.env.AI_RATE_LIMIT_PER_MINUTE,
    amazonQApplicationId: process.env.AMAZON_Q_APPLICATION_ID,
    amazonQCreditConfirmed: process.env.AMAZON_Q_CREDIT_CONFIRMED,
    amazonQEnabled: process.env.AMAZON_Q_ENABLED,
    amazonQRegion: process.env.AMAZON_Q_REGION,
    amazonQUserId: process.env.AMAZON_Q_USER_ID,
    awsRegion: process.env.AWS_REGION ?? "ap-northeast-2",
    authTokenSecret: process.env.AUTH_TOKEN_SECRET,
    bedrockCreditConfirmed: process.env.BEDROCK_CREDIT_CONFIRMED,
    bedrockModelId: process.env.BEDROCK_MODEL_ID,
    cloudFormationTemplateTokenSecret: process.env.CLOUDFORMATION_TEMPLATE_TOKEN_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL === "true",
    githubOauthClientId: process.env.GIT_OAUTH_CLIENT_ID,
    githubOauthClientSecret: process.env.GIT_OAUTH_CLIENT_SECRET,
    kakaoOauthClientId: process.env.KAKAO_OAUTH_CLIENT_ID,
    kakaoOauthClientSecret: process.env.KAKAO_OAUTH_CLIENT_SECRET,
    naverOauthClientId: process.env.NAVER_OAUTH_CLIENT_ID,
    naverOauthClientSecret: process.env.NAVER_OAUTH_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    oauthRedirectBaseUrl: process.env.OAUTH_REDIRECT_BASE_URL,
    redisUrl: process.env.REDIS_URL,
    s3BucketName: process.env.S3_BUCKET_NAME,
    sketchcatchAwsCallerPrincipalArn: process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN,
    sketchcatchPublicBaseUrl: process.env.SKETCHCATCH_PUBLIC_BASE_URL,
    transcribeCreditConfirmed: process.env.TRANSCRIBE_CREDIT_CONFIRMED,
    transcribeLanguageCode: process.env.TRANSCRIBE_LANGUAGE_CODE,
    transcribeMediaBucket: process.env.TRANSCRIBE_MEDIA_BUCKET
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
