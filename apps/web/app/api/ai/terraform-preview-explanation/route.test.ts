import assert from "node:assert/strict";
import test from "node:test";
import { forwardTerraformPreviewExplanationRequest } from "./route";

test("에이전트 리뷰 프록시는 Terraform 설명 API 응답을 그대로 전달한다", async () => {
  let forwardedUrl = "";
  let forwardedBody = "";
  const response = await forwardTerraformPreviewExplanationRequest(
    new Request("http://sketchcatch.local/api/ai/terraform-preview-explanation", {
      body: JSON.stringify({ terraformCode: 'resource "aws_s3_bucket" "assets" {}' }),
      headers: { "content-type": "application/json" },
      method: "POST"
    }),
    {
      apiOrigin: "http://api.internal",
      fetcher: async (url, init) => {
        forwardedUrl = String(url);
        forwardedBody = String(init?.body ?? "");

        return Response.json(
          { ok: true },
          { headers: { "x-request-id": "req-review-proxy" }, status: 200 }
        );
      }
    }
  );

  assert.equal(forwardedUrl, "http://api.internal/api/ai/terraform-preview-explanation");
  assert.deepEqual(JSON.parse(forwardedBody), {
    terraformCode: 'resource "aws_s3_bucket" "assets" {}'
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "req-review-proxy");
  assert.deepEqual(await response.json(), { ok: true });
});
