"use client";

import { Box } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  ArchitectureJson,
  DiagramNode,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";
import { ResourceIconImage } from "../../components/ui/ResourceIconImage";
import { createLiveObservationArchitectureModel } from "./live-observation-architecture";
import {
  createLiveObservationDiagramModel,
  getLiveObservationDiagramSegmentCount,
  type LiveObservationCapacityUnit,
  type LiveObservationDiagramNodeState,
  type LiveObservationPresentationRole
} from "./live-observation-diagram";
import {
  LIVE_OBSERVATION_CAPACITY_EXIT_MS,
  reconcileLiveObservationCapacityUnits,
  settleLiveObservationCapacityUnits
} from "./live-observation-capacity-transitions";
import {
  getLiveObservationDiagramBurstLifetimeMs,
  getLiveObservationDiagramParticleDelayMs,
  LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS
} from "./live-observation-diagram-particles";
import {
  getLiveObservationCapacityProjection,
  type LiveObservationCapacityProjection
} from "./live-observation-capacity-projection";
import {
  getLiveObservationTrafficBurst,
  getLiveObservationTrafficCursor,
  type LiveObservationRequestBurst
} from "./live-observation";
import styles from "./workspace.module.css";

type SequencedTrafficBurst = LiveObservationRequestBurst & {
  readonly sequence: number;
};

const EMPTY_CAPACITY_UNITS: readonly LiveObservationCapacityUnit[] = [];

