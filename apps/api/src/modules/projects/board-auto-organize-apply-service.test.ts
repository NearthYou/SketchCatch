import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, TerraformSyncFileInput } from "@sketchcatch/types";
import type { Database } from "../../db/client.js";
import type { ProjectDraftRow } from "./project-drafts.js";
import {
  applyBoardAutoOrganizeDraft,
  BoardAutoOrganizeSemanticMismatchError,
  BoardAutoOrganizeSourceMismatchError,
  createBoardAutoOrganizeSourceFingerprint
} from "./board-auto-organize-apply-service.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "11111111-1111-4111-8111-111111111111";

test("server applies a visual-only candidate through the existing draft revision CAS", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.position = { x: 320, y: 180 };
  const terraformFiles: TerraformSyncFileInput[] = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "main" {}' }
  ];
  const saveInputs: unknown[] = [];

  const result = await applyBoardAutoOrganizeDraft(
    {
      candidateDiagram,
      db: {} as Database,
      expectedRevision: 7,
      projectId: PROJECT_ID,
      sourceDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
      terraformFiles,
      userId: USER_ID
    },
    {
      readDraft: async () => ({
        ...createDraftRow(sourceDiagram, terraformFiles),
        revision: 7
      }),
      saveDraftRevision: async (input) => {
        saveInputs.push(input);
        return { status: "saved", draft: createDraftRow(candidateDiagram, terraformFiles) };
      }
    }
  );

  assert.equal(result.status, "saved");
  assert.equal(saveInputs.length, 1);
  assert.deepEqual(
    (saveInputs[0] as { input: { diagramJson: DiagramJson } }).input.diagramJson,
    candidateDiagram
  );
});

test("server rejects a candidate that changes Resource meaning without calling the draft save", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.parameters!.values.cidrBlock = "10.9.0.0/16";
  let saveCalls = 0;

  await assert.rejects(
    () =>
      applyBoardAutoOrganizeDraft(
        {
          candidateDiagram,
          db: {} as Database,
          expectedRevision: 7,
          projectId: PROJECT_ID,
          sourceDiagram,
          sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
          terraformFiles: [],
          userId: USER_ID
        },
        {
          readDraft: async () => ({
            ...createDraftRow(sourceDiagram, []),
            revision: 7
          }),
          saveDraftRevision: async () => {
            saveCalls += 1;
            return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
          }
        }
      ),
    BoardAutoOrganizeSemanticMismatchError
  );

  assert.equal(saveCalls, 0);
});

test("server rejects a forged source and candidate that disagree with the persisted draft", async () => {
  const persistedDiagram = createDiagram();
  const forgedSourceDiagram = structuredClone(persistedDiagram);
  forgedSourceDiagram.nodes[0]!.parameters!.values.cidrBlock = "10.9.0.0/16";
  const forgedCandidateDiagram = structuredClone(forgedSourceDiagram);
  forgedCandidateDiagram.nodes[0]!.position = { x: 320, y: 180 };
  let saveCalls = 0;

  await assert.rejects(
    () =>
      applyBoardAutoOrganizeDraft(
        {
          candidateDiagram: forgedCandidateDiagram,
          db: {} as Database,
          expectedRevision: 7,
          projectId: PROJECT_ID,
          sourceDiagram: forgedSourceDiagram,
          sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(forgedSourceDiagram),
          terraformFiles: [],
          userId: USER_ID
        },
        {
          readDraft: async () => ({
            ...createDraftRow(persistedDiagram, []),
            revision: 7
          }),
          saveDraftRevision: async () => {
            saveCalls += 1;
            return { status: "saved", draft: createDraftRow(forgedCandidateDiagram, []) };
          }
        }
      ),
    BoardAutoOrganizeSourceMismatchError
  );

  assert.equal(saveCalls, 0);
});

