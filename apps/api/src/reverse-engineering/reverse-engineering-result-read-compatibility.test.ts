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
    architectureJson: structuredClone(architectureJson),
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

test("과거 저장 결과를 읽어도 공개 응답에는 AWS ARN을 남기지 않는다", () => {
  const result = normalizeReverseEngineeringScanResult(persistedScan, createLegacyResult());

  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
  assert.match(result.discoveredResources[0]?.providerResourceId ?? "", /^aws-ref-[a-f0-9]{24}$/u);
  assert.equal(result.importSuggestions[0]?.handoffReady, false);
  assert.equal(result.importSuggestions[0]?.importCommand, undefined);
  assert.ok(result.importSuggestions.every((suggestion) => suggestion.importCommand === undefined));
});

test("과거 저장된 KMS Log Group도 읽는 순간 관리와 import를 다시 차단한다", () => {
  const legacyResult = createLegacyResult();
  const logGroupArn =
    "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders:*";
  const kmsKeyArn =
    "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555";
  const resourceId = "legacy-kms-log-group";

  legacyResult.discoveredResources.push({
    id: resourceId,
    provider: "aws",
    providerResourceType: "AWS::Logs::LogGroup",
    providerResourceId: logGroupArn,
    region: "ap-northeast-2",
    displayName: "/ecs/orders",
    resourceType: "CLOUDWATCH_LOG_GROUP",
    config: {
      logGroupName: "/ecs/orders",
      retentionInDays: 30,
      kmsKeyId: kmsKeyArn
    }
  });
  legacyResult.architectureJson.nodes.push({
    id: resourceId,
    type: "CLOUDWATCH_LOG_GROUP",
    label: "/ecs/orders",
    positionX: 720,
    positionY: 80,
    config: {
      providerResourceType: "AWS::Logs::LogGroup",
      providerResourceId: logGroupArn,
      logGroupName: "/ecs/orders",
      retentionInDays: 30,
      kmsKeyId: kmsKeyArn,
      reverseEngineeringManagement: "managed",
      terraformBlockType: "resource",
      terraformResourceType: "aws_cloudwatch_log_group",
      terraformResourceName: "legacy_kms_log_group",
      terraformFileName: "reverse-engineering"
    }
  });
  legacyResult.importSuggestions.push({
    id: "import-legacy-kms-log-group",
    resourceId,
    status: "ready",
    handoffReady: true,
    terraformAddress: "aws_cloudwatch_log_group.legacy_kms_log_group",
    importCommand:
      "terraform import aws_cloudwatch_log_group.legacy_kms_log_group /ecs/orders",
    terraformBlockDraft:
      'resource "aws_cloudwatch_log_group" "legacy_kms_log_group" {}'
  });

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const resource = result.discoveredResources.at(-1);
  const node = result.architectureJson.nodes.at(-1);
  const suggestion = result.importSuggestions.at(-1);

  assert.equal(resource?.analysisExcluded, true);
  assert.deepEqual(resource?.config, {
    logGroupName: "/ecs/orders",
    retentionInDays: 30,
    hasKmsKey: true
  });
  assert.equal(node?.config["analysisExcluded"], true);
  assert.equal(node?.config["reverseEngineeringManagement"], "needs_mapping");
  assert.equal(node?.config["terraformResourceType"], undefined);
  assert.equal(node?.config["terraformResourceName"], undefined);
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.terraformAddress, undefined);
  assert.equal(suggestion?.importCommand, undefined);
  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
});

test("CloudFormation 소유 Resource는 읽는 순간 Terraform 편집 대상으로 표시하지 않는다", () => {
  const legacyResult = createLegacyResult();
  const bucket = legacyResult.discoveredResources.find((resource) => resource.id === "safe-bucket");
  const bucketNode = legacyResult.architectureJson.nodes.find(
    (node) => node.id === "legacy-safe-bucket-node"
  );

  assert.ok(bucket);
  assert.ok(bucketNode);

  bucket.config = {
    tags: [
      { key: "aws:cloudformation:stack-name", value: "customer-production" },
      { key: "Environment", value: "production" }
    ]
  };
  bucketNode.config = {
    ...bucketNode.config,
    reverseEngineeringManagement: "managed",
    terraformBlockType: "resource",
    terraformResourceType: "aws_s3_bucket",
    terraformResourceName: "safe_bucket",
    terraformFileName: "reverse-engineering"
  };

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const publicBucket = result.discoveredResources.find((resource) => resource.id === "safe-bucket");
  const publicBucketNode = result.architectureJson.nodes.find(
    (node) => node.id === "legacy-safe-bucket-node"
  );
  const suggestion = result.importSuggestions.find(
    (item) => item.resourceId === "safe-bucket"
  );

  assert.equal(publicBucket?.analysisExcluded, true);
  assert.equal(publicBucket?.importSuggestionStatus, undefined);
  assert.equal(publicBucketNode?.config["analysisExcluded"], true);
  assert.equal(publicBucketNode?.config["reverseEngineeringManagement"], "reference");
  assert.equal(publicBucketNode?.config["terraformResourceType"], undefined);
  assert.equal(publicBucketNode?.config["terraformResourceName"], undefined);
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.terraformAddress, undefined);
  assert.equal(suggestion?.importCommand, undefined);
});

