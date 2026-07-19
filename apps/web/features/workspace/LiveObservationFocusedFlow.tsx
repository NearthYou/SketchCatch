"use client";

import { Box } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const previousTrafficRef = useRef(getLiveObservationTrafficCursor(snapshot));
  const burstSequenceRef = useRef(0);
  const [burst, setBurst] = useState<SequencedTrafficBurst | null>(null);
  const modelCapacityUnits = model.status === "ready"
    ? model.capacityUnits
    : EMPTY_CAPACITY_UNITS;
  const [presentedCapacityUnits, setPresentedCapacityUnits] = useState(() =>
    settleLiveObservationCapacityUnits(modelCapacityUnits)
  );

  useEffect(() => {
    setPresentedCapacityUnits((current) =>
      reconcileLiveObservationCapacityUnits(current, modelCapacityUnits)
    );
    const timer = window.setTimeout(
      () => setPresentedCapacityUnits(settleLiveObservationCapacityUnits(modelCapacityUnits)),
      LIVE_OBSERVATION_CAPACITY_EXIT_MS
    );
    return () => window.clearTimeout(timer);
  }, [modelCapacityUnits]);

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
  const minimumWidth = Math.max(
    760,
    model.stages.length * 144 +
      presentedCapacityUnits.length * 94 +
      (model.hiddenCapacityCount > 0 ? 64 : 0) +
      80
  );
  const totalCapacityCount = model.capacityUnits.length + model.hiddenCapacityCount;

  return (
    <section
      aria-label="프로젝트 다이어그램에서 분석한 메인 트래픽 경로"
      className={`${styles.liveObservationDiagramMap} ${styles.liveObservationFocusedFlow}`}
      data-flowing={burst !== null}
      data-pressure-level={model.pressureLevel}
      data-testid="live-observation-focused-flow"
    >
      <header className={styles.liveObservationPresentationHeader}>
        <strong>LIVE TRAFFIC · FOCUSED DATA FLOW</strong>
        <span>{model.stages.length} stages · {totalCapacityCount} capacity units</span>
      </header>
      <div className={styles.liveObservationPresentationViewport}>
        <div
          className={styles.liveObservationPresentationSurface}
          style={{ minWidth: `${minimumWidth}px` }}
        >
          <ol
            className={styles.liveObservationPresentationPath}
            style={{
              gridTemplateColumns: `repeat(${model.stages.length}, minmax(118px, 1fr)) minmax(190px, 1.35fr)`
            }}
          >
            {model.stages.map((stage, index) => (
              <li
                className={styles.liveObservationPresentationStage}
                data-pressure-zone={index >= Math.max(1, model.stages.length - 2)}
                data-role={stage.role}
                key={stage.node.id}
              >
                <div className={styles.liveObservationPresentationNode}>
                  <ResourceIcon node={stage.node} />
                  {burst ? (
                    <i
                      aria-hidden="true"
                      className={styles.liveObservationPresentationNodePulse}
                      key={`${burst.sequence}-${stage.node.id}`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    />
                  ) : null}
                </div>
                <strong title={stage.node.label}>{stage.node.label}</strong>
                <span>{getRoleLabel(stage.role)}</span>
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
              </li>
            ))}
            <li className={styles.liveObservationCapacityStage}>
              <span className={styles.liveObservationCapacityLabel}>ECS FARGATE TASKS</span>
              <div className={styles.liveObservationCapacityUnits}>
                {presentedCapacityUnits.map((unit, index) => (
                  <article
                    aria-label={`${unit.node.label}: ${getCapacityStateLabel(unit.observationState)}`}
                    className={styles.liveObservationCapacityUnit}
                    data-observation-state={unit.observationState}
                    data-transition={unit.transition}
                    key={unit.node.id}
                  >
                    <div className={styles.liveObservationPresentationNode}>
                      <ResourceIcon node={unit.node} />
                      {burst && unit.observationState !== "inactive" ? (
                        <i
                          aria-hidden="true"
                          className={styles.liveObservationPresentationNodePulse}
                          key={`${burst.sequence}-${unit.node.id}-arrival`}
                          style={{ animationDelay: `${model.stages.length * 100 + index * 100}ms` }}
                        />
                      ) : null}
                    </div>
                    <strong title={unit.node.label}>
                      {getCapacityDisplayLabel(unit.node.label, index)}
                    </strong>
                    <span>{getCapacityStateLabel(unit.observationState)}</span>
                  </article>
                ))}
                {model.hiddenCapacityCount > 0 ? (
                  <div
                    aria-label={`${model.hiddenCapacityCount} additional capacity units`}
                    className={styles.liveObservationCapacityOverflow}
                  >
                    +{model.hiddenCapacityCount}
                  </div>
                ) : null}
              </div>
            </li>
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
  if (role === "source") return "Traffic source";
  if (role === "controller") return "Capacity controller";
  return "Traffic hop";
}

function getCapacityStateLabel(state: LiveObservationDiagramNodeState): string {
  if (state === "active") return "RUNNING";
  if (state === "launching") return "STARTING";
  return "AVAILABLE";
}

function getCapacityDisplayLabel(label: string, index: number): string {
  const baseLabel = label
    .replace(/\s*[-·]\s*(?:RUNNING|SCALE-OUT|STARTING|IN\s*SERVICE).*$/i, "")
    .trim();
  return `${baseLabel || "Fargate Task"} ${index + 1}`;
}
