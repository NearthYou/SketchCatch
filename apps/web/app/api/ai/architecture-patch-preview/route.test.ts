import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardArchitecturePatchPreviewRequest } from "./route";

test("Architecture Patch Preview proxy forwards edit requests to the backend patch endpoint", async () => {
  let forwardedUrl = "";
  let forwardedBody = "";
  const requestBody = {
    architectureJson: { nodes: [], edges: [] },
    instruction: "add an S3 bucket"
  };
  const request = new Request("http://localhost:3000/api/ai/architecture-patch-preview", {
    body: JSON.stringify(requestBody),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const response = await forwardArchitecturePatchPreviewRequest(request, {
    apiOrigin: "http://localhost:4000/",
    fetcher: async (input, init) => {
      forwardedUrl = String(input);
      forwardedBody = String(init?.body);

      return Response.json(
        {
          status: "preview",
          changes: [{ action: "add_resource", resourceType: "S3", summary: "S3 bucket added." }]
        },
        { status: 200 }
      );
    }
  });

  assert.equal(forwardedUrl, "http://localhost:4000/api/ai/architecture-patch-preview");
  assert.deepEqual(JSON.parse(forwardedBody), requestBody);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "preview",
    changes: [{ action: "add_resource", resourceType: "S3", summary: "S3 bucket added." }]
  });
});

test("Architecture Patch Preview proxy preserves backend clarification responses", async () => {
  const request = new Request("http://localhost:3000/api/ai/architecture-patch-preview", {
    body: JSON.stringify({
      architectureJson: { nodes: [], edges: [] },
      instruction: "change the bucket"
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const response = await forwardArchitecturePatchPreviewRequest(request, {
    fetcher: async () =>
      Response.json(
        {
          status: "needs_clarification",
          question: "Which bucket should be changed?",
          candidates: []
        },
        { status: 200 }
      )
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "needs_clarification",
    question: "Which bucket should be changed?",
    candidates: []
  });
});
