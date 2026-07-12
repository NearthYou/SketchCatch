import { Box } from "lucide-react";
import { useMemo } from "react";
import type { DiagramJson, DiagramNode, LiveObservationSnapshot } from "@sketchcatch/types";
import type { LiveObservationSignalMapBurst } from "./LiveObservationSignalMap";
import {
  createLiveObservationDiagramModel,
  type LiveObservationDiagramNodeState,
  type LiveObservationPresentationRole
} from "./live-observation-diagram";
import {
  getLiveObservationDiagramParticleDelayMs,
  LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS
} from "./live-observation-diagram-particles";
import styles from "./workspace.module.css";

export function LiveObservationDiagramMap({
  burst,
  diagram,
  snapshot
}: {
  readonly burst: LiveObservationSignalMapBurst | null;
  readonly diagram: DiagramJson;
  readonly snapshot: LiveObservationSnapshot | null;
}) {
  const model = useMemo(
    () => createLiveObservationDiagramModel(diagram, snapshot),
    [diagram, snapshot]
  );

  if (model.status === "unavailable") {
    return (
      <section
        aria-label="프로젝트 다이어그램 기반 실시간 관측"
        className={styles.liveObservationDiagramMap}
      >
        <div className={styles.liveObservationPresentationEmpty} role="status">
          <Box aria-hidden="true" size={22} />
          <strong>메인 트래픽 경로를 분석할 수 없습니다.</strong>
          <span>다이어그램의 트래픽 source와 capacity 연결을 확인해주세요.</span>
        </div>
      </section>
    );
  }

  const visibleParticleCount = Math.min(4, burst?.visibleParticleCount ?? 0);
  const minimumWidth = Math.max(
    760,
    model.stages.length * 144 +
      model.capacityUnits.length * 94 +
      (model.hiddenCapacityCount > 0 ? 64 : 0) +
      80
  );
  const totalCapacityCount = model.capacityUnits.length + model.hiddenCapacityCount;

  return (
    <section
      aria-label="프로젝트 다이어그램에서 분석한 메인 트래픽 경로"
      className={styles.liveObservationDiagramMap}
      data-flowing={burst !== null}
      data-pressure-level={model.pressureLevel}
    >
      <header className={styles.liveObservationPresentationHeader}>
        <strong>PROJECT DIAGRAM · FOCUSED DATA FLOW</strong>
        <span>{model.stages.length} stages · {totalCapacityCount} capacity units</span>
      </header>
      <div className={styles.liveObservationPresentationViewport}>
        <div className={styles.liveObservationPresentationSurface} style={{ minWidth: `${minimumWidth}px` }}>
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
                  {burst ? Array.from({ length: visibleParticleCount }, (_, particleIndex) => (
                    <i
                      className={styles.liveObservationPresentationSegmentParticle}
                      key={`${burst.sequence}-${stage.node.id}-segment-${particleIndex}`}
                      style={{
                        animationDelay: `${getLiveObservationDiagramParticleDelayMs(index, particleIndex)}ms`,
                        animationDuration: `${LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS}ms`
                      }}
                    />
                  )) : null}
                </i>
              </li>
            ))}
            <li className={styles.liveObservationCapacityStage}>
              <span className={styles.liveObservationCapacityLabel}>CAPACITY</span>
              <div className={styles.liveObservationCapacityUnits}>
                {model.capacityUnits.map((unit, index) => (
                  <article
                    aria-label={`${unit.node.label}: ${getCapacityStateLabel(unit.observationState)}`}
                    className={styles.liveObservationCapacityUnit}
                    data-observation-state={unit.observationState}
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
                    <strong title={unit.node.label}>{getCapacityDisplayLabel(unit.node.label, index)}</strong>
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
    <img alt="" draggable={false} src={node.iconUrl} />
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
  return "EXPECTED";
}

function getCapacityDisplayLabel(label: string, index: number): string {
  const baseLabel = label
    .replace(/\s*[-·]\s*(?:RUNNING|SCALE-OUT|STARTING|IN\s*SERVICE).*$/i, "")
    .trim();
  return `${baseLabel || "Capacity"} ${index + 1}`;
}
