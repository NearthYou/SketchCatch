import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const modalSource = readWorkspaceFile("LiveObservationModal.tsx");
const panelSource = readWorkspaceFile("WorkspaceRightPanel.tsx");
const stylesSource = readWorkspaceFile("workspace.module.css");

test("operator modal uses the v2 session contract and server stream lifecycle", () => {
  assert.match(modalSource, /LiveObservationV2Session/);
  assert.match(modalSource, /LiveObservationV2Snapshot/);
  assert.match(modalSource, /createLiveObservation/);
  assert.match(modalSource, /streamLiveObservationSnapshots/);
  assert.match(modalSource, /new AbortController\(\)/);
  assert.match(modalSource, /abortController\.abort\(\)/);
  assert.match(modalSource, /window\.clearInterval/);
  assert.match(modalSource, /window\.clearTimeout/);
  assert.match(modalSource, /let cancelled = false/);
  assert.match(modalSource, /if \(!cancelled\)/);
  assert.match(modalSource, /cancelled = true/);
});

test("operator modal selects successful deployments without a demo profile gate", () => {
  assert.match(modalSource, /getEligibleLiveObservationDeployments/);
  assert.match(modalSource, /eligible\[0\]/);
  assert.doesNotMatch(modalSource, /demo_web_service|Demo Web Service|demo-only/i);
});

test("operator modal exposes only capability-free audience links to QR and copy", () => {
  assert.match(modalSource, /getLiveObservationAudienceUrl/);
  assert.match(modalSource, /QRCode\.toDataURL\(audienceUrl/);
  assert.match(modalSource, /navigator\.clipboard\.writeText\(audienceUrl\)/);
  assert.doesNotMatch(modalSource, /searchParams|capability|collector|trafficApiUrl/);
});

test("an invalid audience URL keeps the created session visible while blocking audience utilities", () => {
  const startBlock = modalSource.slice(
    modalSource.indexOf("async function startObservation"),
    modalSource.indexOf("async function endSession")
  );
  assert.ok(startBlock.indexOf("setSession(response.session)") >= 0);
  assert.ok(startBlock.indexOf("setSnapshot(response.snapshot)") >= 0);
  assert.ok(startBlock.indexOf("setSession(response.session)") < startBlock.indexOf("getLiveObservationAudienceUrl(response.session)"));
  assert.ok(startBlock.indexOf("setSnapshot(response.snapshot)") < startBlock.indexOf("getLiveObservationAudienceUrl(response.session)"));
  assert.match(modalSource, /\{session \? \([\s\S]*?세션 종료/);
  assert.match(modalSource, /disabled=\{!isSessionActive \|\| requestState === "loading"\}/);
  assert.match(
    modalSource,
    /catch \{[\s\S]{0,100}if \(!activeRef\.current\) return;[\s\S]{0,100}setErrorMessage/
  );
});

test("operator modal contains no mock, presenter boost, or simulation controls", () => {
  assert.doesNotMatch(modalSource, /mock|boost|simulation|시뮬레이션|부하 단계|90초/i);
  assert.doesNotMatch(modalSource, /runAiDesignSimulation|createPresenterTrafficBoost/);
  assert.doesNotMatch(panelSource, />시뮬레이션</);
  assert.match(panelSource, />Live Observation</);
});

test("operator modal remains an accessible responsive dialog with reduced motion", () => {
  assert.match(modalSource, /createPortal\(/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /event\.key === "Escape"/);
  assert.match(stylesSource, /@media \(max-width: 759px\)/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
