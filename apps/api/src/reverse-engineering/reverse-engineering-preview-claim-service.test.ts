import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureJson,
  DiagramJson,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";
import {
  claimReverseEngineeringPreviewProject,
  ReverseEngineeringPreviewClaimConflictError,
  ReverseEngineeringPreviewClaimNotFoundError,
  type ReverseEngineeringPreviewClaimRepository,
  type ReverseEngineeringPreviewClaimTransaction,
  type ReverseEngineeringPreviewClaimInput,
  type ReverseEngineeringPreviewRecord
} from "./reverse-engineering-preview-claim-service.js";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PREVIEW_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const DRAFT_ID = "55555555-5555-4555-8555-555555555555";
const ARCHITECTURE_ID = "66666666-6666-4666-8666-666666666666";
const SCAN_ID = "77777777-7777-4777-8777-777777777777";
const AWS_CONNECTION_ID = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-07-20T01:00:00.000Z");
const PRIVATE_ALB_ARN =
  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/private/abc";

test("preview claim은 실제 Project·Draft·Scan ID를 선택한 source node에만 기록한다", async () => {
  const preview = createPreviewRecord();
  const repository = new InMemoryPreviewClaimRepository(preview);
  const input = createClaimInput(preview);

  const result = await claimReverseEngineeringPreviewProject(input, repository, {
    generateId: createIdGenerator(),
    now: () => NOW
  });

  assert.equal(result.project.id, PROJECT_ID);
  assert.equal(result.draft.id, DRAFT_ID);
  assert.equal(result.architecture.id, ARCHITECTURE_ID);
  assert.equal(repository.scanRows[0]?.id, SCAN_ID);
  assert.equal(repository.scanRows[0]?.projectId, PROJECT_ID);
  assert.match(JSON.stringify(repository.scanRows[0]?.result), /arn:aws:elasticloadbalancing/iu);
  assert.equal(repository.scanRows[0]?.result.scan.id, SCAN_ID);
  assert.equal(repository.scanRows[0]?.result.scan.projectId, PROJECT_ID);
  assert.equal(repository.scanRows[0]?.result.reverseEngineeringDraft.id, DRAFT_ID);
  assert.equal(repository.scanRows[0]?.result.reverseEngineeringDraft.scanId, SCAN_ID);

  const selectedDraftNode = result.draft.diagramJson.nodes.find(
    (node) => node.id === input.reverseEngineering.sourceNodeIds[0]
  );
  const manualDraftNode = result.draft.diagramJson.nodes.find((node) => node.id === "manual-node");
  const selectedArchitectureNode = result.architecture.architectureJson.nodes.find(
    (node) => node.id === input.reverseEngineering.sourceNodeIds[0]
  );
  const manualArchitectureNode = result.architecture.architectureJson.nodes.find(
    (node) => node.id === "manual-node"
  );

  assert.equal(selectedDraftNode?.parameters?.values["reverseEngineeringSourceScanId"], SCAN_ID);
  assert.equal(selectedDraftNode?.parameters?.values["reverseEngineeringDraftId"], DRAFT_ID);
  assert.equal(selectedDraftNode?.parameters?.values["reverseEngineeringSourceKind"], "saved_scan");
  assert.deepEqual(selectedDraftNode?.metadata?.reverseEngineering?.importDecision, {
    version: 1,
    mode: "import_existing",
    statusAtConfirmation: "ready"
  });
  assert.equal(selectedArchitectureNode?.config["reverseEngineeringSourceScanId"], SCAN_ID);
  assert.equal(selectedArchitectureNode?.config["reverseEngineeringDraftId"], DRAFT_ID);
  assert.equal(
    manualDraftNode?.parameters?.values["reverseEngineeringSourceScanId"],
    "previous-scan"
  );
  assert.equal(manualArchitectureNode?.config["reverseEngineeringSourceScanId"], "previous-scan");
  assert.equal(repository.preview.claimedProjectId, PROJECT_ID);
  assert.equal(repository.preview.claimedScanId, SCAN_ID);
  assert.equal(repository.preview.claimedDraftId, DRAFT_ID);
});

test("다른 사용자의 preview id는 존재 여부를 숨기고 Project를 만들지 않는다", async () => {
  const preview = createPreviewRecord({ userId: OTHER_USER_ID });
  const repository = new InMemoryPreviewClaimRepository(preview);

  await assert.rejects(
    claimReverseEngineeringPreviewProject(createClaimInput(preview), repository, {
      generateId: createIdGenerator(),
      now: () => NOW
    }),
    ReverseEngineeringPreviewClaimNotFoundError
  );

  assert.equal(repository.projectRows.length, 0);
  assert.equal(repository.preview.claimedAt, null);
});

