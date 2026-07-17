import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";
import { createAwsProviderAdapter, type AwsProviderAdapter } from "./aws-provider-adapter.js";
import {
  createReverseEngineeringPreviewScan,
  createReverseEngineeringScanJob,
  ReverseEngineeringNotFoundError,
  type ReverseEngineeringRepository
} from "./reverse-engineering-service.js";

const accessContext: ProjectAccessContext = {
  kind: "user",
  userId: "user-1"
};

for (const connectionStatus of ["pending", "failed", "unknown"] as const) {
  test(`${connectionStatus} AWS 연결은 Reverse Engineering Provider reader를 시작하지 않는다`, async () => {
    for (const resourceTypes of [["ALL"], ["LOAD_BALANCER"], ["ECS_SERVICE"]] as const) {
      let scanCreated = false;
      let providerScanCalls = 0;
      const repository = createRepository({
        async findVerifiedAwsConnection() {
          return undefined;
        },
        async createScan() {
          scanCreated = true;
          throw new Error("스캔은 생성되면 안 됩니다.");
        }
      });

      await assert.rejects(
        createReverseEngineeringScanJob(
          {
            projectId: "project-1",
            accessContext,
            awsConnectionId: `${connectionStatus}-connection`,
            region: "ap-northeast-2",
            resourceTypes: [...resourceTypes]
          },
          repository,
          {
            adapter: {
              async scan() {
                providerScanCalls += 1;
                throw new Error("Provider reader는 시작되면 안 됩니다.");
              }
            } satisfies AwsProviderAdapter
          }
        ),
        (error: unknown) =>
          error instanceof ReverseEngineeringNotFoundError &&
          error.message === "AWS connection not found"
      );

      assert.equal(scanCreated, false);
      assert.equal(providerScanCalls, 0);
    }
  });
}

test("API가 verified로 확인한 연결은 저장 없는 read-only preview reader를 유지한다", async () => {
  const verifiedConnection: AwsConnection = {
    id: "verified-connection",
    userId: "user-1",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchReverseEngineeringReadRole",
    externalId: "task9-external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
  let providerScanCalls = 0;
  const resourceTypes = ["LOAD_BALANCER", "ECS_SERVICE"] as const;
  const repository = createRepository({
    async findVerifiedAwsConnection() {
      return verifiedConnection;
    }
  });
  const adapter = createAwsProviderAdapter({
    async discoverResources(input) {
      providerScanCalls += 1;
      assert.deepEqual(input.resourceTypes, resourceTypes);
      return [];
    }
  });

  const response = await createReverseEngineeringPreviewScan(
    {
      accessContext,
      awsConnectionId: verifiedConnection.id,
      region: verifiedConnection.region,
      resourceTypes: [...resourceTypes]
    },
    repository,
    {
      adapter,
      generateId: () => "preview-scan-task9",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    }
  );

  assert.equal(providerScanCalls, 1);
  assert.equal(response.scan.id, "preview-scan-task9");
  assert.equal(response.scan.status, "completed");
  assert.equal(response.result.scan, response.scan);
  assert.deepEqual(response.result.discoveredResources, []);
});

function createRepository(
  overrides: Partial<ReverseEngineeringRepository>
): ReverseEngineeringRepository {
  return {
    async findAccessibleProject() {
      return {} as ProjectRecord;
    },
    async findVerifiedAwsConnection() {
      return undefined;
    },
    async createScan() {
      throw new Error("Not used");
    },
    async completeScan() {
      return undefined;
    },
    async failScan() {
      return undefined;
    },
    async findAccessibleScan() {
      return undefined;
    },
    async listScansByProject() {
      return [];
    },
    async requestScanCancellation() {
      return undefined;
    },
    async softDeleteScan() {
      return undefined;
    },
    async appendScanLog() {
      throw new Error("Not used");
    },
    async listScanLogs() {
      return [];
    },
    ...overrides
  };
}
