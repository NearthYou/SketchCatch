import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureJson,
  ReverseEngineeringScan,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import { toReverseEngineeringScanReadResponse } from "../routes/reverse-engineering.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";

const architectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "legacy-lambda",
      type: "LAMBDA",
      label: "orders-handler",
      positionX: 120,
      positionY: 80,
      config: {}
    }
  ],
  edges: []
};

const persistedScan: ReverseEngineeringScan = {
  id: "scan-legacy",
  projectId: "project-legacy",
  awsConnectionId: "connection-legacy",
  provider: "aws",
  region: "ap-northeast-2",
  resourceTypes: ["ALL"],
  status: "completed",
  createdAt: "2026-07-17T01:00:00.000Z",
  updatedAt: "2026-07-17T01:02:00.000Z",
  startedAt: "2026-07-17T01:00:00.000Z",
  completedAt: "2026-07-17T01:01:00.000Z",
  cancelRequestedAt: null,
  deletedAt: null,
  errorSummary: null
};

type LegacyReverseEngineeringScanResult = Omit<
  ReverseEngineeringScanResult,
  "scan" | "reverseEngineeringDraft"
> & {
  readonly scan: ReverseEngineeringScan;
};

function createLegacyResult(): LegacyReverseEngineeringScanResult {
  return {
    scan: { ...persistedScan, id: "scan-stale" },
    discoveredResources: [
      {
        id: "legacy-lambda",
        provider: "aws",
        providerResourceType: "AWS::Lambda::Function",
        providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
        region: "ap-northeast-2",
        displayName: "orders-handler",
        resourceType: "LAMBDA",
        config: {},
        analysisExcluded: true
      },
      {
        id: "safe-bucket",
        provider: "aws",
        providerResourceType: "AWS::S3::Bucket",
        providerResourceId: "sketchcatch-safe-bucket",
        region: "ap-northeast-2",
        displayName: "safe-bucket",
        resourceType: "S3",
        config: {}
      }
    ],
    architectureJson,
    findings: [],
    analysisExclusions: [
      {
        id: "exclude-legacy-lambda",
        resourceId: "legacy-lambda",
        reason: "unsupported_resource_type",
        message: "지원하지 않는 Resource입니다."
      }
    ],
    importSuggestions: [
      {
        id: "import-legacy-lambda",
        resourceId: "legacy-lambda",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_lambda_function.orders_handler",
        importCommand:
          "terraform import aws_lambda_function.orders_handler arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
        terraformBlockDraft: 'resource "aws_lambda_function" "orders_handler" {}'
      },
      {
        id: "import-safe-unknown",
        resourceId: "unknown-resource",
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "이미 안전하게 제외됐습니다."
      },
      {
        id: "import-safe-bucket",
        resourceId: "safe-bucket",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_s3_bucket.safe_bucket",
        importCommand: "terraform import aws_s3_bucket.safe_bucket sketchcatch-safe-bucket",
        terraformBlockDraft: 'resource "aws_s3_bucket" "safe_bucket" {}'
      }
    ],
    scanErrors: []
  };
}

test("과거 draft 없는 결과는 원본을 바꾸지 않고 안정적인 호환 draft를 만든다", () => {
  const legacyResult = createLegacyResult();

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);

  assert.equal("reverseEngineeringDraft" in legacyResult, false);
  assert.equal(result.scan, persistedScan);
  assert.deepEqual(result.reverseEngineeringDraft, {
    id: "draft-scan-legacy",
    scanId: "scan-legacy",
    architectureJson,
    protectedValueKeys: [
      "providerResourceId",
      "providerResourceType",
      "region",
      "accountId",
      "terraformResourceName",
      "terraformResourceType"
    ],
    editableValueKeys: ["displayName", "description"],
    createdAt: "2026-07-17T01:01:00.000Z"
  });
  assert.equal(result.importSuggestions[0]?.status, "manual_review");
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal("terraformAddress" in (result.importSuggestions[0] ?? {}), false);
  assert.equal("importCommand" in (result.importSuggestions[0] ?? {}), false);
  assert.equal("terraformBlockDraft" in (result.importSuggestions[0] ?? {}), false);
  assert.equal(result.importSuggestions[1], legacyResult.importSuggestions[1]);
  assert.equal(result.importSuggestions[2], legacyResult.importSuggestions[2]);
  assert.equal(legacyResult.importSuggestions[0]?.status, "ready");
  assert.equal(legacyResult.importSuggestions[0]?.handoffReady, true);
});

test("현재의 완전한 draft는 결과를 읽어도 그대로 유지한다", () => {
  const currentDraft: ReverseEngineeringScanResult["reverseEngineeringDraft"] = {
    id: "draft-current",
    scanId: "scan-legacy",
    architectureJson,
    protectedValueKeys: ["providerResourceId"],
    editableValueKeys: ["displayName"],
    createdAt: "2026-07-17T01:00:30.000Z"
  };
  const currentResult: ReverseEngineeringScanResult = {
    ...createLegacyResult(),
    scan: { ...persistedScan, id: "scan-stale" },
    reverseEngineeringDraft: currentDraft
  };

  const result = normalizeReverseEngineeringScanResult(persistedScan, currentResult);

  assert.equal(result.reverseEngineeringDraft, currentDraft);
  assert.equal(result.scan, persistedScan);
});

test("구조가 깨진 과거 draft는 보존하지 않고 호환 draft로 다시 만든다", () => {
  const malformedResult: Omit<ReverseEngineeringScanResult, "reverseEngineeringDraft"> & {
    reverseEngineeringDraft: {
      id: string;
      scanId: string;
      architectureJson: unknown;
      protectedValueKeys: string[];
      editableValueKeys: string[];
      createdAt: string;
    };
  } = {
    ...createLegacyResult(),
    reverseEngineeringDraft: {
      id: "draft-malformed",
      scanId: "scan-legacy",
      architectureJson: { nodes: [null], edges: [] },
      protectedValueKeys: ["providerResourceId"],
      editableValueKeys: ["displayName"],
      createdAt: "2026-07-17T01:00:30.000Z"
    }
  };

  const result = normalizeReverseEngineeringScanResult(persistedScan, malformedResult);

  assert.equal(result.reverseEngineeringDraft.id, "draft-scan-legacy");
  assert.equal(result.reverseEngineeringDraft.architectureJson, architectureJson);
});

test("단일 스캔 GET 응답 도우미는 과거 결과를 보정한 값만 반환한다", () => {
  const legacyResult = createLegacyResult();

  const response = toReverseEngineeringScanReadResponse(persistedScan, legacyResult);

  assert.equal(response.result?.reverseEngineeringDraft.id, "draft-scan-legacy");
  assert.equal(response.result?.scan, persistedScan);
  assert.equal("reverseEngineeringDraft" in legacyResult, false);
});
