import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckFinding } from "@sketchcatch/types";
import { createFallbackSafetyFindingExplanation } from "./aiSafetyFindingExplanation.js";

test("createFallbackSafetyFindingExplanation explains public SSH with deterministic guidance", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "security-open-ssh-sg-app",
      title: "SSH is open to 0.0.0.0/0",
      description: "Port 22 allows 0.0.0.0/0"
    })
  );

  assert.equal(explanation.fallbackUsed, true);
  assert.equal(explanation.fallbackReason, "missing_api_key");
  assert.match(explanation.riskSummary, /SSH/);
  assert.match(explanation.recommendedFix, /Session Manager|CIDR/);
  assert.equal(explanation.verificationSteps.length >= 2, true);
  assert.equal(explanation.providerMetadata?.provider, "fallback");
  assert.equal(explanation.providerMetadata?.service, "rule_fallback");
  assert.equal(explanation.providerMetadata?.billingMode, "disabled");
  assert.equal(explanation.providerMetadata?.routeTarget, "safety_finding_explanation");
});

test("createFallbackSafetyFindingExplanation masks secret-like input in metadata estimates", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "configuration-review-secret",
      description: "password = super-secret-value"
    })
  );

  assert.equal(explanation.providerMetadata?.estimatedUsage.inputCharacters !== undefined, true);
  assert.equal(explanation.providerMetadata?.cacheKey.length, 64);
});

function createFinding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    id: "security-open-ssh-sg-app",
    category: "security",
    severity: "high",
    resourceId: "sg-app",
    title: "SSH is open",
    description: "Port 22 allows public access",
    recommendation: "Restrict SSH CIDR",
    ...overrides
  };
}
