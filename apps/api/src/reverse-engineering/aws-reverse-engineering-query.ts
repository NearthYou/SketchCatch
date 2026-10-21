import { createHmac, createHash } from "node:crypto";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";

export type SignedAwsQueryInput = {
  service: "ec2" | "rds";
  region: string;
  action: string;
  version: string;
  credentials: TerraformAwsCredentialEnv;
  parameters?: Partial<Record<"NextToken" | "Marker", string>>;
};

/** gg: Action/Version과 allowlisted page token만 body에 넣어 AWS Query 요청을 서명합니다. */
export async function sendAwsQuery(
  input: SignedAwsQueryInput,
  fetchXml: typeof fetch
): Promise<string> {
  const parameters = new URLSearchParams({
    Action: input.action,
    Version: input.version
  });
  for (const [key, value] of Object.entries(input.parameters ?? {})) {
    if (
      (key !== "NextToken" && key !== "Marker") ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 16_384
    ) {
      throw new Error("Unsupported AWS Query pagination parameter.");
    }
    parameters.set(key, value);
  }
  const body = parameters.toString();
  const endpoint = `https://${input.service}.${input.region}.amazonaws.com/`;
  const signedHeaders = signAwsQueryRequest({
    ...input,
    endpoint,
    body
  });
  const response = await fetchXml(endpoint, {
    method: "POST",
    headers: signedHeaders,
    body
  });
  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`AWS ${input.service} ${input.action} failed: ${xml.slice(0, 240)}`);
  }

  return xml;
}

// AWS Query API에는 SDK 없이도 SigV4 서명이 필요해서, 요청마다 필요한 header를 직접 만듭니다.
function signAwsQueryRequest(input: SignedAwsQueryInput & { endpoint: string; body: string }) {
  const endpointUrl = new URL(input.endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host: endpointUrl.host,
    "x-amz-date": amzDate
  };

  if (input.credentials.AWS_SESSION_TOKEN) {
    headers["x-amz-security-token"] = input.credentials.AWS_SESSION_TOKEN;
  }

  const sortedHeaders = Object.entries(headers).sort(([left], [right]) => left.localeCompare(right));
  const canonicalHeaders = sortedHeaders.map(([key, value]) => `${key}:${value}`).join("\n");
  const signedHeaders = sortedHeaders.map(([key]) => key).join(";");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = createSigningKey(
    input.credentials.AWS_SECRET_ACCESS_KEY,
    dateStamp,
    input.region,
    input.service
  );
  const signature = hmacHex(signingKey, stringToSign);

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${input.credentials.AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

// AWS secret으로 날짜, 리전, 서비스가 반영된 서명 키를 만듭니다.
function createSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmacBuffer(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), dateStamp);
  const kRegion = hmacBuffer(kDate, region);
  const kService = hmacBuffer(kRegion, service);

  return hmacBuffer(kService, "aws4_request");
}

// HMAC 결과를 다음 서명 단계에서 쓸 Buffer로 반환합니다.
function hmacBuffer(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

// HMAC 결과를 Authorization header에 넣을 16진수 문자열로 반환합니다.
function hmacHex(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

// AWS canonical request에 필요한 SHA256 해시를 16진수 문자열로 반환합니다.
function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
