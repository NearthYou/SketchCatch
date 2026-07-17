import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const modalSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationModal.tsx", import.meta.url)),
  "utf8"
);

test("selected Deployment independently loads and renders its immutable Architecture", () => {
  const architectureEffect = getSourceBlock(
    modalSource,
    "setArchitecture(null);",
    "}, [selectedDeploymentId]);"
  );
  const mapIndex = modalSource.indexOf("<LiveObservationDiagramMap");
  const evidenceIndex = modalSource.indexOf(
    '<section className={styles.liveObservationEvidenceRail}'
  );

  assert.match(modalSource, /getLiveObservationArchitecture/);
  assert.match(modalSource, /LiveObservationDiagramMap/);
  assert.match(architectureEffect, /setArchitectureState\("loading"\)/);
  assert.match(architectureEffect, /setArchitecture\(response\.architecture\)/);
  assert.match(architectureEffect, /setArchitectureState\("ready"\)/);
  assert.match(architectureEffect, /setArchitectureState\("error"\)/);
  assert.ok(mapIndex >= 0);
  assert.ok(evidenceIndex > mapIndex, "Architecture map must render before the evidence rail");
});

test("renders Architecture state only when it belongs to the selected Deployment", () => {
  assert.match(
    modalSource,
    /const \[architectureDeploymentId, setArchitectureDeploymentId\] = useState\(""\);/
  );
  assert.match(
    modalSource,
    /architectureDeploymentId === selectedDeploymentId \? architecture : null/
  );
  assert.match(
    modalSource,
    /architectureDeploymentId === selectedDeploymentId[\s\S]*\? architectureState[\s\S]*: selectedDeploymentId[\s\S]*\? "loading"/
  );
  assert.match(
    modalSource,
    /getLiveObservationCapacityMode\(selectedArchitecture, providerSnapshot\?\.capacity\)/
  );
  assert.match(
    modalSource,
    /<LiveObservationDiagramMap\s+architecture=\{selectedArchitecture\}\s+snapshot=\{selectedSnapshot\}\s+\/>/
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
    /const \[architectureState, setArchitectureState\] = useState<\s*"idle" \| "loading" \| "ready" \| "error"\s*>\("idle"\)/
  );
  assert.match(modalSource, /const \[architectureErrorMessage, setArchitectureErrorMessage\]/);
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
    /<LiveObservationDiagramMap\s+architecture=\{selectedArchitecture\}\s+snapshot=\{selectedSnapshot\}\s+\/>/
  );
  assert.match(evidenceBlock, /selectedSnapshot\.live\.acceptedEventCount/);
  assert.match(deploymentSelectionHandler, /session\.deploymentId !== nextDeploymentId/);
  assert.match(deploymentSelectionHandler, /setSession\(null\)/);
  assert.match(deploymentSelectionHandler, /setSnapshot\(null\)/);
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
