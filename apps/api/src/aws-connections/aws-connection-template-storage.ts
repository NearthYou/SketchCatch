import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
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

export type CreateAwsImportTemplateObjectKeyInput = {
  connectionId: string;
  kind: "manager" | "policy";
  contractVersion: string;
  sha256: string;
};

export type CreateAwsImportTemplateUrlInput = {
  bucketName: string;
  region: string;
  objectKey: string;
};

export type AwsImportTemplateClock = () => Date;

export type AwsImportTemplateValidationOptions = {
  now?: AwsImportTemplateClock | undefined;
};

const awsImportPublishedTemplateMarker = Symbol("awsImportPublishedTemplate");

export type AwsImportPublishedTemplate = {
  readonly connectionId: string;
  readonly kind: "manager" | "policy";
  readonly contractVersion: string;
  readonly sha256: string;
  readonly objectKey: string;
  readonly baseUrl: string;
  readonly templateUrl: string;
  readonly expiresInSeconds: number;
  readonly [awsImportPublishedTemplateMarker]: true;
};

export type PublishAwsImportCloudFormationTemplateToS3Input = {
  bucketName: string;
  region: string;
  connectionId: string;
  kind: "manager" | "policy";
  contractVersion: string;
  templateBody: string;
  expiresInSeconds: number;
  now?: AwsImportTemplateClock | undefined;
  s3Client?: S3Client | undefined;
  signTemplateUrl?:
    | ((input: {
        s3Client: S3Client;
        command: GetObjectCommand;
        baseUrl: string;
        expiresInSeconds: number;
      }) => Promise<string>)
    | undefined;
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

/** gg: 가져오기 Template은 version과 본문 hash를 경로에 넣어 덮어쓸 수 없게 구분합니다. */
export function createAwsImportTemplateObjectKey({
  connectionId,
  kind,
  contractVersion,
  sha256
}: CreateAwsImportTemplateObjectKeyInput): string {
  assertSafeAwsImportTemplateSegment(connectionId, "connection ID");
  assertSafeAwsImportTemplateSegment(contractVersion, "contract version");

  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    throw new Error("AWS import template SHA-256 must be a lowercase hexadecimal digest");
  }

  return `aws-connections/${connectionId}/import-access/${kind}/v${contractVersion}/${sha256}.json`;
}

/** gg: presigned query가 회전해도 exact immutable S3 object 기준 주소는 고정합니다. */
export function createAwsImportTemplateUrl({
  bucketName,
  region,
  objectKey
}: CreateAwsImportTemplateUrlInput): string {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(bucketName)) {
    throw new Error("AWS import template bucket name is invalid");
  }

  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u.test(region)) {
    throw new Error("AWS import template region is invalid");
  }

  if (!/^aws-connections\/[A-Za-z0-9-]+\/import-access\/(?:manager|policy)\/v[A-Za-z0-9._-]+\/[a-f0-9]{64}\.json$/u.test(objectKey)) {
    throw new Error("AWS import template object key is invalid");
  }

  return bucketName.includes(".")
    ? `https://s3.${region}.amazonaws.com/${bucketName}/${objectKey}`
    : `https://${bucketName}.s3.${region}.amazonaws.com/${objectKey}`;
}

/** gg: private S3 Template을 조건부 저장하고 내부에서만 짧은 presigned URL을 발급합니다. */
export async function publishAwsImportCloudFormationTemplateToS3({
  bucketName,
  region,
  connectionId,
  kind,
  contractVersion,
  templateBody,
  expiresInSeconds,
  now = systemAwsImportTemplateClock,
  s3Client = getS3Client(),
  signTemplateUrl = defaultSignAwsImportTemplateUrl
}: PublishAwsImportCloudFormationTemplateToS3Input): Promise<AwsImportPublishedTemplate> {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
    throw new Error("AWS import template presigned URL expiry must be between 1 and 900 seconds");
  }

  const sha256 = createHash("sha256").update(templateBody).digest("hex");
  const objectKey = createAwsImportTemplateObjectKey({
    connectionId,
    kind,
    contractVersion,
    sha256
  });
  const baseUrl = createAwsImportTemplateUrl({ bucketName, region, objectKey });

  const existingConflict = await putImmutableAwsImportTemplate({
    s3Client,
    bucketName,
    objectKey,
    templateBody
  });
  if (existingConflict) {
    const existing = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: objectKey })
    );
    const existingBody = await readAwsImportTemplateBody(existing.Body);
    const existingHash = createHash("sha256").update(existingBody).digest("hex");

    if (existingBody !== templateBody || existingHash !== sha256) {
      throw new Error(`Immutable AWS import template object does not match: ${objectKey}`, {
        cause: existingConflict
      });
    }
  }

  const command = new GetObjectCommand({ Bucket: bucketName, Key: objectKey });
  const templateUrl = await signTemplateUrl({
    s3Client,
    command,
    baseUrl,
    expiresInSeconds
  });
  assertAwsImportPresignedTemplateUrl({ baseUrl, templateUrl, expiresInSeconds, region, now });

  return Object.freeze({
    connectionId,
    kind,
    contractVersion,
    sha256,
    objectKey,
    baseUrl,
    templateUrl,
    expiresInSeconds,
    [awsImportPublishedTemplateMarker]: true as const
  });
}

