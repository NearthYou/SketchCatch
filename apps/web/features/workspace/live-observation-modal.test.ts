import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const modalSource = readWorkspaceFile("LiveObservationModal.tsx");
const mockPreviewSource = readWorkspaceFile("live-observation-mock-preview.ts");
const panelPiecesSource = readWorkspaceFile("WorkspaceAiPanelPieces.tsx");
const signalMapSource = readWorkspaceFile("LiveObservationSignalMap.tsx");
const stylesSource = readWorkspaceFile("workspace.module.css");

test("Live Observation modal is a portaled accessible dialog with focus lifecycle", () => {
  assert.match(modalSource, /createPortal\(/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /event\.key === "Escape"/);
  assert.match(modalSource, /event\.key !== "Tab"/);
  assert.match(modalSource, /previousFocusRef\.current\?\.focus/);
  assert.match(modalSource, /document\.body/);

  const overlayRule = getCssRule(stylesSource, "liveObservationOverlay");
  assert.match(overlayRule, /position:\s*fixed/);
  assert.match(overlayRule, /inset:\s*0/);
  assert.match(overlayRule, /z-index:\s*140/);
});

test("modal selects newest eligible deployment and starts observation explicitly", () => {
  assert.match(modalSource, /listDeployments\(projectId\)/);
  assert.match(modalSource, /getEligibleLiveObservationDeployments/);
  assert.match(modalSource, /eligible\[0\]/);
  assert.match(modalSource, /createLiveObservation\(selectedDeploymentId\)/);
  assert.match(modalSource, />관측 시작</);
  assert.match(modalSource, /성공한 Demo Web Service 배포가 없습니다/);
});

test("production target actions use a neutral wrapper that survives mock removal", () => {
  assert.match(modalSource, /styles\.liveObservationTargetActions/);
  assert.match(stylesSource, /\.liveObservationTargetActions/);
  assert.doesNotMatch(modalSource, /liveObservationMockControls/);
  assert.doesNotMatch(stylesSource, /\.liveObservationMockControls/);
});

test("modal uses compact operational rails around one shared map stage", () => {
  assert.match(modalSource, /liveObservationAudienceUtility/);
  assert.match(modalSource, /liveObservationEvidenceRail/);
  assert.match(modalSource, /liveObservationMapStage/);
  assert.match(modalSource, /liveObservationControlRail/);
});

test("modal reports recoverable stream delays separately and clears them on recovery", () => {
  assert.match(modalSource, /streamErrorMessage/);
  assert.match(modalSource, /onError:\s*\(\)\s*=>\s*\{?[\s\S]{0,160}setStreamErrorMessage/);
  assert.match(
    modalSource,
    /onSnapshot:\s*\(nextSnapshot\)[\s\S]{0,180}setStreamErrorMessage\(""\)/
  );
  assert.doesNotMatch(
    modalSource,
    /streamLiveObservationSnapshots\(\{[\s\S]{0,900}\}\)\.catch\(/
  );
});

test("modal can switch Live Observation snapshots to REST polling for prototype validation", () => {
  assert.match(modalSource, /pollLiveObservationSnapshots/);
  assert.match(modalSource, /NEXT_PUBLIC_LIVE_OBSERVATION_TRANSPORT/);
  assert.match(modalSource, /LIVE_OBSERVATION_TRANSPORT === "polling"/);
  assert.equal(
    modalSource.match(/실시간 연결이 지연되고 있습니다\. 최신 상태를 다시 연결합니다\./g)?.length,
    2
  );
  assert.match(modalSource, /intervalMs:\s*LIVE_OBSERVATION_POLL_INTERVAL_MS/);
  assert.match(modalSource, /streamLiveObservationSnapshots/);
});

test("development mock reuses the project diagram map instead of rendering a preview map", () => {
  assert.equal(modalSource.match(/<LiveObservationDiagramMap/g)?.length, 1);
  assert.match(modalSource, /diagram=\{diagramJson\}/);
  assert.doesNotMatch(modalSource, /getProjectDraft\(projectId\)/);
  assert.doesNotMatch(modalSource, /function MockRequestFlowPreview/);
});

test("active modal shows audience utility, evidence rail, signal map, and activity", () => {
  assert.match(modalSource, /QRCode\.toDataURL/);
  assert.match(modalSource, /관객 URL 복사/);
  assert.match(modalSource, /liveObservationEvidenceRail/);
  assert.match(modalSource, /data-source="browser"/);
  assert.match(modalSource, /data-source="aws"/);
  assert.match(modalSource, /formatCloudWatchValue\(displayedSnapshot\)/);
  assert.match(modalSource, /formatCapacityValue\(displayedSnapshot\)/);
  assert.match(modalSource, /스케일링 활동/);
  assert.match(modalSource, /data-pressure-level=\{displayedSnapshot\?\.live\.pressureLevel/);
  assert.match(
    modalSource,
    /getLiveObservationPressureLabel\(displayedSnapshot\?\.live\.pressureLevel \?\? "normal"\)/
  );
  assert.match(modalSource, /관측 불가/);
});

test("QR rejection reaches an explicit error UI without removing link fallbacks", () => {
  assert.match(
    modalSource,
    /useState<"idle" \| "loading" \| "ready" \| "error">\("idle"\)/
  );
  assert.match(modalSource, /setQrState\("loading"\)/);
  assert.match(modalSource, /setQrState\("ready"\)/);
  assert.match(modalSource, /\.catch\(\(\) => \{[\s\S]*?setQrState\("error"\)/);
  assert.match(modalSource, /qrState === "error"/);
  assert.match(modalSource, />QR 생성 실패</);
  assert.match(modalSource, /관객 URL 복사/);
  assert.match(modalSource, /새 창에서 열기/);
});

test("signal map keeps the approved left-to-right service route", () => {
  const signalMapSource = readWorkspaceFile("LiveObservationSignalMap.tsx");

  assert.match(signalMapSource, /LIVE_OBSERVATION_SIGNAL_NODES/);
  assert.match(signalMapSource, /getLiveObservationStaticRailPaths/);
  assert.match(signalMapSource, /getLiveObservationSignalRouteSelections/);
  assert.match(signalMapSource, /Users/);
  assert.match(signalMapSource, /Database/);
  assert.match(signalMapSource, /Network/);
  assert.match(signalMapSource, /Cpu/);
  assert.doesNotMatch(signalMapSource, /<SignalMapAsg/);
  assert.match(signalMapSource, /label="Audience"/);
  assert.match(signalMapSource, /label="S3 Page"/);
  assert.match(signalMapSource, /label="ALB"/);
  assert.match(signalMapSource, /label="ASG"/);
  assert.match(signalMapSource, /label="EC2"/);
  assert.match(signalMapSource, /Audience.*S3 Page.*ALB.*ASG.*EC2/s);
  assert.match(signalMapSource, /reducedTargetIndexes\.has\(index\)/);
  assert.match(signalMapSource, /feedback\.targetIndex === index/);
});

test("signal-map visual material uses the approved perimeter-rail operations surface", () => {
  const dialogRule = getCssRule(stylesSource, "liveObservationDialog");
  const signalMapRule = getCssRule(stylesSource, "liveObservationSignalMap");

  assert.match(dialogRule, /width:\s*calc\(100vw - 24px\)/);
  assert.match(dialogRule, /height:\s*auto/);
  assert.match(dialogRule, /max-width:\s*1800px/);
  assert.match(dialogRule, /max-height:\s*min\(1080px,\s*calc\(100dvh - 24px\)\)/);
  assert.match(signalMapRule, /aspect-ratio:\s*5\s*\/\s*2/);
  assert.match(signalMapRule, /min-height:\s*560px/);
  assert.match(stylesSource, /\.liveObservationEvidenceRail/);
  assert.match(stylesSource, /\.liveObservationControlRail/);
  assert.match(stylesSource, /\.liveObservationSignalNode\[data-node-kind="s3"\]/);
  assert.match(stylesSource, /\.liveObservationSignalNode\[data-node-kind="alb"\]/);
  assert.match(stylesSource, /\.liveObservationSignalNode\[data-node-kind="asg"\]/);
  assert.match(stylesSource, /\.liveObservationSignalNode\[data-node-kind="ec2"\]/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(getCssRule(stylesSource, "liveObservationSignalPulse"), /infinite/);
  assert.doesNotMatch(stylesSource, /\.liveObservationAudience\b/);
  assert.doesNotMatch(stylesSource, /\.liveObservationEvidenceBands\b/);
  assert.doesNotMatch(stylesSource, /\.liveObservationSignalAsg\b/);
});

test("active and mock layouts share the signal map with browser and AWS evidence", () => {
  assert.match(modalSource, /LiveObservationSignalMap/);
  assert.match(modalSource, /빠른 신호 · 브라우저 보고/);
  assert.match(modalSource, /AWS 실측/);
  assert.doesNotMatch(modalSource, /<TopologyNode/);
});

test("accepted event deltas render a bounded one-shot path only toward actual InService capacity", () => {
  const diagramMapSource = readWorkspaceFile("LiveObservationDiagramMap.tsx");

  assert.match(modalSource, /getLiveObservationRequestBurst/);
  assert.match(modalSource, /acceptedEventCountRef/);
  assert.match(modalSource, /inServiceInstanceKeys\.length > 0/);
  assert.doesNotMatch(modalSource, /function FlowParticles/);
  assert.match(diagramMapSource, /burst\?\.visibleParticleCount/);
  assert.match(diagramMapSource, /createLiveObservationDiagramModel/);
  assert.match(diagramMapSource, /model\.stages\.map/);
  assert.match(diagramMapSource, /model\.capacityUnits\.map/);
  assert.match(diagramMapSource, /model\.status === "unavailable"/);
  assert.doesNotMatch(diagramMapSource, /model\.nodes/);
  assert.doesNotMatch(diagramMapSource, /isAreaNode/);
  assert.doesNotMatch(diagramMapSource, /createEdgePath/);
  assert.match(diagramMapSource, /aria-hidden="true"/);
  assert.doesNotMatch(modalSource, /setInterval\([^)]*FlowParticles/);
});

test("presentation particles stay inside connectors and the stage hugs its content", () => {
  const diagramMapSource = readWorkspaceFile("LiveObservationDiagramMap.tsx");
  const mapRule = getCssRule(stylesSource, "liveObservationDiagramMap");
  const particleRule = getCssRule(stylesSource, "liveObservationPresentationSegmentParticle");
  const surfaceRule = getCssRule(stylesSource, "liveObservationPresentationSurface");

  assert.match(diagramMapSource, /liveObservationPresentationSegmentParticle/);
  assert.doesNotMatch(diagramMapSource, /liveObservationPresentationParticle/);
  assert.match(diagramMapSource, /model\.stages\.map\(\(stage, index\)/);
  assert.match(mapRule, /height:\s*clamp\(300px,\s*42vh,\s*430px\)/);
  assert.match(particleRule, /box-sizing:\s*border-box/);
  assert.match(surfaceRule, /min-height:\s*210px/);
  assert.match(stylesSource, /from \{ left:\s*-28px; opacity:\s*0; \}/);
  assert.match(stylesSource, /to \{ left:\s*calc\(100% - 14px\); opacity:\s*0; \}/);
  assert.doesNotMatch(surfaceRule, /height:\s*100%/);
});

test("capacity presentation expands with visible units and summarizes overflow", () => {
  const diagramMapSource = readWorkspaceFile("LiveObservationDiagramMap.tsx");

  assert.match(diagramMapSource, /model\.hiddenCapacityCount/);
  assert.match(diagramMapSource, /liveObservationCapacityOverflow/);
  assert.match(diagramMapSource, /model\.capacityUnits\.length \* 94/);
  assert.match(diagramMapSource, /\+\{model\.hiddenCapacityCount\}/);
});

test("traffic bursts alone activate visible circular flow particles", () => {
  const diagramMapSource = readWorkspaceFile("LiveObservationDiagramMap.tsx");

  assert.match(diagramMapSource, /visibleParticleCount = burst\?\.visibleParticleCount \?\? 0/);
  assert.doesNotMatch(diagramMapSource, /Math\.min\(4, burst\?\.visibleParticleCount/);
  assert.match(diagramMapSource, /data-flowing=\{burst !== null\}/);
  assert.match(
    diagramMapSource,
    /getLiveObservationDiagramParticleDelayMs\(index, particleIndex\)/
  );
  assert.match(diagramMapSource, /LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS/);
  assert.doesNotMatch(diagramMapSource, /index \* 90 \+ particleIndex \* 180/);
  assert.match(stylesSource, /@keyframes liveObservationPresentationSegmentParticle/);
  assert.match(
    stylesSource,
    /\[data-flowing="true"\][\s\S]{0,180}\.liveObservationPresentationConnector::after[\s\S]{0,120}animation:\s*liveObservationConnectorFlow/
  );
  assert.doesNotMatch(
    getCssRule(stylesSource, "liveObservationPresentationConnector::after"),
    /animation:/
  );
  assert.match(
    getCssRule(stylesSource, "liveObservationPresentationSegmentParticle"),
    /border:\s*3px solid #3974e8[\s\S]*border-radius:\s*50%[\s\S]*box-shadow:\s*0 0 0 8px[\s\S]*height:\s*28px[\s\S]*top:\s*-14px[\s\S]*width:\s*28px/
  );
  assert.match(stylesSource, /@keyframes liveObservationCapacityLaunch/);
  assert.match(stylesSource, /@keyframes liveObservationCapacityActivated/);
  assert.match(
    stylesSource,
    /liveObservationCapacityUnit\[data-observation-state="launching"\][\s\S]{0,180}liveObservationCapacityLaunch/
  );
  assert.match(
    stylesSource,
    /liveObservationCapacityUnit\[data-observation-state="active"\][\s\S]{0,220}liveObservationCapacityActivated/
  );
});

test("development mock stays idle until observation traffic is explicitly driven", () => {
  assert.match(modalSource, /process\.env\.NODE_ENV === "development"/);
  assert.doesNotMatch(modalSource, /목업 애니메이션 재생/);
  assert.match(modalSource, /createInitialMockRequestFlowState/);
  assert.doesNotMatch(modalSource, /createAutoStartedMockRequestFlowState/);
  assert.doesNotMatch(mockPreviewSource, /createAutoStartedMockRequestFlowState/);
  assert.match(modalSource, /setMockRequestFlowState\(replayMockRequestFlow\)/);
  assert.match(mockPreviewSource, /getLiveObservationRequestBurst\(100, 108, true\)/);
  assert.match(mockPreviewSource, /snapshot:\s*createMockLiveObservationSnapshot\(sequence\)/);
  assert.match(mockPreviewSource, /pressureLevel:\s*pressure\.level/);
  assert.match(mockPreviewSource, /i-prototype-b/);
  assert.match(mockPreviewSource, /statusCode:\s*scaleOutComplete \? "Successful" : "InProgress"/);
  assert.match(modalSource, /displayedSnapshot/);
  assert.doesNotMatch(modalSource, /setInterval\(\(\) => \{[\s\S]{0,140}setMockRequestFlowState\(replayMockRequestFlow\)/);
  assert.doesNotMatch(modalSource, /function MockRequestFlowPreview/);
  assert.match(modalSource, /showDevelopmentMockMap/);
  assert.match(
    modalSource,
    /SHOW_MOCK_ANIMATION_PREVIEW\s*&&\s*mockRequestFlowState\.visible\s*&&\s*!session/
  );
  assert.match(modalSource, /LiveObservationDiagramMap/);
  assert.match(modalSource, /diagram=\{diagramJson\}/);
  assert.match(modalSource, /목업 데이터 · 개발 확인용/);
  assert.doesNotMatch(modalSource, /liveObservationMockPreview/);
  assert.doesNotMatch(
    mockPreviewSource,
    /createLiveObservation|fetch\(|startBoost/
  );
});

test("opening the observation modal automatically runs the board design simulation", () => {
  assert.match(modalSource, /readonly diagramJson: DiagramJson/);
  assert.match(modalSource, /createWorkspaceAiBoardSnapshot\(diagramJson\)/);
  assert.match(modalSource, /runAiDesignSimulation\(\{/);
  assert.match(modalSource, /<WorkspaceAiDesignSimulationResult/);
  assert.match(modalSource, /AI 시뮬레이션을 계산하고 있습니다/);
});

test("observation header keeps only the product eyebrow and concise title", () => {
  assert.match(modalSource, />Live Observation<\/span>/);
  assert.match(modalSource, />실시간 트래픽 관측<\/h2>/);
  assert.doesNotMatch(modalSource, /오토 스케일링 관측/);
  assert.doesNotMatch(modalSource, /실제 배포 근거를 15분/);
  assert.doesNotMatch(modalSource, /\{projectName\}/);
});

test("AI simulation is on by default, retains state while collapsed, and omits request flow", () => {
  assert.match(modalSource, /\[isAiSimulationVisible, setAiSimulationVisible\] = useState\(true\)/);
  assert.match(modalSource, /aria-pressed=\{isAiSimulationVisible\}/);
  assert.match(modalSource, /isAiSimulationVisible \? \(/);
  assert.doesNotMatch(modalSource, /setDesignSimulation\(null\)[\s\S]{0,300}setAiSimulationVisible/);
  assert.match(panelPiecesSource, /aiResultSummary[\s\S]*병목 후보[\s\S]*장애 대응[\s\S]*<strong>비용<\/strong>/);
  assert.doesNotMatch(panelPiecesSource, /비용·다음 검토/);
  assert.doesNotMatch(panelPiecesSource, /costRecommendationItems/);
  assert.match(panelPiecesSource, /costReviewItems\.map/);
  assert.doesNotMatch(panelPiecesSource, />요청 흐름</);
  assert.doesNotMatch(panelPiecesSource, /simulation\.requestFlow\.map/);
  assert.match(
    stylesSource,
    /@media \(max-width: 759px\)[\s\S]*?\.aiSimulationGrid\s*\{[^}]*grid-template-columns:\s*1fr/
  );
});

test("traffic load controls stay outside the scroll body and also drive the development mock", () => {
  assert.doesNotMatch(modalSource, /\{session \? \(\s*<footer/);
  assert.match(modalSource, /function startTrafficLoad/);
  assert.match(modalSource, /showDevelopmentMockMap[\s\S]{0,240}setMockRequestFlowState\(replayMockRequestFlow\)/);
  assert.match(modalSource, /onClick=\{startTrafficLoad\}/);
  assert.match(modalSource, /disabled=\{\(!isSessionActive && !showDevelopmentMockMap\) \|\| boostProgress\.running\}/);
});

test("signal map mounts only the active responsive geometry and animation variant", () => {
  assert.match(signalMapSource, /LIVE_OBSERVATION_MOBILE_SIGNAL_NODES/);
  assert.match(signalMapSource, /LIVE_OBSERVATION_MOBILE_SIGNAL_VIEWBOX/);
  assert.match(signalMapSource, /getLiveObservationMobileStaticRailPaths/);
  assert.match(signalMapSource, /useSafeMediaQuery\(\s*"\(max-width: 759px\)"\s*\)/);
  assert.match(signalMapSource, /window\.matchMedia/);
  assert.match(signalMapSource, /mediaQuery\.addEventListener\("change"/);
  assert.equal(signalMapSource.match(/<SignalStaticRailLayer\b/g)?.length, 1);
  assert.equal(signalMapSource.match(/<SignalPulseLayer\b/g)?.length, 1);
  assert.match(signalMapSource, /<SignalStaticRailLayer rails=\{activeStaticRails\} variant=\{activeVariant\}/);
  assert.match(signalMapSource, /<SignalPulseLayer[\s\S]*?variant=\{activeVariant\}/);
  assert.doesNotMatch(stylesSource, /\.liveObservationSignalMap::after/);
});

test("every burst restarts the SVG timeline", () => {
  assert.match(
    signalMapSource,
    /key=\{`signal-pulse-\$\{burst\?\.sequence \?\? 0\}-\$\{variant\}`\}/
  );
});

test("browser and AWS evidence sources stay on two rows", () => {
  const evidenceRailRule = getCssRule(stylesSource, "liveObservationEvidenceRail");
  assert.match(evidenceRailRule, /grid-template-columns:\s*1fr/);
  assert.doesNotMatch(evidenceRailRule, /repeat\(2/);
  assert.match(
    stylesSource,
    /\.liveObservationEvidenceRail > div \+ div\s*\{[^}]*border-top:\s*1px/s
  );
});

test("selected lane overlay and target feedback share burst route identity", () => {
  assert.match(signalMapSource, /getLiveObservationSignalRouteSelections\(\{/);
  assert.match(signalMapSource, /getLiveObservationSignalArrivalFeedback\(\{/);
  assert.match(signalMapSource, /getLiveObservationReducedRouteSelections\(routeSelections\)/);
  assert.match(signalMapSource, /reducedMotion\s*\?\s*reducedRouteSelections\.map/);
  assert.match(signalMapSource, /className=\{styles\.liveObservationSignalSelectedRoute\}/);
  assert.match(signalMapSource, /data-signal-lane=\{selection\.lane\}/);
  assert.match(signalMapSource, /data-target-index=\{selection\.targetIndex\}/);
  assert.match(signalMapSource, /d=\{selection\.path\}/);
  assert.match(signalMapSource, /!reducedMotion\s*\?\s*arrivalFeedback\.map/);
  assert.match(signalMapSource, /className=\{styles\.liveObservationSignalArrivalFeedback\}/);
  assert.match(signalMapSource, /d=\{feedback\.path\}/);
  assert.match(signalMapSource, /style=\{getArrivalFeedbackStyle\(feedback\)\}/);
  assert.match(signalMapSource, /arrivalFeedback[\s\S]*?\.filter\([\s\S]*?targetIndex === index/);
  assert.match(signalMapSource, /data-rail-lane=\{rail\.lane\}/);
  assert.match(signalMapSource, /data-rail-node=\{rail\.nodeId\}/);
  assert.doesNotMatch(signalMapSource, /requestTargetKeys/);
});

test("paired perimeter pulses share logical-request timing", () => {
  assert.equal(
    signalMapSource.match(
      /begin=\{`\$\{selection\.requestIndex \* LIVE_OBSERVATION_SIGNAL_STAGGER_MS\}ms`\}/g
    )?.length,
    2
  );
  assert.doesNotMatch(
    signalMapSource,
    /begin=\{`\$\{index \* LIVE_OBSERVATION_SIGNAL_STAGGER_MS\}ms`\}/
  );
});

test("burst cleanup waits through the last staggered arrival", () => {
  assert.match(modalSource, /getLiveObservationDiagramBurstLifetimeMs/);
  assert.match(
    modalSource,
    /getLiveObservationDiagramBurstLifetimeMs\(\s*observationDiagramSegmentCount,\s*requestFlowBurst\.visibleParticleCount\s*\)/
  );
  assert.match(
    modalSource,
    /getLiveObservationDiagramBurstLifetimeMs\(\s*observationDiagramSegmentCount,\s*mockRequestFlowBurst\.visibleParticleCount\s*\)/
  );
  assert.doesNotMatch(modalSource, /\}, 1_050\)/);
});

test("overflow text carries an explicit mobile-safe variant and dead layer selectors are gone", () => {
  assert.match(signalMapSource, /data-signal-variant=\{variant\}/);
  assert.match(signalMapSource, /textAnchor="end"/);
  assert.match(signalMapSource, /x=\{variant === "desktop" \? 1540 : 96\}/);
  assert.match(signalMapSource, /y=\{variant === "desktop" \? 44 : 8\}/);
  assert.match(
    stylesSource,
    /\.liveObservationSignalOverflow\[data-signal-variant="mobile"\]\s*\{[^}]*font-size:\s*4px/
  );
  assert.doesNotMatch(
    stylesSource,
    /\.liveObservationSignal(?:Desktop|Mobile)Layer\b/
  );
});

test("every Live Observation CSS-module class reference has a defined selector", () => {
  const referencedClasses = new Set(
    [modalSource, signalMapSource].flatMap((source) =>
      [...source.matchAll(/styles\.(liveObservation[A-Za-z0-9_]+)/g)].map(
        (match) => match[1] ?? ""
      )
    )
  );

  for (const className of referencedClasses) {
    assert.match(stylesSource, new RegExp(`\\.${className}\\b`), className);
  }
});

test("reduced motion omits circles and SMIL while preserving only selected feedback", () => {
  const dialogRule = getCssRule(stylesSource, "liveObservationDialog");
  const signalMapRule = getCssRule(stylesSource, "liveObservationSignalMap");
  const routeLayerRule = getCssRule(stylesSource, "liveObservationSignalRouteLayer");
  const pulseRule = getCssRule(stylesSource, "liveObservationSignalPulse");

  assert.match(dialogRule, /width:\s*calc\(100vw - 24px\)/);
  assert.match(dialogRule, /height:\s*auto/);
  assert.match(dialogRule, /max-width:\s*1800px/);
  assert.match(dialogRule, /max-height:\s*min\(1080px,\s*calc\(100dvh - 24px\)\)/);
  assert.match(signalMapRule, /overflow:\s*hidden/);
  assert.match(signalMapRule, /min-height:\s*560px/);
  assert.match(routeLayerRule, /position:\s*absolute/);
  assert.match(pulseRule, /fill:\s*var\(--live-signal-accent\)/);
  assert.doesNotMatch(pulseRule, /infinite/);
  assert.match(
    stylesSource,
    /\n\.liveObservationRequestFlash\s*\{\s*animation:\s*liveObservationRequestFlash/
  );
  assert.match(stylesSource, /@keyframes liveObservationRequestFlash/);
  assert.match(signalMapSource, /useSafeMediaQuery\(\s*"\(prefers-reduced-motion: reduce\)"\s*\)/);
  assert.match(
    signalMapSource,
    /useState\(\(\) =>[\s\S]*?window\.matchMedia\(query\)\.matches[\s\S]*?: false\s*\)/
  );
  assert.match(signalMapSource, /!reducedMotion[\s\S]*?<circle[\s\S]*?<animateMotion[\s\S]*?<animate/);
  assert.match(signalMapSource, /reducedMotion=\{prefersReducedMotion\}/);
  assert.equal(signalMapSource.match(/<circle\b/g)?.length, 1);
  assert.equal(signalMapSource.match(/<animateMotion\b/g)?.length, 1);
  assert.equal(signalMapSource.match(/<animate\b/g)?.length, 1);
  assert.match(
    stylesSource,
    /\.liveObservationSignalInstance \.liveObservationRequestFlash\s*\{\s*animation:\s*none/
  );
  assert.match(stylesSource, /\.liveObservationSignalSelectedRoute\s*\{/);
  assert.doesNotMatch(
    stylesSource,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.liveObservationSignalRouteLayer path\s*\{/
  );
  assert.doesNotMatch(
    stylesSource,
    /\.liveObservation(?:FlowParticles|FlowParticle|FlowOverflow|ReducedRouteFlash|Topology|TopologyNode|Instances|Instance)\b/
  );
});

test("boost and session controls stop work on cleanup without destroying infrastructure", () => {
  assert.match(modalSource, /createPresenterTrafficBoost/);
  assert.match(modalSource, /"\+90초 부하"/);
  assert.match(modalSource, /"부하 단계 올리기"/);
  assert.match(modalSource, />중지</);
  assert.match(modalSource, />세션 종료</);
  assert.match(modalSource, /boostControllerRef\.current\?\.stop\(\)/);
  assert.match(modalSource, /stopLiveObservation/);
  assert.doesNotMatch(modalSource, /destroyDeployment|runDeploymentDestroy/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function getCssRule(source: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, "m").exec(source);
  assert.ok(match, `Missing .${className} CSS rule`);
  return match[1] ?? "";
}