test("server rejects a source fingerprint that was not created from the request source", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.position = { x: 320, y: 180 };
  let saveCalls = 0;

  await assert.rejects(
    () =>
      applyBoardAutoOrganizeDraft(
        {
          candidateDiagram,
          db: {} as Database,
          expectedRevision: 7,
          projectId: PROJECT_ID,
          sourceDiagram,
          sourceFingerprint: "00000000",
          terraformFiles: [],
          userId: USER_ID
        },
        {
          saveDraftRevision: async () => {
            saveCalls += 1;
            return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
          }
        }
      ),
    BoardAutoOrganizeSourceMismatchError
  );

  assert.equal(saveCalls, 0);
});

test("server rejects Terraform changes instead of saving them through visual-only apply", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.position = { x: 320, y: 180 };
  const persistedTerraformFiles: TerraformSyncFileInput[] = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "main" {}' }
  ];
  const changedTerraformFiles: TerraformSyncFileInput[] = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "changed" {}' }
  ];
  let saveCalls = 0;

  await assert.rejects(
    () =>
      applyBoardAutoOrganizeDraft(
        {
          candidateDiagram,
          db: {} as Database,
          expectedRevision: 7,
          projectId: PROJECT_ID,
          sourceDiagram,
          sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
          terraformFiles: changedTerraformFiles,
          userId: USER_ID
        },
        {
          readDraft: async () => ({
            ...createDraftRow(sourceDiagram, persistedTerraformFiles),
            revision: 7
          }),
          saveDraftRevision: async () => {
            saveCalls += 1;
            return {
              status: "saved",
              draft: createDraftRow(candidateDiagram, changedTerraformFiles)
            };
          }
        }
      ),
    BoardAutoOrganizeSourceMismatchError
  );

  assert.equal(saveCalls, 0);
});

test("server rejects direct requests that move or resize a locked Resource", async () => {
  const sourceDiagram = createDiagram();
  sourceDiagram.nodes[0]!.locked = true;
  const movedCandidate = structuredClone(sourceDiagram);
  movedCandidate.nodes[0]!.position = { x: 320, y: 180 };
  const resizedCandidate = structuredClone(sourceDiagram);
  resizedCandidate.nodes[0]!.size = { width: 640, height: 480 };
  let saveCalls = 0;

  for (const candidateDiagram of [movedCandidate, resizedCandidate]) {
    await assert.rejects(
      () =>
        applyBoardAutoOrganizeDraft(
          {
            candidateDiagram,
            db: {} as Database,
            expectedRevision: 7,
            projectId: PROJECT_ID,
            sourceDiagram,
            sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
            terraformFiles: [],
            userId: USER_ID
          },
          {
            readDraft: async () => ({
              ...createDraftRow(sourceDiagram, []),
              revision: 7
            }),
            saveDraftRevision: async () => {
              saveCalls += 1;
              return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
            }
          }
        ),
      BoardAutoOrganizeSemanticMismatchError
    );
  }

  assert.equal(saveCalls, 0);
});

test("server rejects direct requests that change or delete a locked auto frame", async () => {
  const sourceDiagram = createDiagram();
  const lockedFrame = createAutoFrame("board-auto-frame:locked", true);
  sourceDiagram.nodes.push(lockedFrame);
  const changedCandidate = structuredClone(sourceDiagram);
  changedCandidate.nodes.find((node) => node.id === lockedFrame.id)!.position.x += 120;
  const deletedCandidate = structuredClone(sourceDiagram);
  deletedCandidate.nodes = deletedCandidate.nodes.filter((node) => node.id !== lockedFrame.id);
  let saveCalls = 0;

  for (const candidateDiagram of [changedCandidate, deletedCandidate]) {
    await assert.rejects(
      () =>
        applyBoardAutoOrganizeDraft(
          {
            candidateDiagram,
            db: {} as Database,
            expectedRevision: 7,
            projectId: PROJECT_ID,
            sourceDiagram,
            sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
            terraformFiles: [],
            userId: USER_ID
          },
          {
            readDraft: async () => ({
              ...createDraftRow(sourceDiagram, []),
              revision: 7
            }),
            saveDraftRevision: async () => {
              saveCalls += 1;
              return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
            }
          }
        ),
      BoardAutoOrganizeSemanticMismatchError
    );
  }

  assert.equal(saveCalls, 0);
});