export function LiveObservationFocusedFlow({
  architecture,
  snapshot
}: {
  readonly architecture: ArchitectureJson;
  readonly snapshot: LiveObservationV2Snapshot | null;
}) {
  const diagram = useMemo(
    () => createLiveObservationArchitectureModel(architecture, snapshot).diagram,
    [architecture, snapshot]
  );
  const model = useMemo(
    () => createLiveObservationDiagramModel(diagram, snapshot),
    [diagram, snapshot]
  );
  const capacityProjection = useMemo(
    () => getLiveObservationCapacityProjection(architecture, snapshot),
    [architecture, snapshot]
  );
  const previousTrafficRef = useRef(getLiveObservationTrafficCursor(snapshot));
  const burstSequenceRef = useRef(0);
  const [burst, setBurst] = useState<SequencedTrafficBurst | null>(null);
  const modelCapacityUnits = model.status === "ready"
    ? model.capacityUnits
    : EMPTY_CAPACITY_UNITS;
  const displayedProjection = capacityProjection;
  const displayedCapacityUnits = useMemo(() => {
    if (model.status !== "ready") return modelCapacityUnits;
    const predictedCount = snapshot?.status === "active"
      ? capacityProjection?.predictedCount ?? null
      : null;
    if (predictedCount === null || predictedCount <= modelCapacityUnits.length) {
      return modelCapacityUnits;
    }

    const template =
      diagram.nodes.find((node) => node.metadata?.liveObservationRole === "capacity-unit") ??
      model.stages[model.stages.length - 1]?.node;
    if (!template) return modelCapacityUnits;

    return [
      ...modelCapacityUnits,
      ...Array.from(
        { length: predictedCount - modelCapacityUnits.length },
        (_, index) => ({
          node: {
            ...template,
            id: `${template.id}--predicted-capacity-${modelCapacityUnits.length + index + 1}`,
            label: `예상 Fargate Task ${modelCapacityUnits.length + index + 1}`,
            metadata: template.metadata ? { ...template.metadata } : undefined,
            position: { ...template.position },
            size: { ...template.size }
          },
          observationState: "launching" as const
        })
      )
    ];
  }, [
    capacityProjection,
    diagram.nodes,
    model,
    modelCapacityUnits,
    snapshot?.status
  ]);
  const [presentedCapacityUnits, setPresentedCapacityUnits] = useState(() =>
    settleLiveObservationCapacityUnits(modelCapacityUnits)
  );

  useEffect(() => {
    setPresentedCapacityUnits((current) =>
      reconcileLiveObservationCapacityUnits(current, displayedCapacityUnits)
    );
    const timer = window.setTimeout(
      () => setPresentedCapacityUnits(settleLiveObservationCapacityUnits(displayedCapacityUnits)),
      LIVE_OBSERVATION_CAPACITY_EXIT_MS
    );
    return () => window.clearTimeout(timer);
  }, [displayedCapacityUnits]);

  useEffect(() => {
    const nextBurst = getLiveObservationTrafficBurst(previousTrafficRef.current, snapshot);
    previousTrafficRef.current = getLiveObservationTrafficCursor(snapshot);

    if (!nextBurst) {
      setBurst(null);
      return;
    }

    burstSequenceRef.current += 1;
    const sequencedBurst = { ...nextBurst, sequence: burstSequenceRef.current };
    setBurst(sequencedBurst);

    const lifetimeMs = getLiveObservationDiagramBurstLifetimeMs(
      getLiveObservationDiagramSegmentCount(diagram),
      nextBurst.visibleParticleCount
    );
    const timer = window.setTimeout(() => setBurst(null), lifetimeMs);
    return () => window.clearTimeout(timer);
  }, [diagram, snapshot]);

  if (model.status === "unavailable") {
    return (
      <section
        aria-label="프로젝트 다이어그램 기반 실시간 관측"
        className={`${styles.liveObservationDiagramMap} ${styles.liveObservationFocusedFlow}`}
      >
        <div className={styles.liveObservationPresentationEmpty} role="status">
          <Box aria-hidden="true" size={22} />
          <strong>메인 트래픽 경로를 분석할 수 없습니다.</strong>
          <span>다이어그램의 트래픽 source와 capacity 연결을 확인해주세요.</span>
        </div>
      </section>
    );
  }

  const visibleParticleCount = burst?.visibleParticleCount ?? 0;
  const burstRequestCount = burst
    ? burst.visibleParticleCount + burst.overflowCount
    : 0;
  const trafficIntensity = burstRequestCount >= 100
    ? "surge"
    : burstRequestCount >= 20
      ? "busy"
      : burstRequestCount > 0
        ? "flow"
        : "idle";
  const capacityColumnCount = Math.min(5, presentedCapacityUnits.length);
  const capacityDensity =
    presentedCapacityUnits.length >= 6
      ? "dense"
      : presentedCapacityUnits.length >= 4
        ? "compact"
        : "comfortable";
  const capacityCardWidth = capacityDensity === "dense" ? 52 : capacityDensity === "compact" ? 60 : 68;
  const stageMinimumWidth = capacityDensity === "dense" ? 112 : capacityDensity === "compact" ? 124 : 138;
  const capacityRowCount = capacityColumnCount === 0
    ? 0
    : Math.ceil(presentedCapacityUnits.length / capacityColumnCount);
  const capacityContentHeight = capacityRowCount * 58 + Math.max(0, capacityRowCount - 1) * 12;
  const pathMinimumHeight = Math.max(145, capacityContentHeight);
  const capacityStageWidth = presentedCapacityUnits.length > 0
    ? capacityColumnCount * (capacityCardWidth + 10) + 22
    : 0;
  const minimumWidth = Math.max(
    760,
    model.stages.length * stageMinimumWidth +
      capacityStageWidth +
      (model.hiddenCapacityCount > 0 ? 64 : 0) +
      80
  );
  const totalCapacityCount = model.capacityUnits.length + model.hiddenCapacityCount;
  const actualCapacityCount = capacityProjection?.actualCount ??
    (snapshot?.latestObservation ? totalCapacityCount : null);
  const predictedCapacityCount = displayedProjection?.predictedCount ?? null;
  const activeCapacityCount = presentedCapacityUnits.filter(
    (unit) => unit.transition === "stable" && unit.observationState === "active"
  ).length;
  const launchingCapacityCount = presentedCapacityUnits.filter(
    (unit) => unit.transition === "stable" && unit.observationState === "launching"
  ).length;

  return (
    <section
      aria-label="프로젝트 다이어그램에서 분석한 메인 트래픽 경로"
      className={`${styles.liveObservationDiagramMap} ${styles.liveObservationFocusedFlow}`}
      data-capacity-density={capacityDensity}
      data-flowing={burst !== null}
      data-pressure-level={model.pressureLevel}
      data-traffic-intensity={trafficIntensity}
      data-testid="live-observation-focused-flow"
    >
      <header className={styles.liveObservationPresentationHeader}>
        <strong>실시간 트래픽 · 핵심 데이터 흐름</strong>
        <div className={styles.liveObservationPresentationHeaderActions}>
          <span>
            {model.stages.length}단계 · {predictedCapacityCount !== null
              ? `실제 ${actualCapacityCount ?? "확인 중"} · 예상 ${predictedCapacityCount}`
              : actualCapacityCount !== null
                ? `Task ${actualCapacityCount}개 관측`
                : "Task 관측 대기"}
          </span>
          {burst ? (
            <em
              aria-live="polite"
              className={styles.liveObservationBurstMeter}
              data-intensity={trafficIntensity}
            >요청 +{burstRequestCount}</em>
          ) : null}
        </div>
      </header>
      <div className={styles.liveObservationPresentationViewport}>
        <div
          className={styles.liveObservationPresentationSurface}
          style={{ minHeight: `${pathMinimumHeight + 64}px`, minWidth: `${minimumWidth}px` }}
        >
          <ol
            className={styles.liveObservationPresentationPath}
            style={{
              gridTemplateColumns: `repeat(${model.stages.length}, minmax(${stageMinimumWidth}px, 1fr))${presentedCapacityUnits.length > 0 ? ` minmax(${capacityStageWidth}px, 1.35fr)` : ""}`,
              minHeight: `${pathMinimumHeight}px`
            }}
          >
            {model.stages.map((stage, index) => (
              <li
                className={styles.liveObservationPresentationStage}
                data-pressure-zone={index >= Math.max(1, model.stages.length - 2)}
                data-role={stage.role}
                key={stage.node.id}
              >
                <div
                  className={styles.liveObservationPresentationNode}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <ResourceIcon node={stage.node} />
                  {burst ? (
                    <i
                      aria-hidden="true"
                      className={styles.liveObservationPresentationNodePulse}
                      key={`${burst.sequence}-${stage.node.id}`}
                      style={{
                        animationDelay: `${index * LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS}ms`
                      }}
                    />
                  ) : null}
                </div>
                <strong title={stage.node.label}>{stage.node.label}</strong>
                <span>{getRoleLabel(stage.role)}</span>
                {index < model.stages.length - 1 || presentedCapacityUnits.length > 0 ? (
                  <i aria-hidden="true" className={styles.liveObservationPresentationConnector}>
                    {burst
                      ? Array.from({ length: visibleParticleCount }, (_, particleIndex) => (
                          <i
                            className={styles.liveObservationPresentationSegmentParticle}
                            key={`${burst.sequence}-${stage.node.id}-segment-${particleIndex}`}
                            style={{
                              animationDelay: `${getLiveObservationDiagramParticleDelayMs(index, particleIndex)}ms`,
                              animationDuration: `${LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS}ms`
                            }}
                          />
                        ))
                      : null}
                  </i>
                ) : null}
              </li>
            ))}
            {presentedCapacityUnits.length > 0 ? (
            <li className={styles.liveObservationCapacityStage}>
              <i
                aria-hidden="true"
                className={`${styles.liveObservationPresentationConnector} ${styles.liveObservationCapacityConnector}`}
              >
                {burst
                  ? Array.from({ length: visibleParticleCount }, (_, particleIndex) => (
                      <i
                        className={styles.liveObservationPresentationSegmentParticle}
                        key={`${burst.sequence}-capacity-segment-${particleIndex}`}
                        style={{
                          animationDelay: `${getLiveObservationDiagramParticleDelayMs(model.stages.length, particleIndex)}ms`,
                          animationDuration: `${LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS}ms`
                        }}
                      />
                    ))
                  : null}
              </i>
              <span className={styles.liveObservationCapacityLabel}>
                <strong>FARGATE TASK 그룹</strong>
                <small>
                  {predictedCapacityCount !== null
                    ? `실제 ${actualCapacityCount ?? "확인 중"} · 예상 ${predictedCapacityCount}`
                    : `${activeCapacityCount}개 실행 중`}
                  {launchingCapacityCount > 0
                    ? ` · ${launchingCapacityCount}개 예상`
                    : ""}
                </small>
              </span>
              <div
                className={styles.liveObservationCapacityUnits}
                style={{
                  "--live-observation-capacity-columns": capacityColumnCount
                } as CSSProperties}
              >
                {presentedCapacityUnits.map((unit, index) => (
                  <article
                    aria-label={`${unit.node.label}: ${getCapacityDisplayLabel(
                      unit.node.id,
                      index,
                      unit.observationState,
                      displayedProjection
                    )}`}
                    className={styles.liveObservationCapacityUnit}
                    data-capacity-forecast={getCapacityForecastKind(
                      unit.node.id,
                      index,
                      displayedProjection
                    )}
                    data-observation-state={unit.observationState}
                    data-transition={unit.transition}
                    key={unit.node.id}
                  >
                    <div
                      className={styles.liveObservationPresentationNode}
                      style={{
                        animationDelay: `${(model.stages.length + index) * 120}ms`
                      }}
                    >
                      <ResourceIcon node={unit.node} />
                      <b className={styles.liveObservationCapacityOrdinal}>
                        {String(index + 1).padStart(2, "0")}
                      </b>
                      {burst && unit.observationState !== "inactive" ? (
                        <i
                          aria-hidden="true"
                          className={styles.liveObservationPresentationNodePulse}
                          key={`${burst.sequence}-${unit.node.id}-arrival`}
                          style={{
                            animationDelay: `${model.stages.length * LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS + index * 70}ms`
                          }}
                        />
                      ) : null}
                    </div>
                    <span>{getCapacityDisplayLabel(
                      unit.node.id,
                      index,
                      unit.observationState,
                      displayedProjection
                    )}</span>
                  </article>
                ))}
                {model.hiddenCapacityCount > 0 ? (
                  <div
                    aria-label={`추가 Task ${model.hiddenCapacityCount}개`}
                    className={styles.liveObservationCapacityOverflow}
                  >
                    +{model.hiddenCapacityCount}
                  </div>
                ) : null}
              </div>
            </li>
            ) : null}
          </ol>
        </div>
      </div>
    </section>
  );
}

