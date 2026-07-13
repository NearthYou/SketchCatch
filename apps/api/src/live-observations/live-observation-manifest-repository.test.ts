import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestStatus,
  DeploymentLiveObservationManifestV2
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { createPostgresDeploymentLiveObservationManifestRepository } from "./live-observation-manifest-repository.js";

const createdAt = new Date("2026-07-11T00:00:00.000Z");
const updatedAt = new Date("2026-07-11T00:05:00.000Z");
const genericInvalidReason = "Live Observation manifest verification failed.";
const deploymentId = "123e4567-e89b-42d3-a456-426614174000";
const resourceSuffix = "123e4567e89b";
const awsConnectionId = "abcdef12-3456-4789-8abc-def012345678";

test("findByDeploymentId maps timestamps and validates a valid manifest row", async () => {
  const storedManifest = createValidManifest();
  const fakeDb = new FakeManifestDb([
    createDatabaseRow({
      manifest: storedManifest
    })
  ]);
  const repository = createPostgresDeploymentLiveObservationManifestRepository(
    fakeDb as unknown as Database
  );

  const record = await repository.findByDeploymentId(storedManifest.provenance.deploymentId);

  assert.deepEqual(record, {
    deploymentId,
    schemaVersion: 2,
    status: "valid",
    manifest: storedManifest,
    invalidReason: null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString()
  } satisfies DeploymentLiveObservationManifestRecord);
  assert.notStrictEqual(record?.manifest, storedManifest);
});

test("findByDeploymentId returns null when the one-to-one manifest row does not exist", async () => {
  const fakeDb = new FakeManifestDb();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(
    fakeDb as unknown as Database
  );

  assert.equal(await repository.findByDeploymentId("missing-deployment"), null);
});

test("saveValid verifies and inserts schema v2 exactly once", async () => {
  const fakeDb = new FakeManifestDb();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(
    fakeDb as unknown as Database
  );
  const manifest = createValidManifest();

  const record = await repository.saveValid(manifest);

  assert.equal(record.status, "valid");
  assert.equal(record.schemaVersion, 2);
  assert.deepEqual(record.manifest, manifest);
  assert.equal(record.invalidReason, null);
  assert.deepEqual(fakeDb.lastInsertValues, {
    deploymentId,
    schemaVersion: 2,
    status: "valid",
    manifest,
    invalidReason: null
  });
  assert.equal(fakeDb.conflictDoNothingCalls, 1);
  assert.equal(record.updatedAt, createdAt.toISOString());
});

test("saveValid rejects an invalid runtime manifest before attempting persistence", async () => {
  const fakeDb = new FakeManifestDb();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(
    fakeDb as unknown as Database
  );
  const manifest = createValidManifest();
  manifest.endpoints.trafficUrl = "http://traffic.example.com/events";

  await assert.rejects(() => repository.saveValid(manifest));
  assert.equal(fakeDb.insertCalls, 0);
});

test("saveInvalid inserts a constant generic reason exactly once", async () => {
  const fakeDb = new FakeManifestDb();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(
    fakeDb as unknown as Database
  );

  const record = await repository.saveInvalid({
    deploymentId,
    reason: "  output verification failed after endpoint discovery  "
  });

  assert.deepEqual(record, {
    deploymentId,
    schemaVersion: 2,
    status: "manifest_invalid",
    manifest: null,
    invalidReason: genericInvalidReason,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString()
  } satisfies DeploymentLiveObservationManifestRecord);
  assert.deepEqual(fakeDb.lastInsertValues, {
    deploymentId,
    schemaVersion: 2,
    status: "manifest_invalid",
    manifest: null,
    invalidReason: genericInvalidReason
  });
  assert.equal(fakeDb.conflictDoNothingCalls, 1);
});

test("identical concurrent insert attempts return the same immutable record", async () => {
  const fakeDb = new FakeManifestDb();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(
    fakeDb as unknown as Database
  );
  const manifest = createValidManifest();

  const [first, second] = await Promise.all([
    repository.saveValid(manifest),
    repository.saveValid(structuredClone(manifest))
  ]);

  assert.deepEqual(first, second);
  assert.equal(fakeDb.rows.length, 1);
  assert.equal(fakeDb.insertCalls, 2);
});

test("immutable persistence rejects attempts to replace a different existing record", async () => {
  const invalidDb = new FakeManifestDb([
    createDatabaseRow({ status: "manifest_invalid", manifest: null, invalidReason: genericInvalidReason })
  ]);
  const validRepository = createPostgresDeploymentLiveObservationManifestRepository(
    invalidDb as unknown as Database
  );
  await assert.rejects(() => validRepository.saveValid(createValidManifest()), /conflict/i);
  assert.equal(invalidDb.rows[0]?.status, "manifest_invalid");

  const validDb = new FakeManifestDb([createDatabaseRow()]);
  const invalidRepository = createPostgresDeploymentLiveObservationManifestRepository(
    validDb as unknown as Database
  );
  await assert.rejects(
    () => invalidRepository.saveInvalid({ deploymentId, reason: "new failure" }),
    /conflict/i
  );
  assert.equal(validDb.rows[0]?.status, "valid");
});

