import { S3Client } from "@aws-sdk/client-s3";
import { getRuntimeEnv } from "../config/env.js";

let s3Client: S3Client | undefined;

export function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const env = getRuntimeEnv();

  s3Client = new S3Client({
    region: env.awsRegion
  });

  return s3Client;
}