test("만료된 preview는 Project 생성 전에 거부한다", async () => {
  const preview = createPreviewRecord({ expiresAt: NOW });
  const repository = new InMemoryPreviewClaimRepository(preview);

  await assert.rejects(
    claimReverseEngineeringPreviewProject(createClaimInput(preview), repository, {
      generateId: createIdGenerator(),
      now: () => NOW
    }),
    (error: unknown) =>
      error instanceof ReverseEngineeringPreviewClaimConflictError && error.reason === "expired"
  );

  assert.equal(repository.projectRows.length, 0);
  assert.equal(repository.preview.claimedAt, null);
});

test("한 번 claim한 preview는 replay해도 두 번째 Project를 만들지 않는다", async () => {
  const preview = createPreviewRecord();
  const repository = new InMemoryPreviewClaimRepository(preview);
  const input = createClaimInput(preview);

  await claimReverseEngineeringPreviewProject(input, repository, {
    generateId: createIdGenerator(),
    now: () => NOW
  });

  await assert.rejects(
    claimReverseEngineeringPreviewProject(input, repository, {
      generateId: createIdGenerator(),
      now: () => new Date(NOW.getTime() + 1)
    }),
    (error: unknown) =>
      error instanceof ReverseEngineeringPreviewClaimConflictError && error.reason === "claimed"
  );

  assert.equal(repository.projectRows.length, 1);
  assert.equal(repository.scanRows.length, 1);
});

test("공개 draft id나 선택 source node 의미가 preview와 다르면 claim하지 않는다", async () => {
  const preview = createPreviewRecord();

  for (const mutate of [
    (input: ReturnType<typeof createClaimInput>) => {
      input.reverseEngineering.publicDraftId = "forged-draft";
    },
    (input: ReturnType<typeof createClaimInput>) => {
      const sourceNode = input.architectureJson.nodes[0];

      if (sourceNode) {
        sourceNode.config["providerResourceId"] = "forged-provider-id";
      }
    },
    (input: ReturnType<typeof createClaimInput>) => {
      const sourceNodeId = input.reverseEngineering.sourceNodeIds[0]!;
      input.architectureJson.edges.push({
        id: "forged-source-edge",
        sourceId: sourceNodeId,
        targetId: sourceNodeId,
        label: "forged"
      });
      input.diagramJson.edges.push({
        id: "forged-source-edge",
        sourceNodeId,
        targetNodeId: sourceNodeId,
        label: "forged"
      });
    }
  ]) {
    const repository = new InMemoryPreviewClaimRepository(createPreviewRecord());
    const input = createClaimInput(preview);
    mutate(input);

    await assert.rejects(
      claimReverseEngineeringPreviewProject(input, repository, {
        generateId: createIdGenerator(),
        now: () => NOW
      }),
      (error: unknown) =>
        error instanceof ReverseEngineeringPreviewClaimConflictError &&
        error.reason === "public_draft_mismatch"
    );

    assert.equal(repository.projectRows.length, 0);
    assert.equal(repository.preview.claimedAt, null);
  }
});

test("중간 insert 실패는 Project·Draft·Scan과 preview claim을 함께 rollback한다", async () => {
  const preview = createPreviewRecord();
  const repository = new InMemoryPreviewClaimRepository(preview);
  const input = createClaimInput(preview);
  repository.failArchitectureInsert = true;

  await assert.rejects(
    claimReverseEngineeringPreviewProject(input, repository, {
      generateId: createIdGenerator(),
      now: () => NOW
    }),
    /architecture insert failed/u
  );

  assert.equal(repository.projectRows.length, 0);
  assert.equal(repository.draftRows.length, 0);
  assert.equal(repository.architectureRows.length, 0);
  assert.equal(repository.scanRows.length, 0);
  assert.equal(repository.preview.claimedAt, null);

  repository.failArchitectureInsert = false;
  const retried = await claimReverseEngineeringPreviewProject(input, repository, {
    generateId: createIdGenerator(),
    now: () => NOW
  });

  assert.equal(retried.project.id, PROJECT_ID);
  assert.equal(repository.projectRows.length, 1);
  assert.equal(repository.scanRows.length, 1);
  assert.equal(repository.preview.claimedScanId, SCAN_ID);
});

