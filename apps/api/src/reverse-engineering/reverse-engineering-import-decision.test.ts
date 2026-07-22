import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiagramJson,
  ReverseEngineeringImportDecisionRequest,
  ReverseEngineeringImportSuggestionStatus,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import {
  ReverseEngineeringImportDecisionValidationError,
  validateAndStampReverseEngineeringImportDecisions,
  type ReverseEngineeringImportDecisionValidationReason
} from "./reverse-engineering-import-decision.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";

const PRIVATE_READY_ARN = "arn:aws:s3:::private-ready-customer-bucket";
const PRIVATE_UNSELECTED_ARN = "arn:aws:s3:::private-unselected-customer-bucket";

test("서버가 확인한 import 상태만 적용 source node metadata에 기록한다", () => {
  const storedScanResult = createStoredScanResult();
  const publicResult = normalizeReverseEngineeringScanResult(
    storedScanResult.scan,
    storedScanResult
  );
  const resourceIds = publicResourceIdsByStatus(publicResult);
  const diagramJson = createDiagram(publicResult);
  const originalDiagram = structuredClone(diagramJson);
  const request: ReverseEngineeringImportDecisionRequest = {
    version: 1,
    selectedReadyResourceIds: [resourceIds.ready[0]!],
    acknowledgedReviewOnlyResourceIds: [
      resourceIds.manual_review[0]!,
      resourceIds.unsupported_resource_type[0]!
    ]
  };

  const stamped = validateAndStampReverseEngineeringImportDecisions({
    request,
    diagramJson,
    appliedSourceNodeIds: publicResult.importSuggestions.map((suggestion) => suggestion.resourceId),
    storedScanResult
  });

  assert.deepEqual(readImportDecision(stamped, resourceIds.ready[0]!), {
    version: 1,
    mode: "import_existing",
    statusAtConfirmation: "ready"
  });
  assert.deepEqual(readImportDecision(stamped, resourceIds.ready[1]!), {
    version: 1,
    mode: "observe_only",
    statusAtConfirmation: "ready"
  });
  assert.deepEqual(readImportDecision(stamped, resourceIds.manual_review[0]!), {
    version: 1,
    mode: "observe_only",
    statusAtConfirmation: "manual_review"
  });
  assert.deepEqual(readImportDecision(stamped, resourceIds.unsupported_resource_type[0]!), {
    version: 1,
    mode: "observe_only",
    statusAtConfirmation: "unsupported_resource_type"
  });
  assert.deepEqual(diagramJson, originalDiagram);
  assert.doesNotMatch(
    JSON.stringify(stamped.nodes.map((node) => node.metadata?.reverseEngineering?.importDecision)),
    /terraform import|arn:aws:/u
  );
});

test("지원하지 않는 request version과 배열이 아닌 request 필드를 거부한다", () => {
  const fixture = createDecisionFixture();

  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        version: 2
      } as unknown as ReverseEngineeringImportDecisionRequest
    },
    "invalid_request"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        version: 1,
        selectedReadyResourceIds: "not-an-array",
        acknowledgedReviewOnlyResourceIds: []
      } as unknown as ReverseEngineeringImportDecisionRequest
    },
    "invalid_request"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        clientStatus: "ready"
      } as ReverseEngineeringImportDecisionRequest
    },
    "invalid_request"
  );
});

test("request의 중복 ID와 두 목록에 겹친 ID를 거부한다", () => {
  const fixture = createDecisionFixture();
  const readyId = fixture.resourceIds.ready[0]!;
  const manualId = fixture.resourceIds.manual_review[0]!;

  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        selectedReadyResourceIds: [readyId, readyId]
      }
    },
    "duplicate_resource_id"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        acknowledgedReviewOnlyResourceIds: [manualId, manualId]
      }
    },
    "duplicate_resource_id"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        acknowledgedReviewOnlyResourceIds: [
          ...fixture.input.request.acknowledgedReviewOnlyResourceIds,
          readyId
        ]
      }
    },
    "overlapping_resource_id"
  );
});

