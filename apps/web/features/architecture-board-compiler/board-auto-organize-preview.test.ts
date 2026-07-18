import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";

import {
  createBoardAutoOrganizePreviewSession,
  getBoardAutoOrganizeViewportPolicy,
  resolveBoardAutoOrganizeDecision,
  selectBoardAutoOrganizePreviewView
} from "./board-auto-organize-preview";

test("자동 정리 미리보기는 처음 한 번만 화면을 맞추고 원본 전환에서는 같은 화면을 유지한다", () => {
  assert.deepEqual(getBoardAutoOrganizeViewportPolicy("open"), {
    applySourceViewport: true,
    autoFit: true
  });
  assert.deepEqual(getBoardAutoOrganizeViewportPolicy("switch"), {
    applySourceViewport: false,
    autoFit: false
  });
});

test("미리보기는 점수나 내부 식별자 없이 쉬운 변경점과 확인할 점만 제공한다", () => {
  const source = diagram();
  const organized = structuredClone(source);
  organized.nodes[0]!.position = { x: 120, y: 80 };
  organized.nodes[1]!.size = { width: 160, height: 100 };
  organized.edges[0]!.route = {
    svgPath: "M 120 80 L 360 200",
    sourcePoint: { x: 120, y: 80 },
    targetPoint: { x: 360, y: 200 },
    waypoints: []
  };

  const session = createBoardAutoOrganizePreviewSession(source, organized);

  assert.equal(session.summary.whatChanged, "리소스 위치 1곳, 영역 크기 1곳, 연결선 1개를 정리했어요.");
  assert.deepEqual(session.summary.reviewItems, [
    "리소스가 원하는 위치에 놓였는지 확인해 주세요.",
    "영역 크기와 여백이 자연스러운지 확인해 주세요.",
    "연결선이 리소스를 가리지 않는지 확인해 주세요."
  ]);
  assert.equal("quality" in session.summary, false);
  assert.equal("candidateId" in session.summary, false);
  assert.equal("compilerVersion" in session.summary, false);
  assert.equal("templateId" in session.summary, false);
  assert.equal("diagnostics" in session.summary, false);
});

test("원본과 정리 결과 전환은 같은 미리보기 안에서 보이는 Diagram만 바꾼다", () => {
  const source = diagram();
  const organized = structuredClone(source);
  organized.nodes[0]!.position = { x: 280, y: 160 };
  const sourceSnapshot = structuredClone(source);
  const organizedSnapshot = structuredClone(organized);

  const session = createBoardAutoOrganizePreviewSession(source, organized);
  assert.equal(session.activeView, "organized");
  assert.deepEqual(session.visibleDiagram, organized);

  const originalView = selectBoardAutoOrganizePreviewView(session, "original");
  assert.equal(originalView.activeView, "original");
  assert.deepEqual(originalView.visibleDiagram, source);

  const organizedView = selectBoardAutoOrganizePreviewView(originalView, "organized");
  assert.deepEqual(organizedView.visibleDiagram, organized);
  assert.deepEqual(source, sourceSnapshot);
  assert.deepEqual(organized, organizedSnapshot);
});

test("원본 유지는 적용 없이 닫고 정리 사용만 결과 복사본을 반환한다", () => {
  const source = diagram();
  const organized = structuredClone(source);
  organized.nodes[0]!.position = { x: 280, y: 160 };
  const viewportBeforePreview = { x: 33, y: 44, zoom: 0.7 };
  const session = createBoardAutoOrganizePreviewSession(
    source,
    organized,
    viewportBeforePreview
  );

  assert.deepEqual(resolveBoardAutoOrganizeDecision(session, "keep-original"), {
    diagramToApply: null,
    isStale: false,
    viewportToRestore: viewportBeforePreview
  });

  const approved = resolveBoardAutoOrganizeDecision(session, "use-organized", source);
  assert.deepEqual(approved.diagramToApply, organized);
  assert.notEqual(approved.diagramToApply, organized);
  assert.equal(approved.isStale, false);
  assert.equal(approved.viewportToRestore, null);
});

test("미리보기 중 원본 의미가 바뀌면 오래된 정리 결과를 적용하지 않는다", () => {
  const source = diagram();
  const organized = structuredClone(source);
  organized.nodes[0]!.position = { x: 280, y: 160 };
  const session = createBoardAutoOrganizePreviewSession(source, organized, {
    x: 33,
    y: 44,
    zoom: 0.7
  });
  const changedCurrent = structuredClone(source);
  changedCurrent.nodes[0]!.metadata = { parentAreaNodeId: "new-parent" };

  const resolution = resolveBoardAutoOrganizeDecision(
    session,
    "use-organized",
    changedCurrent
  );

  assert.equal(resolution.diagramToApply, null);
  assert.equal(resolution.isStale, true);
  assert.deepEqual(resolution.viewportToRestore, { x: 33, y: 44, zoom: 0.7 });
});

test("미리보기 중 Board 표시 계약이 바뀌어도 오래된 정리 결과를 적용하지 않는다", () => {
  const source = diagram();
  source.presentation = {
    geometryPolicy: "source-exact",
    terraformSourceFingerprint: "before"
  };
  const session = createBoardAutoOrganizePreviewSession(source, structuredClone(source));
  const changedCurrent = structuredClone(source);
  changedCurrent.presentation = {
    geometryPolicy: "source-exact",
    terraformSourceFingerprint: "after"
  };

  const resolution = resolveBoardAutoOrganizeDecision(
    session,
    "use-organized",
    changedCurrent
  );

  assert.equal(resolution.diagramToApply, null);
  assert.equal(resolution.isStale, true);
});

test("미리보기 중 관계의 화살표 방향이 바뀌어도 오래된 정리 결과를 적용하지 않는다", () => {
  const source = diagram();
  source.edges[0]!.route = {
    svgPath: "M 40 40 L 240 120",
    sourcePoint: { x: 40, y: 40 },
    targetPoint: { x: 240, y: 120 },
    waypoints: [],
    arrowDirection: "source-to-target"
  };
  const session = createBoardAutoOrganizePreviewSession(source, structuredClone(source));
  const changedCurrent = structuredClone(source);
  changedCurrent.edges[0]!.route!.arrowDirection = "target-to-source";

  const resolution = resolveBoardAutoOrganizeDecision(
    session,
    "use-organized",
    changedCurrent
  );

  assert.equal(resolution.diagramToApply, null);
  assert.equal(resolution.isStale, true);
});

test("바뀐 배치가 없으면 원본을 그대로 사용해도 된다고 안내한다", () => {
  const source = diagram();
  const session = createBoardAutoOrganizePreviewSession(source, structuredClone(source));

  assert.equal(session.summary.whatChanged, "정리할 부분을 찾지 못했어요.");
  assert.deepEqual(session.summary.reviewItems, ["현재 배치를 그대로 사용해도 돼요."]);
});

function diagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "node-a",
        type: "aws_instance",
        kind: "resource",
        position: { x: 40, y: 40 },
        size: { width: 48, height: 48 },
        label: "EC2",
        locked: false,
        zIndex: 1
      },
      {
        id: "area-a",
        type: "aws_vpc",
        kind: "resource",
        position: { x: 240, y: 120 },
        size: { width: 320, height: 240 },
        label: "VPC",
        locked: false,
        zIndex: 0
      }
    ],
    edges: [{ id: "edge-a", sourceNodeId: "node-a", targetNodeId: "area-a" }],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
