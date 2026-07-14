import type { LiveObservationPressureLevel } from "@sketchcatch/types";
import { Cpu, Database, Network, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type {
  LiveObservationInstanceMarker,
  LiveObservationRequestBurst
} from "./live-observation";
import {
  LIVE_OBSERVATION_MOBILE_SIGNAL_NODES,
  LIVE_OBSERVATION_MOBILE_SIGNAL_VIEWBOX,
  LIVE_OBSERVATION_SIGNAL_NODES,
  LIVE_OBSERVATION_SIGNAL_VIEWBOX,
  getLiveObservationMobileStaticRailPaths,
  getLiveObservationStaticRailPaths,
  type LiveObservationSignalNodeRect,
  type LiveObservationStaticRail
} from "./live-observation-signal-geometry";
import {
  LIVE_OBSERVATION_SIGNAL_PULSE_DURATION_MS,
  LIVE_OBSERVATION_SIGNAL_STAGGER_MS,
  getLiveObservationSignalMapLabel,
  getLiveObservationReducedRouteSelections,
  getLiveObservationSignalArrivalFeedback,
  getLiveObservationSignalMapSlots,
  getLiveObservationSignalPulseIndexes,
  getLiveObservationSignalRouteSelections,
  type LiveObservationSignalArrivalFeedback,
  type LiveObservationSignalRouteSelection,
  type LiveObservationSignalRouteVariant
} from "./live-observation-signal-map";
import styles from "./workspace.module.css";

const SIGNAL_VIEWBOX_WIDTH = 1600;
const SIGNAL_VIEWBOX_HEIGHT = 640;
const MOBILE_SIGNAL_VIEWBOX_WIDTH = 100;
const MOBILE_SIGNAL_VIEWBOX_HEIGHT = 180;

type SignalNodeKind = "audience" | "s3" | "alb" | "asg" | "ec2";

export type LiveObservationSignalMapBurst = LiveObservationRequestBurst & {
  readonly sequence: number;
};

export type LiveObservationSignalMapProps = {
  readonly asgMeta: string;
  readonly burst: LiveObservationSignalMapBurst | null;
  readonly instances: readonly LiveObservationInstanceMarker[];
  readonly pressureLevel: LiveObservationPressureLevel;
  readonly requestTargetIndexes: readonly number[];
};

export function LiveObservationSignalMap({
  asgMeta,
  burst,
  instances,
  pressureLevel,
  requestTargetIndexes
}: LiveObservationSignalMapProps) {
  const activeVariant: LiveObservationSignalRouteVariant = useSafeMediaQuery(
    "(max-width: 759px)"
  ) ? "mobile" : "desktop";
  const prefersReducedMotion = useSafeMediaQuery(
    "(prefers-reduced-motion: reduce)"
  );
  const instanceSlots = getLiveObservationSignalMapSlots(instances);
  const activeStaticRails = activeVariant === "desktop"
    ? getLiveObservationStaticRailPaths(instanceSlots.length)
    : getLiveObservationMobileStaticRailPaths(instanceSlots.length);
  const pulseTargetIndexes = getLiveObservationSignalPulseIndexes(
    requestTargetIndexes,
    instanceSlots
  );
  const routeSelections = getLiveObservationSignalRouteSelections({
    instanceSlotCount: instanceSlots.length,
    requestTargetIndexes: pulseTargetIndexes,
    variant: activeVariant,
    visibleParticleCount: burst?.visibleParticleCount ?? 0
  });
  const arrivalFeedback = getLiveObservationSignalArrivalFeedback({
    rails: activeStaticRails,
    routeSelections
  });
  const reducedRouteSelections = getLiveObservationReducedRouteSelections(routeSelections);
  const reducedTargetIndexes = new Set(
    reducedRouteSelections.map((selection) => selection.targetIndex)
  );

  return (
    <section
      aria-label={getLiveObservationSignalMapLabel(burst?.overflowCount)}
      className={styles.liveObservationSignalMap}
      data-pressure-level={pressureLevel}
    >
      <SignalStaticRailLayer rails={activeStaticRails} variant={activeVariant} />

      <SignalServiceNode
        icon={Users}
        kind="audience"
        label="Audience"
        meta="브라우저 요청 진입"
        mobileRect={LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.audience}
        rect={LIVE_OBSERVATION_SIGNAL_NODES.audience}
      />
      <SignalServiceNode
        icon={Database}
        kind="s3"
        label="S3 Page"
        meta="Audience UI"
        mobileRect={LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.s3}
        rect={LIVE_OBSERVATION_SIGNAL_NODES.s3}
      />
      <SignalServiceNode
        icon={Network}
        kind="alb"
        label="ALB"
        meta="Request gateway"
        mobileRect={LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.alb}
        rect={LIVE_OBSERVATION_SIGNAL_NODES.alb}
      />
      <SignalServiceNode
        icon={Cpu}
        kind="asg"
        label="ASG"
        meta={asgMeta}
        mobileRect={LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.asg}
        rect={LIVE_OBSERVATION_SIGNAL_NODES.asg}
      />

      {instanceSlots.map((instance, index) => (
        <SignalServiceNode
          icon={Cpu}
          instanceState={instance.state}
          key={instance.key}
          kind="ec2"
          label="EC2"
          meta={instance.label}
          mobileRect={getMobileEc2NodeRect(instanceSlots.length, index)}
          rect={getEc2NodeRect(instanceSlots.length, index)}
        >
          {burst && prefersReducedMotion && reducedTargetIndexes.has(index) ? (
            <i
              aria-hidden="true"
              className={styles.liveObservationRequestFlash}
              key={`request-flash-${burst.sequence}`}
            />
          ) : null}
          {burst && !prefersReducedMotion
            ? arrivalFeedback
                .filter((feedback) => feedback.targetIndex === index)
                .map((feedback, feedbackIndex) => (
                  <i
                    aria-hidden="true"
                    className={styles.liveObservationRequestFlash}
                    key={`request-flash-${burst.sequence}-${feedbackIndex}`}
                    style={getArrivalFeedbackStyle(feedback)}
                  />
                ))
            : null}
        </SignalServiceNode>
      ))}

      <SignalPulseLayer
        burst={burst}
        arrivalFeedback={arrivalFeedback}
        reducedMotion={prefersReducedMotion}
        reducedRouteSelections={reducedRouteSelections}
        routeSelections={routeSelections}
        variant={activeVariant}
      />
    </section>
  );
}

function SignalStaticRailLayer({
  rails,
  variant
}: {
  readonly rails: readonly LiveObservationStaticRail[];
  readonly variant: LiveObservationSignalRouteVariant;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`${styles.liveObservationSignalRouteLayer} ${styles.liveObservationSignalRailLayer}`}
      preserveAspectRatio="none"
      style={getSignalLayerStyle(1)}
      viewBox={variant === "desktop"
        ? LIVE_OBSERVATION_SIGNAL_VIEWBOX
        : LIVE_OBSERVATION_MOBILE_SIGNAL_VIEWBOX}
    >
      {rails.map((rail, index) => (
        <path
          d={rail.d}
          data-rail-kind={rail.kind}
          data-rail-lane={rail.lane}
          data-rail-node={rail.nodeId}
          data-target-index={rail.targetIndex}
          key={getStaticRailKey(rail, index)}
        />
      ))}
    </svg>
  );
}

