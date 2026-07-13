import { test } from "node:test";
import assert from "node:assert/strict";
import type { TerraformOutput } from "../../../../packages/types/src";
import { getSafeDeploymentLinks } from "./deployment-output-links";

test("deployment links prefer the static Web entry point and then the API endpoint", () => {
  const outputs = [
    createOutput("apiBaseUrl", "https://api.example.com/v1"),
    createOutput("appUrl", "https://app-fallback.example.com"),
    createOutput("staticSiteUrl", "https://app.example.com")
  ];

  assert.deepEqual(getSafeDeploymentLinks(outputs), [
    { kind: "web", label: "Web entry point", url: "https://app.example.com" },
    { kind: "api", label: "API endpoint", url: "https://api.example.com/v1" }
  ]);
});

test("deployment links fall back to appUrl and apiUrl aliases", () => {
  const outputs = [
    createOutput("api_url", "http://localhost:3001/api"),
    createOutput("app_url", "http://localhost:3000")
  ];

  assert.deepEqual(getSafeDeploymentLinks(outputs), [
    { kind: "web", label: "Web entry point", url: "http://localhost:3000" },
    { kind: "api", label: "API endpoint", url: "http://localhost:3001/api" }
  ]);
});

test("deployment links reject sensitive outputs before parsing their values", () => {
  const sensitiveValue = {
    toString(): string {
      throw new Error("sensitive value must not be parsed");
    }
  };

  assert.deepEqual(
    getSafeDeploymentLinks([
      createOutput("staticSiteUrl", sensitiveValue, true),
      createOutput("appUrl", "https://safe.example.com")
    ]),
    [{ kind: "web", label: "Web entry point", url: "https://safe.example.com" }]
  );
});

test("deployment links accept only valid HTTP(S) strings and leave other outputs unclassified", () => {
  const outputs = [
    createOutput("staticSiteUrl", "javascript:alert(1)"),
    createOutput("appUrl", "not a URL"),
    createOutput("websiteUrl", "ftp://files.example.com"),
    createOutput("apiBaseUrl", "https://[invalid"),
    createOutput("bucketName", "assets-production"),
    createOutput("region", { name: "ap-northeast-2" }),
    createOutput("unrelatedUrl", "https://ignored.example.com")
  ];

  assert.deepEqual(getSafeDeploymentLinks(outputs), []);
  assert.equal(outputs[4]?.value, "assets-production");
});

function createOutput(
  name: string,
  value: unknown,
  sensitive = false
): TerraformOutput {
  return {
    id: `output-${name}`,
    deploymentId: "deployment-1",
    name,
    value,
    sensitive,
    createdAt: "2026-07-13T03:00:00.000Z"
  };
}
