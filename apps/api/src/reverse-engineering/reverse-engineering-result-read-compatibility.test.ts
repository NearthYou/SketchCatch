import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureJson,
  ReverseEngineeringScan,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import { toReverseEngineeringScanReadResponse } from "../routes/reverse-engineering.js";
import { findAnalysisExcludedTerraformConflicts } from "../services/terraform/analysis-excluded-terraform-guard.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";

const LEGACY_LAMBDA_ARN = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";

const architectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "legacy-lambda",
      type: "LAMBDA",
      label: LEGACY_LAMBDA_ARN,
      positionX: 120,
      positionY: 80,
      config: { legacyConfigMarker: "keep-lambda-raw" }
    },
    {
      id: "legacy-safe-bucket-node",
      type: "S3",
      label: "safe-bucket",
      positionX: 420,
      positionY: 80,
      config: {
        legacyConfigMarker: "keep-bucket-raw",
        providerResourceId: "sketchcatch-safe-bucket"
      }
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
        providerResourceId: LEGACY_LAMBDA_ARN,
        region: "ap-northeast-2",
        displayName: LEGACY_LAMBDA_ARN,
        resourceType: "LAMBDA",
        config: { functionName: "orders-handler", rawRuntime: "nodejs20.x" },
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
  const persistedArchitectureBeforeRead = structuredClone(legacyResult.architectureJson);
  const persistedLambdaBeforeRead = structuredClone(legacyResult.discoveredResources[0]);

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const lambdaNode = result.architectureJson.nodes.find((node) => node.id === "legacy-lambda");
  const bucketNode = result.architectureJson.nodes.find(
    (node) => node.id === "legacy-safe-bucket-node"
  );

  assert.equal("reverseEngineeringDraft" in legacyResult, false);
  assert.equal(result.scan, persistedScan);
  assert.equal(lambdaNode?.label, "orders-handler");
  assert.deepEqual(lambdaNode?.config, {
    functionName: "orders-handler",
    rawRuntime: "nodejs20.x",
    legacyConfigMarker: "keep-lambda-raw",
    providerResourceType: "AWS::Lambda::Function",
    providerResourceId: LEGACY_LAMBDA_ARN,
    analysisExcluded: true
  });
  assert.equal(bucketNode?.label, "safe-bucket");
  assert.equal(bucketNode?.config["legacyConfigMarker"], "keep-bucket-raw");
  assert.equal(bucketNode?.config["providerResourceId"], "sketchcatch-safe-bucket");
  assert.equal(bucketNode?.config["analysisExcluded"], false);
  assert.equal(result.reverseEngineeringDraft.architectureJson, result.architectureJson);
  assert.deepEqual(result.reverseEngineeringDraft.protectedValueKeys, [
    "providerResourceId",
    "providerResourceType",
    "region",
    "accountId",
    "terraformResourceName",
    "terraformResourceType"
  ]);
  assert.deepEqual(result.reverseEngineeringDraft.editableValueKeys, [
    "displayName",
    "description"
  ]);
  assert.equal(result.reverseEngineeringDraft.createdAt, "2026-07-17T01:01:00.000Z");
  assert.equal(result.importSuggestions[0]?.status, "manual_review");
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal("terraformAddress" in (result.importSuggestions[0] ?? {}), false);
  assert.equal("importCommand" in (result.importSuggestions[0] ?? {}), false);
  assert.equal("terraformBlockDraft" in (result.importSuggestions[0] ?? {}), false);
  assert.equal(result.importSuggestions[1], legacyResult.importSuggestions[1]);
  assert.equal(result.importSuggestions[2], legacyResult.importSuggestions[2]);
  assert.equal(legacyResult.importSuggestions[0]?.status, "ready");
  assert.equal(legacyResult.importSuggestions[0]?.handoffReady, true);
  assert.deepEqual(legacyResult.architectureJson, persistedArchitectureBeforeRead);
  assert.deepEqual(legacyResult.discoveredResources[0], persistedLambdaBeforeRead);
  assert.equal(legacyResult.discoveredResources[0]?.providerResourceId, LEGACY_LAMBDA_ARN);

  assert.deepEqual(
    findAnalysisExcludedTerraformConflicts(result.architectureJson, [
      {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "orders_handler"
      },
      {
        terraformBlockType: "resource",
        resourceType: "aws_s3_bucket",
        resourceName: "safe_bucket"
      }
    ]),
    [
      {
        nodeId: "legacy-lambda",
        resourceAddress: "aws_lambda_function.orders_handler",
        excludedResourceAddress: "aws_lambda_function"
      }
    ]
  );
});