test("과거 저장된 Action과 Metric Query Alarm도 읽는 순간 관리와 import를 다시 차단한다", () => {
  const legacyResult = createLegacyResult();
  const alarmArn =
    "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:notify-ops";
  const resourceId = "legacy-cloudwatch-alarm";

  legacyResult.discoveredResources.push({
    id: resourceId,
    provider: "aws",
    providerResourceType: "AWS::CloudWatch::Alarm",
    providerResourceId: alarmArn,
    region: "ap-northeast-2",
    displayName: "notify-ops",
    resourceType: "CLOUDWATCH_METRIC_ALARM",
    config: {
      alarmName: "notify-ops",
      alarmActions: ["arn:aws:sns:ap-northeast-2:123456789012:ops"],
      metrics: [{ Id: "e1", Expression: "SUM(METRICS())" }]
    }
  });
  legacyResult.architectureJson.nodes.push({
    id: resourceId,
    type: "CLOUDWATCH_METRIC_ALARM",
    label: "notify-ops",
    positionX: 720,
    positionY: 80,
    config: {
      providerResourceType: "AWS::CloudWatch::Alarm",
      providerResourceId: alarmArn,
      alarmName: "notify-ops",
      alarmActions: ["arn:aws:sns:ap-northeast-2:123456789012:ops"],
      metrics: [{ Id: "e1", Expression: "SUM(METRICS())" }],
      reverseEngineeringManagement: "managed",
      terraformBlockType: "resource",
      terraformResourceType: "aws_cloudwatch_metric_alarm",
      terraformResourceName: "legacy_cloudwatch_alarm",
      terraformFileName: "reverse-engineering"
    }
  });
  legacyResult.importSuggestions.push({
    id: "import-legacy-cloudwatch-alarm",
    resourceId,
    status: "ready",
    handoffReady: true,
    terraformAddress: "aws_cloudwatch_metric_alarm.legacy_cloudwatch_alarm",
    importCommand:
      "terraform import aws_cloudwatch_metric_alarm.legacy_cloudwatch_alarm notify-ops",
    terraformBlockDraft:
      'resource "aws_cloudwatch_metric_alarm" "legacy_cloudwatch_alarm" {}'
  });

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const resource = result.discoveredResources.at(-1);
  const node = result.architectureJson.nodes.at(-1);
  const suggestion = result.importSuggestions.at(-1);

  assert.equal(resource?.analysisExcluded, true);
  assert.deepEqual(resource?.config, {
    alarmName: "notify-ops",
    hasActionTargets: true,
    hasMetricQueries: true
  });
  assert.equal(node?.config["analysisExcluded"], true);
  assert.equal(node?.config["reverseEngineeringManagement"], "needs_mapping");
  assert.equal(node?.config["terraformResourceType"], undefined);
  assert.equal(node?.config["terraformResourceName"], undefined);
  assert.equal(suggestion?.status, "manual_review");
  assert.equal(suggestion?.handoffReady, false);
  assert.equal(suggestion?.terraformAddress, undefined);
  assert.equal(suggestion?.importCommand, undefined);
  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
});

