import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  ArchitectureJson,
  DiagramJson,
  ReverseEngineeringImportDecisionRequest,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScanResult,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import { createBoardAutoOrganizeSourceFingerprint } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import type { ProjectDraftRow } from "../modules/projects/project-drafts.js";
import type { ReverseEngineeringScanRecord } from "./reverse-engineering-service.js";
import {
  ExistingReverseEngineeringDraftMismatchError,
  applyExistingReverseEngineeringDraft,
  type ExistingReverseEngineeringDraftApplyDependencies,
  type ExistingReverseEngineeringDraftApplyInput
} from "./existing-reverse-engineering-draft-apply-service.js";
import { ReverseEngineeringImportDecisionValidationError } from "./reverse-engineering-import-decision.js";
import {
  normalizeReverseEngineeringScanResult,
  toReverseEngineeringScan
} from "./reverse-engineering-service.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCAN_ID = "44444444-4444-4444-8444-444444444444";
const DRAFT_ID = "55555555-5555-4555-8555-555555555555";
const SOURCE_NODE_IDS = ["vpc-1", "subnet-1"] as const;
const SOURCE_EDGE_IDS = ["vpc-subnet"] as const;

describe("applyExistingReverseEngineeringDraft", () => {
  test("서버가 확인한 AWS 원본, provenance, import 결정을 전용 저장 경계에 전달한다", async () => {
    const fixture = createFixture();
    const savedInputs: Parameters<
      NonNullable<ExistingReverseEngineeringDraftApplyDependencies["saveServerConfirmedDraft"]>
    >[0][] = [];

    const result = await applyExistingReverseEngineeringDraft(fixture.input, {
      ...fixture.dependencies,
      saveServerConfirmedDraft: async (input) => {
        savedInputs.push(input);
        return {
          status: "saved",
          draft: createDraftRow(input.input.diagramJson, input.input.terraformFiles ?? null, 8)
        };
      }
    });

    assert.equal(result.status, "saved");
    assert.equal(savedInputs.length, 1);
    const saveInput = savedInputs[0]!;
    assert.deepEqual(saveInput.allowedImportDecisionStampNodeIds, SOURCE_NODE_IDS);
    assert.equal(saveInput.input.expectedRevision, 7);
    assert.deepEqual(saveInput.input.terraformFiles, fixture.terraformFiles);

    for (const sourceNodeId of SOURCE_NODE_IDS) {
      const savedNode = saveInput.input.diagramJson.nodes.find((node) => node.id === sourceNodeId);
      assert.ok(savedNode?.parameters);
      assert.equal(savedNode.parameters.values["reverseEngineeringSourceScanId"], SCAN_ID);
      assert.equal(savedNode.parameters.values["reverseEngineeringDraftId"], DRAFT_ID);
      assert.equal(savedNode.parameters.values["reverseEngineeringSourceKind"], "saved_scan");
      assert.equal(
        savedNode.metadata?.reverseEngineering?.importDecision?.mode,
        fixture.input.importDecision.selectedReadyResourceIds.includes(sourceNodeId)
          ? "import_existing"
          : "observe_only"
      );
      assert.equal(
        savedNode.metadata?.reverseEngineering?.importDecision?.statusAtConfirmation,
        fixture.publicResult.importSuggestions.find(
          (suggestion) => suggestion.resourceId === sourceNodeId
        )?.status
      );
    }
  });

  test("저장 revision이 바뀌면 conflict를 반환하고 저장하지 않는다", async () => {
    const fixture = createFixture();
    const currentDraft = createDraftRow(fixture.sourceDiagram, fixture.terraformFiles, 8);
    let saveCalls = 0;

    const result = await applyExistingReverseEngineeringDraft(fixture.input, {
      ...fixture.dependencies,
      readDraft: async () => currentDraft,
      saveServerConfirmedDraft: async () => {
        saveCalls += 1;
        throw new Error("저장하면 안 됩니다.");
      }
    });

    assert.deepEqual(result, { status: "conflict", currentDraft });
    assert.equal(saveCalls, 0);
  });

  test("요청 원본을 바꾸고 fingerprint를 다시 만들어도 저장된 초안과 다르면 거부한다", async () => {
    const fixture = createFixture();
    const forgedSource = structuredClone(fixture.sourceDiagram);
    forgedSource.nodes[0]!.label = "위조한 기존 리소스";

    await assertMismatchWithoutSave(fixture, {
      sourceDiagram: forgedSource,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(forgedSource)
    });
  });

  test("요청 원본과 맞지 않는 fingerprint를 거부한다", async () => {
    const fixture = createFixture();

    await assertMismatchWithoutSave(fixture, { sourceFingerprint: "00000000" });
  });

  test("저장된 Terraform과 다른 파일을 함께 적용하지 않는다", async () => {
    const fixture = createFixture();

    await assertMismatchWithoutSave(fixture, {
      terraformFiles: [{ fileName: "main.tf", terraformCode: "# forged" }]
    });
  });

  test("AWS 원본 Resource 설정을 바꾼 후보를 거부한다", async () => {
    const fixture = createFixture();
    const candidateDiagram = structuredClone(fixture.input.candidateDiagram);
    const vpc = candidateDiagram.nodes.find((node) => node.id === "vpc-1")!;
    vpc.parameters!.values["cidrBlock"] = "10.99.0.0/16";

    await assertMismatchWithoutSave(fixture, { candidateDiagram });
  });

  test("AWS 원본 관계를 바꾼 후보를 거부한다", async () => {
    const fixture = createFixture();
    const candidateArchitectureJson = structuredClone(fixture.input.candidateArchitectureJson);
    candidateArchitectureJson.edges.find((edge) => edge.id === "vpc-subnet")!.label = "바뀐 관계";

    await assertMismatchWithoutSave(fixture, { candidateArchitectureJson });
  });

  test("AWS 원본 관계를 소유 목록과 후보 양쪽에서 함께 빼도 거부한다", async () => {
    const fixture = createFixture();
    const candidateDiagram = structuredClone(fixture.input.candidateDiagram);
    const candidateArchitectureJson = structuredClone(fixture.input.candidateArchitectureJson);
    candidateDiagram.edges = [];
    candidateArchitectureJson.edges = [];

    await assertMismatchWithoutSave(fixture, {
      sourceEdgeIds: [],
      candidateDiagram,
      candidateArchitectureJson
    });
  });

  test("가져온 Resource에 새 관계를 몰래 붙인 후보를 거부한다", async () => {
    const fixture = createFixture();
    const candidateDiagram = structuredClone(fixture.input.candidateDiagram);
    const candidateArchitectureJson = structuredClone(fixture.input.candidateArchitectureJson);
    candidateDiagram.edges.push({
      id: "forged-edge",
      sourceNodeId: "existing-resource",
      targetNodeId: "vpc-1",
      label: "몰래 추가"
    });
    candidateArchitectureJson.edges.push({
      id: "forged-edge",
      sourceId: "existing-resource",
      targetId: "vpc-1",
      label: "몰래 추가"
    });

    await assertMismatchWithoutSave(fixture, {
      candidateDiagram,
      candidateArchitectureJson
    });
  });

  test("이번 Scan 밖 Resource에 가짜 import 결정을 붙이지 못한다", async () => {
    const fixture = createFixture();
    const candidateDiagram = structuredClone(fixture.input.candidateDiagram);
    const existingNode = candidateDiagram.nodes.find((node) => node.id === "existing-resource")!;
    existingNode.metadata = {
      reverseEngineering: {
        source: "aws_scan",
        protectedValueKeys: [],
        editableValueKeys: [],
        importDecision: {
          version: 1,
          mode: "import_existing",
          statusAtConfirmation: "ready"
        }
      }
    };

    await assertMismatchWithoutSave(fixture, { candidateDiagram });
  });

  test("Scan Resource를 소유 목록에서 빼고 일반 Resource처럼 저장하지 못한다", async () => {
    const fixture = createFixture();
    const vpcSuggestion = fixture.publicResult.importSuggestions.find(
      (suggestion) => suggestion.resourceId === "vpc-1"
    )!;
    const importDecision: ReverseEngineeringImportDecisionRequest = {
      version: 1,
      selectedReadyResourceIds: vpcSuggestion.status === "ready" ? ["vpc-1"] : [],
      acknowledgedReviewOnlyResourceIds: vpcSuggestion.status === "ready" ? [] : ["vpc-1"]
    };

    await assertMismatchWithoutSave(fixture, {
      sourceNodeIds: ["vpc-1"],
      importDecision
    });
  });

  test("다른 프로젝트나 다른 draft를 가리키는 Scan 결과를 거부한다", async () => {
    const fixture = createFixture();
    const wrongScan = {
      ...fixture.scanRow,
      projectId: "99999999-9999-4999-8999-999999999999",
      result: {
        ...fixture.scanRow.result!,
        reverseEngineeringDraft: {
          ...fixture.scanRow.result!.reverseEngineeringDraft,
          id: "wrong-draft"
        }
      }
    };

    await assertMismatchWithoutSave(
      fixture,
      {},
      {
        findAccessibleScan: async () => wrongScan
      }
    );
  });

  test("잘못된 import 결정 오류는 숨기지 않고 그대로 전달한다", async () => {
    const fixture = createFixture();
    let saveCalls = 0;

    await assert.rejects(
      () =>
        applyExistingReverseEngineeringDraft(
          {
            ...fixture.input,
            importDecision: {
              version: 1,
              selectedReadyResourceIds: ["unknown-resource"],
              acknowledgedReviewOnlyResourceIds: []
            }
          },
          {
            ...fixture.dependencies,
            saveServerConfirmedDraft: async () => {
              saveCalls += 1;
              throw new Error("저장하면 안 됩니다.");
            }
          }
        ),
      ReverseEngineeringImportDecisionValidationError
    );

    assert.equal(saveCalls, 0);
  });
});

