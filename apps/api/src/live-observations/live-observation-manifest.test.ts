import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeploymentLiveObservationManifestV2 } from "@sketchcatch/types";
import {
  deploymentLiveObservationManifestV2Schema,
  parseDeploymentLiveObservationManifestV2
} from "./live-observation-manifest.js";

const deploymentId = "123e4567-e89b-42d3-a456-426614174000";
const resourceSuffix = "123e4567e89b";
const awsConnectionId = "abcdef12-3456-4789-8abc-def012345678";

test("manifest v2 accepts the canonical provider-neutral envelope and returns a fresh value", () => {
  const input = createValidManifest();
  const parsed = parseDeploymentLiveObservationManifestV2(input);

  assert.deepEqual(parsed, input);
  assert.notStrictEqual(parsed, input);
  assert.notStrictEqual(parsed.provenance, input.provenance);
  assert.notStrictEqual(parsed.adapter, input.adapter);
  assert.notStrictEqual(parsed.adapter.payload, input.adapter.payload);
  assert.equal(deploymentLiveObservationManifestV2Schema.safeParse(input).success, true);

  const inputPayload = input.adapter.payload as { autoScalingGroupName: string };
  const parsedPayload = parsed.adapter.payload as { autoScalingGroupName: string };
  inputPayload.autoScalingGroupName = "mutated";
  assert.equal(parsedPayload.autoScalingGroupName, `sc-lo-asg-${resourceSuffix}`);
});

test("manifest v2 accepts lowercase and uppercase SHA-256 hexadecimal values", () => {
  assert.doesNotThrow(() =>
    parseDeploymentLiveObservationManifestV2(
      withPath(["provenance", "terraformArtifactSha256"], "a".repeat(64))
    )
  );
  assert.doesNotThrow(() =>
    parseDeploymentLiveObservationManifestV2(
      withPath(["provenance", "terraformArtifactSha256"], "ABCDEF".repeat(10) + "ABCD")
    )
  );
});

test("manifest v2 rejects unknown fields in every fixed envelope", () => {
  for (const path of [
    ["unexpected"],
    ["provenance", "unexpected"],
    ["endpoints", "unexpected"],
    ["pressure", "unexpected"],
    ["adapter", "unexpected"],
    ["adapter", "payload", "unexpected"]
  ]) {
    assert.throws(
      () => parseDeploymentLiveObservationManifestV2(withPath(path, true)),
      `expected ${path.join(".")} to be rejected`
    );
  }
});

test("manifest v2 requires exact contract literals", () => {
  const invalidLiterals: Array<[string[], unknown]> = [
    [["schemaVersion"], 1],
    [["provider"], "azure"],
    [["pressure", "metric"], "requests_per_minute"],
    [["pressure", "target"], 59],
    [["pressure", "windowSeconds"], 30],
    [["adapter", "kind"], "aws"],
    [["adapter", "version"], 2]
  ];

  for (const [path, value] of invalidLiterals) {
    assert.throws(
      () => parseDeploymentLiveObservationManifestV2(withPath(path, value)),
      `expected ${path.join(".")} to require its literal value`
    );
  }
});

test("manifest v2 validates provenance identifiers, SHA-256, region, and verification time", () => {
  const invalidValues: Array<[string[], unknown]> = [
    [["provenance", "deploymentId"], ""],
    [["provenance", "deploymentId"], "   "],
    [["provenance", "deploymentId"], "deployment-1"],
    [["provenance", "awsConnectionId"], ""],
    [["provenance", "awsConnectionId"], "\t"],
    [["provenance", "region"], ""],
    [["provenance", "region"], "  "],
    [["provenance", "terraformArtifactSha256"], "a".repeat(63)],
    [["provenance", "terraformArtifactSha256"], "g".repeat(64)],
    [["provenance", "verifiedAt"], "2026-07-11"],
    [["provenance", "verifiedAt"], "2026-13-11T00:00:00.000Z"]
  ];

  for (const [path, value] of invalidValues) {
    assert.throws(
      () => parseDeploymentLiveObservationManifestV2(withPath(path, value)),
      `expected ${path.join(".")}=${String(value)} to be rejected`
    );
  }
});

