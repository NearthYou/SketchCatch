export type RuntimeEnv = {
  awsRegion: string;
  databaseUrl: string | undefined;
  databaseSsl: boolean;
  s3BucketName: string | undefined;
};

export function getRuntimeEnv(): RuntimeEnv {
  return {
    awsRegion: process.env.AWS_REGION ?? "ap-northeast-2",
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL === "true",
    s3BucketName: process.env.S3_BUCKET_NAME
  };
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