/** 정상 원본을 만들고 각 위조 테스트가 한 값만 바꾸게 합니다. */
function createFixture(): {
  readonly dependencies: ExistingReverseEngineeringDraftApplyDependencies;
  readonly input: ExistingReverseEngineeringDraftApplyInput;
  readonly publicResult: ReverseEngineeringScanResult;
  readonly scanRow: ReverseEngineeringScanRecord;
  readonly sourceDiagram: DiagramJson;
  readonly terraformFiles: TerraformSyncFileInput[];
} {
  const scanRow = createScanRow();
  const publicResult = normalizeReverseEngineeringScanResult(
    toReverseEngineeringScan(scanRow),
    scanRow.result!
  );
  const sourceDiagram = createSourceDiagram();
  const candidateDiagram = createCandidateDiagram(sourceDiagram, publicResult);
  const candidateArchitectureJson = createCandidateArchitecture(publicResult);
  const terraformFiles = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "imported" {}' }
  ];
  const input: ExistingReverseEngineeringDraftApplyInput = {
    db: {} as Database,
    projectId: PROJECT_ID,
    userId: USER_ID,
    expectedRevision: 7,
    sourceScanId: SCAN_ID,
    sourceDraftId: DRAFT_ID,
    sourceNodeIds: [...SOURCE_NODE_IDS],
    sourceEdgeIds: [...SOURCE_EDGE_IDS],
    sourceDiagram,
    sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
    candidateDiagram,
    candidateArchitectureJson,
    importDecision: createImportDecision(publicResult),
    terraformFiles
  };

  return {
    input,
    publicResult,
    scanRow,
    sourceDiagram,
    terraformFiles,
    dependencies: {
      readDraft: async () => createDraftRow(sourceDiagram, terraformFiles, 7),
      findAccessibleScan: async () => scanRow,
      saveServerConfirmedDraft: async () => ({
        status: "saved",
        draft: createDraftRow(candidateDiagram, terraformFiles, 8)
      })
    }
  };
}

