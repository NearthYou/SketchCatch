import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const subject = await import("./normalize-capture.mjs").catch(() => ({}));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const indexPath = path.join(
  repositoryRoot,
  "docs/gg/feat-infrastructure-template/brainboard-capture-index.json"
);
const capturesDirectory = path.join(
  repositoryRoot,
  "docs/gg/feat-infrastructure-template/brainboard-captures"
);

test("normalizeCapture preserves raw evidence while parsing exact geometry fields", () => {
  assert.equal(typeof subject.normalizeCapture, "function");

  const raw = makeCapture({
    viewport: { viewBox: "-346.8 -2227.27 3041.806451612903 1664.5440860215053" },
    nodes: [
      makeNode({
        sourceNodeId: "rotated",
        order: 0,
        transform: "translate(10.25, -20.5), rotate(-90 30 30)",
        parentSourceNodeId: null
      })
    ],
    edges: [makeEdge({ id: "edge-a", order: 0 })]
  });
  const before = cloneJson(raw);

  const normalized = subject.normalizeCapture(raw);

  assert.deepEqual(raw, before, "normalization must never mutate raw evidence");
  assert.deepEqual(normalized.viewport, {
    x: -346.8,
    y: -2227.27,
    width: 3041.806451612903,
    height: 1664.5440860215053
  });
  assert.equal(normalized.captureStatus, "captured");
  assert.equal("status" in normalized, false);
  assert.equal(normalized.origin.cloneArchitectureId, "11111111-2222-4333-8444-555555555555");
  assert.deepEqual(normalized.nodes[0], {
    kind: "unresolved",
    sourceNodeId: "rotated",
    domOrder: 0,
    zIndex: 0,
    position: { x: 0, y: 0 },
    size: { width: 60, height: 60 },
    rawResourceType: "aws_s3_bucket",
    label: "bucket",
    onboarding: "design-area-aws_s3_bucket",
    rawTransform: "translate(10.25, -20.5), rotate(-90 30 30)",
    rotation: -90,
    parentSourceNodeId: null
  });
  assert.deepEqual(normalized.edges[0].sourcePoint, { x: 60, y: 30 });
  assert.deepEqual(normalized.edges[0].targetPoint, { x: 100, y: 30 });
  assert.equal(normalized.edges[0].sourceEdgeId, "edge-a");
  assert.equal(normalized.edges[0].domOrder, 0);
  assert.equal(normalized.edges[0].zIndex, 0);
  assert.equal(normalized.edges[0].arrowDirection, "source-to-target");
  assert.equal(normalized.edges[0].arrowAngle, 0);
  assert.deepEqual(normalized.edges[0].rawArrow, raw.edges[0].arrow);
  assert.deepEqual(normalized.terraform, raw.terraform);
  assert.match(normalized.terraform.files[0].code, /value\s*=\s*var\.input/);
  assert.equal("terraformResourceType" in normalized.nodes[0], false);
  assert.equal("resourceName" in normalized.nodes[0], false);
});

test("normalizeCapture repairs only an inverted parent with the smallest full enclosure", () => {
  const raw = makeCapture({
    nodes: [
      makeNode({
        sourceNodeId: "large",
        order: 0,
        position: { x: 0, y: 0 },
        width: 500,
        height: 500,
        parentSourceNodeId: null
      }),
      makeNode({
        sourceNodeId: "smallest-enclosure",
        order: 1,
        position: { x: 50, y: 50 },
        width: 200,
        height: 200,
        parentSourceNodeId: null
      }),
      makeNode({
        sourceNodeId: "child",
        order: 2,
        position: { x: 100, y: 100 },
        width: 100,
        height: 100,
        parentSourceNodeId: "too-small"
      }),
      makeNode({
        sourceNodeId: "too-small",
        order: 3,
        position: { x: 120, y: 120 },
        width: 10,
        height: 10,
        parentSourceNodeId: "child"
      })
    ]
  });

  const normalized = subject.normalizeCapture(raw);

  assert.equal(parentOf(normalized, "child"), "smallest-enclosure");
  assert.equal(parentOf(normalized, "too-small"), "child", "valid raw parents are preserved");
  assert.equal(parentOf(normalized, "large"), null, "raw null parents are preserved");
  assert.equal(parentOf(normalized, "smallest-enclosure"), null);
  assert.deepEqual(normalized.normalization.parentRepairs, [
    {
      sourceNodeId: "child",
      fromParentSourceNodeId: "too-small",
      toParentSourceNodeId: "smallest-enclosure",
      strategy: "full-enclosure"
    }
  ]);
  assert.deepEqual(subject.findParentCycles(normalized.nodes), []);
});

