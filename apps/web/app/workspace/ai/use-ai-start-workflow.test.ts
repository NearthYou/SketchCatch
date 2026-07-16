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
  assert.match(
    source,
    /preserveDraftProgressProjection\(\s*progressSnapshotRef\.current,\s*projectedSnapshot\s*\)/
  );
});

test("progress Diagram layout은 snapshot이 바뀔 때만 다시 계산한다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");

  assert.match(source, /import \{ useEffect, useMemo, useRef, useState \} from "react"/);
  assert.match(
    source,
    /const progressDiagram = useMemo\(\s*\(\) => createProgressDiagram\(progressSnapshot\),\s*\[progressSnapshot\]\s*\)/
  );
});

test("새 프로젝트 stream 중단은 마지막 snapshot을 유지하고 화면을 떠나지 않는다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");
  const cancelProgressStart = source.indexOf("function cancelDraftProgress");
  const cancelStart = source.indexOf("function cancelStart", cancelProgressStart);
  const cancelProgressSource = source.slice(cancelProgressStart, cancelStart);

  assert.ok(cancelProgressStart >= 0);
  assert.ok(cancelStart > cancelProgressStart);
  assert.match(cancelProgressSource, /existingProjectId !== undefined/);
  assert.match(cancelProgressSource, /activeDraftRequestRef\.current === null/);
  assert.match(cancelProgressSource, /abortActiveDraftRequest\(true\)/);
  assert.match(cancelProgressSource, /finishRequest\(\)/);
  assert.doesNotMatch(cancelProgressSource, /router\.(?:push|replace)/);
  assert.match(source.slice(cancelStart), /router\.push\(existingProjectReturnHref/);
  assert.match(source, /cancelDraftProgress,/);
});

test("후보 제외 undo는 clarification 이후의 최신 request와 snapshot을 사용한다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");
  const undoStart = source.indexOf("function undoLastExclusion");
  const undoEnd = source.indexOf("async function retryDraft", undoStart);
  const undoSource = source.slice(undoStart, undoEnd);

  assert.match(source, /applyProgressCandidateExclusions/);
  assert.match(source, /excludeProgressCandidate/);
  assert.match(source, /undoProgressCandidate/);
  assert.match(source, /candidateExclusions/);
  assert.match(source, /abortActiveDraftRequest/);
  assert.match(source, /excludeProgressCandidate:/);
  assert.ok(undoStart >= 0);
  assert.ok(undoEnd > undoStart);
  assert.match(undoSource, /const currentRequest = lastDraftRequestRef\.current/);
  assert.match(undoSource, /const currentServerSnapshot = rawProgressSnapshotRef\.current/);
  assert.match(
    undoSource,
    /restoreProgressCandidate\(currentServerSnapshot, remainingExclusions\)/
  );
  assert.match(
    undoSource,
    /preserveDraftProgressProjection\(\s*progressSnapshotRef\.current,\s*restoreProgressCandidate\(currentServerSnapshot, remainingExclusions\)\s*\)/
  );
  assert.match(undoSource, /\.\.\.currentRequest, candidateExclusions: remainingExclusions/);
  assert.doesNotMatch(undoSource, /undo\.(?:request|serverSnapshot)/);
  assert.doesNotMatch(
    source,
    /readonly request: CreateArchitectureDraftRequest;[\s\S]*readonly serverSnapshot:/
  );
});

test("Compiler 실패 전에는 last-good progress를 지우거나 final을 publish하지 않는다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");
  const showDraftStart = source.indexOf("function showDraft");
  const showDraftEnd = source.indexOf("function beginRequest", showDraftStart);
  const showDraftSource = source.slice(showDraftStart, showDraftEnd);
  const differenceIndex = showDraftSource.indexOf("computeDraftProgressDifference");
  const compileIndex = showDraftSource.indexOf("compileArchitectureDraftProposal");
  const clearProgressIndex = showDraftSource.indexOf("setProgressSnapshot(null)");
  const publishDraftIndex = showDraftSource.indexOf("setDraft(result)");

  assert.ok(showDraftStart >= 0);
  assert.ok(showDraftEnd > showDraftStart);
  assert.ok(differenceIndex >= 0);
  assert.ok(compileIndex > differenceIndex);
  assert.ok(clearProgressIndex > compileIndex);
  assert.ok(publishDraftIndex > compileIndex);
  assert.doesNotMatch(
    showDraftSource.slice(0, compileIndex),
    /set(?:FinalProgressDifference|ProgressSnapshot|ProgressStatus|Draft|CompilationProposal|PreviewDiagram)\(/
  );
});
