import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("AI 시작 Draft와 Patch는 Compiler proposal을 같은 preview와 승인 경계로 사용한다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");

  assert.match(source, /compileArchitectureDraftProposal/);
  assert.doesNotMatch(source, /getDiagramJsonForArchitectureDraft/);
  assert.match(source, /showDraft\(nextDraft, baseDiagram, createPatchSummary\(response\)\)/);
  assert.match(source, /saveProjectDraft\(\{ diagramJson: compilationProposal\.diagram, projectId \}\)/);
  assert.match(source, /canApprove:[\s\S]*compilationProposal !== null/);
});

test("새 프로젝트 Draft만 progress stream을 사용하고 기존 프로젝트는 JSON 응답을 유지한다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");

  assert.match(source, /createAiArchitectureDraftStream/);
  assert.match(
    source,
    /if \(existingProjectId !== undefined\) \{[\s\S]*createAiArchitectureDraft\(request\)[\s\S]*return;?[\s\S]*\}/
  );
  assert.match(
    source,
    /createAiArchitectureDraftStream\([\s\S]*signal: controller\.signal[\s\S]*onProgress:/
  );
});

test("Draft progress 요청은 abort와 단조 request identity로 stale event를 차단한다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");

  assert.match(source, /useRef<AbortController \| null>/);
  assert.match(source, /requestIdentityRef = useRef\(0\)/);
  assert.match(source, /const requestIdentity = \+\+requestIdentityRef\.current/);
  assert.match(source, /requestIdentity !== requestIdentityRef\.current/);
  assert.match(source, /controller\.signal\.aborted/);
  assert.match(source, /rawProgressSnapshotRef/);
  assert.match(source, /progressSnapshotRef/);
  assert.match(source, /mobilePaneSelectionRef/);
  assert.match(source, /shouldRevealProgress[\s\S]*!mobilePaneSelectionRef\.current/);
  assert.match(source, /progressStatus/);
  assert.match(source, /progressDiagram/);
  assert.match(source, /progressHistory/);
});

test("후보 제외와 undo는 현재 투영을 즉시 갱신하고 final diff 뒤에 progress를 비운다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");
  const finalDifferenceIndex = source.indexOf("computeDraftProgressDifference");
  const clearProgressIndex = source.indexOf("setProgressSnapshot(null)", finalDifferenceIndex);

  assert.match(source, /applyProgressCandidateExclusions/);
  assert.match(source, /excludeProgressCandidate/);
  assert.match(source, /undoProgressCandidate/);
  assert.match(source, /candidateExclusions/);
  assert.match(source, /abortActiveDraftRequest/);
  assert.match(source, /excludeProgressCandidate:/);
  assert.match(source, /undoLastExclusion/);
  assert.match(source, /retryDraft/);
  assert.match(
    source,
    /if \(currentProgress !== null\) \{[\s\S]*setFinalProgressDifference\(difference\);\n\s*\}[\s\S]*setProgressSnapshot\(null\)/
  );
  assert.ok(finalDifferenceIndex >= 0);
  assert.ok(clearProgressIndex > finalDifferenceIndex);
});