test("parent repair uses the documented center tolerance and otherwise clears an inverted root", () => {
  assert.equal(subject.CENTER_CONTAINMENT_TOLERANCE, 0.5);
  const raw = makeCapture({
    nodes: [
      makeNode({
        sourceNodeId: "center-candidate",
        order: 0,
        position: { x: 0, y: 0 },
        width: 139.75,
        height: 200,
        parentSourceNodeId: null
      }),
      makeNode({
        sourceNodeId: "center-child",
        order: 1,
        position: { x: 90, y: 50 },
        width: 100,
        height: 100,
        parentSourceNodeId: "tiny-a"
      }),
      makeNode({
        sourceNodeId: "tiny-a",
        order: 2,
        position: { x: 100, y: 60 },
        width: 10,
        height: 10,
        parentSourceNodeId: "center-child"
      }),
      makeNode({
        sourceNodeId: "top-level",
        order: 3,
        position: { x: 500, y: 500 },
        width: 300,
        height: 300,
        parentSourceNodeId: "tiny-b"
      }),
      makeNode({
        sourceNodeId: "tiny-b",
        order: 4,
        position: { x: 510, y: 510 },
        width: 10,
        height: 10,
        parentSourceNodeId: "top-level"
      })
    ]
  });

  const normalized = subject.normalizeCapture(raw);

  assert.equal(parentOf(normalized, "center-child"), "center-candidate");
  assert.equal(parentOf(normalized, "top-level"), null);
  assert.deepEqual(
    normalized.normalization.parentRepairs.map(({ sourceNodeId, strategy }) => ({
      sourceNodeId,
      strategy
    })),
    [
      { sourceNodeId: "center-child", strategy: "center-containment" },
      { sourceNodeId: "top-level", strategy: "root" }
    ]
  );
  assert.deepEqual(subject.findParentCycles(normalized.nodes), []);
});

test("equal-area parent candidates fail in DOM order until a reviewed override is supplied", () => {
  const raw = makeCapture({
    nodes: [
      makeNode({
        sourceNodeId: "candidate-later",
        order: 1,
        position: { x: 0, y: 0 },
        width: 200,
        height: 200,
        parentSourceNodeId: null
      }),
      makeNode({
        sourceNodeId: "candidate-earlier",
        order: 0,
        position: { x: 0, y: 0 },
        width: 200,
        height: 200,
        parentSourceNodeId: null
      }),
      makeNode({
        sourceNodeId: "candidate-too-large",
        order: 2,
        position: { x: 0, y: 0 },
        width: 300,
        height: 300,
        parentSourceNodeId: null
      }),
      makeNode({
        sourceNodeId: "child",
        order: 3,
        position: { x: 50, y: 50 },
        width: 100,
        height: 100,
        parentSourceNodeId: "tiny"
      }),
      makeNode({
        sourceNodeId: "tiny",
        order: 4,
        position: { x: 60, y: 60 },
        width: 10,
        height: 10,
        parentSourceNodeId: "child"
      })
    ]
  });

  assert.throws(
    () => subject.normalizeCapture(raw),
    (error) => {
      assert.equal(error.code, "brainboard.normalize.ambiguous_parent");
      assert.deepEqual(error.details.candidateSourceNodeIds, [
        "candidate-earlier",
        "candidate-later"
      ]);
      return true;
    }
  );

  assert.throws(
    () =>
      subject.normalizeCapture(raw, {
        parentOverrides: { child: "candidate-too-large" }
      }),
    (error) => error.code === "brainboard.normalize.invalid_parent_override"
  );

  const normalized = subject.normalizeCapture(raw, {
    parentOverrides: { child: "candidate-later" }
  });
  assert.equal(parentOf(normalized, "child"), "candidate-later");
  assert.equal(normalized.normalization.parentRepairs[0].strategy, "override");
});

