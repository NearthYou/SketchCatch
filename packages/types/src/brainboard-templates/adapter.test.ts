import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, TerraformSyncFileInput } from "../index.js";
import type { BrainboardTemplateSource } from "./source-types.js";

type AdaptedBrainboardTemplate = {
  readonly diagramJson: DiagramJson;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
};

type PublicContract = {
  readonly adaptBrainboardTemplateSource?: (
    source: BrainboardTemplateSource
  ) => AdaptedBrainboardTemplate;
  readonly brainboardTemplateSources?: readonly BrainboardTemplateSource[];
};

const contract = (await import("../index.js")) as unknown as PublicContract;

test("Brainboard adapter preserves Training graph order, absolute geometry, routes, and source file authority", () => {
  const source = requireSource(0);
  const adapted = requireAdapter()(source);
  const expectedNodes = [...source.nodes].sort((left, right) => left.domOrder - right.domOrder);
  const expectedEdges = [...source.edges].sort((left, right) => left.domOrder - right.domOrder);

  assert.deepEqual(
    adapted.diagramJson.nodes.map(({ id }) => id),
    expectedNodes.map(({ sourceNodeId }) => sourceNodeId)
  );
  assert.deepEqual(
    adapted.diagramJson.edges.map(({ id }) => id),
    expectedEdges.map(({ sourceEdgeId }) => sourceEdgeId)
  );
  assert.deepEqual(adapted.diagramJson.viewport, { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(adapted.diagramJson.presentation, {
    geometryPolicy: "source-exact",
    sourceViewBox: source.viewport,
    initialViewportPending: true
  });

  for (const sourceNode of source.nodes) {
    const node = adapted.diagramJson.nodes.find(({ id }) => id === sourceNode.sourceNodeId);
    assert.ok(node, sourceNode.sourceNodeId);
    assert.deepEqual(node.position, sourceNode.position, sourceNode.sourceNodeId);
    assert.deepEqual(node.size, sourceNode.size, sourceNode.sourceNodeId);
    assert.equal(node.label, sourceNode.label, sourceNode.sourceNodeId);
    assert.equal(node.zIndex, sourceNode.zIndex, sourceNode.sourceNodeId);
    assert.equal(node.rotation, sourceNode.rotation, sourceNode.sourceNodeId);
    assert.equal(
      node.metadata?.parentAreaNodeId,
      sourceNode.parentSourceNodeId ?? undefined,
      sourceNode.sourceNodeId
    );

    if (sourceNode.kind === "resource") {
      assert.equal(node.kind, "resource");
      assert.deepEqual(node.parameters, {
        terraformBlockType: sourceNode.terraformBlockType,
        terraformSourceAuthority: "workspace-seed",
        resourceType: sourceNode.terraformResourceType,
        resourceName: sourceNode.resourceName,
        fileName: sourceNode.fileName,
        values: {}
      });
    } else {
      assert.equal(node.kind, "design");
      assert.equal(node.type, sourceNode.rawResourceType);
      assert.equal(node.parameters, undefined);
      assert.equal(node.metadata?.presentationCatalogItemId, sourceNode.catalogId ?? undefined);
    }
  }

  for (const sourceEdge of source.edges) {
    const edge = adapted.diagramJson.edges.find(({ id }) => id === sourceEdge.sourceEdgeId);
    assert.ok(edge, sourceEdge.sourceEdgeId);
    assert.equal(edge.sourceNodeId, sourceEdge.sourceNodeId);
    assert.equal(edge.targetNodeId, sourceEdge.targetNodeId);
    assert.equal(edge.sourceHandleId, sourceEdge.sourcePort);
    assert.equal(edge.targetHandleId, sourceEdge.targetPort);
    assert.equal(edge.zIndex, sourceEdge.zIndex);
    assert.deepEqual(edge.route, {
      svgPath: sourceEdge.svgPath,
      sourcePoint: sourceEdge.sourcePoint,
      targetPoint: sourceEdge.targetPoint,
      waypoints: sourceEdge.waypoints,
      arrowDirection: sourceEdge.arrowDirection,
      arrowAngle: sourceEdge.arrowAngle
    });
  }

  assert.deepEqual(
    adapted.terraformFiles,
    source.terraform.files
      .filter(({ includeInWorkspace }) => includeInWorkspace)
      .map((file) => ({
        fileName: file.fileName,
        terraformCode: file.workspaceSeed?.code ?? file.code
      }))
  );
  assert.ok(
    adapted.terraformFiles.every(
      ({ terraformCode }) => !/arch(?:itecture)?_?uuid\s*=/iu.test(terraformCode)
    )
  );
});

test("Brainboard adapter keeps the blank EKS icon unresolved without inventing Catalog or Terraform identity", () => {
  const source = requireSource(1);
  const adapted = requireAdapter()(source);
  const sourceBlank = source.nodes.find(
    ({ sourceNodeId }) => sourceNodeId === "80d3a744-01c0-4e70-91e9-2186f7cdf201"
  );
  const blank = adapted.diagramJson.nodes.find(({ id }) => id === sourceBlank?.sourceNodeId);

  assert.ok(sourceBlank?.kind === "presentation");
  assert.ok(blank);
  assert.equal(blank.kind, "design");
  assert.equal(blank.label, " ");
  assert.equal(blank.type, "brainboard_icon");
  assert.equal(blank.parameters, undefined);
  assert.equal(blank.metadata?.presentationCatalogItemId, undefined);
});

test("Brainboard adapter resolves nested @ref and @address values through source resource identities", () => {
  const source = structuredClone(requireSource(0)) as BrainboardTemplateSource;
  const resources = source.nodes.filter((node) => node.kind === "resource");
  const target = resources[0];
  const referenced = resources[1];
  assert.ok(target?.kind === "resource");
  assert.ok(referenced?.kind === "resource");
  const mutableTarget = target as unknown as {
    values: Record<string, unknown>;
    valuesResolution: string;
  };
  mutableTarget.valuesResolution = "resolved";
  mutableTarget.values = {
    direct: `@address:${referenced.sourceNodeId}`,
    nested: {
      list: [`@ref:${referenced.sourceNodeId}.arn`]
    }
  };

  const adapted = requireAdapter()(source);
  const targetNode = adapted.diagramJson.nodes.find(({ id }) => id === target.sourceNodeId);
  const expectedAddress = `${referenced.terraformBlockType === "data" ? "data." : ""}${referenced.terraformResourceType}.${referenced.resourceName}`;

  assert.deepEqual(targetNode?.parameters?.values, {
    direct: expectedAddress,
    nested: { list: [`${expectedAddress}.arn`] }
  });

  mutableTarget.values = { missing: "@address:missing-source-node" };
  assert.throws(
    () => requireAdapter()(source),
    /brainboard\.adapter\.unresolved_source_reference/u
  );
});

test("Brainboard adapter deep-clones mutable Diagram data and fails invalid sources without dropping nodes", () => {
  const source = requireSource(0);
  const sourceSnapshot = JSON.stringify(source);
  const adapted = requireAdapter()(source);
  const firstNode = adapted.diagramJson.nodes[0]!;
  const firstEdge = adapted.diagramJson.edges[0]!;

  firstNode.position.x += 999;
  firstNode.parameters!.values.changed = true;
  firstEdge.route!.waypoints[0]!.x += 999;
  adapted.terraformFiles[0]!.terraformCode += "\n# edited";

  assert.equal(JSON.stringify(source), sourceSnapshot);

  const invalid = structuredClone(source) as BrainboardTemplateSource;
  const mutableInvalid = invalid as unknown as {
    nodes: Array<{ resourceName?: string }>;
  };
  mutableInvalid.nodes[0]!.resourceName = "missing-source-address";

  assert.throws(
    () => requireAdapter()(invalid),
    /brainboard\.source\.(?:missing_resource_address|missing_resource_block)/u
  );
});

function requireAdapter(): NonNullable<PublicContract["adaptBrainboardTemplateSource"]> {
  assert.equal(typeof contract.adaptBrainboardTemplateSource, "function");
  return contract.adaptBrainboardTemplateSource!;
}

function requireSource(index: number): BrainboardTemplateSource {
  assert.ok(contract.brainboardTemplateSources);
  const source = contract.brainboardTemplateSources[index];
  assert.ok(source);
  return source;
}