test("saveInvalid replaces reviewer sensitive and prefixed Terraform probes with a generic reason", async () => {
  const unsafeReasons = [
    "AssumeRole failed for arn:aws:iam::123456789012:role/customer-role",
    "AssumeRole was rejected because External ID customer-external-id did not match",
    "AWS credential temporary-credential was rejected",
    "token temporary-token expired",
    "private-token temporary-private-token expired",
    "Access key AKIAIOSFODNN7EXAMPLE and secret key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY were rejected",
    "private key material: -----BEGIN PRIVATE KEY----- not-real-private-key -----END PRIVATE KEY-----",
    'materialization failed before output parsing: resource "aws_s3_bucket" "assets" { bucket = "customer-bucket" }'
  ];

  for (const reason of unsafeReasons) {
    const fakeDb = new FakeManifestDb();
    const repository = createPostgresDeploymentLiveObservationManifestRepository(
      fakeDb as unknown as Database
    );
    const record = await repository.saveInvalid({
      deploymentId,
      reason
    });

    assert.equal(record.invalidReason, genericInvalidReason);
    assert.equal(fakeDb.lastInsertValues?.invalidReason, genericInvalidReason);
  }
});

test("saveInvalid stores the same generic reason for exact reviewer probes", async () => {
  const reviewerProbes = [
    "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
    "github_pat_...",
    "glpat-...",
    "moved { from = aws_instance.old to = aws_instance.new }",
    "import { to = aws_instance.web id = i-1234567890abcdef0 }",
    "removed { from = aws_instance.legacy lifecycle { destroy = false } }",
    '{"resource":{"aws_instance":{"web":{"ami":"ami-1234567890abcdef0"}}}}'
  ];

  for (const reason of reviewerProbes) {
    const fakeDb = new FakeManifestDb();
    const repository = createPostgresDeploymentLiveObservationManifestRepository(
      fakeDb as unknown as Database
    );
    const record = await repository.saveInvalid({ deploymentId, reason });

    assert.equal(record.invalidReason, genericInvalidReason);
    assert.equal(fakeDb.lastInsertValues?.invalidReason, genericInvalidReason);
  }
});

test("saveInvalid rejects an empty reason without writing a row", async () => {
  const fakeDb = new FakeManifestDb();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(
    fakeDb as unknown as Database
  );

  await assert.rejects(
    () => repository.saveInvalid({ deploymentId, reason: " \n\t " }),
    /reason/i
  );
  assert.equal(fakeDb.insertCalls, 0);
});

test("mapping throws when a valid database row has a missing or invalid manifest", async () => {
  const invalidRows = [
    createDatabaseRow({ manifest: null }),
    createDatabaseRow({
      manifest: {
        ...createValidManifest(),
        endpoints: {
          audienceBaseUrl: "https://audience.example.com",
          trafficUrl: "http://traffic.example.com/events"
        }
      }
    })
  ];

  for (const row of invalidRows) {
    const fakeDb = new FakeManifestDb([row]);
    const repository = createPostgresDeploymentLiveObservationManifestRepository(
      fakeDb as unknown as Database
    );

    await assert.rejects(() => repository.findByDeploymentId(deploymentId));
  }
});

test("mapping rejects invalid row invariants and unknown schema versions", async () => {
  const inconsistentRows = [
    createDatabaseRow({ schemaVersion: 1 }),
    createDatabaseRow({ status: "manifest_invalid", invalidReason: "reason" }),
    createDatabaseRow({ status: "manifest_invalid", manifest: null, invalidReason: "   " })
  ];

  for (const row of inconsistentRows) {
    const fakeDb = new FakeManifestDb([row]);
    const repository = createPostgresDeploymentLiveObservationManifestRepository(
      fakeDb as unknown as Database
    );

    await assert.rejects(() => repository.findByDeploymentId(deploymentId));
  }
});

type ManifestDatabaseRow = {
  deploymentId: string;
  schemaVersion: number;
  status: DeploymentLiveObservationManifestStatus;
  manifest: DeploymentLiveObservationManifestV2 | null;
  invalidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

class FakeManifestDb {
  readonly rows: ManifestDatabaseRow[];
  insertCalls = 0;
  lastInsertValues: Record<string, unknown> | null = null;
  conflictDoNothingCalls = 0;

  constructor(rows: ManifestDatabaseRow[] = []) {
    this.rows = rows;
  }

  select() {
    return {
      from: () => ({
        where: () => ({
          limit: async () => this.rows.slice(0, 1)
        })
      })
    };
  }

  insert() {
    this.insertCalls += 1;

    return {
      values: (values: Record<string, unknown>) => {
        this.lastInsertValues = values;

        return {
          onConflictDoNothing: () => {
            this.conflictDoNothingCalls += 1;
            return {
              returning: async () => {
                const deploymentId = String(values.deploymentId);
                const existing = this.rows.find((row) => row.deploymentId === deploymentId);
                if (existing) return [];
                const row = {
                  ...values,
                  deploymentId,
                  createdAt,
                  updatedAt: createdAt
                } as ManifestDatabaseRow;
                this.rows.push(row);
                return [row];
              }
            };
          }
        };
      }
    };
  }
}

function createDatabaseRow(
  overrides: Partial<ManifestDatabaseRow> = {}
): ManifestDatabaseRow {
  return {
    deploymentId,
    schemaVersion: 2,
    status: "valid",
    manifest: createValidManifest(),
    invalidReason: null,
    createdAt,
    updatedAt,
    ...overrides
  };
}

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
      payload: {
        cloudFrontDistributionId: "E1ABCDEFGHIJKL",
        loadBalancerArn:
          `arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/sc-lo-alb-${resourceSuffix}/50dc6c495c0c9188`,
        targetGroupArn:
          `arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/sc-lo-api-${resourceSuffix}/6d0ecf831eec9f09`,
        autoScalingGroupName: `sc-lo-asg-${resourceSuffix}`
      }
    }
  };
}