test("manifest v2 requires a canonical lowercase AWS connection UUID", () => {
  const parsed = parseDeploymentLiveObservationManifestV2(createValidManifest());
  assert.equal(parsed.provenance.awsConnectionId, awsConnectionId);

  const invalidAwsConnectionIds = [
    "arn:aws:iam::123456789012:role/customer-observer",
    `sc_conn_${awsConnectionId}_abcdefghijklmnopqrstuvwx12345678`,
    awsConnectionId.toUpperCase(),
    awsConnectionId.replaceAll("-", ""),
    "abcdef12-3456-1789-8abc-def012345678"
  ];

  for (const value of invalidAwsConnectionIds) {
    assert.throws(
      () =>
        parseDeploymentLiveObservationManifestV2(
          withPath(["provenance", "awsConnectionId"], value)
        ),
      `expected awsConnectionId ${value} to be rejected`
    );
  }
});

test("manifest v2 only accepts absolute credential-free HTTPS endpoint URLs", () => {
  const invalidUrls = [
    "http://audience.example.com",
    "/relative/path",
    "https://user@audience.example.com",
    "https://user:password@audience.example.com",
    "https://audience.example.com/path?mode=live",
    "https://audience.example.com/path#live"
  ];

  for (const field of ["audienceBaseUrl", "trafficUrl"]) {
    for (const url of invalidUrls) {
      assert.throws(
        () => parseDeploymentLiveObservationManifestV2(withPath(["endpoints", field], url)),
        `expected ${field}=${url} to be rejected`
      );
    }
  }
});

test("manifest v2 requires the exact four-field AWS adapter v1 payload", () => {
  const payload = createValidAdapterPayload();
  const invalidPayloads: unknown[] = [
    [],
    60,
    true,
    null,
    { ...payload, nested: { resourceId: "target/demo/5678" } },
    { ...payload, desiredCapacity: 2 },
    { ...payload, healthy: true },
    { ...payload, dimensions: ["ap-northeast-2", "target-group"] },
    {
      distributionId: payload.cloudFrontDistributionId,
      loadBalancerArn: payload.loadBalancerArn,
      targetGroupArn: payload.targetGroupArn,
      autoScalingGroupName: payload.autoScalingGroupName
    }
  ];

  for (const key of Object.keys(payload)) {
    const missingKeyPayload = { ...payload };
    delete missingKeyPayload[key as keyof typeof missingKeyPayload];
    invalidPayloads.push(missingKeyPayload);
  }

  for (const value of invalidPayloads) {
    assert.throws(
      () => parseDeploymentLiveObservationManifestV2(withPath(["adapter", "payload"], value)),
      `expected non-canonical adapter payload ${JSON.stringify(value)} to be rejected`
    );
  }
});

test("manifest v2 rejects exact credential-shaped reviewer probes in plausible fields", () => {
  const payload = createValidAdapterPayload();
  const payloadKeys = Object.keys(payload) as Array<keyof typeof payload>;
  const reviewerProbes = [
    "xoxb-" + "123456789012-123456789012-abcdefghijklmnopqrstuvwx",
    "FwoGZXIvYXdzEBYaDKr5u9n5vYSmIwnJqE3ZQ3W7lYk6D0w2m9zJ8uP4",
    "sk_" + "live_51N4X7abcdefghijklmnopqrstuvwx",
    "api-key-550e8400-e29b-41d4-a716-446655440000"
  ];

  for (const key of payloadKeys) {
    for (const value of reviewerProbes) {
      assert.throws(
        () =>
          parseDeploymentLiveObservationManifestV2(
            withPath(["adapter", "payload"], {
              ...payload,
              [key]: value
            })
          ),
        `expected credential-shaped value ${value} in ${key} to be rejected`
      );
    }
  }
});

test("manifest v2 enforces provider-aware demo resource identifier patterns", () => {
  const invalidValues: Array<[
    keyof ReturnType<typeof createValidAdapterPayload>,
    string
  ]> = [
    ["cloudFrontDistributionId", "e1ABCDEFGHIJKL"],
    ["cloudFrontDistributionId", "D1ABCDEFGHIJKL"],
    ["cloudFrontDistributionId", "E123"],
    ["cloudFrontDistributionId", `E${"A".repeat(32)}`],
    [
      "loadBalancerArn",
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/sc-lo-alb-demo/50dc6c495c0c9188"
    ],
    [
      "loadBalancerArn",
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer-alb/50dc6c495c0c9188"
    ],
    [
      "targetGroupArn",
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/customer-api/6d0ecf831eec9f09"
    ],
    ["autoScalingGroupName", "customer-asg"],
    ["autoScalingGroupName", `sc-lo-asg-${"a".repeat(246)}`]
  ];

  for (const [key, value] of invalidValues) {
    assert.throws(
      () =>
        parseDeploymentLiveObservationManifestV2(
          withPath(["adapter", "payload"], {
            ...createValidAdapterPayload(),
            [key]: value
          })
        ),
      `expected invalid ${key} pattern to be rejected`
    );
  }
});

