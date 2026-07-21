import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const modalSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationModal.tsx", import.meta.url)),
  "utf8"
);
const rightPanelSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceRightPanel.tsx", import.meta.url)),
  "utf8"
);
const deploymentOutputLinksSource = readFileSync(
  fileURLToPath(new URL("./DeploymentOutputLinks.tsx", import.meta.url)),
  "utf8"
);
const workspaceStyles = readFileSync(
  fileURLToPath(new URL("./workspace.module.css", import.meta.url)),
  "utf8"
);
const aiWorkbenchStyles = readFileSync(
  fileURLToPath(new URL("./workspace-ai-workbench.module.css", import.meta.url)),
  "utf8"
);
const aiLauncherStyles = readFileSync(
  fileURLToPath(new URL("./workspace-ai-chat-launcher.module.css", import.meta.url)),
  "utf8"
);
const diagramEditorStyles = readFileSync(
  fileURLToPath(new URL("../diagram-editor/diagram-editor.module.css", import.meta.url)),
  "utf8"
);
const deploymentNotificationStyles = readFileSync(
  fileURLToPath(
    new URL(
      "../../components/notifications/deployment-notification-center.module.css",
      import.meta.url
    )
  ),
  "utf8"
);

test("Live Observation stays above non-blocking Workspace surfaces and below recovery", () => {
  const liveObservationZIndex = getRuleZIndex(workspaceStyles, ".liveObservationOverlay");
  const projectDraftRecoveryZIndex = getRuleZIndex(
    workspaceStyles,
    ".projectDraftRecoveryBackdrop"
  );
  const competingZIndexes = [
    getRuleZIndex(workspaceStyles, ".workspaceNotificationHost"),
    getRuleZIndex(aiWorkbenchStyles, ".overlay"),
    getRuleZIndex(aiWorkbenchStyles, ".workWindow"),
    getRuleZIndex(aiLauncherStyles, ".launcher"),
    getRuleZIndex(deploymentNotificationStyles, ".center"),
    getRuleZIndex(diagramEditorStyles, ".floatingPanelSlot:has([data-workspace-ai-chat-overlay])")
  ];

  assert.ok(
    competingZIndexes.every((zIndex) => liveObservationZIndex > zIndex),
    `Live Observation z-index ${liveObservationZIndex} must exceed non-blocking Workspace surfaces (${competingZIndexes.join(", ")})`
  );
  assert.ok(
    projectDraftRecoveryZIndex > liveObservationZIndex,
    `ProjectDraft recovery z-index ${projectDraftRecoveryZIndex} must remain above Live Observation ${liveObservationZIndex}`
  );
});

