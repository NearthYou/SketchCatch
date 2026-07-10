import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardArchitectureDraftRequest } from "./route";

test("Architecture Draft proxy preserves the backend Q response", async () => {
  let forwardedUrl = "";
  let forwardedBody = "";
  const request = new Request("http://localhost:3000/api/ai/architecture-draft", {
    body: JSON.stringify({ prompt: "Create a Fargate architecture" }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const response = await forwardArchitectureDraftRequest(request, {
    apiOrigin: "http://localhost:4000/",
    fetcher: async (input, init) => {
      forwardedUrl = String(input);
      forwardedBody = String(init?.body);
      return Response.json(
        { title: "ecs-fargate Architecture Draft", metadata: { source: "amazon_q" } },
        { status: 200 }
      );
    }
  });

  assert.equal(forwardedUrl, "http://localhost:4000/api/ai/architecture-draft");
  assert.deepEqual(JSON.parse(forwardedBody), { prompt: "Create a Fargate architecture" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    title: "ecs-fargate Architecture Draft",
    metadata: { source: "amazon_q" }
  });
});

test("Architecture Draft proxy preserves backend 503 JSON instead of replacing it with HTML", async () => {
  const request = new Request("http://localhost:3000/api/ai/architecture-draft", {
    body: JSON.stringify({ prompt: "Create an architecture" }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const response = await forwardArchitectureDraftRequest(request, {
    fetcher: async () =>
      Response.json(
        {
          error: "service_unavailable",
          message: "Amazon Q 아키텍처 생성에 실패했습니다. 잠시 후 다시 시도해주세요."
        },
        { status: 503 }
      )
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "service_unavailable",
    message: "Amazon Q 아키텍처 생성에 실패했습니다. 잠시 후 다시 시도해주세요."
  });
});
