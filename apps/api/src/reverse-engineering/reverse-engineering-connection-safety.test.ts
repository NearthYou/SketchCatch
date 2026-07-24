import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection, ReverseEngineeringScanResult } from "@sketchcatch/types";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";
import { createAwsProviderAdapter, type AwsProviderAdapter } from "./aws-provider-adapter.js";
import {
  createReverseEngineeringPreviewScan,
  createReverseEngineeringScanJob,
  ReverseEngineeringNotFoundError,
  ReverseEngineeringScanFailedError,
  type ReverseEngineeringScanRecord,
  type ReverseEngineeringRepository
} from "./reverse-engineering-service.js";
import { classifyReverseEngineeringConnectionFailure } from "./reverse-engineering-public-errors.js";

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

test("verified 연결의 preview는 AWS 원본을 서버에만 유효 기간과 함께 저장한다", async () => {
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
  let persistedPreview:
    | {
        expiresAt: Date;
        id: string;
        rawResult: ReverseEngineeringScanResult;
        userId: string;
      }
    | undefined;
  const resourceTypes = ["LOAD_BALANCER", "ECS_SERVICE"] as const;
  const repository = createRepository({
    async findVerifiedAwsConnection() {
      return verifiedConnection;
    },
    async createPreview(input: unknown) {
      persistedPreview = input as typeof persistedPreview;
      return input as never;
    }
  });
  const adapter = createAwsProviderAdapter(
    {
      async discoverResources(input) {
        providerScanCalls += 1;
        assert.deepEqual(input.resourceTypes, resourceTypes);
        return [
          {
            providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
            providerResourceId:
              "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/private/abc",
            displayName: "private-entry",
            region: "ap-northeast-2",
            config: {
              arn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/private/abc",
              name: "private-entry",
              type: "application",
              ipAddressType: "ipv4",
              scheme: "internet-facing",
              subnetIds: ["subnet-private"]
            },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  );

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
  assert.equal(response.previewId, "preview-scan-task9");
  assert.equal(response.scan.id, "preview-scan-task9");
  assert.equal(response.scan.status, "completed");
  assert.equal(response.result.scan, response.scan);
  assert.equal(persistedPreview?.id, "preview-scan-task9");
  assert.equal(persistedPreview?.userId, accessContext.userId);
  assert.equal(persistedPreview?.expiresAt.toISOString(), "2026-07-17T00:30:00.000Z");
  assert.match(JSON.stringify(persistedPreview?.rawResult), /arn:aws:elasticloadbalancing/iu);
  assert.doesNotMatch(JSON.stringify(response), /arn:aws:elasticloadbalancing|terraform import/iu);
  assert.equal("rawResult" in response, false);
});

test("기존 Project 스캔은 AWS 원본을 저장하고 호출자에게는 공개 결과만 반환한다", async () => {
  const verifiedConnection = createVerifiedConnection();
  const createdAt = new Date("2026-07-20T00:00:00.000Z");
  const scanRow = createScanRow(createdAt);
  let persistedResult: ReverseEngineeringScanResult | undefined;
  const repository = createRepository({
    async findAccessibleProject() {
      return {} as ProjectRecord;
    },
    async findVerifiedAwsConnection() {
      return verifiedConnection;
    },
    async createScan() {
      return scanRow;
    },
    async completeScan(_scanId, result, completedAt) {
      persistedResult = structuredClone(result);
      return {
        ...scanRow,
        status: "completed",
        result,
        completedAt,
        updatedAt: completedAt
      };
    },
    async appendScanLog(input) {
      return input;
    }
  });
  const adapter = createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          {
            providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
            providerResourceId:
              "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/private/abc",
            displayName: "private-entry",
            region: "ap-northeast-2",
            config: {
              reverseEngineeringDetailsVersion: 1,
              attributesReadComplete: true,
              attributesProjectionComplete: true,
              attributes: {},
              tagsReadComplete: true,
              tags: [],
              name: "private-entry",
              type: "application",
              ipAddressType: "ipv4",
              scheme: "internet-facing",
              subnetIds: ["subnet-private"]
            },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  );
  const ids = ["scan-1", "log-start", "log-complete"];
  const job = await createReverseEngineeringScanJob(
    {
      projectId: "project-1",
      accessContext,
      awsConnectionId: verifiedConnection.id,
      region: verifiedConnection.region,
      resourceTypes: ["ALL"]
    },
    repository,
    {
      adapter,
      generateId: () => ids.shift() ?? "unexpected-id",
      now: () => createdAt
    }
  );

  const publicResult = await job.run();

  assert.match(JSON.stringify(persistedResult), /arn:aws:elasticloadbalancing/iu);
  assert.match(JSON.stringify(persistedResult), /terraform import/iu);
  assert.equal(persistedResult?.scan.id, scanRow.id);
  assert.equal(persistedResult?.scan.projectId, scanRow.projectId);
  assert.equal(persistedResult?.reverseEngineeringDraft.scanId, scanRow.id);
  assert.doesNotMatch(JSON.stringify(publicResult), /arn:aws|terraform import/iu);
});

test("preview 부분 결과는 원문 AWS 오류를 버리고 안전한 서비스 coverage만 반환한다", async () => {
  const verifiedConnection = createVerifiedConnection();
  const repository = createRepository({
    async findVerifiedAwsConnection() {
      return verifiedConnection;
    }
  });
  const adapter = createAwsProviderAdapter({
    async discoverResources() {
      return {
        records: [],
        scanErrors: [
          {
            id: "raw-iam",
            serviceKey: "iam",
            resourceType: "UNKNOWN",
            stage: "provider_api",
            reason: "permission_denied",
            message:
              "AccessDenied arn:aws:iam::123456789012:role/private iam:ListRoles RequestId private",
            retryable: false
          }
        ]
      };
    }
  });

  const response = await createReverseEngineeringPreviewScan(
    {
      accessContext,
      awsConnectionId: verifiedConnection.id,
      region: verifiedConnection.region,
      resourceTypes: ["ALL"]
    },
    repository,
    { adapter }
  );

  assert.deepEqual(response.result.coverage, {
    status: "partial",
    unavailableServices: [
      {
        serviceKey: "iam",
        displayName: "IAM",
        reason: "permission_required",
        remedy: "open_settings"
      }
    ]
  });
  assert.doesNotMatch(
    JSON.stringify(response.result),
    /AccessDenied|arn:aws|iam:ListRoles|RequestId|private/iu
  );
});

test("preview의 서버 AWS SSO 만료는 Role 권한 안내가 아닌 재로그인 오류가 된다", async () => {
  const verifiedConnection = createVerifiedConnection();
  const repository = createRepository({
    async findVerifiedAwsConnection() {
      return verifiedConnection;
    }
  });

  await assert.rejects(
    createReverseEngineeringPreviewScan(
      {
        accessContext,
        awsConnectionId: verifiedConnection.id,
        region: verifiedConnection.region,
        resourceTypes: ["ALL"]
      },
      repository,
      {
        adapter: {
          async scan() {
            throw Object.assign(new Error("Could not load credentials from SSO /Users/private"), {
              name: "CredentialsProviderError"
            });
          }
        }
      }
    ),
    (error: unknown) =>
      error instanceof ReverseEngineeringScanFailedError &&
      error.internalCode === "caller_sso_session_expired" &&
      error.publicReason === "retry" &&
      /AWS SSO 로그인이 만료/u.test(error.message) &&
      /aws sso login/u.test(error.message) &&
      !/--profile|CredentialsProvider|\/Users\/private/iu.test(error.message)
  );
});

test("한글로 감싼 AWS SSO 만료도 Role 설정 오류로 바꾸지 않는다", () => {
  const classified = classifyReverseEngineeringConnectionFailure(
    Object.assign(new Error("AWS SSO 로그인이 만료되었습니다. aws sso login을 실행해 주세요."), {
      name: "CredentialsProviderError"
    })
  );

  assert.deepEqual(classified, {
    internalCode: "caller_sso_session_expired",
    publicReason: "retry",
    publicMessage:
      "AWS SSO 로그인이 만료되었습니다. 터미널에서 aws sso login을 실행한 뒤 다시 시도해 주세요."
  });
});

function createVerifiedConnection(): AwsConnection {
  return {
    id: "verified-connection",
    userId: "user-1",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "task8-external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function createScanRow(createdAt: Date): ReverseEngineeringScanRecord {
  return {
    id: "scan-1",
    projectId: "project-1",
    awsConnectionId: "verified-connection",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"],
    status: "running",
    result: null,
    errorSummary: null,
    startedAt: createdAt,
    completedAt: null,
    cancelRequestedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt
  };
}

// gg: 각 보안 테스트가 필요한 repository 경계만 바꿔 검증하게 합니다.
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
    // gg: preview 관심사가 아닌 테스트도 서버 영속 계약을 통과하게 합니다.
    async createPreview(input) {
      return {
        ...input,
        claimedAt: null,
        claimedProjectId: null,
        claimedScanId: null,
        claimedDraftId: null
      };
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
