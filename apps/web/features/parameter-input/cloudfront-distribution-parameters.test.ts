import assert from "node:assert/strict";
import { test } from "node:test";

import { terraformParameterCatalog } from "./catalog";

test("CloudFront parameters expose the requested S3 and ALB origin configuration", () => {
  const definitions = terraformParameterCatalog.resources.aws_cloudfront_distribution ?? [];
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));

  assert.equal(byName.get("defaultRootObject")?.terraformName, "default_root_object");

  const origin = byName.get("origin");
  assert.equal(origin?.type, "list");
  assert.deepEqual(origin?.children?.map((child) => child.name), [
    "domainName",
    "originId",
    "originAccessControlId",
    "customOriginConfig"
  ]);
  assert.deepEqual(
    origin?.children?.find((child) => child.name === "customOriginConfig")?.children?.map(
      (child) => child.name
    ),
    ["httpPort", "httpsPort", "originProtocolPolicy", "originSslProtocols"]
  );
});

test("CloudFront parameters expose default and ordered managed-policy cache behaviors", () => {
  const definitions = terraformParameterCatalog.resources.aws_cloudfront_distribution ?? [];
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const defaultBehavior = byName.get("defaultCacheBehavior");
  const orderedBehavior = byName.get("orderedCacheBehavior");

  assert.equal(defaultBehavior?.type, "list");
  assert.ok(defaultBehavior?.children?.some((child) => child.name === "cachePolicyId"));
  assert.equal(orderedBehavior?.type, "list");
  assert.deepEqual(orderedBehavior?.children?.map((child) => child.name), [
    "pathPattern",
    "targetOriginId",
    "viewerProtocolPolicy",
    "allowedMethods",
    "cachedMethods",
    "cachePolicyId",
    "originRequestPolicyId"
  ]);
});

test("CloudFront required singleton blocks use the parser-compatible collection shape", () => {
  const definitions = terraformParameterCatalog.resources.aws_cloudfront_distribution ?? [];
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));

  assert.equal(byName.get("restrictions")?.type, "list");
  assert.equal(byName.get("viewerCertificate")?.type, "list");
});