test("과거 raw ARN 내부 ID와 진단 참조도 하나의 공개 ID로 다시 연결한다", () => {
  const legacyResult = createLegacyResult();
  legacyResult.discoveredResources[0]!.id = LEGACY_LAMBDA_ARN;
  legacyResult.discoveredResources[1]!.relationships = [
    { type: "depends_on", targetResourceId: LEGACY_LAMBDA_ARN }
  ];
  legacyResult.architectureJson = {
    nodes: [
      { ...legacyResult.architectureJson.nodes[0]!, id: LEGACY_LAMBDA_ARN },
      legacyResult.architectureJson.nodes[1]!
    ],
    edges: [
      {
        id: `edge-${LEGACY_LAMBDA_ARN}`,
        sourceId: LEGACY_LAMBDA_ARN,
        targetId: "legacy-safe-bucket-node",
        label: "depends_on"
      }
    ]
  };
  legacyResult.findings = [
    {
      id: `finding-${LEGACY_LAMBDA_ARN}`,
      category: "permission",
      severity: "medium",
      resourceId: LEGACY_LAMBDA_ARN,
      title: "AccessDeniedException",
      description: `iam:ListRoles failed for ${LEGACY_LAMBDA_ARN} RequestId private`,
      recommendation: '{"Action":"iam:ListRoles","Resource":"*"}'
    }
  ];
  legacyResult.analysisExclusions[0] = {
    ...legacyResult.analysisExclusions[0]!,
    id: `exclude-${LEGACY_LAMBDA_ARN}`,
    resourceId: LEGACY_LAMBDA_ARN,
    message: `AccessDenied ${LEGACY_LAMBDA_ARN} iam:ListRoles`
  };
  legacyResult.importSuggestions[0] = {
    ...legacyResult.importSuggestions[0]!,
    id: `import-${LEGACY_LAMBDA_ARN}`,
    resourceId: LEGACY_LAMBDA_ARN
  };

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const lambda = result.discoveredResources[0];
  const bucket = result.discoveredResources[1];

  assert.ok(lambda);
  assert.equal(result.architectureJson.nodes[0]?.id, lambda.id);
  assert.equal(result.architectureJson.edges[0]?.sourceId, lambda.id);
  assert.equal(bucket?.relationships?.[0]?.targetResourceId, lambda.id);
  assert.equal(result.findings[0]?.resourceId, lambda.id);
  assert.equal(result.analysisExclusions[0]?.resourceId, lambda.id);
  assert.equal(result.importSuggestions[0]?.resourceId, lambda.id);
  assert.doesNotMatch(
    JSON.stringify(result),
    /arn:aws|AccessDenied|RequestId|iam:ListRoles|"(?:Action|Resource)"/iu
  );
});

test("과거 ARN 정규화 ID와 파생 참조도 raw provider ID 기준의 canonical 공개 ID로 바꾼다", () => {
  const legacyResult = createLegacyResult();
  const legacyResourceId =
    "resource-arn-aws-lambda-ap-northeast-2-123456789012-function-orders-handler";
  legacyResult.discoveredResources[0]!.id = legacyResourceId;
  legacyResult.discoveredResources[1]!.relationships = [
    { type: "depends_on", targetResourceId: legacyResourceId }
  ];
  legacyResult.architectureJson = {
    nodes: [
      { ...legacyResult.architectureJson.nodes[0]!, id: legacyResourceId },
      legacyResult.architectureJson.nodes[1]!
    ],
    edges: [
      {
        id: `edge-${legacyResourceId}-legacy-safe-bucket-node-depends-on`,
        sourceId: legacyResourceId,
        targetId: "legacy-safe-bucket-node",
        label: "depends_on"
      }
    ]
  };
  legacyResult.findings = [
    {
      id: `finding-${legacyResourceId}`,
      category: "permission",
      severity: "medium",
      resourceId: legacyResourceId,
      title: "확인이 필요합니다.",
      description: "가져온 Resource를 확인해 주세요.",
      recommendation: "설정을 확인해 주세요."
    }
  ];
  legacyResult.analysisExclusions[0] = {
    ...legacyResult.analysisExclusions[0]!,
    id: `analysis-exclusion-${legacyResourceId}`,
    resourceId: legacyResourceId
  };
  legacyResult.importSuggestions[0] = {
    ...legacyResult.importSuggestions[0]!,
    id: `import-${legacyResourceId}`,
    resourceId: legacyResourceId
  };

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const lambda = result.discoveredResources[0];

  assert.ok(lambda);
  assert.match(lambda.id, /^resource-aws-ref-[a-f0-9]{24}$/u);
  assert.equal(result.architectureJson.nodes[0]?.id, lambda.id);
  assert.equal(result.architectureJson.edges[0]?.sourceId, lambda.id);
  assert.match(result.architectureJson.edges[0]?.id ?? "", new RegExp(lambda.id));
  assert.equal(result.discoveredResources[1]?.relationships?.[0]?.targetResourceId, lambda.id);
  assert.equal(result.findings[0]?.resourceId, lambda.id);
  assert.match(result.findings[0]?.id ?? "", new RegExp(lambda.id));
  assert.equal(result.analysisExclusions[0]?.resourceId, lambda.id);
  assert.match(result.analysisExclusions[0]?.id ?? "", new RegExp(lambda.id));
  assert.equal(result.importSuggestions[0]?.resourceId, lambda.id);
  assert.match(result.importSuggestions[0]?.id ?? "", new RegExp(lambda.id));
  assert.doesNotMatch(JSON.stringify(result), /123456789012|resource-arn-aws-lambda/iu);
});

