import { strict as assert } from "node:assert";
import test from "node:test";
import type { DiscoveredResource } from "@sketchcatch/types";
import { createReverseEngineeringFindings } from "./aws-reverse-engineering-findings.js";

test("createReverseEngineeringFindings reports public S3 buckets as high risk", () => {
  const resources: DiscoveredResource[] = [
    {
      id: "resource-public-bucket",
      provider: "aws",
      providerResourceType: "AWS::S3::Bucket",
      providerResourceId: "public-assets",
      region: "ap-northeast-2",
      displayName: "public-assets",
      resourceType: "S3",
      config: {
        policyStatusIsPublic: true
      },
      relationships: []
    }
  ];

  const findings = createReverseEngineeringFindings(resources);

  assert.deepEqual(
    findings.map((finding) => [finding.category, finding.severity, finding.resourceId]),
    [["security", "high", "resource-public-bucket"]]
  );
  assert.match(findings[0]?.title ?? "", /S3/);
});
