import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

function readWorkflowSource(): string {
  return readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");
}

test("AI 시작 Draft와 Patch는 Compiler proposal을 같은 preview와 승인 경계로 사용한다", () => {
  const source = readWorkflowSource();

  assert.match(source, /compileArchitectureDraftProposal/);
  assert.doesNotMatch(source, /getDiagramJsonForArchitectureDraft/);
  assert.match(source, /showDraft\(nextDraft, baseDiagram, createPatchSummary\(response\)\)/);
  assert.match(source, /saveProjectDraft\(\{ diagramJson: compilationProposal\.diagram, projectId \}\)/);
  assert.match(source, /canApprove:[\s\S]*compilationProposal !== null/);
});

test("새 프로젝트 Draft만 coordinator와 progress stream을 사용하고 기존 프로젝트는 JSON을 유지한다", () => {
  const source = readWorkflowSource();

  assert.match(
    source,
    /if \(existingProjectId !== undefined\) \{[\s\S]*createAiArchitectureDraft\(request\)[\s\S]*return;?[\s\S]*\}/
  );
  assert.match(source, /draftProgressCoordinatorRef\.current\.begin\(request\)/);
  assert.match(
    source,
    /createAiArchitectureDraftStream\(progressRequest\.request,[\s\S]*signal: progressRequest\.signal[\s\S]*onProgress:/
  );
});

test("hook은 테스트 가능한 coordinator에 stale·제외·undo·final 순서를 위임한다", () => {
  const source = readWorkflowSource();

  for (const contract of [
    /draftProgressCoordinatorRef\.current\.receive\(/,
    /draftProgressCoordinatorRef\.current\.complete\(progressRequest\)/,
    /draftProgressCoordinatorRef\.current\.interrupt\(progressRequest\)/,
    /draftProgressCoordinatorRef\.current\.exclude\(candidateId\)/,
    /draftProgressCoordinatorRef\.current\.undoLastExclusion\(\)/,
    /draftProgressCoordinatorRef\.current\.retryRequest\(\)/,
    /draftProgressCoordinatorRef\.current\.finalize\(/
  ]) {
    assert.match(source, contract);
  }

  assert.match(source, /draftProgressCoordinatorRef\.current\.awaitInput\(\)/);
  assert.match(source, /draftProgressCoordinatorRef\.current\.markInterrupted\(\)/);
});

test("progress Diagram layout은 snapshot이 바뀌 때만 다시 계산한다", () => {
  const source = readWorkflowSource();

  assert.match(source, /import \{ useEffect, useMemo, useRef, useState \} from "react"/);
  assert.match(
    source,
    /const progressDiagram = useMemo\(\s*\(\) => createProgressDiagram\(progressSnapshot\),\s*\[progressSnapshot\]\s*\)/
  );
});

test("새 프로젝트 stream 취소는 진행 상태만 중단하고 화면을 떠나지 않는다", () => {
  const source = readWorkflowSource();
  const cancelProgressStart = source.indexOf("function cancelDraftProgress");
  const cancelStart = source.indexOf("function cancelStart", cancelProgressStart);
  const cancelProgressSource = source.slice(cancelProgressStart, cancelStart);

  assert.ok(cancelProgressStart >= 0);
  assert.ok(cancelStart > cancelProgressStart);
  assert.match(cancelProgressSource, /existingProjectId !== undefined/);
  assert.match(cancelProgressSource, /hasActiveRequest/);
  assert.match(cancelProgressSource, /abortActiveDraftRequest\(true\)/);
  assert.match(cancelProgressSource, /finishRequest\(\)/);
  assert.doesNotMatch(cancelProgressSource, /router\.(?:push|replace)/);
  assert.match(source.slice(cancelStart), /router\.push\(existingProjectReturnHref/);
});

test("clarification 답변은 질문과 한 줄의 구조화된 요구사항으로 이어 붙인다", () => {
  const source = readWorkflowSource();

  assert.match(
    source,
    /const nextPrompt = `\$\{draftClarification\.prompt\}\\n\\n\$\{draftClarification\.clarification\.question\}: \$\{prompt\}`/
  );
});

test("final Compiler는 coordinator 내부에서 성공한 뒤에만 progress를 교체한다", () => {
  const source = readWorkflowSource();
  const showDraftStart = source.indexOf("function showDraft");
  const showDraftEnd = source.indexOf("function beginRequest", showDraftStart);
  const showDraftSource = source.slice(showDraftStart, showDraftEnd);
  const finalizeIndex = showDraftSource.indexOf("draftProgressCoordinatorRef.current.finalize");
  const compileIndex = showDraftSource.indexOf("compileArchitectureDraftProposal");
  const publishIndex = showDraftSource.indexOf("setDraft(result)");

  assert.ok(finalizeIndex >= 0);
  assert.ok(compileIndex > finalizeIndex);
  assert.ok(publishIndex > compileIndex);
  assert.match(showDraftSource, /publishDraftProgressState\(completedProgress\.state\)/);
});