function SignalPulseLayer({
  arrivalFeedback,
  burst,
  reducedMotion,
  reducedRouteSelections,
  routeSelections,
  variant
}: {
  readonly arrivalFeedback: readonly LiveObservationSignalArrivalFeedback[];
  readonly burst: LiveObservationSignalMapBurst | null;
  readonly reducedMotion: boolean;
  readonly reducedRouteSelections: readonly LiveObservationSignalRouteSelection[];
  readonly routeSelections: readonly LiveObservationSignalRouteSelection[];
  readonly variant: LiveObservationSignalRouteVariant;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`${styles.liveObservationSignalRouteLayer} ${styles.liveObservationSignalPulseLayer}`}
      key={`signal-pulse-${burst?.sequence ?? 0}-${variant}`}
      preserveAspectRatio="none"
      style={getSignalLayerStyle(3)}
      viewBox={variant === "desktop"
        ? LIVE_OBSERVATION_SIGNAL_VIEWBOX
        : LIVE_OBSERVATION_MOBILE_SIGNAL_VIEWBOX}
    >
      {reducedMotion
        ? reducedRouteSelections.map((selection, index) => (
            <path
              className={styles.liveObservationSignalSelectedRoute}
              d={selection.path}
              data-signal-lane={selection.lane}
              data-target-index={selection.targetIndex}
              key={`selected-${burst?.sequence ?? 0}-${index}`}
            />
          ))
        : null}
      {!reducedMotion
        ? arrivalFeedback.map((feedback, index) => (
            <path
              className={styles.liveObservationSignalArrivalFeedback}
              d={feedback.path}
              data-signal-lane={feedback.lane}
              data-target-index={feedback.targetIndex}
              key={`arrival-${burst?.sequence ?? 0}-${index}`}
              style={getArrivalFeedbackStyle(feedback)}
            />
          ))
        : null}
      {!reducedMotion
        ? routeSelections.map((selection, index) => (
                <circle
                  className={styles.liveObservationSignalPulse}
                  cx="0"
                  cy="0"
                  data-signal-lane={selection.lane}
                  data-target-index={selection.targetIndex}
                  key={`${burst?.sequence ?? 0}-${index}`}
                  r={variant === "desktop" ? 5 : 1.2}
                >
                  <animateMotion
                    begin={`${selection.requestIndex * LIVE_OBSERVATION_SIGNAL_STAGGER_MS}ms`}
                    dur={`${LIVE_OBSERVATION_SIGNAL_PULSE_DURATION_MS}ms`}
                    fill="freeze"
                    path={selection.path}
                  />
                  <animate
                    attributeName="opacity"
                    begin={`${selection.requestIndex * LIVE_OBSERVATION_SIGNAL_STAGGER_MS}ms`}
                    dur={`${LIVE_OBSERVATION_SIGNAL_PULSE_DURATION_MS}ms`}
                    fill="freeze"
                    keyTimes="0;0.12;0.78;1"
                    values="0;1;1;0"
                  />
                </circle>
              ))
        : null}
      {burst?.overflowCount ? (
        <text
          className={styles.liveObservationSignalOverflow}
          data-signal-variant={variant}
          textAnchor="end"
          x={variant === "desktop" ? 1540 : 96}
          y={variant === "desktop" ? 44 : 8}
        >
          +{burst.overflowCount}
        </text>
      ) : null}
    </svg>
  );
}