test("server rebuilds new auto frames from safe presentation fields and preserves viewport", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.viewport = { x: 9_000, y: -8_000, zoom: 0.25 };
  candidateDiagram.nodes.push({
    ...createAutoFrame("board-auto-frame:new", false),
    zIndex: 99,
    style: { borderColor: "#94a3b8", borderStyle: "dashed", textColor: "#334155" },
    metadata: {
      parentAreaNodeId: "node-vpc",
      presentationCatalogItemId: "design-group"
    },
    parameters: {
      resourceType: "aws_instance",
      resourceName: "must-not-persist",
      fileName: "main",
      values: { instanceType: "m7i.large" }
    }
  });
  const savedDiagrams: DiagramJson[] = [];

  const result = await applyBoardAutoOrganizeDraft(
    {
      candidateDiagram,
      db: {} as Database,
      expectedRevision: 7,
      projectId: PROJECT_ID,
      sourceDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
      terraformFiles: [],
      userId: USER_ID
    },
    {
      readDraft: async () => ({
        ...createDraftRow(sourceDiagram, []),
        revision: 7
      }),
      saveDraftRevision: async (input) => {
        savedDiagrams.push(input.input.diagramJson);
        return { status: "saved", draft: createDraftRow(input.input.diagramJson, []) };
      }
    }
  );

  const savedDiagram = savedDiagrams[0];
  assert.equal(result.status, "saved");
  assert(savedDiagram);
  assert.deepEqual(savedDiagram.viewport, sourceDiagram.viewport);
  assert.deepEqual(
    savedDiagram.nodes.find((node) => node.id === "board-auto-frame:new"),
    {
      ...createAutoFrame("board-auto-frame:new", false),
      zIndex: 0,
      style: { borderColor: "#94a3b8", borderStyle: "dashed", textColor: "#334155" }
    }
  );
});

test("server rejects node geometry outside Board and Editor bounds", async () => {
  const sourceDiagram = createDiagram();
  const outsideBoard = structuredClone(sourceDiagram);
  outsideBoard.nodes[0]!.position.x = 1_000_001;
  const belowEditorMinimum = structuredClone(sourceDiagram);
  belowEditorMinimum.nodes[0]!.size = { width: 119, height: 80 };
  const outsideBoardSize = structuredClone(sourceDiagram);
  outsideBoardSize.nodes[0]!.size = { width: 1_000_001, height: 80 };
  let saveCalls = 0;

  for (const candidateDiagram of [outsideBoard, belowEditorMinimum, outsideBoardSize]) {
    await assert.rejects(
      () =>
        applyBoardAutoOrganizeDraft(
          {
            candidateDiagram,
            db: {} as Database,
            expectedRevision: 7,
            projectId: PROJECT_ID,
            sourceDiagram,
            sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
            terraformFiles: [],
            userId: USER_ID
          },
          {
            readDraft: async () => ({
              ...createDraftRow(sourceDiagram, []),
              revision: 7
            }),
            saveDraftRevision: async () => {
              saveCalls += 1;
              return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
            }
          }
        ),
      BoardAutoOrganizeSemanticMismatchError
    );
  }

  assert.equal(saveCalls, 0);
});

test("server preserves a legacy area size without allowing it to shrink further", async () => {
  const legacySource = createDiagram();
  legacySource.nodes[0]!.size = { width: 112, height: 108 };

  for (const width of [112, 116, 120]) {
    const candidate = structuredClone(legacySource);
    candidate.nodes[0]!.position = { x: 180, y: 120 };
    candidate.nodes[0]!.size.width = width;

    await assert.doesNotReject(() => applyCandidateForTest(legacySource, candidate));
  }

  const legacyShrink = structuredClone(legacySource);
  legacyShrink.nodes[0]!.size.width = 111;
  await assert.rejects(
    () => applyCandidateForTest(legacySource, legacyShrink),
    BoardAutoOrganizeSemanticMismatchError
  );

  const currentSource = createDiagram();
  currentSource.nodes[0]!.size = { width: 120, height: 108 };
  const currentShrink = structuredClone(currentSource);
  currentShrink.nodes[0]!.size.width = 119;
  await assert.rejects(
    () => applyCandidateForTest(currentSource, currentShrink),
    BoardAutoOrganizeSemanticMismatchError
  );
});