/** 한 입력만 바꾼 요청이 고정 오류로 닫히고 저장을 호출하지 않는지 확인합니다. */
async function assertMismatchWithoutSave(
  fixture: ReturnType<typeof createFixture>,
  overrides: Partial<ExistingReverseEngineeringDraftApplyInput>,
  dependencyOverrides: Partial<ExistingReverseEngineeringDraftApplyDependencies> = {}
): Promise<void> {
  let saveCalls = 0;

  await assert.rejects(
    () =>
      applyExistingReverseEngineeringDraft(
        { ...fixture.input, ...overrides },
        {
          ...fixture.dependencies,
          ...dependencyOverrides,
          saveServerConfirmedDraft: async () => {
            saveCalls += 1;
            throw new Error("저장하면 안 됩니다.");
          }
        }
      ),
    ExistingReverseEngineeringDraftMismatchError
  );

  assert.equal(saveCalls, 0);
}

/** 저장된 현재 보드에는 스캔이 새로 붙일 Resource와 겹치지 않는 기존 Resource만 둡니다. */
function createSourceDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "existing-resource",
        type: "aws_s3_bucket",
        kind: "resource",
        position: { x: 20, y: 20 },
        size: { width: 48, height: 48 },
        label: "기존 Bucket",
        locked: false,
        zIndex: 1,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "existing",
          fileName: "main.tf",
          values: { bucket: "existing" }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