test("과거 draft 없는 결과는 원본을 바꾸지 않고 안정적인 호환 draft를 만든다", () => {
  const legacyResult = createLegacyResult();
  const persistedArchitectureBeforeRead = structuredClone(legacyResult.architectureJson);
  const persistedLambdaBeforeRead = structuredClone(legacyResult.discoveredResources[0]);

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);
  const publicLambdaId = result.discoveredResources[0]?.id;
  assert.ok(publicLambdaId);
  const lambdaNode = result.architectureJson.nodes.find((node) => node.id === publicLambdaId);
  const bucketNode = result.architectureJson.nodes.find(
    (node) => node.id === "legacy-safe-bucket-node"
  );

  assert.equal("reverseEngineeringDraft" in legacyResult, false);
  assert.equal(result.scan, persistedScan);
  assert.equal(lambdaNode?.label, "orders-handler");
  assert.deepEqual(lambdaNode?.config, {
    functionName: "orders-handler",
    reverseEngineeringManagement: "needs_mapping",
    providerResourceType: "AWS::Lambda::Function",
    providerResourceId: result.discoveredResources[0]?.providerResourceId,
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
  assert.deepEqual(result.importSuggestions[2], {
    id: "import-safe-bucket",
    resourceId: "safe-bucket",
    status: "ready",
    handoffReady: true,
    terraformAddress: "aws_s3_bucket.safe_bucket",
    terraformBlockDraft: 'resource "aws_s3_bucket" "safe_bucket" {}'
  });
  assert.match(legacyResult.importSuggestions[2]?.importCommand ?? "", /^terraform import /u);
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
        nodeId: publicLambdaId,
        resourceAddress: "aws_lambda_function.orders_handler",
        excludedResourceAddress: "aws_lambda_function"
      }
    ]
  );
});

test("과거 스캔의 AWS 원문 오류도 읽을 때 서비스 단위 안전 안내로 바꾼다", () => {
  const legacyResult = createLegacyResult();
  legacyResult.scanErrors.push({
    id: "legacy-raw-iam-error",
    serviceKey: "iam",
    resourceType: "UNKNOWN",
    stage: "provider_api",
    reason: "permission_denied",
    message: "AccessDenied arn:aws:iam::123456789012:role/private iam:ListRoles RequestId hidden",
    retryable: false
  });

  const result = normalizeReverseEngineeringScanResult(persistedScan, legacyResult);

  assert.deepEqual(result.coverage, {
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
    JSON.stringify({ coverage: result.coverage, scanErrors: result.scanErrors }),
    /AccessDenied|arn:aws|iam:ListRoles|RequestId|hidden/iu
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

test("현재의 완전하고 안전한 draft는 호환 보정 후에도 내용을 유지한다", () => {
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

  assert.deepEqual(result.reverseEngineeringDraft, currentDraft);
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
  assert.equal(node?.config["legacyConfigMarker"], undefined);
  assert.match(String(node?.config["providerResourceId"]), /^aws-ref-[a-f0-9]{24}$/u);
  assert.equal(node?.config["functionName"], undefined);
  assert.equal(node?.config["rawRuntime"], undefined);
  assert.equal(node?.label, "orders-handler");
  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
  assert.deepEqual(malformedResult.architectureJson, malformedArchitecture);
});

test("label에만 남은 unmatched ARN은 짧은 이름과 opaque identity로 공개한다", () => {
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
  assert.match(String(node?.config["providerResourceId"]), /^aws-ref-[a-f0-9]{24}$/u);
  assert.equal(node?.config["legacyConfigMarker"], undefined);
  assert.doesNotMatch(JSON.stringify(result), /arn:aws/iu);
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
  assert.equal(node?.config["legacyConfigMarker"], undefined);
  assert.match(String(node?.config["providerResourceId"]), /^aws-ref-[a-f0-9]{24}$/u);
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
