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

  assert.ok(modulePatterns, "ArchitectureBoardKnowledgeArtifact.modulePatterns must exist");
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
        ({ sourceNodeId, targetNodeId }) => nodeIds.has(sourceNodeId) && nodeIds.has(targetNodeId)
      )
    );
    const resourceAddresses = new Set(
      pattern.nodes.flatMap((node) => {
        const parameters = node.parameters;
        return parameters
          ? [
              `${parameters.terraformBlockType === "data" ? "data." : ""}${parameters.resourceType}.${parameters.resourceName}`
            ]
          : [];
      })
    );
    const danglingTerraformReferences = [
      ...new Set(
        pattern.nodes.flatMap((node) =>
          extractTerraformResourceAddresses(node.parameters?.values).filter(
            (address) => !resourceAddresses.has(address)
          )
        )
      )
    ].sort();
    assert.deepEqual(
      danglingTerraformReferences,
      [],
      `${pattern.id} contains dangling Terraform references`
    );
    assert.ok(
      pattern.variables.every((variable) =>
        variable.bindings.every(({ nodeId }) => nodeIds.has(nodeId))
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
  const relationalDataLayer = modulePatterns.find(({ id }) => id === "relational-data-layer");
  assert.ok(relationalDataLayer);
  const relationalAddresses = new Set(
    relationalDataLayer.nodes.flatMap(({ parameters }) =>
      parameters ? [`${parameters.resourceType}.${parameters.resourceName}`] : []
    )
  );
  assert.ok([...relationalAddresses].some((address) => address.startsWith("aws_db_")));
  assert.ok(
    relationalDataLayer.nodes.filter(({ parameters }) => parameters?.resourceType === "aws_subnet")
      .length >= 2
  );
  assert.equal(relationalAddresses.has("aws_subnet.app_subnet_a"), false);
  assert.equal(relationalAddresses.has("aws_subnet.app_subnet_b"), false);
  assert.equal(relationalAddresses.has("aws_subnet.public_subnet_a"), false);
  assert.equal(relationalAddresses.has("aws_subnet.public_subnet_b"), false);
  assert.deepEqual(sourceArtifact, generatedArchitectureBoardKnowledgeArtifact);
});

function extractTerraformResourceAddresses(value: unknown): string[] {
  if (typeof value === "string") {
    return [...value.matchAll(/(?:data\.)?(?:aws|kubernetes)_[a-z0-9_]+\.[a-z0-9_]+/g)].map(
      ([address]) => address
    );
  }
  if (Array.isArray(value)) return value.flatMap(extractTerraformResourceAddresses);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(extractTerraformResourceAddresses);
  }
  return [];
}
