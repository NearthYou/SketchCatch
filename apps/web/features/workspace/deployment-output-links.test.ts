import assert from "node:assert/strict";
import test from "node:test";
import type { TerraformOutput } from "@sketchcatch/types";
import { getManagedDeploymentLinks } from "./deployment-output-links";

const outputs = [
  {
    id: "output-1",
    deploymentId: "deployment-1",
    name: "cloudfront_url",
    value: "https://d111111abcdef8.cloudfront.net",
    sensitive: false,
    createdAt: "2026-07-24T00:00:00.000Z"
  },
  {
    id: "output-2",
    deploymentId: "deployment-1",
    name: "api_base_url",
    value: "https://api.example.com",
    sensitive: false,
    createdAt: "2026-07-24T00:00:00.000Z"
  }
] satisfies TerraformOutput[];

test("managed deployment hides the web entry point until the application release finishes", () => {
  assert.deepEqual(getManagedDeploymentLinks(outputs, null).map(({ kind }) => kind), ["api"]);
  assert.deepEqual(
    getManagedDeploymentLinks(outputs, "pending").map(({ kind }) => kind),
    ["api"]
  );
  assert.deepEqual(
    getManagedDeploymentLinks(outputs, "succeeded").map(({ kind }) => kind),
    ["web", "api"]
  );
});