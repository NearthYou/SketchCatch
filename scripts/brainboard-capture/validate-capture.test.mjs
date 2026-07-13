import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const subject = await import("./validate-capture.mjs").catch(() => ({}));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const indexPath = `${repositoryRoot}/docs/gg/feat-infrastructure-template/brainboard-capture-index.json`;
const capturesDirectory = `${repositoryRoot}/docs/gg/feat-infrastructure-template/brainboard-captures`;

test("full committed corpus passes integrity checks and reports every known evidence gap", () => {
  assert.equal(typeof subject.validateCaptureCorpus, "function");

  const report = subject.validateCaptureCorpus({ indexPath, capturesDirectory });

  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.summary, {
    totalTemplates: 24,
    capturedTemplates: 23,
    failedTemplates: 1,
    metadataMismatches: 0,
    rawShaMismatches: 0,
    diagramShaMismatches: 0,
    terraformAggregateShaMismatches: 0,
    terraformFileShaMismatches: 0,
    idOrOrderErrors: 0,
    danglingReferenceErrors: 0,
    viewBoxErrors: 0,
    endpointErrors: 0,
    rawParentTwoNodeCycles: 43,
    invertedParentLinks: 59,
    semanticDuplicateEdgePairs: 9,
    nonzeroRotations: 10,
    explicitEndpointPairs: 222,
    emptyTextNodes: 11,
    shapeStyleGaps: 2,
    emptyUndefinedTerraformFiles: 5,
    visualAwsNodes: 341,
    terraformResourceAddresses: 331,
    visualAddressCountDelta: 10,
    visualNodesWithoutAddressType: 8,
    oneAddressMultipleVisualGroups: 2
  });
  assert.equal(report.findings.rawParentTwoNodeCycles.length, 43);
  assert.equal(report.findings.invertedParentLinks.length, 59);
  assert.equal(report.findings.semanticDuplicateEdgePairs.length, 9);
  assert.equal(report.findings.nonzeroRotations.length, 10);
  assert.equal(report.findings.emptyTextNodes.length, 11);
  assert.equal(report.findings.shapeStyleGaps.length, 2);
  assert.equal(report.findings.emptyUndefinedTerraformFiles.length, 5);
  assert.equal(report.findings.visualNodesWithoutAddressType.length, 8);
  assert.equal(report.findings.oneAddressMultipleVisualGroups.length, 2);
  assert.deepEqual(report.mappingAudit, {
    policy: "evidence-only-no-array-index-matching",
    exactTitleNameMatches: 170,
    singleTypeCandidateMatches: 63,
    unresolvedNodeAddressTypeGroups: 38
  });
});

test("validator rejects corrupt hashes, orders, references, viewBox, rotation, and endpoints", (t) => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "brainboard-capture-test-"));
  t.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));
  const temporaryCaptures = path.join(temporaryRoot, "captures");
  const temporaryIndex = path.join(temporaryRoot, "index.json");
  cpSync(capturesDirectory, temporaryCaptures, { recursive: true });
  cpSync(indexPath, temporaryIndex);

  const corruptPath = path.join(temporaryCaptures, "training-aws-onboarding.json");
  const corrupt = JSON.parse(readFileSync(corruptPath, "utf8"));
  corrupt.viewport.viewBox = "0 0 nope 100";
  corrupt.nodes[0].order = 9;
  corrupt.nodes[0].transform = "translate(0, 0), rotate(NaN 30 30)";
  corrupt.nodes[0].parentSourceNodeId = "missing-parent";
  corrupt.nodes[1].sourceNodeId = corrupt.nodes[0].sourceNodeId;
  corrupt.edges[0].sourceNodeId = "missing-source";
  corrupt.edges[0].sourcePoint.x = null;
  corrupt.terraform.files[0].code += "# corrupt\n";
  writeFileSync(corruptPath, `${JSON.stringify(corrupt, null, 2)}\n`);

  const report = subject.validateCaptureCorpus({
    indexPath: temporaryIndex,
    capturesDirectory: temporaryCaptures,
    repositoryRoot
  });
  const codes = new Set(report.errors.map(({ code }) => code));

  assert.equal(report.valid, false);
  for (const code of [
    "brainboard.capture.raw_sha_mismatch",
    "brainboard.capture.diagram_sha_mismatch",
    "brainboard.capture.terraform_file_sha_mismatch",
    "brainboard.capture.non_contiguous_node_order",
    "brainboard.capture.invalid_or_duplicate_node_id",
    "brainboard.capture.dangling_parent",
    "brainboard.capture.dangling_edge_source",
    "brainboard.capture.invalid_viewbox",
    "brainboard.capture.invalid_rotation",
    "brainboard.capture.invalid_edge_endpoint"
  ]) {
    assert.ok(codes.has(code), `missing validation error ${code}`);
  }
});