test("unknown ID, private ID, 적용 source 범위 밖의 공개 ID를 거부한다", () => {
  const fixture = createDecisionFixture();
  const readyId = fixture.resourceIds.ready[0]!;
  const privateReadyId = fixture.storedScanResult.importSuggestions[0]!.resourceId;

  assert.notEqual(readyId, privateReadyId);
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        selectedReadyResourceIds: ["unknown-public-resource"]
      }
    },
    "unknown_resource_id"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        selectedReadyResourceIds: [privateReadyId]
      }
    },
    "unknown_resource_id"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      appliedSourceNodeIds: fixture.input.appliedSourceNodeIds.filter(
        (resourceId) => resourceId !== readyId
      )
    },
    "resource_outside_applied_set"
  );
});

test("manual_review와 unsupported_resource_type은 각각 명시적 확인이 없으면 거부한다", () => {
  const fixture = createDecisionFixture();
  const manualId = fixture.resourceIds.manual_review[0]!;
  const unsupportedId = fixture.resourceIds.unsupported_resource_type[0]!;

  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        acknowledgedReviewOnlyResourceIds:
          fixture.input.request.acknowledgedReviewOnlyResourceIds.filter(
            (resourceId) => resourceId !== manualId
          )
      }
    },
    "missing_review_acknowledgement"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        acknowledgedReviewOnlyResourceIds:
          fixture.input.request.acknowledgedReviewOnlyResourceIds.filter(
            (resourceId) => resourceId !== unsupportedId
          )
      }
    },
    "missing_review_acknowledgement"
  );
});

test("ready가 아닌 선택과 ready에 대한 review-only 확인을 거부한다", () => {
  const fixture = createDecisionFixture();
  const readyId = fixture.resourceIds.ready[1]!;
  const manualId = fixture.resourceIds.manual_review[0]!;

  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        selectedReadyResourceIds: [manualId],
        acknowledgedReviewOnlyResourceIds:
          fixture.input.request.acknowledgedReviewOnlyResourceIds.filter(
            (resourceId) => resourceId !== manualId
          )
      }
    },
    "resource_not_ready"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      request: {
        ...fixture.input.request,
        acknowledgedReviewOnlyResourceIds: [
          ...fixture.input.request.acknowledgedReviewOnlyResourceIds,
          readyId
        ]
      }
    },
    "resource_not_review_only"
  );
});

test("적용 source ID나 저장 suggestion이 중복·누락되어 모호하면 거부한다", () => {
  const fixture = createDecisionFixture();
  const readyId = fixture.resourceIds.ready[0]!;

  assertDecisionRejects(
    {
      ...fixture.input,
      appliedSourceNodeIds: [...fixture.input.appliedSourceNodeIds, readyId]
    },
    "invalid_applied_source"
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      diagramJson: {
        ...fixture.input.diagramJson,
        nodes: fixture.input.diagramJson.nodes.filter((node) => node.id !== readyId)
      }
    },
    "invalid_applied_source"
  );

  const duplicatedStoredResult = structuredClone(fixture.storedScanResult);
  duplicatedStoredResult.importSuggestions.push(
    structuredClone(duplicatedStoredResult.importSuggestions[0]!)
  );
  assertDecisionRejects(
    {
      ...fixture.input,
      storedScanResult: duplicatedStoredResult
    },
    "invalid_server_suggestion"
  );
});

test("적용하지 않은 scan resource는 확인이나 metadata stamp 대상이 아니다", () => {
  const fixture = createDecisionFixture();
  const selectedReadyId = fixture.resourceIds.ready[0]!;
  const outsideReadyId = fixture.resourceIds.ready[1]!;
  const stamped = validateAndStampReverseEngineeringImportDecisions({
    ...fixture.input,
    appliedSourceNodeIds: [selectedReadyId],
    request: {
      version: 1,
      selectedReadyResourceIds: [selectedReadyId],
      acknowledgedReviewOnlyResourceIds: []
    }
  });

  assert.deepEqual(readImportDecision(stamped, selectedReadyId), {
    version: 1,
    mode: "import_existing",
    statusAtConfirmation: "ready"
  });
  assert.deepEqual(
    readImportDecision(stamped, outsideReadyId),
    readImportDecision(fixture.input.diagramJson, outsideReadyId)
  );
});

