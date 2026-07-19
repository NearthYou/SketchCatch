import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const modalSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationModal.tsx", import.meta.url)),
  "utf8"
);
const diagramMapSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationDiagramMap.tsx", import.meta.url)),
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

test("Live Observation stays above every Workspace floating panel", () => {
  const liveObservationZIndex = getRuleZIndex(workspaceStyles, ".liveObservationOverlay");
  const competingZIndexes = [
    getRuleZIndex(workspaceStyles, ".workspaceNotificationHost"),
    getRuleZIndex(aiWorkbenchStyles, ".overlay"),
    getRuleZIndex(aiWorkbenchStyles, ".workWindow"),
    getRuleZIndex(aiLauncherStyles, ".launcher"),
    getRuleZIndex(deploymentNotificationStyles, ".center"),
    getRuleZIndex(
      diagramEditorStyles,
      ".floatingPanelSlot:has([data-workspace-ai-chat-overlay])"
    )
  ];

  assert.ok(
    competingZIndexes.every((zIndex) => liveObservationZIndex > zIndex),
    `Live Observation z-index ${liveObservationZIndex} must exceed Workspace floating panels (${competingZIndexes.join(", ")})`
  );
});

test("modal re-entry restores the selected Deployment and diagram viewport", () => {
  assert.match(rightPanelSource, /createLiveObservationViewState\(projectId\)/);
  assert.match(
    rightPanelSource,
    /selectedDeploymentId=\{retainedLiveObservationView\.selectedDeploymentId\}/
  );
  assert.match(
    rightPanelSource,
    /initialViewport=\{retainedLiveObservationView\.viewport\}/
  );
  assert.match(
    modalSource,
    /<LiveObservationDiagramMap[\s\S]*?key=\{selectedDeploymentId\}/
  );
  assert.match(modalSource, /onSelectedDeploymentIdChange\(nextDeploymentId\)/);
  assert.match(diagramMapSource, /defaultViewport=\{initialViewport \?\?/);
  assert.match(diagramMapSource, /fitView=\{initialViewport === null\}/);
  assert.match(diagramMapSource, /onMoveEnd=\{\(_event, viewport\) => onViewportChange\(viewport\)\}/);
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

  assert.match(
    deploymentPickerSource,
    /disabled=\{[\s\S]*?eligibleDeployments\.length === 0/
  );
  assert.match(deploymentPickerSource, /<option disabled value="">/);
  assert.match(deploymentPickerSource, /관측 가능한 성공 배포가 없습니다\./);
});

test("Direct Deployment opens Live Observation without leaking the click event as a selection", () => {
  assert.match(
    deploymentOutputLinksSource,
    /onClick=\{\(\) => onOpenLiveObservation\(\)\}/
  );
  assert.doesNotMatch(
    deploymentOutputLinksSource,
    /onClick=\{onOpenLiveObservation\}/
  );
});

test("modal re-entry restores only the selected, unexpired active session and aborts on close", () => {
  assert.match(rightPanelSource, /createLiveObservationSessionState\(projectId\)/);
  assert.match(
    rightPanelSource,
    /session=\{retainedLiveObservationSession\.session\}/
  );
  assert.match(
    rightPanelSource,
    /snapshot=\{retainedLiveObservationSession\.snapshot\}/
  );
  assert.match(modalSource, /if \(!selectedSession \|\| !isSessionActive\)/);
  assert.match(modalSource, /deploymentId: selectedSession\.deploymentId/);
  assert.match(modalSource, /observationId: selectedSession\.id/);
  assert.match(modalSource, /onSnapshotChange\(nextSnapshot\)/);
  assert.match(modalSource, /return \(\) => abortController\.abort\(\)/);
});

test("selected Deployment independently loads and renders its immutable Architecture", () => {
  const mapIndex = modalSource.indexOf("<LiveObservationDiagramMap");
  const evidenceIndex = modalSource.indexOf(
    '<section className={styles.liveObservationEvidenceRail}'
  );

  assert.match(modalSource, /useLiveObservationQueries\(\{/);
  assert.match(modalSource, /deploymentId: selectedDeploymentId/);
  assert.match(modalSource, /LiveObservationDiagramMap/);
  assert.match(
    modalSource,
    /const selectedArchitecture = queries\.architecture\.data\?\.architecture \?\? null;/
  );
  assert.ok(mapIndex >= 0);
  assert.ok(evidenceIndex > mapIndex, "Architecture map must render before the evidence rail");
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

test("mounts the full Architecture map only after its disclosure opens", () => {
  assert.match(
    modalSource,
    /const \[isArchitectureOpen, setIsArchitectureOpen\] = useState\(false\)/
  );
  assert.match(
    modalSource,
    /<details[\s\S]*?onToggle=\{\(event\) => setIsArchitectureOpen\(event\.currentTarget\.open\)\}[\s\S]*?open=\{isArchitectureOpen\}/
  );
  assert.match(
    modalSource,
    /\{isArchitectureOpen \? \([\s\S]*?<LiveObservationDiagramMap[\s\S]*?\) : null\}/
  );
});

test("renders Architecture state only when it belongs to the selected Deployment", () => {
  assert.match(
    modalSource,
    /deploymentId: selectedDeploymentId/
  );
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
    /getLiveObservationCapacityMode\(selectedArchitecture, providerSnapshot\?\.capacity\)/
  );
  assert.match(
    modalSource,
    /<LiveObservationDiagramMap[\s\S]*?architecture=\{selectedArchitecture\}[\s\S]*?snapshot=\{selectedSnapshot\}[\s\S]*?\/>/
  );
  assert.match(
    modalSource,
    /selectedArchitectureState === "error" && selectedArchitectureErrorMessage/
  );
});

test("Architecture loading and errors stay separate from observation session errors", () => {
  const visibleSessionError = getSourceBlock(
    modalSource,
    "const visibleErrorMessage =",
    ";"
  );

  assert.match(
    modalSource,
    /const selectedArchitectureState = !selectedDeploymentId/
  );
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
  assert.match(modalSource, /QRCode\.toDataURL\(outputUrl/);
  assert.match(modalSource, /copyOutputUrl/);
  assert.match(modalSource, /createLiveObservation\(/);
  assert.match(modalSource, /stopLiveObservation\(/);
  assert.match(modalSource, /streamLiveObservationSnapshots\(/);
});

test("session creation locks Deployment selection and observation evidence stays Deployment-matched", () => {
  const deploymentSelector = getSourceBlock(modalSource, "<select", "</select>");
  const deploymentSelectionHandler = getSourceBlock(
    modalSource,
    "function selectDeployment(",
    "async function startObservation()"
  );
  const evidenceBlock = getSourceBlock(
    modalSource,
    "{selectedSnapshot ? (",
    "{providerSnapshot && providerSnapshot.logs.length > 0 ? ("
  );

  assert.match(deploymentSelector, /requestState === "loading"/);
  assert.match(
    modalSource,
    /const selectedSession =\s*session\?\.deploymentId === selectedDeploymentId \? session : null;/
  );
  assert.match(modalSource, /const selectedSnapshot = selectedSession \? snapshot : null;/);
  assert.match(
    modalSource,
    /<LiveObservationDiagramMap[\s\S]*?architecture=\{selectedArchitecture\}[\s\S]*?snapshot=\{selectedSnapshot\}[\s\S]*?\/>/
  );
  assert.match(evidenceBlock, /selectedSnapshot\.live\.acceptedEventCount/);
  assert.match(deploymentSelectionHandler, /session\.deploymentId !== nextDeploymentId/);
  assert.match(deploymentSelectionHandler, /onSessionChange\(null\)/);
  assert.match(deploymentSelectionHandler, /onSnapshotChange\(null\)/);
});

test("capacity evidence renders the provider-derived mode and matching value labels", () => {
  const evidenceBlock = getSourceBlock(
    modalSource,
    "{selectedSnapshot ? (",
    "{providerSnapshot && providerSnapshot.logs.length > 0 ? ("
  );

  assert.match(evidenceBlock, /providerEvidence\?\.capacityModeLabel/);
  assert.match(evidenceBlock, /providerEvidence\?\.capacityDetailLabel/);
  assert.doesNotMatch(evidenceBlock, /정상 \/ 실행 \/ 최대/);
  assert.match(
    modalSource,
    /const providerEvidence = providerSnapshot && capacityModeLabel\s*\?/
  );
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