/** gg: Create/Update에는 exact object와 pinned SigV4 query 모양의 URL만 허용합니다. */
export function assertAwsImportPresignedTemplateUrl(input: {
  baseUrl: string;
  templateUrl: string;
  expiresInSeconds: number;
  region: string;
  now?: AwsImportTemplateClock | undefined;
}): void {
  if (
    !Number.isInteger(input.expiresInSeconds) ||
    input.expiresInSeconds < 1 ||
    input.expiresInSeconds > 900
  ) {
    throw new Error("AWS import presigned template expiry is invalid");
  }

  const base = new URL(input.baseUrl);
  const signed = new URL(input.templateUrl);

  if (
    signed.origin !== base.origin ||
    signed.pathname !== base.pathname ||
    signed.username ||
    signed.password ||
    signed.hash
  ) {
    throw new Error("AWS import presigned template object URL does not match");
  }

  const params = signed.searchParams;
  const keys = [...params.keys()];
  const expectedWithoutSessionToken = [
    "X-Amz-Algorithm",
    "X-Amz-Content-Sha256",
    "X-Amz-Credential",
    "X-Amz-Date",
    "X-Amz-Expires",
    "X-Amz-Signature",
    "X-Amz-SignedHeaders",
    "x-amz-checksum-mode",
    "x-id"
  ];
  const expectedWithSessionToken = [
    ...expectedWithoutSessionToken.slice(0, 5),
    "X-Amz-Security-Token",
    ...expectedWithoutSessionToken.slice(5)
  ];

  if (
    !sameStrings(keys, expectedWithoutSessionToken) &&
    !sameStrings(keys, expectedWithSessionToken)
  ) {
    throw new Error("AWS import presigned template query shape is invalid");
  }

  const credential = params.get("X-Amz-Credential") ?? "";
  const signatureDate = params.get("X-Amz-Date") ?? "";
  const signatureTime = parseAwsSigV4Date(signatureDate);
  const credentialPattern = new RegExp(
    `^[^/]+/\\d{8}/${escapeRegularExpression(input.region)}/s3/aws4_request$`,
    "u"
  );

  if (
    params.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" ||
    params.get("X-Amz-Content-Sha256") !== "UNSIGNED-PAYLOAD" ||
    !credentialPattern.test(credential) ||
    signatureTime === undefined ||
    params.get("X-Amz-Expires") !== String(input.expiresInSeconds) ||
    !/^[a-f0-9]{64}$/u.test(params.get("X-Amz-Signature") ?? "") ||
    params.get("X-Amz-SignedHeaders") !== "host" ||
    params.get("x-amz-checksum-mode") !== "ENABLED" ||
    params.get("x-id") !== "GetObject" ||
    (params.has("X-Amz-Security-Token") && !params.get("X-Amz-Security-Token"))
  ) {
    throw new Error("AWS import presigned template query values are invalid");
  }

  const nowTime = (input.now ?? systemAwsImportTemplateClock)().getTime();
  if (!Number.isFinite(nowTime)) {
    throw new Error("AWS import presigned template validation clock is invalid");
  }

  // gg: 서명 host보다 API clock이 최대 5분 빠른 경우만 발급 직후 clock skew로 허용합니다.
  const maximumFutureClockSkewMilliseconds = 5 * 60 * 1000;
  if (signatureTime > nowTime + maximumFutureClockSkewMilliseconds) {
    throw new Error("AWS import presigned template signature date is too far in the future");
  }

  if (signatureTime + input.expiresInSeconds * 1000 <= nowTime) {
    throw new Error("AWS import presigned template URL has expired");
  }
}

/** gg: IAM StringLike는 exact object 뒤 pinned SDK가 만드는 두 SigV4 query 모양만 받습니다. */
export function getAwsImportPresignedTemplateUrlPatterns(baseUrl: string): string[] {
  const prefix =
    `${baseUrl}` +
    "${?}" +
    "X-Amz-Algorithm=AWS4-HMAC-SHA256&" +
    "X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=*&X-Amz-Date=*&X-Amz-Expires=*&";
  const suffix =
    "X-Amz-Signature=*&X-Amz-SignedHeaders=host&" +
    "x-amz-checksum-mode=ENABLED&x-id=GetObject";

  return [prefix + suffix, prefix + "X-Amz-Security-Token=*&" + suffix];
}

