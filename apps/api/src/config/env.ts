export type RuntimeEnv = {
  awsRegion: string;
  authTokenSecret: string | undefined;
  databaseUrl: string | undefined;
  databaseSsl: boolean;
  s3BucketName: string | undefined;
  sketchcatchAwsCallerPrincipalArn: string | undefined;
};

export function getRuntimeEnv(): RuntimeEnv {
  return {
    awsRegion: process.env.AWS_REGION ?? "ap-northeast-2",
    authTokenSecret: process.env.AUTH_TOKEN_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL === "true",
    s3BucketName: process.env.S3_BUCKET_NAME,
    sketchcatchAwsCallerPrincipalArn: process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN
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

export function requireSketchCatchAwsCallerPrincipalArn(): string {
  const callerPrincipalArn = process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN;

  if (!callerPrincipalArn) {
    throw new Error("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN is required");
  }

  return callerPrincipalArn;
}
