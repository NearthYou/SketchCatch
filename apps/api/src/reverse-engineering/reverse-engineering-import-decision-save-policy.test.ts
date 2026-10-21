import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, ReverseEngineeringImportDecision } from "@sketchcatch/types";
import {
  assertPreservesServerConfirmedReverseEngineeringImportDecisions,
  ReverseEngineeringImportDecisionMutationError
} from "./reverse-engineering-import-decision-save-policy.js";

const importDecision: ReverseEngineeringImportDecision = {
  version: 1,
  mode: "import_existing",
  statusAtConfirmation: "ready"
};

test("일반 Draft 저장은 서버가 확인한 import 결정을 그대로 보존할 때만 허용한다", () => {
  const current = diagramWithNode("resource-1", importDecision);
  const next = structuredClone(current);
  next.nodes[0]!.position = { x: 320, y: 180 };

  assert.doesNotThrow(() =>
    assertPreservesServerConfirmedReverseEngineeringImportDecisions(current, next)
  );
});

test("일반 Draft 저장으로 import 결정을 새로 추가하거나 바꾸지 못한다", () => {
  assert.throws(
    () =>
      assertPreservesServerConfirmedReverseEngineeringImportDecisions(
        diagramWithNode("resource-1"),
        diagramWithNode("resource-1", importDecision)
      ),
    ReverseEngineeringImportDecisionMutationError
  );

  assert.throws(
    () =>
      assertPreservesServerConfirmedReverseEngineeringImportDecisions(
        diagramWithNode("resource-1", importDecision),
        diagramWithNode("resource-1", { ...importDecision, mode: "observe_only" })
      ),
    ReverseEngineeringImportDecisionMutationError
  );
});

test("전용 저장도 허용된 source node에만 import 결정을 새로 기록한다", () => {
  assert.doesNotThrow(() =>
    assertPreservesServerConfirmedReverseEngineeringImportDecisions(
      diagramWithNode("source-resource"),
      diagramWithNode("source-resource", importDecision),
      new Set(["source-resource"])
    )
  );

  assert.throws(
    () =>
      assertPreservesServerConfirmedReverseEngineeringImportDecisions(
        diagramWithNode("unrelated-resource"),
        diagramWithNode("unrelated-resource", importDecision),
        new Set(["source-resource"])
      ),
    ReverseEngineeringImportDecisionMutationError
  );
});

test("전용 저장도 source 밖의 기존 import 결정을 바꾸거나 지우지 못한다", () => {
  assert.throws(
    () =>
      assertPreservesServerConfirmedReverseEngineeringImportDecisions(
        diagramWithNode("unrelated-resource", importDecision),
        diagramWithNode("unrelated-resource", {
          ...importDecision,
          mode: "observe_only"
        }),
        new Set(["source-resource"])
      ),
    ReverseEngineeringImportDecisionMutationError
  );

  assert.throws(
    () =>
      assertPreservesServerConfirmedReverseEngineeringImportDecisions(
        diagramWithNode("unrelated-resource", importDecision),
        diagramWithNode("unrelated-resource"),
        new Set(["source-resource"])
      ),
    ReverseEngineeringImportDecisionMutationError
  );
});

test("결정이 있는 node를 남긴 채 metadata만 지우는 저장은 거부한다", () => {
  assert.throws(
    () =>
      assertPreservesServerConfirmedReverseEngineeringImportDecisions(
        diagramWithNode("resource-1", importDecision),
        diagramWithNode("resource-1")
      ),
    ReverseEngineeringImportDecisionMutationError
  );
});

test("사용자가 Board에서 결정이 있는 node 자체를 삭제하는 것은 허용한다", () => {
  assert.doesNotThrow(() =>
    assertPreservesServerConfirmedReverseEngineeringImportDecisions(
      diagramWithNode("resource-1", importDecision),
      emptyDiagram()
    )
  );
});

test("같은 node ID가 중복되어 import 결정 소유권이 모호하면 거부한다", () => {
  const next = diagramWithNode("resource-1", importDecision);
  next.nodes.push(structuredClone(next.nodes[0]!));

  assert.throws(
    () =>
      assertPreservesServerConfirmedReverseEngineeringImportDecisions(
        diagramWithNode("resource-1", importDecision),
        next
      ),
    ReverseEngineeringImportDecisionMutationError
  );
});

/** 서버 승인 결정의 생성·변경·삭제 시나리오를 한 Resource로 표현합니다. */
function diagramWithNode(id: string, decision?: ReverseEngineeringImportDecision): DiagramJson {
  return {
    ...emptyDiagram(),
    nodes: [
      {
        id,
        type: "aws_s3_bucket",
        kind: "resource",
        position: { x: 0, y: 0 },
        size: { width: 48, height: 48 },
        label: "고객 파일",
        locked: false,
        zIndex: 1,
        metadata: {
          reverseEngineering: {
            source: "aws_scan",
            protectedValueKeys: ["providerResourceId"],
            editableValueKeys: ["displayName"],
            ...(decision ? { importDecision: decision } : {})
          }
        },
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "customer_files",
          fileName: "reverse-engineering",
          values: {}
        }
      }
    ]
  };
}

/** 삭제 시나리오와 helper 조합에 쓰는 최소 유효 Board를 만듭니다. */
function emptyDiagram(): DiagramJson {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
