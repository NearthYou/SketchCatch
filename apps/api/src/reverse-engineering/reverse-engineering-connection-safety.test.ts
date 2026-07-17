import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";
import type { AwsProviderAdapter } from "./aws-provider-adapter.js";
import {
  createReverseEngineeringScanJob,
  ReverseEngineeringNotFoundError,
  type ReverseEngineeringRepository
} from "./reverse-engineering-service.js";

const accessContext: ProjectAccessContext = {
  kind: "user",
  userId: "user-1"
};

for (const connectionStatus of ["pending", "failed"] as const) {
  test(`${connectionStatus} AWS 연결은 Reverse Engineering Provider reader를 시작하지 않는다`, async () => {
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
          resourceTypes: ["ALL"]
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
        error instanceof ReverseEngineeringNotFoundError && error.message === "AWS connection not found"
    );

    assert.equal(scanCreated, false);
    assert.equal(providerScanCalls, 0);
  });
}

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