test("failed capture remains failed evidence with attempts and preview metadata", () => {
  const raw = {
    id: "brainboard-aws-instance-db-multiple-networks",
    sourceTemplateId: "09fd3420-d8f0-409c-a1cc-694dba97443f",
    title: "AWS instance and DB with multiple networks",
    downloads: 460,
    status: "failed",
    attemptedAt: "2026-07-14",
    origin: {
      platform: "brainboard",
      author: "Chafik Belhaoues",
      sourceUrl: "https://app.brainboard.co/templates/09fd3420-d8f0-409c-a1cc-694dba97443f",
      previewUrl:
        "https://s3.us-east-2.amazonaws.com/brainboard-screenshots-prod/architecture/09fd3420-d8f0-409c-a1cc-694dba97443f.webp",
      previewWidth: 3840,
      previewHeight: 2160
    },
    attempts: [
      { architectureName: "first", result: "HTTP 400 ERR_BAD_REQUEST" },
      { architectureName: "recovery", action: "Clone", result: "No UI response" }
    ],
    error: "Brainboard template clone failed"
  };
  const before = cloneJson(raw);

  const normalized = subject.normalizeCapture(raw);

  assert.deepEqual(raw, before);
  assert.equal(normalized.captureStatus, "failed");
  assert.equal("status" in normalized, false);
  assert.equal(normalized.provider, "aws");
  assert.deepEqual(normalized.attempts, raw.attempts);
  assert.deepEqual(normalized.origin, {
    ...raw.origin,
    sourceTemplateId: raw.sourceTemplateId,
    downloads: raw.downloads
  });
  assert.equal(normalized.error, raw.error);
  assert.equal("nodes" in normalized, false);
  assert.equal("edges" in normalized, false);
  assert.equal("terraform" in normalized, false);
  assert.equal("cloneBoardUrl" in normalized.origin, false);
});

test("arrow direction comes from marker center and parallel or markerless edges are preserved", () => {
  const edge = makeEdge({
    id: "edge-target-marker",
    order: 0,
    arrow: { points: "target", transform: "rotate(90, 100, 30)" }
  });
  const reverse = makeEdge({
    id: "edge-source-marker",
    order: 1,
    arrow: { points: "source", transform: "rotate(-90, 60, 30)" }
  });
  const markerless = makeEdge({ id: "edge-markerless", order: 2, arrow: null });
  const raw = makeCapture({ edges: [edge, reverse, markerless] });

  const normalized = subject.normalizeCapture(raw);

  assert.equal(normalized.edges.length, 3, "normalization must not dedupe parallel edges");
  assert.deepEqual(
    normalized.edges.map(({ arrowDirection, arrowAngle, rawArrow }) => ({
      arrowDirection,
      arrowAngle,
      rawArrow
    })),
    [
      { arrowDirection: "source-to-target", arrowAngle: 90, rawArrow: edge.arrow },
      { arrowDirection: "target-to-source", arrowAngle: -90, rawArrow: reverse.arrow },
      { arrowDirection: "none", arrowAngle: 0, rawArrow: null }
    ]
  );
});

