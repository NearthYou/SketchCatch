import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ProjectAssetType } from "@sketchcatch/types";
import { getS3Client } from "../../s3/client.js";

export type BuildProjectAssetObjectKeyInput = {
  assetId: string;
  assetType: ProjectAssetType;
  fileName: string;
  projectId: string;
};

export type CreateProjectAssetUploadInput = {
  bucketName: string;
  contentType: string;
  objectKey: string;
  expiresInSeconds?: number | undefined;
  s3Client?: S3Client | undefined;
};

export function buildProjectAssetObjectKey({
  assetId,
  assetType,
  fileName,
  projectId
}: BuildProjectAssetObjectKeyInput): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  return `projects/${projectId}/assets/${assetType}/${assetId}-${safeFileName}`;
}

export async function createProjectAssetUpload({
  bucketName,
  contentType,
  objectKey,
  expiresInSeconds = 900,
  s3Client = getS3Client()
}: CreateProjectAssetUploadInput) {
  const url = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType
    }),
    { expiresIn: expiresInSeconds }
  );

  return {
    method: "PUT" as const,
    url,
    headers: {
      "Content-Type": contentType
    },
    expiresInSeconds
  };
}