test("과거 analysisExclusion만 남은 Resource도 실행 가능한 import handoff를 제거한다", () => {
  const legacyResult = createLegacyResult();
  legacyResult.analysisExclusions.push({
    id: "exclude-safe-bucket",
    resourceId: "safe-bucket",
    reason: "missing_required_data",
    message: "필수 정보가 부족합니다."
  });
  const persistedImportSuggestion = legacyResult.importSuggestions[2];

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const bucketNode = result.architectureJson.nodes.find(
    (node) => node.id === "legacy-safe-bucket-node"
  );
  const bucketImportSuggestion = result.importSuggestions.find(
    (suggestion) => suggestion.resourceId === "safe-bucket"
  );

  assert.equal(bucketNode?.config["analysisExcluded"], true);
  assert.deepEqual(bucketImportSuggestion, {
    id: "import-safe-bucket",
    resourceId: "safe-bucket",
    status: "manual_review",
    handoffReady: false,
    reason: "검토 전용 Resource는 Terraform import 또는 배포에 사용할 수 없습니다."
  });
  assert.equal(persistedImportSuggestion?.status, "ready");
  assert.equal(persistedImportSuggestion?.handoffReady, true);
});

test("유일하게 연결된 지원 Resource가 아닌 과거 import handoff는 안전하게 제거한다", () => {
  const unmatchedResult = createLegacyResult();
  unmatchedResult.importSuggestions.push({
    id: "import-missing-resource",
    resourceId: "missing-resource",
    status: "ready",
    handoffReady: true,
    terraformAddress: "aws_lambda_function.missing",
    importCommand: `terraform import aws_lambda_function.missing ${LEGACY_LAMBDA_ARN}`,
    terraformBlockDraft: 'resource "aws_lambda_function" "missing" {}'
  });

  const unmatchedReadResult = normalizeReverseEngineeringScanResult(persistedScan, unmatchedResult);
  const unmatchedSuggestion = unmatchedReadResult.importSuggestions.find(
    (suggestion) => suggestion.resourceId === "missing-resource"
  );

  assert.deepEqual(unmatchedSuggestion, {
    id: "import-missing-resource",
    resourceId: "missing-resource",
    status: "manual_review",
    handoffReady: false,
    reason: "검토 전용 Resource는 Terraform import 또는 배포에 사용할 수 없습니다."
  });

  const ambiguousResult = createLegacyResult();
  ambiguousResult.discoveredResources.push({
    ...structuredClone(ambiguousResult.discoveredResources[1]!),
    providerResourceId: "sketchcatch-safe-bucket-duplicate"
  });

  const ambiguousReadResult = normalizeReverseEngineeringScanResult(persistedScan, ambiguousResult);
  const ambiguousSuggestion = ambiguousReadResult.importSuggestions.find(
    (suggestion) => suggestion.resourceId === "safe-bucket"
  );

  assert.deepEqual(ambiguousSuggestion, {
    id: "import-safe-bucket",
    resourceId: "safe-bucket",
    status: "manual_review",
    handoffReady: false,
    reason: "검토 전용 Resource는 Terraform import 또는 배포에 사용할 수 없습니다."
  });
});