type StoredProject = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredDraft = {
  id: string;
  projectId: string;
  diagramJson: DiagramJson;
  terraformFiles: null;
  revision: number;
  serverSavedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type StoredArchitecture = {
  id: string;
  projectId: string;
  version: number;
  source: string;
  architectureJson: ArchitectureJson;
  createdAt: Date;
};

type StoredScan = {
  id: string;
  projectId: string;
  awsConnectionId: string | null;
  provider: string;
  region: string;
  resourceTypes: string[];
  status: "completed";
  result: ReverseEngineeringScanResult;
  errorSummary: null;
  startedAt: Date;
  completedAt: Date;
  cancelRequestedAt: null;
  deletedAt: null;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryPreviewClaimRepository implements ReverseEngineeringPreviewClaimRepository {
  preview: ReverseEngineeringPreviewRecord;
  projectRows: StoredProject[] = [];
  draftRows: StoredDraft[] = [];
  architectureRows: StoredArchitecture[] = [];
  scanRows: StoredScan[] = [];
  failArchitectureInsert = false;

  // gg: 입력 preview를 테스트 저장소 밖에서 바꿔도 영향 없게 복제합니다.
  constructor(preview: ReverseEngineeringPreviewRecord) {
    this.preview = structuredClone(preview);
  }

  // gg: 테스트 저장소도 production transaction의 all-or-nothing 계약을 그대로 모사합니다.
  async transaction<T>(
    callback: (tx: ReverseEngineeringPreviewClaimTransaction) => Promise<T>
  ): Promise<T> {
    const snapshot = structuredClone({
      preview: this.preview,
      projectRows: this.projectRows,
      draftRows: this.draftRows,
      architectureRows: this.architectureRows,
      scanRows: this.scanRows
    });
    const tx: ReverseEngineeringPreviewClaimTransaction = {
      lockOwnedPreview: async (previewId, userId) =>
        this.preview.id === previewId && this.preview.userId === userId ? this.preview : undefined,
      insertProject: async (input) => {
        const project = { ...input, createdAt: NOW, updatedAt: NOW };
        this.projectRows.push(project);
        return project as never;
      },
      insertDraft: async (input) => {
        const draft = {
          ...input,
          serverSavedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW
        };
        this.draftRows.push(draft);
        return draft as never;
      },
      insertArchitecture: async (input) => {
        if (this.failArchitectureInsert) {
          throw new Error("architecture insert failed");
        }

        const architecture = { ...input, createdAt: NOW };
        this.architectureRows.push(architecture);
        return architecture as never;
      },
      insertCompletedScan: async (input) => {
        const scan = { ...input } as StoredScan;
        this.scanRows.push(scan);
        return scan as never;
      },
      claimPreview: async (input) => {
        if (this.preview.claimedAt !== null || this.preview.expiresAt <= input.claimedAt) {
          return false;
        }

        this.preview = {
          ...this.preview,
          claimedAt: input.claimedAt,
          claimedProjectId: input.projectId,
          claimedScanId: input.scanId,
          claimedDraftId: input.draftId,
          updatedAt: input.claimedAt
        };
        return true;
      }
    };

    try {
      return await callback(tx);
    } catch (error) {
      this.preview = snapshot.preview;
      this.projectRows = snapshot.projectRows;
      this.draftRows = snapshot.draftRows;
      this.architectureRows = snapshot.architectureRows;
      this.scanRows = snapshot.scanRows;
      throw error;
    }
  }
}

// gg: 실제 adapter가 남길 private provider/import identity를 작은 fixture로 고정합니다.
function createRawResult(): ReverseEngineeringScanResult {
  const createdAt = "1970-01-01T00:00:00.000Z";
  const nodeId = "resource-private-alb";
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: nodeId,
        type: "LOAD_BALANCER",
        label: "private-entry",
        positionX: 120,
        positionY: 120,
        config: {
          attributes: {},
          attributesProjectionComplete: true,
          attributesReadComplete: true,
          name: "private-entry",
          type: "application",
          ipAddressType: "ipv4",
          reverseEngineeringDetailsVersion: 1,
          scheme: "internet-facing",
          subnetIds: ["subnet-private"],
          tags: [],
          tagsReadComplete: true,
          providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
          providerResourceId: PRIVATE_ALB_ARN,
          analysisExcluded: false
        }
      }
    ],
    edges: []
  };
  const scan = {
    id: "scan-not-persisted",
    projectId: "project-not-persisted",
    awsConnectionId: "aws-connection-not-persisted",
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

  return {
    scan,
    discoveredResources: [
      {
        id: nodeId,
        provider: "aws",
        providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        providerResourceId: PRIVATE_ALB_ARN,
        region: "ap-northeast-2",
        displayName: "private-entry",
        resourceType: "LOAD_BALANCER",
        config: structuredClone(architectureJson.nodes[0]?.config ?? {}),
        relationships: []
      }
    ],
    architectureJson,
    reverseEngineeringDraft: {
      id: "draft-scan-not-persisted",
      scanId: scan.id,
      architectureJson,
      protectedValueKeys: ["providerResourceId", "providerResourceType"],
      editableValueKeys: ["displayName", "description"],
      createdAt
    },
    findings: [],
    analysisExclusions: [],
    importSuggestions: [
      {
        id: `import-${nodeId}`,
        resourceId: nodeId,
        status: "ready",
        terraformAddress: "aws_lb.private_entry",
        importCommand: `terraform import aws_lb.private_entry ${PRIVATE_ALB_ARN}`,
        terraformBlockDraft: 'resource "aws_lb" "private_entry" {}',
        handoffReady: true
      }
    ],
    scanErrors: [],
    coverage: { status: "complete", unavailableServices: [] }
  };
}