function assertDecisionRejects(
  input: Parameters<typeof validateAndStampReverseEngineeringImportDecisions>[0],
  reason: ReverseEngineeringImportDecisionValidationReason
): void {
  assert.throws(
    () => validateAndStampReverseEngineeringImportDecisions(input),
    (error: unknown) =>
      error instanceof ReverseEngineeringImportDecisionValidationError &&
      error.reason === reason &&
      !/terraform import|arn:aws:/u.test(error.message)
  );
}

function createDecisionFixture() {
  const storedScanResult = createStoredScanResult();
  const publicResult = normalizeReverseEngineeringScanResult(
    storedScanResult.scan,
    storedScanResult
  );
  const resourceIds = publicResourceIdsByStatus(publicResult);
  const request: ReverseEngineeringImportDecisionRequest = {
    version: 1,
    selectedReadyResourceIds: [resourceIds.ready[0]!],
    acknowledgedReviewOnlyResourceIds: [
      resourceIds.manual_review[0]!,
      resourceIds.unsupported_resource_type[0]!
    ]
  };

  return {
    storedScanResult,
    publicResult,
    resourceIds,
    input: {
      request,
      diagramJson: createDiagram(publicResult),
      appliedSourceNodeIds: publicResult.importSuggestions.map(
        (suggestion) => suggestion.resourceId
      ),
      storedScanResult
    }
  };
}

function readImportDecision(diagramJson: DiagramJson, nodeId: string) {
  return diagramJson.nodes.find((node) => node.id === nodeId)?.metadata?.reverseEngineering
    ?.importDecision;
}

function publicResourceIdsByStatus(
  publicResult: ReverseEngineeringScanResult
): Record<ReverseEngineeringImportSuggestionStatus, string[]> {
  return publicResult.importSuggestions.reduce<
    Record<ReverseEngineeringImportSuggestionStatus, string[]>
  >(
    (resourceIds, suggestion) => {
      resourceIds[suggestion.status].push(suggestion.resourceId);
      return resourceIds;
    },
    {
      ready: [],
      manual_review: [],
      unsupported_resource_type: []
    }
  );
}