test("현재의 완전하고 안전한 draft는 결과를 읽어도 그대로 유지한다", () => {
  const safeArchitectureJson = normalizeReverseEngineeringScanResult(
    persistedScan,
    createLegacyResult()
  ).architectureJson;
  const currentDraft: ReverseEngineeringScanResult["reverseEngineeringDraft"] = {
    id: "draft-current",
    scanId: "scan-legacy",
    architectureJson: safeArchitectureJson,
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
  assert.equal(result.reverseEngineeringDraft.architectureJson, result.architectureJson);
  assert.equal(
    result.reverseEngineeringDraft.architectureJson.nodes[0]?.config["analysisExcluded"],
    true
  );
});

test("discovered Resource와 신뢰할 수 있게 연결되지 않는 과거 노드는 안전하게 검토 전용으로 닫는다", () => {
  const malformedResult = createLegacyResult();
  const malformedProviderResourceId =
    "arn:aws:lambda:ap-northeast-2:123456789012:function:unmatched-handler";
  const malformedArchitecture: ArchitectureJson = {
    nodes: [
      {
        id: "malformed-lambda-node",
        type: "LAMBDA",
        label: LEGACY_LAMBDA_ARN,
        positionX: 10,
        positionY: 20,
        config: {
          legacyConfigMarker: "keep-malformed-raw",
          providerResourceId: malformedProviderResourceId
        }
      }
    ],
    edges: []
  };
  malformedResult.architectureJson = malformedArchitecture;

  const result = normalizeReverseEngineeringScanResult(persistedScan, malformedResult);
  const node = result.architectureJson.nodes[0];

  assert.equal(node?.config["analysisExcluded"], true);
  assert.equal(node?.config["legacyConfigMarker"], "keep-malformed-raw");
  assert.equal(node?.config["providerResourceId"], malformedProviderResourceId);
  assert.equal(node?.config["functionName"], undefined);
  assert.equal(node?.config["rawRuntime"], undefined);
  assert.equal(node?.label, "orders-handler");
  assert.deepEqual(malformedResult.architectureJson, malformedArchitecture);
});

test("label에만 남은 unmatched ARN은 짧게 표시하되 raw provider identity를 보존한다", () => {
  const unmatchedResult = createLegacyResult();
  const unmatchedArchitecture: ArchitectureJson = {
    nodes: [
      {
        id: "unmatched-arn-only-lambda",
        type: "LAMBDA",
        label: LEGACY_LAMBDA_ARN,
        positionX: 10,
        positionY: 20,
        config: {
          legacyConfigMarker: "keep-arn-only-raw",
          providerResourceId: "   "
        }
      }
    ],
    edges: []
  };
  unmatchedResult.architectureJson = unmatchedArchitecture;

  const result = normalizeReverseEngineeringScanResult(persistedScan, unmatchedResult);
  const node = result.architectureJson.nodes[0];

  assert.equal(node?.label, "orders-handler");
  assert.equal(node?.config["analysisExcluded"], true);
  assert.equal(node?.config["providerResourceId"], LEGACY_LAMBDA_ARN);
  assert.equal(node?.config["legacyConfigMarker"], "keep-arn-only-raw");
  assert.deepEqual(unmatchedResult.architectureJson, unmatchedArchitecture);
});

test("서로 다른 strong identity를 가리키는 모호한 노드는 어느 discovered config도 상속하지 않는다", () => {
  const ambiguousResult = createLegacyResult();
  ambiguousResult.discoveredResources[1]!.config = {
    bucketRawMarker: "do-not-copy-from-bucket"
  };
  const ambiguousArchitecture: ArchitectureJson = {
    nodes: [
      {
        id: "legacy-lambda",
        type: "LAMBDA",
        label: "ambiguous-handler",
        positionX: 10,
        positionY: 20,
        config: {
          legacyConfigMarker: "keep-ambiguous-raw",
          providerResourceId: "sketchcatch-safe-bucket"
        }
      }
    ],
    edges: []
  };
  ambiguousResult.architectureJson = ambiguousArchitecture;

  const result = normalizeReverseEngineeringScanResult(persistedScan, ambiguousResult);
  const node = result.architectureJson.nodes[0];

  assert.equal(node?.config["analysisExcluded"], true);
  assert.equal(node?.config["legacyConfigMarker"], "keep-ambiguous-raw");
  assert.equal(node?.config["providerResourceId"], "sketchcatch-safe-bucket");
  assert.equal(node?.config["functionName"], undefined);
  assert.equal(node?.config["rawRuntime"], undefined);
  assert.equal(node?.config["bucketRawMarker"], undefined);
  assert.deepEqual(ambiguousResult.architectureJson, ambiguousArchitecture);
});

test("내부 ID가 유일해도 discovered provider identity가 중복되면 안전하게 검토 전용으로 닫는다", () => {
  const ambiguousResult = createLegacyResult();
  ambiguousResult.discoveredResources[1]!.config = {
    bucketRawMarker: "do-not-copy-from-bucket"
  };
  ambiguousResult.discoveredResources.push({
    id: "unknown-duplicate-provider",
    provider: "aws",
    providerResourceType: "AWS::Unknown::Resource",
    providerResourceId: "sketchcatch-safe-bucket",
    region: "ap-northeast-2",
    displayName: "duplicate-provider",
    resourceType: "UNKNOWN",
    config: { unknownRawMarker: "do-not-copy-from-unknown" },
    analysisExcluded: true
  });
  const ambiguousArchitecture: ArchitectureJson = {
    nodes: [
      {
        id: "safe-bucket",
        type: "S3",
        label: "safe-bucket",
        positionX: 10,
        positionY: 20,
        config: { legacyConfigMarker: "keep-provider-ambiguous-raw" }
      }
    ],
    edges: []
  };
  ambiguousResult.architectureJson = ambiguousArchitecture;

  const result = normalizeReverseEngineeringScanResult(persistedScan, ambiguousResult);
  const node = result.architectureJson.nodes[0];

  assert.equal(node?.config["analysisExcluded"], true);
  assert.equal(node?.config["legacyConfigMarker"], "keep-provider-ambiguous-raw");
  assert.equal(node?.config["providerResourceId"], undefined);
  assert.equal(node?.config["bucketRawMarker"], undefined);
  assert.equal(node?.config["unknownRawMarker"], undefined);
  assert.deepEqual(ambiguousResult.architectureJson, ambiguousArchitecture);
});

test("단일 스캔 GET 응답 도우미는 과거 결과를 보정한 값만 반환한다", () => {
  const legacyResult = createLegacyResult();

  const response = toReverseEngineeringScanReadResponse(persistedScan, legacyResult);

  assert.equal(response.result?.reverseEngineeringDraft.id, "draft-scan-legacy");
  assert.equal(response.result?.scan, persistedScan);
  assert.equal("reverseEngineeringDraft" in legacyResult, false);
});
