import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deliveryCenterSource = readFileSync(
  new URL("./DeliveryCenterPanel.tsx", import.meta.url),
  "utf8"
);
const shellSource = readFileSync(new URL("./DeploymentConsoleShell.tsx", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("./CicdConsoleScreen.tsx", import.meta.url), "utf8");
const handoffSource = readFileSync(new URL("./CicdHandoffPanel.tsx", import.meta.url), "utf8");
const pipelineSource = readFileSync(
  new URL("./CicdPipelineRunsPanel.tsx", import.meta.url),
  "utf8"
);
const accordionSource = readFileSync(
  new URL("./CicdAccordionSection.tsx", import.meta.url),
  "utf8"
);
const statusBoardSource = readFileSync(new URL("./CicdStatusBoard.tsx", import.meta.url), "utf8");
const presentationSource = readFileSync(
  new URL("./cicd-readiness-presentation.ts", import.meta.url),
  "utf8"
);
const deliveryStyles = readFileSync(
  new URL("./delivery-center.module.css", import.meta.url),
  "utf8"
);

test("CI/CD는 다음 작업, 4단계 진행 표시와 하나의 연속 체크리스트를 사용한다", () => {
  assert.doesNotMatch(deliveryCenterSource, /sectionNavigation|aria-label="CI\/CD 섹션"/);
  assert.match(deliveryCenterSource, /<h2>CI\/CD 준비<\/h2>/);
  assert.match(deliveryCenterSource, /const \[activeDrawer, setActiveDrawer\]/);
  assert.match(deliveryCenterSource, /<CicdSettingsDrawer/);
  assert.match(consoleSource, /CicdStatusBoard/);
  assert.match(consoleSource, /className=\{deliveryStyles\.accordionPanel\}/);
  assert.match(consoleSource, /<h3 id="cicd-config-title">준비 체크리스트<\/h3>/);
  assert.match(statusBoardSource, /className=\{styles\.nextTask\}/);
  assert.match(statusBoardSource, /presentation\.phases\.map/);
});

test("저장소, 배포 대상, PR, Pipeline은 같은 4개 phase 아코디언을 공유한다", () => {
  assert.equal((consoleSource.match(/<CicdAccordionSection\b/g) ?? []).length, 2);
  assert.equal((handoffSource.match(/<CicdAccordionSection\b/g) ?? []).length, 1);
  assert.equal((pipelineSource.match(/<CicdAccordionSection\b/g) ?? []).length, 1);
  for (const phaseNumber of ["01", "02", "03", "04"]) {
    const sources = `${consoleSource}\n${handoffSource}\n${pipelineSource}`;
    assert.equal(sources.match(new RegExp(`phaseNumber="${phaseNumber}"`, "gu"))?.length, 1);
  }
});

test("현재 작업 하나만 프로젝트 CI/CD blue primary 버튼으로 강조한다", () => {
  assert.match(deliveryStyles, /\.statusBoard/);
  assert.match(deliveryStyles, /--cicd-primary:\s*#1267f4/);
  assert.match(deliveryStyles, /\.nextTaskAction\s*\{[^}]*background:\s*var\(--cicd-primary\)/s);
  assert.doesNotMatch(
    deliveryStyles,
    /\.nextTaskAction\s*\{[^}]*background:\s*var\(--color-primary\)/s
  );
  assert.equal((statusBoardSource.match(/className=\{styles\.nextTaskAction\}/g) ?? []).length, 1);
  assert.equal((handoffSource.match(/deploymentPrimaryButton/g) ?? []).length, 1);
  assert.doesNotMatch(pipelineSource, /deploymentPrimaryButton/);
  assert.doesNotMatch(deliveryStyles, /\.sectionNavigation/);
});

test("서버 readiness를 하나의 presentation으로 변환해 현재 task와 phase를 동기화한다", () => {
  assert.match(consoleSource, /getCicdReadinessPresentation\(\{/);
  assert.match(presentationSource, /const currentTask = selectCurrentTask\(\{/);
  assert.match(presentationSource, /currentPhase: currentTask\.phase/);
  assert.match(presentationSource, /phases: phaseDefinitions\.map/);
  assert.match(presentationSource, /title: "GitHub 저장소 연결"/);
  assert.match(consoleSource, /if \(isInitialLoading\)/);
  assert.match(consoleSource, /isConsoleDataUnavailable/);
  assert.match(consoleSource, /배포 PR과 Pipeline 상태를 확인할 수 없습니다/);
});

test("현재 조치는 drawer, 직접 배포, PR 검토 또는 해당 phase로 정확히 연결된다", () => {
  assert.match(consoleSource, /const action = presentation\.currentTask\.action/);
  assert.match(
    consoleSource,
    /if \(action\.kind === "drawer"\)[\s\S]*onOpenSetup\(action\.drawer\)/
  );
  assert.match(
    consoleSource,
    /if \(action\.kind === "direct_deployment"\)[\s\S]*onOpenDirectDeployment\?\.\(action\.scope\)/
  );
  assert.match(
    consoleSource,
    /if \(action\.kind === "review_pr"\)[\s\S]*setIsHandoffReviewOpen\(true\)[\s\S]*openAccordionSection\("cicd-handoff"\)/
  );
  assert.match(consoleSource, /openAccordionSection\(action\.sectionId\)/);
  assert.match(pipelineSource, /openWhen=\{isCurrent\}/);
  assert.match(handoffSource, /openWhen=\{isCurrent\}/);
  assert.match(accordionSource, /previousEnsureOpenRef/);
  assert.match(accordionSource, /previousOpenWhenRef/);
  assert.match(accordionSource, /setIsOpen\(openWhen\)/);
  assert.match(accordionSource, /ensureOpen \? true : !current/);
  assert.match(accordionSource, /<h4 className=\{styles\.accordionHeading\}>/);
});

test("새로고침은 전역 CI/CD header가 소유하고 자동 확인 결과는 target drawer에만 둔다", () => {
  assert.match(shellSource, /onClick=\{refreshActiveScreen\}/);
  assert.match(shellSource, /isCicdRefreshBusy/);
  assert.match(shellSource, /새로고침 중/);
  assert.match(shellSource, /setReadinessRefreshRequestId\(\(requestId\) => requestId \+ 1\)/);
  assert.match(consoleSource, /refreshProjectGitCicdPipelineRuns\(projectId\)/);
  assert.match(
    consoleSource,
    /readinessRefreshRequestId > 0[\s\S]*refreshProjectGitCicdPipelineRuns\(projectId\)/
  );
  assert.doesNotMatch(consoleSource, /useImperativeHandle|const refreshAll/);
  assert.match(shellSource, /formatCicdLastRefreshed\(cicdLastRefreshedAt\)/);
  assert.doesNotMatch(deliveryCenterSource, /전체 새로고침|상태 새로고침/);
  assert.doesNotMatch(deliveryCenterSource, /headerStatus|requiredActionCount/);
  assert.doesNotMatch(deliveryCenterSource, /automatic-settings-title|title="자동 설정 결과"/);
  assert.equal(
    (deliveryCenterSource.match(/<CicdAutomaticSetupSummary\b/g) ?? []).length,
    1,
    "자동 설정 요약은 하나만 렌더링해야 합니다."
  );
  assert.match(
    deliveryCenterSource,
    /activeDrawer[\s\S]*target:\s*\([\s\S]*<CicdAutomaticSetupSummary profile=\{profile\} \/>/
  );

  assert.doesNotMatch(consoleSource, /manualRefresh|onManualRefresh/);
  assert.doesNotMatch(consoleSource, /setupCompletedCount|개 설정 완료/);
  assert.doesNotMatch(pipelineSource, /onManualRefresh|Pipeline 새로고침|headerAction=/);
  assert.doesNotMatch(statusBoardSource, /statusProgress|statusAction/);
});

test("Console reload coordinator는 중복 조회를 막고 busy 상태를 외부에 알린다", () => {
  assert.match(consoleSource, /const isFullRefreshUnavailable =/);
  assert.match(consoleSource, /isReloadReservedOrInFlight/);
  assert.match(consoleSource, /onRefreshBusyChange/);
  assert.match(consoleSource, /onRefreshBusyChange\?\.\(isFullRefreshUnavailable\)/);
  assert.match(deliveryCenterSource, /onRefreshBusyChange=\{onRefreshBusyChange\}/);
  assert.match(shellSource, /onRefreshBusyChange=\{setIsCicdRefreshBusy\}/);
  assert.match(shellSource, /disabled=\{isActiveRefreshBusy\}/);
  assert.match(consoleSource, /beginGitCicdReload\(reloadCoordinatorRef\.current\)/);
  assert.match(
    consoleSource,
    /isGitCicdReloadOwner\(reloadCoordinatorRef\.current, reloadGeneration\)/
  );
});

test("Profile 확인 시각만 바뀌어도 Console 전체 조회 세대는 유지된다", () => {
  assert.match(
    consoleSource,
    /const consoleRequestKey = `\$\{projectId\}:\$\{loadRequestId\}:\$\{readinessRefreshRequestId\}`;/
  );
  assert.doesNotMatch(consoleSource, /consoleRequestKey[^;]*readiness\.checkedAt/);
});

test("전체 새로고침 정리는 현재 세대 소유자만 잠금과 상태를 해제한다", () => {
  assert.match(
    consoleSource,
    /reloadCoordinatorRef\.current = completeGitCicdReload\([\s\S]*?setReloadReservedOrInFlight\(false\)/
  );
});
