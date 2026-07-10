import assert from "node:assert/strict";
import { test } from "node:test";
import { createPreDeploymentCheckWarning } from "./deployment-warning-factory.js";

test("unmatched pre-deployment findings use the generic misconfiguration code", () => {
  const warning = createPreDeploymentCheckWarning({
    id: "policy:encryption-disabled",
    category: "configuration",
    severity: "medium",
    title: "Encryption is disabled",
    description: "The resource does not enable encryption at rest.",
    recommendation: "Enable encryption with a customer-managed key."
  });

  assert.equal(warning.code, "TRIVY_MISCONFIGURATION");
});
