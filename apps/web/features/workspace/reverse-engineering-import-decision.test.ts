import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createReverseEngineeringImportDecisionOptions,
  createReverseEngineeringImportDecisionRequest,
  isReverseEngineeringImportDecisionComplete
} from "./reverse-engineering-import-decision";

test("importSuggestions를 기준으로 가져올 수 있는 리소스와 확인만 할 리소스를 나눈다", () => {
  const result = scanResult();
  const options = createReverseEngineeringImportDecisionOptions(result, [
    "ready-resource",
    "review-resource",
    "unsupported-resource"
  ]);

  assert.deepEqual(options.ready, [{ id: "ready-resource", label: "고객 파일", status: "ready" }]);
  assert.deepEqual(options.reviewOnly, [
    { id: "review-resource", label: "암호화 키", status: "manual_review" },
    {
      id: "unsupported-resource",
      label: "알 수 없는 장치",
      status: "unsupported_resource_type"
    }
  ]);
  assert.deepEqual(options.invalidResourceIds, []);
});

test("현재 보드 적용 범위 밖의 리소스는 결정 요청에서 제외한다", () => {
  const options = createReverseEngineeringImportDecisionOptions(scanResult(), [
    "ready-resource",
    "review-resource"
  ]);
  const request = createReverseEngineeringImportDecisionRequest({
    options,
    selectedReadyResourceIds: ["ready-resource", "unsupported-resource"],
    acknowledgedReviewOnlyResourceIds: ["review-resource", "unsupported-resource"]
  });

  assert.deepEqual(request, {
    version: 1,
    selectedReadyResourceIds: ["ready-resource"],
    acknowledgedReviewOnlyResourceIds: ["review-resource"]
  });
});

test("확인만 가능한 리소스를 모두 확인하고 결과가 모호하지 않아야 적용할 수 있다", () => {
  const options = createReverseEngineeringImportDecisionOptions(scanResult(), [
    "ready-resource",
    "review-resource",
    "unsupported-resource"
  ]);

  assert.equal(isReverseEngineeringImportDecisionComplete(options, []), false);
  assert.equal(
    isReverseEngineeringImportDecisionComplete(options, [
      "review-resource",
      "unsupported-resource"
    ]),
    true
  );

  const invalidOptions = createReverseEngineeringImportDecisionOptions(scanResult(), [
    "missing-resource"
  ]);
  assert.deepEqual(invalidOptions.invalidResourceIds, ["missing-resource"]);
  assert.equal(isReverseEngineeringImportDecisionComplete(invalidOptions, []), false);
});

function scanResult(): ReverseEngineeringScanResult {
  const discoveredResources = [
    {
      id: "ready-resource",
      provider: "aws" as const,
      providerResourceType: "AWS::S3::Bucket",
      providerResourceId: "bucket-1",
      region: "ap-northeast-2",
      displayName: "고객 파일",
      resourceType: "S3" as const,
      config: {}
    },
    {
      id: "review-resource",
      provider: "aws" as const,
      providerResourceType: "AWS::KMS::Key",
      providerResourceId: "key-1",
      region: "ap-northeast-2",
      displayName: "암호화 키",
      resourceType: "KMS_KEY" as const,
      config: {},
      analysisExcluded: false
    },
    {
      id: "unsupported-resource",
      provider: "aws" as const,
      providerResourceType: "AWS::Unknown::Device",
      providerResourceId: "device-1",
      region: "ap-northeast-2",
      displayName: "알 수 없는 장치",
      resourceType: "UNKNOWN" as const,
      config: {},
      analysisExcluded: false
    }
  ];

  return {
    scan: {
      id: "scan-1",
      projectId: "project-1",
      awsConnectionId: "connection-1",
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["ALL"],
      status: "completed",
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
      startedAt: "2026-07-23T00:00:00.000Z",
      completedAt: "2026-07-23T00:00:00.000Z",
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null
    },
    architectureJson: { nodes: [], edges: [] },
    reverseEngineeringDraft: {
      id: "draft-1",
      scanId: "scan-1",
      architectureJson: { nodes: [], edges: [] },
      protectedValueKeys: [],
      editableValueKeys: [],
      createdAt: "2026-07-23T00:00:00.000Z"
    },
    discoveredResources,
    findings: [],
    analysisExclusions: [],
    importSuggestions: [
      {
        id: "suggestion-ready",
        resourceId: "ready-resource",
        status: "ready",
        handoffReady: true
      },
      {
        id: "suggestion-review",
        resourceId: "review-resource",
        status: "manual_review",
        handoffReady: false
      },
      {
        id: "suggestion-unsupported",
        resourceId: "unsupported-resource",
        status: "unsupported_resource_type",
        handoffReady: false
      }
    ],
    scanErrors: []
  };
}