/** 공개 스캔 Resource를 브라우저의 source-exact Diagram 형태로 붙입니다. */
function createCandidateDiagram(
  sourceDiagram: DiagramJson,
  result: ReverseEngineeringScanResult
): DiagramJson {
  return {
    ...structuredClone(sourceDiagram),
    nodes: [
      ...structuredClone(sourceDiagram.nodes),
      ...result.reverseEngineeringDraft.architectureJson.nodes.map((node, index) => {
        const terraformBlockType = readTerraformBlockType(node.config["terraformBlockType"]);
        const resourceType = readString(node.config["terraformResourceType"]);
        const resourceName = readString(node.config["terraformResourceName"]);

        return {
          id: node.id,
          type: resourceType ?? node.type,
          kind: "resource" as const,
          position: { x: 220 + index * 120, y: 160 },
          size: { width: 48, height: 48 },
          label: node.label ?? node.id,
          locked: false,
          zIndex: index + 2,
          parameters: {
            ...(terraformBlockType ? { terraformBlockType } : {}),
            resourceType: resourceType ?? "",
            resourceName: resourceName ?? "",
            fileName: readString(node.config["terraformFileName"]) ?? "",
            values: structuredClone(node.config),
            ...(resourceType && resourceName ? {} : { invalid: true })
          }
        };
      })
    ],
    edges: result.reverseEngineeringDraft.architectureJson.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceId,
      targetNodeId: edge.targetId,
      ...(edge.label ? { label: edge.label } : {})
    }))
  };
}

/** Snapshot 후보도 공개 스캔 의미와 기존 보드 Resource를 함께 가집니다. */
function createCandidateArchitecture(result: ReverseEngineeringScanResult): ArchitectureJson {
  return {
    nodes: [
      {
        id: "existing-resource",
        type: "S3",
        label: "기존 Bucket",
        positionX: 20,
        positionY: 20,
        config: { bucket: "existing" }
      },
      ...structuredClone(result.reverseEngineeringDraft.architectureJson.nodes)
    ],
    edges: structuredClone(result.reverseEngineeringDraft.architectureJson.edges)
  };
}

/** 서버가 공개한 상태에 맞춰 ready는 import, 나머지는 명시 확인으로 고정합니다. */
function createImportDecision(
  result: ReverseEngineeringScanResult
): ReverseEngineeringImportDecisionRequest {
  return {
    version: 1,
    selectedReadyResourceIds: result.importSuggestions
      .filter((suggestion) => suggestion.status === "ready")
      .map((suggestion) => suggestion.resourceId),
    acknowledgedReviewOnlyResourceIds: result.importSuggestions
      .filter((suggestion) => suggestion.status !== "ready")
      .map((suggestion) => suggestion.resourceId)
  };
}