test("capture status is a deterministic 24-item download-order projection with failed evidence", () => {
  assert.equal(typeof subject.buildCaptureStatus, "function");

  const status = subject.buildCaptureStatus({ indexPath, capturesDirectory });

  assert.deepEqual(status.summary, { total: 24, captured: 23, failed: 1 });
  assert.equal(status.templates.length, 24);
  assert.deepEqual(
    status.templates.map(({ rank, status }) => [rank, status]),
    Array.from({ length: 24 }, (_, index) => [index + 1, index === 11 ? "failed" : "captured"])
  );
  assert.ok(
    status.templates.every(
      (template, index) =>
        index === 0 || template.downloads <= status.templates[index - 1].downloads
    )
  );
  assert.ok(
    status.templates
      .filter(({ status: captureStatus }) => captureStatus === "captured")
      .every(({ cloneBoardUrl, error }) => cloneBoardUrl !== null && error === null)
  );
  const failed = status.templates[11];
  assert.equal(failed.sourceTemplateId, "09fd3420-d8f0-409c-a1cc-694dba97443f");
  assert.equal(failed.cloneBoardUrl, null);
  assert.match(failed.error, /HTTP 400/);
  assert.match(failed.previewUrl, /09fd3420-d8f0-409c-a1cc-694dba97443f\.webp$/);
  assert.equal(failed.attempts.length, 4);
  assert.equal("nodes" in failed, false);
  assert.equal("terraform" in failed, false);
});

test("failed evidence enforces attempts, linked HTTPS metadata, dimensions, error, and no source fabrication", async (t) => {
  const cases = [
    {
      name: "one attempt",
      mutate(raw) {
        raw.attempts = raw.attempts.slice(0, 1);
      },
      code: "brainboard.capture.failed_attempts_invalid"
    },
    {
      name: "missing final clone action",
      mutate(raw) {
        delete raw.attempts[3].action;
      },
      code: "brainboard.capture.failed_attempts_invalid"
    },
    {
      name: "source URL not linked to source template UUID",
      mutate(raw) {
        raw.origin.sourceUrl =
          "https://app.brainboard.co/templates/11111111-2222-4333-8444-555555555555";
      },
      code: "brainboard.capture.failed_source_url_invalid"
    },
    {
      name: "non-Brainboard source URL",
      mutate(raw) {
        raw.origin.sourceUrl = `https://example.com/templates/${raw.sourceTemplateId}`;
      },
      code: "brainboard.capture.failed_source_url_invalid"
    },
    {
      name: "HTTP preview URL",
      mutate(raw) {
        raw.origin.previewUrl = raw.origin.previewUrl.replace("https://", "http://");
      },
      code: "brainboard.capture.failed_preview_url_invalid"
    },
    {
      name: "zero preview width",
      mutate(raw) {
        raw.origin.previewWidth = 0;
      },
      code: "brainboard.capture.failed_preview_dimensions_invalid"
    },
    {
      name: "negative preview height",
      mutate(raw) {
        raw.origin.previewHeight = -1;
      },
      code: "brainboard.capture.failed_preview_dimensions_invalid"
    },
    {
      name: "fractional preview width",
      mutate(raw) {
        raw.origin.previewWidth = 1.5;
      },
      code: "brainboard.capture.failed_preview_dimensions_invalid"
    },
    {
      name: "empty final error",
      mutate(raw, entry) {
        raw.error = "";
        entry.error = "";
      },
      code: "brainboard.capture.failed_error_missing"
    },
    {
      name: "provider fabrication",
      mutate(raw) {
        raw.provider = "aws";
      },
      code: "brainboard.capture.failed_fabricated_source"
    },
    {
      name: "graph fabrication",
      mutate(raw) {
        raw.nodes = [];
      },
      code: "brainboard.capture.failed_fabricated_source"
    }
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, (subtest) => {
      const report = validateMutatedFailedEvidence(subtest, testCase.mutate);
      assert.ok(
        report.errors.some(({ code }) => code === testCase.code),
        `missing ${testCase.code}: ${JSON.stringify(report.errors)}`
      );
    });
  }
});

function validateMutatedFailedEvidence(t, mutate) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "brainboard-failed-test-"));
  t.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));
  const temporaryCaptures = path.join(temporaryRoot, "captures");
  const temporaryIndex = path.join(temporaryRoot, "index.json");
  cpSync(capturesDirectory, temporaryCaptures, { recursive: true });
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const entry = index.templates[11];
  const failedPath = path.join(temporaryCaptures, entry.file);
  const raw = JSON.parse(readFileSync(failedPath, "utf8"));
  mutate(raw, entry);
  const rawText = `${JSON.stringify(raw, null, 2)}\n`;
  writeFileSync(failedPath, rawText);
  entry.captureSha256 = subject.sha256(rawText);
  writeFileSync(temporaryIndex, `${JSON.stringify(index, null, 2)}\n`);

  return subject.validateCaptureCorpus({
    indexPath: temporaryIndex,
    capturesDirectory: temporaryCaptures,
    repositoryRoot
  });
}
