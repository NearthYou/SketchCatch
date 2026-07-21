import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deliveryCenterSource = readFileSync(
  new URL("./DeliveryCenterPanel.tsx", import.meta.url),
  "utf8"
);
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
const deliveryStyles = readFileSync(
  new URL("./delivery-center.module.css", import.meta.url),
  "utf8"
);

test("CI/CD는 중복 탭 없이 상태보드와 하나의 연속 아코디언을 사용한다", () => {
  assert.doesNotMatch(deliveryCenterSource, /sectionNavigation|aria-label="CI\/CD 섹션"/);
  assert.match(deliveryCenterSource, /setupContent=/);
  assert.match(consoleSource, /CicdStatusBoard/);
  assert.match(consoleSource, /className=\{deliveryStyles\.accordionPanel\}/);
  assert.match(consoleSource, /\{setupContent\}/);
});

test("설정, 배포 PR, Pipeline은 같은 아코디언 행 컴포넌트를 공유한다", () => {
  assert.match(deliveryCenterSource, /CicdAccordionSection/g);
  assert.match(handoffSource, /CicdAccordionSection/);
  assert.match(pipelineSource, /CicdAccordionSection/);
});

test("현재 배포 조치만 프로젝트의 검정 primary 버튼으로 강조한다", () => {
  assert.match(deliveryStyles, /\.statusBoard/);
  assert.match(deliveryStyles, /\.statusAction/);
  assert.match(deliveryStyles, /background:\s*var\(--color-primary\)/);
  assert.doesNotMatch(deliveryStyles, /\.sectionNavigation/);
});

test("서버 readiness와 조회 완료 상태를 기준으로 진행 상태를 표시한다", () => {
  assert.match(statusBoardSource, /deliveryProfile\.readiness\.ready/);
  assert.match(statusBoardSource, /target\.provider\.toUpperCase\(\)/);
  assert.match(consoleSource, /if \(isInitialLoading\)/);
  assert.match(consoleSource, /isConsoleDataUnavailable/);
  assert.match(consoleSource, /배포 PR과 Pipeline 상태를 확인할 수 없습니다/);
});

test("현재 조치는 같은 화면의 설정 아코디언을 열고 실행 데이터가 생기면 Pipeline을 연다", () => {
  assert.match(statusBoardSource, /openAccordionSection/);
  assert.match(statusBoardSource, /project-cicd-settings-title/);
  assert.match(statusBoardSource, /deployment-target-title/);
  assert.match(
    statusBoardSource,
    /case "inspect_runtime_outputs":\s*case "inspect_output_url":\s*return "deployment-target-title";/
  );
  assert.doesNotMatch(statusBoardSource, /automatic-settings-title/);
  assert.match(statusBoardSource, /run\.handoffId === currentHandoff\.id/);
  assert.match(pipelineSource, /openWhen=\{presentation\.showRunControls\}/);
  assert.match(accordionSource, /if \(ensureOpen \|\| openWhen\) setIsOpen\(true\)/);
  assert.match(accordionSource, /ensureOpen \? true : !current/);
  assert.match(accordionSource, /<h4 className=\{styles\.accordionHeading\}>/);
});

test("CI/CD는 한 번의 전체 새로고침과 배포 타깃 안의 자동 설정 요약만 보여준다", () => {
  assert.match(deliveryCenterSource, /ref=\{consoleRef\}/);
  assert.match(deliveryCenterSource, /consoleRef\.current\?\.refreshAll\(\)/);
  assert.match(
    deliveryCenterSource,
    /<button(?:(?!<\/button>)[\s\S])*onClick=\{[^}]*refreshAll[^}]*\}(?:(?!<\/button>)[\s\S])*전체 새로고침/
  );
  assert.match(deliveryCenterSource, /전체 새로고침/);
  assert.doesNotMatch(deliveryCenterSource, /상태 새로고침/);
  assert.doesNotMatch(deliveryCenterSource, /headerStatus|requiredActionCount/);
  assert.doesNotMatch(deliveryCenterSource, /automatic-settings-title|title="자동 설정 결과"/);
  assert.equal(
    (deliveryCenterSource.match(/<CicdAutomaticSetupSummary\b/g) ?? []).length,
    1,
    "자동 설정 요약은 하나만 렌더링해야 합니다."
  );
  assert.match(
    deliveryCenterSource,
    /title="프로젝트 배포 타깃"(?:(?!<\/CicdAccordionSection>)[\s\S])*<CicdAutomaticSetupSummary profile=\{profile\} \/>/
  );

  assert.doesNotMatch(consoleSource, /manualRefresh|onManualRefresh/);
  assert.doesNotMatch(consoleSource, /setupCompletedCount|개 설정 완료/);
  assert.doesNotMatch(pipelineSource, /onManualRefresh|Pipeline 새로고침|headerAction=/);
  assert.doesNotMatch(statusBoardSource, /statusProgress/);
});

test("전체 새로고침은 자식 coordinator가 점유 중이면 비활성화하고 명시적 실행만 진행 문구를 표시한다", () => {
  assert.match(consoleSource, /onRefreshBusyChange/);
  assert.match(consoleSource, /onRefreshBusyChange\?\.\(isFullRefreshUnavailable\)/);
  assert.match(deliveryCenterSource, /onRefreshBusyChange=\{setIsConsoleRefreshBusy\}/);
  assert.match(
    deliveryCenterSource,
    /const isFullRefreshUnavailable =\s*isExplicitRefresh \|\| isConsoleRefreshBusy \|\| loadState === "loading";/
  );
  assert.match(deliveryCenterSource, /disabled=\{isFullRefreshUnavailable\}/);
  assert.match(
    deliveryCenterSource,
    /\{isExplicitRefresh \? "새로고침 중" : "전체 새로고침"\}/
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
    /finally \{\s*if \(isGitCicdReloadOwner\(reloadCoordinatorRef\.current, reloadGeneration\)\) \{[\s\S]*?completeGitCicdReload[\s\S]*?setReloadReservedOrInFlight\(false\);[\s\S]*?setIsRefreshing\(false\);\s*\}\s*\}/
  );
});