function createDiagram(publicResult: ReverseEngineeringScanResult): DiagramJson {
  const draft = publicResult.reverseEngineeringDraft;

  return {
    nodes: draft.architectureJson.nodes.map((node, index) => ({
      id: node.id,
      type: String(node.config["terraformResourceType"] ?? "aws_s3_bucket"),
      kind: "resource" as const,
      position: { x: index * 80, y: 0 },
      size: { width: 48, height: 48 },
      label: node.label ?? node.id,
      locked: false,
      zIndex: 1,
      metadata: {
        reverseEngineering: {
          source: "aws_scan" as const,
          protectedValueKeys: [...draft.protectedValueKeys],
          editableValueKeys: [...draft.editableValueKeys],
          importDecision: {
            version: 1 as const,
            mode: "import_existing" as const,
            statusAtConfirmation: "ready" as const
          }
        }
      },
      parameters: {
        terraformBlockType: "resource" as const,
        resourceType: String(node.config["terraformResourceType"] ?? "aws_s3_bucket"),
        resourceName: String(node.config["terraformResourceName"] ?? `resource_${index}`),
        fileName: "reverse-engineering",
        values: structuredClone(node.config)
      }
    })),
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createStoredScanResult(): ReverseEngineeringScanResult {
  const createdAt = "2026-07-23T00:00:00.000Z";
  const scan = {
    id: "private-scan-1",
    projectId: "project-1",
    awsConnectionId: "connection-1",
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes: ["ALL" as const],
    status: "completed" as const,
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    completedAt: createdAt,
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
  const resources = [
    createResource({
      id: "private-ready-resource",
      providerResourceId: PRIVATE_READY_ARN,
      displayName: "ready customer bucket",
      importSuggestionStatus: "ready"
    }),
    createResource({
      id: "private-unselected-ready-resource",
      providerResourceId: PRIVATE_UNSELECTED_ARN,
      displayName: "unselected customer bucket",
      importSuggestionStatus: "ready"
    }),
    createResource({
      id: "private-manual-resource",
      providerResourceType: "AWS::Custom::Manual",
      providerResourceId: "arn:aws:custom:ap-northeast-2:123456789012:manual/private",
      displayName: "manual resource",
      resourceType: "UNKNOWN",
      analysisExcluded: true,
      importSuggestionStatus: "manual_review"
    }),
    createResource({
      id: "private-unsupported-resource",
      providerResourceType: "AWS::Custom::Unsupported",
      providerResourceId: "arn:aws:custom:ap-northeast-2:123456789012:unsupported/private",
      displayName: "unsupported resource",
      resourceType: "UNKNOWN",
      analysisExcluded: true,
      importSuggestionStatus: "unsupported_resource_type"
    })
  ];
  const architectureJson = {
    nodes: resources.map((resource, index) => ({
      id: resource.id,
      type: resource.resourceType,
      label: resource.displayName,
      positionX: index * 80,
      positionY: 0,
      config: structuredClone(resource.config)
    })),
    edges: []
  };

  return {
    scan,
    discoveredResources: resources,
    reverseEngineeringDraft: {
      id: "private-draft-1",
      scanId: scan.id,
      architectureJson,
      protectedValueKeys: ["providerResourceId", "providerResourceType"],
      editableValueKeys: ["displayName"],
      createdAt
    },
    architectureJson,
    findings: [],
    analysisExclusions: [],
    importSuggestions: [
      {
        id: `import-${PRIVATE_READY_ARN}`,
        resourceId: resources[0]!.id,
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_s3_bucket.ready_customer_bucket",
        importCommand: `terraform import aws_s3_bucket.ready_customer_bucket ${PRIVATE_READY_ARN}`
      },
      {
        id: `import-${PRIVATE_UNSELECTED_ARN}`,
        resourceId: resources[1]!.id,
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_s3_bucket.unselected_customer_bucket",
        importCommand: `terraform import aws_s3_bucket.unselected_customer_bucket ${PRIVATE_UNSELECTED_ARN}`
      },
      {
        id: "import-private-manual",
        resourceId: resources[2]!.id,
        status: "manual_review",
        handoffReady: false,
        reason: "수동 검토가 필요합니다."
      },
      {
        id: "import-private-unsupported",
        resourceId: resources[3]!.id,
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "지원하지 않는 리소스입니다."
      }
    ],
    scanErrors: []
  };
}

function createResource(overrides: {
  id: string;
  providerResourceId: string;
  displayName: string;
  importSuggestionStatus: ReverseEngineeringImportSuggestionStatus;
  providerResourceType?: string;
  resourceType?: "S3" | "UNKNOWN";
  analysisExcluded?: boolean;
}) {
  const providerResourceType = overrides.providerResourceType ?? "AWS::S3::Bucket";
  const resourceType = overrides.resourceType ?? "S3";

  return {
    id: overrides.id,
    provider: "aws" as const,
    providerResourceType,
    providerResourceId: overrides.providerResourceId,
    region: "ap-northeast-2",
    displayName: overrides.displayName,
    resourceType,
    config: {
      providerResourceType,
      providerResourceId: overrides.providerResourceId,
      ...(resourceType === "S3" ? { bucket: overrides.displayName.replaceAll(" ", "-") } : {}),
      terraformBlockType: "resource",
      terraformResourceType: resourceType === "S3" ? "aws_s3_bucket" : "",
      terraformResourceName: overrides.id.replaceAll("-", "_"),
      terraformFileName: "reverse-engineering"
    },
    ...(overrides.analysisExcluded ? { analysisExcluded: true } : {}),
    importSuggestionStatus: overrides.importSuggestionStatus
  };
}
