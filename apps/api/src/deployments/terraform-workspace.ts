import { GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";

export const defaultTerraformArtifactMaxBytes = 1024 * 1024;
const defaultS3ArtifactDownloadMaxBytes = 20 * 1024 * 1024;

export type PrepareTerraformWorkspaceInput = {
  objectKey: string;
  fileName?: string | null;
};

export type PrepareTerraformWorkspaceOptions = {
  rootDir?: string;
  downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
  maxTerraformArtifactBytes?: number;
};

export type PreparedTerraformWorkspace = {
  workdir: string;
  mainFilePath: string;
  cleanup: () => Promise<void>;
};

export async function prepareTerraformWorkspace(
  input: PrepareTerraformWorkspaceInput,
  options: PrepareTerraformWorkspaceOptions = {}
): Promise<PreparedTerraformWorkspace> {
  const workdir = await mkdtemp(join(options.rootDir ?? tmpdir(), "sketchcatch-terraform-"));
  const fileName = toSafeTerraformFileName(input.fileName);
  const mainFilePath = join(workdir, fileName);

  try {
    const maxTerraformArtifactBytes =
      options.maxTerraformArtifactBytes ?? defaultTerraformArtifactMaxBytes;
    const downloadTerraformArtifact =
      options.downloadTerraformArtifact ??
      ((objectKey: string) =>
        downloadTerraformArtifactFromS3(objectKey, {
          maxBytes: maxTerraformArtifactBytes
        }));

    const content = await downloadTerraformArtifact(input.objectKey);
    const buffer = toBuffer(content);

    assertBufferSize(buffer, maxTerraformArtifactBytes);

    await writeFile(mainFilePath, buffer);

    return {
      workdir,
      mainFilePath,
      cleanup: () => rm(workdir, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function downloadTerraformArtifactFromS3(
  objectKey: string,
  options: { maxBytes?: number } = {}
): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? defaultS3ArtifactDownloadMaxBytes;
  const result = await getS3Client().send(
    new GetObjectCommand({
      Bucket: requireS3BucketName(),
      Key: objectKey
    })
  );

  if (typeof result.ContentLength === "number" && result.ContentLength > maxBytes) {
    throw new Error(`Terraform artifact exceeds the ${maxBytes} byte size limit`);
  }

  return s3BodyToBuffer(result.Body, maxBytes);
}

function toSafeTerraformFileName(fileName: string | null | undefined): string {
  const candidate = fileName?.split(/[\\/]/).at(-1)?.trim();

  if (!candidate || candidate === "." || candidate === ".." || !candidate.endsWith(".tf")) {
    return "main.tf";
  }

  const safeFileName = candidate.replace(/[^a-zA-Z0-9._-]/g, "_");

  return safeFileName || "main.tf";
}

function toBuffer(content: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(content)) {
    return content;
  }

  return Buffer.from(content);
}

async function s3BodyToBuffer(
  body: GetObjectCommandOutput["Body"],
  maxBytes: number
): Promise<Buffer> {
  if (!body) {
    throw new Error("S3 object body is empty");
  }

  if (typeof body === "string") {
    return assertBufferSize(Buffer.from(body), maxBytes);
  }

  if (body instanceof Uint8Array) {
    return assertBufferSize(Buffer.from(body), maxBytes);
  }

  if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return assertBufferSize(Buffer.from(await body.transformToByteArray()), maxBytes);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error(`Terraform artifact exceeds the ${maxBytes} byte size limit`);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function assertBufferSize(buffer: Buffer, maxBytes: number): Buffer {
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Terraform artifact exceeds the ${maxBytes} byte size limit`);
  }

  return buffer;
}