/** gg: 동시 조건부 Put의 409는 짧게 재시도하고, 412 winner만 본문 검증으로 넘깁니다. */
async function putImmutableAwsImportTemplate(input: {
  s3Client: S3Client;
  bucketName: string;
  objectKey: string;
  templateBody: string;
}): Promise<unknown | undefined> {
  const maximumConflictRetries = 3;

  for (let attempt = 0; attempt <= maximumConflictRetries; attempt += 1) {
    try {
      await input.s3Client.send(
        new PutObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          Body: input.templateBody,
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
          IfNoneMatch: "*"
        })
      );
      return undefined;
    } catch (error) {
      if (isS3PreconditionFailure(error)) return error;
      if (isS3ConditionalRequestConflict(error) && attempt < maximumConflictRetries) continue;
      throw error;
    }
  }

  throw new Error("AWS import template conditional write retry limit was exceeded");
}

/** gg: request builder가 caller 문자열이 아닌 이 storage가 발급한 exact Template만 쓰는지 확인합니다. */
export function assertAwsImportPublishedTemplateMatches(
  published: AwsImportPublishedTemplate,
  expected: {
    connectionId: string;
    kind: "manager" | "policy";
    contractVersion: string;
    sha256: string;
    objectKey: string;
    baseUrl: string;
    region: string;
  },
  options: AwsImportTemplateValidationOptions = {}
): void {
  if (
    !published ||
    published[awsImportPublishedTemplateMarker] !== true ||
    published.connectionId !== expected.connectionId ||
    published.kind !== expected.kind ||
    published.contractVersion !== expected.contractVersion ||
    published.sha256 !== expected.sha256 ||
    published.objectKey !== expected.objectKey ||
    published.baseUrl !== expected.baseUrl
  ) {
    throw new Error("AWS import published template does not match the approved contract");
  }

  assertAwsImportPresignedTemplateUrl({
    baseUrl: expected.baseUrl,
    templateUrl: published.templateUrl,
    expiresInSeconds: published.expiresInSeconds,
    region: expected.region,
    now: options.now
  });
}

/** gg: pinned AWS signer 호출을 한곳에 두어 caller URL 입력 경로를 만들지 않습니다. */
async function defaultSignAwsImportTemplateUrl(input: {
  s3Client: S3Client;
  command: GetObjectCommand;
  expiresInSeconds: number;
}): Promise<string> {
  return getSignedUrl(input.s3Client, input.command, { expiresIn: input.expiresInSeconds });
}

/** gg: 기본 검증 clock은 호출 시점의 실제 시간을 읽고 테스트에서는 같은 seam을 주입합니다. */
function systemAwsImportTemplateClock(): Date {
  return new Date();
}

/** gg: SigV4 basic timestamp를 calendar rollover 없이 epoch millisecond로 바꿉니다. */
function parseAwsSigV4Date(value: string): number | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(value);
  if (!match) return undefined;

  const isoTimestamp =
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
  const milliseconds = Date.parse(isoTimestamp);
  if (!Number.isFinite(milliseconds)) return undefined;

  const normalized = new Date(milliseconds)
    .toISOString()
    .replace(/[-:]|\.000/gu, "");
  return normalized === value ? milliseconds : undefined;
}

/** gg: 조건부 Put 충돌만 immutable object 재검증 경로로 보냅니다. */
function isS3PreconditionFailure(error: unknown): boolean {
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate?.name === "PreconditionFailed" || candidate?.$metadata?.httpStatusCode === 412;
}

/** gg: S3 conditional write 경합의 retryable 409만 별도로 식별합니다. */
function isS3ConditionalRequestConflict(error: unknown): boolean {
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    candidate?.name === "ConditionalRequestConflict" || candidate?.$metadata?.httpStatusCode === 409
  );
}

/** gg: 이미 존재하는 object의 실제 본문을 읽어 hash-addressed key 충돌을 확인합니다. */
async function readAwsImportTemplateBody(body: unknown): Promise<string> {
  if (
    body &&
    typeof body === "object" &&
    "transformToString" in body &&
    typeof body.transformToString === "function"
  ) {
    return body.transformToString();
  }

  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  throw new Error("Existing immutable AWS import template body is unavailable");
}

/** gg: presign query key의 순서와 중복까지 pinned SDK 출력과 같게 확인합니다. */
function sameStrings(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

/** gg: region을 presigned credential 정규식에 안전하게 넣습니다. */
function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** gg: connection별 object key에 경로 이동 문자가 들어오지 않도록 막습니다. */
function assertSafeAwsImportTemplateSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error(`AWS import template ${label} is invalid`);
  }
}