test("full corpus normalization repairs exactly 59 parents with zero cycles and no raw writes", () => {
  assert.equal(typeof subject.normalizeCaptureCorpus, "function");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const rawHashesBefore = new Map(
    index.templates.map(({ file }) => [file, hashFile(path.join(capturesDirectory, file))])
  );

  const { captures, report } = subject.normalizeCaptureCorpus({
    indexPath,
    capturesDirectory
  });

  assert.deepEqual(report.summary, {
    totalTemplates: 24,
    capturedTemplates: 23,
    failedTemplates: 1,
    parentRepairs: 59,
    fullEnclosureRepairs: 40,
    centerContainmentRepairs: 0,
    rootRepairs: 19,
    overrideRepairs: 0,
    remainingParentCycles: 0,
    nonzeroRotations: 10,
    explicitEndpointPairs: 222,
    sourceEdges: 222,
    normalizedEdges: 222
  });
  assert.equal(report.parentRepairs.length, 59);
  assert.equal(captures.length, 24);
  assert.ok(
    captures
      .filter(({ captureStatus }) => captureStatus === "captured")
      .flatMap(({ nodes }) => nodes)
      .every(({ rotation }) => Number.isFinite(rotation))
  );
  assert.ok(
    captures
      .filter(({ captureStatus }) => captureStatus === "captured")
      .flatMap(({ edges }) => edges)
      .every(
        ({ sourcePoint, targetPoint, arrowAngle }) =>
          Number.isFinite(sourcePoint.x) &&
          Number.isFinite(sourcePoint.y) &&
          Number.isFinite(targetPoint.x) &&
          Number.isFinite(targetPoint.y) &&
          Number.isFinite(arrowAngle)
      )
  );
  const failed = captures.find(({ captureStatus }) => captureStatus === "failed");
  assert.equal(failed.provider, "aws");
  assert.equal(failed.origin.sourceTemplateId, "09fd3420-d8f0-409c-a1cc-694dba97443f");
  assert.equal(failed.attempts.length, 4);
  assert.equal("nodes" in failed, false);

  const rawHashesAfter = new Map(
    index.templates.map(({ file }) => [file, hashFile(path.join(capturesDirectory, file))])
  );
  assert.deepEqual(rawHashesAfter, rawHashesBefore, "raw capture bytes are immutable evidence");
});

function makeCapture(overrides = {}) {
  return {
    id: "brainboard-test",
    sourceTemplateId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    title: "Test capture",
    downloads: 1,
    status: "captured",
    error: null,
    origin: {
      platform: "brainboard",
      author: "Chafik Belhaoues",
      sourceTemplateId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      sourceUrl: "https://app.brainboard.co/templates/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      cloneBoardUrl: "https://app.brainboard.co/a/11111111-2222-4333-8444-555555555555/design",
      downloads: 1,
      capturedAt: "2026-07-14"
    },
    provider: "aws",
    viewport: { viewBox: "0 0 100 100" },
    nodes: [makeNode()],
    edges: [],
    terraform: {
      files: [
        {
          fileName: "main.tf",
          code: "locals {\n  value = var.input\n}\n",
          lineCount: 3,
          sha256: "raw-sha",
          includeInWorkspace: true
        }
      ],
      resourceAddresses: []
    },
    ...overrides
  };
}

function makeNode(overrides = {}) {
  return {
    height: 60,
    onboarding: "design-area-aws_s3_bucket",
    order: 0,
    position: { x: 0, y: 0 },
    resourceType: "aws_s3_bucket",
    sourceNodeId: "node-a",
    title: "bucket",
    transform: "translate(0, 0), rotate(0 30 30)",
    width: 60,
    parentSourceNodeId: null,
    ...overrides
  };
}

function makeEdge(overrides = {}) {
  return {
    arrow: { points: "", transform: "rotate(0, 100, 30)" },
    id: "edge-a",
    order: 0,
    svgPath: "M60,30 L100,30",
    sourceNodeId: "rotated",
    targetNodeId: "rotated",
    sourcePort: "right",
    targetPort: "left",
    sourcePoint: { x: 60, y: 30 },
    targetPoint: { x: 100, y: 30 },
    waypoints: [
      { x: 60, y: 30 },
      { x: 100, y: 30 }
    ],
    ...overrides
  };
}

function parentOf(capture, sourceNodeId) {
  return capture.nodes.find((node) => node.sourceNodeId === sourceNodeId).parentSourceNodeId;
}

function hashFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