function ResourceIcon({ node }: { readonly node: DiagramNode }) {
  return node.iconUrl ? (
    <ResourceIconImage
      alt=""
      className={styles.liveObservationPresentationIconImage}
      fallbackClassName={styles.liveObservationPresentationIconFallback}
      fallbackSize={46}
      src={node.iconUrl}
    />
  ) : (
    <Box aria-hidden="true" size={26} strokeWidth={1.5} />
  );
}

function getRoleLabel(role: LiveObservationPresentationRole): string {
  if (role === "source") return "트래픽 진입점";
  if (role === "controller") return "용량 제어";
  return "트래픽 경유";
}

function getCapacityStateLabel(state: LiveObservationDiagramNodeState): string {
  if (state === "active") return "실행 중";
  if (state === "launching") return "시작 중";
  return "대기";
}

function getCapacityForecastKind(
  nodeId: string,
  index: number,
  projection: LiveObservationCapacityProjection | null
): "actual" | "predicted" | "scale-in" {
  if (nodeId.includes("--predicted-capacity-")) return "predicted";
  if (projection?.direction === "scale_in" && index >= projection.predictedCount) {
    return "scale-in";
  }
  return "actual";
}

function getCapacityDisplayLabel(
  nodeId: string,
  index: number,
  state: LiveObservationDiagramNodeState,
  projection: LiveObservationCapacityProjection | null
): string {
  const kind = getCapacityForecastKind(nodeId, index, projection);
  if (kind === "predicted") return "증설 예상";
  if (kind === "scale-in") return "축소 예상";
  return getCapacityStateLabel(state);
}