// gg: preview row 하나가 raw_result의 유일한 원본이 되도록 fixture를 만듭니다.
function createPreviewRecord(
  overrides: Partial<ReverseEngineeringPreviewRecord> = {}
): ReverseEngineeringPreviewRecord {
  return {
    id: PREVIEW_ID,
    userId: ACTIVE_USER_ID,
    awsConnectionId: AWS_CONNECTION_ID,
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"],
    rawResult: createRawResult(),
    expiresAt: new Date("2026-07-20T01:30:00.000Z"),
    claimedAt: null,
    claimedProjectId: null,
    claimedScanId: null,
    claimedDraftId: null,
    createdAt: new Date("2026-07-20T00:59:00.000Z"),
    updatedAt: new Date("2026-07-20T00:59:00.000Z"),
    ...overrides
  };
}

// gg: browser가 받은 공개 draft를 사용하되 preview provenance는 공격자가 바꿀 수 있는 값으로 보냅니다.
function createClaimInput(
  preview: ReverseEngineeringPreviewRecord
): ReverseEngineeringPreviewClaimInput {
  const publicResult = createPublicPreviewResult(preview);
  const sourceNode = structuredClone(publicResult.architectureJson.nodes[0]!);
  const manualArchitectureNode: ArchitectureJson["nodes"][number] = {
    id: "manual-node",
    type: "UNKNOWN",
    label: "Manual",
    positionX: 360,
    positionY: 120,
    config: {
      reverseEngineeringSourceScanId: "previous-scan",
      reverseEngineeringDraftId: "previous-draft",
      reverseEngineeringSourceKind: "saved_scan"
    }
  };
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: sourceNode.id,
        type: sourceNode.type,
        kind: "resource",
        position: { x: 180, y: 200 },
        size: { width: 168, height: 96 },
        label: sourceNode.label ?? sourceNode.id,
        locked: false,
        zIndex: 1,
        parameters: {
          resourceType: "",
          resourceName: "",
          fileName: "",
          values: {
            ...structuredClone(sourceNode.config),
            reverseEngineeringSourceScanId: "browser-forged-scan",
            reverseEngineeringDraftId: "browser-forged-draft",
            reverseEngineeringSourceKind: "preview_scan"
          }
        }
      },
      {
        id: manualArchitectureNode.id,
        type: "UNKNOWN",
        kind: "resource",
        position: { x: 360, y: 120 },
        size: { width: 168, height: 96 },
        label: "Manual",
        locked: false,
        zIndex: 2,
        parameters: {
          resourceType: "",
          resourceName: "",
          fileName: "",
          values: structuredClone(manualArchitectureNode.config)
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  return {
    userId: ACTIVE_USER_ID,
    name: "Imported AWS project",
    description: null,
    diagramJson,
    architectureJson: {
      nodes: [sourceNode, manualArchitectureNode],
      edges: []
    },
    reverseEngineering: {
      previewId: preview.id,
      publicDraftId: publicResult.reverseEngineeringDraft.id,
      sourceNodeIds: [sourceNode.id],
      importDecision: {
        version: 1,
        selectedReadyResourceIds: [sourceNode.id],
        acknowledgedReviewOnlyResourceIds: []
      }
    }
  };
}

// gg: raw_result에서 browser가 봤던 동일한 공개 preview identity를 재생성합니다.
function createPublicPreviewResult(
  preview: ReverseEngineeringPreviewRecord
): ReverseEngineeringScanResult {
  const createdAt = preview.createdAt.toISOString();
  const scan = {
    id: preview.id,
    projectId: "00000000-0000-4000-8000-000000000000",
    awsConnectionId: preview.awsConnectionId,
    provider: "aws" as const,
    region: preview.region,
    resourceTypes: preview.resourceTypes,
    status: "completed" as const,
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    completedAt: createdAt,
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
  const result = normalizeReverseEngineeringScanResult(scan, preview.rawResult);

  return {
    ...result,
    scan,
    reverseEngineeringDraft: {
      ...result.reverseEngineeringDraft,
      id: `draft-${preview.id}`,
      scanId: preview.id,
      createdAt
    }
  };
}

// gg: transaction이 만드는 네 실제 ID 순서를 매 retry마다 고정합니다.
function createIdGenerator(): () => string {
  const ids = [PROJECT_ID, DRAFT_ID, ARCHITECTURE_ID, SCAN_ID];
  let index = 0;

  return () => ids[index++] ?? `unexpected-id-${index}`;
}
