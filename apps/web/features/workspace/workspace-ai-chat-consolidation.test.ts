import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatSource = read("WorkspaceAiChatDock.tsx");
const toolbarSource = read("TerraformCodeToolbar.tsx");
const issuesSource = read("TerraformIssuesPanel.tsx");
const stylesSource = read("workspace.module.css");

test("오류 분석과 에이전트 리뷰 실행은 AI 채팅에만 존재한다", () => {
  assert.doesNotMatch(toolbarSource, /TerraformAgentReviewButton/);
  assert.doesNotMatch(issuesSource, /TerraformIssueAnalysisButton/);
  assert.match(chatSource, />선택 오류 분석</);
  assert.match(chatSource, />모두 분석</);
  assert.match(chatSource, />에이전트 리뷰</);
  assert.match(chatSource, />적용 가능한 항목 모두 수정</);
});

test("데스크톱 AI 채팅은 명시적으로 닫을 때까지 Board 상호작용을 막지 않는다", () => {
  assert.doesNotMatch(chatSource, /event\.target === event\.currentTarget[\s\S]*closeChatDock/);
  assert.match(stylesSource, /\.aiChatOverlay\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(stylesSource, /\.aiChatDock\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(
    stylesSource,
    /@media \(max-width: 768px\)[\s\S]*\.aiChatOverlay\s*\{[^}]*pointer-events:\s*auto;/s
  );
});

test("오른쪽 패널 상호작용은 탭만 바꾸고 닫힌 채팅을 강제로 열지 않는다", () => {
  assert.doesNotMatch(chatSource, /terraformIssueRequest|terraformPreviewRequest/);
  assert.match(
    chatSource,
    /latestTerraformAiInteractionIdRef\.current = terraformAiInteraction\.id;\s*setActiveChatTab\(terraformAiInteraction\.scope\);/
  );
  assert.match(chatSource, /onOpen=\{\(\) => setOpen\(true\)\}/);
});

test("오류 분석은 파일별 코드와 fingerprint를 사용해 순차 실행하고 결과를 저장한다", () => {
  assert.match(chatSource, /resolveTerraformIssueCode\(\{/);
  assert.match(
    chatSource,
    /for \(let index = 0; index < issues\.length; index \+= 1\)[\s\S]*await analyzeTerraformIssue/
  );
  assert.match(chatSource, /readStoredTerraformIssueAnalyses/);
  assert.match(chatSource, /storeTerraformIssueAnalyses/);
  assert.match(
    chatSource,
    /terraformAiContextRef\.current\.fingerprint !== contextSnapshot\.fingerprint/
  );
  assert.match(chatSource, /requestRegistryRef\.current\.cancel\("errors"\)/);
});

test("안전 수정은 최신 분석과 정확한 파일이 있을 때만 batch 계약으로 요청한다", () => {
  assert.match(chatSource, /analysis\?\.state !== "idle" \|\| !analysis\.explanation/);
  assert.match(chatSource, /expectedTerraformFingerprint: terraformAiContext\.fingerprint/);
  assert.match(chatSource, /mode: "single"/);
  assert.match(chatSource, /mode: "all"/);
  assert.match(chatSource, /오류가 발생한 Terraform 파일을 특정할 수 없습니다/);
  assert.match(chatSource, /오류 분석에 실패했습니다\. 다시 분석한 뒤 수정안을 적용하세요/);
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