function SignalServiceNode({
  children,
  icon: Icon,
  instanceState,
  kind,
  label,
  meta,
  mobileRect,
  rect
}: {
  readonly children?: ReactNode;
  readonly icon: LucideIcon;
  readonly instanceState?: LiveObservationInstanceMarker["state"];
  readonly kind: SignalNodeKind;
  readonly label: string;
  readonly meta: string;
  readonly mobileRect: LiveObservationSignalNodeRect;
  readonly rect: LiveObservationSignalNodeRect;
}) {
  const className = instanceState
    ? `${styles.liveObservationSignalNode} ${styles.liveObservationSignalInstance}`
    : styles.liveObservationSignalNode;

  return (
    <article
      aria-label={`${label}: ${meta}`}
      className={className}
      data-instance-state={instanceState}
      data-node-kind={kind}
      style={getSignalNodeStyle(rect, mobileRect)}
    >
      <Icon aria-hidden="true" size={24} strokeWidth={1.8} />
      <strong>{label}</strong>
      <span>{meta}</span>
      {children}
    </article>
  );
}

function getSignalNodeStyle(
  rect: LiveObservationSignalNodeRect,
  mobileRect: LiveObservationSignalNodeRect
): CSSProperties {
  return {
    "--live-mobile-node-height": `${(mobileRect.height / MOBILE_SIGNAL_VIEWBOX_HEIGHT) * 100}%`,
    "--live-mobile-node-left": `${(mobileRect.x / MOBILE_SIGNAL_VIEWBOX_WIDTH) * 100}%`,
    "--live-mobile-node-radius": `${mobileRect.radius}px`,
    "--live-mobile-node-top": `${(mobileRect.y / MOBILE_SIGNAL_VIEWBOX_HEIGHT) * 100}%`,
    "--live-mobile-node-width": `${(mobileRect.width / MOBILE_SIGNAL_VIEWBOX_WIDTH) * 100}%`,
    borderRadius: `${rect.radius}px`,
    height: `${(rect.height / SIGNAL_VIEWBOX_HEIGHT) * 100}%`,
    left: `${(rect.x / SIGNAL_VIEWBOX_WIDTH) * 100}%`,
    position: "absolute",
    top: `${(rect.y / SIGNAL_VIEWBOX_HEIGHT) * 100}%`,
    width: `${(rect.width / SIGNAL_VIEWBOX_WIDTH) * 100}%`,
    zIndex: 2
  } as CSSProperties;
}

function getSignalLayerStyle(zIndex: number): CSSProperties {
  return {
    height: "100%",
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
    width: "100%",
    zIndex
  };
}

function getArrivalFeedbackStyle(
  feedback: LiveObservationSignalArrivalFeedback
): CSSProperties {
  return {
    animationDelay: `${feedback.delayMs}ms`,
    animationDuration: `${feedback.durationMs}ms`
  };
}

function getEc2NodeRect(
  instanceSlotCount: number,
  targetIndex: number
): LiveObservationSignalNodeRect {
  if (instanceSlotCount === 1) {
    return LIVE_OBSERVATION_SIGNAL_NODES.ec2Single;
  }

  return targetIndex === 0
    ? LIVE_OBSERVATION_SIGNAL_NODES.ec2Upper
    : LIVE_OBSERVATION_SIGNAL_NODES.ec2Lower;
}

function getMobileEc2NodeRect(
  instanceSlotCount: number,
  targetIndex: number
): LiveObservationSignalNodeRect {
  if (instanceSlotCount === 1) {
    return LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.ec2Single;
  }

  return targetIndex === 0
    ? LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.ec2Left
    : LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.ec2Right;
}

function getStaticRailKey(rail: LiveObservationStaticRail, index: number): string {
  return `${rail.kind}-${rail.nodeId}-${rail.lane}-${rail.targetIndex ?? "shared"}-${index}`;
}

function useSafeMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMatch);
      return () => mediaQuery.removeEventListener("change", updateMatch);
    }

    mediaQuery.addListener(updateMatch);
    return () => mediaQuery.removeListener(updateMatch);
  }, [query]);

  return matches;
}
