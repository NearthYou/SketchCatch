import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createAmazonQArchitectureDraftResponse } from "./aiArchitectureDrafts.js";
import { AUDIENCE_LIVE_CHECK_MANUAL_DIAGRAM } from "./audienceLiveCheckManualDiagram.js";

import { generateTerraformFromDiagramJson } from "./terraform/terraform-preview.js";
import { syncTerraformToDiagramJson } from "./terraform/terraform-to-diagram.js";

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

  assert.deepEqual(first.diagramJson, AUDIENCE_LIVE_CHECK_MANUAL_DIAGRAM);
  assert.deepEqual(second.diagramJson, AUDIENCE_LIVE_CHECK_MANUAL_DIAGRAM);
  assert.equal(first.metadata.authoredSourceId, "audience-live-check");
  assert.ok(first.diagramJson);
  const terraform = generateTerraformFromDiagramJson(first.diagramJson);

  const expectedTerraform = readFileSync(
    new URL("./fixtures/audience-live-check-demo.tf", import.meta.url),
    "utf8"
  );
  assert.equal(terraform, expectedTerraform);
  assert.doesNotMatch(terraform, /\r/u);
  assert.match(terraform, /target_value\s+= 50/u);
  assert.doesNotMatch(terraform, /target_value\s+= 10/u);
  const canonicalClassification = syncTerraformToDiagramJson(first.diagramJson, {
    terraformCode: terraform,
    terraformFiles: [{ fileName: "main.tf", terraformCode: terraform }]
  });
  assert.ok(
    canonicalClassification.preservedResourceAddresses?.includes(
      "random_password.check_in_signing"
    )
  );

  const tunedDiagram = structuredClone(first.diagramJson);
  const scalingPolicy = tunedDiagram.nodes.find(
    (node) => node.parameters?.resourceType === "aws_appautoscaling_policy"
  );
  assert.ok(scalingPolicy?.parameters?.values);
  const trackingConfiguration = scalingPolicy.parameters.values[
    "targetTrackingScalingPolicyConfiguration"
  ] as Array<{ targetValue: number }>;
  assert.ok(trackingConfiguration[0]);
  trackingConfiguration[0].targetValue = 5;

  const tunedTerraform = generateTerraformFromDiagramJson(tunedDiagram);
  assert.equal(
    tunedTerraform,
    expectedTerraform.replace(
      /(\btarget_value\s*=\s*)50\b/u,
      (_match, prefix: string) => `${prefix}5`
    )
  );
  assert.match(tunedTerraform, /target_value\s+= 5/u);
  assert.doesNotMatch(tunedTerraform, /target_value\s+= 50/u);
  assert.match(
    tunedTerraform,
    /resource "aws_route_table_association" "rta_private_app_a" \{[\s\S]*?subnet_id\s+= aws_subnet\.subnet_private_app_a\.id[\s\S]*?\}/u
  );
  assert.match(
    tunedTerraform,
    /resource "aws_nat_gateway" "nat_private_egress" \{[\s\S]*?depends_on\s+= \[[\s\S]*?aws_internet_gateway\.igw_fixed_template_ecs_fargate_container_app[\s\S]*?aws_route_table_association\.rta_fixed_template_ecs_fargate_container_app_a[\s\S]*?\][\s\S]*?\}/u
  );
  assert.match(
    tunedTerraform,
    /output "max_capacity" \{[\s\S]*?value\s+= aws_appautoscaling_target\.ecs_service_requests\.max_capacity[\s\S]*?\}/u
  );
  assert.match(tunedTerraform, /resource "random_password" "check_in_signing"/u);
  assert.match(
    tunedTerraform,
    /secret_string\s+= random_password\.check_in_signing\.result/u
  );

  const catalogPresentedDiagram = {
    ...first.diagramJson,
    nodes: first.diagramJson.nodes.map((node) => ({
      ...node,
      iconUrl: "/Architecture-Service-Icons_07312025/catalog.svg",
      size: { width: 48, height: 48 },
      style: { borderColor: "#2f6db3", textColor: "#172033" }
    }))
  };
  assert.equal(generateTerraformFromDiagramJson(catalogPresentedDiagram), expectedTerraform);
  assert.equal(first.diagramJson.nodes.length, 42);
  assert.match(terraform, /resource "aws_ecs_service" "ecs_service_fixed_template_fargate_container_app"/u);
  assert.match(terraform, /resource "aws_cloudfront_distribution" "cdn_web"/u);
  assert.match(terraform, /resource "aws_secretsmanager_secret" "check_in_signing"/u);
});
