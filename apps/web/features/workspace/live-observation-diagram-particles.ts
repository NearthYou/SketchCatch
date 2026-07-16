export const LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS = 560;
export const LIVE_OBSERVATION_DIAGRAM_REQUEST_STAGGER_MS = 180;
export const LIVE_OBSERVATION_DIAGRAM_ARRIVAL_DURATION_MS = 240;

export function getLiveObservationDiagramParticleDelayMs(
  segmentIndex: number,
  requestIndex: number
): number {
  return (
    Math.max(0, Math.floor(segmentIndex)) * LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS +
    Math.max(0, Math.floor(requestIndex)) * LIVE_OBSERVATION_DIAGRAM_REQUEST_STAGGER_MS
  );
}

export function getLiveObservationDiagramBurstLifetimeMs(
  segmentCount: number,
  particleCount: number
): number {
  const safeSegmentCount = Math.max(0, Math.floor(segmentCount));
  const safeParticleCount = Math.max(0, Math.floor(particleCount));
  if (safeSegmentCount === 0 || safeParticleCount === 0) return 0;

  return (
    safeSegmentCount * LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS +
    (safeParticleCount - 1) * LIVE_OBSERVATION_DIAGRAM_REQUEST_STAGGER_MS +
    LIVE_OBSERVATION_DIAGRAM_ARRIVAL_DURATION_MS
  );
}
