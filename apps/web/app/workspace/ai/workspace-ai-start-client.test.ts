import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("AI 시작 화면은 Board 적용 전에 Compiler 제안 근거를 보여준다", () => {
  const source = readFileSync(join(currentDir, "workspace-ai-start-client.tsx"), "utf8");
  const summaryIndex = source.indexOf("ArchitectureBoardCompilationSummary");
  const approvalIndex = source.indexOf("onClick={() => void workflow.approveDraft()}");

  assert.match(source, /ArchitectureBoardCompilationSummary/);
  assert.match(source, /proposal=\{workflow\.compilationProposal\}/);
  assert.ok(summaryIndex >= 0);
  assert.ok(approvalIndex > summaryIndex);
});

test("오른쪽 패널은 final, progress, empty 순서이고 기존 프로젝트에는 progress를 노출하지 않는다", () => {
  const source = readFileSync(join(currentDir, "workspace-ai-start-client.tsx"), "utf8");
  const finalIndex = source.indexOf("workflow.previewDiagram !== null && workflow.draft !== null");
  const progressIndex = source.indexOf(
    "existingProject === undefined && workflow.progressSnapshot !== null"
  );
  const emptyIndex = source.indexOf("className={styles.emptyPreview}", progressIndex);

  assert.ok(finalIndex >= 0);
  assert.ok(progressIndex > finalIndex);
  assert.ok(emptyIndex > progressIndex);
});

test("모바일은 접근 가능한 대화/진행 탭과 항상 보이는 상단 상태를 제공한다", () => {
  const source = readFileSync(join(currentDir, "workspace-ai-start-client.tsx"), "utf8");
  const css = readFileSync(join(currentDir, "workspace-ai-start.module.css"), "utf8");

  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{workflow\.mobilePane === "conversation"\}/);
  assert.match(source, /aria-selected=\{workflow\.mobilePane === "progress"\}/);
  assert.match(source, /onKeyDown=\{handleMobileTabKeyDown\}/);
  assert.match(source, />\s*대화\s*</);
  assert.match(source, />\s*진행 중인 초안\s*</);
  assert.match(source, /data-mobile-pane=\{workflow\.mobilePane\}/);
  assert.match(source, /getTopStatusLabel/);
  assert.doesNotMatch(
    css,
    /@media \(max-width: 420px\)[\s\S]*\.previewStatus\s*\{[^}]*display:\s*none/
  );
});

test("progress preview는 승인된 후보 제외와 undo/retry만 제공하고 편집 동작은 두지 않는다", () => {
  const source = readFileSync(join(currentDir, "workspace-ai-start-client.tsx"), "utf8");
  const boardSource = readFileSync(join(currentDir, "ai-draft-board-preview.tsx"), "utf8");
  const progressStart = source.indexOf("function DraftProgressPreview");
  const progressEnd = source.indexOf("function ConversationMessage", progressStart);
  const progressSource = source.slice(progressStart, progressEnd);

  assert.ok(progressStart >= 0);
  assert.ok(progressEnd > progressStart);
  assert.match(progressSource, /excludableCandidateIds/);
  assert.match(progressSource, /excludeProgressCandidate/);
  assert.match(progressSource, /undoLastExclusion/);
  assert.match(progressSource, /retryDraft/);
  assert.match(progressSource, /progressStatus === "streaming"/);
  assert.match(progressSource, /cancelDraftProgress/);
  assert.match(progressSource, /생성 중단/);
  assert.match(progressSource, /마지막 초안을 유지합니다/);
  assert.match(progressSource, /대화에 따라 바뀔 수 있어요/);
  assert.match(
    source,
    /existingProject === undefined && workflow\.progressStatus === "streaming"[\s\S]*onClick=\{workflow\.cancelDraftProgress\}/
  );
  assert.doesNotMatch(progressSource, /Board에 적용|nodesDraggable|nodesConnectable|설정/);
  assert.doesNotMatch(progressSource, />\s*유지\s*</);

  assert.match(boardSource, /readonly excludableCandidateIds\?: readonly string\[\]/);
  assert.match(boardSource, /readonly onExcludeCandidate\?: \(candidateId: string\) => void/);
  assert.match(boardSource, /excludableCandidateIds\.includes\(node\.id\)/);
  assert.match(boardSource, /className=\{styles\.previewExclusionList\}/);
});

test("390x844 새 프로젝트 final preview는 summary, footer, 적용 버튼까지 스크롤된다", () => {
  const source = readFileSync(join(currentDir, "workspace-ai-start-client.tsx"), "utf8");
  const css = readFileSync(join(currentDir, "workspace-ai-start.module.css"), "utf8");
  const mobileStart = css.indexOf("@media (max-width: 720px)");
  const narrowMobileStart = css.indexOf("@media (max-width: 420px)", mobileStart);
  const mobileCss = css.slice(mobileStart, narrowMobileStart);

  assert.match(source, /data-view=\{/);
  assert.match(source, /\? "final"/);
  assert.match(source, /ArchitectureBoardCompilationSummary/);
  assert.match(source, /Board에 적용/);
  assert.ok(mobileStart >= 0);
  assert.ok(narrowMobileStart > mobileStart);
  assert.match(
    mobileCss,
    /\.workspace\[data-progress-enabled="true"\] \.preview\[data-view="final"\] \{[^}]*overflow-y: auto;/s
  );
  assert.match(
    mobileCss,
    /\.workspace\[data-progress-enabled="true"\] \.preview\[data-view="final"\] \{[^}]*grid-template-rows: auto minmax\(320px, 1fr\) auto auto;/s
  );
});

test("390px 모바일 composer는 배포 알림 FAB 영역을 피해 send hit target을 유지한다", () => {
  const source = readFileSync(join(currentDir, "workspace-ai-start-client.tsx"), "utf8");
  const css = readFileSync(join(currentDir, "workspace-ai-start.module.css"), "utf8");
  const narrowMobileStart = css.indexOf("@media (max-width: 420px)");
  const narrowMobileCss = css.slice(narrowMobileStart);

  assert.match(source, /aria-label="요구사항 보내기"/);
  assert.ok(narrowMobileStart >= 0);
  assert.match(
    narrowMobileCss,
    /\.composerActions \{[^}]*padding-right: 56px;/s
  );
});
