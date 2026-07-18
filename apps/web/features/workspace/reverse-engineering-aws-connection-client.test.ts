import assert from "node:assert/strict";
import test from "node:test";
import { listAwsConnections } from "./api";

test("Reverse Engineering은 명시적으로 미검증 AWS 연결을 함께 요청한다", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ awsConnections: [] }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  };

  await listAwsConnections({ includeUnverified: true });

  assert.match(requestedUrl, /\/aws\/connections\?includeUnverified=true$/);
});

test("일반 AWS 연결 조회는 기존 기본 경로를 유지한다", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ awsConnections: [] }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  };

  await listAwsConnections();

  assert.match(requestedUrl, /\/aws\/connections$/);
  assert.doesNotMatch(requestedUrl, /includeUnverified/);
});

test("AWS connection client never returns undefined across response envelope versions", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let responseBody: unknown = [{ id: "legacy-connection" }];
  globalThis.fetch = async () =>
    new Response(JSON.stringify(responseBody), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });

  const legacyConnections = await listAwsConnections();
  assert.deepEqual(
    legacyConnections.map((connection) => connection.id),
    ["legacy-connection"]
  );

  responseBody = {};
  assert.deepEqual(await listAwsConnections(), []);
});