test("manifest v2 rejects credential-stuffed names behind valid demo prefixes", () => {
  const invalidPayloads = [
    createValidAdapterPayload({
      loadBalancerArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/sc-lo-alb-xoxb-1234567890123456/50dc6c495c0c9188"
    }),
    createValidAdapterPayload({
      targetGroupArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/sc-lo-api-glpat-abcdefghijklmnop/6d0ecf831eec9f09"
    }),
    createValidAdapterPayload({
      autoScalingGroupName: "sc-lo-asg-api-key-550e8400-e29b-41d4-a716-446655440000"
    })
  ];

  for (const payload of invalidPayloads) {
    assert.throws(() =>
      parseDeploymentLiveObservationManifestV2(withPath(["adapter", "payload"], payload))
    );
  }
});

test("manifest v2 rejects resource names not derived from the deployment UUID", () => {
  const invalidPayloads = [
    createValidAdapterPayload({
      loadBalancerArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/sc-lo-alb-deadbeefcafe/50dc6c495c0c9188"
    }),
    createValidAdapterPayload({
      targetGroupArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/sc-lo-api-deadbeefcafe/6d0ecf831eec9f09"
    }),
    createValidAdapterPayload({ autoScalingGroupName: "sc-lo-asg-deadbeefcafe" })
  ];

  for (const payload of invalidPayloads) {
    assert.throws(() =>
      parseDeploymentLiveObservationManifestV2(withPath(["adapter", "payload"], payload))
    );
  }
});

test("manifest v2 requires ALB and target-group ARN identity to match provenance", () => {
  const invalidCandidates = [
    withPath(
      ["adapter", "payload", "targetGroupArn"],
      `arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/sc-lo-api-${resourceSuffix}/6d0ecf831eec9f09`
    ),
    withPath(
      ["adapter", "payload", "targetGroupArn"],
      `arn:aws:elasticloadbalancing:ap-northeast-2:210987654321:targetgroup/sc-lo-api-${resourceSuffix}/6d0ecf831eec9f09`
    ),
    withPath(
      ["adapter", "payload", "targetGroupArn"],
      `arn:aws-us-gov:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/sc-lo-api-${resourceSuffix}/6d0ecf831eec9f09`
    ),
    withPath(
      ["provenance", "region"],
      "us-east-1"
    )
  ];

  for (const candidate of invalidCandidates) {
    assert.throws(() => parseDeploymentLiveObservationManifestV2(candidate));
  }
});

test("manifest v2 accepts the exact four-field AWS adapter v1 payload", () => {
  const payload = createValidAdapterPayload();

  const parsed = parseDeploymentLiveObservationManifestV2(
    withPath(["adapter", "payload"], payload)
  );

  assert.deepEqual(parsed.adapter.payload, payload);
});

function createValidManifest(): DeploymentLiveObservationManifestV2 {
  return {
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId,
      terraformArtifactSha256: "0123456789abcdef".repeat(4),
      awsConnectionId,
      region: "ap-northeast-2",
      verifiedAt: "2026-07-11T00:00:00.000Z"
    },
    endpoints: {
      audienceBaseUrl: "https://audience.example.com",
      trafficUrl: "https://traffic.example.com/events"
    },
    pressure: {
      metric: "requests_per_target_per_minute",
      target: 60,
      windowSeconds: 60
    },
    adapter: {
      kind: "aws-live-observation",
      version: 1,
      payload: createValidAdapterPayload()
    }
  };
}

function createValidAdapterPayload(
  overrides: Partial<{
    cloudFrontDistributionId: string;
    loadBalancerArn: string;
    targetGroupArn: string;
    autoScalingGroupName: string;
  }> = {}
) {
  return {
    cloudFrontDistributionId: "E1ABCDEFGHIJKL",
    loadBalancerArn:
      `arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/sc-lo-alb-${resourceSuffix}/50dc6c495c0c9188`,
    targetGroupArn:
      `arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/sc-lo-api-${resourceSuffix}/6d0ecf831eec9f09`,
    autoScalingGroupName: `sc-lo-asg-${resourceSuffix}`,
    ...overrides
  };
}

function withPath(path: string[], value: unknown): Record<string, unknown> {
  const candidate = structuredClone(createValidManifest()) as unknown as Record<string, unknown>;
  let cursor = candidate;

  for (const key of path.slice(0, -1)) {
    cursor = cursor[key] as Record<string, unknown>;
  }

  const lastKey = path.at(-1);
  assert.ok(lastKey);
  cursor[lastKey] = value;
  return candidate;
}