/** 실제 저장 row와 같은 날짜·identity·완료 결과를 가진 테스트 Scan을 만듭니다. */
function createScanRow(): ReverseEngineeringScanRecord {
  const now = new Date("2026-07-23T00:00:00.000Z");
  const resourceTypes: ReverseEngineeringResourceSelection[] = ["VPC", "SUBNET"];
  const scan = {
    id: SCAN_ID,
    projectId: PROJECT_ID,
    awsConnectionId: "66666666-6666-4666-8666-666666666666",
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes,
    status: "completed" as const,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-1",
        type: "VPC",
        label: "서비스 VPC",
        positionX: 100,
        positionY: 100,
        config: {
          providerResourceType: "AWS::EC2::VPC",
          providerResourceId: "vpc-public",
          terraformBlockType: "resource",
          terraformResourceType: "aws_vpc",
          terraformResourceName: "imported_vpc",
          terraformFileName: "reverse-engineering",
          reverseEngineeringManagement: "managed",
          cidrBlock: "10.0.0.0/16"
        }
      },
      {
        id: "subnet-1",
        type: "SUBNET",
        label: "서비스 Subnet",
        positionX: 260,
        positionY: 100,
        config: {
          providerResourceType: "AWS::EC2::Subnet",
          providerResourceId: "subnet-public",
          terraformBlockType: "resource",
          terraformResourceType: "aws_subnet",
          terraformResourceName: "imported_subnet",
          terraformFileName: "reverse-engineering",
          reverseEngineeringManagement: "managed",
          vpc_id: "${aws_vpc.imported_vpc.id}",
          cidrBlock: "10.0.1.0/24"
        }
      }
    ],
    edges: [
      {
        id: "vpc-subnet",
        sourceId: "vpc-1",
        targetId: "subnet-1",
        label: "contains"
      }
    ]
  };
  const result: ReverseEngineeringScanResult = {
    scan,
    discoveredResources: [
      {
        id: "vpc-1",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: "vpc-public",
        region: "ap-northeast-2",
        displayName: "서비스 VPC",
        resourceType: "VPC",
        config: structuredClone(architectureJson.nodes[0]!.config)
      },
      {
        id: "subnet-1",
        provider: "aws",
        providerResourceType: "AWS::EC2::Subnet",
        providerResourceId: "subnet-public",
        region: "ap-northeast-2",
        displayName: "서비스 Subnet",
        resourceType: "SUBNET",
        config: structuredClone(architectureJson.nodes[1]!.config)
      }
    ],
    architectureJson,
    reverseEngineeringDraft: {
      id: DRAFT_ID,
      scanId: SCAN_ID,
      architectureJson: structuredClone(architectureJson),
      protectedValueKeys: ["providerResourceId", "providerResourceType"],
      editableValueKeys: ["displayName", "description"],
      createdAt: now.toISOString()
    },
    findings: [],
    analysisExclusions: [],
    importSuggestions: SOURCE_NODE_IDS.map((resourceId) => ({
      id: `import-${resourceId}`,
      resourceId,
      status: "ready" as const,
      handoffReady: true,
      terraformAddress:
        resourceId === "vpc-1" ? "aws_vpc.imported_vpc" : "aws_subnet.imported_subnet",
      reason: "기존 AWS Resource로 연결할 수 있습니다."
    })),
    scanErrors: []
  };

  return {
    id: SCAN_ID,
    projectId: PROJECT_ID,
    awsConnectionId: scan.awsConnectionId,
    provider: "aws",
    region: scan.region,
    resourceTypes: scan.resourceTypes,
    status: "completed",
    result,
    errorSummary: null,
    startedAt: now,
    completedAt: now,
    cancelRequestedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

/** CAS 테스트에 필요한 ProjectDraft row를 실제 저장 모양으로 만듭니다. */
function createDraftRow(
  diagramJson: DiagramJson,
  terraformFiles: TerraformSyncFileInput[] | null,
  revision: number
): ProjectDraftRow {
  const now = new Date("2026-07-23T00:00:00.000Z");

  return {
    id: DRAFT_ID,
    projectId: PROJECT_ID,
    diagramJson: structuredClone(diagramJson),
    terraformFiles: terraformFiles ? structuredClone(terraformFiles) : null,
    revision,
    serverSavedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

/** 공개 Terraform identity는 공백 문자열을 유효한 값으로 사용하지 않습니다. */
function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** 테스트 후보도 서버 공개 config가 가진 block 종류만 사용합니다. */
function readTerraformBlockType(value: unknown): "resource" | "data" | undefined {
  return value === "resource" || value === "data" ? value : undefined;
}
