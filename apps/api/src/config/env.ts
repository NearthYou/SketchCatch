export type RuntimeEnv = {
  awsRegion: string;
  authTokenSecret: string | undefined;
  cloudFormationTemplateTokenSecret: string | undefined;
  databaseUrl: string | undefined;
  databaseSsl: boolean;
  s3BucketName: string | undefined;
  sketchcatchAwsCallerPrincipalArn: string | undefined;
  sketchcatchPublicBaseUrl: string | undefined;
};

const AUTH_TOKEN_SECRET_PLACEHOLDER = "replace-with-a-local-secret-of-at-least-32-characters";

export function getRuntimeEnv(): RuntimeEnv {
  return {
    awsRegion: process.env.AWS_REGION ?? "ap-northeast-2",
    authTokenSecret: process.env.AUTH_TOKEN_SECRET,
    cloudFormationTemplateTokenSecret: process.env.CLOUDFORMATION_TEMPLATE_TOKEN_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL === "true",
    s3BucketName: process.env.S3_BUCKET_NAME,
    sketchcatchAwsCallerPrincipalArn: process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN,
    sketchcatchPublicBaseUrl: process.env.SKETCHCATCH_PUBLIC_BASE_URL
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
