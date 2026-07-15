import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardModulePattern } from "./architecture-board-knowledge-contract";
import { createArchitectureBoardKnowledgeArtifactFromSource } from "./architecture-board-knowledge-source-generator";
import { generatedArchitectureBoardKnowledgeArtifact } from "./architecture-board-knowledge.generated";

test("generator는 이름 있는 기능별·용도별 Module pattern을 실제 Template fragment로 고정한다", () => {
  const sourceArtifact = createArchitectureBoardKnowledgeArtifactFromSource();
  const modulePatterns = Reflect.get(sourceArtifact, "modulePatterns") as
    | readonly ArchitectureBoardModulePattern[]
    | undefined;

  assert.ok(
    modulePatterns,
    "ArchitectureBoardKnowledgeArtifact.modulePatterns must exist"
  );
  assert.ok(modulePatterns.length > 0);
  assert.deepEqual(
    new Set(modulePatterns.flatMap((pattern) => pattern.lenses.map(({ kind }) => kind))),
    new Set(["functional", "purpose"])
  );

  let routedEdgeCount = 0;
  for (const pattern of modulePatterns) {
    assert.match(pattern.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(pattern.title.length > 0);
    assert.ok(pattern.description.length > 0);
    assert.ok(pattern.lenses.length > 0);
    assert.match(pattern.structuralFingerprint, /^fnv1a-[0-9a-f]{8}$/);
    assert.ok(pattern.nodes.length > 0);

    const nodeIds = new Set(pattern.nodes.map(({ id }) => id));
    assert.equal(nodeIds.size, pattern.nodes.length);
    assert.equal(Math.min(...pattern.nodes.map(({ position }) => position.x)), 0);
    assert.equal(Math.min(...pattern.nodes.map(({ position }) => position.y)), 0);
    assert.ok(
      pattern.nodes.every(
        ({ position, size }) =>
          position.x >= 0 &&
          position.y >= 0 &&
          Number.isFinite(position.x) &&
          Number.isFinite(position.y) &&
          size.width > 0 &&
          size.height > 0
      )
    );
    assert.ok(
      pattern.nodes.every(
        ({ metadata }) =>
          metadata?.parentAreaNodeId === undefined || nodeIds.has(metadata.parentAreaNodeId)
      )
    );
    assert.ok(
      pattern.edges.every(
        ({ sourceNodeId, targetNodeId }) =>
          nodeIds.has(sourceNodeId) && nodeIds.has(targetNodeId)
      )
    );

    for (const edge of pattern.edges) {
      if (!edge.route) continue;
      routedEdgeCount += 1;
      assert.doesNotMatch(edge.route.svgPath, /NaN|Infinity/);
      assert.ok(
        [edge.route.sourcePoint, ...edge.route.waypoints, edge.route.targetPoint].every(
          ({ x, y }) => Number.isFinite(x) && Number.isFinite(y)
        )
      );
    }

    assert.ok(pattern.provenance.extractorVersion.length > 0);
    assert.ok(pattern.provenance.representativeTemplateId.length > 0);
    assert.ok(pattern.provenance.sourceTemplateIds.length > 0);
    assert.ok(
      pattern.provenance.sourceTemplateIds.includes(pattern.provenance.representativeTemplateId)
    );
  }

  assert.ok(routedEdgeCount > 0);
  assert.deepEqual(sourceArtifact, generatedArchitectureBoardKnowledgeArtifact);
});
