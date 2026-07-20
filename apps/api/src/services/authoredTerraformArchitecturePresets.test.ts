import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createAmazonQArchitectureDraftResponse } from "./aiArchitectureDrafts.js";

import { generateTerraformFromDiagramJson } from "./terraform/terraform-preview.js";

const prompt = "데모용 실시간 배포 사이트의 다이어그램 만들어줘.";
const creditPolicy = {
  bedrock: false,
  amazonQ: true,
  transcribe: false,
  billingMode: "aws_credit_only"
} as const;

test("the realtime deployment demo prompt keeps questions but always returns the attached Terraform", async () => {
  const clarification = await createAmazonQArchitectureDraftResponse(prompt, { creditPolicy });

  assert.equal("status" in clarification ? clarification.status : null, "needs_clarification");
  assert.equal("questionId" in clarification ? clarification.questionId : null, "website_type");

  const extendedPrompt = await createAmazonQArchitectureDraftResponse(
    `${prompt}. 그리고 사용자가 덧붙인 자연어 요구를 우선해줘`,
    { creditPolicy }
  );
  assert.equal("status" in extendedPrompt ? extendedPrompt.status : null, "needs_clarification");

  let providerCalls = 0;
  const provider = {
    provider: "amazon_q" as const,
    service: "amazon_q_business" as const,
    model: "must-not-run",
    generate: async () => {
      providerCalls += 1;
      throw new Error("The hardcoded demo must not call Amazon Q");
    }
  };
  const completeWithSuggestion = async (suggestionIndex: "first" | "last") => {
    const clarificationAnswers: Array<{ questionId: string; answer: string }> = [];

    for (let questionCount = 0; questionCount < 7; questionCount += 1) {
      const response = await createAmazonQArchitectureDraftResponse(
        { prompt, clarificationAnswers },
        { creditPolicy, provider }
      );
      if (!("status" in response)) return response;
      const answer = suggestionIndex === "first"
        ? response.suggestions[0]
        : response.suggestions.at(-1);
      assert.ok(answer);
      clarificationAnswers.push({ questionId: response.questionId, answer });
    }

    assert.fail("The six required questions did not converge to the hardcoded demo result");
  };
  const first = await completeWithSuggestion("first");
  const second = await completeWithSuggestion("last");

  assert.equal(providerCalls, 0);
  assert.equal("status" in first, false);
  assert.equal("status" in second, false);
  if ("status" in first || "status" in second) return;

  assert.deepEqual(first.diagramJson, second.diagramJson);
  assert.equal(first.metadata.authoredSourceId, "audience-live-check");
  assert.ok(first.diagramJson);
  const terraform = generateTerraformFromDiagramJson(first.diagramJson);

  const expectedTerraform = readFileSync(
    new URL("./fixtures/audience-live-check-demo.tf", import.meta.url),
    "utf8"
  );
  assert.equal(terraform, expectedTerraform);
  assert.equal(first.diagramJson.nodes.length, 40);
  assert.match(terraform, /resource "aws_ecs_service" "ecs_service_fixed_template_fargate_container_app"/u);
  assert.match(terraform, /resource "aws_cloudfront_distribution" "cdn_web"/u);
  assert.match(terraform, /resource "aws_secretsmanager_secret" "check_in_signing"/u);
});
