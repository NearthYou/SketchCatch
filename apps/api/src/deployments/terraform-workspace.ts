import { GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TerraformArtifactBundle } from "@sketchcatch/types";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";

export const defaultTerraformArtifactMaxBytes = 1024 * 1024;
const defaultS3ArtifactDownloadMaxBytes = 20 * 1024 * 1024;

export type PrepareTerraformWorkspaceInput = {
  objectKey: string;
  fileName?: string | null;
  contentType?: string | null;
};

export type PrepareTerraformWorkspaceOptions = {
  rootDir?: string;
  downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
  maxTerraformArtifactBytes?: number;
};

export type PreparedTerraformWorkspace = {
  workdir: string;
  mainFilePath: string;
  terraformFiles: TerraformArtifactBundle["files"];
  cleanup: () => Promise<void>;
};

export async function prepareTerraformWorkspace(
  input: PrepareTerraformWorkspaceInput,
  options: PrepareTerraformWorkspaceOptions = {}
): Promise<PreparedTerraformWorkspace> {
  const workdir = await mkdtemp(join(options.rootDir ?? tmpdir(), "sketchcatch-terraform-"));
  const fileName = toSafeTerraformFileName(input.fileName);
  let mainFilePath = join(workdir, fileName);
  let terraformFiles: TerraformArtifactBundle["files"];

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
    if (isTerraformArtifactBundle(input)) {
      const bundle = parseTerraformArtifactBundle(buffer.toString("utf8"));
      terraformFiles = bundle.files;
      await Promise.all(
        bundle.files.map((file) => writeFile(join(workdir, file.fileName), file.terraformCode))
      );
      mainFilePath = join(workdir, ".sketchcatch-artifact.txt");
      await writeFile(mainFilePath, createTerraformBundleCanonicalContent(bundle));
    } else {
      terraformFiles = [{ fileName, terraformCode: buffer.toString("utf8") }];
      await writeFile(mainFilePath, buffer);
    }

    return {
      workdir,
      mainFilePath,
      terraformFiles,
      cleanup: () => rm(workdir, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

// Plan과 승인 단계가 같은 artifact를 같은 byte로 비교하도록 정규화합니다.
export function createTerraformArtifactCanonicalContent(
  input: PrepareTerraformWorkspaceInput,
  content: Buffer | Uint8Array | string
): Buffer {
  const buffer = toBuffer(content);

  if (!isTerraformArtifactBundle(input)) {
    return buffer;
  }

  return createTerraformBundleCanonicalContent(
    parseTerraformArtifactBundle(buffer.toString("utf8"))
  );
}

// Hash용 JSON과 분리해 실제 Terraform 코드만 안전 검사에 전달합니다.
export function createTerraformArtifactSafetyContent(
  input: PrepareTerraformWorkspaceInput,
  content: Buffer | Uint8Array | string
): string {
  const buffer = toBuffer(content);

  if (!isTerraformArtifactBundle(input)) {
    return buffer.toString("utf8");
  }

  return createTerraformFilesSafetyContent(
    parseTerraformArtifactBundle(buffer.toString("utf8")).files,
    ""
  );
}

// 여러 파일의 원문을 모두 이어 안전 검사에서 빠지는 파일이 없게 합니다.
export function createTerraformFilesSafetyContent(
  files: TerraformArtifactBundle["files"],
  fallbackContent: Buffer | Uint8Array | string
): string {
  const terraformFiles = files.filter((file) => file.fileName.endsWith(".tf"));

  return terraformFiles.length > 0
    ? terraformFiles.map((file) => file.terraformCode).join("\n")
    : toBuffer(fallbackContent).toString("utf8");
}

// 여러 Terraform 파일 artifact인지 content type과 저장 파일명으로 판별합니다.
function isTerraformArtifactBundle(input: PrepareTerraformWorkspaceInput): boolean {
  return (
    input.contentType === "application/vnd.sketchcatch.terraform-files+json" ||
    input.fileName === "terraform-files.json"
  );
}

// 외부 저장소에서 받은 bundle을 안전한 .tf/.tftpl 파일 목록으로 검증합니다.
export function parseTerraformArtifactBundle(content: string): TerraformArtifactBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Terraform artifact bundle is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Terraform artifact bundle must be an object");
  }
  const candidate = parsed as { schemaVersion?: unknown; files?: unknown };
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.files)) {
    throw new Error("Terraform artifact bundle schema is not supported");
  }
  if (candidate.files.length === 0 || candidate.files.length > 100) {
    throw new Error("Terraform artifact bundle must contain 1 to 100 files");
  }

  const fileNames = new Set<string>();
  const files = candidate.files.map((file): TerraformArtifactBundle["files"][number] => {
    if (!file || typeof file !== "object") {
      throw new Error("Terraform artifact bundle file is invalid");
    }
    const fileCandidate = file as { fileName?: unknown; terraformCode?: unknown };
    if (typeof fileCandidate.fileName !== "string" || typeof fileCandidate.terraformCode !== "string") {
      throw new Error("Terraform artifact bundle file fields are invalid");
    }
    const safeFileName = toSafeTerraformBundleFileName(fileCandidate.fileName);
    if (!safeFileName || safeFileName !== fileCandidate.fileName || fileNames.has(safeFileName)) {
      throw new Error("Terraform artifact bundle contains an unsafe or duplicate file name");
    }
    fileNames.add(safeFileName);
    return { fileName: safeFileName, terraformCode: fileCandidate.terraformCode };
  });

  if (!files.some((file) => file.fileName.endsWith(".tf"))) {
    throw new Error("Terraform artifact bundle must contain at least one .tf file");
  }

  return { schemaVersion: 1, files };
}

// 파일 경계와 순서를 포함해 bundle의 hash 기준 문자열을 만듭니다.
function createTerraformBundleCanonicalContent(bundle: TerraformArtifactBundle): Buffer {
  return Buffer.from(JSON.stringify(bundle));
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

function toSafeTerraformBundleFileName(fileName: string): string | null {
  const candidate = fileName.trim();

  if (
    !candidate ||
    candidate === "." ||
    candidate === ".." ||
    candidate.includes("/") ||
    candidate.includes("\\") ||
    (!candidate.endsWith(".tf") && !candidate.endsWith(".tftpl"))
  ) {
    return null;
  }

  const safeFileName = candidate.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeFileName === candidate ? safeFileName : null;
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
