import assert from "node:assert/strict";
import { test } from "node:test";
import { sendAwsQuery } from "./aws-reverse-engineering-query.js";

test("sendAwsQuery omits x-amz-security-token when permanent credentials are used", async () => {
  let observedHeaders: HeadersInit | undefined;

  await sendAwsQuery(
    {
      service: "ec2",
      region: "ap-northeast-2",
      action: "DescribeVpcs",
      version: "2016-11-15",
      credentials: {
        AWS_ACCESS_KEY_ID: "access-key",
        AWS_SECRET_ACCESS_KEY: "secret-key",
        AWS_REGION: "ap-northeast-2"
      }
    },
    async (_url, init) => {
      observedHeaders = init?.headers;
      return new Response("<DescribeVpcsResponse />", { status: 200 });
    }
  );

  assert.equal(getHeaderValue(observedHeaders, "x-amz-security-token"), undefined);
  assert.doesNotMatch(getHeaderValue(observedHeaders, "authorization") ?? "", /x-amz-security-token/);
});

test("sendAwsQuery includes x-amz-security-token when temporary credentials are used", async () => {
  let observedHeaders: HeadersInit | undefined;

  await sendAwsQuery(
    {
      service: "ec2",
      region: "ap-northeast-2",
      action: "DescribeVpcs",
      version: "2016-11-15",
      credentials: {
        AWS_ACCESS_KEY_ID: "access-key",
        AWS_SECRET_ACCESS_KEY: "secret-key",
        AWS_SESSION_TOKEN: "session-token",
        AWS_REGION: "ap-northeast-2"
      }
    },
    async (_url, init) => {
      observedHeaders = init?.headers;
      return new Response("<DescribeVpcsResponse />", { status: 200 });
    }
  );

  assert.equal(getHeaderValue(observedHeaders, "x-amz-security-token"), "session-token");
  assert.match(getHeaderValue(observedHeaders, "authorization") ?? "", /x-amz-security-token/);
});

// Fetch HeadersInit은 object, tuple, Headers가 모두 가능해서 테스트에서 같은 방식으로 값을 꺼냅니다.
function getHeaderValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();

  if (Array.isArray(headers)) {
    return headers.find(([key]) => key.toLowerCase() === lowerName)?.[1];
  }

  return Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];
}
