import {
  getLiveObservationRequestBurst,
  getLiveObservationRequestTargetIndexes,
  type LiveObservationRequestBurst
} from "./live-observation";

export type MockRequestFlowBurst = LiveObservationRequestBurst & {
  readonly sequence: number;
};

export type MockRequestFlowState = {
  readonly burst: MockRequestFlowBurst | null;
  readonly sequence: number;
  readonly visible: boolean;
};

export function createInitialMockRequestFlowState(): MockRequestFlowState {
  return {
    burst: null,
    sequence: 0,
    visible: false
  };
}

export function replayMockRequestFlow(
  state: MockRequestFlowState
): MockRequestFlowState {
  const burst = getLiveObservationRequestBurst(100, 108, true);
  if (!burst) {
    return state;
  }

  const sequence = state.sequence + 1;
  return {
    burst: {
      ...burst,
      sequence
    },
    sequence,
    visible: true
  };
}

export function getMockRequestFlowTargetIndexes(
  burst: MockRequestFlowBurst | null
): number[] {
  return burst
    ? getLiveObservationRequestTargetIndexes(
        burst.visibleParticleCount,
        2,
        burst.sequence
      )
    : [];
}

export function clearMockRequestFlowBurst(
  state: MockRequestFlowState,
  scheduledSequence: number
): MockRequestFlowState {
  if (state.burst?.sequence !== scheduledSequence) {
    return state;
  }

  return {
    ...state,
    burst: null
  };
}
