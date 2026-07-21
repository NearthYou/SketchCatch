import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = read("DeliveryCenterPanel.tsx");
const shellSource = read("DeploymentConsoleShell.tsx");
const consoleSource = read("CicdConsoleScreen.tsx");
const overviewSource = read("CicdStatusBoard.tsx");
const accordionSource = read("CicdAccordionSection.tsx");
const drawerSource = read("CicdSettingsDrawer.tsx");
const loadingSource = read("CicdLoadingState.tsx");
const deliveryStyles = read("delivery-center.module.css");
const handoffSource = read("CicdHandoffPanel.tsx");
const pipelineSource = read("CicdPipelineRunsPanel.tsx");
const combined = [panelSource, consoleSource, overviewSource, handoffSource, pipelineSource].join(
  "\n"
);

test("CI/CD 준비 제목과 최근 확인을 올바른 헤더에 배치한다", () => {
  assert.match(panelSource, /<h2>CI\/CD 준비<\/h2>/);
  assert.doesNotMatch(panelSource, /<h2>CI\/CD<\/h2>/);
  assert.doesNotMatch(panelSource, /전체 새로고침/);
  assert.match(panelSource, /onLastRefreshedAtChange/);
  assert.match(shellSource, /cicdLastRefreshedAt/);
  assert.match(shellSource, /최근 확인/);
});

test("하나의 프레젠테이션 모델이 다음 작업과 네 Phase를 함께 구동한다", () => {
  assert.match(consoleSource, /getCicdReadinessPresentation/);
  assert.match(
    consoleSource,
    /getCicdReadinessPresentation\(\{[\s\S]*?currentHandoff: existingHandoff/
  );
  assert.match(consoleSource, /presentation=\{presentation\}/);
  assert.match(consoleSource, /<h3 id="cicd-config-title">준비 체크리스트<\/h3>/);
  assert.match(overviewSource, /presentation\.currentTask/);
  assert.match(overviewSource, /presentation\.phases\.map/);
  assert.match(overviewSource, /phase\.statusLabel/);
  assert.doesNotMatch(overviewSource, /function getNextAction/);
});

test("체크리스트는 번호가 있는 네 개의 평면 Phase만 사용한다", () => {
  assert.match(consoleSource, /phaseNumber="01"/);
  assert.match(consoleSource, /title="저장소 및 변경 감지"/);
  assert.match(consoleSource, /phaseNumber="02"/);
  assert.match(consoleSource, /title="AWS 배포 대상"/);
  assert.match(handoffSource, /phaseNumber="03"/);
  assert.match(handoffSource, /title="PR 준비"/);
  assert.match(pipelineSource, /phaseNumber="04"/);
  assert.match(accordionSource, /phaseNumber/);
  assert.doesNotMatch(accordionSource, /accordionIcon|readonly icon/);
});

test("설정 작업은 키보드 접근 가능한 우측 dialog 드로어를 연다", () => {
  assert.match(panelSource, /CicdSettingsDrawer/);
  assert.match(panelSource, /activeDrawer/);
  assert.match(consoleSource, /onOpenSetup/);
  assert.match(drawerSource, /<dialog/);
  assert.match(drawerSource, /showModal\(\)/);
  assert.match(drawerSource, /aria-labelledby/);
  assert.match(drawerSource, /onCancel/);
  assert.match(shellSource, /querySelector\("dialog\[open\]"\)/);
});

test("초기 조회는 화면을 비우지 않고 값 영역 Skeleton을 유지한다", () => {
  assert.match(panelSource, /<CicdLoadingState \/>/);
  assert.match(consoleSource, /<CicdLoadingState \/>/);
  assert.match(loadingSource, /aria-busy="true"/);
  assert.match(loadingSource, /준비 체크리스트/);
});

test("초기 화면에서 금지된 상태 대시보드 문구와 중복 CTA를 제거한다", () => {
  assert.doesNotMatch(combined, /현재 단계 · Delivery 연결/);
  assert.doesNotMatch(combined, /배포 PR까지 \$\{[^}]+\}개 남음/);
  assert.doesNotMatch(combined, /Pipeline · 실행 없음/);
  assert.doesNotMatch(combined, /title="Delivery 연결"/);
  assert.doesNotMatch(combined, /title="GitOps 감시 설정"/);
  assert.doesNotMatch(combined, /title="프로젝트 배포 타깃"/);
});

test("CI/CD 표면의 보조 문구도 13px 이상을 유지한다", () => {
  assert.doesNotMatch(deliveryStyles, /font-size:\s*calc\((?:10|11|12)px/);
});

function read(file: string): string {
  try {
    return readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
  } catch {
    return "";
  }
}
