import assert from "node:assert/strict";
import { test } from "node:test";
import type { AwsConnection, ReverseEngineeringScan } from "@sketchcatch/types";
import type { ProjectRecord } from "../deployments/deployment-service.js";
import type {
  CreateReverseEngineeringScanRecordInput,
  AppendReverseEngineeringScanLogInput,
  ReverseEngineeringRepository,
  ReverseEngineeringScanLogRecord,
  ReverseEngineeringScanRecord
} from "./reverse-engineering-service.js";
import { createReverseEngineeringScan } from "./reverse-engineering-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const awsConnectionId = "33333333-3333-4333-8333-333333333333";
const fixedNow = new Date("2026-07-05T00:00:00.000Z");

test("createReverseEngineeringScan stores a scan, logs progress, and saves adapter result", async () => {
  const repository = new FakeReverseEngineeringRepository();
  const result = await createReverseEngineeringScan(
    {
      projectId,
      accessContext: { kind: "user", userId },
      awsConnectionId,
      region: "ap-northeast-2",
      resourceTypes: ["VPC", "SUBNET"]
    },
    repository,
    {
      adapter: {
        async scan() {
          return {
            scan: makeScan({ id: "not-yet-persisted" }),
            discoveredResources: [],
            reverseEngineeringDraft: {
              id: "draft-not-yet-persisted",
              scanId: "not-yet-persisted",
              architectureJson: { nodes: [], edges: [] },
              protectedValueKeys: [],
              editableValueKeys: [],
              createdAt: fixedNow.toISOString()
            },
            architectureJson: { nodes: [], edges: [] },
            findings: [],
            analysisExclusions: [],
            importSuggestions: [],
            scanErrors: []
          };
        }
      },
      generateId: () => "44444444-4444-4444-8444-444444444444",
      now: () => fixedNow
    }
  );

  assert.equal(result.scan.status, "completed");
  assert.equal(result.result.reverseEngineeringDraft.scanId, result.scan.id);
  assert.equal(result.result.reverseEngineeringDraft.id, `draft-${result.scan.id}`);
  assert.equal(repository.scanRows[0]?.awsConnectionId, awsConnectionId);
  assert.equal(repository.scanRows[0]?.result?.scan.id, result.scan.id);
  assert.deepEqual(
    repository.logRows.map((log) => log.message),
    ["Reverse Engineering 스캔을 시작했습니다.", "Reverse Engineering 스캔이 완료됐습니다."]
  );
});

test("createReverseEngineeringScan fails before scanning when the project is not accessible", async () => {
  const repository = new FakeReverseEngineeringRepository();
  repository.project = undefined;

  await assert.rejects(
    () =>
      createReverseEngineeringScan(
        {
          projectId,
          accessContext: { kind: "user", userId },
          awsConnectionId,
          region: "ap-northeast-2",
          resourceTypes: ["VPC"]
        },
        repository
      ),
    /Project not found/
  );

  assert.equal(repository.scanRows.length, 0);
});

class FakeReverseEngineeringRepository implements ReverseEngineeringRepository {
  project: ProjectRecord | undefined = {
    id: projectId,
    userId,
    name: "Project",
    description: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
  awsConnection: AwsConnection | undefined = {
    id: awsConnectionId,
    userId,
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: fixedNow.toISOString(),
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString()
  };
  scanRows: ReverseEngineeringScanRecord[] = [];
  logRows: Array<{ message: string }> = [];

  async findAccessibleProject() {
    return this.project;
  }

  async findVerifiedAwsConnection() {
    return this.awsConnection;
  }

  async createScan(input: CreateReverseEngineeringScanRecordInput) {
    const scan = makeScanRecord({
      id: input.id,
      projectId: input.projectId,
      awsConnectionId: input.awsConnectionId,
      region: input.region,
      resourceTypes: input.resourceTypes,
      status: input.status,
      startedAt: input.startedAt,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    });

    this.scanRows.push(scan);
    return scan;
  }

  async completeScan(scanId: string, result: ReverseEngineeringScanRecord["result"], completedAt: Date) {
    const scan = this.scanRows.find((row) => row.id === scanId);

    if (!scan) {
      return undefined;
    }

    scan.status = "completed";
    scan.result = result;
    scan.completedAt = completedAt;
    scan.updatedAt = completedAt;
    return scan;
  }

  async failScan() {
    return undefined;
  }

  async findAccessibleScan() {
    return this.scanRows[0];
  }

  async listScansByProject() {
    return this.scanRows;
  }

  async requestScanCancellation() {
    return this.scanRows[0];
  }

  async softDeleteScan() {
    return this.scanRows[0];
  }

  async appendScanLog(
    input: AppendReverseEngineeringScanLogInput
  ): Promise<ReverseEngineeringScanLogRecord> {
    this.logRows.push({ message: input.message });
    return {
      id: input.id,
      scanId: input.scanId,
      sequence: input.sequence,
      stage: input.stage,
      level: input.level,
      message: input.message,
      createdAt: input.createdAt
    };
  }

  async listScanLogs() {
    return [];
  }
}

function makeScan(overrides: Partial<ReverseEngineeringScan> = {}): ReverseEngineeringScan {
  return {
    id: "scan",
    projectId,
    awsConnectionId,
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC"],
    status: "completed",
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
    startedAt: fixedNow.toISOString(),
    completedAt: fixedNow.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null,
    ...overrides
  };
}

function makeScanRecord(
  overrides: Partial<ReverseEngineeringScanRecord> = {}
): ReverseEngineeringScanRecord {
  return {
    id: "scan",
    projectId,
    awsConnectionId,
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC"],
    status: "running",
    result: null,
    errorSummary: null,
    startedAt: fixedNow,
    completedAt: null,
    cancelRequestedAt: null,
    deletedAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}
