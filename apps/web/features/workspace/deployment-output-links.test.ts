import { test } from "node:test";
import assert from "node:assert/strict";
import type { TerraformOutput } from "../../../../packages/types/src";
import {
  getSafeDeploymentLinks,
  getVisibleDeploymentOutputs,
  initialDeploymentOutputState,
  reduceDeploymentOutputState
} from "./deployment-output-links";
import { readFileSync } from "node:fs";

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

test("the shared Output cards expose safe new-tab links and accessible clipboard feedback", () => {
  const source = readFileSync(new URL("DeploymentOutputLinks.tsx", import.meta.url), "utf8");

  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
  assert.match(source, />사이트 열기</);
  assert.match(source, />URL 복사</);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /URL을 복사했습니다\./);
  assert.match(source, /URL을 복사하지 못했습니다\./);
});

test("Direct Output state never exposes deployment A values while deployment B is selected", () => {
  const outputA = { ...createOutput("appUrl", "https://a.example.com"), deploymentId: "deployment-a" };
  const outputB = { ...createOutput("appUrl", "https://b.example.com"), deploymentId: "deployment-b" };
  const loadedA = reduceDeploymentOutputState(initialDeploymentOutputState, {
    type: "loaded",
    deploymentId: "deployment-a",
    outputs: [outputA]
  });
  const pendingB = reduceDeploymentOutputState(loadedA, {
    type: "clear",
    deploymentId: "deployment-b"
  });
  const failedB = reduceDeploymentOutputState(pendingB, {
    type: "clear",
    deploymentId: "deployment-b"
  });
  const loadedB = reduceDeploymentOutputState(failedB, {
    type: "loaded",
    deploymentId: "deployment-b",
    outputs: [outputB]
  });

  assert.deepEqual(getVisibleDeploymentOutputs(loadedA, "deployment-a"), [outputA]);
  assert.deepEqual(getVisibleDeploymentOutputs(loadedA, "deployment-b"), []);
  assert.deepEqual(getVisibleDeploymentOutputs(pendingB, "deployment-b"), []);
  assert.deepEqual(getVisibleDeploymentOutputs(failedB, "deployment-b"), []);
  assert.deepEqual(getVisibleDeploymentOutputs(loadedB, "deployment-b"), [outputB]);
});

test("Direct Output state rejects records whose deployment owner does not match the load", () => {
  const mismatched = reduceDeploymentOutputState(initialDeploymentOutputState, {
    type: "loaded",
    deploymentId: "deployment-b",
    outputs: [createOutput("appUrl", "https://a.example.com")]
  });

  assert.deepEqual(getVisibleDeploymentOutputs(mismatched, "deployment-b"), []);
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