test("server rejects non-finite, malformed, and out-of-bounds SVG route paths", async () => {
  const sourceDiagram = createDiagram();
  sourceDiagram.edges.push({
    id: "edge-loop",
    sourceNodeId: "node-vpc",
    targetNodeId: "node-vpc",
    route: {
      svgPath: "M 40 60 L 360 300",
      sourcePoint: { x: 40, y: 60 },
      targetPoint: { x: 360, y: 300 },
      waypoints: []
    }
  });
  const unsafePaths = [
    "M NaN 0 L 10 10",
    "M 0 0 L 10",
    "not-a-path",
    "M 0 0 L 1000001 10",
    "M 1000000 0 l 1000000 0"
  ];
  let saveCalls = 0;

  for (const svgPath of unsafePaths) {
    const candidateDiagram = structuredClone(sourceDiagram);
    candidateDiagram.edges[0]!.route!.svgPath = svgPath;

    await assert.rejects(
      () =>
        applyBoardAutoOrganizeDraft(
          {
            candidateDiagram,
            db: {} as Database,
            expectedRevision: 7,
            projectId: PROJECT_ID,
            sourceDiagram,
            sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
            terraformFiles: [],
            userId: USER_ID
          },
          {
            readDraft: async () => ({
              ...createDraftRow(sourceDiagram, []),
              revision: 7
            }),
            saveDraftRevision: async () => {
              saveCalls += 1;
              return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
            }
          }
        ),
      BoardAutoOrganizeSemanticMismatchError
    );
  }

  assert.equal(saveCalls, 0);
});

/** 테스트마다 같은 Resource 의미를 가진 source Diagram을 만듭니다. */
function createDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "node-vpc",
        type: "aws_vpc",
        kind: "resource",
        position: { x: 40, y: 60 },
        size: { width: 320, height: 240 },
        label: "VPC",
        locked: false,
        zIndex: 1,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: { cidrBlock: "10.0.0.0/16" }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

/** 서버 경계에서 자동 소유권과 잠금 상태를 검증할 표시 프레임을 만듭니다. */
function createAutoFrame(id: string, locked: boolean): DiagramJson["nodes"][number] {
  return {
    id,
    type: "design_group",
    kind: "design",
    position: { x: 20, y: 20 },
    size: { width: 220, height: 140 },
    label: "자동 표시 영역",
    locked,
    zIndex: 0,
    metadata: { presentationCatalogItemId: "design-group" }
  };
}

/** CAS 성공 결과에 필요한 최소 ProjectDraft row를 만듭니다. */
function createDraftRow(
  diagramJson: DiagramJson,
  terraformFiles: TerraformSyncFileInput[]
): ProjectDraftRow {
  const savedAt = new Date("2026-07-20T00:00:00.000Z");

  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: PROJECT_ID,
    diagramJson,
    terraformFiles,
    revision: 8,
    serverSavedAt: savedAt,
    createdAt: savedAt,
    updatedAt: savedAt
  };
}

/** geometry 경계 회귀가 실제 저장 경로의 서버 재조립을 통과하는지 확인합니다. */
async function applyCandidateForTest(
  sourceDiagram: DiagramJson,
  candidateDiagram: DiagramJson
): Promise<void> {
  await applyBoardAutoOrganizeDraft(
    {
      candidateDiagram,
      db: {} as Database,
      expectedRevision: 7,
      projectId: PROJECT_ID,
      sourceDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
      terraformFiles: [],
      userId: USER_ID
    },
    {
      readDraft: async () => ({ ...createDraftRow(sourceDiagram, []), revision: 7 }),
      saveDraftRevision: async () => ({
        status: "saved",
        draft: createDraftRow(candidateDiagram, [])
      })
    }
  );
}