test("modal re-entry restores the selected Deployment without a secondary diagram viewport", () => {
  assert.match(rightPanelSource, /createLiveObservationViewState\(projectId\)/);
  assert.match(
    rightPanelSource,
    /selectedDeploymentId=\{retainedLiveObservationView\.selectedDeploymentId\}/
  );
  assert.match(modalSource, /onSelectedDeploymentIdChange\(nextDeploymentId\)/);
  assert.doesNotMatch(modalSource, /LiveObservationDiagramMap/);
  assert.doesNotMatch(rightPanelSource, /initialViewport=\{/);
  assert.doesNotMatch(rightPanelSource, /onViewportChange=\{/);
});

test("Deployment selection effect notifies the parent only when the target changes", () => {
  assert.match(
    modalSource,
    /const targetDeploymentId = exactDeployment\?\.id \?\? "";[\s\S]*?if \(targetDeploymentId !== selectedDeploymentId\) \{[\s\S]*?onSelectedDeploymentIdChange\(targetDeploymentId\);[\s\S]*?\}/
  );
  assert.match(
    modalSource,
    /const fallbackDeploymentId =[\s\S]*?if \(fallbackDeploymentId !== selectedDeploymentId\) \{[\s\S]*?onSelectedDeploymentIdChange\(fallbackDeploymentId\);[\s\S]*?\}/
  );
});

test("empty Deployment picker cannot open a blank native menu", () => {
  const deploymentPickerSource = getSourceBlock(modalSource, "<select", "</select>");

  assert.match(deploymentPickerSource, /disabled=\{[\s\S]*?eligibleDeployments\.length === 0/);
  assert.match(deploymentPickerSource, /<option disabled value="">/);
  assert.match(deploymentPickerSource, /관측 가능한 성공 배포가 없습니다\./);
});

test("Direct Deployment opens Live Observation without leaking the click event as a selection", () => {
  assert.match(deploymentOutputLinksSource, /onClick=\{\(\) => onOpenLiveObservation\(\)\}/);
  assert.doesNotMatch(deploymentOutputLinksSource, /onClick=\{onOpenLiveObservation\}/);
});

test("modal re-entry restores only the selected, unexpired active session and aborts on close", () => {
  assert.match(rightPanelSource, /createLiveObservationSessionState\(projectId\)/);
  assert.match(rightPanelSource, /session=\{retainedLiveObservationSession\.session\}/);
  assert.match(rightPanelSource, /snapshot=\{retainedLiveObservationSession\.snapshot\}/);
  assert.match(modalSource, /if \(!selectedSession \|\| !isSessionActive\)/);
  assert.match(modalSource, /deploymentId: selectedSession\.deploymentId/);
  assert.match(modalSource, /observationId: selectedSession\.id/);
  assert.match(modalSource, /onSnapshotChange\(nextSnapshot\)/);
  assert.match(modalSource, /return \(\) => abortController\.abort\(\)/);
});

test("selected Deployment independently loads and renders its immutable Architecture", () => {
  const focusedFlowIndex = modalSource.indexOf("<LiveObservationFocusedFlow");

  assert.match(modalSource, /useLiveObservationQueries\(\{/);
  assert.match(modalSource, /deploymentId: selectedDeploymentId/);
  assert.match(modalSource, /LiveObservationFocusedFlow/);
  assert.match(
    modalSource,
    /const selectedArchitecture = queries\.architecture\.data\?\.architecture \?\? null;/
  );
  assert.ok(focusedFlowIndex >= 0);
});

test("restores the focused traffic path as the default observation view", () => {
  const focusedFlowIndex = modalSource.indexOf("<LiveObservationFocusedFlow");
  const architectureMapIndex = modalSource.indexOf("<LiveObservationDiagramMap");

  assert.match(modalSource, /LiveObservationFocusedFlow/);
  assert.ok(focusedFlowIndex >= 0, "Focused traffic flow must render");
  assert.ok(
    architectureMapIndex === -1 || focusedFlowIndex < architectureMapIndex,
    "Focused traffic flow must be the primary view"
  );
  assert.match(
    modalSource,
    /<LiveObservationFocusedFlow[\s\S]*?architecture=\{selectedArchitecture\}[\s\S]*?snapshot=\{selectedSnapshot\}[\s\S]*?\/>/
  );
});

test("keeps Live Observation focused on the traffic path", () => {
  assert.doesNotMatch(modalSource, /LiveObservationDiagramMap/);
  assert.doesNotMatch(modalSource, /WorkspaceDesignAnalysisPanel/);
  assert.doesNotMatch(modalSource, /전체 Architecture 보기/);
  assert.doesNotMatch(modalSource, /설계 분석/);
});

test("anchors the QR utility below its button without covering header controls", () => {
  assert.match(
    modalSource,
    /const \[audienceUtilityOpen, setAudienceUtilityOpen\] = useState\(false\)/
  );
  assert.match(modalSource, /className=\{styles\.liveObservationQrMenu\}/);
  assert.match(workspaceStyles, /\.liveObservationQrMenu\s*\{[^}]*position:\s*relative/);
  assert.match(
    workspaceStyles,
    /\.liveObservationAudienceUtility\s*\{[^}]*top:\s*calc\(100% \+ 10px\)/
  );
});

test("renders Architecture state only when it belongs to the selected Deployment", () => {
  assert.match(modalSource, /deploymentId: selectedDeploymentId/);
  assert.match(
    modalSource,
    /const selectedArchitecture = queries\.architecture\.data\?\.architecture \?\? null;/
  );
  assert.match(
    modalSource,
    /const selectedArchitectureState = !selectedDeploymentId[\s\S]*queries\.architecture\.data[\s\S]*queries\.architecture\.isError/
  );
  assert.match(
    modalSource,
    /<LiveObservationFocusedFlow[\s\S]*?architecture=\{selectedArchitecture\}[\s\S]*?snapshot=\{selectedSnapshot\}[\s\S]*?\/>/
  );
  assert.match(
    modalSource,
    /selectedArchitectureState === "error" && selectedArchitectureErrorMessage/
  );
});

test("Architecture loading and errors stay separate from observation session errors", () => {
  const visibleSessionError = getSourceBlock(modalSource, "const visibleErrorMessage =", ";");

  assert.match(modalSource, /const selectedArchitectureState = !selectedDeploymentId/);
  assert.match(
    modalSource,
    /const selectedArchitectureErrorMessage = queries\.architecture\.isError/
  );
  assert.doesNotMatch(visibleSessionError, /architectureErrorMessage/);
  assert.match(modalSource, /배포 Architecture를 불러오고 있습니다\./);
  assert.match(modalSource, /이 배포의 Architecture를 찾을 수 없습니다\./);
  assert.match(modalSource, /error instanceof ApiClientError && error\.status === 404/);
});

test("Architecture failure does not replace QR, Output URL, session, or SSE controls", () => {
  const startButton = getSourceBlock(
    modalSource,
    "className={styles.liveObservationPrimaryButton}",
    "onClick={() => void startObservation()}"
  );

  assert.doesNotMatch(startButton, /architecture|Architecture/);
  assert.match(modalSource, /const audienceUrl = selectedSession\?\.audienceUrl \?\? outputUrl/);
  assert.match(modalSource, /QRCode\.toDataURL\(audienceUrl/);
  assert.match(modalSource, /onApplyTerraformUpdate/);
  assert.match(modalSource, /Terraform 수정 완료 · 경고 해제/);
  assert.match(modalSource, /copyOutputUrl/);
  assert.match(modalSource, /createLiveObservation\(/);
  assert.match(modalSource, /stopLiveObservation\(/);
  assert.match(modalSource, /streamLiveObservationSnapshots\(/);
});

test("session creation locks Deployment selection and clears a mismatched session", () => {
  const deploymentSelector = getSourceBlock(modalSource, "<select", "</select>");
  const deploymentSelectionHandler = getSourceBlock(
    modalSource,
    "function selectDeployment(",
    "async function startObservation()"
  );
  assert.match(deploymentSelector, /requestState === "loading"/);
  assert.match(
    modalSource,
    /const selectedSession =\s*session\?\.deploymentId === selectedDeploymentId \? session : null;/
  );
  assert.match(modalSource, /const selectedSnapshot = selectedSession \? snapshot : null;/);
  assert.match(
    modalSource,
    /<LiveObservationFocusedFlow[\s\S]*?architecture=\{selectedArchitecture\}[\s\S]*?snapshot=\{selectedSnapshot\}[\s\S]*?\/>/
  );
  assert.match(deploymentSelectionHandler, /session\.deploymentId !== nextDeploymentId/);
  assert.match(deploymentSelectionHandler, /onSessionChange\(null\)/);
  assert.match(deploymentSelectionHandler, /onSnapshotChange\(null\)/);
});

test("shows the countdown only while the selected session is active", () => {
  const sessionStatus = getSourceBlock(
    modalSource,
    "className={styles.liveObservationSessionStatus}",
    "</div>"
  );

  assert.match(
    sessionStatus,
    /\{isSessionActive \? <strong>\{formatRemainingTime\(remainingSeconds\)\}<\/strong> : null\}/
  );
  assert.doesNotMatch(sessionStatus, /\{selectedSession \? <strong>/);
});

test("keeps the Signal Dashboard and does not restore the legacy metric grid", () => {
  assert.match(modalSource, /<LiveObservationSignalDashboard/);
  assert.match(modalSource, /recommendedAction=\{recommendedAction\}/);
  assert.doesNotMatch(modalSource, /aria-label="실시간 운영 분석"/);
  assert.doesNotMatch(modalSource, /operationalAnalysis|providerLogs|최근 런타임 로그/);
});

test("offers the capacity change only as an explicit Project Draft action", () => {
  assert.match(modalSource, /createLiveObservationDesignSimulationRequest/);
  assert.match(modalSource, /최대 실행 수를/);
  assert.match(modalSource, /onAction: \(\) => void applyTerraformUpdate\(\)/);
  assert.match(modalSource, /수정안을 저장해도 실제 AWS에는 바로 반영되지 않아요\./);
  assert.match(modalSource, /const result = await onApplyTerraformUpdate\(\)/);
  assert.match(modalSource, /onTrafficIncidentSnapshotChange\(null\)/);
});

function getSourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end + endMarker.length);
}

function getRuleZIndex(source: string, selector: string): number {
  const rule = getSourceBlock(source, `${selector} {`, "}");
  const match = rule.match(/z-index:\s*(\d+)/);

  assert.ok(match, `Missing z-index for ${selector}`);
  return Number(match[1]);
}
