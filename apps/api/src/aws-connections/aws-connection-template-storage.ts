import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "../s3/client.js";

export type PublishAwsConnectionCloudFormationTemplateToS3Input = {
  bucketName: string;
  connectionId: string;
  templateBody: string;
  expiresInSeconds: number;
  s3Client?: S3Client | undefined;
};

export type PublishAwsConnectionCloudFormationTemplateToS3Result = {
  objectKey: string;
  templateUrl: string;
};

const cloudFormationTemplateContentType = "application/x-yaml";

export async function publishAwsConnectionCloudFormationTemplateToS3({
  bucketName,
  connectionId,
  templateBody,
  expiresInSeconds,
  s3Client = getS3Client()
}: PublishAwsConnectionCloudFormationTemplateToS3Input): Promise<PublishAwsConnectionCloudFormationTemplateToS3Result> {
  const objectKey = buildAwsConnectionCloudFormationTemplateObjectKey(connectionId);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: templateBody,
      ContentType: cloudFormationTemplateContentType,
      ServerSideEncryption: "AES256"
    })
  );

  const templateUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    }),
    { expiresIn: expiresInSeconds }
  );

  return {
    objectKey,
    templateUrl
  };
}

export function buildAwsConnectionCloudFormationTemplateObjectKey(connectionId: string): string {
  return `aws-connections/${connectionId}/cloudformation-template.yaml`;
}
