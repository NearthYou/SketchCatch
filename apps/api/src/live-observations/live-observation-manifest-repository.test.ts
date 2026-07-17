import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeploymentLiveObservationManifestV2 } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  createPostgresDeploymentLiveObservationManifestRepository,
  LiveObservationManifestPersistenceConflictError
} from "./live-observation-manifest-repository.js";

const deploymentId = "123e4567-e89b-4d3a-a456-426614174000";

test("replaces an invalid manifest once and keeps the resulting valid manifest immutable", async () => {
  const database = new FakeManifestDatabase();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(database.db);
  const invalid = await repository.saveInvalid({
    deploymentId,
    reason: "provider evidence was incomplete"
  });
  const refreshedInvalid = await repository.saveInvalid({
    deploymentId,
    reason: "provider evidence is still incomplete"
  });

  assert.equal(refreshedInvalid.status, "manifest_invalid");
  assert.equal(refreshedInvalid.createdAt, invalid.createdAt);

  const manifest = createManifest();
  const valid = await repository.saveValid(manifest);

  assert.equal(database.rowCount, 1);
  assert.equal(valid.status, "valid");
  assert.deepEqual(valid.manifest, manifest);
  assert.equal(valid.invalidReason, null);
  assert.equal(valid.createdAt, invalid.createdAt);

  await assert.rejects(
    repository.saveValid({
      ...manifest,
      endpoints: {
        ...manifest.endpoints,
        audienceBaseUrl: "https://different.sketchcatch.example"
      }
    }),
    /immutable persistence conflict/
  );
  await assert.rejects(
    repository.saveInvalid({
      deploymentId,
      reason: "a later diagnostic must not replace valid evidence"
    }),
    /immutable persistence conflict/
  );
  assert.deepEqual((await repository.findByDeploymentId(deploymentId))?.manifest, manifest);
});

test("retries invalid-to-valid when a concurrent diagnostic inserts the missing row", async () => {
  const database = new FakeManifestDatabase();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(database.db);
  database.beforeNextValidInsert(async () => {
    const concurrentInvalid = await repository.saveInvalid({
      deploymentId,
      reason: "concurrent diagnostic"
    });
    assert.equal(concurrentInvalid.status, "manifest_invalid");
  });

  const manifest = createManifest();
  const saved = await repository.saveValid(manifest);

  assert.equal(saved.status, "valid");
  assert.deepEqual(saved.manifest, manifest);
  assert.equal(database.rowCount, 1);
});

test("does not overwrite a different valid manifest that wins the insert race", async () => {
  const database = new FakeManifestDatabase();
  const repository = createPostgresDeploymentLiveObservationManifestRepository(database.db);
  const requested = createManifest();
  const winner = {
    ...requested,
    endpoints: {
      ...requested.endpoints,
      audienceBaseUrl: "https://winner.sketchcatch.example"
    }
  };
  database.beforeNextValidInsert(async () => {
    await repository.saveValid(winner);
  });

  await assert.rejects(
    repository.saveValid(requested),
    LiveObservationManifestPersistenceConflictError
  );
  assert.deepEqual((await repository.findByDeploymentId(deploymentId))?.manifest, winner);
});

type FakeManifestRow = {
  deploymentId: string;
  schemaVersion: number;
  status: "valid" | "manifest_invalid";
  manifest: DeploymentLiveObservationManifestV2 | null;
  invalidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

class FakeManifestDatabase {
  readonly db: Database;
  private row: FakeManifestRow | undefined;
  private clock = 0;
  private validInsertHook: (() => Promise<void>) | undefined;

  constructor() {
    this.db = {
      insert: () => ({
        values: (values: Omit<FakeManifestRow, "createdAt" | "updatedAt">) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (values.status === "valid" && this.validInsertHook) {
                const hook = this.validInsertHook;
                this.validInsertHook = undefined;
                await hook();
              }
              if (this.row) return [];
              const now = this.nextTimestamp();
              this.row = { ...values, createdAt: now, updatedAt: now };
              return [this.row];
            }
          })
        })
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (this.row ? [this.row] : [])
          })
        })
      }),
      update: () => ({
        set: (values: Partial<FakeManifestRow>) => ({
          where: () => ({
            returning: async () => {
              if (!this.row || this.row.status !== "manifest_invalid") return [];
              this.row = { ...this.row, ...values };
              return [this.row];
            }
          })
        })
      })
    } as unknown as Database;
  }

  get rowCount(): number {
    return this.row ? 1 : 0;
  }

  beforeNextValidInsert(hook: () => Promise<void>): void {
    this.validInsertHook = hook;
  }

  private nextTimestamp(): Date {
    this.clock += 1;
    return new Date(`2026-07-16T03:00:0${this.clock}.000Z`);
  }
}

function createManifest(): DeploymentLiveObservationManifestV2 {
  return {
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId,
      terraformArtifactSha256: "a".repeat(64),
      awsConnectionId: "223e4567-e89b-4d3a-a456-426614174000",
      region: "ap-northeast-2",
      verifiedAt: "2026-07-16T02:00:00.000Z"
    },
    endpoints: {
      audienceBaseUrl: "https://sketchcatch.example",
      trafficUrl: "https://d111111abcdef8.cloudfront.net/api/traffic"
    },
    pressure: {
      metric: "requests_per_target_per_minute",
      target: 60,
      windowSeconds: 60
    },
    adapter: {
      kind: "aws-live-observation",
      version: 4,
      payload: {
        cloudFrontDistributionId: "E123456789ABC",
        cloudFrontDomainName: "d111111abcdef8.cloudfront.net",
        frontendBucketName: "audience-live-check-web-assets",
        defaultOriginId: "web-assets",
        originAccessControlId: "E123456789ABC",
        apiOriginId: "api-alb",
        apiPathPattern: "/api/*",
        healthPathPattern: "/health",
        frontendBucketPublicAccessBlocked: true,
        bucketPolicyAllowsCloudFrontRead: true,
        topologyVerifiedAt: "2026-07-16T03:00:00.000Z",
        frontendState: "current",
        loadBalancerDnsName: "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
        loadBalancerArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
        targetGroupArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/0123456789abcdef",
        logGroupNames: ["/ecs/audience-live-check"],
        capacityTarget: {
          kind: "ecs_fargate",
          clusterName: "audience-live-check-cluster",
          serviceName: "audience-live-check-service",
          scaling: { mode: "fixed" }
        }
      }
    }
  };
}
